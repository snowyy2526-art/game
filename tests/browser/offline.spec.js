import { test, expect } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const gameFile=resolve('dist/Entre-as-Arvores.html');

test('the self-contained HTML plays offline without a server or external asset requests', async ({page,context})=>{
  test.skip(!existsSync(gameFile),'Execute npm run export para gerar o HTML portátil.');
  const requests=[],errors=[];
  page.on('request',request=>{if(/^https?:/i.test(request.url()))requests.push(request.url());});
  page.on('pageerror',error=>errors.push(error.message));
  await context.setOffline(true);
  await page.addInitScript(()=>{
    HTMLCanvasElement.prototype.requestPointerLock=()=>Promise.reject(new DOMException('No pointer lock','SecurityError'));
  });
  // The managed Chromium policy blocks file:// navigation. Render the exact
  // exported document in memory while offline to exercise its inline bundle.
  await page.setContent(readFileSync(gameFile,'utf8'));
  await page.waitForFunction(()=>window.__game);
  await expect(page.locator('#start-button')).toBeVisible();
  await page.locator('#start-button').click();
  await page.waitForFunction(()=>window.__game.mode==='playing');
  await page.keyboard.down('w');
  try{await page.waitForFunction(()=>window.__game.position.z<7);}finally{await page.keyboard.up('w');}
  await page.keyboard.press('Tab');
  await page.locator('[data-craft="spear"]').click();
  expect(await page.evaluate(()=>window.__game.state.spears)).toEqual([5]);
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
});
