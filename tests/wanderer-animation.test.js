import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createWandererModel } from '../models/wanderer.js';

test('the Wanderer has distinct alert, sprint and exhausted poses without moving its AI root', () => {
  const model = createWandererModel(THREE);
  model.group.position.set(12, 0, -8);
  model.group.rotation.y = .8;
  model.animate(.18, true, 'chase');
  const sprintStride = Math.abs(model.legs[0].rotation.x);
  assert.ok(sprintStride > .45, 'the charge must visibly run instead of retaining the old shuffle');
  assert.ok(model.rig.torso.rotation.x > .2, 'the charge leans into its movement');
  model.animate(.18, true, 'patrol');
  assert.ok(Math.abs(model.legs[0].rotation.x) < sprintStride / 3);
  model.animate(2, false, 'alert');
  assert.ok(model.arms.every(arm => arm.rotation.x < -.3), 'the windup visibly raises both arms');
  model.animate(2, false, 'exhausted');
  assert.ok(model.rig.torso.rotation.x > .45);
  assert.ok(model.rig.pelvis.position.y < .95);
  assert.ok(model.rig.knees.every(knee => knee.rotation.x > .3));
  assert.deepEqual(model.group.position.toArray(), [12, 0, -8]);
  assert.equal(model.group.rotation.y, .8);
  model.resetPose();
  model.animate(0, false);
  assert.ok(model.rig.torso.rotation.x < .1, 'restarting removes the exhausted bend');
});

test('the capture raises articulated hands with the throat and remains finite at every frame', () => {
  const model = createWandererModel(THREE);
  model.group.position.set(6, 0, -12);
  model.group.rotation.y = 1.1;
  const wristLocal = index => model.group.worldToLocal(model.rig.hands[index].getWorldPosition(new THREE.Vector3()));
  model.animateCapture(.2);
  const low = model.rig.hands.map((hand, i) => wristLocal(i));
  assert.ok(low.every(wrist => wrist.z > .5 && wrist.y > 1.1), 'the hands must actually reach forward');
  model.animateCapture(.6);
  const high = model.rig.hands.map((hand, i) => wristLocal(i));
  assert.ok(high.every((wrist, i) => wrist.y > low[i].y + .7), 'the grip must rise along with the lifted player');
  assert.ok(high.every(wrist => Math.abs(wrist.y - 2.25) < .08 && Math.abs(wrist.z - .625) < .08), 'wrist target stays just below the lifted throat');
  assert.equal(model.rig.captureGrip.y, model.metadata.capture.liftedEyeHeight - .2);
  for (let frame = 0; frame <= 180; frame++) {
    model.animateCapture(frame / 180);
    model.group.traverse(object => assert.ok(object.matrixWorld.elements.every(Number.isFinite)));
  }
  assert.deepEqual(model.group.position.toArray(), [6, 0, -12]);
  assert.equal(model.group.rotation.y, 1.1);
  model.animateCapture(.6);
  const first = model.arms.map(arm => arm.quaternion.clone());
  model.animateCapture(.2);
  model.animateCapture(.6);
  model.arms.forEach((arm, i) => assert.ok(arm.quaternion.angleTo(first[i]) < 1e-7, 'capture poses must not accumulate rotations'));
});
