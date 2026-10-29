import { test, expect } from '@playwright/test';

test('a preview that blocks pointer lock still allows mouse look and attacks', async ({page}) => {
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{
    HTMLCanvasElement.prototype.requestPointerLock=()=>Promise.reject(new DOMException('Blocked in this frame','SecurityError'));
  });
  await page.goto('/');
  await page.waitForFunction(()=>window.__game);
  await page.locator('#start-button').click();
  await page.waitForFunction(()=>window.__game.controls.captureUnavailable);
  await expect(page.locator('#toast')).toContainText('botão direito');
  const before=await page.evaluate(()=>window.__game.controls);
  await page.mouse.move(450,360);
  await page.mouse.down({button:'right'});
  await page.mouse.move(550,390,{steps:4});
  await page.mouse.up({button:'right'});
  const after=await page.evaluate(()=>window.__game.controls);
  expect(after.yaw).toBeLessThan(before.yaw-0.2);
  expect(after.pitch).toBeLessThan(before.pitch);
  await page.keyboard.press('Tab');
  await page.locator('[data-craft="spear"]').click();
  await page.locator('#craft-close').click();
  await page.mouse.click(550,380);
  await page.waitForFunction(()=>window.__game.state.spears[0]===4);
  expect(await page.evaluate(()=>window.__game.mode)).toBe('playing');
  expect(errors).toEqual([]);
});

test('an unavailable WebGL context gives recovery instructions rather than an endless loading screen', async ({page}) => {
  await page.addInitScript(()=>{
    const original=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(type,...args){
      return type==='webgl2'||type==='webgl'||type==='experimental-webgl'?null:original.call(this,type,...args);
    };
  });
  await page.goto('/');
  await expect(page.locator('#startup-error')).toBeVisible();
  await expect(page.locator('#startup-error-message')).toContainText('WebGL2');
  await expect(page.locator('#retry-startup')).toBeVisible();
  await expect(page.locator('#loading')).toBeHidden();
});
