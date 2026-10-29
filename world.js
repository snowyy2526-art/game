import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Deterministic, entirely local scenery. No texture or model downloads are needed.
export function createWorld(THREE, scene, { lowQuality = false } = {}) {
  let seed = 72351;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const between = (a, b) => a + random() * (b - a);
  const root = new THREE.Group();
  root.name = 'forest-and-cabin';
  scene.add(root);
  const obstacles = [];
  const resources = [];
  const materials = [];
  const textures = [];
  const own = (material) => { materials.push(material); return material; };
  function texture(size, draw, repeat = 1) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const context = canvas.getContext('2d');
    draw(context, size);
    const result = new THREE.CanvasTexture(canvas);
    result.colorSpace = THREE.SRGBColorSpace;
    result.wrapS = result.wrapT = THREE.RepeatWrapping;
    result.repeat.set(repeat, repeat);
    result.anisotropy = 4;
    textures.push(result);
    return result;
  }
  const woodTexture = texture(256, (c, s) => {
    c.fillStyle = '#6d5439'; c.fillRect(0, 0, s, s);
    for (let i = 0; i < 42; i++) {
      const y = i * s / 42;
      c.fillStyle = i % 7 === 0 ? '#30281d' : `rgba(34,24,15,${between(.03, .17)})`;
      c.fillRect(0, y, s, i % 7 === 0 ? 2 : between(1, 3));
      c.strokeStyle = 'rgba(193,152,92,.15)'; c.beginPath();
      c.moveTo(0, y + 3); c.bezierCurveTo(70, y - 1, 160, y + 7, s, y + 2); c.stroke();
    }
    for (let i = 0; i < 220; i++) {
      c.fillStyle = `rgba(22,17,12,${between(.03, .12)})`;
      c.fillRect(between(0, s), between(0, s), between(10, 80), 1);
    }
  }, 1.5);
  const barkTexture = texture(128, (c, s) => {
    c.fillStyle = '#514b3d'; c.fillRect(0, 0, s, s);
    for (let i = 0; i < 180; i++) {
      c.fillStyle = i % 2 ? 'rgba(15,16,12,.35)' : 'rgba(163,153,118,.16)';
      c.fillRect(between(0, s), between(0, s), between(1, 5), between(8, 60));
    }
  }, 3);
  const groundTexture = texture(512, (c, s) => {
    c.fillStyle = '#3d4230'; c.fillRect(0, 0, s, s);
    for (let i = 0; i < 15000; i++) {
      const moss = random() > .5;
      c.fillStyle = moss ? `rgba(108,112,66,${between(.04, .4)})` : `rgba(17,25,16,${between(.05, .4)})`;
      c.fillRect(between(0, s), between(0, s), between(1, 8), between(1, 5));
    }
    c.strokeStyle = '#63563a'; c.lineWidth = .7;
    for (let i = 0; i < 1500; i++) {
      const x = between(0, s), y = between(0, s);
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + between(-6, 6), y + between(-6, 6)); c.stroke();
    }
  }, 38);
  const mat = (color, options = {}) => {
    if (lowQuality) {
      const { roughness, metalness, ...lambertOptions } = options;
      return own(new THREE.MeshLambertMaterial({ color, ...lambertOptions }));
    }
    return own(new THREE.MeshStandardMaterial({ color, roughness: 1, ...options }));
  };
  const wood = mat('#a28a67', { map: woodTexture });
  const darkWood = mat('#6b624e', { map: woodTexture });
  const bark = mat('#b7b99b', { map: barkTexture });
  const leaves = mat('#667a5b', { flatShading: true });
  const stone = mat('#666e62', { flatShading: true });
  const rusty = mat('#926b47', { metalness: .35, roughness: .8 });
  const black = mat('#171b16');
  const ground = new THREE.Mesh(new THREE.CircleGeometry(115, 96), mat('#b0b08a', { map: groundTexture }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  root.add(ground);

  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const cylinderGeometry = new THREE.CylinderGeometry(1, 1, 1, 8);
  const coneGeometry = new THREE.ConeGeometry(1, 1, 8);
  const rockGeometry = new THREE.IcosahedronGeometry(1, 0);
  function box(parent, material, x, y, z, sx, sy, sz) {
    const mesh = new THREE.Mesh(boxGeometry, material);
    mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz);
    mesh.castShadow = sx * sy * sz > .4 || sy > 1.5; mesh.receiveShadow = true;
    parent.add(mesh); return mesh;
  }
  function cylinder(parent, material, x, y, z, radius, height, rotation) {
    const mesh = new THREE.Mesh(cylinderGeometry, material);
    mesh.position.set(x, y, z); mesh.scale.set(radius, height, radius);
    if (rotation) mesh.rotation.set(...rotation);
    mesh.castShadow = true; mesh.receiveShadow = true;
    parent.add(mesh); return mesh;
  }

  // Layered, instanced trees keep the forest dense without excessive draw calls.
  const treePositions = [];
  for (let i = 0; i < 390; i++) {
    const angle = random() * Math.PI * 2;
    const radius = 10.8 + Math.sqrt(random()) * 83;
    const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
    // The narrow approach to the front door stays readable in the opening shot.
    if (z > 4 && z < 28 && Math.abs(x) < 2.8) continue;
    // Keep a wide camera-to-cabin sightline open, including the crown radius.
    // This is a real forest clearing, so the same path is navigable in play.
    const projection = Math.max(0, Math.min(1, (x * 18 + z * 22) / 808));
    const distanceToApproach = Math.hypot(x - projection * 18, z - projection * 22);
    if (radius < 36 && distanceToApproach < 9) continue;
    treePositions.push({ x, z, height: between(10, 23), radius: between(.25, .6), color: random() });
  }
  const trunks = new THREE.InstancedMesh(cylinderGeometry, bark, treePositions.length);
  const crowns = new THREE.InstancedMesh(coneGeometry, leaves, treePositions.length * 3);
  const limbs = new THREE.InstancedMesh(cylinderGeometry, bark, treePositions.length * 3);
  const dummy = new THREE.Object3D();
  treePositions.forEach((tree, i) => {
    dummy.position.set(tree.x, tree.height / 2, tree.z);
    dummy.rotation.set(0, tree.color * 6, between(-.025, .025));
    dummy.scale.set(tree.radius, tree.height, tree.radius);
    dummy.updateMatrix(); trunks.setMatrixAt(i, dummy.matrix);
    trunks.setColorAt(i, new THREE.Color().setHSL(.12, .09, .57 + tree.color * .18));
    for (let k = 0; k < 3; k++) {
      const crownHeight = tree.height * (.48 - k * .055);
      dummy.position.set(tree.x, tree.height * (.57 + k * .14), tree.z);
      dummy.rotation.set(0, tree.color * 8 + k, 0);
      dummy.scale.set(tree.height * (.21 - k * .041), crownHeight, tree.height * (.21 - k * .041));
      dummy.updateMatrix(); crowns.setMatrixAt(i * 3 + k, dummy.matrix);
      crowns.setColorAt(i * 3 + k, new THREE.Color().setHSL(.27 + tree.color * .04, .2, .39 + tree.color * .16));
      const theta = tree.color * 15 + k * 2.15;
      dummy.position.set(tree.x + Math.sin(theta) * .6, tree.height * (.31 + k * .14), tree.z + Math.cos(theta) * .6);
      dummy.rotation.set(Math.cos(theta) * .9, theta, Math.sin(theta) * .9);
      dummy.scale.set(tree.radius * .38, 2.5, tree.radius * .38);
      dummy.updateMatrix(); limbs.setMatrixAt(i * 3 + k, dummy.matrix);
    }
    if (Math.hypot(tree.x, tree.z) < 57) obstacles.push({ x: tree.x, z: tree.z, radius: tree.radius + .22 });
  });
  trunks.castShadow = crowns.castShadow = true;
  trunks.receiveShadow = true;
  root.add(trunks, crowns, limbs);

  // Ferns, fallen needles, stumps and stone clusters fill the ground plane.
  const fernMaterial = mat('#45533a', { side: THREE.DoubleSide });
  const fernGeometry = new THREE.ConeGeometry(.45, .9, 4, 1, true);
  const ferns = new THREE.InstancedMesh(fernGeometry, fernMaterial, 600);
  for (let i = 0; i < 600; i++) {
    const angle = random() * Math.PI * 2, radius = between(7, 69);
    const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
    const scale = between(.45, 1.35);
    dummy.position.set(x, scale * .22, z);
    dummy.rotation.set(between(-.25, .25), random() * 6, between(-.25, .25));
    dummy.scale.set(scale, scale * .5, scale);
    dummy.updateMatrix(); ferns.setMatrixAt(i, dummy.matrix);
  }
  root.add(ferns);
  for (let i = 0; i < 45; i++) {
    const theta = random() * Math.PI * 2, radius = between(12, 65);
    const x = Math.cos(theta) * radius, z = Math.sin(theta) * radius;
    const size = between(.3, 1.3);
    const rock = new THREE.Mesh(rockGeometry, stone);
    rock.position.set(x, size * .35, z); rock.scale.set(size, size * .65, size * .8);
    rock.rotation.y = random() * 6; rock.castShadow = true; rock.receiveShadow = true;
    root.add(rock);
    if (size > .8) obstacles.push({ x, z, radius: size * .8 });
  }

  // A dirt path built from shallow overlapping ellipses.
  const pathMat = mat('#514b37', { transparent: true, opacity: .72 });
  for (let i = 0; i < 11; i++) {
    const path = new THREE.Mesh(new THREE.CircleGeometry(1, 16), pathMat);
    path.rotation.x = -Math.PI / 2;
    path.position.set(Math.sin(i * .55) * .7, .016, 5 + i * 2.3);
    path.scale.set(1.25 + i * .045, 2.1, 1);
    root.add(path);
  }

  const cabin = new THREE.Group(); root.add(cabin);
  // Individual floor planks, supporting beams and log walls.
  for (let i = 0; i < 20; i++) box(cabin, i % 3 ? wood : darkWood, -4.56 + i * .48, -.06, 0, .46, .16, 8);
  const walls = new THREE.Group(); cabin.add(walls);
  for (let i = 0; i < 12; i++) {
    const y = .15 + i * .26;
    box(walls, i % 4 ? wood : darkWood, 0, y, -4, 9.85, .245, .34);
    // Door opening is 1.9m wide and 2.6m tall.
    if (i < 10) {
      box(walls, wood, -2.9, y, 4, 3.9, .245, .34);
      box(walls, wood, 2.9, y, 4, 3.9, .245, .34);
    } else box(walls, wood, 0, y, 4, 9.85, .245, .34);
    for (const x of [-4.8, 4.8]) {
      if (y > 1.05 && y < 2.4) {
        box(walls, wood, x, y, -2.5, .34, .245, 3.05);
        box(walls, wood, x, y, 2.5, .34, .245, 3.05);
      } else box(walls, wood, x, y, 0, .34, .245, 8);
    }
  }
  for (const x of [-4.74, 4.74]) for (const z of [-3.96, 3.96]) box(cabin, darkWood, x, 1.6, z, .4, 3.45, .4);
  for (const x of [-.99, .99]) box(cabin, darkWood, x, 1.38, 4.08, .18, 2.8, .4);
  box(cabin, darkWood, 0, 2.75, 4.08, 2.2, .21, .4);
  const doorPivot = new THREE.Group(); doorPivot.position.set(-.91, 0, 4.08); cabin.add(doorPivot);
  box(doorPivot, darkWood, .91, 1.32, 0, 1.82, 2.64, .18);
  box(doorPivot, rusty, 1.61, 1.24, .14, .08, .13, .1);
  for (const y of [.45, 2.18]) box(doorPivot, rusty, .91, y, .105, 1.82, .08, .04);

  // Pitched shingle roof, open interior rafters and triangular gables.
  const roofMaterial = mat('#3f4439', { map: woodTexture });
  for (const side of [-1, 1]) {
    const roof = box(cabin, roofMaterial, side * 2.65, 3.92, 0, 5.9, .22, 9.7);
    roof.rotation.z = -side * .34;
  }
  const triangle = new THREE.Shape();
  triangle.moveTo(-4.8, 3.15); triangle.lineTo(0, 4.86); triangle.lineTo(4.8, 3.15); triangle.closePath();
  const triangleGeometry = new THREE.ShapeGeometry(triangle);
  for (const z of [-4.02, 4.02]) {
    const gable = new THREE.Mesh(triangleGeometry, mat('#665b43', { map: woodTexture, side: THREE.DoubleSide }));
    gable.position.z = z; cabin.add(gable);
  }
  for (const z of [-3.5, 0, 3.5]) box(cabin, darkWood, 0, 2.99, z, 9.4, .15, .17);
  box(cabin, darkWood, 0, 4.7, 0, .2, .2, 9.8);

  const windowSpills = [];
  const glow = own(new THREE.MeshBasicMaterial({ color: '#d5a158', transparent: true, opacity: .12, side: THREE.DoubleSide, depthWrite: false }));
  for (const x of [-4.8, 4.8]) {
    for (const z of [-1.02, 1.02]) box(cabin, darkWood, x, 1.76, z, .4, 1.63, .13);
    for (const y of [1.03, 2.5]) box(cabin, darkWood, x, y, 0, .4, .12, 2.15);
    box(cabin, darkWood, x, 1.77, 0, .2, 1.4, .07);
    const pane = box(cabin, glow, x, 1.8, 0, .035, 1.4, 1.9);
    pane.castShadow = false;
    const spill = new THREE.PointLight('#e6a052', 9, 9, 2); spill.position.set(x * 1.04, 1.8, 0); cabin.add(spill); windowSpills.push(spill);
  }
  // Porch, hanging lantern and house number.
  box(cabin, darkWood, 0, -.04, 4.75, 3.2, .14, 1.5);
  box(cabin, darkWood, 0, -.13, 5.6, 3.5, .15, .35);
  for (const x of [-1.55, 1.55]) box(cabin, darkWood, x, 1.5, 5.2, .16, 3.0, .16);
  const porchRoof = box(cabin, roofMaterial, 0, 2.86, 4.8, 3.8, .16, 2.4);
  porchRoof.rotation.x = -.14;
  const lanternMat = own(new THREE.MeshBasicMaterial({ color: '#ffcc80' }));
  cylinder(cabin, black, 1.6, 2.25, 4.35, .1, .4);
  box(cabin, lanternMat, 1.6, 2.22, 4.35, .14, .25, .14);
  const porchLight = new THREE.PointLight('#ffb563', 18, 12, 2); porchLight.position.set(1.6, 2.2, 4.6); cabin.add(porchLight);
  const numberTexture = texture(128, (c, s) => {
    c.fillStyle = '#282d24'; c.fillRect(0, 0, s, s);
    c.strokeStyle = '#817e5f'; c.strokeRect(5, 5, s - 10, s - 10);
    c.fillStyle = '#cec9a8'; c.font = '54px Georgia'; c.textAlign = 'center'; c.fillText('05', s / 2, 83);
  });
  box(cabin, mat('#ffffff', { map: numberTexture }), -1.8, 1.9, 4.19, .43, .43, .035);

  const entrances = [
    { id: 'door', label: 'Porta', position: new THREE.Vector3(0, 0, 4), health: 100, maxHealth: 100 },
    { id: 'east', label: 'Janela leste', position: new THREE.Vector3(4.8, 0, 0), health: 100, maxHealth: 100 },
    { id: 'west', label: 'Janela oeste', position: new THREE.Vector3(-4.8, 0, 0), health: 100, maxHealth: 100 },
  ];
  const barricades = {};
  for (const entry of entrances) {
    const group = new THREE.Group();
    group.position.copy(entry.position); group.position.y = 1.6;
    if (entry.id !== 'door') group.rotation.y = Math.PI / 2;
    for (let i = 0; i < 3; i++) {
      const plank = box(group, wood, 0, (i - 1) * .43, -.17, 2.13, .15, .11);
      plank.rotation.z = i % 2 ? -.15 : .12;
      for (const x of [-.85, .85]) box(group, rusty, x, (i - 1) * .43, -.24, .035, .035, .025);
    }
    barricades[entry.id] = group; cabin.add(group);
  }

  // Fireplace: the survival clock made visible, with warm light and real geometry.
  const fireplace = new THREE.Group(); fireplace.name = 'fireplace'; fireplace.position.set(-3, 0, -2.5); cabin.add(fireplace);
  const brick = mat('#626258');
  box(fireplace, stone, 0, .07, 0, 2.05, .18, 1.4);
  box(fireplace, black, 0, .6, -.33, 1.6, 1.2, .35);
  for (const x of [-.8, .8]) for (let i = 0; i < 5; i++) box(fireplace, brick, x, .22 + i * .28, 0, .35, .25, 1.03);
  box(fireplace, stone, 0, 1.56, 0, 2.02, .25, 1.22);
  box(fireplace, brick, 0, 2.08, -.2, 1.45, .85, .82);
  cylinder(fireplace, black, 0, 3.16, -.2, .22, 1.4);
  const chimney = box(cabin, brick, -3, 4.2, -2.7, .9, 2.7, .9);
  box(cabin, stone, -3, 5.58, -2.7, 1.2, .16, 1.2);
  for (let i = 0; i < 4; i++) cylinder(fireplace, bark, between(-.38, .38), .27, between(-.05, .2), .12, .95, [Math.PI / 2, 0, between(-.7, .7)]);
  const fireGroup = new THREE.Group(); fireplace.add(fireGroup);
  const flameMaterials = [
    own(new THREE.MeshBasicMaterial({ color: '#f98937', transparent: true, opacity: .8, depthWrite: false })),
    own(new THREE.MeshBasicMaterial({ color: '#ffd382', transparent: true, opacity: .9, depthWrite: false })),
  ];
  for (let i = 0; i < 8; i++) {
    const flame = new THREE.Mesh(coneGeometry, flameMaterials[i % 2]);
    flame.position.set(between(-.4, .4), .55, between(-.15, .26));
    flame.scale.set(between(.1, .2), between(.3, .65), between(.1, .2));
    flame.userData.baseHeight = flame.scale.y;
    fireGroup.add(flame);
  }
  const fireLight = new THREE.PointLight('#ffab54', 34, 13, 2); fireLight.position.set(-3, 1.1, -2.2); cabin.add(fireLight);

  // A small lived-in interior gives the safe house a tangible scale.
  const table = new THREE.Group(); table.position.set(2, 0, -1.95); cabin.add(table);
  box(table, wood, 0, .91, 0, 2.4, .15, 1.25);
  for (const x of [-.95, .95]) for (const z of [-.45, .45]) box(table, darkWood, x, .43, z, .12, .86, .12);
  box(table, darkWood, 0, .46, 1.1, 2.3, .1, .4);
  for (const x of [-.9, .9]) box(table, darkWood, x, .22, 1.1, .12, .44, .35);
  box(table, mat('#c6b889'), -.3, 1.01, 0, .6, .014, .42).rotation.y = .4;
  cylinder(table, rusty, .8, 1.07, .2, .1, .22);
  const candle = cylinder(table, lanternMat, -.85, 1.18, -.2, .06, .25);
  const bed = new THREE.Group(); bed.position.set(2.55, 0, -3.25); cabin.add(bed);
  box(bed, darkWood, 0, .32, 0, 3.1, .3, 1.08);
  box(bed, mat('#60654b'), 0, .54, 0, 2.9, .2, 1.0);
  box(bed, mat('#9c9879'), -1.0, .68, 0, .55, .15, .8);
  for (const x of [-1.48, 1.48]) box(bed, darkWood, x, .48, 0, .1, .95, 1.2);
  const chest = box(cabin, darkWood, -3.7, .43, 1.5, 1.3, .86, .8);
  box(cabin, rusty, -3.7, .45, 1.92, .12, .15, .04);
  for (const x of [-4.08, -3.32]) box(cabin, rusty, x, .44, 1.5, .06, .9, .84);
  for (let i = 0; i < 4; i++) cylinder(cabin, bark, -3.6 + (i % 2) * .3, .14 + Math.floor(i / 2) * .25, -1.1, .13, .9, [Math.PI / 2, 0, 0]);

  // Outside details: axe stump, stacked timber, broken fence and a weathered bench.
  cylinder(root, bark, 5.8, .35, 5.2, .63, .7);
  const axe = box(root, darkWood, 5.8, 1.02, 5.2, .07, .9, .07); axe.rotation.z = -.38;
  box(root, rusty, 5.98, .64, 5.2, .4, .23, .06);
  for (let i = 0; i < 10; i++) cylinder(root, bark, -5.6, .18 + Math.floor(i / 4) * .28, 2.2 + (i % 4) * .3, .15, 1.4, [0, 0, Math.PI / 2]);
  box(root, wood, 6.7, .48, 1.9, .55, .12, 2.4);
  for (const z of [1.0, 2.8]) box(root, darkWood, 6.7, .23, z, .45, .46, .16);
  for (let i = 0; i < 8; i++) {
    const x = -8 + i * 2.0;
    if (Math.abs(x) < 2) continue;
    box(root, darkWood, x, .6, 7.4, .12, 1.2, .12);
    const rail = box(root, darkWood, x + .85, .85, 7.4, 1.8, .1, .1);
    rail.rotation.z = i % 3 === 0 ? -.17 : .03;
  }

  const resourceMaterials = {
    wood: mat('#967e54', { map: barkTexture }),
    scrap: mat('#a89b6b', { metalness: .58, roughness: .72 }),
    food: mat('#a6a270'),
  };
  const mushroomMat = mat('#b5865c');
  const resourceBase = own(new THREE.MeshBasicMaterial({ color: '#c1bc7b', transparent: true, opacity: .12, depthWrite: false }));
  function makeResource(kind, x, z, i) {
    const group = new THREE.Group(); group.position.set(x, .03, z);
    const material = resourceMaterials[kind];
    if (kind === 'wood') {
      for (let j = 0; j < 3; j++) cylinder(group, material, (j - 1) * .2, .15 + (j === 1 ? .13 : 0), 0, .13, 1.0, [Math.PI / 2, 0, .3]);
      box(group, darkWood, 0, .21, 0, .65, .055, .12);
    } else if (kind === 'scrap') {
      box(group, darkWood, 0, .25, 0, .7, .5, .56);
      for (const offset of [-.22, .22]) box(group, rusty, offset, .26, 0, .045, .52, .58);
      cylinder(group, material, .1, .59, .06, .14, .22);
    } else {
      for (let j = 0; j < 4; j++) {
        const mx = between(-.35, .35), mz = between(-.3, .3), size = between(.1, .2);
        cylinder(group, material, mx, .13, mz, .045, .26);
        const cap = new THREE.Mesh(new THREE.SphereGeometry(size, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), mushroomMat);
        cap.position.set(mx, .25, mz); group.add(cap);
      }
      const pack = box(group, material, .35, .13, .2, .2, .26, .16); pack.rotation.z = .2;
    }
    const ring = new THREE.Mesh(new THREE.RingGeometry(.48, .55, 20), resourceBase);
    ring.rotation.x = -Math.PI / 2; ring.position.y = .015; group.add(ring);
    root.add(group);
    resources.push({ id: `${kind}-${i}`, kind, mesh: group, position: group.position.clone(), available: true,
      label: kind === 'wood' ? 'Recolher madeira' : kind === 'scrap' ? 'Recolher sucata' : 'Recolher alimento' });
  }
  for (const [kind, count] of [['wood', 24], ['scrap', 12], ['food', 12]]) {
    for (let i = 0; i < count; i++) {
      let x, z;
      if (i === 0) [x, z] = kind === 'wood' ? [7, 9] : kind === 'scrap' ? [-7, 10] : [9, 0];
      else {
        let attempts = 0;
        do {
          const theta = random() * Math.PI * 2, radius = between(11, 43);
          x = Math.cos(theta) * radius; z = Math.sin(theta) * radius;
          attempts++;
        } while (attempts < 30 && obstacles.some(o => Math.hypot(x - o.x, z - o.z) < o.radius + 1.2));
      }
      makeResource(kind, x, z, i);
    }
  }

  let phase = 'day';
  function setPhase(next) {
    phase = next;
    doorPivot.rotation.y = phase === 'night' ? 0 : -1.5;
    porchLight.intensity = phase === 'night' ? 12 : 8;
    for (const group of Object.values(barricades)) group.visible = phase === 'night';
  }
  function setEntranceHealth(id, ratio) {
    const group = barricades[id];
    if (!group) return;
    group.children.forEach((mesh, index) => {
      const plank = Math.floor(index / 3);
      mesh.visible = ratio > plank / 3;
    });
  }
  function resetResources() {
    for (const resource of resources) { resource.available = true; resource.mesh.visible = true; }
  }
  function update(dt, state) {
    const time = state.time || 0;
    const lit = state.fire > 0;
    fireGroup.visible = lit;
    candle.visible = lit;
    glow.opacity = lit ? .12 : 0;
    for (const spill of windowSpills) spill.intensity = lit ? 9 : 0;
    fireLight.intensity = lit ? 28 + Math.sin(time * 12.5) * 3 + Math.sin(time * 23) * 2 : 0;
    for (let i = 0; i < fireGroup.children.length; i++) {
      const flame = fireGroup.children[i];
      flame.scale.y = flame.userData.baseHeight * (1 + .25 * Math.sin(time * 7 + i * 2.4));
      flame.rotation.z = .15 * Math.sin(time * 5 + i);
    }
    // A held breath of movement in the treetops, while trunks stay collision-stable.
    crowns.rotation.z = Math.sin(time * .16) * .0008;
  }
  // Software renderers are especially sensitive to the hundreds of separate
  // planks and props. Bake only the immutable scenery; interaction groups and
  // animated flames keep their original objects and visibility semantics.
  function batchStaticScenery() {
    root.updateMatrixWorld(true);
    const excluded = new Set([
      doorPivot, fireGroup, candle, ...Object.values(barricades),
      ...resources.map(resource => resource.mesh),
    ]);
    const inverseRoot = root.matrixWorld.clone().invert();
    const batches = new Map();
    root.traverse(object => {
      if (!object.isMesh || object.isInstancedMesh || Array.isArray(object.material) ||
          object.material.transparent || object.material.opacity < 1) return;
      let ancestor = object;
      while (ancestor && ancestor !== root) {
        if (excluded.has(ancestor)) return;
        ancestor = ancestor.parent;
      }
      const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
      const transform = inverseRoot.clone().multiply(object.matrixWorld);
      geometry.applyMatrix4(transform);
      // Standard three.js primitives provide all three attributes. Keep a
      // signature in the batch key so an unexpected custom primitive cannot
      // invalidate a whole otherwise-compatible material batch.
      const signature = Object.keys(geometry.attributes).sort().join(',');
      const key = `${object.material.uuid}:${signature}`;
      if (!batches.has(key)) batches.set(key, { material: object.material, geometries: [], originals: [] });
      const batch = batches.get(key);
      batch.geometries.push(geometry); batch.originals.push(object);
    });
    for (const batch of batches.values()) {
      if (batch.originals.length < 2) {
        for (const geometry of batch.geometries) geometry.dispose();
        continue;
      }
      let geometry;
      try { geometry = mergeGeometries(batch.geometries, false); } catch { geometry = null; }
      for (const item of batch.geometries) item.dispose();
      if (!geometry) continue; // Preserve original meshes if a merge is unsupported.
      geometry.computeBoundingSphere();
      const merged = new THREE.Mesh(geometry, batch.material);
      merged.name = 'static-scenery-batch';
      merged.castShadow = true; merged.receiveShadow = true;
      root.add(merged);
      for (const original of batch.originals) original.removeFromParent();
    }
  }
  function batchResourceParts() {
    root.updateMatrixWorld(true);
    // One shared vertex-colored Lambert material keeps each pickup to one draw
    // call while its existing parent Group remains independently hideable.
    const resourceMaterial = mat('#ffffff', { vertexColors: true });
    for (const resource of resources) {
      const inverse = resource.mesh.matrixWorld.clone().invert();
      const parts = [];
      resource.mesh.traverse(object => { if (object.isMesh && !object.isInstancedMesh) parts.push(object); });
      const geometries = parts.map(part => {
        const geometry = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry.clone();
        geometry.applyMatrix4(inverse.clone().multiply(part.matrixWorld));
        const base = part.material.color.clone();
        if (part.material.map) base.multiplyScalar(.7);
        // Keep the small pickup ring subtle without a separate transparent pass.
        if (part.material.transparent) base.lerp(new THREE.Color('#3d4230'), .8);
        const colors = new Float32Array(geometry.attributes.position.count * 3);
        for (let i = 0; i < colors.length; i += 3) {
          colors[i] = base.r; colors[i + 1] = base.g; colors[i + 2] = base.b;
        }
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        return geometry;
      });
      let geometry;
      try { geometry = mergeGeometries(geometries, false); } catch { geometry = null; }
      for (const item of geometries) item.dispose();
      if (!geometry) continue;
      geometry.computeBoundingSphere();
      const merged = new THREE.Mesh(geometry, resourceMaterial);
      merged.receiveShadow = true;
      merged.name = 'resource-batch';
      for (const part of parts) part.removeFromParent();
      resource.mesh.add(merged);
    }
  }
  if (lowQuality) { batchStaticScenery(); batchResourceParts(); }
  setPhase('day');
  return { entrances, resources, obstacles, fireplace, setPhase, update, resetResources, setEntranceHealth,
    dispose() {
      scene.remove(root);
      const geometries = new Set(); root.traverse(o => { if (o.geometry) geometries.add(o.geometry); });
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      for (const item of textures) item.dispose();
    }
  };
}
