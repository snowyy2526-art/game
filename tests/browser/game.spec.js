import { test, expect } from '@playwright/test';

test('exploration, collection, cabin crafting, nightfall and pause work together', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  // Pointer lock needs an interactive display on some CI runners. Keyboard
  // controls exercise the same player movement and actions in either case.
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.requestPointerLock = () => Promise.resolve();
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__game);
  await expect(page).toHaveTitle(/Entre as Árvores/);
  await page.getByRole('button', { name: 'Como sobreviver' }).click();
  await expect(page.locator('.entity-grid article')).toHaveCount(6);
  await page.getByRole('button', { name: 'Fechar manual' }).click();
  await page.getByRole('button', { name: 'Entrar na floresta' }).click();
  await expect(page.locator('#hud')).toBeVisible();

  async function walk(key, condition) {
    await page.keyboard.down(key);
    try { await page.waitForFunction(condition, null, { timeout: 30_000 }); }
    finally { await page.keyboard.up(key); }
  }
  // The first pickup lies beside the path, within a safe starter clearing.
  await walk('d', () => window.__game.position.x > 6.7);
  await walk('s', () => window.__game.position.z > 10.6);
  await page.keyboard.press('e');
  await page.waitForFunction(() => window.__game.state.inventory.wood === 11);
  await expect(page.locator('#toast')).toContainText('+3 madeira');
  await walk('a', () => window.__game.position.x < 0.15);
  await walk('w', () => window.__game.position.z < 2.6);

  await page.keyboard.press('Tab');
  await expect(page.locator('#craft-panel')).toBeVisible();
  const pausedTime = await page.evaluate(() => window.__game.state.time);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__game.state.time)).toBe(pausedTime);
  await page.locator('[data-craft="spear"]').click();
  await page.locator('[data-craft="barricade"]').click();
  await page.locator('[data-craft="fuel"]').click();
  const prepared = await page.evaluate(() => ({state:window.__game.state,entrances:window.__game.entrances}));
  expect(prepared.state.spears).toEqual([5]);
  expect(prepared.entrances.find(e => e.id === 'door').maxHealth).toBe(160);
  expect(prepared.state.fire).toBeGreaterThan(75);
  expect(prepared.state.inventory).toEqual({wood:3,scrap:1,food:2});
  await page.locator('#sleep-button').click();
  await page.waitForFunction(() => window.__game.state.phase === 'night');
  await expect(page.locator('#phase-label')).toContainText('SOBREVIVÊNCIA');
  await page.keyboard.press('Escape');
  await expect(page.locator('#pause-panel')).toBeVisible();
  await page.locator('#resume-button').click();
  await page.waitForFunction(() => window.__game.mode === 'playing');
  expect(errors).toEqual([]);
});

test('the landing and guide remain readable on narrow screens', async ({ page }) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  await page.waitForFunction(() => window.__game);
  await expect(page.locator('#start-button')).toBeInViewport();
  await page.getByRole('button',{name:'Como sobreviver'}).click();
  await expect(page.locator('#guide-close')).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});
