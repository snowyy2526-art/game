import * as THREE from 'three';
import { createWorld } from './world.js';
import { createEntities } from './entities.js';
import { createAudio } from './audio.js';
import { createState, advanceTime, craft, eat, nextPhase, DAY_DURATION, NIGHT_DURATION } from './survival.js';

function initializeGame() {
const $ = id => document.getElementById(id);
// Rasterize film grain once: a live SVG turbulence filter can overwhelm software
// compositors even when the 3D scene itself is inexpensive.
const grainCanvas = document.createElement('canvas');
grainCanvas.width = grainCanvas.height = 128;
const grainContext = grainCanvas.getContext('2d');
const grainPixels = grainContext.createImageData(128,128);
for(let i=0;i<grainPixels.data.length;i+=4) {
  const value=Math.floor(Math.random()*256);
  grainPixels.data.set([value,value,value,255],i);
}
grainContext.putImageData(grainPixels,0,0);
document.querySelector('.grain').style.backgroundImage=`url(${grainCanvas.toDataURL()})`;
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
const gl = renderer.getContext();
const debugRenderer = gl.getExtension('WEBGL_debug_renderer_info');
const softwareRenderer = debugRenderer && /swiftshader|llvmpipe|software/i.test(gl.getParameter(debugRenderer.UNMASKED_RENDERER_WEBGL));
renderer.setPixelRatio(softwareRenderer ? 0.6 : Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = !softwareRenderer;
renderer.shadowMap.autoUpdate = false;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
$('scene').appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x172525);
scene.fog = new THREE.FogExp2(0x172525, 0.021);
const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 180);
camera.rotation.order = 'YXZ';
const hemi = new THREE.HemisphereLight(0xb5cbc0, 0x26281d, 1.3);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xd0d6b6, 2.0);
sun.position.set(-20, 40, 12);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 100 });
sun.shadow.bias = -0.0008;
scene.add(sun, sun.target);
const moon = new THREE.Mesh(new THREE.SphereGeometry(2.6, 24, 16), new THREE.MeshBasicMaterial({ color: 0xd8e1ce, fog: false }));
moon.position.set(-34, 43, -65);
scene.add(moon);
const torch = new THREE.SpotLight(0xe9e1bd, 0, 28, 0.55, 0.65, 1.4);
scene.add(torch, torch.target);
const world = createWorld(THREE, scene, { lowQuality: !!softwareRenderer });
const entities = createEntities(THREE, scene);
const audio = createAudio();
let state = createState();
let mode = 'intro', overlay = null, started = false, yaw = 0, pitch = 0, muted = false;
let captureUnavailable = false, dragging = false, pointerX = 0, pointerY = 0, hadPointerLock = false;
let toastUntil = 0, actionCooldown = 0, darknessWarned = false, hungerWarned = false;
let footBob = 0, viewInspection = null, currentTarget = null, activeSpearAnimation = 0;
const player = new THREE.Vector3(0, 1.7, 8);
const direction = new THREE.Vector3();
const keys = new Set();
const handSpear = new THREE.Group();
const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, 1.8, 7), new THREE.MeshStandardMaterial({color:0x7d6240}));
shaft.rotation.x = Math.PI / 2;
const tip = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.3, 4), new THREE.MeshStandardMaterial({color:0x929687,metalness:0.7,roughness:0.5}));
tip.rotation.x = -Math.PI / 2; tip.position.z = -1;
handSpear.add(shaft, tip); handSpear.position.set(0.4,-0.48,-0.5); handSpear.rotation.x = -0.16;
camera.add(handSpear); scene.add(camera);

function toast(message, duration = 4) {
  $('toast').textContent = message;
  $('toast').classList.add('visible');
  toastUntil = performance.now() + duration * 1000;
}
function insideCabin() { return Math.abs(player.x) < 4.65 && Math.abs(player.z) < 3.85; }
function nearestEntrance(maxDistance = 3.5) {
  return world.entrances.filter(e => Math.hypot(player.x-e.position.x, player.z-e.position.z) < maxDistance)
    .sort((a,b) => player.distanceTo(a.position)-player.distanceTo(b.position))[0];
}
function context() {
  camera.getWorldDirection(direction);
  return { player, cameraDirection: direction, phase: state.phase, day: state.day, phaseTime: state.phaseTime,
    noise: state.noise, inside: insideCabin(), fire: state.fire, entrances: world.entrances,
    bracing: keys.has('KeyB') && insideCabin() ? nearestEntrance(2.8)?.id ?? null : null,
    kill, toast, sound: (name,pos) => audio.play(name,pos), damage: n => {state.health=Math.max(0,state.health-n);}, time:state.time };
}
function setTheme(phase, intro = false) {
  const night = phase === 'night';
  scene.background.set(night ? 0x080e17 : intro ? 0x172525 : 0x36483e);
  scene.fog.color.copy(scene.background);
  scene.fog.density = night ? 0.032 : intro ? 0.021 : 0.019;
  hemi.intensity = night ? 0.48 : intro ? 1.0 : 1.8;
  sun.intensity = night ? 0.55 : intro ? 1.4 : 2.6;
  sun.color.set(night ? 0x7e9bbf : 0xd9d7ad);
  renderer.toneMappingExposure = night ? 1.25 : 1.12;
  moon.visible = night || intro;
  world.setPhase(phase,state.day);
  renderer.shadowMap.needsUpdate = true;
}
function closeOverlay(resume = true) {
  if (overlay) $(overlay).hidden = true;
  overlay = null;
  keys.clear();
  dragging = false;
  if (resume && started && mode !== 'ended') {
    mode = 'playing';
    requestLock();
  }
}
function requestLock() {
  if (captureUnavailable) return;
  try {
    if (!renderer.domElement.requestPointerLock) return useDragControls();
    const p = renderer.domElement.requestPointerLock();
    p?.catch?.(useDragControls);
  } catch { useDragControls(); }
}
function useDragControls() {
  if (captureUnavailable) return;
  captureUnavailable = true;
  renderer.domElement.classList.add('drag-controls');
  toast('Mouse livre: segure o botão direito e arraste para olhar. Setas também funcionam. Clique esquerdo ou espaço para atacar.',9);
}
function openOverlay(id) {
  if (mode === 'ended') return;
  if (overlay) $(overlay).hidden = true;
  mode = started ? 'paused' : 'intro';
  overlay = id;
  $(id).hidden = false;
  keys.clear();
  dragging = false;
  document.exitPointerLock?.();
  if(id === 'craft-panel') updateCraftTarget();
}
function startGame() {
  closeOverlay(false);
  state = createState();
  player.set(0,1.7,8); yaw=0; pitch=0;
  darknessWarned=false; hungerWarned=false;
  for (const e of world.entrances) { e.health=100; e.maxHealth=100; }
  world.resetResources(1);
  entities.reset();
  entities.setPhase('day',1);
  setTheme('day');
  mode='playing'; started=true;
  $('intro').hidden=true; $('hud').hidden=false; $('crosshair').hidden=false; $('end-panel').hidden=true;
  audio.start();
  toast('DIA 1 · Explore com cuidado. A cabana fica no centro da floresta.',7);
  requestLock();
  updateHUD();
}
function endGame(won, reason) {
  mode='ended'; state.dead=!won; state.won=won;
  keys.clear(); document.exitPointerLock?.();
  $('end-panel').hidden=false; $('crosshair').hidden=true;
  $('end-eyebrow').textContent=won ? 'O SEXTO AMANHECER' : `DIA ${state.day} · ${state.phase==='night'?'NOITE':'DIA'}`;
  $('end-title').textContent=won?'Você ainda está aqui.':'A floresta ficou com você.';
  $('end-description').textContent=won?'Cinco dias. Cinco noites. Você manteve a luz acesa e resistiu até o último amanhecer. Por enquanto, o caminho está livre.':reason;
  audio.play(won?'dawn':'danger');
}
function kill(reason) { if(mode==='playing') endGame(false, reason); }
function changePhase() {
  const next=nextPhase(state);
  if(next==='win') { endGame(true); return; }
  setTheme(next); entities.setPhase(next,state.day);
  darknessWarned=false;
  if(next==='night') {
    audio.play('night');
    if(!insideCabin()) toast('A NOITE CHEGOU · Volte imediatamente para a cabana. Há algo entre as árvores.',8);
    else toast('A noite chegou. Mantenha o fogo aceso. Escute as entradas.',7);
  } else {
    world.resetResources(state.day);
    audio.play('dawn');
    toast(`DIA ${state.day} · Você sobreviveu. A floresta tem novos suprimentos.`,7);
  }
}
function blocked(x,z) {
  const r=0.28;
  if(Math.hypot(x,z)>68) return true;
  // The door is the only passage. At night it is closed from the inside;
  // a late returning player can enter once, but cannot walk back outside.
  if(Math.abs(x)<5.05 && Math.abs(z)<4.25) {
    if(Math.abs(x)>4.45 && Math.abs(z)<4.18) return true;
    if(z < -3.65 && Math.abs(x)<4.95) return true;
    if(z>3.65 && z<4.28 && Math.abs(x)<4.95) {
      if(Math.abs(x)>.72 || (state.phase==='night' && insideCabin() && z>player.z)) return true;
    }
  }
  return world.obstacles.some(o=>Math.hypot(x-o.x,z-o.z)<o.radius+r);
}
function move(dt) {
  let x=0,z=0;
  if(keys.has('KeyW'))z--;
  if(keys.has('KeyS'))z++;
  if(keys.has('KeyA'))x--;
  if(keys.has('KeyD'))x++;
  const moving=!!(x||z), crouching=keys.has('KeyC');
  const sprinting=keys.has('ShiftLeft') && state.stamina>3 && !crouching;
  const speed=(crouching?1.65:sprinting?6.1:3.4)*(keys.has('KeyB')?.3:1);
  if(moving) {
    const len=Math.hypot(x,z); x/=len;z/=len;
    const dx=(x*Math.cos(yaw)+z*Math.sin(yaw))*speed*dt;
    const dz=(-x*Math.sin(yaw)+z*Math.cos(yaw))*speed*dt;
    if(!blocked(player.x+dx,player.z))player.x+=dx;
    if(!blocked(player.x,player.z+dz))player.z+=dz;
    footBob+=dt*(sprinting?12:8);
  }
  if(keys.has('ArrowLeft'))yaw+=dt*1.5;
  if(keys.has('ArrowRight'))yaw-=dt*1.5;
  if(keys.has('ArrowUp'))pitch=Math.min(1.3,pitch+dt);
  if(keys.has('ArrowDown'))pitch=Math.max(-1.3,pitch-dt);
  player.y=THREE.MathUtils.lerp(player.y,crouching?1.05:1.7,Math.min(1,dt*12));
  camera.position.copy(player);
  if(moving)camera.position.y+=Math.sin(footBob)*0.035;
  camera.rotation.set(pitch,yaw,0);
  advanceTime(state,dt,{moving,sprinting});
  if(crouching)state.noise=Math.min(state.noise,.04);
  return {moving,sprinting};
}
function findTarget() {
  camera.getWorldDirection(direction);
  let best=null;
  for(const r of world.resources) {
    if(!r.available || state.phase!=='day')continue;
    const delta=r.position.clone().add(new THREE.Vector3(0,.65,0)).sub(player);
    const distance=delta.length();
    if(distance<3.2 && delta.normalize().dot(direction)>.62 && (!best||distance<best.distance))best={type:'resource',resource:r,distance};
  }
  const e=nearestEntrance(3.0);
  if(!best && e)best={type:'entrance',entrance:e};
  if(!best && player.distanceTo(new THREE.Vector3(-3,1,-2.5))<3)best={type:'fire'};
  return best;
}
function interact() {
  if(mode!=='playing' || actionCooldown>0)return;
  const t=findTarget();
  if(t?.type==='resource') {
    const r=t.resource; r.available=false; r.mesh.visible=false;
    const amount=r.kind==='wood'?3:r.kind==='scrap'?2:1;
    state.inventory[r.kind]+=amount; state.noise=1; actionCooldown=.4;
    audio.play('collect'); toast(`+${amount} ${ {wood:'madeira',scrap:'sucata',food:'comida'}[r.kind]} · O barulho se espalhou entre as árvores.`,3);
  } else if(t?.type==='fire')doCraft('fuel');
  else if(t?.type==='entrance')openOverlay('craft-panel');
}
function doCraft(recipe) {
  if(!started || mode==='ended')return;
  if(recipe==='fuel' && !insideCabin()) {toast('Abasteça a lareira de dentro da cabana.');return;}
  const result=craft(state,recipe,nearestEntrance(3.5));
  toast(result.message,5);
  if(result.ok){ audio.play(recipe==='fuel'?'fire':'craft');state.noise=Math.max(state.noise,.5); }
  updateCraftTarget();updateHUD();
}
function updateCraftTarget() {
  const e=nearestEntrance(3.5);
  $('craft-target').textContent=(e?`${e.label} · ${Math.ceil(e.health)} / ${e.maxHealth} de resistência.`:'Aproxime-se de uma entrada para reforçar ou reparar.')+` Mochila: ${state.inventory.wood} madeira · ${state.inventory.scrap} sucata · ${state.inventory.food} comida. Lareira: ${Math.ceil(state.fire)}%.`;
}
function attack() {
  if(mode!=='playing'||actionCooldown>0)return;
  if(!state.spears.length){toast('Você precisa criar uma lança. Pressione Tab para abrir a mochila.');return;}
  camera.getWorldDirection(direction);
  const hit=entities.hit(player,direction);
  state.spears[0]--; activeSpearAnimation=.28; actionCooldown=.8; state.noise=.8;
  audio.play(hit?'hit':'spear');
  if(state.spears[0]<=0){state.spears.shift();audio.play('break');toast('Sua lança quebrou. Crie outra com madeira e sucata.');}
  else if(hit)toast('Acertou. A criatura perdeu vigor.',2);
}
function updateHUD() {
  const duration=state.phase==='day'?DAY_DURATION:NIGHT_DURATION;
  const left=Math.max(0,Math.ceil(duration-state.phaseTime));
  $('day-label').textContent=`DIA ${String(state.day).padStart(2,'0')} / 05`;
  $('phase-label').textContent=state.phase==='day'?'EXPLORAÇÃO':'SOBREVIVÊNCIA';
  $('clock-label').textContent=`${String(Math.floor(left/60)).padStart(2,'0')}:${String(left%60).padStart(2,'0')} ${state.phase==='day'?'ATÉ ANOITECER':'ATÉ AMANHECER'}`;
  $('objective').textContent=state.phase==='day'?'Colete suprimentos. Reforce a cabana antes de escurecer.':!insideCabin()?'VOLTE PARA A CABANA. A floresta não é mais sua.':`Mantenha as entradas intactas. Lareira: ${Math.ceil(state.fire)}%`;
  $('health-fill').style.width=`${state.health}%`;
  $('hunger-fill').style.width=`${state.hunger}%`;
  $('stamina-fill').style.width=`${state.stamina}%`;
  for(const key of ['wood','scrap','food'])$(`${key}-count`).textContent=state.inventory[key];
  $('spear-count').textContent=state.spears.length?`${state.spears.length} (${state.spears[0]}/5)`:'0';
  $('sleep-button').disabled=state.phase!=='day'||!insideCabin();
  $('fire-button').disabled=!insideCabin();
  handSpear.visible=mode==='playing'&&state.spears.length>0;
  currentTarget=findTarget();
  const e=currentTarget?.entrance;
  let prompt=currentTarget?.type==='resource'?`[E] Coletar ${currentTarget.resource.label}`:e?`[E] ${e.label} · ${Math.ceil(e.health)}/${e.maxHealth}  [R] Reparar${state.phase==='night'?'  [B] Segurar':''}`:currentTarget?.type==='fire'?`[E] Alimentar lareira · 3 madeira · ${Math.ceil(state.fire)}%`:'[TAB] Mochila e construção   [F] Comer   [H] Guia';
  viewInspection=entities.inspect(player,direction);
  if(viewInspection && viewInspection.distance<18)prompt=`${viewInspection.name} · ${viewInspection.description}`;
  $('interaction').textContent=prompt;
}

$('start-button').addEventListener('click',startGame);
$('guide-button').addEventListener('click',()=>openOverlay('guide-panel'));
$('guide-close').addEventListener('click',()=>closeOverlay(started));
$('journal-button').addEventListener('click',()=>openOverlay('guide-panel'));
$('pause-button').addEventListener('click',()=>openOverlay('pause-panel'));
$('resume-button').addEventListener('click',()=>closeOverlay());
$('restart-button').addEventListener('click',startGame);
$('end-restart').addEventListener('click',startGame);
$('craft-close').addEventListener('click',()=>closeOverlay());
document.querySelectorAll('[data-craft]').forEach(b=>b.addEventListener('click',()=>doCraft(b.dataset.craft)));
$('eat-button').addEventListener('click',()=>{ if(eat(state)){audio.play('eat');toast('Você comeu. Fome recuperada.');}else toast('Sem comida ou você já está saciado.');updateHUD(); });
$('fire-button').addEventListener('click',()=>doCraft('fuel'));
$('sleep-button').addEventListener('click',()=>{
  if(state.phase==='day'&&insideCabin()) {
    closeOverlay();changePhase();
  } else toast('Você só pode esperar pela noite de dentro da cabana.');
});
renderer.domElement.addEventListener('click',()=>{if(mode==='playing' && document.pointerLockElement!==renderer.domElement)requestLock();});
document.addEventListener('mousemove',e=>{
  if(mode!=='playing')return;
  if(document.pointerLockElement===renderer.domElement){yaw-=e.movementX*.0021;pitch=Math.max(-1.35,Math.min(1.35,pitch-e.movementY*.0021));}
  else if(dragging){yaw-=(e.clientX-pointerX)*.003;pitch=Math.max(-1.35,Math.min(1.35,pitch-(e.clientY-pointerY)*.003));}
  pointerX=e.clientX;pointerY=e.clientY;
});
document.addEventListener('pointerlockchange',()=>{
  const locked=document.pointerLockElement===renderer.domElement;
  if(hadPointerLock && !locked && started && mode==='playing')openOverlay('pause-panel');
  hadPointerLock=locked;
});
document.addEventListener('pointerlockerror',useDragControls);
renderer.domElement.addEventListener('contextmenu',e=>e.preventDefault());
renderer.domElement.addEventListener('mousedown',e=>{
  if(mode!=='playing')return;
  if(e.button===0)attack();
  if(e.button===2&&!document.pointerLockElement){dragging=true;pointerX=e.clientX;pointerY=e.clientY;e.preventDefault();}
});
document.addEventListener('mouseup',e=>{if(e.button===2)dragging=false;});
document.addEventListener('keydown',e=>{
  if(['Tab','Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
  if(e.code==='Escape') {if(overlay)closeOverlay(started);else if(started&&mode==='playing')openOverlay('pause-panel');return;}
  if(e.repeat)return;
  if(e.code==='KeyH'){if(overlay==='guide-panel')closeOverlay(started);else openOverlay('guide-panel');return;}
  if(e.code==='Tab'&&started&&mode!=='ended'){if(overlay==='craft-panel')closeOverlay();else openOverlay('craft-panel');return;}
  if(mode!=='playing')return;
  keys.add(e.code);
  if(e.code==='KeyE')interact();
  if(e.code==='KeyR')doCraft('repair');
  if(e.code==='KeyF'){if(eat(state)){audio.play('eat');toast('Você se alimentou. +38 nutrição.');}else toast('Sem comida ou você já está saciado.');}
  if(e.code==='Space')attack();
  if(e.code==='KeyM'){muted=!muted;audio.setMuted(muted);toast(muted?'Áudio silenciado. Pressione M para ativar.':'Áudio ativado. Escute a floresta.');}
});
document.addEventListener('keyup',e=>keys.delete(e.code));
window.addEventListener('blur',()=>{keys.clear();dragging=false;if(mode==='playing')openOverlay('pause-panel');});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&mode==='playing')openOverlay('pause-panel');});
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});

const clock=new THREE.Clock();
let renderTime=0,hudTimer=0,shadowTimer=0;
setTheme('day',true); entities.reset();
$('loading').hidden=true;
function frame() {
  requestAnimationFrame(frame);
  const dt=Math.min(clock.getDelta(),.05);renderTime+=dt;
  if(mode==='intro') {
    const a=Math.sin(renderTime*.035)*.07;
    camera.position.set(15*Math.cos(a)+18*Math.sin(a),4.5,18*Math.cos(a)-15*Math.sin(a));
    camera.lookAt(-5,2,0);handSpear.visible=false;
    world.update(dt,{time:renderTime,phase:'day',fire:45,player:camera.position});
  }
  if(mode==='playing') {
    const movement=move(dt);
    actionCooldown=Math.max(0,actionCooldown-dt);
    if(activeSpearAnimation>0)activeSpearAnimation-=dt;
    handSpear.position.z=-.5-Math.max(0,Math.sin(activeSpearAnimation/.28*Math.PI))*.65;
    const ctx=context();
    entities.update(dt,ctx);
    for(const entrance of world.entrances)world.setEntranceHealth(entrance.id,entrance.health/entrance.maxHealth);
    world.update(dt,{time:state.time,phase:state.phase,fire:state.fire,player});
    audio.update({phase:state.phase,inside:ctx.inside,fire:state.fire,...movement,time:state.time});
    torch.intensity=state.phase==='night'&&!ctx.inside?9:0;torch.position.copy(player);torch.target.position.copy(player).add(direction);
    if(state.fire<12&&!darknessWarned){toast('A lareira está morrendo. Use 3 madeiras para afastar o Pesadelo.',6);darknessWarned=true;}
    if(state.hunger<25&&!hungerWarned){toast('Seu corpo precisa de comida. Pressione F para consumir um suprimento.',6);hungerWarned=true;}
    if(state.hunger>30)hungerWarned=false;
    if(state.health<=0)kill('Seu corpo não resistiu. Coma para recuperar forças e mantenha as criaturas longe.');
    if(mode==='playing' && state.phaseTime>=(state.phase==='day'?DAY_DURATION:NIGHT_DURATION))changePhase();
    hudTimer+=dt;if(hudTimer>.1){updateHUD();hudTimer=0;}
    shadowTimer+=dt;if(shadowTimer>.25){renderer.shadowMap.needsUpdate=true;shadowTimer=0;}
  }
  if(performance.now()>toastUntil)$('toast').classList.remove('visible');
  renderer.render(scene,camera);
}
frame();

// Read-only observability for diagnostics and browser smoke tests.
window.__game = {
  get controls(){return {captureUnavailable,locked:document.pointerLockElement===renderer.domElement,yaw,pitch};},
  get rendering(){return {softwareRenderer:!!softwareRenderer,pixelRatio:renderer.getPixelRatio(),calls:renderer.info.render.calls,triangles:renderer.info.render.triangles};},
  get state(){return structuredClone(state);},
  get mode(){return mode;},
  get position(){return {x:player.x,y:player.y,z:player.z};},
  get entities(){return entities.list.map(e=>({id:e.id,name:e.name,active:e.active}));},
  get entrances(){return world.entrances.map(e=>({id:e.id,health:e.health,maxHealth:e.maxHealth}));},
  get resources(){return world.resources.map(r=>({id:r.id,kind:r.kind,available:r.available,position:{x:r.position.x,z:r.position.z}}));},
};
}

try {
  initializeGame();
} catch (error) {
  console.error('Não foi possível iniciar o jogo:',error);
  document.getElementById('loading').hidden=true;
  document.getElementById('intro').hidden=true;
  const panel=document.createElement('section');
  panel.className='panel-backdrop';
  panel.id='startup-error';
  panel.setAttribute('role','alert');
  panel.innerHTML='<div class="panel compact-panel"><div class="eyebrow">ENTRE AS ÁRVORES</div><h2>Não foi possível<br /><em>abrir a floresta.</em></h2><p class="panel-description" id="startup-error-message"></p><button class="button button-primary" id="retry-startup">Tentar novamente →</button></div>';
  document.body.appendChild(panel);
  document.getElementById('startup-error-message').textContent=/webgl|context/i.test(error.message)
    ? 'O navegador não disponibilizou gráficos 3D (WebGL2). Tente abrir o jogo diretamente no Chrome, Edge ou Firefox e ative a aceleração de hardware nas configurações do navegador.'
    : 'O jogo encontrou um problema ao iniciar. Recarregue a página ou abra o arquivo do jogo diretamente no navegador, fora da prévia.';
  document.getElementById('retry-startup').addEventListener('click',()=>location.reload());
}
