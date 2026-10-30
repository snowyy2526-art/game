import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createWandererModel } from '../models/wanderer.js';
import { createEntities, WANDERER_RULES } from '../entities.js';
import { WANDERER_AUDIO_TIMING } from '../audio/wanderer-timing.js';

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

test('the warning holds the Wanderer still and a spear interrupts the charge into recovery',()=>{
  const entities=createEntities(THREE,new THREE.Scene());
  const wanderer=entities.list.find(e=>e.id==='wanderer');
  const sounds=[],deaths=[];
  const ctx={player:new THREE.Vector3(25,1.7,-18),cameraDirection:new THREE.Vector3(0,0,-1),phase:'day',day:1,phaseTime:0,noise:0,inside:false,fire:50,entrances:[],bracing:null,time:0,kill:r=>deaths.push(r),toast:()=>{},sound:name=>sounds.push(name),damage:()=>{}};
  const start=wanderer.group.position.clone();
  for(let frame=0;frame<60;frame++){ctx.time=frame/60;entities.update(1/60,ctx);}
  const travel=start.distanceTo(wanderer.group.position);
  assert.equal(travel,0,'the warning must allow the player to react before the charge');
  assert.equal(wanderer.mode,'alert');
  assert.ok(!sounds.includes('breath'),'dedicated positional MP3s replace the old generic cue');
  ctx.player.copy(wanderer.group.position).add(new THREE.Vector3(0,1.7,2.5));
  ctx.cameraDirection.copy(wanderer.group.position).add(new THREE.Vector3(0,1.25,0)).sub(ctx.player).normalize();
  const closeDistance=wanderer.group.position.distanceTo(ctx.player);
  assert.equal(entities.hit(ctx.player,ctx.cameraDirection),true);
  assert.ok(wanderer.group.position.distanceTo(ctx.player)>closeDistance+2);
  assert.equal(wanderer.mode,'exhausted');
  assert.deepEqual(deaths,[]);
});

function chaseScenario(distance=7){
  const entities=createEntities(THREE,new THREE.Scene());
  const wanderer=entities.list.find(e=>e.id==='wanderer');
  for(const e of entities.list)if(e!==wanderer)e.group.position.set(1000,0,1000);
  const captures=[],deaths=[],messages=[];
  const ctx={player:new THREE.Vector3(25,1.7,-25+distance),cameraDirection:new THREE.Vector3(0,0,-1),phase:'day',day:1,phaseTime:0,noise:0,inside:false,fire:50,entrances:[],bracing:null,time:0,kill:reason=>deaths.push(reason),captureWanderer:entity=>captures.push(entity),toast:message=>messages.push(message),sound:()=>{},damage:()=>{}};
  const step=(seconds,beforeFrame=()=>{})=>{
    for(let remaining=seconds;remaining>.000001;remaining-=.02){
      const dt=Math.min(.02,remaining);beforeFrame(dt);ctx.time+=dt;entities.update(dt,ctx);
    }
  };
  const startCharge=()=>{step(.02);assert.equal(wanderer.mode,'alert');step(wanderer.alertDuration+.04);assert.equal(wanderer.mode,'chase');};
  return {entities,wanderer,ctx,step,startCharge,captures,deaths,messages};
}

test('alert waits for its complete warning recording before a fast, finite charge',()=>{
  const {wanderer,step,ctx}=chaseScenario(12);
  const start=wanderer.group.position.clone();
  step(.02);
  assert.equal(wanderer.mode,'alert');
  assert.equal(wanderer.alertDuration,WANDERER_AUDIO_TIMING.alert[wanderer.alertClipIndex]+.4);
  step(wanderer.alertDuration-.03);
  assert.equal(wanderer.mode,'alert');
  assert.ok(wanderer.group.position.distanceTo(start)<.000001);
  step(.05);
  assert.equal(wanderer.mode,'chase');
  const chargeStart=wanderer.group.position.clone();
  step(.5,dt=>{ctx.player.z+=6.1*dt;});
  assert.ok(wanderer.group.position.distanceTo(chargeStart)>3,'the charge must run faster than a six-metre-per-second sprint');
});

test('running outlasts a charge and exhaustion gives a full recovery window before patrol grace',()=>{
  const {wanderer,ctx,step,startCharge,captures,deaths}=chaseScenario();
  startCharge();
  step(WANDERER_RULES.chaseDuration+.1,dt=>{ctx.player.z+=6.1*dt;});
  assert.equal(wanderer.mode,'exhausted');
  assert.deepEqual(captures,[]);
  const rest=wanderer.group.position.clone();
  ctx.player.copy(rest).add(new THREE.Vector3(0,1.7,.5));
  step(WANDERER_RULES.recoveryDuration-.3);
  assert.equal(wanderer.mode,'exhausted');
  assert.ok(wanderer.group.position.distanceTo(rest)<.000001,'exhaustion is stationary and cannot capture');
  assert.deepEqual(captures,[]);
  step(.4);
  assert.equal(wanderer.mode,'patrol');
  assert.ok(wanderer.grace>2.5,'returning to patrol must not immediately reacquire the player');
  step(2);
  assert.equal(wanderer.mode,'patrol');
  assert.deepEqual(deaths,[]);
});

test('capture happens once after the warning and leaves the other day entities frozen',()=>{
  const {entities,wanderer,step,startCharge,captures,deaths}=chaseScenario(2);
  startCharge();
  step(.4);
  assert.equal(wanderer.mode,'capture');
  assert.deepEqual(captures,[wanderer]);
  assert.deepEqual(deaths,[],'the cinematic callback owns when the end screen appears');
  const positions=entities.list.map(e=>e.group.position.clone());
  step(3);
  assert.equal(captures.length,1);
  entities.list.forEach((e,i)=>assert.ok(e.group.position.distanceTo(positions[i])<.000001));
});

test('trees hide the player, noise only investigates, and entering the cabin safely ends the charge',()=>{
  const {wanderer,ctx,step}=chaseScenario(12);
  ctx.isSightBlocked=()=>true;ctx.noise=.9;
  const start=wanderer.group.position.clone();
  step(1);
  assert.equal(wanderer.mode,'patrol');
  assert.ok(wanderer.group.position.distanceTo(start)>.1,'he may follow the sound without seeing through the obstacle');
  ctx.isSightBlocked=()=>false;ctx.noise=0;
  step(.02);
  assert.equal(wanderer.mode,'alert');
  step(wanderer.alertDuration+.04);
  assert.equal(wanderer.mode,'chase');
  ctx.inside=true;step(.02);
  assert.equal(wanderer.mode,'exhausted');
  const rest=wanderer.group.position.clone();step(2);
  assert.ok(wanderer.group.position.distanceTo(rest)<.000001);
});

test('a blocked escape route does not allow a charge through tree trunks and phase reset clears the encounter',()=>{
  const {entities,wanderer,ctx,step,startCharge,captures}=chaseScenario(12);
  ctx.isMovementBlocked=(x,z,radius)=>Math.hypot(x-25,z+20)<.8+radius;
  startCharge();
  step(1.4);
  assert.ok(Math.hypot(wanderer.group.position.x-25,wanderer.group.position.z+20)>=1.03);
  assert.ok(wanderer.group.position.z>-20,'local steering should continue around the tree');
  entities.setPhase('night',1);
  assert.equal(wanderer.mode,'inactive');assert.equal(wanderer.active,false);
  entities.setPhase('day',2);
  assert.equal(wanderer.mode,'patrol');assert.equal(wanderer.aware,false);
  assert.equal(wanderer.timer,0);
  assert.equal(wanderer.group.position.x,wanderer.baseX);
  assert.deepEqual(captures,[]);
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
