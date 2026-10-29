import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { exportGame, resolveAsset } from '../scripts/export-game.mjs';

async function fixture(run, js = 'window.started = true;') {
  const root = await mkdtemp(join(tmpdir(), 'cabin-export-'));
  try {
    const dist = join(root, 'dist');
    await mkdir(join(dist, 'assets'), { recursive: true });
    await writeFile(join(dist, 'index.html'), `<!doctype html><html><head><link rel="icon" href="data:image/svg+xml,icon"><link rel="modulepreload" href="/assets/old.js"><script type="module" src="/assets/game.js"></script><link rel="stylesheet" href="/assets/game.css"></head><body><a href="/">Início</a></body></html>`);
    await writeFile(join(dist, 'assets/game.js'), js);
    await writeFile(join(dist, 'assets/game.css'), 'body{color:#fff;background-image:url(data:image/png;base64,AA==)}');
    await run({ root, dist });
  } finally { await rm(root, { recursive: true, force: true }); }
}

test('standalone export incorporates bundles and leaves no external asset tags', async () => {
  await fixture(async ({ dist }) => {
    const { outputPath, bytes } = await exportGame(dist);
    const html = await readFile(outputPath, 'utf8');
    assert.ok(bytes > 100);
    assert.match(html, /<script type="module">\s*window\.started = true;/);
    assert.match(html, /<style>\s*body\{/);
    assert.doesNotMatch(html, /<script[^>]*\bsrc=|rel="stylesheet"|modulepreload/);
    assert.match(html, /href="data:image\/svg\+xml,icon"/);
    assert.match(html, /<a href="#">/);
  });
});

test('raw HTML closing tags in bundle strings cannot terminate the inline script or style', async () => {
  await fixture(async ({ dist }) => {
    await writeFile(join(dist, 'assets/game.css'), 'body::after{content:"</style>"}');
    const { outputPath } = await exportGame(dist);
    const html = await readFile(outputPath, 'utf8');
    assert.equal([...html.matchAll(/<\/script>/gi)].length, 1);
    assert.equal([...html.matchAll(/<\/style>/gi)].length, 1);
    assert.match(html, /<\\\/script>/);
    assert.match(html, /<\\\/style>/);
  }, 'const tag = "</script>";');
});

test('export refuses traversal, remote assets, and symlinks outside dist', async () => {
  await fixture(async ({ root, dist }) => {
    await writeFile(join(root, 'outside.js'), 'secret');
    await symlink(join(root, 'outside.js'), join(dist, 'assets/escape.js'));
    for (const path of ['../outside.js', '/%2e%2e/outside.js', 'https://example.com/a.js', '//example.com/a.js', '/assets/escape.js']) {
      await assert.rejects(resolveAsset(dist, path), /fora de dist|apenas assets locais/);
    }
    assert.equal(await resolveAsset(dist, '/assets/game.js'), join(dist, 'assets/game.js'));
  });
});

test('export rejects split JavaScript dependencies and external CSS assets', async () => {
  for (const js of ['import {x} from "./chunk.js";', 'const x = import("./chunk.js");', 'console.log(import.meta.url);']) {
    await fixture(async ({ dist }) => {
      await assert.rejects(exportGame(dist), /bundle|import/);
    }, js);
  }
  await fixture(async ({ dist }) => {
    await writeFile(join(dist, 'assets/game.css'), 'body{background:url(./external.png)}');
    await assert.rejects(exportGame(dist), /asset externo/);
  });
});
