import { readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Script } from 'node:vm';

const defaultDist = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');
const outputName = 'Entre-as-Arvores.html';

function attribute(tag, name) {
  return tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i'))?.[2] ?? null;
}

function contained(root, candidate) {
  const child = relative(root, candidate);
  return child !== '' && child !== '..' && !child.startsWith(`..${sep}`) && !isAbsolute(child);
}

/** Only assets physically inside dist may become part of the exported game. */
export async function resolveAsset(distDir, assetUrl) {
  if (typeof assetUrl !== 'string' || !assetUrl) throw new Error('Asset sem caminho.');
  let path;
  try { path = decodeURIComponent(assetUrl.split(/[?#]/, 1)[0]); }
  catch { throw new Error(`Caminho de asset inválido: ${assetUrl}`); }
  if (/^[a-z][a-z\d+.-]*:/i.test(path) || path.startsWith('//') || path.includes('\\')) {
    throw new Error(`O exportador aceita apenas assets locais de dist: ${assetUrl}`);
  }
  path = path.replace(/^\//, '');
  if (path.split('/').includes('..')) throw new Error(`Asset fora de dist: ${assetUrl}`);
  const root = await realpath(distDir);
  const candidate = resolve(root, path);
  if (!contained(root, candidate)) throw new Error(`Asset fora de dist: ${assetUrl}`);
  const actual = await realpath(candidate);
  if (!contained(root, actual)) throw new Error(`Asset fora de dist por link simbólico: ${assetUrl}`);
  return actual;
}

function escapeClosingTag(source, tag) {
  return source.replace(new RegExp(`</${tag}`, 'gi'), match => `<\\/${match.slice(2)}`);
}

function assertBundledJavaScript(source) {
  try {
    // Parse without executing. Static imports/exports and import.meta require
    // another module and are intentionally unsupported by this single-file export.
    new Script(source, { filename: 'bundled-game.js' });
  } catch (error) {
    throw new Error(`O jogo precisa de um único bundle sem imports externos: ${error.message}`);
  }
  if (/\bimport\s*\(/.test(source)) {
    throw new Error('O jogo contém import dinâmico. Gere um único bundle antes de exportar.');
  }
}

function assertBundledCss(source) {
  if (/@import\b/i.test(source)) throw new Error('O CSS contém @import externo.');
  for (const match of source.matchAll(/url\(\s*(["']?)(.*?)\1\s*\)/gi)) {
    if (!/^(?:data:|#)/i.test(match[2].trim())) {
      throw new Error(`O CSS ainda depende de um asset externo: ${match[2]}`);
    }
  }
}

export async function exportGame(distDir = defaultDist) {
  let html = await readFile(resolve(distDir, 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1[^>]*>\s*<\/script\s*>/gi)];
  if (scripts.length !== 1) throw new Error('Esperado um único script compilado em dist/index.html.');
  const js = await readFile(await resolveAsset(distDir, scripts[0][2]), 'utf8');
  assertBundledJavaScript(js);
  html = html.replace(scripts[0][0], () => `<script type="module">\n${escapeClosingTag(js, 'script')}\n</script>`);

  const links = [...html.matchAll(/<link\b[^>]*>/gi)];
  for (const [tag] of links) {
    const rel = attribute(tag, 'rel');
    if (rel === 'modulepreload') {
      html = html.replace(tag, '');
    } else if (rel === 'stylesheet') {
      const css = await readFile(await resolveAsset(distDir, attribute(tag, 'href')), 'utf8');
      assertBundledCss(css);
      html = html.replace(tag, () => `<style>\n${escapeClosingTag(css, 'style')}\n</style>`);
    } else if (attribute(tag, 'href') && !attribute(tag, 'href').startsWith('data:')) {
      throw new Error(`Link externo não incorporado: ${tag}`);
    }
  }
  // The landing-page brand link should stay in this file when opened via file://.
  html = html.replace(/(<a\b[^>]*\bhref\s*=\s*["'])\/(?=["'])/gi, '$1#');
  // A lightweight final contract check, ignoring bundled source contents.
  const markup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '');
  if (/<script\b[^>]*\bsrc\s*=/i.test(markup) || /<(?:img|audio|video|source|iframe)\b[^>]*\bsrc\s*=/i.test(markup)) {
    throw new Error('O HTML ainda depende de um arquivo externo.');
  }
  const outputPath = resolve(await realpath(distDir), outputName);
  await writeFile(outputPath, html, 'utf8');
  return { outputPath, bytes: Buffer.byteLength(html) };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const result = await exportGame();
    console.log(`Jogo independente exportado: ${result.outputPath} (${Math.ceil(result.bytes / 1024)} KiB)`);
  } catch (error) {
    console.error(`Não foi possível exportar o jogo: ${error.message}`);
    process.exitCode = 1;
  }
}
