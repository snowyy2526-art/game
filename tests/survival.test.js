import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, craft, eat, advanceTime, nextPhase, DAY_DURATION, NIGHT_DURATION } from '../survival.js';

const entrance = (health = 100, maxHealth = 100) => ({ id: 'door', health, maxHealth });

test('victory requires surviving the fifth night, without an early win at sunset', () => {
  const state = createState();
  for (let day = 1; day <= 5; day++) {
    assert.equal(state.day, day);
    assert.equal(state.phase, 'day');
    advanceTime(state, DAY_DURATION);
    assert.equal(nextPhase(state), 'night');
    assert.equal(state.won, false, `sunset ${day} is not victory`);
    advanceTime(state, NIGHT_DURATION);
    const result = nextPhase(state);
    assert.equal(result, day === 5 ? 'win' : 'day');
    assert.equal(state.won, day === 5);
  }
});

test('failed crafting leaves inventory, defenses, fire, and spears unchanged', () => {
  for (const recipe of ['barricade', 'spear', 'fuel', 'repair', 'unknown']) {
    const state = createState();
    state.inventory = { wood: 0, scrap: 0, food: 0 };
    const entry = entrance(45);
    const before = structuredClone({ state, entry });
    assert.equal(craft(state, recipe, entry).ok, false);
    assert.deepEqual({ state, entry }, before);
  }
  const state = createState();
  const before = structuredClone(state);
  assert.equal(craft(state, 'barricade').ok, false);
  assert.deepEqual(state, before, 'missing entrance must not consume materials');
});

test('reinforcements require daylight, while night repairs restore only to the current cap', () => {
  const state = createState();
  const entry = entrance(80);
  state.phase = 'night';
  const initial = structuredClone({ state, entry });
  assert.equal(craft(state, 'barricade', entry).ok, false);
  assert.deepEqual({ state, entry }, initial);
  assert.equal(craft(state, 'repair', entry).ok, true);
  assert.equal(entry.health, entry.maxHealth);
  assert.equal(entry.maxHealth, 100, 'repairs do not upgrade the entrance');
  const afterRepair = structuredClone(state.inventory);
  assert.equal(craft(state, 'repair', entry).ok, false);
  assert.deepEqual(state.inventory, afterRepair, 'a fully repaired entrance costs no wood');
  state.phase = 'day';
  assert.equal(craft(state, 'barricade', entry).ok, true);
  assert.equal(entry.maxHealth, 160);
  assert.equal(entry.health, 160);
});

test('recipes consume their real materials and produce useful survival supplies', () => {
  const state = createState();
  assert.equal(craft(state, 'spear').ok, true);
  assert.deepEqual(state.inventory, { wood: 6, scrap: 2, food: 2 });
  assert.deepEqual(state.spears, [5], 'a crafted spear has five uses');
  const beforeFire = state.fire;
  assert.equal(craft(state, 'fuel').ok, true);
  assert.equal(state.inventory.wood, 3);
  assert.ok(state.fire > beforeFire);
});

test('food is not wasted at full hunger and restores nutrition when needed', () => {
  const state = createState();
  assert.equal(eat(state), false);
  assert.equal(state.inventory.food, 2);
  state.hunger = 80;
  state.health = 96;
  assert.equal(eat(state), true);
  assert.equal(state.hunger, 100);
  assert.equal(state.health, 100);
  assert.equal(state.inventory.food, 1);
  state.inventory.food = 0;
  state.hunger = 30;
  assert.equal(eat(state), false);
  assert.equal(state.hunger, 30);
});

test('sprinting creates noise and costs stamina; resting recovers stamina; starvation hurts', () => {
  const state = createState();
  advanceTime(state, 3, { moving: true, sprinting: true });
  assert.ok(state.stamina < 50);
  assert.ok(state.noise > 0.8);
  assert.ok(state.hunger < 100);
  advanceTime(state, 8);
  assert.equal(state.stamina, 100);
  assert.equal(state.noise, 0);
  state.hunger = 0;
  const health = state.health;
  advanceTime(state, 1);
  assert.ok(state.health < health);
});
