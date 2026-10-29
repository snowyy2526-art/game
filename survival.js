export const DAY_DURATION = 180;
export const NIGHT_DURATION = 100;
export const LAST_DAY = 5;
export const RECIPES = {
  barricade: { wood: 3, scrap: 1 },
  spear: { wood: 2, scrap: 1 },
  fuel: { wood: 3 },
  repair: { wood: 2 },
};

export function createState() {
  return {
    day: 1, phase: 'day', phaseTime: 0, time: 0,
    health: 100, hunger: 100, stamina: 100, fire: 45,
    inventory: { wood: 8, scrap: 3, food: 2 },
    spears: [], noise: 0, won: false, dead: false,
  };
}

export function canAfford(inventory, cost) {
  return Object.entries(cost).every(([key, amount]) => inventory[key] >= amount);
}

export function craft(state, recipe, entrance) {
  const cost = RECIPES[recipe];
  if (!cost || !canAfford(state.inventory, cost)) return { ok: false, message: 'Materiais insuficientes. Explore a floresta durante o dia.' };
  if ((recipe === 'barricade' || recipe === 'repair') && !entrance) return { ok: false, message: 'Aproxime-se de uma porta ou janela.' };
  if (recipe === 'barricade' && state.phase !== 'day') return { ok: false, message: 'Reforce as entradas durante o dia. À noite, use R para reparar.' };
  if (recipe === 'repair' && entrance.health >= entrance.maxHealth) return { ok: false, message: 'Esta entrada já está em perfeito estado.' };
  if (recipe === 'fuel' && state.fire >= 100) return { ok: false, message: 'A lareira já está completamente abastecida.' };
  if (recipe === 'barricade' && entrance.maxHealth >= 300 && entrance.health >= entrance.maxHealth) return { ok: false, message: 'Esta entrada já tem o reforço máximo.' };
  for (const [key, amount] of Object.entries(cost)) state.inventory[key] -= amount;
  if (recipe === 'barricade') {
    entrance.maxHealth = Math.min(300, entrance.maxHealth + 60);
    entrance.health = Math.min(entrance.maxHealth, entrance.health + 80);
  }
  if (recipe === 'repair') entrance.health = Math.min(entrance.maxHealth, entrance.health + 55);
  if (recipe === 'spear') state.spears.push(5);
  if (recipe === 'fuel') state.fire = Math.min(100, state.fire + 42);
  return { ok: true, message: { barricade: 'Entrada reforçada. A floresta terá que esperar.', spear: 'Lança criada · 5 usos. Ataque por uma janela com o botão esquerdo.', fuel: 'Lareira abastecida. O breu não vai entrar.', repair: 'Madeira no lugar. A entrada voltou a resistir.' }[recipe] };
}

export function eat(state) {
  if (state.inventory.food <= 0) return false;
  if (state.hunger >= 99) return false;
  state.inventory.food--;
  state.hunger = Math.min(100, state.hunger + 38);
  state.health = Math.min(100, state.health + 8);
  return true;
}

export function advanceTime(state, dt, { sprinting = false, moving = false } = {}) {
  state.time += dt;
  state.phaseTime += dt;
  state.hunger = Math.max(0, state.hunger - dt * (state.phase === 'night' ? 0.16 : 0.13));
  if (!state.hunger) state.health = Math.max(0, state.health - dt * 1.4);
  state.stamina = Math.max(0, Math.min(100, state.stamina + dt * (sprinting && moving ? -22 : 15)));
  state.fire = Math.max(0, state.fire - dt * (state.phase === 'night' ? 0.37 : 0.025));
  state.noise = Math.max(moving ? (sprinting ? 0.86 : 0.15) : 0, state.noise - dt * 0.18);
}

export function nextPhase(state) {
  if (state.phase === 'day') { state.phase = 'night'; state.phaseTime = 0; return 'night'; }
  if (state.day === LAST_DAY) { state.won = true; return 'win'; }
  state.day++;
  state.phase = 'day';
  state.phaseTime = 0;
  return 'day';
}
