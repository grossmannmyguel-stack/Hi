// Mundo aberto: terreno procedural, biomas, água, árvores, céu e ciclo de dia e noite.
import * as THREE from 'three';
import { makeNoise, mulberry32, clamp, lerp, smoothstep } from './util.js';
import { REGIONS, WATER_Y, PLACES } from './data.js';
import { makeHut, makeCampfire, makeCustom, customParts } from './models.js';
import { Grass } from './grass.js';

export const HALF = 240;
const SEG = 240;
const CELL = (HALF * 2) / SEG;
const N = SEG + 1;
const REG = Object.fromEntries(REGIONS.map((r) => [r.id, r]));
const noise = makeNoise(7);

const PATHS = [
  [[0, 132], [-20, 60], [-60, 10], [-95, -30]],
  [[0, 132], [30, 40], [70, -20], [120, -70]],
  [[-60, 10], [-110, 60], [-140, 75]],
  [[30, 40], [100, 60], [150, 95]],
  [[70, -20], [55, -100], [70, -160]],
  [[-95, -30], [-60, -120], [-40, -160]],
];

function distToPaths(x, z) {
  let best = 1e9;
  for (const p of PATHS) {
    for (let i = 0; i < p.length - 1; i++) {
      const [ax, az] = p[i], [bx, bz] = p[i + 1];
      const dx = bx - ax, dz = bz - az;
      const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
      const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
      if (d < best) best = d;
    }
  }
  return best + noise.noise(x * 0.2, z * 0.2) * 0.8;
}

const rw = (id, inner, x, z) => {
  const r = REG[id];
  return 1 - smoothstep(r.r * inner, r.r, Math.hypot(x - r.x, z - r.z));
};

function grutaInfo(x, z) {
  const G = REG.gruta;
  const dx = x - G.x, dz = z - G.z;
  const d = Math.hypot(dx, dz);
  const ang = Math.atan2(dx, -dz);
  const gap = smoothstep(0.42, 0.2, Math.abs(ang));
  return { d, gap };
}

function computeHeight(x, z) {
  let h = 4 + noise.fbm(x * 0.011, z * 0.011, 4) * 7 + noise.fbm(x * 0.05 + 33, z * 0.05, 2) * 1.0;
  const m = smoothstep(-95, -175, z);
  h += m * (16 + noise.fbm(x * 0.018 + 9, z * 0.018 - 4, 4) * 18 + Math.abs(noise.noise(x * 0.03, z * 0.03)) * 10);
  h = lerp(h, 3 + (h - 4) * 0.25, rw('planicie', 0.5, x, z));
  const L = REG.lago;
  const dl = Math.hypot(x - L.x, z - L.z) + noise.noise(x * 0.05, z * 0.05) * 8;
  h = lerp(h, -4.5, 1 - smoothstep(L.r * 0.35, L.r * 0.95, dl));
  h = lerp(h, 3.2, rw('vila', 0.75, x, z));
  h = lerp(h, h * 0.5 + 2.5, rw('covil', 0.6, x, z));
  h = lerp(h, 20, rw('acampamento', 0.7, x, z));
  const g = grutaInfo(x, z);
  h = lerp(h, 1.5 + noise.fbm(x * 0.1, z * 0.1, 2) * 0.4, 1 - smoothstep(25, 32, g.d));
  const wall = smoothstep(26, 33, g.d) * (1 - smoothstep(44, 58, g.d));
  h += wall * (16 + noise.fbm(x * 0.08, z * 0.08, 2) * 4) * (1 - g.gap);
  const e = Math.max(Math.abs(x), Math.abs(z));
  h += smoothstep(200, 236, e) * 34;
  return h;
}

const C = (hex) => new THREE.Color(hex);
const COL = {
  grass: C(0x4f8a3a), forest: C(0x3a6e2e), plains: C(0x98b050), sand: C(0xd8c78e), under: C(0x5b6e5a),
  rock: C(0x7a7470), snow: C(0xe8eef2), stone: C(0x4a4658), stoneWall: C(0x5e586e), dirt: C(0x8f7a52), moss: C(0x5a7a4a),
};

export class World {
  constructor(scene) {
    this.scene = scene;
    this.heights = new Float32Array(N * N);
    this.colliders = new Map();
    this.time = 8;
    this.dayLength = 720;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) this.heights[j * N + i] = computeHeight(-HALF + i * CELL, -HALF + j * CELL);
    }
    this.buildTerrain();
    this.buildWater();
    this.buildSky();
    this.buildVegetation();
    this.buildPlaces();
    this.buildLights();
    this.buildMinimapImage();
  }

  // Altura exata do triângulo do terreno em (x, z).
  heightAt(x, z) {
    const fx = clamp((x + HALF) / CELL, 0, SEG - 0.0001);
    const fz = clamp((z + HALF) / CELL, 0, SEG - 0.0001);
    const i = Math.floor(fx), j = Math.floor(fz);
    const u = fx - i, v = fz - j;
    const H = this.heights;
    const ha = H[j * N + i], hb = H[(j + 1) * N + i], hc = H[(j + 1) * N + i + 1], hd = H[j * N + i + 1];
    if (u + v <= 1) return ha + (hd - ha) * u + (hb - ha) * v;
    return hc + (hb - hc) * (1 - u) + (hd - hc) * (1 - v);
  }

  // Quanto de grama existe em (x, z) (0 a 1) e a cor dela, pela cor do terreno.
  grassAt(x, z, out) {
    const i = Math.round((x + HALF) / CELL), j = Math.round((z + HALF) / CELL);
    if (i < 0 || j < 0 || i >= N || j >= N) return 0;
    const k = j * N + i, c = this.colors;
    const r = c[k * 3], g = c[k * 3 + 1], b = c[k * 3 + 2];
    out.setRGB(r * 0.9, g * 1.05, b * 0.8);
    if (this.heights[k] < 0.4 || this.heights[k] > 28) return 0;
    return clamp((g - Math.max(r, b) * 1.08) * 9, 0, 1);
  }

  enableGrass(on) {
    if (on && !this.grass) this.grass = new Grass(this, this.scene);
    if (this.grass) this.grass.mesh.visible = on;
    if (!on && this.grass) { this.scene.remove(this.grass.mesh); this.grass = null; }
  }

  groundAt(x, z) { return Math.max(this.heightAt(x, z), WATER_Y - 0.25); }
  inWater(x, z) { return this.heightAt(x, z) < WATER_Y - 0.3; }

  regionAt(x, z) {
    if (Math.hypot(x - REG.gruta.x, z - REG.gruta.z) < REG.gruta.r) return REG.gruta;
    for (const id of ['vila', 'covil', 'acampamento']) {
      const r = REG[id];
      if (Math.hypot(x - r.x, z - r.z) < r.r) return r;
    }
    if (Math.hypot(x - REG.lago.x, z - REG.lago.z) < REG.lago.r * 0.9) return REG.lago;
    if (z < -115) return REG.montanhas;
    if (x > 100 && z > 25) return REG.planicie;
    return { id: 'floresta', nome: 'Floresta Selvagem' };
  }

  colorAt(x, z, h, slope) {
    const c = COL.grass.clone();
    c.lerp(COL.forest, clamp(0.5 + noise.fbm(x * 0.03, z * 0.03, 2), 0, 1));
    c.lerp(COL.plains, rw('planicie', 0.4, x, z));
    const mtn = smoothstep(-100, -150, z);
    c.lerp(COL.rock, mtn * clamp((h - 12) / 10, 0, 1));
    c.lerp(COL.rock, smoothstep(0.7, 1.3, slope));
    c.lerp(COL.dirt, (1 - smoothstep(1.2, 3.6, distToPaths(x, z))) * 0.85);
    c.lerp(COL.dirt, rw('vila', 0.5, x, z) * 0.6);
    c.lerp(COL.dirt, rw('acampamento', 0.6, x, z) * 0.5);
    const g = grutaInfo(x, z);
    const inCave = 1 - smoothstep(30, 40, g.d);
    c.lerp(g.d < 28 ? COL.stone : COL.stoneWall, inCave * (1 - g.gap * smoothstep(20, 34, g.d) * 0.7));
    if (h < 1.2) c.lerp(COL.sand, smoothstep(1.2, 0.2, h) * (1 - inCave));
    if (h < -0.6) c.lerp(COL.under, smoothstep(-0.6, -2.5, h));
    c.lerp(COL.snow, smoothstep(30, 36, h + noise.noise(x * 0.1, z * 0.1) * 2));
    const v = 1 + noise.noise(x * 0.35, z * 0.35) * 0.06;
    c.r *= v; c.g *= v; c.b *= v;
    return c;
  }

  buildTerrain() {
    const pos = new Float32Array(N * N * 3);
    const col = new Float32Array(N * N * 3);
    this.colors = col;
    const H = this.heights;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const k = j * N + i;
        const x = -HALF + i * CELL, z = -HALF + j * CELL, h = H[k];
        pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
        const hx = H[j * N + Math.min(N - 1, i + 1)] - H[j * N + Math.max(0, i - 1)];
        const hz = H[Math.min(N - 1, j + 1) * N + i] - H[Math.max(0, j - 1) * N + i];
        const slope = Math.hypot(hx, hz) / (2 * CELL);
        const c = this.colorAt(x, z, h, slope);
        col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
      }
    }
    const idx = new Uint32Array(SEG * SEG * 6);
    let p = 0;
    for (let j = 0; j < SEG; j++) {
      for (let i = 0; i < SEG; i++) {
        const a = j * N + i, b = (j + 1) * N + i, c = (j + 1) * N + i + 1, d = j * N + i + 1;
        idx[p++] = a; idx[p++] = b; idx[p++] = d;
        idx[p++] = b; idx[p++] = c; idx[p++] = d;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals();
    this.terrain = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }));
    this.terrain.receiveShadow = true;
    this.scene.add(this.terrain);
  }

  // Água com ondas, reflexo do céu, brilho do sol, parte rasa mais clara e espuma na margem.
  buildWater() {
    const hm = new Uint16Array(N * N);
    for (let i = 0; i < N * N; i++) hm[i] = THREE.DataUtils.toHalfFloat(clamp(this.heights[i], -60, 60));
    const heightTex = new THREE.DataTexture(hm, N, N, THREE.RedFormat, THREE.HalfFloatType);
    heightTex.magFilter = THREE.LinearFilter;
    heightTex.minFilter = THREE.LinearFilter;
    heightTex.needsUpdate = true;
    this.waterUniforms = {
      uTime: { value: 0 }, uHeight: { value: heightTex }, uHalf: { value: HALF },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color(1, 1, 1) },
      uSky: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uDay: { value: 1 },
      uFogColor: { value: new THREE.Color() }, uFogNear: { value: 50 }, uFogFar: { value: 200 },
    };
    const g = new THREE.PlaneGeometry(HALF * 2, HALF * 2, 1, 1).rotateX(-Math.PI / 2);
    this.water = new THREE.Mesh(g, new THREE.ShaderMaterial({
      uniforms: this.waterUniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: `
        varying vec3 vW;
        void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `
        uniform float uTime, uHalf, uDay, uFogNear, uFogFar;
        uniform sampler2D uHeight;
        uniform vec3 uSunDir, uSunColor, uSky, uHorizon, uFogColor;
        varying vec3 vW;
        vec2 wave(vec2 p, vec2 d, float f, float s){ float ph = dot(p,d)*f + uTime*s; return d * cos(ph) * f; }
        void main(){
          vec2 p = vW.xz;
          vec2 gsum = wave(p, normalize(vec2(1.0,0.3)), 0.35, 1.3)*0.10 + wave(p, normalize(vec2(-0.4,1.0)), 0.6, 1.9)*0.06
                    + wave(p, normalize(vec2(0.7,-0.8)), 1.3, 2.7)*0.035 + wave(p, normalize(vec2(-1.0,-0.2)), 2.6, 3.8)*0.02;
          vec3 n = normalize(vec3(-gsum.x, 1.0, -gsum.y));
          vec3 v = normalize(cameraPosition - vW);
          float fres = 0.04 + 0.96 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
          vec3 r = reflect(-v, n);
          vec3 refl = mix(uHorizon, uSky, clamp(r.y*1.5, 0.0, 1.0));
          float ground = texture2D(uHeight, (p + uHalf) / (2.0*uHalf)).r;
          float depth = max(0.0, -ground);
          vec3 shallow = vec3(0.25, 0.75, 0.78) * (0.35 + 0.65*uDay);
          vec3 deep = vec3(0.03, 0.2, 0.36) * (0.3 + 0.7*uDay);
          vec3 base = mix(shallow, deep, smoothstep(0.0, 3.5, depth));
          vec3 col = mix(base, refl, fres * 0.85);
          vec3 h = normalize(uSunDir + v);
          col += uSunColor * pow(max(dot(n, h), 0.0), 180.0) * 2.0 * uDay;
          float foam = smoothstep(0.55, 0.0, depth) * (0.55 + 0.45*sin(depth*14.0 - uTime*2.2 + p.x*0.3));
          col = mix(col, vec3(0.92, 0.97, 1.0) * (0.4 + 0.6*uDay), clamp(foam, 0.0, 1.0) * 0.6);
          float alpha = clamp(0.35 + depth*0.35 + fres*0.4, 0.0, 0.94);
          float fogF = smoothstep(uFogNear, uFogFar, length(cameraPosition - vW));
          gl_FragColor = vec4(mix(col, uFogColor, fogF), mix(alpha, 1.0, fogF));
        }`,
    }));
    this.water.position.y = WATER_Y;
    this.water.renderOrder = 2;
    this.scene.add(this.water);
  }

  buildSky() {
    this.skyUniforms = {
      top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uTime: { value: 0 }, uDay: { value: 1 }, uSunColor: { value: new THREE.Color(1, 1, 1) },
    };
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(380, 32, 16),
      new THREE.ShaderMaterial({
        uniforms: this.skyUniforms,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: `
          uniform vec3 top, bottom, uSunDir, uSunColor; uniform float uTime, uDay; varying vec3 vP;
          float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
          float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
            return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
          float fbm(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<5;i++){ s+=a*n(p); p*=2.03; a*=0.5; } return s; }
          void main(){
            vec3 d = normalize(vP);
            float t = clamp(d.y*1.6+0.05,0.0,1.0);
            vec3 col = mix(bottom, top, pow(t,0.7));
            float sd = max(dot(d, normalize(uSunDir)), 0.0);
            col += uSunColor * (pow(sd, 900.0)*6.0 + pow(sd, 12.0)*0.35) * step(0.0, uSunDir.y + 0.1);
            if (d.y > 0.0) {
              vec2 cp = d.xz / (d.y + 0.25) * 1.6 + vec2(uTime*0.012, uTime*0.004);
              float c = smoothstep(0.52, 0.85, fbm(cp));
              vec3 cc = mix(vec3(0.22,0.25,0.35), vec3(1.0), uDay) + uSunColor*pow(sd,6.0)*0.4;
              col = mix(col, cc, c * smoothstep(0.0, 0.25, d.y) * 0.85);
            }
            gl_FragColor = vec4(col, 1.0);
          }`,
      }),
    );
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);
    const rng = mulberry32(9);
    const sp = new Float32Array(700 * 3);
    for (let i = 0; i < 700; i++) {
      const a = rng() * Math.PI * 2, e = Math.asin(0.08 + rng() * 0.92);
      sp[i * 3] = Math.cos(a) * Math.cos(e) * 350;
      sp[i * 3 + 1] = Math.sin(e) * 350;
      sp[i * 3 + 2] = Math.sin(a) * Math.cos(e) * 350;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    this.scene.add(this.stars);
    this.scene.fog = new THREE.Fog(0xbfe3ff, 80, 260);
  }

  addCollider(x, z, r) {
    const key = `${Math.floor(x / 8)},${Math.floor(z / 8)}`;
    let a = this.colliders.get(key);
    if (!a) { a = []; this.colliders.set(key, a); }
    a.push({ x, z, r });
  }

  // Empurra um círculo (pos, raio) para fora de árvores e pedras.
  resolveCollision(pos, radius) {
    const cx = Math.floor(pos.x / 8), cz = Math.floor(pos.z / 8);
    for (let a = -1; a <= 1; a++) {
      for (let b = -1; b <= 1; b++) {
        const list = this.colliders.get(`${cx + a},${cz + b}`);
        if (!list) continue;
        for (const c of list) {
          const dx = pos.x - c.x, dz = pos.z - c.z;
          const d = Math.hypot(dx, dz), min = c.r + radius;
          if (d < min && d > 0.0001) {
            pos.x = c.x + (dx / d) * min;
            pos.z = c.z + (dz / d) * min;
          }
        }
      }
    }
    const lim = HALF - 10;
    pos.x = clamp(pos.x, -lim, lim);
    pos.z = clamp(pos.z, -lim, lim);
  }

  treeDensity(x, z, h) {
    if (h < 0.9 || h > 31) return 0;
    const g = grutaInfo(x, z);
    if (g.d < 62) return 0;
    for (const id of ['vila', 'acampamento']) if (Math.hypot(x - REG[id].x, z - REG[id].z) < REG[id].r * 1.05) return 0;
    if (rw('covil', 0.8, x, z) > 0) return 0.02;
    if (distToPaths(x, z) < 4.5) return 0;
    if (z < -110) return 0.13;
    if (x > 100 && z > 25) return 0.025;
    const clearing = noise.fbm(x * 0.02 + 50, z * 0.02, 2);
    return clearing > 0.32 ? 0.04 : 0.3;
  }

  buildVegetation() {
    const rng = mulberry32(42);
    const round = [], pine = [], rocks = [];
    for (let gx = -HALF + 6; gx < HALF - 6; gx += 4.2) {
      for (let gz = -HALF + 6; gz < HALF - 6; gz += 4.2) {
        const x = gx + (rng() - 0.5) * 3.6, z = gz + (rng() - 0.5) * 3.6;
        const h = this.heightAt(x, z);
        const d = this.treeDensity(x, z, h);
        if (rng() < d) {
          const s = 0.8 + rng() * 0.8;
          (z < -100 || rng() < 0.18 ? pine : round).push({ x, z, h, s, r: rng() });
          this.addCollider(x, z, 0.45 * s);
        } else {
          let rd = 0.004;
          if (z < -110) rd = 0.07;
          if (x > 100 && z > 25) rd = 0.012;
          if (rw('covil', 0.9, x, z) > 0) rd = 0.12;
          const g = grutaInfo(x, z);
          if (g.d > 27 && g.d < 50 && g.gap < 0.5) rd = 0.14;
          if (g.d < 27 || distToPaths(x, z) < 3 || h < -1) rd = 0;
          if (rng() < rd) {
            const s = 0.5 + rng() * rng() * 2.6;
            rocks.push({ x, z, h, s, r: rng() });
            if (s > 1) this.addCollider(x, z, 0.75 * s);
          }
        }
      }
    }
    const dummy = new THREE.Object3D();
    const tmp = new THREE.Color();
    this.chunks = [];
    const CH = 80;
    // Instâncias agrupadas em blocos de 80 m: a câmera descarta os blocos fora de vista.
    this.lodDist = 110;
    const scatter = (geometry, material, list, place, color, lod) => {
      const buckets = new Map();
      for (const o of list) {
        const k = `${Math.floor(o.x / CH)},${Math.floor(o.z / CH)}`;
        if (!buckets.has(k)) buckets.set(k, []);
        buckets.get(k).push(o);
      }
      for (const [k, items] of buckets) {
        const im = new THREE.InstancedMesh(geometry, material, items.length);
        items.forEach((o, i) => {
          place(o);
          dummy.updateMatrix();
          im.setMatrixAt(i, dummy.matrix);
          if (color) im.setColorAt(i, color(o));
        });
        im.computeBoundingSphere();
        im.castShadow = lod !== 'longe';
        im.receiveShadow = true;
        const [cx, cz] = k.split(',').map((v) => (+v + 0.5) * CH);
        this.chunks.push({ mesh: im, x: cx, z: cz, lod });
        this.scene.add(im);
      }
    };
    const standing = (dy) => (o) => { dummy.position.set(o.x, o.h + dy, o.z); dummy.rotation.set(0, o.r * 6, 0); dummy.scale.setScalar(o.s); };
    const lambert = () => new THREE.MeshLambertMaterial({ flatShading: true });
    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.28, 2, 6);
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2e, flatShading: true });
    const customTree = customParts('arvore'), customPine = customParts('pinheiro'), customRock = customParts('pedra');
    // Árvore do Meshy perto da câmera; a versão simples só lá longe (economiza polígonos).
    const far = customTree ? 'longe' : undefined;
    if (customTree) customTree.forEach((p) => scatter(p.geometry, p.material, round, standing(-0.1), null, 'perto'));
    scatter(trunkGeo, trunkMat, round, (o) => { standing(0)(o); dummy.position.y = o.h + o.s; }, null, far);
    const crown = new THREE.IcosahedronGeometry(1.6, 1), crownMat = lambert();
    scatter(crown, crownMat, round, (o) => {
      dummy.position.set(o.x, o.h + o.s * 3.2, o.z); dummy.rotation.set(0, o.r * 6, 0);
      dummy.scale.set(o.s * 1.1, o.s * (0.9 + o.r * 0.4), o.s * 1.1);
    }, (o) => tmp.setHSL(0.26 + o.r * 0.07, 0.45, 0.28 + o.r * 0.1), far);
    if (customPine) customPine.forEach((p) => scatter(p.geometry, p.material, pine, standing(-0.1)));
    else {
      scatter(trunkGeo, trunkMat, pine, (o) => { standing(0)(o); dummy.position.y = o.h + o.s; });
      const cone = new THREE.ConeGeometry(1.5, 4.2, 7), m = lambert();
      scatter(cone, m, pine, (o) => { standing(0)(o); dummy.position.y = o.h + o.s * 3.6; },
        (o) => tmp.setHSL(0.36 + o.r * 0.05, 0.4, 0.2 + o.r * 0.08));
    }
    if (customRock) {
      customRock.forEach((p) => scatter(p.geometry, p.material, rocks, (o) => {
        dummy.position.set(o.x, o.h - o.s * 0.15, o.z); dummy.rotation.set(0, o.r * 7, 0); dummy.scale.setScalar(o.s * (0.8 + o.r * 0.4));
      }));
    } else {
      scatter(new THREE.DodecahedronGeometry(1, 0), lambert(), rocks, (o) => {
        dummy.position.set(o.x, o.h + o.s * 0.3, o.z); dummy.rotation.set(o.r * 3, o.r * 7, o.r * 2);
        dummy.scale.set(o.s, o.s * (0.6 + o.r * 0.5), o.s * (0.8 + o.r * 0.4));
      }, (o) => tmp.setHSL(0.7, 0.06, 0.38 + o.r * 0.15));
    }
    // Cristais da gruta
    const crystals = [];
    for (let i = 0; i < 46; i++) {
      const a = rng() * Math.PI * 2, d = 18 + rng() * 11;
      const x = REG.gruta.x + Math.sin(a) * d, z = REG.gruta.z - Math.cos(a) * d;
      if (Math.abs(a) < 0.5 || Math.abs(a - Math.PI * 2) < 0.5) continue;
      if (Math.hypot(x - PLACES.dragao.x, z - PLACES.dragao.z) < 17) continue;
      crystals.push({ x, z, h: this.heightAt(x, z), s: 0.6 + rng() * 1.6, r: rng() });
    }
    const crystalMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.6, 0), new THREE.MeshBasicMaterial(), crystals.length);
    crystals.forEach((o, i) => {
      dummy.position.set(o.x, o.h + o.s * 0.6, o.z); dummy.rotation.set(o.r - 0.5, o.r * 5, (o.r - 0.5) * 0.8);
      dummy.scale.set(o.s * 0.6, o.s * 1.8, o.s * 0.6); dummy.updateMatrix();
      crystalMesh.setMatrixAt(i, dummy.matrix);
      crystalMesh.setColorAt(i, tmp.setHSL(o.r > 0.5 ? 0.75 : 0.52, 0.8, 0.62));
    });
    this.scene.add(crystalMesh);
  }

  buildPlaces() {
    this.hutSpots = [];
    this.villageLevel = -1;
    this.villageGroup = new THREE.Group();
    this.scene.add(this.villageGroup);
    const V = REG.vila;
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.3;
      const x = V.x + Math.cos(a) * 15, z = V.z + Math.sin(a) * 15;
      this.hutSpots.push({ x, z, rot: Math.atan2(V.x - x, V.z - z) });
      this.addCollider(x, z, 2.6);
    }
    this.setVillageLevel(0);
    this.animated = [];
    const fire = makeCampfire();
    fire.root.position.set(V.x, this.heightAt(V.x, V.z), V.z);
    this.scene.add(fire.root);
    this.animated.push(fire);
    this.addCollider(V.x, V.z, 1);
    const A = REG.acampamento;
    const hide = new THREE.MeshLambertMaterial({ color: 0x5a4030, flatShading: true });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.6;
      const x = A.x + Math.cos(a) * 13, z = A.z + Math.sin(a) * 13;
      const custom = makeCustom('tenda');
      if (custom) {
        custom.root.position.set(x, this.heightAt(x, z) - 0.1, z);
        custom.root.rotation.y = Math.atan2(A.x - x, A.z - z);
        this.scene.add(custom.root);
      } else {
        const tent = new THREE.Mesh(new THREE.ConeGeometry(3.2, 4.5, 6), hide);
        tent.position.set(x, this.heightAt(x, z) + 2.2, z);
        this.scene.add(tent);
      }
      this.addCollider(x, z, 3);
    }
    const f2 = makeCampfire();
    f2.root.position.set(A.x - 4, this.heightAt(A.x - 4, A.z + 3), A.z + 3);
    f2.root.scale.setScalar(1.6);
    this.scene.add(f2.root);
    this.animated.push(f2);
  }

  setVillageLevel(level) {
    if (level === this.villageLevel) return;
    this.villageLevel = level;
    this.villageGroup.clear();
    this.hutSpots.forEach((s, i) => {
      const lvl = i < level * 3 ? 1 : 0;
      const hut = makeCustom(lvl ? 'casa' : 'cabana') || makeHut(lvl);
      hut.root.position.set(s.x, this.heightAt(s.x, s.z) - 0.2, s.z);
      hut.root.rotation.y = s.rot;
      hut.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      this.villageGroup.add(hut.root);
    });
  }

  buildLights() {
    this.hemi = new THREE.HemisphereLight(0xcfe8ff, 0x4a3a2a, 0.9);
    this.sun = new THREE.DirectionalLight(0xfff1dc, 1.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 260;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.caveLight = new THREE.PointLight(0x9b7bff, 40, 45, 1.6);
    this.caveLight.position.set(PLACES.dragao.x, 8, PLACES.dragao.z - 6);
    this.scene.add(this.caveLight);
  }

  buildMinimapImage() {
    const S = 160;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    const img = g.createImageData(S, S);
    for (let py = 0; py < S; py++) {
      for (let px = 0; px < S; px++) {
        const i = Math.round((px / (S - 1)) * SEG), j = Math.round((py / (S - 1)) * SEG);
        const k = j * N + i;
        const o = (py * S + px) * 4;
        if (this.heights[k] < WATER_Y) {
          img.data[o] = 42; img.data[o + 1] = 120; img.data[o + 2] = 190;
        } else {
          img.data[o] = this.colors[k * 3] * 255;
          img.data[o + 1] = this.colors[k * 3 + 1] * 255;
          img.data[o + 2] = this.colors[k * 3 + 2] * 255;
        }
        img.data[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    this.minimapImage = c;
  }

  // Pontos para ervas e minérios.
  itemSpots() {
    const rng = mulberry32(77);
    const herbs = [], ores = [];
    const G = REG.gruta;
    const caveHerbs = [[-9, -6], [8, -9], [-14, 4], [13, 3], [-5, -16], [6, -18]];
    caveHerbs.forEach(([dx, dz]) => herbs.push({ x: G.x + dx, z: G.z + dz, cave: true }));
    while (herbs.length < 40) {
      const x = (rng() - 0.5) * 380, z = (rng() - 0.5) * 300;
      const r = this.regionAt(x, z);
      const h = this.heightAt(x, z);
      if ((r.id === 'floresta' || r.id === 'lago') && h > 1.2 && distToPaths(x, z) > 3) herbs.push({ x, z });
    }
    [[-20, 8], [21, 4], [-18, -12], [19, -14], [0, -24]].forEach(([dx, dz]) => ores.push({ x: G.x + dx, z: G.z + dz, cave: true }));
    while (ores.length < 20) {
      const x = (rng() - 0.5) * 380, z = -120 - rng() * 100;
      const h = this.heightAt(x, z);
      if (h < 30 && Math.abs(x) < 200) ores.push({ x, z });
    }
    return { herbs, ores };
  }

  update(dt, focus, camera) {
    this.time = (this.time + (dt * 24) / this.dayLength) % 24;
    const th = (this.time / 24) * Math.PI * 2 - Math.PI / 2;
    const el = Math.sin(th);
    const day = smoothstep(-0.12, 0.25, el);
    const sunset = clamp(1 - Math.abs(el - 0.04) / 0.2, 0, 1);
    this.dayFactor = day;
    const top = new THREE.Color(0x070b1e).lerp(C(0x3f86d6), day);
    const bottom = new THREE.Color(0x1a2040).lerp(C(0xbfe3ff), day).lerp(C(0xff9a5a), sunset * 0.7);
    this.skyUniforms.top.value.copy(top);
    this.skyUniforms.bottom.value.copy(bottom);
    this.scene.fog.color.copy(bottom);
    this.stars.material.opacity = 1 - day;
    this.sky.position.copy(camera.position);
    const far = this.scene.fog.far + 60;
    this.stars.position.copy(camera.position);
    const dir = new THREE.Vector3(Math.cos(th), Math.max(0.15, Math.abs(el)), 0.35).normalize();
    if (el < -0.05) dir.x *= -1;
    // A sombra acompanha o jogador em passos de 2 m (evita tremer).
    const fx = Math.round(focus.x / 2) * 2, fz = Math.round(focus.z / 2) * 2;
    this.sun.target.position.set(fx, focus.y, fz);
    this.sun.position.set(fx, focus.y, fz).addScaledVector(dir, 120);
    this.sun.color.set(el < -0.05 ? 0x8aa0ff : 0xfff1dc).lerp(C(0xffb070), sunset * 0.6);
    this.sun.intensity = el < -0.05 ? 0.55 : 0.4 + 1.3 * day;
    this.hemi.intensity = 0.55 + 0.4 * day;
    this.hemi.color.set(0x5a6cb0).lerp(C(0xcfe8ff), day);
    const t = performance.now() / 1000;
    for (const a of this.animated) a.anim(dt, { t });
    const sunDir = new THREE.Vector3(Math.cos(th), Math.sin(th), 0.35).normalize();
    this.skyUniforms.uSunDir.value.copy(sunDir);
    this.skyUniforms.uTime.value = t;
    this.skyUniforms.uDay.value = day;
    this.skyUniforms.uSunColor.value.set(0xfff1dc).lerp(C(0xff8a4a), sunset);
    const wu = this.waterUniforms;
    wu.uTime.value = t;
    wu.uSunDir.value.copy(sunDir);
    wu.uSunColor.value.copy(this.skyUniforms.uSunColor.value);
    wu.uSky.value.copy(top);
    wu.uHorizon.value.copy(bottom);
    wu.uDay.value = day;
    wu.uFogColor.value.copy(this.scene.fog.color);
    wu.uFogNear.value = this.scene.fog.near;
    wu.uFogFar.value = this.scene.fog.far;
    if (this.grass) this.grass.update(focus, t, this);
    for (const c of this.chunks) {
      const d = Math.hypot(c.x - camera.position.x, c.z - camera.position.z);
      c.mesh.visible = d < far && (c.lod === 'perto' ? d < this.lodDist : c.lod === 'longe' ? d >= this.lodDist : true);
    }
  }

  get hourLabel() {
    const h = Math.floor(this.time), m = Math.floor((this.time - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  get isNight() { return this.dayFactor < 0.35; }
}
