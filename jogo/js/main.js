// Inicialização: renderizador, tela de título, introdução e loop do jogo.
import * as THREE from 'three';
import { Input } from './input.js';
import { Game } from './game.js';
import { preloadCustom } from './models.js';
import { unlockAudio } from './audio.js';

const $ = (id) => document.getElementById(id);

async function boot() {
  const canvas = $('game');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 400);

  $('loadingText').textContent = 'Carregando modelos...';
  await preloadCustom();
  $('loadingText').textContent = 'Gerando o mundo...';
  await new Promise((r) => setTimeout(r, 30));

  const input = new Input(document.body);
  input.onAny = unlockAudio;
  const game = new Game(renderer, scene, camera, input);
  window.__game = game;

  const resize = () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    document.body.classList.toggle('portrait', window.innerHeight > window.innerWidth);
  };
  window.addEventListener('resize', resize);
  resize();

  const save = Game.loadSave();
  $('loading').hidden = true;
  $('title').hidden = false;
  $('btnContinue').hidden = !save;
  if (save) $('saveInfo').textContent = `${save.name} · Nível ${save.level}`;

  let running = false;
  const begin = async (fromSave) => {
    unlockAudio();
    $('title').hidden = true;
    $('hud').hidden = false;
    game.start(fromSave ? save : null);
    running = true;
    if (!fromSave) {
      await game.ui.dialog([
        { quem: 'Você', texto: '...Onde estou? Está tudo escuro. Não sinto braços nem pernas.' },
        { quem: 'Grande Sábio', texto: 'Aviso: Renascimento concluído. Forma atual: Slime.' },
        { quem: 'Grande Sábio', texto: 'Aviso: Habilidade única adquirida — Predador. Absorve e analisa o que você tocar.' },
        { quem: 'Grande Sábio', texto: 'Aviso: Habilidade única adquirida — Grande Sábio. Eu vou orientar você.' },
        { quem: 'Grande Sábio', texto: 'Arraste o lado esquerdo da tela para andar e o lado direito para girar a câmera. O ponto dourado no minimapa mostra o objetivo.' },
      ]);
      game.ui.sage(`Nova missão: ${'Uma Voz na Escuridão'}.`);
      game.save();
    } else {
      game.ui.sage(`Bem-vindo de volta, ${game.p.name}.`);
    }
  };
  $('btnNew').addEventListener('click', () => {
    if (save) { $('newConfirm').hidden = false; return; }
    begin(false);
  });
  $('btnNewYes').addEventListener('click', () => {
    try { localStorage.removeItem('slimeRenascido.save.v1'); } catch { /* sem armazenamento */ }
    begin(false);
  });
  $('btnNewNo').addEventListener('click', () => { $('newConfirm').hidden = true; });
  $('btnContinue').addEventListener('click', () => begin(true));

  document.addEventListener('visibilitychange', () => { if (document.hidden && running && !game.resetting) game.save(); });
  window.addEventListener('pagehide', () => { if (running && !game.resetting) game.save(); });

  // Fundo animado da tela de título
  const titleCam = { a: 0 };
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (running) {
      game.update(dt);
    } else {
      titleCam.a += dt * 0.05;
      camera.position.set(Math.sin(titleCam.a) * 60, 45, 60 + Math.cos(titleCam.a) * 60);
      camera.lookAt(0, 5, 20);
      game.world.update(dt, camera.position, camera);
    }
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

boot().catch((e) => {
  console.error(e);
  const el = document.getElementById('loadingText');
  if (el) el.textContent = 'Erro ao iniciar: ' + e.message;
});
