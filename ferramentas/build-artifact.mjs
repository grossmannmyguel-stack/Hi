// Gera dist/slime-renascido.html: uma página única (sem <html>/<head>/<body>) com todo o
// código do jogo embutido, pronta para publicar como Artifact no claude.ai.
// Uso: node ferramentas/build-artifact.mjs   (precisa de "npm install" em ferramentas/)
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'jogo/index.html'), 'utf8');
const res = await build({
  entryPoints: [path.join(root, 'jogo/js/main.js')],
  bundle: true,
  format: 'esm',
  minify: true,
  write: false,
  target: 'es2020',
  external: ['three', 'three/addons/*'],
});
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const pick = (re) => (html.match(re) || [''])[0];
const body = html.match(/<body>([\s\S]*)<\/body>/)[1]
  .replace('<script type="module" src="js/main.js"></script>', () => `<script type="module">\n${js}</script>`);
const out = [
  pick(/<title>[\s\S]*?<\/title>/),
  ...(html.match(/<link[^>]+>/g) || []),
  pick(/<style>[\s\S]*?<\/style>/),
  body.trim(),
].join('\n');
fs.mkdirSync(path.join(root, 'dist/modelos'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/slime-renascido.html'), out);
for (const f of fs.readdirSync(path.join(root, 'jogo/modelos'))) {
  fs.copyFileSync(path.join(root, 'jogo/modelos', f), path.join(root, 'dist/modelos', f));
}
console.log(`dist/slime-renascido.html (${(out.length / 1024).toFixed(0)} KB)`);
