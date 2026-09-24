// Gera modelos 3D no Meshy (texto -> 3D) e coloca no jogo (jogo/modelos + manifest.json).
//
// A chave NUNCA fica no código: defina a variável de ambiente MESHY_API_KEY.
//
// Comandos:
//   node ferramentas/meshy.mjs saldo
//   node ferramentas/meshy.mjs listar
//   node ferramentas/meshy.mjs gerar lobo aranha            (só mostra o custo estimado)
//   node ferramentas/meshy.mjs gerar lobo aranha --confirmar (gera de verdade)
//   node ferramentas/meshy.mjs gerar --prioridade 1 --confirmar
// Opções:
//   --sem-textura       gera só a prévia (mais barato, modelo sem cor)
//   --limite N          para antes de gastar mais que N créditos (padrão 150)
//   --refazer           gera de novo mesmo se o .glb já existir
//   node ferramentas/meshy.mjs otimizar   (refaz a compressão dos originais, grátis)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODELS_DIR = path.join(ROOT, 'jogo/modelos');
const MANIFEST = path.join(MODELS_DIR, 'manifest.json');
// Os arquivos originais do Meshy ficam aqui (fora do git) para poder otimizar de novo sem gastar créditos.
const RAW_DIR = path.join(ROOT, 'ferramentas/brutos');
const LIST = JSON.parse(fs.readFileSync(path.join(ROOT, 'ferramentas/meshy-modelos.json'), 'utf8')).modelos;
const API = 'https://api.meshy.ai/openapi';
// Estimativas; o script confere o saldo antes e depois para mostrar o gasto real.
const COST = { preview: 20, refine: 10 };

const args = process.argv.slice(2);
const cmd = args[0];
const flag = (f) => args.includes(f);
const opt = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const KEY = process.env.MESHY_API_KEY;

function need(ok, msg) { if (!ok) { console.error(msg); process.exit(1); } }

async function api(method, url, body) {
  const r = await fetch(API + url, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${url} -> ${r.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

const balance = async () => (await api('GET', '/v1/balance')).balance;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitTask(id, label) {
  for (;;) {
    const t = await api('GET', `/v2/text-to-3d/${id}`);
    process.stdout.write(`\r  ${label}: ${t.status} ${t.progress ?? 0}%   `);
    if (t.status === 'SUCCEEDED') { process.stdout.write('\n'); return t; }
    if (['FAILED', 'CANCELED', 'EXPIRED'].includes(t.status)) {
      process.stdout.write('\n');
      throw new Error(`${label} terminou com ${t.status}: ${JSON.stringify(t.task_error || {})}`);
    }
    await sleep(6000);
  }
}

async function download(url, file) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`download ${r.status}`);
  fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  return fs.statSync(file).size;
}

function readManifest() { try { return JSON.parse(fs.readFileSync(MANIFEST, 'utf8')); } catch { return {}; } }

function pickModels() {
  const ids = args.slice(1).filter((a) => !a.startsWith('--') && !/^\d+$/.test(a));
  const prio = opt('--prioridade');
  let list = LIST;
  if (ids.length) list = LIST.filter((m) => ids.includes(m.id));
  else if (prio) list = LIST.filter((m) => m.prioridade <= +prio);
  else list = [];
  const missing = ids.filter((id) => !LIST.some((m) => m.id === id));
  need(!missing.length, `Não conheço: ${missing.join(', ')}. Veja "listar".`);
  if (!flag('--refazer')) list = list.filter((m) => !fs.existsSync(path.join(MODELS_DIR, m.id + '.glb')) && !m.descartado);
  return list;
}

async function generate(m, textured) {
  console.log(`\n▶ ${m.id}`);
  const preview = await api('POST', '/v2/text-to-3d', {
    mode: 'preview',
    prompt: m.prompt,
    art_style: 'realistic',
    should_remesh: true,
    topology: 'triangle',
    target_polycount: m.poligonos || 12000,
    ...(m.humanoide ? { pose_mode: 'a-pose' } : {}),
  });
  let task = await waitTask(preview.result, `${m.id} prévia`);
  let spent = task.consumed_credits ?? COST.preview;
  if (textured) {
    const refine = await api('POST', '/v2/text-to-3d', { mode: 'refine', preview_task_id: preview.result, enable_pbr: false });
    task = await waitTask(refine.result, `${m.id} textura`);
    spent += task.consumed_credits ?? COST.refine;
  }
  const url = task.model_urls && task.model_urls.glb;
  need(url, 'O Meshy não devolveu um .glb');
  fs.mkdirSync(RAW_DIR, { recursive: true });
  const raw = path.join(RAW_DIR, m.id + '.glb');
  const size = await download(url, raw);
  console.log(`  original: ${(size / 1048576).toFixed(1)} MB`);
  fs.writeFileSync(path.join(RAW_DIR, m.id + '.json'), JSON.stringify(task, null, 2));
  optimize(m, task.id);
  return spent;
}

// Reduz texturas (webp) para carregar rápido no celular e registra no manifest.
function optimize(m, taskId) {
  const raw = path.join(RAW_DIR, m.id + '.glb');
  const file = path.join(MODELS_DIR, m.id + '.glb');
  const bin = path.join(ROOT, 'ferramentas/node_modules/.bin/gltf-transform');
  const tex = String(m.textura || 1024);
  execFileSync(bin, ['optimize', raw, file, '--compress', 'false', '--simplify', 'false', '--texture-compress', 'webp', '--texture-size', tex], { stdio: 'ignore' });
  const man = readManifest();
  man[m.id] = { arquivo: m.id + '.glb', altura: m.altura, ...(m.girar ? { girar: m.girar } : {}), ...(taskId ? { tarefa: taskId } : man[m.id]?.tarefa ? { tarefa: man[m.id].tarefa } : {}) };
  fs.writeFileSync(MANIFEST, JSON.stringify(man, null, 2) + '\n');
  console.log(`  salvo em jogo/modelos/${m.id}.glb (${(fs.statSync(file).size / 1048576).toFixed(2)} MB)`);
}

async function main() {
  if (cmd === 'listar') {
    const man = readManifest();
    for (const m of LIST) console.log(`${man[m.id] ? '✓' : m.descartado ? '✗' : '·'} [p${m.prioridade}] ${m.id.padEnd(10)} ${m.prompt.slice(0, 70)}...`);
    return;
  }
  if (cmd === 'otimizar') {
    // Refaz a otimização a partir dos originais (não gasta créditos).
    for (const m of LIST) if (!m.descartado && fs.existsSync(path.join(RAW_DIR, m.id + '.glb'))) { console.log(m.id); optimize(m); }
    return;
  }
  need(KEY, 'Defina MESHY_API_KEY antes (ex.: export MESHY_API_KEY=msy_...).');
  if (cmd === 'saldo') { console.log('Saldo:', await balance(), 'créditos'); return; }
  need(cmd === 'gerar', 'Use: saldo | listar | gerar <ids...> [--confirmar]');
  const textured = !flag('--sem-textura');
  const list = pickModels();
  need(list.length, 'Nada para gerar (os modelos pedidos já existem ou nenhum foi escolhido).');
  const each = COST.preview + (textured ? COST.refine : 0);
  const est = each * list.length;
  const limit = +opt('--limite', 150);
  const bal = await balance();
  console.log(`Modelos: ${list.map((m) => m.id).join(', ')}`);
  console.log(`Custo estimado: ~${est} créditos (${each} por modelo). Saldo atual: ${bal}. Limite desta execução: ${limit}.`);
  if (!flag('--confirmar')) { console.log('Nada foi gasto. Rode de novo com --confirmar para gerar.'); return; }
  need(est <= limit, `A estimativa passa do limite (${limit}). Gere menos modelos ou aumente --limite.`);
  need(est <= bal, 'Saldo insuficiente para esta lista.');
  let spent = 0;
  for (const m of list) {
    if (spent + each > limit) { console.log(`Parando: próximo modelo passaria do limite de ${limit} créditos.`); break; }
    try { spent += await generate(m, textured); } catch (e) { spent += COST.preview; console.error(`  erro em ${m.id}: ${e.message}`); }
  }
  const end = await balance();
  console.log(`\nGasto nesta execução: ${spent} créditos. Saldo restante: ${end}.`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
