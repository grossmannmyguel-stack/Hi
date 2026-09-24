// Efeitos sonoros sintetizados (sem arquivos de áudio). Só tocam depois do primeiro toque.
let ctx = null;
let master = null;
export let muted = false;

export function unlockAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.35;
  master.connect(ctx.destination);
}

export function setMuted(m) {
  muted = m;
  if (master) master.gain.value = m ? 0 : 0.35;
}

function tone({ f = 440, f2 = null, type = 'sine', dur = 0.15, vol = 0.5, delay = 0 }) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur = 0.2, vol = 0.3, freq = 1200) {
  if (!ctx || muted) return;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(master);
  src.start();
}

export const sfx = {
  pulo: () => tone({ f: 260, f2: 620, type: 'sine', dur: 0.18, vol: 0.4 }),
  ataque: () => { noise(0.12, 0.25, 2400); tone({ f: 180, f2: 90, type: 'triangle', dur: 0.12, vol: 0.3 }); },
  acerto: () => { noise(0.08, 0.35, 900); tone({ f: 140, f2: 70, type: 'square', dur: 0.08, vol: 0.15 }); },
  dano: () => tone({ f: 220, f2: 110, type: 'sawtooth', dur: 0.2, vol: 0.2 }),
  absorver: () => { tone({ f: 500, f2: 120, type: 'sine', dur: 0.45, vol: 0.4 }); tone({ f: 750, f2: 200, type: 'sine', dur: 0.4, vol: 0.2, delay: 0.05 }); },
  habilidade: () => { tone({ f: 660, type: 'triangle', dur: 0.12, vol: 0.3 }); tone({ f: 990, type: 'triangle', dur: 0.2, vol: 0.25, delay: 0.1 }); },
  nivel: () => [523, 659, 784, 1047].forEach((f, i) => tone({ f, type: 'triangle', dur: 0.25, vol: 0.3, delay: i * 0.09 })),
  evolucao: () => [392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone({ f, type: 'sine', dur: 0.6, vol: 0.28, delay: i * 0.14 })),
  magia: () => { tone({ f: 900, f2: 300, type: 'sine', dur: 0.25, vol: 0.25 }); noise(0.2, 0.15, 3000); },
  explosao: () => { noise(0.6, 0.5, 600); tone({ f: 90, f2: 40, type: 'sine', dur: 0.5, vol: 0.5 }); },
  sabio: () => tone({ f: 1320, type: 'sine', dur: 0.09, vol: 0.12 }),
  ui: () => tone({ f: 880, type: 'sine', dur: 0.05, vol: 0.12 }),
};
