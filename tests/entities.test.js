import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createEntities } from '../entities.js';

function setup(phase = 'day') {
  const entities = createEntities(THREE, new THREE.Scene());
  const deaths = [];
  const messages = [];
  const sounds = [];
  const ctx = {
    player: new THREE.Vector3(0, 1.7, 0),
    cameraDirection: new THREE.Vector3(0, 0, 1),
    phase, day: 1, phaseTime: 0, noise: 0, inside: false, fire: 100,
    entrances: [], bracing: null, time: 0,
    kill: reason => deaths.push(reason), toast: text => messages.push(text),
    sound: name => sounds.push(name), damage: () => {},
  };
  const step = seconds => {
    for (let remaining = seconds; remaining > 0.00001; remaining -= 0.05) {
      const dt = Math.min(0.05, remaining);
      ctx.time += dt;
      ctx.phaseTime += dt;
      entities.update(dt, ctx);
    }
  };
  return { entities, ctx, deaths, messages, sounds, step };
}

function waitForAttack(fixture) {
  const invader = fixture.entities.list.find(e => e.id === 'invader');
  for (let i = 0; i < 600 && invader.mode !== 'attacking'; i++) fixture.step(0.1);
  assert.equal(invader.mode, 'attacking', 'the Invasor must eventually reach the selected entrance');
  return invader;
}

test('quiet travel leaves Flora dormant; noise attracts her, and looking freezes her', () => {
  const { entities, ctx, step, deaths } = setup();
  const flora = entities.list.find(e => e.id === 'flora');
  flora.group.position.set(0, 0, -12);
  const start = flora.group.position.clone();
  step(1);
  assert.equal(flora.group.position.distanceTo(start), 0, 'proximity alone must not wake Flora');
  ctx.noise = 0.9;
  step(0.5);
  assert.ok(flora.group.position.distanceTo(ctx.player) < start.distanceTo(ctx.player), 'noise draws her closer');
  ctx.noise = 0;
  ctx.cameraDirection.copy(flora.group.position).add(new THREE.Vector3(0, 2.15, 0)).sub(ctx.player).normalize();
  const watched = flora.group.position.clone();
  step(2);
  assert.equal(flora.group.position.distanceTo(watched), 0, 'she must stay completely still while watched');
  ctx.cameraDirection.set(0, 0, 1);
  step(0.5);
  assert.ok(flora.group.position.distanceTo(watched) > 0.5, 'she resumes when the player looks away');
  assert.equal(deaths.length, 0);
});

test('restoring the fireplace clears the darkness threat instead of accumulating an unavoidable death', () => {
  const { entities, ctx, step, deaths } = setup('night');
  ctx.inside = true;
  ctx.fire = 0;
  step(6);
  assert.equal(deaths.length, 0);
  ctx.fire = 20;
  step(0.1);
  ctx.fire = 0;
  step(6);
  assert.equal(deaths.length, 0, 'relighting must reset the darkness countdown');
  step(2);
  assert.equal(entities.list.find(e => e.id === 'nightmare').active, true);
  assert.equal(deaths.length, 0, 'the player gets a visible final warning');
  step(3.2);
  assert.ok(deaths.some(reason => reason.includes('Pesadelo')));
});

test('spear hits exhaust the Invasor and create a repair window before a defense breaks', () => {
  const fixture = setup('night');
  const { entities, ctx, step } = fixture;
  ctx.inside = true;
  ctx.entrances = [{ id: 'door', label: 'Porta', position: new THREE.Vector3(0, 0, 5), health: 200, maxHealth: 200 }];
  const invader = waitForAttack(fixture);
  step(2);
  assert.ok(ctx.entrances[0].health < 200, 'the attack must damage a real entrance');
  ctx.player.set(0, 1.7, 2.5);
  ctx.cameraDirection.copy(invader.group.position).add(new THREE.Vector3(0, 1.25, 0)).sub(ctx.player).normalize();
  assert.equal(entities.hit(ctx.player, ctx.cameraDirection), true);
  assert.equal(entities.hit(ctx.player, ctx.cameraDirection), true);
  assert.equal(invader.mode, 'retreating');
  const health = ctx.entrances[0].health;
  step(2);
  assert.equal(ctx.entrances[0].health, health, 'a retreating attacker stops damaging the entrance');
});

test('bracing the attacked entrance reduces damage without making defenses invulnerable', () => {
  function simulate(bracing) {
    const fixture = setup('night');
    const { ctx, step } = fixture;
    ctx.inside = true;
    ctx.bracing = bracing;
    ctx.entrances = [{ id: 'door', label: 'Porta', position: new THREE.Vector3(0, 0, 5), health: 200, maxHealth: 200 }];
    waitForAttack(fixture);
    step(2);
    return 200 - ctx.entrances[0].health;
  }
  const unbraced = simulate(null);
  const braced = simulate('door');
  assert.ok(braced > 0);
  assert.ok(braced < unbraced / 2);
});

test('the Invasor routes around cabin walls before attacking a door or the far-side window', () => {
  for (const [id, position] of [
    ['door', new THREE.Vector3(0, 0, 4)],
    ['west', new THREE.Vector3(-4.8, 0, 0)],
  ]) {
    const { entities, ctx, step } = setup('night');
    ctx.inside = true;
    ctx.entrances = [{ id, label: id, position, health: 200, maxHealth: 200 }];
    const invader = entities.list.find(e => e.id === 'invader');
    for (let i = 0; i < 1000 && invader.mode !== 'attacking'; i++) {
      step(0.05);
      const p = invader.group.position;
      assert.ok(Math.abs(p.x) >= 4.8 || Math.abs(p.z) >= 4, `${id}: an intact cabin wall cannot be crossed`);
    }
    assert.equal(invader.mode, 'attacking');
    assert.equal(ctx.entrances[0].health, 200, 'approaching cannot damage the entrance early');
  }
});

test('Risonho announces himself behind the player, then kills only after prolonged eye contact', () => {
  const { entities, ctx, step, deaths, sounds } = setup('night');
  ctx.inside = true;
  step(28.1);
  const laugh = entities.list.find(e => e.id === 'laugh');
  assert.equal(laugh.active, true);
  assert.ok(sounds.includes('laugh'));
  assert.equal(deaths.length, 0, 'hearing the laugh is not a death condition');
  ctx.cameraDirection.copy(laugh.group.position).add(new THREE.Vector3(0, 1.7, 0)).sub(ctx.player).normalize();
  step(1.3);
  assert.equal(deaths.length, 0, 'a brief glance leaves time to turn away');
  step(0.3);
  assert.ok(deaths.some(reason => reason.includes('Risonho')));
});

test('ignoring Risonho until he disappears is a valid survival strategy', () => {
  const { entities, ctx, step, deaths } = setup('night');
  ctx.inside = true;
  step(28.1);
  const laugh = entities.list.find(e => e.id === 'laugh');
  ctx.cameraDirection.copy(ctx.player).sub(laugh.group.position).setY(0).normalize();
  step(14);
  assert.equal(laugh.active, false);
  assert.equal(deaths.length, 0);
});

test('looking away immediately breaks the Risonho eye-contact countdown', () => {
  const { entities, ctx, step, deaths } = setup('night');
  ctx.inside = true;
  step(28.1);
  const laugh = entities.list.find(e => e.id === 'laugh');
  const lookAtFace = () => ctx.cameraDirection.copy(laugh.group.position).add(new THREE.Vector3(0, 1.7, 0)).sub(ctx.player).normalize();
  lookAtFace();
  step(1.2);
  assert.equal(deaths.length, 0);
  ctx.cameraDirection.multiplyScalar(-1);
  step(0.05);
  lookAtFace();
  step(1.2);
  assert.equal(deaths.length, 0, 'two separate brief glances must not accumulate into a death');
  step(0.4);
  assert.ok(deaths.some(reason => reason.includes('Risonho')));
});

test('the Impostor can be inspected safely from a distance, but approaching reveals its lethal trap', () => {
  const { entities, ctx, step, deaths, sounds } = setup();
  const impostor = entities.list.find(e => e.id === 'impostor');
  ctx.player.set(20, 1.7, 24);
  ctx.cameraDirection.copy(impostor.group.position).add(new THREE.Vector3(0, 1.5, 0)).sub(ctx.player).normalize();
  let observation = entities.inspect(ctx.player, ctx.cameraDirection);
  assert.equal(observation.id, 'impostor');
  assert.equal(observation.name, 'Pessoa ferida');
  assert.match(observation.description, /Observe por alguns segundos/);
  step(2.1);
  observation = entities.inspect(ctx.player, ctx.cameraDirection);
  assert.equal(observation.name, 'O Impostor');
  assert.match(observation.description, /pé|pés/);
  assert.equal(impostor.revealed, false);
  ctx.player.set(20, 1.7, 19.4);
  step(0.1);
  assert.equal(impostor.revealed, true);
  assert.ok(sounds.includes('reveal'));
  assert.equal(deaths.length, 0, 'the reveal gives a short readable beat');
  step(1);
  assert.ok(deaths.some(reason => reason.includes('Impostor')));
});
