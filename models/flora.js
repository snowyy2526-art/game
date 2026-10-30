import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WOODLAND_PALETTE } from './woodland.js';

/**
 * A 4.5 m wooden humanoid based on the supplied Flora Tímida concept.
 * Her raised arms and joined legs become the same sort of forked tree found
 * around her. Every surface is geometry and vertex colour, including the knots.
 */
export function createFloraModel(THREE) {
  const group = new THREE.Group();
  group.name = 'flora-timida-concept-model';
  const palette = Object.fromEntries(Object.entries(WOODLAND_PALETTE).map(([key, value]) => [key, new THREE.Color(value)]));
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 1, side: THREE.DoubleSide });
  material.name = 'flora-shared-woodland-surfaces';
  const features = new Set();
  const shells = [];
  let sequence = 0;
  let camouflagedState = false;

  function joint(name, parent, x = 0, y = 0, z = 0) {
    const node = new THREE.Group(); node.name = name; node.position.set(x, y, z); parent.add(node); return node;
  }
  function shell(name, parent) { const node = joint(name, parent); shells.push(node); return node; }
  function tinted(geometry, kind = 'bark', salt = 0) {
    if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
    const position = geometry.getAttribute('position');
    const colors = new Float32Array(position.count * 3);
    const base = palette[kind] || palette.bark;
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
      const grain = Math.sin(y * 13 + Math.sin(x * 18 + salt) + z * 16) * .055;
      const broad = Math.sin(x * 6 + y * 4 + z * 8 + salt) * .07;
      const color = base.clone();
      if (kind.startsWith('bark')) {
        const dark = Math.max(0, Math.sin(x * 31 + z * 29 + Math.sin(y * 3 + salt))) * .19;
        color.multiplyScalar(.94 + grain + broad - dark);
      } else color.multiplyScalar(.91 + grain + broad);
      colors.set([color.r, color.g, color.b], i * 3);
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geometry;
  }
  function add(name, parent, geometry, kind = 'bark', position, rotation, scale) {
    const object = new THREE.Mesh(tinted(geometry, kind, sequence++ * .73), material);
    object.name = name;
    if (position) object.position.set(...position);
    if (rotation) object.rotation.set(...rotation);
    if (scale) object.scale.set(...scale);
    object.castShadow = object.receiveShadow = true;
    parent.add(object); features.add(name); return object;
  }
  function ellipsoid(name, parent, kind, position, scale, rotation) {
    return add(name, parent, new THREE.SphereGeometry(1, 9, 6), kind, position, rotation, scale);
  }
  function branch(name, parent, points, startRadius, endRadius = startRadius * .4, kind = 'bark', segments = 9, radial = 7) {
    const path = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
    const frames = path.computeFrenetFrames(segments, false);
    const vertices = [], indices = [];
    const salt = sequence * .39;
    for (let row = 0; row <= segments; row++) {
      const t = row / segments, center = path.getPointAt(t);
      const radius = THREE.MathUtils.lerp(startRadius, endRadius, t) * (1 + Math.sin(t * 9 + salt) * .08);
      for (let col = 0; col <= radial; col++) {
        const angle = col / radial * Math.PI * 2 + t * .9;
        const ridge = 1 + .12 * Math.sin(angle * 3 + t * 6 + salt);
        const point = center.clone()
          .addScaledVector(frames.normals[row], Math.cos(angle) * radius * ridge)
          .addScaledVector(frames.binormals[row], Math.sin(angle) * radius * ridge);
        vertices.push(point.x, point.y, point.z);
        if (row < segments && col < radial) {
          const a = row * (radial + 1) + col, b = a + radial + 1;
          indices.push(a, b, a + 1, a + 1, b, b + 1);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    return add(name, parent, geometry, kind);
  }
  function leaf(name, parent, at, angle, size = .22, kind = 'leaf') {
    // A folded pointed blade, not an opaque spherical canopy.
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([
      0, 0, 0, -.32 * size, .46 * size, 0, 0, .49 * size, .10 * size,
      0, size, 0, .32 * size, .48 * size, 0,
    ], 3));
    geometry.setIndex([0, 1, 2, 1, 3, 2, 3, 4, 2, 4, 0, 2]);
    geometry.computeVertexNormals();
    return add(name, parent, geometry, kind, at, angle);
  }
  function leafSpray(name, parent, from, to, count = 6, size = .23) {
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
    for (let i = 0; i < count; i++) {
      const t = .2 + .75 * i / Math.max(1, count - 1), point = a.clone().lerp(b, t);
      const turn = i * 2.399 + sequence * .2;
      point.x += Math.cos(turn) * .07; point.z += Math.sin(turn) * .07;
      leaf(`${name}-${i}`, parent, point.toArray(), [.3 + Math.sin(turn) * .8, turn, Math.cos(turn) * .75], size * (.8 + (i % 3) * .12), i % 4 === 0 ? 'leafDry' : i % 3 === 0 ? 'leafDark' : 'leaf');
    }
  }
  function knot(name, parent, x, y, z, rx = .07, ry = .14, tilt = 0) {
    const rim = [];
    for (let i = 0; i <= 20; i++) {
      const angle = i / 20 * Math.PI * 2;
      const px = Math.sin(angle) * rx * (1 + .09 * Math.sin(angle * 3));
      const py = Math.cos(angle) * ry;
      rim.push([x + px * Math.cos(tilt) - py * Math.sin(tilt), y + px * Math.sin(tilt) + py * Math.cos(tilt), z + .018 * Math.cos(angle * 2)]);
    }
    ellipsoid(`${name}-dark-hollow`, parent, 'barkDark', [x, y, z - .011], [rx * .81, ry * .88, .015], [0, 0, tilt]);
    branch(`${name}-raised-grain`, parent, rim, .012, .012, 'barkLight', 20, 5);
    branch(`${name}-inner-slit`, parent, [[x, y - ry * .5, z + .006], [x + .006, y, z + .009], [x, y + ry * .48, z + .005]], .009, .004, 'bark', 5, 5);
  }

  // Normalize the sculpt to the reference's 4.5 m active silhouette. Keeping
  // this inside the model leaves the AI-owned world transform untouched.
  const figure = joint('flora-figure', group, 0, -.04, 0);
  figure.scale.setScalar(.9665);
  const pelvis = joint('rooted-pelvis-rig', figure, 0, 2.07, 0);
  const pelvisShell = shell('rooted-hip-shell', pelvis);
  branch('twisted-wooden-pelvis', pelvisShell, [[-.04, -.18, 0], [0, -.02, .01], [.025, .18, -.01]], .21, .22, 'bark', 8, 10);
  const torso = joint('gnarled-torso-rig', pelvis);
  const torsoShell = shell('gnarled-torso-shell', torso);
  branch('tapered-living-trunk', torsoShell, [[0, 0, 0], [.035, .42, -.02], [-.015, .89, .015], [-.025, 1.26, 0], [-.005, 1.47, .015]], .235, .145, 'bark', 15, 13);
  for (let i = 0; i < 8; i++) {
    const theta = i / 8 * Math.PI * 2;
    const points = [];
    for (let row = 0; row < 6; row++) {
      const y = row * .255, angle = theta + y * .7;
      const radius = .21 + Math.sin(y * 2) * .025;
      points.push([Math.cos(angle) * radius, y, Math.sin(angle) * radius]);
    }
    branch(`interwoven-bark-tendon-${i}`, torsoShell, points, .025 + (i % 2) * .009, .013, i % 3 ? 'barkLight' : 'barkDark', 11, 5);
  }
  for (const [x, y, z, ry, tilt] of [[-.08,.22,.21,.17,-.13],[.08,.58,.23,.15,.18],[-.10,.95,.21,.12,-.25],[.06,1.22,.16,.11,.12]]) {
    knot('torso-eye-like-knot', torsoShell, x, y, z, .055, ry, tilt);
  }
  const backKnots=joint('back-bark-knots',torsoShell);backKnots.rotation.y=Math.PI;
  knot('back-grain-knot-low',backKnots,.02,.42,.22,.042,.12,-.12);
  knot('back-grain-knot-high',backKnots,-.055,1.03,.18,.045,.10,.17);
  branch('left-shoulder-fork', torsoShell, [[-.03, 1.23, .01], [-.23, 1.25, .02], [-.36, 1.19, 0]], .13, .105, 'bark', 7, 8);
  branch('right-shoulder-fork', torsoShell, [[-.03, 1.23, .01], [.22, 1.29, -.01], [.36, 1.22, 0]], .13, .105, 'bark', 7, 8);

  const head = joint('bark-mask-head-rig', torso, -.015, 1.5, .025);
  const headShell = shell('bark-mask-head-shell', head);
  branch('elongated-tree-mask', headShell, [[.01, -.25, -.015], [-.015, -.03, 0], [.01, .21, -.025], [-.025, .37, -.04]], .115, .07, 'bark', 10, 11);
  ellipsoid('deep-face-grain', headShell, 'barkDark', [0, .02, .105], [.12, .24, .022]);
  for (const side of [-1, 1]) {
    knot(`hollow-eye-mark-${side}`, headShell, side * .073, .11 + side * .012, .125, .035, .072, -side * .21);
    branch(`slanted-brow-${side}`, headShell, [[side * .025,.20,.12],[side * .09,.21,.125],[side * .145,.16,.075]], .021,.008,'barkLight',6,5);
    branch(`mask-cheek-ridge-${side}`, headShell, [[side*.13,.06,.07],[side*.09,-.08,.13],[side*.045,-.23,.09]], .025,.012,'barkLight',7,5);
  }
  knot('small-hollow-mouth', headShell, -.005, -.13, .117, .032, .075, -.08);
  branch('split-nasal-grain', headShell, [[.005,.12,.14],[-.006,.01,.16],[.012,-.055,.13]], .015,.007,'bark',5,5);
  const crown = joint('twig-crown-rig', head);
  const crownShell = shell('twig-crown-shell', crown);
  for (let i = 0; i < 9; i++) {
    const theta = i * 2.399, spread = .3 + (i % 3) * .13;
    const x = Math.cos(theta) * spread, z = Math.sin(theta) * spread;
    const top = .72 + (i % 4) * .065;
    branch(`antler-like-crown-${i}`, crownShell, [[Math.cos(theta)*.055,.21,Math.sin(theta)*.055],[x*.55,.50,z*.55],[x,top,z],[x*1.17,top+.055,z*1.10]], .036,.006,i%3?'bark':'barkLight',8,6);
    branch(`crown-fork-${i}`, crownShell, [[x*.55,.50,z*.55],[x*.62+.16,.59,z*.75-.06],[x*.9+.21,.70,z*1.1-.07]],.018,.003,'bark',6,5);
    if(i%2===0)leafSpray(`crown-olive-leaves-${i}`,crownShell,[x*.55,.50,z*.55],[x,top,z],5,.23);
  }

  const legs=[],knees=[],feet=[];
  for(const side of [-1,1]) {
    const leg=joint(`root-leg-${side}`,pelvis,side*.18,-.05,0);legs.push(leg);
    const thighShell=shell(`wooden-thigh-shell-${side}`,leg);
    branch(`long-root-thigh-${side}`,thighShell,[[0,0,0],[side*.025,-.38,.015],[side*.035,-.94,-.015]],.13,.087,'bark',10,9);
    branch(`thigh-grain-${side}`,thighShell,[[side*.07,-.05,.065],[side*.09,-.46,.071],[side*.048,-.86,.057]],.025,.015,'barkLight',8,5);
    const knee=joint(`root-knee-${side}`,leg,side*.035,-.94,-.015);knees.push(knee);
    const shinShell=shell(`wooden-shin-shell-${side}`,knee);
    branch(`long-root-shin-${side}`,shinShell,[[0,0,0],[-side*.025,-.45,.015],[-side*.035,-.96,0]],.087,.065,'bark',10,8);
    branch(`shin-grain-${side}`,shinShell,[[side*.035,-.04,.057],[-side*.005,-.43,.072],[-side*.035,-.89,.045]],.018,.01,'barkLight',8,5);
    knot(`shin-eye-knot-${side}`,shinShell,0,-.31,.074,.035,.085,side*.15);
    const foot=joint(`root-foot-${side}`,knee,-side*.035,-.96,0);feet.push(foot);
    const rootShell=shell(`root-flare-shell-${side}`,foot);
    for(let i=0;i<5;i++){
      const a=(i/5*Math.PI*2)+side*.18;
      const x=Math.cos(a)*(.25+(i%2)*.11),z=Math.sin(a)*(.25+(i%2)*.10)+.06;
      branch(`ground-root-${side}-${i}`,rootShell,[[0,.04,0],[x*.45,-.015,z*.5],[x,-.025,z]],.066,.009,'bark',7,6);
    }
  }

  const arms=[],elbows=[],hands=[];
  for(const side of [-1,1]){
    const arm=joint(`branch-arm-${side}`,torso,side*.34,1.24,0);arms.push(arm);
    const upperShell=shell(`upper-branch-shell-${side}`,arm);
    branch(`twisted-upper-arm-${side}`,upperShell,[[0,0,0],[side*.035,-.43,.015],[side*.07,-.95,.04]],.105,.065,'bark',10,8);
    branch(`upper-arm-vine-${side}`,upperShell,[[side*.055,-.04,.07],[side*.08,-.39,.08],[side*.05,-.85,.07]],.019,.009,'barkLight',8,5);
    const elbow=joint(`branch-elbow-${side}`,arm,side*.07,-.95,.04);elbows.push(elbow);
    const lowerShell=shell(`lower-branch-shell-${side}`,elbow);
    branch(`long-forearm-branch-${side}`,lowerShell,[[0,0,0],[side*.04,-.48,.01],[side*.08,-1,.06]],.07,.043,'bark',11,8);
    knot(`forearm-eye-knot-${side}`,lowerShell,side*.03,-.38,.072,.034,.092,-side*.16);
    branch(`elbow-twig-${side}`,lowerShell,[[0,-.06,-.015],[-side*.18,-.21,-.11],[-side*.23,-.36,-.16]],.028,.004,'bark',6,5);
    leafSpray(`elbow-leaves-${side}`,lowerShell,[-side*.13,-.15,-.06],[-side*.23,-.34,-.16],5,.25);
    const hand=joint(`branch-hand-${side}`,elbow,side*.08,-1,.06);hands.push(hand);
    const handShell=shell(`branch-fingers-shell-${side}`,hand);
    branch(`forked-palm-${side}`,handShell,[[0,0,0],[side*.01,-.17,.015],[0,-.29,.03]],.056,.07,'bark',6,8);
    for(let i=0;i<5;i++){
      const x=(i-2)*.065, length=[.49,.61,.68,.60,.47][i];
      const end=[x*2.25,-length,.08+Math.abs(i-2)*.035];
      branch(`long-twig-finger-${side}-${i}`,handShell,[[x*.45,-.17,.015],[x*1.45,-length*.68,.045],end,[end[0]+side*.035,end[1]-.045,end[2]-.025]],.029,.0045,i%2?'bark':'barkLight',8,6);
      if(i===0||i===4) {
        branch(`finger-fork-${side}-${i}`,handShell,[[x*1.45,-length*.68,.045],[x*2.15+side*.13,-length*.85,-.045],[x*2.65+side*.16,-length-.035,-.06]],.012,.0028,'bark',5,5);
        leafSpray(`finger-olive-leaves-${side}-${i}`,handShell,[x*1.4,-length*.66,.05],end,4,.20);
      }
    }
  }

  // Additional foliage on the silhouette continues the ordinary tree style.
  for(const side of [-1,1]){
    branch(`torso-side-twig-${side}`,torsoShell,[[side*.16,.57,-.015],[side*.39,.72,-.08],[side*.51,.93,-.14]],.027,.005,'bark',7,5);
    leafSpray(`torso-leaves-${side}`,torsoShell,[side*.27,.65,-.055],[side*.50,.91,-.14],7,.25);
  }

  for(const node of shells){
    node.updateMatrixWorld(true);
    const inverse=node.matrixWorld.clone().invert(), geometries=[], sourceMeshes=[];
    node.traverse(object=>{
      if(!object.isMesh)return;
      const geometry=object.geometry.index?object.geometry.toNonIndexed():object.geometry.clone();
      geometry.applyMatrix4(inverse.clone().multiply(object.matrixWorld));
      for(const name of Object.keys(geometry.attributes))if(!['position','normal','color'].includes(name))geometry.deleteAttribute(name);
      geometries.push(geometry);sourceMeshes.push(object);
    });
    const geometry=mergeGeometries(geometries,false);
    if(!geometry)throw new Error(`Unable to combine Flora geometry: ${node.name}`);
    for(const object of sourceMeshes){object.removeFromParent();object.geometry.dispose();}
    for(const source of geometries)source.dispose();
    geometry.computeBoundingSphere();
    const mesh=new THREE.Mesh(geometry,material);mesh.name=`${node.name}-batch`;mesh.castShadow=mesh.receiveShadow=true;node.add(mesh);
  }

  function applyPose(camouflaged){
    pelvis.position.set(0,2.07,0);pelvis.rotation.set(0,0,0);
    torso.position.set(0,0,0);torso.rotation.set(camouflaged?0:.12,0,0);
    head.rotation.set(camouflaged?-.035:.055,0,camouflaged?-.025:.075);
    crown.rotation.set(0,0,0);
    for(let i=0;i<2;i++){
      const side=i===0?-1:1;
      legs[i].position.set(side*(camouflaged?.055:.18),-.05,0);
      legs[i].rotation.set(0,camouflaged?side*-.05:side*.04,camouflaged?0:side*-.035);
      knees[i].rotation.set(camouflaged?0:.035,0,0);
      feet[i].rotation.set(0,side*(camouflaged?.07:.20),0);
      arms[i].rotation.set(camouflaged?-.035:.035,camouflaged?side*-.12:0,side*(camouflaged?(i===0?2.63:2.8):.18));
      elbows[i].rotation.set(camouflaged?.025:.08,0,side*(camouflaged?(i===0?-.02:-.08):.035));
      hands[i].rotation.set(camouflaged?-.12:.12,side*.05,side*(camouflaged?.035:-.035));
    }
  }
  function setCamouflaged(value){camouflagedState=!!value;applyPose(camouflagedState);}
  function resetPose(){camouflagedState=false;applyPose(false);}
  function animate(time,moving,camouflaged=camouflagedState){
    setCamouflaged(camouflaged);
    if(camouflagedState||!moving)return;
    // Low, deliberate hopping: never alter the world position controlled by AI.
    const cycle=time*3.1,hop=Math.max(0,Math.sin(cycle));
    pelvis.position.y+=hop*.075;
    pelvis.rotation.z=Math.sin(cycle*.5)*.025;
    torso.rotation.x+=.10+hop*.045;
    torso.rotation.y=Math.sin(cycle*.5)*.025;
    head.rotation.x+=Math.sin(cycle-.5)*.035;
    for(let i=0;i<2;i++){
      const wave=Math.sin(cycle+i*Math.PI);
      legs[i].rotation.x+=wave*.12;
      knees[i].rotation.x+=Math.max(0,wave)*.19;
      arms[i].rotation.x+=Math.sin(cycle-.7+i)*.08;
      elbows[i].rotation.x+=Math.sin(cycle-1+i)*.055;
      hands[i].rotation.z+=Math.sin(cycle*.7+i)*.055;
    }
  }
  resetPose();
  const metadata={design:'user-concept-flora-timida',height:4.5,camouflagedHeight:5.8,facing:'+Z',features:[...features],noEmissiveEyes:true};
  group.userData.design=metadata.design;group.userData.height=metadata.height;
  return {group,rig:{figure,pelvis,torso,head,crown,arms,elbows,hands,legs,knees,feet},metadata,setCamouflaged,animate,resetPose};
}
