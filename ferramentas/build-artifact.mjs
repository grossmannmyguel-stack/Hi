// Gera dist/slime-renascido.html: uma página única (sem <html>/<head>/<body>) com todo o
// código do jogo embutido, pronta para publicar como Artifact no claude.ai.
// Uso: node ferramentas/build-artifact.mjs   (precisa de "npm install" em ferramentas/)
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
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
fs.writeFileSync(path.join(root, 'dist/slime-renascido.html'), out);
// O claude.ai não serve .glb. Cada modelo vira .gltf (JSON, geometria embutida) + as texturas
// originais (.png/.jpg, sem recomprimir). Texturas listadas em ferramentas/assets-artifact.json
// ficam no armazenamento de arquivos do artifact (por causa do limite de 64 MB por versão).
import { execFileSync } from 'node:child_process';
const assetMap = (() => { try { return JSON.parse(fs.readFileSync(path.join(root, 'ferramentas/assets-artifact.json'), 'utf8')); } catch { return {}; } })();
const OUT = path.join(root, 'dist/modelos');
const TMP = path.join(root, 'dist/split');
fs.rmSync(OUT, { recursive: true, force: true });
fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'jogo/modelos/manifest.json'), 'utf8'));
const bin = path.join(root, 'ferramentas/node_modules/.bin/gltf-transform');
const images = [];
function packGLB(json, binData) {
  const pad = (b, fill) => Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4, fill)]);
  const j = pad(Buffer.from(JSON.stringify(json)), 0x20);
  const bn = pad(binData, 0);
  const head = Buffer.alloc(12);
  head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + j.length + 8 + bn.length, 8);
  const ch = (len, type) => { const b = Buffer.alloc(8); b.writeUInt32LE(len, 0); b.writeUInt32LE(type, 4); return b; };
  return Buffer.concat([head, ch(j.length, 0x4e4f534a), j, ch(bn.length, 0x004e4942), bn]);
}
function convert(glbName) {
  const id = glbName.replace(/\.glb$/, '');
  const dir = path.join(TMP, id);
  fs.mkdirSync(dir, { recursive: true });
  execFileSync(bin, ['copy', path.join(root, 'jogo/modelos', glbName), path.join(dir, id + '.gltf')], { stdio: 'ignore' });
  const gltf = JSON.parse(fs.readFileSync(path.join(dir, id + '.gltf'), 'utf8'));
  if ((gltf.buffers || []).length !== 1) throw new Error(`${id}: esperava 1 buffer`);
  const binData = fs.readFileSync(path.join(dir, gltf.buffers[0].uri));
  delete gltf.buffers[0].uri;
  (gltf.images || []).forEach((img, i) => {
    const ext = path.extname(img.uri);
    const name = `${id}_${i}${ext}`;
    const src = path.join(dir, decodeURIComponent(img.uri));
    images.push({ name, src, size: fs.statSync(src).size });
    if (assetMap[name]) img.uri = assetMap[name];
    else { fs.copyFileSync(src, path.join(OUT, name)); img.uri = name; }
  });
  // GLB só com a geometria (texturas ficam de fora, como arquivos), em base64 num .txt.
  const out = id + '.glb.txt';
  fs.writeFileSync(path.join(OUT, out), packGLB(gltf, binData).toString('base64'));
  return out;
}
for (const [id, e] of Object.entries(manifest)) {
  if (!fs.existsSync(path.join(root, 'jogo/modelos', e.arquivo))) { delete manifest[id]; continue; }
  e.arquivo = convert(e.arquivo);
  if (e.correr) e.correr = convert(e.correr);
  for (const k of Object.keys(e.anims || {})) e.anims[k] = convert(e.anims[k]);
}
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
// Imagens da interface (ícones e arte do Canva), se existirem.
const UI_SRC = path.join(root, 'jogo/ui');
const UI_OUT = path.join(root, 'dist/ui');
fs.rmSync(UI_OUT, { recursive: true, force: true });
if (fs.existsSync(UI_SRC)) { fs.mkdirSync(UI_OUT, { recursive: true }); for (const f of fs.readdirSync(UI_SRC)) fs.copyFileSync(path.join(UI_SRC, f), path.join(UI_OUT, f)); }
const files = {};
let total = out.length;
for (const f of fs.readdirSync(OUT)) { files['modelos/' + f] = path.join(OUT, f); total += fs.statSync(path.join(OUT, f)).size; }
if (fs.existsSync(UI_OUT)) for (const f of fs.readdirSync(UI_OUT)) { files['ui/' + f] = path.join(UI_OUT, f); total += fs.statSync(path.join(UI_OUT, f)).size; }
fs.writeFileSync(path.join(root, 'dist/arquivos.json'), JSON.stringify(files, null, 2));
fs.writeFileSync(path.join(root, 'dist/texturas.json'), JSON.stringify(images.sort((a, b) => b.size - a.size), null, 2));
console.log(`total publicado: ${(total / 1048576).toFixed(1)} MB em ${Object.keys(files).length + 1} arquivos; ${Object.keys(assetMap).length} texturas no armazenamento`);
