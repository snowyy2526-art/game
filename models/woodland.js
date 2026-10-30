/** Shared visual language for the woodland and Flora Tímida. No DOM or assets. */
export const WOODLAND_PALETTE = Object.freeze({
  bark: '#6b4b35', barkLight: '#937254', barkDark: '#36281f',
  leaf: '#72734a', leafDark: '#454d30', leafDry: '#8a7850',
});

/** A low-cost, root-flared broadleaf tree, grounded and normalised to height. */
export function createWoodlandTreeGeometry(THREE, { seed = 1, height = 5.8, lowDetail = false } = {}) {
  let state = seed >>> 0;
  const random = () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; };
  const between = (a, b) => a + random() * (b - a);
  const positions = [], colors = [];
  const palette = Object.fromEntries(Object.entries(WOODLAND_PALETTE).map(([key, value]) => [key, new THREE.Color(value)]));
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  const tint = color => color.clone().multiplyScalar(between(.86, 1.12));
  function triangle(a, b, c, color) {
    for (const p of [a, b, c]) { positions.push(p.x, p.y, p.z); colors.push(color.r, color.g, color.b); }
  }
  function segment(a, b, r1, r2, color = palette.bark, sides = 3) {
    const axis = b.clone().sub(a).normalize();
    const ref = Math.abs(axis.y) > .9 ? v(1, 0, 0) : v(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(axis, ref).normalize();
    const forward = new THREE.Vector3().crossVectors(axis, right).normalize();
    const rings = [a, b].map((center, ring) => Array.from({ length: sides }, (_, i) => {
      const angle = i / sides * Math.PI * 2;
      return center.clone().addScaledVector(right, Math.cos(angle) * (ring ? r2 : r1))
        .addScaledVector(forward, Math.sin(angle) * (ring ? r2 : r1));
    }));
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides, colorVariation = tint(color);
      triangle(rings[0][i], rings[1][i], rings[0][j], colorVariation);
      triangle(rings[0][j], rings[1][i], rings[1][j], colorVariation);
    }
  }
  function leaf(center, length, angle, tilt, color) {
    const along = v(Math.cos(angle) * length * .5, tilt * length, Math.sin(angle) * length * .5);
    const across = v(-Math.sin(angle) * length * .24, length * .08, Math.cos(angle) * length * .24);
    const base = center.clone().sub(along), tip = center.clone().add(along);
    triangle(base, center.clone().add(across), tip, tint(color));
    triangle(base, tip, center.clone().sub(across), tint(color));
  }
  const bend = between(-.20, .20), twist = between(-.15, .15);
  const baseRadius = between(.21, .29);
  const rings = [];
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    rings.push({ center: v(bend * Math.sin(t * 4.6) * t, t * 3.9, twist * Math.sin(t * 5.1) * t), radius: baseRadius * (1 - .65 * t) });
  }
  for (let i = 0; i < rings.length - 1; i++) segment(rings[i].center, rings[i + 1].center, rings[i].radius, rings[i + 1].radius, palette.bark, lowDetail ? 4 : 6);
  // Roots spread like Flora's planted toes instead of terminating in a pole.
  const rootCount = lowDetail ? 3 : 5;
  for (let i = 0; i < rootCount; i++) {
    const a = i / rootCount * Math.PI * 2 + between(-.2, .2);
    segment(v(Math.cos(a) * .12, .35, Math.sin(a) * .12), v(Math.cos(a) * between(.48, .7), .015, Math.sin(a) * between(.48, .7)), .13, .018, palette.bark, 3);
  }
  // A forked, irregular crown and hanging leaf sprigs mimic the raised-arm pose.
  const phase = between(0, Math.PI * 2);
  for (let i = 0; i < (lowDetail ? 3 : 4); i++) {
    const angle = phase + i * 2.399 + between(-.3, .3);
    const origin = rings[3 + i % 2].center.clone();
    const elbow = v(Math.cos(angle) * between(.55, .82), between(3.65, 4.2), Math.sin(angle) * between(.55, .82));
    const fork = v(Math.cos(angle) * between(.9, 1.35), between(4.4, 5.15), Math.sin(angle) * between(.9, 1.35));
    const tip = fork.clone().add(v(Math.cos(angle + .3) * .32, between(.28, .55), Math.sin(angle + .3) * .32));
    segment(origin, elbow, .095, .065, palette.bark, 3);
    segment(elbow, fork, .065, .031, palette.bark, 3);
    segment(fork, tip, .031, .005, palette.barkLight, 3);
    const sideTip = elbow.clone().lerp(fork, .6).add(v(Math.cos(angle + 1.05) * .58, .25, Math.sin(angle + 1.05) * .58));
    segment(elbow, sideTip, .038, .006, palette.bark, 3);
    for (let sprig = 0; sprig < 2; sprig++) {
      const attach = sprig ? sideTip : fork;
      const twig = attach.clone().add(v(between(-.25, .25), between(-.25, .25), between(-.25, .25)));
      segment(attach, twig, .013, .003, palette.barkDark, 3);
      for (let j = 0; j < (lowDetail ? 3 : 5); j++) {
        const t = j / 5;
        const center = attach.clone().lerp(twig, t).add(v(between(-.23, .23), between(-.14, .18), between(-.23, .23)));
        leaf(center, between(.19, .34), angle + j * 1.5, between(-.3, .2), [palette.leaf, palette.leafDark, palette.leafDry][(i + j) % 3]);
      }
    }
  }
  // Low drooping foliage breaks up silhouettes at Flora's shoulder height.
  for (let i = 0; i < (lowDetail ? 2 : 6); i++) {
    const a = phase + i * 2.4;
    leaf(v(Math.cos(a) * .30, 2.25 + i * .16, Math.sin(a) * .30), .28, a, -.4, palette.leafDark);
  }
  // Almond-shaped knots are a natural repeated motif, making Flora's eyes subtle.
  for (let i = 0; i < (lowDetail ? 0 : 3); i++) {
    const angle = phase + i * 2.6, y = 1.15 + i * .82;
    const t = y / 3.9, radius = baseRadius * (1 - .65 * t) + .008;
    const normal = v(Math.sin(angle), 0, Math.cos(angle));
    const across = v(Math.cos(angle), 0, -Math.sin(angle));
    const center = v(bend * Math.sin(t * 4.6) * t, y, twist * Math.sin(t * 5.1) * t).addScaledVector(normal, radius);
    const inner = center.clone().addScaledVector(normal, .004);
    const edge = [], inside = [];
    for (let n = 0; n < 8; n++) {
      const a = n / 8 * Math.PI * 2;
      edge.push(center.clone().addScaledVector(across, Math.sin(a) * .055).add(v(0, Math.cos(a) * .14, 0)));
      inside.push(inner.clone().addScaledVector(across, Math.sin(a) * .030).add(v(0, Math.cos(a) * .105, 0)));
    }
    for (let n = 0; n < 8; n++) {
      const j = (n + 1) % 8;
      triangle(edge[n], inside[n], edge[j], palette.barkLight);
      triangle(edge[j], inside[n], inside[j], palette.barkLight);
      triangle(inside[n], inner.clone().addScaledVector(normal, -.004), inside[j], palette.barkDark);
    }
  }
  // A handful of wood-grain seams winding around the irregular trunk.
  for (let i = 0; i < (lowDetail ? 0 : 4); i++) {
    const a = phase + i * Math.PI / 2;
    const p = rings[1].center.clone().add(v(Math.sin(a) * rings[1].radius, 0, Math.cos(a) * rings[1].radius));
    const q = rings[4].center.clone().add(v(Math.sin(a + .5) * rings[4].radius, 0, Math.cos(a + .5) * rings[4].radius));
    const r = q.clone().add(v(.009, 0, .006));
    triangle(p, q, r, palette.barkDark);
  }
  let maxY = 0;
  for (let i = 1; i < positions.length; i += 3) maxY = Math.max(maxY, positions[i]);
  const scale = height / maxY;
  for (let i = 0; i < positions.length; i++) positions[i] = i % 3 === 1 ? Math.max(0, positions[i] * scale) : positions[i] * scale;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  geometry.userData = { seed, height, trunkRadius: baseRadius * scale, trunkHeight: 3.9 * scale, lowDetail, type: 'crooked-broadleaf' };
  return geometry;
}
