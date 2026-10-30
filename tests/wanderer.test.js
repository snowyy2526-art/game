import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createWandererModel } from '../models/wanderer.js';
import { createEntities } from '../entities.js';

test('the reference-based Wanderer is a grounded full-height 3D model with finite, renderable geometry',()=>{
  const model=createWandererModel(THREE);
  const box=new THREE.Box3().setFromObject(model.group);
  const size=box.getSize(new THREE.Vector3());
  assert.ok(size.y>2 && size.y<2.25,`height should match the 2.10m concept, got ${size.y}`);
  assert.ok(box.min.y>-.13 && box.min.y<.1,'feet should stand near ground level');
  assert.ok(size.x>.45 && size.x<1.35,'the long arms must fit a humanoid silhouette');
  assert.ok(size.z>.2 && size.z<1.2,'the design must have actual volume');
  let meshes=0,triangles=0;
  model.group.traverse(object=>{
    if(!object.isMesh)return;
    meshes++;
    const position=object.geometry.getAttribute('position');
    const normal=object.geometry.getAttribute('normal');
    assert.ok(position?.count>0 && normal?.count===position.count);
    assert.ok(position.array.every(Number.isFinite),'invalid vertices must not reach WebGL');
    assert.ok(normal.array.every(Number.isFinite),'invalid normals must not reach WebGL');
    triangles+=(object.geometry.index?.count??position.count)/3;
  });
  assert.ok(meshes<160,`${meshes} meshes exceed the character draw-call budget`);
  assert.ok(triangles<60000,`${triangles} triangles exceed the browser model budget`);
});

test('the laborious gait animates limbs without taking control of AI position or another instance',()=>{
  const first=createWandererModel(THREE),second=createWandererModel(THREE);
  first.group.position.set(25,0,-25);
  const secondPose=second.arms.map(arm=>arm.quaternion.clone());
  const initial=first.legs.map(leg=>leg.quaternion.clone());
  for(let frame=0;frame<180;frame++)first.animate(frame/60,true);
  assert.equal(first.group.position.x,25);
  assert.equal(first.group.position.z,-25);
  assert.ok(first.legs.some((leg,i)=>leg.quaternion.angleTo(initial[i])>.01),'walking must articulate the legs');
  second.arms.forEach((arm,i)=>assert.ok(arm.quaternion.angleTo(secondPose[i])<1e-6));
  first.resetPose();
  first.animate(0,false);
  const rest=first.legs.map(leg=>leg.quaternion.clone());
  first.animate(3,false);
  first.legs.forEach((leg,i)=>assert.ok(leg.quaternion.angleTo(rest[i])<.05,'idle breathing must not become a walking stride'));
});

test('the new appearance keeps slow pursuit, heavy-breath cues and spear knockback working',()=>{
  const entities=createEntities(THREE,new THREE.Scene());
  const wanderer=entities.list.find(e=>e.id==='wanderer');
  const sounds=[],deaths=[];
  const ctx={player:new THREE.Vector3(25,1.7,-18),cameraDirection:new THREE.Vector3(0,0,-1),phase:'day',day:1,phaseTime:0,noise:0,inside:false,fire:50,entrances:[],bracing:null,time:0,kill:r=>deaths.push(r),toast:()=>{},sound:name=>sounds.push(name),damage:()=>{}};
  const start=wanderer.group.position.clone();
  for(let frame=0;frame<60;frame++){ctx.time=frame/60;entities.update(1/60,ctx);}
  const travel=start.distanceTo(wanderer.group.position);
  assert.ok(travel>.1 && travel<1.5,'the redesign must preserve the slow pursuit');
  assert.ok(sounds.includes('breath'));
  ctx.player.copy(wanderer.group.position).add(new THREE.Vector3(0,1.7,2.5));
  ctx.cameraDirection.copy(wanderer.group.position).add(new THREE.Vector3(0,1.25,0)).sub(ctx.player).normalize();
  const closeDistance=wanderer.group.position.distanceTo(ctx.player);
  assert.equal(entities.hit(ctx.player,ctx.cameraDirection),true);
  assert.ok(wanderer.group.position.distanceTo(ctx.player)>closeDistance+2);
  assert.deepEqual(deaths,[]);
});

test('the Impostor copies the redesigned Wanderer but discards that disguise on reveal',()=>{
  const entities=createEntities(THREE,new THREE.Scene());
  entities.setPhase('day',3);
  const impostor=entities.list.find(e=>e.id==='impostor');
  assert.equal(impostor.entityDisguise.group.visible,true);
  assert.equal(impostor.monster.visible,false);
  const p=impostor.group.position;
  const ctx={player:p.clone().add(new THREE.Vector3(0,1.7,1.8)),cameraDirection:new THREE.Vector3(0,0,-1),phase:'day',day:3,phaseTime:0,noise:0,inside:false,fire:50,entrances:[],bracing:null,time:0,kill:()=>{},toast:()=>{},sound:()=>{},damage:()=>{}};
  entities.update(.05,ctx);
  assert.equal(impostor.revealed,true);
  assert.equal(impostor.entityDisguise.group.visible,false);
  assert.equal(impostor.monster.visible,true);
});
