import { createWandererModel } from './models/wanderer.js';
import { createFloraModel } from './models/flora.js';
import { WANDERER_AUDIO_TIMING } from './audio/wanderer-timing.js';

// A full sprint lasts a little longer than one charge. The warning is time to
// get clear, and exhaustion is a real escape window rather than an idle pose.
export const WANDERER_RULES = Object.freeze({
  sightDistance: 17, chaseSpeed: 6.5, chaseDuration: 3.8,
  recoveryDuration: 20, patrolGrace: 3, catchDistance: 1.05,
});

/** Procedural creatures and their readable, distinct survival rules. */
export function createEntities(THREE, scene) {
  const v = () => new THREE.Vector3();
  const direction = v();
  const target = v();
  const axis = new THREE.Vector3(0, 1, 0);
  const list = [];
  let currentPhase = 'day';
  let currentDay = 1;
  let elapsed = 0;
  let darkTime = 0;
  let warnedDark = false;
  let lastCtx = null;
  let nextLaugh = 28;

  const material = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 1, ...extra });
  const skin = material(0x383c33);
  const black = material(0x0b1110);
  const cloth = material(0x565749);
  const red = material(0x461b18);
  const eyeMat = material(0xc8b486, { emissive: 0xa58e4c, emissiveIntensity: 1.3 });
  const ghostMat = material(0x17231e, { transparent: true, opacity: 0.82 });
  const grinMat = material(0xd2d6b5, { emissive: 0xa0b080, emissiveIntensity: 0.75 });

  function mesh(geometry, mat, parent, x = 0, y = 0, z = 0) {
    const m = new THREE.Mesh(geometry, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  }

  function limb(parent, mat, from, to, radius = 0.065) {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const m = mesh(new THREE.CylinderGeometry(radius * 0.7, radius, a.distanceTo(b), 5), mat, parent);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(axis, b.sub(a).normalize());
    return m;
  }

  function eyes(parent, y, spacing = 0.095, mat = eyeMat, z = 0.13) {
    [-1, 1].forEach(side => mesh(new THREE.SphereGeometry(0.027, 6, 5), mat, parent, spacing * side, y, z));
  }

  function humanoid(kind) {
    const group = new THREE.Group();
    const mat = kind === 'human' ? cloth : kind === 'intruder' ? black : skin;
    const arms = [];
    const legs = [];
    const tall = kind === 'wanderer' ? 1.12 : 1;
    const torso = mesh(new THREE.ConeGeometry(0.25, 0.85, 6), mat, group, 0, 1.15 * tall, 0);
    torso.rotation.z = kind === 'wanderer' ? -0.16 : 0.04;
    mesh(new THREE.SphereGeometry(0.18, 7, 6), mat, group, 0.07, 1.82 * tall, 0.04);
    eyes(group, 1.85 * tall, kind === 'human' ? 0.09 : 0.12);
    for (const side of [-1, 1]) {
      const arm = new THREE.Group();
      arm.position.set(side * 0.22, 1.48 * tall, 0);
      limb(arm, mat, [0, 0, 0], [side * 0.14, -0.65 - (side === 1 ? 0.12 : 0), 0.03]);
      limb(arm, mat, [side * 0.14, -0.65, 0.03], [side * 0.15, -1.05, 0.14], 0.04);
      for (let finger = 0; finger < 3; finger++) {
        limb(arm, mat, [side * 0.15, -1.03, 0.12 + finger * 0.025], [side * (0.13 + finger * 0.035), -1.2, 0.13 + finger * 0.025], 0.013);
      }
      group.add(arm);
      arms.push(arm);
      const leg = new THREE.Group();
      leg.position.set(side * 0.11, 0.88 * tall, 0);
      limb(leg, mat, [0, 0, 0], [side * 0.05, -0.41, -0.08], 0.073);
      limb(leg, mat, [side * 0.05, -0.41, -0.08], [side * 0.025, -0.84, 0.02], 0.052);
      const foot = mesh(new THREE.BoxGeometry(0.12, 0.08, 0.25), mat, leg, side * 0.02, -0.84, 0.08);
      if (kind === 'human' && side === -1) foot.rotation.y = Math.PI;
      group.add(leg);
      legs.push(leg);
    }
    return { group, arms, legs };
  }

  function add(id, name, model, x, z) {
    model.group.position.set(x, 0, z);
    model.group.visible = false;
    scene.add(model.group);
    const e = { id, name, ...model, active: false, baseX: x, baseZ: z, timer: 0, cueTimer: 0, moving: false };
    list.push(e);
    return e;
  }

  const wanderer = add('wanderer', 'O Andarilho', createWandererModel(THREE), 25, -25);
  wanderer.patrol = v();
  wanderer.lastSeen = v();
  wanderer.aware = false;
  wanderer.mode = 'patrol';
  wanderer.alertClipIndex = 0;
  wanderer.alertDuration = 3.52;
  wanderer.grace = 0;

  const flora = add('flora', 'Flora Tímida', createFloraModel(THREE), -23, -19);
  flora.aware = false;
  flora.attracted = false;
  flora.identified = false;
  flora.studyTime = 0;
  flora.creakTimer = 0;
  flora.noiseTarget = v();

  const impostorModel = humanoid('human');
  const impostor = add('impostor', 'O Impostor', impostorModel, 20, 18);
  impostor.human = new THREE.Group();
  while (impostor.group.children.length) impostor.human.add(impostor.group.children[0]);
  impostor.group.add(impostor.human);
  impostor.object = new THREE.Group();
  mesh(new THREE.BoxGeometry(0.7, 0.65, 0.6), material(0x716247), impostor.object, 0, 0.33, 0);
  for (const x of [-0.23, 0.23]) mesh(new THREE.BoxGeometry(0.055, 0.7, 0.65), material(0x353c32), impostor.object, x, 0.35, 0);
  // A crate with teeth beneath its lid is the persistent tell in object disguise.
  for (let i = 0; i < 7; i++) mesh(new THREE.ConeGeometry(0.025, 0.075, 3), grinMat, impostor.object, -0.23 + i * 0.075, 0.58, 0.307);
  impostor.group.add(impostor.object);
  impostor.monster = humanoid('wanderer').group;
  impostor.monster.scale.set(1.15, 1.2, 1.15);
  impostor.monster.children.forEach(child => { if (child.isMesh && child.material === skin) child.material = red; });
  impostor.group.add(impostor.monster);
  // Its entity disguise copies the current Andarilho, including his silhouette
  // and clothes. Walking backwards remains the deliberate tell.
  impostor.entityDisguise = createWandererModel(THREE);
  impostor.group.add(impostor.entityDisguise.group);
  impostor.disguise = 'human';
  impostor.revealed = false;

  const invader = add('invader', 'O Invasor', humanoid('intruder'), 12, 0);
  invader.vigor = 100;
  invader.mode = 'waiting';
  invader.entrance = null;

  const laughGroup = new THREE.Group();
  mesh(new THREE.ConeGeometry(0.31, 1.4, 7), ghostMat, laughGroup, 0, 0.95, 0);
  mesh(new THREE.SphereGeometry(0.19, 9, 7), black, laughGroup, 0, 1.75, 0);
  eyes(laughGroup, 1.79, 0.075, grinMat, 0.16);
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.018, 5, 12, Math.PI), grinMat);
  smile.rotation.z = Math.PI;
  smile.position.set(0, 1.71, 0.155);
  laughGroup.add(smile);
  const laugh = add('laugh', 'O Risonho', { group: laughGroup }, 0, 0);
  laugh.gaze = 0;

  const nightmareModel = humanoid('intruder');
  nightmareModel.group.scale.set(1.35, 1.35, 1.35);
  const nightmare = add('nightmare', 'Pesadelo', nightmareModel, 0, -2);

  function show(e, active) {
    e.active = active;
    e.group.visible = active;
  }

  function face(e, position) {
    const dx = position.x - e.group.position.x;
    const dz = position.z - e.group.position.z;
    if (Math.abs(dx) + Math.abs(dz) > 0.01) e.group.rotation.y = Math.atan2(dx, dz);
  }

  function observed(e, ctx, threshold = 0.75) {
    // A 4.5m entity can fill the view even when her face is above the reticle.
    // Test the lower trunk, torso and crown rather than a single old eye point.
    const heights = e.id === 'flora' ? [1.35, 2.65, 3.85, 4.4] : [1.7];
    return heights.some(height => {
      target.copy(e.group.position); target.y += height;
      direction.copy(target).sub(ctx.player);
      const d = direction.length();
      return d < 60 && direction.normalize().dot(ctx.cameraDirection) > threshold &&
        (!ctx.isPointVisible || ctx.isPointVisible(target)) &&
        (!ctx.isSightBlocked || !ctx.isSightBlocked(ctx.player,target));
    });
  }

  function distance(e, p) {
    return Math.hypot(e.group.position.x - p.x, e.group.position.z - p.z);
  }

  function move(e, destination, speed, dt, avoidCabin = true) {
    direction.copy(destination).sub(e.group.position);
    direction.y = 0;
    if (direction.lengthSq() < 0.04) return false;
    direction.normalize();
    const nx = e.group.position.x + direction.x * speed * dt;
    const nz = e.group.position.z + direction.z * speed * dt;
    // Short local steering keeps the denser trunks solid for day creatures.
    // Night approaches already use explicit waypoints around the cabin.
    const blocked = (x,z) => avoidCabin && ((Math.abs(x)<5.5 && Math.abs(z)<4.7) ||
      (lastCtx?.isMovementBlocked && lastCtx.isMovementBlocked(x,z,e===flora?.34:.23)));
    let nextX=nx,nextZ=nz;
    if(blocked(nextX,nextZ)) {
      let found=false;
      for(const angle of [.55,-.55,1.1,-1.1,1.58,-1.58]) {
        const dx=direction.x*Math.cos(angle)-direction.z*Math.sin(angle);
        const dz=direction.x*Math.sin(angle)+direction.z*Math.cos(angle);
        const x=e.group.position.x+dx*speed*dt,z=e.group.position.z+dz*speed*dt;
        if(!blocked(x,z)){nextX=x;nextZ=z;found=true;break;}
      }
      if(!found)return false;
    }
    e.group.position.x=nextX;e.group.position.z=nextZ;
    face(e, destination);
    return true;
  }

  function animate(e, time, speed = 1) {
    if (e.animate) { e.animate(time, e.moving, e.id === 'wanderer' ? e.mode : undefined); return; }
    if (!e.legs) return;
    e.legs.forEach((leg, i) => { leg.rotation.x = e.moving ? Math.sin(time * speed + i * Math.PI) * 0.24 : 0; });
    e.arms.forEach((arm, i) => { arm.rotation.x = e.moving ? Math.sin(time * speed + i * Math.PI + 0.6) * 0.19 : 0; });
  }

  function cue(e, dt, ctx, name, period, maxDistance = 28) {
    e.cueTimer -= dt;
    if (e.cueTimer <= 0 && distance(e, ctx.player) < maxDistance) {
      ctx.sound(name, e.group.position);
      e.cueTimer = period;
    }
  }

  function setPhase(phase, day = 1) {
    currentPhase = phase;
    currentDay = day;
    elapsed = 0;
    darkTime = 0;
    warnedDark = false;
    nextLaugh = 28;
    for (const e of list) {
      show(e, false);
      e.timer = 0;
      e.cueTimer = 0;
      e.moving = false;
      e.resetPose?.();
      e.group.position.set(e.baseX, 0, e.baseZ);
    }
    wanderer.mode = phase === 'day' ? 'patrol' : 'inactive';
    wanderer.aware = false;
    wanderer.grace = 0;
    wanderer.alertClipIndex = 0;
    wanderer.alertDuration = WANDERER_AUDIO_TIMING.alert[0] + 0.4;
    wanderer.lastSeen.set(wanderer.baseX, 0, wanderer.baseZ);
    if (phase === 'day') {
      wanderer.aware = false;
      wanderer.patrol.set(-25, 0, 22);
      flora.aware = false;
      flora.attracted = false;
      flora.identified = false;
      flora.studyTime = 0;
      flora.creakTimer = 0;
      flora.setCamouflaged(true);
      impostor.revealed = false;
      impostor.pleaded = false;
      impostor.observedTime = 0;
      impostor.discovered = false;
      impostor.disguise = ['human', 'object', 'entity'][(day - 1) % 3];
      impostor.human.visible = impostor.disguise === 'human';
      impostor.object.visible = impostor.disguise === 'object';
      impostor.monster.visible = false;
      impostor.entityDisguise.group.visible = impostor.disguise === 'entity';
      impostor.entityDisguise.resetPose();
      // An entity disguise walks backwards, unlike the real Andarilho.
      impostor.group.scale.set(1, 1, 1);
      show(wanderer, true);
      show(flora, true);
      show(impostor, true);
    } else {
      invader.mode = 'waiting';
      invader.timer = 9;
      invader.vigor = 100;
      invader.entrance = null;
      invader.approach = [];
      show(invader, true);
      laugh.gaze = 0;
    }
  }

  function wandererMode(mode) {
    wanderer.mode = mode;
    wanderer.timer = 0;
    wanderer.moving = false;
    wanderer.aware = mode === 'alert' || mode === 'chase';
  }

  function exhaustWanderer(ctx) {
    if (wanderer.mode === 'exhausted') return;
    wandererMode('exhausted');
    ctx?.toast?.('O Andarilho perdeu o fôlego. Afaste-se enquanto ele se recupera.');
  }

  function updateWanderer(dt, ctx) {
    if (wanderer.mode === 'capture') return true;
    const wd = distance(wanderer, ctx.player);
    target.copy(wanderer.group.position); target.y += 1.8;
    const seesPlayer = !ctx.inside && wd < WANDERER_RULES.sightDistance &&
      (!ctx.isSightBlocked || !ctx.isSightBlocked(target, ctx.player));
    wanderer.grace = Math.max(0, wanderer.grace - dt);
    wanderer.timer += dt;
    const effort = 0.52 + Math.max(0, Math.sin(elapsed * 2.5)) * 0.55;

    if (ctx.inside && (wanderer.mode === 'alert' || wanderer.mode === 'chase')) exhaustWanderer(ctx);

    if (wanderer.mode === 'exhausted') {
      wanderer.moving = false;
      if (wanderer.timer >= WANDERER_RULES.recoveryDuration) {
        wandererMode('patrol');
        wanderer.grace = WANDERER_RULES.patrolGrace;
        // Do not make his first patrol step point straight at the survivor.
        wanderer.patrol.copy(wanderer.group.position).add(new THREE.Vector3(8, 0, -7));
      }
    } else if (wanderer.mode === 'alert') {
      if (seesPlayer) wanderer.lastSeen.copy(ctx.player).setY(0);
      face(wanderer, wanderer.lastSeen);
      wanderer.moving = false;
      if (wanderer.timer >= wanderer.alertDuration) wandererMode('chase');
    } else if (wanderer.mode === 'chase') {
      if (seesPlayer) wanderer.lastSeen.copy(ctx.player).setY(0);
      if (wanderer.timer >= WANDERER_RULES.chaseDuration) {
        exhaustWanderer(ctx);
      } else {
        wanderer.moving = move(wanderer, wanderer.lastSeen, WANDERER_RULES.chaseSpeed, dt);
        const close = distance(wanderer, ctx.player) < WANDERER_RULES.catchDistance;
        if (close && seesPlayer) {
          wandererMode('capture');
          face(wanderer, ctx.player);
          if (ctx.captureWanderer) ctx.captureWanderer(wanderer);
          else ctx.kill('O Andarilho alcançou você. Corra durante a investida e afaste-se enquanto ele recupera o fôlego.');
          return true;
        }
      }
    } else if (seesPlayer && wanderer.grace <= 0) {
      wandererMode('alert');
      wanderer.lastSeen.copy(ctx.player).setY(0);
      wanderer.alertClipIndex = Math.floor(Math.random() * WANDERER_AUDIO_TIMING.alert.length);
      wanderer.alertDuration = WANDERER_AUDIO_TIMING.alert[wanderer.alertClipIndex] + 0.4;
      face(wanderer, ctx.player);
      ctx.toast?.('O Andarilho viu você. Afaste-se e guarde o fôlego para a corrida.');
    } else {
      // Sound draws his patrol toward a remembered location; it cannot reveal
      // a player through a trunk or the cabin wall and start a blind charge.
      if (!ctx.inside && ctx.noise > 0.4 && wd < 30 && wanderer.grace <= 0) wanderer.patrol.copy(ctx.player).setY(0);
      if (distance(wanderer, wanderer.patrol) < 2) wanderer.patrol.set(Math.sin(elapsed * 0.1) * 34, 0, Math.cos(elapsed * 0.08) * 32);
      wanderer.moving = move(wanderer, wanderer.patrol, 0.43 * effort, dt);
    }
    animate(wanderer, elapsed, 2.5);
    return false;
  }

  function updateDay(dt, ctx) {
    // Capture owns the camera and model until its cinematic is complete.
    if (updateWanderer(dt, ctx)) return;

    const fd = distance(flora, ctx.player);
    if (ctx.noise > 0.25 && fd < 32) {
      flora.attracted = true;
      flora.noiseTarget.copy(ctx.player);
    }
    // Quiet travelers do not wake it. Noise draws it close enough to see you.
    const floraEyes = flora.group.position.clone();
    floraEyes.y += flora.metadata.sightHeight ?? 3.2;
    if (flora.attracted && fd < 14 && !ctx.inside &&
        (!ctx.isSightBlocked || !ctx.isSightBlocked(floraEyes,ctx.player))) flora.aware = true;
    const frozen = observed(flora, ctx, 0.67);
    flora.moving = (flora.aware || flora.attracted) && !frozen && !ctx.inside;
    flora.setCamouflaged(frozen || !flora.moving);
    if (flora.moving) {
      const destination = flora.aware ? ctx.player : flora.noiseTarget;
      move(flora, destination, 1.45 + currentDay * 0.16, dt);
      if (!flora.aware && distance(flora, flora.noiseTarget) < 1) flora.attracted = false;
      cue(flora, dt, ctx, 'rustle', 1.4, 35);
      flora.creakTimer-=dt;
      if(flora.creakTimer<=0 && fd<32){ctx.sound('wood-creak',flora.group.position);flora.creakTimer=1.6;}
    }
    flora.animate(elapsed,flora.moving,frozen || !flora.moving);
    if (!flora.identified) {
      flora.studyTime = fd < 9 && observed(flora,ctx,.985) ? flora.studyTime + dt : 0;
      if (flora.studyTime >= 2.4) flora.identified = true;
    }
    if (!ctx.inside && fd < 1.25 && flora.moving) ctx.kill('A Flora Tímida se aproximou quando você desviou o olhar. Observe-a enquanto recua e evite fazer barulho.');

    const id = distance(impostor, ctx.player);
    if (!impostor.revealed && !impostor.discovered) {
      impostor.observedTime = observed(impostor, ctx, 0.985) ? impostor.observedTime + dt : 0;
      if (impostor.observedTime >= 2) impostor.discovered = true;
    }
    if (!impostor.revealed && id < 2.35 && !ctx.inside) {
      impostor.revealed = true;
      impostor.timer = 0;
      impostor.human.visible = false;
      impostor.object.visible = false;
      impostor.entityDisguise.group.visible = false;
      impostor.monster.visible = true;
      ctx.sound('reveal', impostor.group.position);
      ctx.toast('Isso nunca foi humano.');
    }
    if (impostor.revealed) {
      impostor.timer += dt;
      impostor.moving = move(impostor, ctx.player, 2.3, dt);
      // Reveal has a short readable beat before the lethal lunge.
      if (impostor.timer > 0.75 && id < 1.65 && !ctx.inside) ctx.kill('Você se aproximou do Impostor. Observe os detalhes: pés invertidos, dentes na caixa, movimentos que não combinam.');
    } else if (impostor.disguise === 'human') {
      impostor.moving = id < 21 && id > 3 ? move(impostor, ctx.player, 0.42, dt) : false;
      face(impostor, ctx.player);
      if (id < 22 && !impostor.pleaded) {
        ctx.toast('“Por favor… me ajude.” Uma voz vem das árvores.');
        impostor.pleaded = true;
      }
      cue(impostor, dt, ctx, 'help', 12, 22);
    } else if (impostor.disguise === 'entity' && id < 24) {
      impostor.moving = move(impostor, ctx.player, 0.53, dt);
      impostor.group.rotation.y += Math.PI;
    } else {
      impostor.moving = false;
    }
    animate(impostor, elapsed, 2);
    if (impostor.entityDisguise.group.visible) impostor.entityDisguise.animate(elapsed, impostor.moving);
  }

  function chooseEntrance(ctx) {
    const available = ctx.entrances.filter(e => e.position);
    if (!available.length) return null;
    return available.reduce((best, entrance) => (entrance.health / entrance.maxHealth < best.health / best.maxHealth ? entrance : best), available[Math.floor(Math.random() * available.length)]);
  }

  function planApproach(entrance) {
    const p = invader.group.position;
    const side = p.x < 0 ? -1 : 1;
    const end = entrance.position;
    const points = [new THREE.Vector3(side * 6.3, 0, p.z)];
    if (Math.abs(end.x) > Math.abs(end.z)) {
      const destinationSide = end.x < 0 ? -1 : 1;
      if (side !== destinationSide) {
        points.push(new THREE.Vector3(side * 6.3, 0, 5.7));
        points.push(new THREE.Vector3(destinationSide * 6.3, 0, 5.7));
      }
      points.push(new THREE.Vector3(destinationSide * 6.3, 0, end.z));
      points.push(new THREE.Vector3(destinationSide * 6, 0, end.z));
    } else {
      const front = end.z < 0 ? -1 : 1;
      points.push(new THREE.Vector3(side * 6.3, 0, front * 5.7));
      points.push(new THREE.Vector3(end.x, 0, front * 5.7));
      points.push(new THREE.Vector3(end.x, 0, front * 5.2));
    }
    return points;
  }

  function spawnLaugh(ctx) {
    let best = null;
    let bestScore = -Infinity;
    for (let i = 0; i < 18; i++) {
      const p = new THREE.Vector3((Math.random() - 0.5) * 7.2, 0, (Math.random() - 0.5) * 5.6);
      direction.copy(p).sub(ctx.player);
      direction.y = 0;
      const d = direction.length();
      if (d < 1.3) continue;
      const score = -direction.normalize().dot(ctx.cameraDirection) + Math.min(d, 3) * 0.06;
      if (score > bestScore) { best = p; bestScore = score; }
    }
    if (!best) return;
    laugh.group.position.copy(best);
    laugh.gaze = 0;
    laugh.timer = 0;
    show(laugh, true);
    face(laugh, ctx.player);
    ctx.sound('laugh', best);
    ctx.toast('Uma risada atrás de você. Não procure o rosto.');
  }

  function updateNight(dt, ctx) {
    if (!ctx.inside) {
      // Outside after dark is a deliberate fatal risk, with time to return.
      invader.outsideTime = (invader.outsideTime || 0) + dt;
      if (invader.outsideTime > 15) ctx.kill('A noite pertence à floresta. Volte para dentro da cabana antes do anoitecer.');
    } else invader.outsideTime = 0;

    if (invader.mode === 'waiting') {
      invader.timer -= dt;
      if (invader.timer <= 0) {
        invader.entrance = chooseEntrance(ctx);
        invader.mode = 'approaching';
        if (invader.entrance) {
          invader.approach = planApproach(invader.entrance);
          ctx.toast(`Passos se aproximam: ${invader.entrance.label.toLowerCase()}.`);
        }
      }
    } else if (invader.mode === 'approaching' && invader.entrance) {
      const waypoint = invader.approach[0];
      if (waypoint) {
        invader.moving = move(invader, waypoint, 1.7, dt, false);
        if (distance(invader, waypoint) < 0.25) invader.approach.shift();
      }
      if (invader.approach.length === 0) {
        invader.mode = 'attacking';
        invader.timer = 0;
        ctx.sound('knock', invader.group.position);
      }
    } else if (invader.mode === 'attacking' && invader.entrance) {
      const entrance = invader.entrance;
      invader.moving = false;
      invader.vigor -= dt * 7.8;
      const resisted = ctx.bracing === entrance.id ? 0.38 : 1;
      entrance.health = Math.max(0, entrance.health - dt * (5.1 + currentDay * 0.85) * resisted);
      invader.timer -= dt;
      if (invader.timer <= 0) {
        ctx.sound('knock', invader.group.position);
        invader.timer = 1.7;
      }
      invader.group.rotation.z = Math.sin(elapsed * 6) * 0.045;
      if (entrance.health <= 0) {
        invader.mode = 'breached';
        invader.timer = 0;
        ctx.toast('Uma entrada cedeu. O Invasor está entrando!');
        ctx.sound('reveal', invader.group.position);
      } else if (invader.vigor <= 0) {
        invader.mode = 'retreating';
        ctx.toast('O Invasor está exausto. Repare suas defesas.');
      }
    } else if (invader.mode === 'retreating') {
      const p = invader.group.position;
      target.set(p.x === 0 ? 14 : Math.sign(p.x) * 15, 0, p.z === 0 ? 13 : Math.sign(p.z) * 13);
      invader.moving = move(invader, target, 2.3, dt, false);
      if (distance(invader, target) < 1) {
        invader.mode = 'waiting';
        invader.timer = 18;
        invader.vigor = 100;
      }
    } else if (invader.mode === 'breached') {
      invader.timer += dt;
      const entry = invader.entrance;
      // A quick emergency repair can still shut it out before it crosses.
      if (entry && entry.health > 12 && invader.timer < 1.5) {
        invader.mode = 'attacking';
      } else {
        invader.moving = move(invader, ctx.player, 1.65, dt, false);
        if (distance(invader, ctx.player) < 1.25) ctx.kill('O Invasor rompeu uma entrada. Reforce, repare e use a lança para esgotar seu vigor.');
      }
    }
    animate(invader, elapsed, 4.2);

    if (ctx.fire <= 0) {
      darkTime += dt;
      if (darkTime > 2.5 && !warnedDark) {
        warnedDark = true;
        ctx.toast('O fogo se apagou. Há algo se formando no escuro.');
        ctx.sound('breath', ctx.player);
      }
      if (darkTime > 7 && ctx.inside) {
        if (!nightmare.active) {
          nightmare.group.position.set(-ctx.player.x * 0.5, 0, -ctx.player.z * 0.5);
          show(nightmare, true);
          ctx.sound('reveal', nightmare.group.position);
        }
        face(nightmare, ctx.player);
      }
      if (darkTime > 11 && ctx.inside) ctx.kill('O Pesadelo nasceu no breu. Guarde lenha e mantenha a lareira acesa até o amanhecer.');
    } else {
      darkTime = 0;
      warnedDark = false;
      show(nightmare, false);
    }

    if (elapsed >= nextLaugh && !laugh.active && ctx.inside) {
      spawnLaugh(ctx);
      nextLaugh = elapsed + 48;
    }
    if (laugh.active) {
      laugh.timer += dt;
      face(laugh, ctx.player);
      laugh.group.position.y = Math.sin(elapsed * 2) * 0.04;
      if (observed(laugh, ctx, 0.97)) laugh.gaze += dt;
      else laugh.gaze = 0;
      if (laugh.gaze > 0.6 && laugh.gaze - dt <= 0.6) ctx.sound('warning', laugh.group.position);
      if (laugh.gaze >= 1.5) ctx.kill('Você olhou para o Risonho por tempo demais. Ao ouvir a risada, desvie o rosto e espere passar.');
      if (laugh.timer >= 14) {
        show(laugh, false);
        ctx.toast('A risada se foi. Por enquanto.');
      }
    }
  }

  function update(dt, ctx) {
    if (ctx.phase !== currentPhase || ctx.day !== currentDay) setPhase(ctx.phase, ctx.day);
    lastCtx = ctx;
    elapsed += dt;
    if (ctx.phase === 'day') updateDay(dt, ctx);
    else updateNight(dt, ctx);
  }

  function hit(origin, cameraDirection) {
    let nearest = null;
    let nearestD = 4.3;
    for (const e of list) {
      if (!e.active || e.id === 'laugh' || e.id === 'nightmare') continue;
      target.copy(e.group.position);
      target.y += 1.25;
      direction.copy(target).sub(origin);
      const d = direction.length();
      if (d < nearestD && direction.normalize().dot(cameraDirection) > 0.77) {
        nearest = e;
        nearestD = d;
      }
    }
    if (!nearest) return false;
    if (nearest === invader) {
      invader.vigor -= 43;
      if (invader.vigor <= 0 && invader.mode !== 'breached') {
        invader.mode = 'retreating';
        lastCtx?.toast('A lança esgotou o Invasor. Ele está recuando.');
      }
    } else if (nearest === wanderer) {
      direction.copy(nearest.group.position).sub(origin).setY(0).normalize();
      // Preserve the knockback while respecting the now much denser trunks.
      const destination = nearest.group.position.clone().addScaledVector(direction, 3);
      for (let i = 0; i < 12; i++) move(nearest, destination, 3, 1 / 12);
      if (wanderer.mode !== 'capture') exhaustWanderer(lastCtx);
      lastCtx?.toast('O golpe fez o Andarilho recuar. Aproveite para fugir.');
    } else if (nearest === impostor && !nearest.revealed) {
      nearest.revealed = true;
      nearest.timer = 0;
      nearest.human.visible = false;
      nearest.object.visible = false;
      nearest.entityDisguise.group.visible = false;
      nearest.monster.visible = true;
      direction.copy(nearest.group.position).sub(origin).setY(0).normalize();
      nearest.group.position.addScaledVector(direction, 3);
      lastCtx?.sound('reveal', nearest.group.position);
    }
    lastCtx?.sound('hit', nearest.group.position);
    return true;
  }

  function inspect(origin, cameraDirection) {
    let nearest = null;
    let nearestD = 28;
    const descriptions = {
      wanderer: wanderer.mode === 'exhausted' ? 'Sem fôlego. Aproveite para se afastar.' : wanderer.mode === 'alert' ? 'Ele está se preparando. Corra quando a investida começar.' : wanderer.mode === 'chase' ? 'CORRA. Ele não consegue manter esse ritmo por muito tempo.' : 'Uma voz baixa entre as árvores. Guarde fôlego para a investida.',
      flora: 'Os galhos se aquietam quando você olha. Não vire as costas.',
      impostor: impostor.revealed ? 'A máscara caiu. Fuja.' : impostor.disguise === 'object' ? 'Essa caixa... tem dentes sob a tampa.' : impostor.disguise === 'human' ? 'Um dos pés está virado para trás. Não se aproxime.' : 'Ele se move de costas. Algo está errado.',
      invader: `O Invasor · vigor ${Math.max(0, Math.ceil(invader.vigor))}%`,
      laugh: 'DESVIE O OLHAR.',
      nightmare: 'Reacenda o fogo. Agora.',
    };
    for (const e of list) {
      if (!e.active) continue;
      target.copy(e.group.position);
      if (e === flora && !flora.identified) continue;
      target.y += e.id === 'flora' ? 2.65 : 1.5;
      direction.copy(target).sub(origin);
      const d = direction.length();
      if (d < nearestD && direction.normalize().dot(cameraDirection) > 0.985 &&
          (!lastCtx?.isSightBlocked || !lastCtx.isSightBlocked(origin,target))) {
        nearestD = d;
        nearest = e;
      }
    }
    if (!nearest) return null;
    if (nearest === impostor && !impostor.discovered && !impostor.revealed) {
      return {
        id: nearest.id,
        name: { human: 'Pessoa ferida', object: 'Caixa abandonada', entity: 'Uma criatura' }[impostor.disguise],
        description: 'Observe por alguns segundos antes de se aproximar.',
        distance: nearestD,
      };
    }
    return { id: nearest.id, name: nearest.name, description: descriptions[nearest.id], distance: nearestD };
  }

  function reset() {
    elapsed = 0;
    darkTime = 0;
    lastCtx = null;
    invader.outsideTime = 0;
    setPhase('day', 1);
  }

  reset();
  return { update, reset, setPhase, inspect, hit, list };
}
