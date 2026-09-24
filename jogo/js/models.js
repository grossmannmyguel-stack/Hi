// Modelos 3D feitos por código (estilo low-poly). Cada construtor devolve
// { root, mats, anim(dt, estado) }. Quando houver modelos do Meshy em
// modelos/manifest.json, eles substituem estes automaticamente.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { STAGES } from './data.js';
import { makeRigged } from './autorig.js';

const geoCache = new Map();
function geo(key, make) {
  let g = geoCache.get(key);
  if (!g) { g = make(); geoCache.set(key, g); }
  return g;
}
const box = (w, h, d) => geo(`b${w}|${h}|${d}`, () => new THREE.BoxGeometry(w, h, d));
const sphere = (r, ws = 12, hs = 9) => geo(`s${r}|${ws}|${hs}`, () => new THREE.SphereGeometry(r, ws, hs));
const cone = (r, h, s = 7) => geo(`c${r}|${h}|${s}`, () => new THREE.ConeGeometry(r, h, s));
const cyl = (rt, rb, h, s = 7) => geo(`y${rt}|${rb}|${h}|${s}`, () => new THREE.CylinderGeometry(rt, rb, h, s));

function kit() {
  const mats = [];
  const mat = (color, o = {}) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true, ...o });
    mats.push(m);
    return m;
  };
  const glow = (color, intensity = 1.6) => mat(color, { emissive: color, emissiveIntensity: intensity, roughness: 0.4 });
  const add = (parent, g, m, x = 0, y = 0, z = 0) => {
    const o = new THREE.Mesh(g, m);
    o.position.set(x, y, z);
    parent.add(o);
    return o;
  };
  const pivot = (parent, x = 0, y = 0, z = 0) => {
    const p = new THREE.Group();
    p.position.set(x, y, z);
    parent.add(p);
    return p;
  };
  return { mats, mat, glow, add, pivot };
}

// ---------------------------------------------------------------- Slime
export function makeSlime(stage) {
  const st = STAGES[stage];
  const r = st.size;
  const k = kit();
  const root = new THREE.Group();
  const pv = k.pivot(root);
  const bodyMat = k.mat(st.cor, {
    roughness: 0.12, metalness: 0.05, transparent: true, opacity: 0.84,
    emissive: st.cor, emissiveIntensity: 0.18, flatShading: false,
  });
  const body = k.add(pv, geo('slimeBody', () => new THREE.SphereGeometry(1, 28, 18)), bodyMat, 0, r * 0.72, 0);
  body.scale.set(r, r * 0.72, r);
  const eyeMat = k.mat(0x0b1020, { roughness: 0.3 });
  const eyes = [-1, 1].map((sx) => {
    const e = k.add(pv, sphere(1, 10, 8), eyeMat, sx * 0.28 * r, r * 0.92, 0.88 * r);
    e.scale.set(0.07 * r, 0.14 * r, 0.05 * r);
    return e;
  });
  const shine = k.add(pv, sphere(1, 10, 8), k.mat(0xffffff, { transparent: true, opacity: 0.55, roughness: 0.1 }), -0.38 * r, r * 1.12, 0.35 * r);
  shine.scale.set(0.16 * r, 0.1 * r, 0.12 * r);

  const extras = {};
  if (stage >= 1) {
    extras.core = k.add(pv, sphere(0.22 * r, 10, 8), k.glow(stage >= 3 ? 0xff5ad0 : 0xffe07a, 1.2), 0, r * 0.62, 0);
  }
  if (stage >= 2) {
    extras.ring = k.pivot(root, 0, r * 0.8, 0);
    const t = new THREE.Mesh(geo('runeRing', () => new THREE.TorusGeometry(1, 0.035, 6, 48)), k.glow(0x9ff3e8, 1.4));
    t.rotation.x = Math.PI / 2;
    t.scale.setScalar(r * 1.45);
    extras.ring.add(t);
    extras.ring.rotation.z = 0.25;
  }
  if (stage >= 3) {
    const hornMat = k.mat(0x1a1030, { roughness: 0.5 });
    [-1, 1].forEach((sx) => {
      const h = k.add(pv, cone(0.12 * r, 0.55 * r, 6), hornMat, sx * 0.35 * r, r * 1.42, 0.1 * r);
      h.rotation.z = -sx * 0.35;
    });
    extras.aura = k.add(root, sphere(1, 16, 12), k.mat(0x6a4dff, {
      transparent: true, opacity: 0.12, emissive: 0x6a4dff, emissiveIntensity: 1, depthWrite: false, side: THREE.BackSide,
    }), 0, r * 0.75, 0);
    extras.aura.scale.set(r * 1.5, r * 1.2, r * 1.5);
  }
  if (stage >= 4) {
    const crown = k.add(pv, geo('crown', () => new THREE.TorusGeometry(1, 0.06, 5, 10)), k.glow(0xf2c14e, 0.9), 0, r * 1.62, 0);
    crown.rotation.x = Math.PI / 2;
    crown.scale.setScalar(0.35 * r);
    extras.orbs = k.pivot(root, 0, r * 0.9, 0);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      k.add(extras.orbs, sphere(0.12 * r, 8, 6), k.glow(0xf2c14e, 2), Math.cos(a) * r * 1.6, 0, Math.sin(a) * r * 1.6);
    }
  }

  let phase = 0, blink = 3;
  function anim(dt, s) {
    let sy = 1, sx = 1, sz = 1, hop = 0;
    if (s.dash) { sy = 0.8; sz = 1.4; sx = 0.95; }
    else if (s.absorb) { const p = 1 + 0.25 * Math.sin(s.t * 20); sx = sz = p; sy = p * 0.9; }
    else if (s.air) { sy = 1.14; sx = sz = 0.93; }
    else if (s.moving) {
      phase += dt * (5 + s.speed * 0.55);
      const h = Math.abs(Math.sin(phase));
      hop = h * 0.42 * r;
      sy = 1 + 0.36 * (h - 0.5);
      sx = sz = 1 / Math.sqrt(sy);
    } else {
      sy = 1 + 0.04 * Math.sin(s.t * 2.6);
      sx = sz = 1 / Math.sqrt(sy);
    }
    pv.position.y += (hop - pv.position.y) * Math.min(1, dt * 18);
    pv.scale.x += (sx - pv.scale.x) * Math.min(1, dt * 14);
    pv.scale.y += (sy - pv.scale.y) * Math.min(1, dt * 14);
    pv.scale.z += (sz - pv.scale.z) * Math.min(1, dt * 14);
    blink -= dt;
    const closed = blink < 0.12;
    if (blink < 0) blink = 2.5 + Math.random() * 3;
    eyes.forEach((e) => { e.scale.y = (closed ? 0.02 : 0.14) * r; });
    if (extras.ring) extras.ring.rotation.y += dt * 1.2;
    if (extras.aura) extras.aura.material.opacity = 0.1 + 0.06 * Math.sin(s.t * 3);
    if (extras.orbs) { extras.orbs.rotation.y -= dt * 1.6; extras.orbs.position.y = r * 0.9 + Math.sin(s.t * 2) * 0.15; }
  }
  return { root, mats: k.mats, anim, height: r * 1.5 };
}

// ---------------------------------------------------------------- Lobo
export function makeWolf({ color = 0x3a3d48, eye = 0xffd24a, horn = false } = {}) {
  const k = kit();
  const root = new THREE.Group();
  const body = k.pivot(root);
  const fur = k.mat(color);
  const dark = k.mat(0x111116);
  const torso = k.add(body, geo('wolfTorso', () => new THREE.CapsuleGeometry(0.42, 1.0, 3, 8)), fur, 0, 1.0, -0.1);
  torso.rotation.x = Math.PI / 2;
  k.add(body, sphere(0.5, 9, 7), fur, 0, 1.12, 0.45);
  const head = k.pivot(body, 0, 1.45, 0.95);
  k.add(head, box(0.62, 0.56, 0.7), fur, 0, 0, 0);
  k.add(head, box(0.34, 0.3, 0.5), fur, 0, -0.1, 0.52);
  k.add(head, box(0.12, 0.1, 0.08), dark, 0, -0.02, 0.8);
  [-1, 1].forEach((sx) => {
    k.add(head, cone(0.12, 0.3, 4), fur, sx * 0.2, 0.38, -0.1);
    k.add(head, box(0.11, 0.06, 0.04), k.glow(eye, 2), sx * 0.18, 0.1, 0.36);
  });
  if (horn) {
    const h = k.add(head, cone(0.08, 0.55, 5), k.mat(0xdfe8ff, { emissive: 0x88aaff, emissiveIntensity: 0.4 }), 0, 0.42, 0.18);
    h.rotation.x = 0.5;
  }
  const legs = [[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([sx, sz]) => {
    const p = k.pivot(body, sx * 0.25, 0.95, sz * 0.55);
    k.add(p, box(0.17, 0.95, 0.19), fur, 0, -0.475, 0);
    return p;
  });
  const tail = k.pivot(body, 0, 1.15, -0.95);
  const tm = k.add(tail, cone(0.12, 0.85, 5), fur, 0, 0, -0.4);
  tm.rotation.x = -Math.PI / 2 - 0.4;

  let phase = 0;
  function anim(dt, s) {
    if (s.moving) {
      phase += dt * (4 + s.speed * 1.1);
      const a = Math.sin(phase) * 0.75;
      legs[0].rotation.x = a; legs[3].rotation.x = a;
      legs[1].rotation.x = -a; legs[2].rotation.x = -a;
      body.position.y = Math.abs(Math.sin(phase * 2)) * 0.07;
    } else {
      legs.forEach((l) => { l.rotation.x *= 0.85; });
      body.position.y *= 0.85;
    }
    tail.rotation.y = Math.sin(s.t * (s.moving ? 10 : 4)) * 0.35;
    const lunge = s.attack >= 0 ? Math.sin(s.attack * Math.PI) : 0;
    head.position.z = 0.95 + lunge * 0.45;
    head.rotation.x = lunge * 0.35;
  }
  return { root, mats: k.mats, anim, height: 2 };
}

// ---------------------------------------------------------------- Aranha
export function makeSpider() {
  const k = kit();
  const root = new THREE.Group();
  const body = k.pivot(root);
  const shell = k.mat(0x3b2e2a);
  const mark = k.mat(0x9a2a2a);
  const ab = k.add(body, sphere(0.7, 10, 8), shell, 0, 0.95, -0.6);
  ab.scale.set(1, 0.8, 1.2);
  const m = k.add(body, sphere(0.3, 8, 6), mark, 0, 1.35, -0.7);
  m.scale.set(1, 0.4, 1.4);
  k.add(body, sphere(0.45, 9, 7), shell, 0, 0.82, 0.3);
  const eyeM = k.glow(0xff3030, 2);
  [[-0.14, 0.95], [0.14, 0.95], [-0.24, 0.88], [0.24, 0.88]].forEach(([x, y]) => k.add(body, sphere(0.06, 6, 5), eyeM, x, y, 0.7));
  const legGeoA = box(0.8, 0.08, 0.08), legGeoB = box(1.34, 0.07, 0.07);
  const legs = [];
  [-1, 1].forEach((side) => {
    [-0.65, -0.2, 0.2, 0.65].forEach((spread, i) => {
      const p = k.pivot(body, side * 0.3, 0.85, 0.45 - i * 0.28);
      const base = side > 0 ? -spread : Math.PI + spread;
      p.rotation.y = base;
      const a = k.add(p, legGeoA, shell, 0.33, 0.225, 0); a.rotation.z = 0.6;
      const b = k.add(p, legGeoB, shell, 0.83, -0.2, 0); b.rotation.z = -1.315;
      legs.push({ p, base, i });
    });
  });
  let phase = 0;
  function anim(dt, s) {
    if (s.moving) phase += dt * (8 + s.speed * 2);
    legs.forEach((l) => { l.p.rotation.y = l.base + (s.moving ? Math.sin(phase + l.i * 1.6) * 0.22 : 0); });
    body.position.y = s.moving ? Math.abs(Math.sin(phase)) * 0.05 : 0;
    const lunge = s.attack >= 0 ? Math.sin(s.attack * Math.PI) : 0;
    body.rotation.x = -lunge * 0.3;
  }
  return { root, mats: k.mats, anim, height: 1.6 };
}

// ---------------------------------------------------------------- Morcego
export function makeBat() {
  const k = kit();
  const root = new THREE.Group();
  const body = k.pivot(root);
  const fur = k.mat(0x4a3550);
  const wingM = k.mat(0x2e2035, { side: THREE.DoubleSide });
  const b = k.add(body, sphere(0.35, 9, 7), fur, 0, 0, 0);
  b.scale.set(1, 1, 1.2);
  k.add(body, sphere(0.25, 8, 6), fur, 0, 0.12, 0.36);
  [-1, 1].forEach((sx) => {
    k.add(body, cone(0.08, 0.25, 4), fur, sx * 0.12, 0.38, 0.32);
    k.add(body, sphere(0.045, 5, 4), k.glow(0xff4444, 2), sx * 0.09, 0.16, 0.57);
  });
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.2); shape.lineTo(1.4, 0.35); shape.lineTo(1.15, -0.2); shape.lineTo(0.75, 0.02);
  shape.lineTo(0.42, -0.26); shape.lineTo(0, -0.18); shape.lineTo(0, 0.2);
  const wg = geo('batWing', () => new THREE.ShapeGeometry(shape));
  const wings = [-1, 1].map((sx) => {
    const p = k.pivot(body, sx * 0.25, 0.05, 0);
    const w = k.add(p, wg, wingM);
    w.rotation.x = -Math.PI / 2;
    p.scale.x = sx;
    return p;
  });
  function anim(dt, s) {
    const f = Math.sin(s.t * (s.moving ? 16 : 11));
    wings[0].rotation.z = -f * 0.7;
    wings[1].rotation.z = -f * 0.7;
    body.position.y = f * 0.08;
    const lunge = s.attack >= 0 ? Math.sin(s.attack * Math.PI) : 0;
    body.position.z = lunge * 0.5;
  }
  return { root, mats: k.mats, anim, height: 0.8 };
}

// ---------------------------------------------------------------- Serpente
export function makeSnake() {
  const k = kit();
  const root = new THREE.Group();
  const a = k.mat(0x1d2130), b = k.mat(0x2f3960);
  const N = 14;
  const segs = [];
  for (let i = 0; i < N; i++) {
    const r = 0.38 - (i / N) * 0.26;
    segs.push({ m: k.add(root, sphere(1, 8, 6), i % 2 ? a : b), r });
  }
  const head = k.pivot(root, 0, 0.4, 0.3);
  const hm = k.add(head, sphere(0.42, 9, 7), a);
  hm.scale.set(0.9, 0.7, 1.3);
  [-1, 1].forEach((sx) => {
    k.add(head, sphere(0.07, 6, 5), k.glow(0xb6ff3a, 2), sx * 0.2, 0.14, 0.38);
    const f = k.add(head, cone(0.04, 0.18, 4), k.mat(0xf0f0e0), sx * 0.1, -0.2, 0.42);
    f.rotation.x = Math.PI;
  });
  let phase = 0;
  function anim(dt, s) {
    phase += dt * (s.moving ? 3 + s.speed * 1.6 : 1.2);
    segs.forEach((sg, i) => {
      const amp = 0.38 * (0.3 + i / N);
      sg.m.position.set(Math.sin(phase - i * 0.6) * amp, sg.r, -i * 0.42 - 0.1);
      sg.m.scale.setScalar(sg.r);
    });
    const lunge = s.attack >= 0 ? Math.sin(s.attack * Math.PI) : 0;
    head.position.set(Math.sin(phase + 0.6) * 0.1, 0.42 + lunge * 0.7 + (s.moving ? 0 : 0.25), 0.35 + lunge * 0.8);
    head.rotation.x = -lunge * 0.4;
  }
  return { root, mats: k.mats, anim, height: 1 };
}

// ---------------------------------------------------------------- Lagarto blindado
export function makeLizard() {
  const k = kit();
  const root = new THREE.Group();
  const body = k.pivot(root);
  const skin = k.mat(0x6b5a3a);
  const steel = k.mat(0x8a8f96, { roughness: 0.4, metalness: 0.5 });
  k.add(body, box(1.1, 0.55, 2.0), skin, 0, 0.62, 0);
  for (let i = 0; i < 4; i++) k.add(body, box(0.95 - i * 0.08, 0.2, 0.42), steel, 0, 0.98, 0.65 - i * 0.45);
  const head = k.pivot(body, 0, 0.72, 1.25);
  k.add(head, box(0.72, 0.45, 0.85), skin, 0, 0, 0.2);
  k.add(head, box(0.6, 0.12, 0.5), steel, 0, 0.26, 0.1);
  [-1, 1].forEach((sx) => k.add(head, box(0.08, 0.08, 0.06), k.glow(0xffa030, 1.5), sx * 0.3, 0.1, 0.55));
  const legs = [[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([sx, sz]) => {
    const p = k.pivot(body, sx * 0.6, 0.55, sz * 0.62);
    const l = k.add(p, box(0.24, 0.55, 0.24), skin, sx * 0.08, -0.26, 0);
    l.rotation.z = sx * 0.35;
    return p;
  });
  const tail = k.add(body, cone(0.3, 1.7, 5), skin, 0, 0.55, -1.8);
  tail.rotation.x = -Math.PI / 2;
  let phase = 0;
  function anim(dt, s) {
    if (s.moving) phase += dt * (5 + s.speed * 1.5);
    const a = s.moving ? Math.sin(phase) * 0.5 : 0;
    legs[0].rotation.x = a; legs[3].rotation.x = a; legs[1].rotation.x = -a; legs[2].rotation.x = -a;
    body.rotation.y = s.moving ? Math.sin(phase) * 0.06 : 0;
    const lunge = s.attack >= 0 ? Math.sin(s.attack * Math.PI) : 0;
    head.position.z = 1.25 + lunge * 0.5;
    head.rotation.x = -lunge * 0.25;
  }
  return { root, mats: k.mats, anim, height: 1.2 };
}

// ---------------------------------------------------------------- Humanoides (goblin, hobgoblin, ogro, forma humana)
export function makeHumanoid(o = {}) {
  const h = o.h || 1.8, bulk = o.bulk || 1, s = h / 1.8;
  const k = kit();
  const root = new THREE.Group();
  const body = k.pivot(root);
  const skin = k.mat(o.skin ?? 0x6f9a4a);
  const cloth = k.mat(o.cloth ?? 0x7a5a3a);
  const pants = k.mat(o.pants ?? o.cloth ?? 0x5a4030);
  const legLen = 0.85 * s, torsoH = 0.66 * s, headR = 0.2 * s * (o.headScale || 1);
  const legs = [-1, 1].map((sx) => {
    const p = k.pivot(body, sx * 0.11 * s * bulk, legLen, 0);
    k.add(p, box(+(0.17 * s * bulk).toFixed(3), +legLen.toFixed(3), +(0.19 * s * bulk).toFixed(3)), pants, 0, -legLen / 2, 0);
    return p;
  });
  const torso = k.add(body, box(+(0.48 * s * bulk).toFixed(3), +torsoH.toFixed(3), +(0.28 * s * bulk).toFixed(3)), cloth, 0, legLen + torsoH / 2, 0);
  if (o.cape) {
    const cape = k.add(body, box(+(0.5 * s).toFixed(3), +(1.05 * s).toFixed(3), 0.04), k.mat(o.cape, { side: THREE.DoubleSide }), 0, legLen + torsoH - 0.5 * s, -0.17 * s * bulk);
    cape.rotation.x = 0.08;
  }
  if (o.armor) {
    [-1, 1].forEach((sx) => k.add(body, box(+(0.2 * s).toFixed(3), +(0.12 * s).toFixed(3), +(0.3 * s).toFixed(3)), k.mat(o.armor, { metalness: 0.4, roughness: 0.5 }), sx * 0.27 * s * bulk, legLen + torsoH, 0));
  }
  const headY = legLen + torsoH + headR * 0.95;
  const head = k.pivot(body, 0, headY, 0);
  k.add(head, sphere(+headR.toFixed(3), 12, 10), skin);
  const eyeM = o.eyeGlow ? k.glow(o.eye ?? 0xffd24a, 1.6) : k.mat(o.eye ?? 0x151515);
  [-1, 1].forEach((sx) => k.add(head, box(+(headR * 0.22).toFixed(3), +(headR * 0.16).toFixed(3), 0.03), eyeM, sx * headR * 0.38, headR * 0.12, headR * 0.93));
  if (o.ears) [-1, 1].forEach((sx) => {
    const e = k.add(head, cone(+(0.06 * s).toFixed(3), +(0.26 * s).toFixed(3), 4), skin, sx * headR * 1.05, headR * 0.1, 0);
    e.rotation.z = -sx * Math.PI / 2.3;
  });
  if (o.horns) [-1, 1].forEach((sx) => {
    const e = k.add(head, cone(+(0.06 * s).toFixed(3), +(0.3 * s).toFixed(3), 5), k.mat(0xeae0c8), sx * headR * 0.45, headR * 0.95, headR * 0.1);
    e.rotation.z = -sx * 0.25;
  });
  if (o.hair) {
    const hm = k.mat(o.hair);
    const cap = k.add(head, sphere(+(headR * 1.08).toFixed(3), 12, 10), hm, 0, headR * 0.12, -headR * 0.12);
    cap.scale.set(1, 0.95, 1);
    if (o.hairLong) k.add(head, box(+(headR * 1.8).toFixed(3), +(headR * 2.4).toFixed(3), +(headR * 0.5).toFixed(3)), hm, 0, -headR * 0.9, -headR * 0.75);
  }
  if (o.beard) {
    const b = k.add(head, cone(+(headR * 0.6).toFixed(3), +(headR * 1.4).toFixed(3), 6), k.mat(0xe8e4dc), 0, -headR * 1.1, headR * 0.55);
    b.rotation.x = Math.PI;
  }
  const armLen = 0.62 * s;
  const arms = [-1, 1].map((sx) => {
    const p = k.pivot(body, sx * (0.24 * s * bulk + 0.07 * s * bulk), legLen + torsoH * 0.95, 0);
    k.add(p, box(+(0.13 * s * bulk).toFixed(3), +armLen.toFixed(3), +(0.14 * s * bulk).toFixed(3)), o.sleeves ? cloth : skin, 0, -armLen / 2, 0);
    return p;
  });
  const hand = arms[1];
  if (o.club) {
    const c = k.add(hand, cyl(+(0.13 * s).toFixed(3), +(0.06 * s).toFixed(3), +(0.95 * s).toFixed(3), 6), k.mat(0x5a3d22), 0, -armLen, 0.4 * s);
    c.rotation.x = Math.PI / 2;
  }
  if (o.sword) {
    const sw = k.add(hand, box(0.05, 0.06, +(1.05 * s).toFixed(3)), k.mat(0xd8e4f0, { metalness: 0.8, roughness: 0.25 }), 0, -armLen, 0.55 * s);
    sw.userData.blade = true;
    k.add(hand, box(0.22, 0.05, 0.06), k.mat(0xf2c14e, { metalness: 0.6, roughness: 0.4 }), 0, -armLen, 0.05 * s);
  }
  if (o.staff) {
    k.add(hand, cyl(0.035, 0.035, +(1.4 * s).toFixed(3), 5), k.mat(0x6b4a2a), 0, -armLen + 0.25 * s, 0.08);
    k.add(hand, sphere(0.08, 6, 5), k.glow(0x7dffc8, 1.2), 0, -armLen + 0.95 * s, 0.08);
  }
  if (o.spear) {
    const sp = k.add(hand, cyl(0.03, 0.03, +(1.6 * s).toFixed(3), 5), k.mat(0x6b4a2a), 0, -armLen, 0.3 * s);
    sp.rotation.x = Math.PI / 2;
    const tip = k.add(hand, cone(0.06, 0.25, 4), k.mat(0xc8d0d8, { metalness: 0.7, roughness: 0.3 }), 0, -armLen, 0.3 * s + 0.9 * s);
    tip.rotation.x = Math.PI / 2;
  }
  let phase = 0;
  function anim(dt, st) {
    if (st.moving) {
      phase += dt * (3 + st.speed * 1.6) / Math.max(0.6, s);
      const a = Math.sin(phase) * 0.65;
      legs[0].rotation.x = a; legs[1].rotation.x = -a;
      arms[0].rotation.x = -a * 0.7;
      if (st.attack < 0) arms[1].rotation.x = a * 0.7;
      body.position.y = Math.abs(Math.sin(phase)) * 0.05 * s;
    } else {
      legs.forEach((l) => { l.rotation.x *= 0.85; });
      arms[0].rotation.x = Math.sin(st.t * 1.5) * 0.05;
      if (st.attack < 0) arms[1].rotation.x = -Math.sin(st.t * 1.5) * 0.05;
      body.position.y *= 0.85;
    }
    if (st.attack >= 0) {
      const a = st.attack;
      arms[1].rotation.x = a < 0.35 ? -2.8 * (a / 0.35) : -2.8 + 2.3 * ((a - 0.35) / 0.65);
    }
    head.rotation.y = st.look ?? 0;
  }
  return { root, mats: k.mats, anim, height: h, torso };
}

export const makeGoblin = (elder = false) => makeHumanoid(elder
  ? { h: 1.05, skin: 0x7a9a5a, cloth: 0x8a6b4a, ears: true, beard: true, staff: true }
  : { h: 1.1, skin: 0x6f9a4a, cloth: 0x7a5a3a, ears: true });
export const makeHobgoblin = () => makeHumanoid({ h: 1.75, skin: 0x5b8a3c, cloth: 0x3a4a6a, pants: 0x2a3040, armor: 0x8a939e, ears: true, spear: true, sleeves: true });
export const makeOgre = (chief = false) => makeHumanoid(chief
  ? { h: 4.2, bulk: 1.5, skin: 0xa4483a, cloth: 0x2a1f1a, pants: 0x3a2a1f, horns: true, club: true, eyeGlow: true, eye: 0xffc040, armor: 0x3a3f46 }
  : { h: 3.2, bulk: 1.45, skin: 0xb8664c, cloth: 0x4a3526, horns: true, club: true });
export const makeHuman = () => makeHumanoid({ h: 1.62, skin: 0xf2dcc8, cloth: 0x1b2440, pants: 0x151a2e, hair: 0xa8d8ff, hairLong: true, eye: 0xf2c14e, eyeGlow: true, sword: true, sleeves: true, cape: 0x243a7a });

// ---------------------------------------------------------------- Dragão selado
export function makeDragon() {
  const k = kit();
  const root = new THREE.Group();
  const scale = k.mat(0x2a3152, { emissive: 0x161c40, emissiveIntensity: 1 });
  const belly = k.mat(0x4f5688, { emissive: 0x1a2048, emissiveIntensity: 0.8 });
  const hornM = k.mat(0xd8d0b0);
  const body = k.add(root, sphere(3, 14, 10), scale, 0, 2.6, 0);
  body.scale.set(1.1, 0.8, 1.6);
  const neckPts = [[0, 3.6, 3.4, 1.3], [0, 4.4, 4.6, 1.15], [0, 5.2, 5.6, 1.0]];
  neckPts.forEach(([x, y, z, r]) => k.add(root, sphere(r, 10, 8), scale, x, y, z));
  const head = k.pivot(root, 0, 5.8, 6.6);
  k.add(head, box(1.6, 1.3, 2.0), scale, 0, 0, 0);
  k.add(head, box(1.15, 0.8, 1.6), scale, 0, -0.2, 1.5);
  k.add(head, box(1.0, 0.25, 1.4), belly, 0, -0.62, 1.2);
  const eyeM = k.glow(0xffc040, 2.2);
  [-1, 1].forEach((sx) => {
    k.add(head, box(0.3, 0.14, 0.1), eyeM, sx * 0.62, 0.25, 0.95);
    const hn = k.add(head, cone(0.18, 1.6, 5), hornM, sx * 0.5, 0.9, -0.7);
    hn.rotation.x = -1.0;
  });
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0); wingShape.lineTo(5, 3.2); wingShape.lineTo(4.6, 0.6); wingShape.lineTo(3.2, -0.4);
  wingShape.lineTo(2.2, -1.2); wingShape.lineTo(0, -0.8); wingShape.lineTo(0, 0);
  const wg = geo('dragonWing', () => new THREE.ShapeGeometry(wingShape));
  const wingM = k.mat(0x1c2036, { side: THREE.DoubleSide });
  [-1, 1].forEach((sx) => {
    const p = k.pivot(root, sx * 2.2, 4.0, 0.5);
    const w = k.add(p, wg, wingM);
    w.rotation.set(0, sx > 0 ? -Math.PI / 2 + 0.3 : Math.PI / 2 - 0.3, 0.35);
    p.scale.x = 1;
  });
  for (let i = 0; i < 9; i++) {
    const t = i / 8;
    const a = t * 1.9;
    k.add(root, sphere(1.3 - t * 1.0, 8, 6), scale, Math.sin(a) * 5.5, 1.6 - t * 0.9, -4 - Math.cos(a) * 1 - t * 4);
  }
  [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([sx, sz]) => k.add(root, box(0.9, 1.4, 1.2), scale, sx * 2.4, 0.7, sz * 2.4));
  const seal = makeSeal();
  seal.root.position.set(0, 5, 1);
  root.add(seal.root);
  function anim(dt, s) {
    body.scale.y = 0.8 + Math.sin(s.t * 0.8) * 0.02;
    seal.anim(dt, s);
    head.rotation.y += ((s.look ?? 0) - head.rotation.y) * Math.min(1, dt * 1.5);
  }
  return { root, mats: k.mats, anim, height: 8 };
}

// O selo mágico em volta do dragão (também usado com o dragão do Meshy).
export function makeSeal() {
  const k = kit();
  const root = new THREE.Group();
  const sealSphere = k.add(root, sphere(11, 24, 16), k.mat(0x8f6bff, {
    transparent: true, opacity: 0.1, emissive: 0x6a4dff, emissiveIntensity: 0.6, depthWrite: false, side: THREE.DoubleSide, flatShading: false,
  }));
  const rings = [0, 1, 2].map((i) => {
    const r = new THREE.Mesh(geo('sealRing', () => new THREE.TorusGeometry(11.3, 0.07, 5, 72)), k.glow(0xb49bff, 1.5));
    r.rotation.set(i * 1.1, i * 0.7, 0);
    root.add(r);
    return r;
  });
  function anim(dt, s) {
    rings.forEach((r, i) => { r.rotation.y += dt * (0.15 + i * 0.07); r.rotation.x += dt * 0.05 * (i - 1); });
    sealSphere.material.opacity = s.unsealed ? 0 : 0.08 + Math.sin(s.t * 1.3) * 0.03;
  }
  return { root, mats: k.mats, anim };
}

// ---------------------------------------------------------------- Vila
export function makeHut(level = 0) {
  const k = kit();
  const root = new THREE.Group();
  if (level === 0) {
    k.add(root, cyl(2, 2.2, 2, 8), k.mat(0x7a5a3a), 0, 1, 0);
    k.add(root, cone(2.8, 2.2, 8), k.mat(0xc2a060), 0, 3.1, 0);
    k.add(root, box(0.9, 1.4, 0.2), k.mat(0x2a1d12), 0, 0.7, 2.05);
  } else {
    k.add(root, box(4.2, 2.8, 4.2), k.mat(0x9b7b55), 0, 1.4, 0);
    const roof = k.add(root, cyl(2.9, 2.9, 4.6, 3), k.mat(0x8a3b2a), 0, 3.6, 0);
    roof.rotation.z = Math.PI / 2;
    roof.scale.set(1, 1, 0.9);
    k.add(root, box(1, 1.7, 0.2), k.mat(0x3a2616), 0, 0.85, 2.12);
    const win = k.glow(0xffc870, 1.1);
    [-1, 1].forEach((sx) => k.add(root, box(0.7, 0.6, 0.12), win, sx * 1.3, 1.7, 2.12));
  }
  return { root, mats: k.mats, anim() {}, height: 4 };
}

export function makeCampfire() {
  const k = kit();
  const root = new THREE.Group();
  const log = k.mat(0x4a3020);
  for (let i = 0; i < 4; i++) {
    const l = k.add(root, cyl(0.12, 0.12, 1.4, 5), log, 0, 0.15, 0);
    l.rotation.set(Math.PI / 2, (i / 4) * Math.PI, 0, 'YXZ');
  }
  const flame = k.add(root, cone(0.45, 1.2, 6), k.glow(0xff8a2a, 2.5), 0, 0.75, 0);
  const inner = k.add(root, cone(0.25, 0.8, 6), k.glow(0xffe07a, 3), 0, 0.6, 0);
  function anim(dt, s) {
    const f = 1 + Math.sin(s.t * 13) * 0.08 + Math.sin(s.t * 7.3) * 0.06;
    flame.scale.set(1, f, 1);
    inner.scale.set(1, 2 - f, 1);
  }
  return { root, mats: k.mats, anim, height: 1.4 };
}

// ---------------------------------------------------------------- Itens absorvíveis
export function makeHerb() {
  const k = kit();
  const root = new THREE.Group();
  const leaf = k.mat(0x3f8a4a);
  for (let i = 0; i < 3; i++) {
    const l = k.add(root, cone(0.12, 0.6, 4), leaf, 0, 0.3, 0);
    l.rotation.set(0.5, (i / 3) * Math.PI * 2, 0, 'YXZ');
  }
  const bulb = k.add(root, geo('ico0', () => new THREE.IcosahedronGeometry(0.18, 0)), k.glow(0x7dffc8, 2), 0, 0.7, 0);
  function anim(dt, s) { bulb.position.y = 0.7 + Math.sin(s.t * 2 + root.position.x) * 0.06; bulb.rotation.y += dt; }
  return { root, mats: k.mats, anim, height: 0.9 };
}

export function makeOre() {
  const k = kit();
  const root = new THREE.Group();
  const m = k.glow(0x6aa8ff, 0.9);
  const g = geo('oct', () => new THREE.OctahedronGeometry(0.35, 0));
  [[0, 0.45, 0, 1.2], [0.35, 0.3, 0.1, 0.8], [-0.3, 0.28, -0.1, 0.75]].forEach(([x, y, z, s]) => {
    const c = k.add(root, g, m, x, y, z);
    c.scale.set(s * 0.7, s * 1.4, s * 0.7);
    c.rotation.z = x * 0.8;
  });
  return { root, mats: k.mats, anim() {}, height: 0.9 };
}

// ---------------------------------------------------------------- Sombra redonda (barata, sem shadow map)
let shadowTex = null;
export function makeShadow(size = 1) {
  if (!shadowTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    grd.addColorStop(0, 'rgba(0,0,0,0.55)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    shadowTex = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(
    geo('shadowPlane', () => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
  );
  m.scale.setScalar(size * 2);
  m.renderOrder = 1;
  return m;
}

// ---------------------------------------------------------------- Modelos do Meshy (GLB)
// modelos/manifest.json: { "lobo": { "arquivo": "lobo.glb", "altura": 2, "correr": "x_correr.glb" }, ... }
let manifest = null;
let loaderPromise = null;

export async function loadManifest() {
  try {
    const r = await fetch('modelos/manifest.json', { cache: 'no-cache' });
    manifest = r.ok ? await r.json() : {};
  } catch {
    manifest = {};
  }
  return manifest;
}

export function customScene(id) { const e = manifest && manifest[id]; return e && e._gltf ? e._gltf.scene : null; }

export function hasCustom(id) { return !!(manifest && manifest[id] && manifest[id]._gltf); }

async function loadFile(name) {
  if (!loaderPromise) loaderPromise = import('three/addons/loaders/GLTFLoader.js').then((m) => new m.GLTFLoader());
  const loader = await loaderPromise;
  const file = 'modelos/' + name;
  // Na versão publicada no claude.ai os GLB vão em base64 dentro de um .txt.
  if (!file.endsWith('.txt')) return loader.loadAsync(file);
  const b64 = await (await fetch(file)).text();
  const bin = atob(b64.trim());
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return loader.parseAsync(bytes.buffer, new URL('modelos/', document.baseURI).href);
}

// Meshy sem PBR: garante material fosco com a textura de cor (senão alguns aparelhos mostram cinza/escuro).
function fixMaterials(scene) {
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of ms) {
      if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
      if ('metalness' in m) { m.metalness = 0; m.roughness = Math.max(0.6, m.roughness ?? 1); }
      if (m.map && m.color) m.color.set(0xffffff);
    }
    o.castShadow = true;
    o.receiveShadow = true;
  });
}

// As animações do Meshy andam para frente sozinhas; o jogo já move o personagem, então
// o quadril fica parado em x/z (mantém só o sobe e desce).
function lockRootMotion(clip) {
  for (const tr of clip.tracks) {
    if (!/hips.*\.position$|root.*\.position$/i.test(tr.name)) continue;
    const v = tr.values;
    for (let i = 0; i < v.length; i += 3) { v[i] = v[0]; v[i + 2] = v[2]; }
  }
}

// Carrega todos os modelos do manifest antes do jogo começar. onProgress(feitos, total).
export async function preloadCustom(onProgress) {
  if (!manifest) await loadManifest();
  const ids = Object.keys(manifest);
  let done = 0;
  await Promise.all(ids.map(async (id) => {
    const e = manifest[id];
    try {
      e._gltf = await loadFile(e.arquivo);
      fixMaterials(e._gltf.scene);
      if (e.correr) e._run = (await loadFile(e.correr)).animations;
      e._anims = {};
      for (const [k, f] of Object.entries(e.anims || {})) {
        try { e._anims[k] = (await loadFile(f)).animations[0]; } catch (err) { console.warn('animação', id, k, err); }
      }
      [...e._gltf.animations, ...(e._run || []), ...Object.values(e._anims).filter(Boolean)].forEach(lockRootMotion);
    } catch (err) {
      console.warn('modelo', id, err);
      e._gltf = null;
    }
    onProgress?.(++done, ids.length);
  }));
}

// Peças (geometria + material) de um GLB, já na escala do jogo (base em y=0, centro em x/z).
export function customParts(id) {
  const entry = manifest && manifest[id];
  if (!entry || !entry._gltf) return null;
  const scene = entry._gltf.scene;
  scene.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(scene);
  const size = bb.getSize(new THREE.Vector3());
  const sc = (entry.altura || 1) / Math.max(0.001, size.y);
  const norm = new THREE.Matrix4().makeScale(sc, sc, sc)
    .multiply(new THREE.Matrix4().makeTranslation(-(bb.min.x + size.x / 2), -bb.min.y, -(bb.min.z + size.z / 2)));
  const parts = [];
  scene.traverse((o) => {
    if (!o.isMesh || o.isSkinnedMesh) return;
    const g = o.geometry.clone();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(norm, o.matrixWorld));
    parts.push({ geometry: g, material: o.material });
  });
  return parts.length ? parts : null;
}

export function makeCustom(id) {
  const entry = manifest && manifest[id];
  if (!entry || !entry._gltf) return null;
  const rigged = makeRigged(id, () => customParts(id), entry.altura || 1.5);
  if (rigged) return rigged;
  const gltf = entry._gltf;
  const scene = SkeletonUtils.clone(gltf.scene);
  const root = new THREE.Group();
  const inner = new THREE.Group();
  root.add(inner);
  inner.add(scene);
  scene.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(scene, true);
  const size = bb.getSize(new THREE.Vector3());
  const hgt = entry.altura || 1.5;
  const sc = hgt / Math.max(0.001, size.y);
  scene.scale.multiplyScalar(sc);
  scene.position.set(-(bb.min.x + size.x / 2) * sc, -bb.min.y * sc, -(bb.min.z + size.z / 2) * sc);
  if (entry.girar) scene.rotation.y = entry.girar;
  const mats = [];
  let arm = null;
  scene.traverse((o) => {
    if (o.isMesh) {
      o.material = o.material.clone();
      mats.push(o.material);
      if (o.isSkinnedMesh) o.frustumCulled = false;
    }
    if (o.isBone && !arm && /right.?arm$|RightArm/i.test(o.name) && !/fore/i.test(o.name)) arm = o;
  });
  let mixer = null, cur = null;
  const act = {};
  const A = entry._anims || {};
  if (gltf.animations.length) {
    mixer = new THREE.AnimationMixer(scene);
    act.walk = mixer.clipAction(gltf.animations[0]);
    if (entry._run && entry._run.length) act.run = mixer.clipAction(entry._run[0]);
    if (A.parado) act.idle = mixer.clipAction(A.parado);
    if (A.atacar) { act.attack = mixer.clipAction(A.atacar); act.attack.setLoop(THREE.LoopOnce); act.attack.clampWhenFinished = true; }
    if (A.morrer) { act.death = mixer.clipAction(A.morrer); act.death.setLoop(THREE.LoopOnce); act.death.clampWhenFinished = true; }
    cur = act.idle || act.walk;
    cur.play();
  }
  const to = (a, fade = 0.25) => {
    if (!a || a === cur) return;
    a.reset().play();
    a.crossFadeFrom(cur, fade, false);
    cur = a;
  };
  let phase = 0;
  function anim(dt, s) {
    if (mixer) {
      if (s.dead && act.death) {
        to(act.death, 0.15);
      } else if (s.attack >= 0 && act.attack) {
        if (cur !== act.attack) { to(act.attack, 0.1); act.attack.timeScale = act.attack.getClip().duration / 0.75; }
      } else if (s.moving) {
        const fast = act.run && s.speed > 4.2;
        to(fast ? act.run : act.walk);
        cur.timeScale = fast ? Math.max(0.7, s.speed / 6) : Math.max(0.6, s.speed / 2.5);
      } else if (act.idle) {
        to(act.idle, 0.3);
        act.idle.timeScale = 1;
      } else {
        to(act.walk);
        act.walk.timeScale = 0;
        act.walk.time = 0;
      }
      mixer.update(dt);
      if (arm && s.attack >= 0 && !act.attack) {
        const a = s.attack;
        arm.rotation.x += a < 0.35 ? -2.2 * (a / 0.35) : -2.2 + 2.2 * ((a - 0.35) / 0.65);
      }
      return;
    }
    if (s.moving) {
      phase += dt * (5 + s.speed * 0.6);
      inner.position.y = Math.abs(Math.sin(phase)) * 0.08 * hgt;
      inner.rotation.z = Math.sin(phase) * 0.05;
    } else {
      inner.position.y *= 0.85;
      inner.rotation.z *= 0.85;
      inner.scale.y = 1 + Math.sin(s.t * 2.5) * 0.015;
    }
    const lunge = s.attack >= 0 ? Math.sin(s.attack * Math.PI) : 0;
    inner.position.z = lunge * 0.3 * hgt;
  }
  return { root, mats, anim, height: hgt, hasDeath: !!act.death };
}
