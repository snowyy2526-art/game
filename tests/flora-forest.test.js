import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createFloraModel} from '../models/flora.js';
import {createWoodlandTreeGeometry} from '../models/woodland.js';
import {createWorld} from '../world.js';
import {createEntities} from '../entities.js';

function makeWorld(lowQuality=false){
  const previous=globalThis.document;
  globalThis.document={createElement(){
    const context=new Proxy({},{get:(object,key)=>object[key]??(()=>{})});
    return {width:1,height:1,getContext:()=>context};
  }};
  try{return createWorld(THREE,new THREE.Scene(),{lowQuality});}
  finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
}

function scenario(){
  const entities=createEntities(THREE,new THREE.Scene());
  const flora=entities.list.find(e=>e.id==='flora');
  flora.group.position.set(0,0,-12);
  const deaths=[],sounds=[];
  const ctx={player:new THREE.Vector3(0,1.7,0),cameraDirection:new THREE.Vector3(0,0,-1),phase:'day',day:1,phaseTime:0,noise:0,inside:false,fire:50,entrances:[],bracing:null,time:0,kill:r=>deaths.push(r),sound:name=>sounds.push(name),toast:()=>{},damage:()=>{}};
  const step=seconds=>{for(let remaining=seconds;remaining>.00001;remaining-=.05){const dt=Math.min(.05,remaining);ctx.time+=dt;entities.update(dt,ctx);}};
  return {entities,flora,ctx,step,deaths,sounds};
}

test('Flora stands about 4.5m and raises her branches into a grounded tree silhouette',()=>{
  const flora=createFloraModel(THREE);
  let box=new THREE.Box3().setFromObject(flora.group);
  assert.ok(box.getSize(new THREE.Vector3()).y>4.4&&box.getSize(new THREE.Vector3()).y<4.6);
  assert.ok(Math.abs(box.min.y)<.08);
  flora.setCamouflaged(true);
  box=new THREE.Box3().setFromObject(flora.group);
  assert.ok(box.getSize(new THREE.Vector3()).y>5.3&&box.getSize(new THREE.Vector3()).y<6.2);
  const materials=new Set();
  flora.group.traverse(o=>{if(o.isMesh){materials.add(o.material);assert.ok(o.geometry.attributes.position.array.every(Number.isFinite));}});
  for(const material of materials)assert.ok(!material.emissive||material.emissive.getHex()===0,'glowing eyes would betray camouflage');
});

test('a watched Flora holds every joint still while an unseen Flora uses a low hopping gait',()=>{
  const flora=createFloraModel(THREE);
  flora.group.position.set(-23,0,-19);
  flora.setCamouflaged(true);flora.group.updateMatrixWorld(true);
  const snapshot=[];flora.group.traverse(o=>snapshot.push(o.matrixWorld.toArray()));
  flora.animate(9,true,true);flora.group.updateMatrixWorld(true);
  const watched=[];flora.group.traverse(o=>watched.push(o.matrixWorld.toArray()));
  assert.deepEqual(watched,snapshot,'no breathing, leaf sway or hopping while observed');
  flora.animate(.4,true,false);
  assert.ok(flora.rig.pelvis.position.y>2.07,'movement should produce a small hop');
  assert.equal(flora.group.position.x,-23);assert.equal(flora.group.position.z,-19);
});

test('ordinary tree prototypes have real heights above four metres in both levels of detail',()=>{
  for(const lowDetail of [false,true])for(const seed of [1,2,3,4]){
    const height=4.65+seed*.4;
    const geometry=createWoodlandTreeGeometry(THREE,{seed,height,lowDetail});
    const size=geometry.boundingBox.getSize(new THREE.Vector3());
    assert.ok(size.y>4&&Math.abs(size.y-height)<.00001);
    assert.ok(geometry.attributes.color.count===geometry.attributes.position.count);
    assert.ok(geometry.attributes.position.array.every(Number.isFinite));
    geometry.dispose();
  }
});

test('the denser forest keeps its measured scale and playable routes without excessive tree draws',()=>{
  const world=makeWorld(true);
  assert.ok(world.forestMetrics.treeCount>=700);
  assert.ok(world.forestMetrics.playableTreeCount>=500);
  assert.ok(world.forestMetrics.minHeight>4);
  assert.ok(world.forestMetrics.maxHeight<8);
  assert.ok(world.forestMetrics.treeDrawCalls<=12);
  assert.ok(world.forestMetrics.triangles<350000);
  for(const tree of world.trees){
    const matrix=new THREE.Matrix4();tree.mesh.getMatrixAt(tree.instanceId,matrix);
    const height=tree.mesh.geometry.boundingBox.clone().applyMatrix4(matrix).getSize(new THREE.Vector3()).y;
    assert.ok(height>4&&Math.abs(height-tree.height)<.00001,'instance geometry must match its stated height');
  }
  const paths=[...world.forestPaths,[[0,8],[6.9,8],[6.9,10.9],[0,10.9],[0,2.6]]];
  for(const path of paths)for(let i=1;i<path.length;i++){
    const a=path[i-1],b=path[i],steps=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])*4);
    for(let j=0;j<=steps;j++){
      const x=a[0]+(b[0]-a[0])*j/steps,z=a[1]+(b[1]-a[1])*j/steps;
      assert.ok(!world.obstacles.some(o=>Math.hypot(x-o.x,z-o.z)<o.radius+.28),`blocked path near ${x},${z}`);
    }
  }
  assert.equal(world.resources.length,48);
  world.dispose();
});

test('trunks and cabin walls block sight while actual daytime openings remain visible',()=>{
  const world=makeWorld();
  const tree=world.trees.find(t=>Math.hypot(t.x,t.z)>20&&Math.hypot(t.x,t.z)<40);
  assert.equal(world.isSightBlocked(new THREE.Vector3(tree.x-1.5,1.7,tree.z),new THREE.Vector3(tree.x+1.5,1.7,tree.z)),true);
  assert.equal(world.isSightBlocked(new THREE.Vector3(tree.x-1.5,10,tree.z),new THREE.Vector3(tree.x+1.5,10,tree.z)),false);
  const eye=new THREE.Vector3(0,1.7,0);
  assert.equal(world.isSightBlocked(eye,new THREE.Vector3(0,1.7,8)),false,'open daytime doorway');
  assert.equal(world.isSightBlocked(eye,new THREE.Vector3(8,1.7,0)),false,'window opening');
  assert.equal(world.isSightBlocked(new THREE.Vector3(0,1.7,2),new THREE.Vector3(8,1.7,2)),true,'solid wood beside window');
  world.setPhase('night');
  assert.equal(world.isSightBlocked(eye,new THREE.Vector3(0,1.7,8)),true,'closed night door');
  world.dispose();
});

test('occlusion prevents seeing Flora through a trunk or acquiring a silent player behind it',()=>{
  const {flora,ctx,step}=scenario();
  let blocked=true;ctx.isSightBlocked=()=>blocked;ctx.noise=.9;
  const start=flora.group.position.clone();step(.7);
  assert.ok(flora.group.position.distanceTo(start)>.2,'an unseen Flora follows the sound');
  assert.equal(flora.aware,false,'hearing noise is not visual acquisition');
  blocked=false;ctx.noise=0;
  step(.05);const watched=flora.group.position.clone();step(.7);
  assert.equal(flora.aware,true);
  assert.ok(flora.group.position.distanceTo(watched)<.000001,'the visible creature stops immediately');
});

test('camouflage does not instantly reveal Flora through a distant HUD label',()=>{
  const {entities,flora,ctx,step}=scenario();
  flora.group.position.set(0,0,-7);
  ctx.cameraDirection.copy(flora.group.position).add(new THREE.Vector3(0,2.65,0)).sub(ctx.player).normalize();
  step(.1);assert.equal(entities.inspect(ctx.player,ctx.cameraDirection),null);
  step(2.5);
  assert.equal(entities.inspect(ctx.player,ctx.cameraDirection)?.id,'flora','close sustained inspection can identify the bark markings');
});

test('an attracted Flora steers around a solid trunk instead of walking through it',()=>{
  const {flora,ctx,step,sounds}=scenario();
  ctx.cameraDirection.set(0,0,1);ctx.noise=.9;
  ctx.isMovementBlocked=(x,z,radius)=>Math.hypot(x,z+7)<.8+radius;
  for(let i=0;i<200;i++){
    step(.05);
    assert.ok(Math.hypot(flora.group.position.x,flora.group.position.z+7)>=1.13,'the wooden body must not cross the trunk');
  }
  assert.ok(flora.group.position.z>-7,'the creature must continue around the obstacle');
  assert.ok(sounds.includes('wood-creak'));
});
