import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * The concept's unmistakable face, sculpted in geometry rather than a billboard.
 * Coordinates are metres, facing +Z; attach at approximately (0, 1.91, .03).
 */
export function createWandererHead(THREE, palette = {}) {
  const head = new THREE.Group();
  head.name = 'andarilho-cabeca';
  const fallback = (name, color, extra = {}) => palette[name] || new THREE.MeshStandardMaterial({ color, roughness: .96, ...extra });
  const skin = fallback('skin', 0xa58d72);
  const bone = fallback('bone', 0xc1ab8c);
  const shadow = fallback('skinShadow', 0x665347);
  const wound = fallback('wound', 0x51302d);
  const black = fallback('black', 0x100e0c);
  const teeth = fallback('teeth', 0xb3a16b);
  const eye = new THREE.MeshStandardMaterial({ color: 0x211e18, roughness: .16 });
  const glint = new THREE.MeshStandardMaterial({ color: 0xafa58a, roughness: .2 });
  const tongue = new THREE.MeshStandardMaterial({ color: 0x774941, roughness: .82 });
  const semanticParts = [];

  function add(geometry, material, position = [0, 0, 0], scale = [1, 1, 1], rotation = [0, 0, 0], label) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    mesh.scale.set(...scale);
    mesh.rotation.set(...rotation);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    head.add(mesh);
    if (label) semanticParts.push(label);
    return mesh;
  }

  const ellipsoid = (material, position, scale, label, rotation) => add(new THREE.SphereGeometry(1, 8, 5), material, position, scale, rotation, label);

  function tendon(a, b, radius, material, label) {
    const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b);
    const delta = to.clone().sub(from);
    const mesh = add(new THREE.CylinderGeometry(radius * .66, radius, delta.length(), 5), material, from.clone().add(to).multiplyScalar(.5).toArray(), undefined, undefined, label);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
    return mesh;
  }

  function line(points, radius, material, label) {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
    return add(new THREE.TubeGeometry(curve, Math.max(3, points.length * 2), radius, 4, false), material, undefined, undefined, undefined, label);
  }

  function loop(cx, cy, z, rx, ry, tube, material, rotation = 0, label) {
    const positions = [], normals = [], uvs = [], indices = [];
    const majorSegments = 18, minorSegments = 5;
    const cosine = Math.cos(rotation), sine = Math.sin(rotation);
    for (let i = 0; i <= majorSegments; i++) {
      const a = i / majorSegments * Math.PI * 2;
      // Small anatomical irregularities stop the orbital and lip contours
      // reading as mechanically perfect circles in close-up.
      const irregular = 1 + Math.sin(a * 3 + .7) * .035;
      for (let j = 0; j <= minorSegments; j++) {
        const b = j / minorSegments * Math.PI * 2;
        const x = Math.cos(a) * (rx * irregular + Math.cos(b) * tube);
        const y = Math.sin(a) * (ry * irregular + Math.cos(b) * tube);
        positions.push(cx + x * cosine - y * sine, cy + x * sine + y * cosine, z + Math.sin(b) * tube + .003 * Math.cos(a));
        normals.push(Math.cos(a) * Math.cos(b), Math.sin(a) * Math.cos(b), Math.sin(b));
        uvs.push(i / majorSegments, j / minorSegments);
        if (i < majorSegments && j < minorSegments) {
          const p = i * (minorSegments + 1) + j, n = p + minorSegments + 1;
          indices.push(p, n, p + 1, p + 1, n, n + 1);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return add(geometry, material, undefined, undefined, undefined, label);
  }

  // Hand-shaped cranial rings: narrow temples and a slightly lopsided bald dome.
  // Front triangles are removed around both sockets, creating real recesses.
  const rings = [
    [-.051, .075, .059, .062], [-.018, .100, .078, .080],
    [.025, .111, .089, .092], [.071, .113, .090, .096],
    [.116, .098, .077, .082], [.153, .065, .046, .052],
    [.177, .013, .008, .010],
  ];
  const positions = [], uvs = [], indices = [];
  const segments = 28;
  for (let row = 0; row < rings.length; row++) {
    const [y, width, front, back] = rings[row];
    for (let j = 0; j <= segments; j++) {
      const angle = j / segments * Math.PI * 2;
      const sx = Math.sin(angle), cz = Math.cos(angle);
      const asymmetry = 1 + .018 * Math.sin(angle * 3 + row * .4);
      positions.push(sx * width * asymmetry, y + .002 * Math.sin(angle * 2 + row), cz * (cz >= 0 ? front : back) - .011);
      uvs.push(j / segments, row / (rings.length - 1));
    }
  }
  function socketHole(a, b, c) {
    const x = (positions[a * 3] + positions[b * 3] + positions[c * 3]) / 3;
    const y = (positions[a * 3 + 1] + positions[b * 3 + 1] + positions[c * 3 + 1]) / 3;
    const z = (positions[a * 3 + 2] + positions[b * 3 + 2] + positions[c * 3 + 2]) / 3;
    return z > .032 && [-1, 1].some(side => ((x - side * .052) / .033) ** 2 + ((y - .050) / .043) ** 2 < 1.08);
  }
  for (let row = 0; row < rings.length - 1; row++) {
    for (let j = 0; j < segments; j++) {
      const a = row * (segments + 1) + j, b = a + segments + 1;
      for (const tri of [[a, a + 1, b], [a + 1, b + 1, b]]) if (!socketHole(...tri)) indices.push(...tri);
    }
  }
  const skull = new THREE.BufferGeometry();
  skull.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  skull.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  skull.setIndex(indices);
  skull.computeVertexNormals();
  add(skull, skin, undefined, undefined, undefined, 'bald sculpted skull');

  function skullSurfaceZ(x, y) {
    let lower = rings[0], upper = rings[1];
    for (let i = 0; i < rings.length - 1; i++) if (y >= rings[i][0] && y <= rings[i + 1][0]) { lower = rings[i]; upper = rings[i + 1]; break; }
    const t = THREE.MathUtils.clamp((y - lower[0]) / (upper[0] - lower[0]), 0, 1);
    const width = THREE.MathUtils.lerp(lower[1], upper[1], t);
    const depth = THREE.MathUtils.lerp(lower[2], upper[2], t);
    return depth * Math.sqrt(Math.max(0, 1 - (x / width) ** 2)) - .010;
  }

  function orbitalSkin(side, y) {
    const verts = [], uv = [], faces = [];
    const n = 18, rotation = -side * .13;
    const cs = Math.cos(rotation), sn = Math.sin(rotation);
    for (let row = 0; row < 3; row++) {
      const blend = row / 2;
      for (let i = 0; i <= n; i++) {
        const a = i / n * Math.PI * 2;
        const dx = Math.cos(a) * (.032 + blend * .015);
        const dy = Math.sin(a) * (.044 + blend * .017);
        const x = side * .052 + dx * cs - dy * sn;
        const yy = y + dx * sn + dy * cs;
        verts.push(x, yy, THREE.MathUtils.lerp(.073, skullSurfaceZ(x, yy), blend));
        uv.push(i / n, blend);
        if (row < 2 && i < n) {
          const p = row * (n + 1) + i, next = p + n + 1;
          faces.push(p, next, p + 1, p + 1, next, next + 1);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.setIndex(faces);
    geometry.computeVertexNormals();
    add(geometry, skin, undefined, undefined, undefined, 'orbital skin blended into temples');
  }

  // Actual dark recesses sit behind projecting bone. Small wet-looking eyes
  // remain mostly swallowed by the sockets, with no supernatural eye emission.
  for (const side of [-1, 1]) {
    const x = side * .052, y = side < 0 ? .050 : .054;
    orbitalSkin(side, y);
    ellipsoid(black, [x, y, .041], [.033, .044, .018], 'sunken eye socket');
    loop(x, y, .073, .032, .044, .007, shadow, -side * .13);
    loop(x, y + .003, .077, .035, .047, .0045, skin, -side * .13);
    ellipsoid(eye, [x - side * .002, y + .005, .064], [.011, .0125, .010], 'small recessed eye');
    ellipsoid(black, [x - side * .001, y + .005, .073], [.0064, .007, .002]);
    ellipsoid(glint, [x - .003, y + .009, .075], [.0018, .0016, .001]);
    // Brows furrow toward the forehead; cheekbones and the drooping lower lid
    // emphasize exhaustion rather than an expression of confident aggression.
    line([[side * .015, .101, .079], [side * .036, .108, .081], [side * .067, .097, .077], [side * .090, .074, .059]], .006, bone, 'furrowed brow');
    line([[side * .018, .110, .075], [side * .035, .118, .071], [side * .068, .107, .067]], .0022, shadow);
    line([[side * .023, .012, .083], [side * .054, .000, .075], [side * .080, .020, .059]], .0045, bone, 'drooping eyelid');
    ellipsoid(bone, [side * .082, -.025, .050], [.023, .025, .022], 'projecting cheekbone', [0, 0, side * .35]);
    line([[side * .087, -.004, .068], [side * .069, -.032, .082], [side * .072, -.071, .066]], .0035, shadow);
    line([[side * .104, .012, .033], [side * .103, -.031, .031], [side * .086, -.067, .043]], .004, skin);
    // Ears remain small and shrivelled against the back of the jaw.
    ellipsoid(shadow, [side * .111, -.016, -.005], [.012, .026, .014], 'shrunken ear');
    ellipsoid(skin, [side * .112, -.012, .001], [.009, .024, .010]);
    ellipsoid(shadow, [side * .116, -.012, .008], [.004, .014, .005]);
  }

  // Pitted forehead grooves and the sunken nasal bridge.
  line([[-.011, .105, .079], [-.008, .131, .059], [.007, .139, .051], [.017, .119, .071]], .0021, shadow);
  line([[-.049, .135, .051], [-.021, .148, .045], [.010, .153, .040], [.044, .140, .049]], .0018, shadow);
  line([[-.061, .121, .064], [-.039, .134, .059], [-.014, .139, .054]], .0016, bone);
  ellipsoid(bone, [.002, .011, .086], [.014, .045, .021], 'skeletal nasal bridge', [.14, 0, -.06]);
  ellipsoid(skin, [.003, -.023, .103], [.020, .013, .017]);
  for (const side of [-1, 1]) {
    ellipsoid(black, [.003 + side * .011, -.028, .115], [.006, .010, .0035], 'collapsed nostril', [0, 0, side * .31]);
    tendon([side * .016, -.028, .101], [side * .050, -.060, .087], .005, skin);
    line([[side * .026, -.025, .093], [side * .044, -.041, .085], [side * .058, -.074, .081]], .0025, shadow);
  }

  // The vertically gaping mouth is the main silhouette cue in the reference.
  // A physical cavity, stretched lips, irregular dental arches and a sagging
  // jaw hold up from profile as well as face-on.
  ellipsoid(wound, [.003, -.125, .043], [.068, .087, .037], 'gaping mouth cavity');
  ellipsoid(black, [.003, -.120, .068], [.054, .077, .017]);
  loop(.003, -.122, .071, .065, .087, .010, skin, -.025, 'stretched skin around mouth');
  loop(.003, -.122, .081, .058, .080, .006, wound, -.025, 'cracked dark lips');
  for (const side of [-1, 1]) {
    const outline = [
      [side * .087, -.029, .047], [side * .085, -.063, .008],
      [side * .059, -.169, -.001], [side * .039, -.205, .031],
      [side * .046, -.184, .065], [side * .065, -.104, .063],
      [side * .074, -.056, .061],
    ];
    const patchPositions = [side * .065, -.111, .032, ...outline.flat()];
    const patchIndices = [];
    for (let i = 0; i < outline.length; i++) {
      const next = (i + 1) % outline.length + 1;
      patchIndices.push(...(side > 0 ? [0, next, i + 1] : [0, i + 1, next]));
    }
    const patch = new THREE.BufferGeometry();
    patch.setAttribute('position', new THREE.Float32BufferAttribute(patchPositions, 3));
    patch.setAttribute('uv', new THREE.Float32BufferAttribute(patchPositions.flatMap((_, i) => i % 3 === 0 ? [patchPositions[i] * 4 + .5, patchPositions[i + 1] * 2 + .5] : []), 2));
    patch.setIndex(patchIndices);
    patch.computeVertexNormals();
    add(patch, skin, undefined, undefined, undefined, 'stretched gaunt cheek skin');
    tendon([side * .082, -.047, .036], [side * .049, -.195, .041], .014, skin, 'elongated jaw');
    tendon([side * .071, -.058, .056], [side * .043, -.198, .065], .006, bone);
    line([[side * .073, -.070, .060], [side * .065, -.117, .053], [side * .049, -.164, .058]], .0028, shadow);
    line([[side * .086, -.055, .028], [side * .081, -.110, .019], [side * .057, -.175, .036]], .0022, shadow);
  }
  ellipsoid(bone, [.002, -.208, .041], [.044, .018, .034], 'long gaunt chin');
  line([[-.029, -.213, .066], [.001, -.218, .070], [.028, -.212, .066]], .0022, shadow);

  // Upper and lower teeth do not form a neat continuous white fence.
  const toothPositions = [-.046, -.032, -.017, -.003, .012, .028, .043];
  for (let i = 0; i < toothPositions.length; i++) {
    const x = toothPositions[i], arch = Math.abs(x) / .046;
    const upperY = -.052 - arch * .014;
    const lowerY = -.192 + arch * .020;
    const z = .101 - arch * .018;
    const length = .013 + (i % 3) * .003;
    if (i !== 5) {
      const upper = add(new THREE.CylinderGeometry(.0055, .0043, length, 5), teeth, [x, upperY - length * .35, z], [1, 1, .8], [0, 0, (i % 2 ? 1 : -1) * .12], 'irregular upper teeth');
      upper.rotation.x = -.2;
    }
    if (i !== 1) add(new THREE.CylinderGeometry(.004, .0055, length * .85, 5), teeth, [x + .002, lowerY + length * .35, z - .002], [1, 1, .8], [.23, 0, (i % 2 ? -1 : 1) * .10], 'irregular lower teeth');
  }
  ellipsoid(tongue, [.004, -.166, .087], [.032, .012, .013], 'tongue');
  line([[.003, -.159, .097], [.003, -.169, .099], [.006, -.175, .093]], .0016, wound);

  // Neck folds and tendons join the jaw without a smooth mannequin cylinder.
  ellipsoid(skin, [.001, -.149, -.035], [.039, .070, .027], 'back of gaunt neck');
  ellipsoid(skin, [.001, -.226, -.016], [.034, .049, .035], 'gaunt neck');
  for (const side of [-1, 1]) {
    tendon([side * .062, -.145, -.002], [side * .027, -.270, .016], .006, bone, 'neck tendon');
    line([[side * .032, -.207, .012], [side * .029, -.240, .021], [side * .019, -.267, .025]], .0022, shadow);
  }
  for (let i = 0; i < 3; i++) {
    const y = -.226 - i * .012;
    line([[-.027, y, .011], [0, y - .004, .023], [.027, y + .002, .009]], .0028, bone, 'neck fold');
  }

  // Collapse all static facial details by material. The rig only needs to move
  // the head as one piece, so individual teeth and wrinkles cost no draw calls.
  const batches = new Map();
  for (const mesh of [...head.children]) {
    mesh.updateMatrix();
    const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    geometry.applyMatrix4(mesh.matrix);
    const colors = [];
    const position = geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) {
      if (mesh.material === skin || mesh.material === bone) {
        const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
        const organic = Math.sin(x * 63 + Math.sin(y * 47) * 1.9 + z * 31) * Math.sin(y * 91 - z * 53);
        const value = .955 + organic * .045;
        colors.push(value, value - Math.max(0, organic) * .012, value - Math.max(0, organic) * .023);
      } else colors.push(1, 1, 1);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const batch = batches.get(mesh.material) || [];
    batch.push(geometry);
    batches.set(mesh.material, batch);
    head.remove(mesh);
    mesh.geometry.dispose();
  }
  for (const [material, geometries] of batches) {
    const geometry = mergeGeometries(geometries, false);
    for (const input of geometries) input.dispose();
    if (!geometry) throw new Error('Não foi possível combinar os detalhes da cabeça do Andarilho.');
    geometry.computeBoundingSphere();
    const surface = material === skin || material === bone ? material.clone() : material;
    if (surface !== material) surface.vertexColors = true;
    const mesh = new THREE.Mesh(geometry, surface);
    mesh.name = 'andarilho-detalhes-cabeca';
    mesh.castShadow = mesh.receiveShadow = true;
    head.add(mesh);
  }
  head.userData = {
    reference: 'Design do Andarilho fornecido pelo usuário',
    semanticParts: [...new Set(semanticParts)],
    facing: '+Z',
    noEmissiveEyes: true,
  };
  return head;
}
