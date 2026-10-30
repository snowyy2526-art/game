import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createWandererHead } from './wanderer-head.js';

/**
 * The user's Andarilho concept, built as an articulated, entirely local model.
 * Coordinates are metres: bare feet at y=0, skull at approximately 2.10m.
 * All skin, clothing and equipment are geometry; no billboards or image planes.
 */
export function createWandererModel(THREE) {
  const group = new THREE.Group();
  group.name = 'andarilho-concept-model';
  const colors = {
    skin: '#a28e78', bone: '#baa58a', skinShadow: '#665344', wound: '#60342f',
    wrap: '#aaa18b', wrapDirty: '#716956', cloth: '#765756', clothDark: '#382c2c',
    leather: '#3b3027', metal: '#775546', eye: '#d4c2a0', black: '#17120f', teeth: '#b6a16b',
  };
  const palette = Object.fromEntries(Object.entries(colors).map(([key, color]) => {
    const material = new THREE.MeshStandardMaterial({ color, roughness: .97, side: THREE.DoubleSide });
    material.name = `andarilho-${key}`;
    return [key, material];
  }));
  const ropeBlue = new THREE.MeshStandardMaterial({ color: '#465464', roughness: 1 });
  const ropeOchre = new THREE.MeshStandardMaterial({ color: '#aa7052', roughness: 1 });
  const brass = new THREE.MeshStandardMaterial({ color: '#8b7750', roughness: 1 });
  const bodySurface = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, vertexColors: true, side: THREE.DoubleSide });
  bodySurface.name = 'andarilho-weathered-surfaces';
  const axis = new THREE.Vector3(0, 1, 0);
  const smoothSphere = new THREE.SphereGeometry(1, 10, 7);
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const pose = [];
  const featureNames = new Set();

  function part(name, parent, x = 0, y = 0, z = 0) {
    const result = new THREE.Group(); result.name = name; result.position.set(x, y, z); parent.add(result); return result;
  }
  function mesh(name, geometry, material, parent, position = [0, 0, 0], scale = [1, 1, 1]) {
    const result = new THREE.Mesh(geometry, material);
    result.name = name; result.position.set(...position); result.scale.set(...scale);
    result.castShadow = true; result.receiveShadow = true;
    parent.add(result); featureNames.add(name); return result;
  }
  function ellipsoid(name, parent, material, position, scale) {
    return mesh(name, smoothSphere, material, parent, position, scale);
  }
  function box(name, parent, material, position, scale) {
    return mesh(name, boxGeometry, material, parent, position, scale);
  }
  function bone(name, parent, material, from, to, r1 = .035, r2 = r1 * .78) {
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
    const result = mesh(name, new THREE.CylinderGeometry(r2, r1, a.distanceTo(b), 8, 2), material, parent);
    result.position.copy(a).add(b).multiplyScalar(.5);
    result.quaternion.setFromUnitVectors(axis, b.sub(a).normalize());
    return result;
  }
  function curve(name, parent, material, points, radius = .008, segments = 9, radial = 5) {
    const path = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
    return mesh(name, new THREE.TubeGeometry(path, segments, radius, radial, false), material, parent);
  }
  function ribbon(name, parent, material, points, width = .04) {
    const vertices = [], indices = [];
    points.forEach((p, i) => {
      const prev = new THREE.Vector3(...points[Math.max(0, i - 1)]);
      const next = new THREE.Vector3(...points[Math.min(points.length - 1, i + 1)]);
      const tangent = next.sub(prev).normalize();
      const across = new THREE.Vector3(-tangent.y, tangent.x, 0).normalize().multiplyScalar(width / 2);
      vertices.push(p[0] - across.x, p[1] - across.y, p[2], p[0] + across.x, p[1] + across.y, p[2]);
      if (i < points.length - 1) { const j = i * 2; indices.push(j, j + 1, j + 2, j + 1, j + 3, j + 2); }
    });
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    return mesh(name, geometry, material, parent);
  }
  function wrapped(name, parent, from, to, radius, turns = 5, width = .035) {
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to), length = a.distanceTo(b);
    const rotation = new THREE.Quaternion().setFromUnitVectors(axis, b.clone().sub(a).normalize());
    const vertices = [], indices = [], edge = [];
    const steps = Math.ceil(turns * 16);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, theta = t * Math.PI * 2 * turns;
      const r = radius * (1 - t * .2) + Math.sin(theta * .7) * .0015;
      for (const side of [-1, 1]) {
        const p = new THREE.Vector3(Math.cos(theta) * r, t * length + side * width / 2, Math.sin(theta) * r).applyQuaternion(rotation).add(a);
        vertices.push(p.x, p.y, p.z);
      }
      const p = new THREE.Vector3(Math.cos(theta) * (r + .001), t * length + width / 2, Math.sin(theta) * (r + .001)).applyQuaternion(rotation).add(a);
      edge.push(p);
      if (i < steps) { const j = i * 2; indices.push(j, j + 1, j + 2, j + 1, j + 3, j + 2); }
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
    mesh(name, geometry, palette.wrap, parent);
    const outline = new THREE.CatmullRomCurve3(edge);
    mesh(`${name}-frayed-edge`, new THREE.TubeGeometry(outline, Math.ceil(steps / 2), .0015, 3, false), palette.wrapDirty, parent);
  }
  function profile(name, parent, material, rings, radial = 14) {
    const vertices = [], indices = [];
    for (const [y, rx, rz, cx = 0, cz = 0] of rings) {
      for (let i = 0; i < radial; i++) {
        const angle = i / radial * Math.PI * 2;
        vertices.push(cx + Math.cos(angle) * rx, y, cz + Math.sin(angle) * rz);
      }
    }
    for (let r = 0; r < rings.length - 1; r++) for (let i = 0; i < radial; i++) {
      const a = r * radial + i, b = r * radial + (i + 1) % radial, c = a + radial, d = b + radial;
      indices.push(a, c, b, b, c, d);
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
    return mesh(name, geometry, material, parent);
  }

  const pelvis = part('pelvis-rig', group, 0, 1.02, 0);
  const pelvisShell = part('patched-shorts-and-equipment', pelvis);
  const torso = part('breathing-torso-rig', group, 0, 1.45, .012);
  const torsoShell = part('gaunt-ribcage-and-shoulders', torso);
  profile('emaciated-torso', torsoShell, palette.skin, [
    [-.43, .105, .069, 0, .012], [-.34, .098, .06, .006, .008], [-.23, .095, .066, .008, 0],
    [-.14, .126, .087, .005, -.005], [-.03, .164, .101, 0, -.006], [.08, .18, .085, -.004, -.004],
    [.16, .174, .068, -.006, 0], [.22, .094, .053, -.01, .008],
  ]);
  ellipsoid('narrow-bony-pelvis', pelvisShell, palette.skin, [0, .035, 0], [.14, .105, .075]);
  bone('sternum', torsoShell, palette.bone, [0, -.1, .095], [-.008, .155, .078], .012, .014);
  for (const side of [-1, 1]) {
    curve(`clavicle-${side}`, torsoShell, palette.bone, [[-.007, .17, .065], [side * .09, .18, .07], [side * .18, .15, .026]], .013, 7);
    for (let i = 0; i < 6; i++) {
      const irregular = Math.sin(i * 2.1 + side * .7);
      const y = .1 - i * .041 + irregular * .0045;
      const span = .148 - i * .008 + Math.sin(i * 1.3 + side) * .005;
      const rise = .022 + Math.cos(i * .8 + side) * .007;
      curve(`exposed-rib-${side}-${i}`, torsoShell, palette.bone, [
        [side * .015, y, .101 - i * .003], [side * span * .43, y - .008 + irregular * .003, .113 - i * .004],
        [side * span * .9, y + rise, .075], [side * span, y + rise + .026, .018],
      ], .0068 + Math.sin(i * 1.7 + side) * .0012, 9, 5);
      curve(`rib-shadow-${side}-${i}`, torsoShell, palette.skinShadow, [
        [side * .018, y - .011, .096], [side * span * .6, y - .009, .101 - i * .003], [side * span * .94, y + rise - .009, .065],
      ], .0023, 7, 4);
    }
    bone(`neck-tendon-${side}`, torsoShell, palette.skinShadow, [side * .042, .22, .058], [side * .025, .35, .035], .009, .008);
  }
  bone('long-thin-neck', torsoShell, palette.skin, [-.008, .19, .005], [-.015, .39, .025], .052, .045);
  wrapped('old-neck-wrappings', torsoShell, [-.015, .25, .025], [-.015, .35, .025], .047, 3, .023);
  ellipsoid('sunken-abdomen', torsoShell, palette.skinShadow, [.014, -.25, .063], [.062, .103, .012]);
  curve('abdominal-wound', torsoShell, palette.wound, [[.02, -.125, .087], [-.012, -.16, .088], [.02, -.2, .074], [.011, -.27, .071]], .014, 9);
  for (const side of [-1, 1]) {
    bone(`hip-tendon-${side}`, torsoShell, palette.bone, [side * .072, -.33, .065], [side * .04, -.17, .074], .009, .006);
  }

  const head = createWandererHead(THREE, palette);
  head.name = 'hollow-eyed-open-mouth-head'; head.position.set(-.015, .46, .03); torso.add(head);

  // Torn knee-length shorts, with real hems, uneven panels and hand-sewn patches.
  profile('shorts-waistband', pelvisShell, palette.clothDark, [[.035, .15, .092], [-.035, .151, .093]], 16);
  const legs = [], knees = [], feet = [];
  for (const side of [-1, 1]) {
    const leg = part(`leg-${side}`, pelvis, side * .095, -.04, 0);
    legs.push(leg);
    const thighShell = part(`thigh-and-shorts-${side}`, leg);
    profile(`tattered-shorts-leg-${side}`, thighShell, palette.cloth, [
      [.07, .103, .088, -side * .014, 0], [-.02, .111, .091, 0, .002],
      [-.14, .105, .085, side * .009, .005], [-.26, .107, .084, side * .015, .003],
      [-.31, .103, .079, side * .017, 0],
    ], 13);
    for (let i = 0; i < 9; i++) {
      const angle = i / 9 * Math.PI * 2;
      const width = .026, x = side * .016 + Math.cos(angle) * .103, z = Math.sin(angle) * .083;
      const tatter = new THREE.BufferGeometry();
      tatter.setAttribute('position', new THREE.Float32BufferAttribute([
        x - width, -.295, z, x + width, -.301, z, x + Math.sin(i * 3.2) * .018, -.33 - (i % 3) * .017, z + .008,
      ], 3)); tatter.computeVertexNormals(); mesh(`shorts-frayed-hem-${side}-${i}`, tatter, i % 2 ? palette.cloth : palette.clothDark, thighShell);
    }
    const patch = box(`stitched-patch-${side}`, thighShell, side === -1 ? palette.wrapDirty : palette.skinShadow,
      [side * .035, -.14, .084], [.087, .147, .004]); patch.rotation.z = side * .09;
    for (let i = 0; i < 7; i++) {
      const y = -.206 + i * .022;
      bone(`patch-stitch-${side}-${i}`, thighShell, palette.black, [side * .035 - .051, y, .09], [side * .035 - .037, y + .012, .091], .0016, .0016);
      bone(`patch-stitch-edge-${side}-${i}`, thighShell, palette.black, [side * .035 + .038, y, .09], [side * .035 + .05, y + .012, .091], .0016, .0016);
    }
    curve(`trouser-seam-${side}`, thighShell, palette.clothDark, [[side * .05, .015, .087], [side * .075, -.12, .087], [side * .07, -.28, .08]], .003, 9, 4);
    bone(`upper-leg-${side}`, thighShell, palette.skin, [0, -.22, 0], [side * .01, -.45, .014], .059, .043);
    const knee = part(`knee-${side}`, leg, side * .01, -.45, .014); knees.push(knee);
    const shinShell = part(`scarred-shin-${side}`, knee);
    const kneecap = mesh(`kneecap-${side}`, new THREE.IcosahedronGeometry(1, 1), palette.bone, shinShell, [0, .005, .032], [.034, .041, .014]);
    kneecap.rotation.z = side * .13;
    curve(`knee-skin-fold-${side}`, shinShell, palette.skinShadow, [[-.027, -.017, .035], [-.005, -.032, .043], [.023, -.021, .039]], .0024, 7, 4);
    bone(`lower-leg-${side}`, shinShell, palette.skin, [0, -.025, 0], [-side * .012, -.47, -.01], .044, .026);
    bone(`sharp-shinbone-${side}`, shinShell, palette.bone, [side * .002, -.08, .035], [-side * .01, -.425, .018], .0085, .006);
    if (side === -1) {
      wrapped('left-shin-dirty-bandages', shinShell, [0, -.045, 0], [-side * .01, -.43, -.009], .047, 8, .036);
      ribbon('left-shin-blood-stain', shinShell, palette.wound, [[-.015, -.12, .049], [.015, -.18, .045], [-.008, -.24, .04]], .021);
    } else {
      ribbon('right-shin-old-wound', shinShell, palette.wound, [[-.016, -.04, .036], [-.023, -.12, .036], [-.01, -.23, .029]], .026);
      wrapped('right-ankle-bandages', shinShell, [side * -.009, -.385, -.009], [-side * .012, -.47, -.01], .029, 3, .024);
    }
    const foot = part(`bare-foot-${side}`, knee, -side * .012, -.47, -.01); feet.push(foot);
    foot.rotation.y = side * .08;
    const footShell = part(`long-toed-foot-${side}`, foot);
    ellipsoid(`bare-foot-instep-${side}`, footShell, palette.skin, [0, -.018, .045], [.054, .042, .11]);
    ellipsoid(`heel-${side}`, footShell, palette.skinShadow, [0, -.029, -.028], [.039, .026, .045]);
    for (let i = 0; i < 5; i++) {
      const x = -.042 + i * .022, length = .075 - (side * (i - 2) > 0 ? Math.abs(i - 2) * .011 : .005);
      const thickness = .012 + (side === 1 ? 4 - i : i) * .0018;
      curve(`long-bare-toe-${side}-${i}`, footShell, palette.skin, [[x, -.03, .105], [x * 1.15, -.033, .14], [x * 1.22, -.033, .14 + length]], thickness, 5, 6);
      ellipsoid(`toenail-${side}-${i}`, footShell, palette.teeth, [x * 1.22, -.023, .133 + length], [thickness * .65, .003, .012]);
      curve(`foot-tendon-${side}-${i}`, footShell, palette.bone, [[x * .28, .018, .025], [x * .8, .01, .09], [x, -.018, .13]], .003, 5, 4);
    }
  }

  const arms = [], elbows = [], hands = [];
  for (const side of [-1, 1]) {
    const arm = part(`hanging-arm-${side}`, torso, side * .205, .19, .002); arms.push(arm);
    const upperShell = part(`wasted-upper-arm-${side}`, arm);
    const shoulder = mesh(`bony-shoulder-${side}`, new THREE.IcosahedronGeometry(1, 1), palette.skin, upperShell, [0, -.025, 0], [.052, .074, .043]);
    shoulder.rotation.z = side * .18;
    profile(`upper-arm-${side}`, upperShell, palette.skin, [
      [-.025, .041, .032, 0, 0], [-.13, .037, .027, side * .018, -.008],
      [-.25, .027, .021, side * .032, .005], [-.37, .03, .026, side * .025, .018],
    ], 10);
    curve(`upper-arm-tendon-${side}`, upperShell, palette.bone, [[side * -.013, -.08, .037], [side * .008, -.23, .041], [side * .02, -.34, .045]], .006, 7);
    ribbon(`upper-arm-scar-${side}`, upperShell, palette.skinShadow, [[side * .031, -.15, .027], [side * .046, -.19, .028], [side * .033, -.24, .035]], .005);
    const elbow = part(`elbow-${side}`, arm, side * .025, -.37, .018); elbows.push(elbow);
    const foreShell = part(`wrapped-forearm-${side}`, elbow);
    ellipsoid(`pointed-elbow-${side}`, foreShell, palette.bone, [0, 0, -.005], [.03, .036, .026]);
    profile(`long-forearm-${side}`, foreShell, palette.skin, [
      [-.015, .03, .027, 0, 0], [-.115, .032, .025, side * .016, .013],
      [-.255, .025, .023, side * .033, .031], [-.39, .023, .022, side * .026, .04],
    ], 10);
    curve(`elbow-skin-fold-${side}`, foreShell, palette.skinShadow, [[-.024, -.007, .021], [0, -.018, .03], [.021, -.003, .024]], .0021, 7, 4);
    wrapped(`forearm-bandages-${side}`, foreShell, [side * .002, -.045, .005], [side * .025, -.365, .036], .035, side === -1 ? 7 : 6, .032);
    ribbon(`forearm-blood-stain-${side}`, foreShell, palette.wound, [[side * .015, -.105, .039], [side * -.012, -.164, .044], [side * .02, -.2, .055]], .018);
    ribbon(`loose-bandage-${side}`, foreShell, palette.wrapDirty, [[side * .035, -.19, .027], [side * .071, -.235, .044], [side * .061, -.29, .049]], .025);
    const hand = part(`claw-hand-${side}`, elbow, side * .026, -.39, .04); hands.push(hand);
    const handShell = part(`long-fingers-${side}`, hand);
    ellipsoid(`thin-long-palm-${side}`, handShell, palette.skin, [side * .008, -.066, .009], [.044, .083, .025]);
    for (let i = 0; i < 4; i++) {
      const x = -.031 + i * .021, length = [.155, .193, .185, .151][i];
      const middle = -.12 - length * .55, end = -.12 - length;
      curve(`skeletal-finger-${side}-${i}`, handShell, palette.skin, [[x, -.117, .013], [x * 1.4, middle, .01], [x * 1.58, end, .052]], .0105, 7, 6);
      ellipsoid(`finger-knuckle-${side}-${i}`, handShell, palette.bone, [x * 1.4, middle, .01], [.0114, .016, .012]);
      ellipsoid(`fingernail-${side}-${i}`, handShell, palette.teeth, [x * 1.58, end + .004, .058], [.007, .015, .003]);
      curve(`hand-tendon-${side}-${i}`, handShell, palette.bone, [[x * .4, -.016, .03], [x, -.1, .034]], .0024, 4, 4);
    }
    curve(`opposing-thumb-${side}`, handShell, palette.skin, [[-side * .034, -.035, .005], [-side * .085, -.09, .023], [-side * .087, -.148, .046]], .014, 7, 6);
    ellipsoid(`thumb-nail-${side}`, handShell, palette.teeth, [-side * .087, -.14, .055], [.008, .014, .004]);
  }

  // The scarf is layered rather than a flat collar; the cape has actual holes.
  const cape = part('ragged-mauve-cape-rig', torso);
  const capeShell = part('ragged-mauve-fabric', cape);
  const cols = 13, rows = 16, vertices = [], indices = [];
  for (let r = 0; r <= rows; r++) {
    const t = r / rows;
    for (let c = 0; c <= cols; c++) {
      const u = c / cols * 2 - 1;
      const jagged = r === rows ? .07 * Math.sin(c * 3.9) + .06 * (c % 3) : 0;
      const x = -.058 + u * (.25 + t * .15) + .015 * Math.sin(t * 7 + u * 3);
      const y = .255 - t * 1.1 - Math.abs(u) * .12 + jagged;
      const z = -.092 - .075 * Math.abs(u) - .052 * Math.sin(c * 1.9 + t * .7) * (.7 + t * .3) - t * .055;
      vertices.push(x, y, z);
    }
  }
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const tear = (r > 3 && ((r * 17 + c * 13) % 31 === 0 || (c === 1 && r > 9))) || (r === rows - 1 && c % 4 === 1);
    if (tear) continue;
    const a = r * (cols + 1) + c, b = a + 1, d = a + cols + 2, e = a + cols + 1;
    indices.push(a, b, e, b, d, e);
  }
  const capeGeometry = new THREE.BufferGeometry(); capeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); capeGeometry.setIndex(indices); capeGeometry.computeVertexNormals();
  mesh('perforated-cape', capeGeometry, palette.cloth, capeShell);
  for (let i = 0; i < 7; i++) {
    const x = -.31 + i * .083;
    curve(`cape-dark-fold-${i}`, capeShell, palette.clothDark, [[x * .65, .19, -.113 - .04 * Math.abs(x)], [x, -.15, -.14], [x * 1.15, -.6 + (i % 2) * .08, -.195]], .004, 9, 4);
  }
  ribbon('cape-front-left-drape', capeShell, palette.cloth, [[-.17, .23, .053], [-.26, .14, .056], [-.28, -.1, .015], [-.31, -.39, -.02], [-.34, -.65, -.07]], .145);
  ribbon('cape-left-ragged-tail', capeShell, palette.clothDark, [[-.29, -.15, -.012], [-.35, -.38, -.045], [-.38, -.6, -.075]], .036);
  for (let i = 0; i < 4; i++) {
    const y = .222 + i * .019;
    const path = new THREE.CatmullRomCurve3([
      [-.22, y - .035, -.045], [-.168, y - .035, .088], [-.03, y - .055, .116], [.13, y - .022, .067], [.1, y + .005, -.066],
    ].map(p => new THREE.Vector3(...p)));
    ribbon(`scarf-layer-${i}`, torsoShell, palette.cloth, path.getPoints(20).map(p => p.toArray()), .044 + i * .002);
  }
  curve('scarf-drooping-crease', torsoShell, palette.clothDark, [[-.2, .2, .087], [-.08, .159, .119], [.07, .181, .094]], .007, 10, 5);

  // Utility straps, cords and the worn pack are recognisable in side/back views.
  ribbon('diagonal-chest-strap', torsoShell, palette.leather, [[-.15, .165, .095], [-.08, .01, .128], [.02, -.17, .09], [.12, -.36, .08]], .052);
  const buckle = box('chest-strap-buckle', torsoShell, brass, [-.052, -.045, .132], [.06, .047, .009]); buckle.rotation.z = -.39;
  const buckleInset = box('chest-strap-buckle-hole', torsoShell, palette.leather, [-.052, -.045, .138], [.039, .023, .004]); buckleInset.rotation.z = -.39;
  for (let i = 0; i < 3; i++) ellipsoid(`strap-rivet-${i}`, torsoShell, brass, [-.12 + i * .07, .115 - i * .13, .123], [.006, .006, .003]);
  const pack = part('worn-backpack', torsoShell, .055, -.205, -.18);
  ellipsoid('leather-pack-body', pack, palette.leather, [0, 0, -.025], [.138, .17, .074]);
  ellipsoid('leather-pack-flap', pack, palette.clothDark, [0, .09, -.074], [.142, .092, .022]);
  curve('backpack-gathering-cord', pack, palette.wrapDirty, [[-.11, .13, -.069], [-.06, .143, -.099], [0, .13, -.111], [.1, .14, -.073]], .009, 10, 5);
  ribbon('pack-fastening-strap', pack, palette.leather, [[0, .13, -.1], [0, -.015, -.107], [0, -.135, -.085]], .025);
  box('pack-brass-buckle', pack, brass, [0, -.045, -.11], [.036, .029, .009]);
  curve('pack-side-hanging-cord', pack, ropeOchre, [[.11, .12, -.06], [.16, .015, -.05], [.135, -.15, -.04]], .006, 9);
  for (let i = 0; i < 3; i++) {
    const y = .03 - i * .014;
    const points = [];
    for (let n = 0; n <= 32; n++) {
      const a = n / 32 * Math.PI * 2;
      points.push([Math.cos(a) * .154, y + Math.sin(a * 2 + i) * .006, Math.sin(a) * .098]);
    }
    curve(`waist-cord-${i}`, pelvisShell, i === 0 ? ropeBlue : ropeOchre, points, .007, 32, 5);
  }
  ellipsoid('waist-cord-knot', pelvisShell, ropeOchre, [-.105, -.004, .087], [.027, .019, .019]);
  curve('blue-rope-loose-end', pelvisShell, ropeBlue, [[-.11, -.005, .094], [-.139, -.08, .105], [-.12, -.19, .105]], .006, 9);
  curve('orange-rope-loose-end', pelvisShell, ropeOchre, [[-.102, -.01, .1], [-.09, -.1, .115], [-.11, -.245, .12]], .006, 9);
  const machete = part('sheathed-rusty-machete', pelvisShell, -.13, .01, .1); machete.rotation.z = -.52;
  const bladeOutline = new THREE.Shape(); bladeOutline.moveTo(-.025, 0); bladeOutline.lineTo(-.036, -.24); bladeOutline.quadraticCurveTo(-.037, -.335, .009, -.35); bladeOutline.lineTo(.027, -.28); bladeOutline.lineTo(.024, 0); bladeOutline.closePath();
  mesh('machete-rusted-blade', new THREE.ExtrudeGeometry(bladeOutline, { depth: .007, bevelEnabled: false, curveSegments: 5 }), palette.metal, machete);
  ribbon('machete-leather-sheath', machete, palette.leather, [[0, -.025, .008], [-.004, -.12, .009], [-.007, -.225, .009]], .059);
  bone('machete-bound-handle', machete, palette.wrapDirty, [0, .005, 0], [0, .127, 0], .019, .022);
  wrapped('machete-handle-wrapping', machete, [0, .016, 0], [0, .119, 0], .023, 5, .014);
  box('machete-crossguard', machete, palette.metal, [0, .005, .003], [.082, .013, .022]);

  // Bake static parts into vertex-coloured batches while leaving every joint free.
  // This keeps the richly detailed character inexpensive even in software WebGL.
  function batch(shell) {
    shell.updateMatrixWorld(true);
    const inverse = shell.matrixWorld.clone().invert(), geometries = [], meshes = [], names = [];
    shell.traverse(object => {
      if (!object.isMesh) return;
      const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
      geometry.applyMatrix4(inverse.clone().multiply(object.matrixWorld));
      if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
      const positions = geometry.getAttribute('position'), colors = new Float32Array(positions.count * 3);
      const tint = object.material.color;
      const skin = object.material === palette.skin || object.material === palette.bone;
      const fabric = object.material === palette.cloth || object.material === palette.clothDark || /stitched-patch|frayed-hem/.test(object.name);
      const wrapping = object.material === palette.wrap;
      for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
        // Coherent broad stains follow position rather than individual triangles.
        const broad = Math.sin(x * 18 + Math.sin(y * 7.4) * 2 + z * 15) * Math.cos(y * 11 - z * 8);
        const small = Math.sin(x * 51 + y * 34 + z * 43) * .5 + Math.sin(y * 57 - x * 29) * .5;
        let r = tint.r, g = tint.g, b = tint.b;
        if (skin) {
          const stain = .12 + Math.max(0, broad) * .27 + Math.max(0, small) * .06;
          const shade = .91 + broad * .06 + small * .025;
          r = r * shade * (1 - stain) + .16 * stain;
          g = g * shade * (1 - stain) + .125 * stain;
          b = b * shade * (1 - stain) + .095 * stain;
        } else if (fabric) {
          const faded = .77 + broad * .16 + small * .045;
          const edge = /frayed-hem|ragged-tail/.test(object.name) ? 1.18 : 1;
          r *= faded * edge; g *= faded * edge; b *= faded * edge;
        } else if (wrapping) {
          const dirt = .84 + broad * .11 + small * .04;
          r *= dirt; g *= dirt; b *= dirt;
        }
        colors[i * 3] = r; colors[i * 3 + 1] = g; colors[i * 3 + 2] = b;
      }
      // Only position/normal/colour are needed by this untextured model.
      for (const key of Object.keys(geometry.attributes)) if (!['position', 'normal'].includes(key)) geometry.deleteAttribute(key);
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geometries.push(geometry); meshes.push(object); names.push(object.name);
    });
    const geometry = mergeGeometries(geometries, false);
    if (!geometry) throw new Error(`Unable to batch Andarilho part: ${shell.name}`);
    for (const object of meshes) object.removeFromParent();
    const result = new THREE.Mesh(geometry, bodySurface); result.name = `${shell.name}-batch`; result.castShadow = true; result.receiveShadow = true;
    result.userData.features = names; shell.add(result);
    for (const source of geometries) source.dispose();
  }
  // Leaf shells first. Torso/pelvis exclude articulated children because shells
  // are their own siblings, never ancestors of moving joints.
  const shells = [];
  group.traverse(object => { if (object.name === 'gaunt-ribcage-and-shoulders' || object.name === 'patched-shorts-and-equipment' || /^(?:thigh-and-shorts|scarred-shin|long-toed-foot|wasted-upper-arm|wrapped-forearm|long-fingers|ragged-mauve-fabric)/.test(object.name)) shells.push(object); });
  for (const shell of shells) batch(shell);

  torso.rotation.x = .045;
  head.rotation.z = -.025;
  arms.forEach((arm, i) => { arm.rotation.z = i === 0 ? -.028 : .032; });
  elbows.forEach((elbow, i) => { elbow.rotation.x = i === 0 ? -.035 : .045; });
  for (const object of [pelvis, torso, head, cape, ...arms, ...elbows, ...hands, ...legs, ...knees, ...feet]) {
    pose.push({ object, position: object.position.clone(), rotation: object.rotation.clone(), scale: object.scale.clone() });
  }
  function resetPose() {
    for (const rest of pose) { rest.object.position.copy(rest.position); rest.object.rotation.copy(rest.rotation); rest.object.scale.copy(rest.scale); }
  }
  function animate(time, moving, mode = 'patrol') {
    resetPose();
    if (mode === 'capture') { animateCapture(0); return; }
    if (mode === 'alert') {
      const tremor = Math.sin(time * 13) * .012;
      torso.rotation.x = -.075;
      torso.rotation.z = tremor;
      torso.scale.z = 1 + Math.sin(time * 5) * .025;
      head.rotation.x = -.12;
      head.rotation.z = -.045 + tremor;
      arms.forEach((arm, i) => {
        arm.rotation.x = -.42 + tremor * (i ? -1 : 1);
        arm.rotation.z = i ? .17 : -.17;
        elbows[i].rotation.x = -.7;
        hands[i].rotation.x = -.28;
        knees[i].rotation.x = .12;
        legs[i].rotation.x = -.08;
      });
      return;
    }
    if (mode === 'chase') {
      const cycle = time * 13.5;
      const bounce = Math.abs(Math.sin(cycle));
      torso.rotation.x = .3;
      torso.position.y += bounce * .035;
      torso.position.z += .08;
      torso.rotation.y = Math.sin(cycle) * .08;
      pelvis.position.y += bounce * .055;
      pelvis.rotation.y = Math.sin(cycle) * .11;
      head.rotation.x = -.23;
      head.rotation.z = Math.sin(cycle) * .045;
      cape.rotation.x = .2 + bounce * .06;
      cape.rotation.z = Math.sin(cycle + .7) * .08;
      arms.forEach((arm, i) => {
        const step = cycle + i * Math.PI;
        arm.rotation.x = Math.sin(step + Math.PI) * .82;
        arm.rotation.z = i ? .08 : -.08;
        elbows[i].rotation.x = -.8 - Math.max(0, -Math.sin(step)) * .35;
        hands[i].rotation.x = -.18;
        legs[i].rotation.x = Math.sin(step) * .83;
        knees[i].rotation.x = Math.max(0, Math.sin(step - .8)) * 1.22;
        feet[i].rotation.x = -.12 + Math.sin(step + .3) * .23;
      });
      return;
    }
    if (mode === 'exhausted') {
      const breath = Math.sin(time * 6.2);
      const tremor = Math.sin(time * 19) * .008;
      torso.rotation.x = .57 + breath * .035;
      torso.position.y -= .13 + breath * .009;
      torso.position.z += .08;
      torso.scale.z = 1 + breath * .055;
      pelvis.position.y -= .1;
      head.rotation.x = .17 + breath * .04;
      head.rotation.z = -.06;
      cape.rotation.x = -.12;
      arms.forEach((arm, i) => {
        arm.rotation.x = -.5 + breath * .024;
        arm.rotation.z = i ? .065 : -.065;
        elbows[i].rotation.x = -.16;
        hands[i].rotation.x = .21 + tremor;
        legs[i].rotation.x = -.2;
        knees[i].rotation.x = .36 + tremor;
        feet[i].rotation.x = -.12;
      });
      return;
    }
    const breath = Math.sin(time * 2.05) + Math.sin(time * 4.7) * .18;
    const cycle = time * 2.45;
    const effort = Math.max(0, Math.sin(cycle));
    torso.position.y += breath * .003 - (moving ? effort * .009 : 0);
    torso.scale.z = 1 + breath * .025;
    torso.rotation.x += breath * .007 + (moving ? .012 * Math.sin(cycle - .4) : 0);
    torso.rotation.z = moving ? Math.sin(cycle * .5) * .017 : Math.sin(time * .6) * .005;
    pelvis.position.y += moving ? .009 * Math.sin(cycle * 2) : 0;
    pelvis.rotation.y = moving ? Math.sin(cycle) * .035 : 0;
    head.rotation.x = breath * .012;
    head.rotation.y = Math.sin(time * .43) * .022;
    head.rotation.z += moving ? Math.sin(cycle - .55) * .016 : 0;
    cape.rotation.x = Math.sin(time * 1.15) * .011 + (moving ? effort * .014 : 0);
    cape.rotation.z = Math.sin(time * .8) * .008;
    arms.forEach((arm, i) => {
      const step = cycle + i * Math.PI;
      arm.position.y += breath * .004;
      arm.rotation.x = moving ? Math.sin(step - .25) * (i ? .075 : .055) : Math.sin(time * .75 + i) * .01;
      elbows[i].rotation.x += moving ? Math.sin(step - .8) * .032 : breath * .006;
      hands[i].rotation.x = .06 + Math.sin(time * 1.2 + i) * .018;
      hands[i].rotation.z = Math.sin(time * .8 + i) * .025;
      legs[i].rotation.x = moving ? Math.sin(step) * (i ? .14 : .105) : 0;
      knees[i].rotation.x = moving ? Math.max(0, Math.sin(step - .5)) * (i ? .13 : .08) : 0;
      feet[i].rotation.x = moving ? Math.sin(step + .35) * .065 : 0;
    });
  }
  const capture = Object.freeze({ duration: 7, playerDistance: .85, startEyeHeight: 1.7, liftedEyeHeight: 2.65, reachEnd: .2, liftEnd: .5, breakAt: .84 });
  const smooth = value => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
  const upperRest = elbows.map(elbow => elbow.position.clone().normalize());
  const foreRest = hands.map(hand => hand.position.clone().normalize());
  const upperLength = elbows.map(elbow => elbow.position.length());
  const foreLength = hands.map(hand => hand.position.length());
  const captureGrip = new THREE.Vector3();

  // Solve two real articulated bones, keeping the grip at the player's throat
  // as the camera rises. Targets are model-local; the AI alone owns world pose.
  function reachWrist(index, wrist, fingerDirection) {
    group.updateMatrixWorld(true);
    const arm = arms[index], elbow = elbows[index], hand = hands[index];
    const shoulder = group.worldToLocal(arm.getWorldPosition(new THREE.Vector3()));
    const delta = wrist.clone().sub(shoulder);
    const d = Math.max(.001, Math.min(delta.length(), upperLength[index] + foreLength[index] - .001));
    const forward = delta.normalize();
    const outward = new THREE.Vector3(index ? 1 : -1, 0, 0);
    outward.addScaledVector(forward, -outward.dot(forward)).normalize();
    const along = (upperLength[index] ** 2 - foreLength[index] ** 2 + d * d) / (2 * d);
    const bend = Math.sqrt(Math.max(0, upperLength[index] ** 2 - along * along));
    const elbowTarget = shoulder.clone().addScaledVector(forward, along).addScaledVector(outward, bend);
    const elbowInTorso = torso.worldToLocal(group.localToWorld(elbowTarget));
    arm.quaternion.setFromUnitVectors(upperRest[index], elbowInTorso.sub(arm.position).normalize());
    arm.updateMatrixWorld(true);
    const wristInArm = arm.worldToLocal(group.localToWorld(wrist.clone()));
    elbow.quaternion.setFromUnitVectors(foreRest[index], wristInArm.sub(elbow.position).normalize());
    elbow.updateMatrixWorld(true);
    const inverseElbow = elbow.getWorldQuaternion(new THREE.Quaternion()).invert();
    const directionWorld = fingerDirection.clone().transformDirection(group.matrixWorld).applyQuaternion(inverseElbow);
    hand.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), directionWorld.normalize());
  }

  function animateCapture(progress) {
    resetPose();
    const t = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
    const reach = smooth(t / capture.reachEnd);
    const lift = smooth((t - capture.reachEnd) / (capture.liftEnd - capture.reachEnd));
    const squeeze = smooth((t - .55) / .25);
    const jolt = Math.exp(-Math.max(0, t - capture.breakAt) * 85) * (t >= capture.breakAt ? 1 : 0);
    const eyeY = THREE.MathUtils.lerp(capture.startEyeHeight, capture.liftedEyeHeight, lift);
    const throatY = eyeY - .2;
    torso.position.y += lift * .1;
    torso.position.z += lift * .105;
    torso.rotation.x = THREE.MathUtils.lerp(.045, -.075, lift) + jolt * .055;
    head.rotation.x = -.08 - lift * .15;
    head.rotation.y = jolt * .14;
    head.rotation.z = -.025 + squeeze * .04;
    cape.rotation.x = -.025 + lift * .05;
    pelvis.rotation.y = squeeze * .025;
    knees.forEach(knee => { knee.rotation.x = .07 * (1 - lift); });
    captureGrip.set(0, throatY, capture.playerDistance);
    arms.forEach((arm, i) => {
      const side = i ? 1 : -1;
      // Fingertips extend .25m up/forward from these wrists around the neck.
      const wrist = new THREE.Vector3(side * (.115 - squeeze * .045), throatY - .2 + jolt * .025, .625 + jolt * .025);
      reachWrist(i, wrist, new THREE.Vector3(-side * .13 * squeeze, .67, .74).normalize());
      const targetArm = arm.quaternion.clone(), targetElbow = elbows[i].quaternion.clone(), targetHand = hands[i].quaternion.clone();
      const restArm = pose.find(rest => rest.object === arm).rotation;
      const restElbow = pose.find(rest => rest.object === elbows[i]).rotation;
      const restHand = pose.find(rest => rest.object === hands[i]).rotation;
      arm.quaternion.setFromEuler(restArm).slerp(targetArm, reach);
      elbows[i].quaternion.setFromEuler(restElbow).slerp(targetElbow, reach);
      hands[i].quaternion.setFromEuler(restHand).slerp(targetHand, reach);
    });
    group.updateMatrixWorld(true);
  }
  const metadata = {
    design: 'user-concept-andarilho', height: 2.1, facing: '+z',
    capture,
    features: [...featureNames],
    description: 'Emaciated bandaged wanderer with hollow face, exposed ribs, mauve ragged cape, patched shorts, waist cords, backpack and sheathed machete.',
  };
  group.userData.design = metadata.design;
  group.userData.height = metadata.height;
  return { group, arms, legs, rig: { pelvis, torso, head, cape, elbows, hands, knees, feet, captureGrip }, animate, animateCapture, resetPose, metadata };
}
