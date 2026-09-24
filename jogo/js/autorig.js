// Esqueleto automático para modelos do Meshy que não são humanoides (lobo, aranha,
// serpente, morcego, lagarto, dragão). Os pesos de cada osso são calculados pela
// posição dos vértices; as animações (andar, atacar, bater asas) são feitas em código.
import * as THREE from 'three';

const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Qual esqueleto cada modelo usa.
export const RIG_KIND = {
  lobo: 'quadrupede', loboAlfa: 'quadrupede', lagarto: 'quadrupede', formaLobo: 'quadrupede',
  aranha: 'aranha', serpente: 'serpente', morcego: 'asas', dragao: 'dragao',
};

function bounds(parts) {
  const b = new THREE.Box3();
  for (const p of parts) { p.geometry.computeBoundingBox(); b.union(p.geometry.boundingBox); }
  return b;
}

// Cada spec devolve: bones [{pivot:[x,y,z]}] (o osso 0 é o corpo) e weight(x,y,z) -> [osso, peso].
function specFor(kind, b) {
  const W = b.max.x - b.min.x, H = b.max.y - b.min.y, L = b.max.z - b.min.z;
  const cz = (b.min.z + b.max.z) / 2;
  if (kind === 'quadrupede') {
    const hip = b.min.y + H * 0.48;
    const legs = [[-1, 1], [1, 1], [-1, -1], [1, -1]];
    const bones = [{ pivot: [0, hip, cz] }];
    legs.forEach(([sx, sz]) => bones.push({ pivot: [sx * W * 0.18, hip, cz + sz * L * 0.28], leg: [sx, sz] }));
    bones.push({ pivot: [0, b.min.y + H * 0.62, cz + L * 0.22], head: true });
    bones.push({ pivot: [0, b.min.y + H * 0.5, cz - L * 0.36], tail: true });
    return {
      bones,
      weight(x, y, z) {
        const zr = (z - cz) / L;
        const head = ss(0.2, 0.33, zr) * ss(0.4, 0.55, (y - b.min.y) / H);
        const tail = ss(-0.34, -0.44, zr) * ss(0.25, 0.4, (y - b.min.y) / H);
        const leg = ss(0.5, 0.3, (y - b.min.y) / H) * (1 - ss(0.4, 0.5, Math.abs(zr)) * 0.5);
        if (head >= leg && head >= tail && head > 0) return [5, head];
        if (tail >= leg && tail > 0) return [6, tail];
        if (leg > 0) return [1 + (x < 0 ? 0 : 1) + (z >= cz ? 0 : 2), leg];
        return [0, 0];
      },
      anim(bs, dt, s, st) {
        const moving = s.moving;
        st.phase = (st.phase || 0) + dt * (moving ? 3 + s.speed * 1.1 : 0);
        const a = moving ? Math.sin(st.phase) * 0.55 : 0;
        const k = Math.min(1, dt * 12);
        const set = (bone, v) => { bone.rotation.x += (v - bone.rotation.x) * k; };
        set(bs[1], a); set(bs[4], a); set(bs[2], -a); set(bs[3], -a);
        bs[0].position.y = bs[0].userData.y0 + (moving ? Math.abs(Math.sin(st.phase * 2)) * H * 0.03 : Math.sin(s.t * 2) * H * 0.008);
        const lunge = s.attack >= 0 ? Math.sin(s.attack * Math.PI) : 0;
        bs[5].rotation.x = -lunge * 0.5 + (moving ? Math.sin(st.phase * 2) * 0.06 : Math.sin(s.t * 1.3) * 0.05);
        bs[5].rotation.y = s.look ?? 0;
        bs[6].rotation.y = Math.sin(s.t * (moving ? 10 : 3)) * 0.35;
      },
    };
  }
  if (kind === 'aranha') {
    const bodyR = 0.32, hip = b.min.y + H * 0.55;
    const bones = [{ pivot: [0, hip, cz] }];
    const sectors = 8;
    for (let i = 0; i < sectors; i++) {
      const ang = (i / sectors) * Math.PI * 2 + Math.PI / sectors;
      bones.push({ pivot: [Math.sin(ang) * W * 0.5 * bodyR, hip, cz + Math.cos(ang) * L * 0.5 * bodyR], ang });
    }
    return {
      bones,
      weight(x, y, z) {
        const rn = Math.hypot(x / (W / 2), (z - cz) / (L / 2));
        const w = ss(bodyR, bodyR + 0.25, rn);
        if (w <= 0) return [0, 0];
        let ang = Math.atan2(x, z - cz);
        if (ang < 0) ang += Math.PI * 2;
        return [1 + (Math.floor((ang / (Math.PI * 2)) * sectors) % sectors), w];
      },
      anim(bs, dt, s, st) {
        st.phase = (st.phase || 0) + dt * (s.moving ? 9 + s.speed * 2 : 0);
        for (let i = 1; i < bs.length; i++) {
          const g = bs[i].userData;
          const p = st.phase + (i % 2) * Math.PI;
          const swing = s.moving ? Math.sin(p) * 0.28 : 0;
          const lift = s.moving ? Math.max(0, Math.cos(p)) * 0.35 : Math.sin(s.t * 1.5 + i) * 0.03;
          const axis = new THREE.Vector3(Math.cos(g.ang), 0, -Math.sin(g.ang));
          bs[i].quaternion.setFromAxisAngle(axis, -lift).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), swing));
        }
        const lunge = s.attack >= 0 ? Math.sin(s.attack * Math.PI) : 0;
        bs[0].rotation.x = -lunge * 0.3;
        bs[0].position.y = bs[0].userData.y0 + (s.moving ? Math.abs(Math.sin(st.phase)) * H * 0.03 : 0);
      },
    };
  }
  if (kind === 'serpente') {
    const N = 6;
    const bones = [];
    for (let i = 0; i < N; i++) bones.push({ pivot: [0, b.min.y + H * 0.3, b.max.z - (i / (N - 1)) * L], chain: true });
    return {
      bones,
      weight(x, y, z) {
        const f = ((b.max.z - z) / L) * (N - 1);
        const i = Math.min(N - 2, Math.max(0, Math.floor(f)));
        const t = f - i;
        return [[i, 1 - t], [i + 1, t]];
      },
      anim(bs, dt, s, st) {
        st.phase = (st.phase || 0) + dt * (s.moving ? 4 + s.speed * 1.5 : 1.2);
        for (let i = 1; i < bs.length; i++) bs[i].rotation.y = Math.sin(st.phase - i * 0.9) * (s.moving ? 0.28 : 0.1);
        const lunge = s.attack >= 0 ? Math.sin(s.attack * Math.PI) : 0;
        bs[0].rotation.x = -lunge * 0.6 - (s.moving ? 0 : 0.08 + Math.sin(s.t * 1.5) * 0.05);
        bs[0].rotation.y = Math.sin(st.phase) * 0.15;
      },
    };
  }
  if (kind === 'asas') {
    const cy = b.min.y + H * 0.55;
    return {
      bones: [{ pivot: [0, cy, cz] }, { pivot: [-W * 0.1, cy, cz], side: -1 }, { pivot: [W * 0.1, cy, cz], side: 1 }],
      weight(x) {
        const w = ss(W * 0.08, W * 0.28, Math.abs(x));
        return w > 0 ? [x < 0 ? 1 : 2, w] : [0, 0];
      },
      anim(bs, dt, s) {
        const f = Math.sin(s.t * (s.moving ? 15 : 10));
        bs[1].rotation.z = f * 0.7;
        bs[2].rotation.z = -f * 0.7;
        bs[0].position.y = bs[0].userData.y0 - f * H * 0.08;
        const lunge = s.attack >= 0 ? Math.sin(s.attack * Math.PI) : 0;
        bs[0].rotation.x = lunge * 0.5;
      },
    };
  }
  // dragão: cabeça, duas asas e cauda; respira e acompanha o jogador com a cabeça.
  const bones = [
    { pivot: [0, b.min.y + H * 0.35, cz] },
    { pivot: [0, b.min.y + H * 0.45, cz + L * 0.18], head: true },
    { pivot: [-W * 0.16, b.min.y + H * 0.55, cz] },
    { pivot: [W * 0.16, b.min.y + H * 0.55, cz] },
    { pivot: [0, b.min.y + H * 0.2, cz - L * 0.2] },
  ];
  return {
    bones,
    weight(x, y, z) {
      const zr = (z - cz) / L, yr = (y - b.min.y) / H;
      const head = ss(0.18, 0.32, zr);
      const wing = ss(0.2, 0.35, Math.abs(x) / W) * ss(0.35, 0.5, yr);
      const tail = ss(-0.18, -0.32, zr);
      if (head > 0 && head >= wing) return [1, head];
      if (wing > 0) return [x < 0 ? 2 : 3, wing];
      if (tail > 0) return [4, tail];
      return [0, 0];
    },
    anim(bs, dt, s, st) {
      st.look = (st.look || 0) + ((s.look ?? 0) - (st.look || 0)) * Math.min(1, dt * 1.5);
      bs[1].rotation.y = st.look;
      bs[1].rotation.x = Math.sin(s.t * 0.8) * 0.05;
      bs[2].rotation.z = Math.sin(s.t * 0.6) * 0.08;
      bs[3].rotation.z = -Math.sin(s.t * 0.6) * 0.08;
      bs[4].rotation.y = Math.sin(s.t * 0.5) * 0.15;
      bs[0].scale.y = 1 + Math.sin(s.t * 0.8) * 0.015;
    },
  };
}

const rigCache = new Map();

// Recebe as peças normalizadas (customParts) e devolve { root, mats, anim, height } com esqueleto.
export function makeRigged(id, getParts, height) {
  const kind = RIG_KIND[id];
  if (!kind) return null;
  let rig = rigCache.get(id);
  if (!rig) {
    const parts = getParts();
    if (!parts) return null;
    const b = bounds(parts);
    const spec = specFor(kind, b);
    for (const p of parts) {
      const pos = p.geometry.attributes.position;
      const idx = new Uint16Array(pos.count * 4), wts = new Float32Array(pos.count * 4);
      for (let i = 0; i < pos.count; i++) {
        let r = spec.weight(pos.getX(i), pos.getY(i), pos.getZ(i));
        if (!Array.isArray(r[0])) r = r[1] > 0 && r[0] !== 0 ? [[r[0], r[1]], [0, 1 - r[1]]] : [[r[0], 1]];
        r.slice(0, 4).forEach(([bi, w], k) => { idx[i * 4 + k] = bi; wts[i * 4 + k] = w; });
      }
      p.geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
      p.geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wts, 4));
    }
    rig = { spec, parts };
    rigCache.set(id, rig);
  }
  const { spec, parts } = rig;
  const root = new THREE.Group();
  const bones = spec.bones.map((d) => {
    const bone = new THREE.Bone();
    Object.assign(bone.userData, d);
    return bone;
  });
  // Corpo na origem do pivô; os outros ossos são filhos do corpo (a serpente é uma corrente).
  bones.forEach((bone, i) => {
    const d = spec.bones[i];
    if (i === 0) { bone.position.set(...d.pivot); bone.userData.y0 = d.pivot[1]; return; }
    const parent = d.chain ? bones[i - 1] : bones[0];
    const pp = spec.bones[d.chain ? i - 1 : 0].pivot;
    bone.position.set(d.pivot[0] - pp[0], d.pivot[1] - pp[1], d.pivot[2] - pp[2]);
    parent.add(bone);
  });
  const skeleton = new THREE.Skeleton(bones);
  const mats = [];
  for (const p of parts) {
    const mat = p.material.clone();
    mats.push(mat);
    const mesh = new THREE.SkinnedMesh(p.geometry, mat);
    mesh.frustumCulled = false;
    if (!bones[0].parent) mesh.add(bones[0]);
    root.add(mesh);
    mesh.updateMatrixWorld(true);
    mesh.bind(skeleton);
  }
  const st = {};
  return { root, mats, anim: (dt, s) => spec.anim(bones, dt, s, st), height };
}
