// Animações da biblioteca do Meshy (parado, atacar, morrer) para os humanoides com esqueleto.
// Cada animação custa ~3 créditos. Uso: MESHY_API_KEY=... node meshy-anim.mjs [--confirmar]
// Salva só o esqueleto + animação (sem malha nem textura) em jogo/modelos/<id>_<acao>.glb.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODELS = path.join(ROOT, 'jogo/modelos');
const RAW = path.join(ROOT, 'ferramentas/brutos');
const KEY = process.env.MESHY_API_KEY;
const API = 'https://api.meshy.ai/openapi/v1';
// Tarefa de esqueleto (rigging) de cada modelo e o id da animação na biblioteca do Meshy.
const PLAN = {
  goblin: { rig: '01a0d16a-c79d-7286-8d0c-49ecc3fac487', parado: 0, atacar: 4, morrer: 189 },
  hobgoblin: { rig: '01a0d16c-b960-7226-9b4d-648d737431b5', parado: 0, atacar: 240, morrer: 189 },
  humano: { rig: '01a0d16e-7a22-7347-85af-5c14eea76345', parado: 0, atacar: 219, morrer: 189 },
  ogroChefe: { rig: '01a0d16e-c306-77ab-a972-5d3ab14aa608', parado: 0, atacar: 128, morrer: 189 },
  ogro: { rig: '01a0d172-ced1-75c5-854e-3bf51e89b193', parado: 0, atacar: 128, morrer: 189 },
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(method, url, body) {
  const r = await fetch(API + url, { method, headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  if (!r.ok) throw new Error(`${url} ${r.status} ${t.slice(0, 200)}`);
  return JSON.parse(t);
}
const io = new NodeIO();
async function stripToAnimation(src, dst) {
  const doc = await io.read(src);
  const root = doc.getRoot();
  root.listMeshes().forEach((m) => m.dispose());
  root.listMaterials().forEach((m) => m.dispose());
  root.listTextures().forEach((t) => t.dispose());
  await io.write(dst, doc);
}

const jobs = [];
for (const [id, p] of Object.entries(PLAN)) {
  for (const acao of ['parado', 'atacar', 'morrer']) {
    const dst = path.join(MODELS, `${id}_${acao}.glb`);
    if (!fs.existsSync(dst)) jobs.push({ id, acao, action: p[acao], rig: p.rig, dst });
  }
}
console.log(`${jobs.length} animações, ~${jobs.length * 3} créditos.`);
if (!process.argv.includes('--confirmar')) process.exit(0);
let spent = 0;
await Promise.all(jobs.map(async (j, i) => {
  await sleep(i * 400);
  try {
    const r = await api('POST', '/animations', { rig_task_id: j.rig, action_id: j.action });
    let t;
    for (;;) {
      t = await api('GET', `/animations/${r.result}`);
      if (t.status === 'SUCCEEDED') break;
      if (['FAILED', 'CANCELED', 'EXPIRED'].includes(t.status)) throw new Error(JSON.stringify(t.task_error));
      await sleep(5000);
    }
    spent += t.consumed_credits ?? 3;
    const raw = path.join(RAW, `${j.id}_${j.acao}.glb`);
    fs.writeFileSync(raw, Buffer.from(await (await fetch(t.result.animation_glb_url)).arrayBuffer()));
    await stripToAnimation(raw, j.dst);
    console.log(`ok ${j.id} ${j.acao} (${(fs.statSync(j.dst).size / 1024).toFixed(0)} KB)`);
  } catch (e) { console.log(`erro ${j.id} ${j.acao}: ${e.message}`); }
}));
const man = JSON.parse(fs.readFileSync(path.join(MODELS, 'manifest.json'), 'utf8'));
for (const id of Object.keys(PLAN)) {
  if (!man[id]) continue;
  man[id].anims = {};
  for (const acao of ['parado', 'atacar', 'morrer']) if (fs.existsSync(path.join(MODELS, `${id}_${acao}.glb`))) man[id].anims[acao] = `${id}_${acao}.glb`;
}
fs.writeFileSync(path.join(MODELS, 'manifest.json'), JSON.stringify(man, null, 2) + '\n');
console.log(`Gasto: ${spent} créditos.`);
