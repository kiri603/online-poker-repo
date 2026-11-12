import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = new URL('./', import.meta.url);
const result = await build({
  entryPoints: [fileURLToPath(new URL('src/main.js', root))],
  bundle: true, write: false, minify: true, format: 'iife', target: 'es2020', legalComments: 'inline'
});
const css = await readFile(new URL('src/style.css', root), 'utf8');
const shell = await readFile(new URL('src/shell.html', root), 'utf8');
const license = await readFile(new URL('node_modules/three/LICENSE', root), 'utf8');
const script = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const html = shell.replace('<head>', () => `<!-- Three.js r180\n${license}\n-->\n<head>`).replace('/* INLINE_STYLE */', () => css).replace('/* INLINE_SCRIPT */', () => script);
await writeFile(new URL('index.html', root), html, 'utf8');
console.log(`Built standalone index.html (${Math.round(Buffer.byteLength(html) / 1024)} KiB).`);
