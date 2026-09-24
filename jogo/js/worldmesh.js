// Usa um mapa inteiro gerado no Meshy como chão do jogo.
// Lê a altura e a cor da superfície (de cima para baixo) em cada ponto da grade do terreno,
// para a física, a água, o minimapa e a grama baterem com o que aparece na tela.
import * as THREE from 'three';

// Prepara o modelo: escala para cobrir o mapa (size x size metros), centraliza e achata a altura.
export function fitWorldMesh(scene, size, maxHeight) {
  scene.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(scene);
  const s = size / Math.max(b.max.x - b.min.x, b.max.z - b.min.z);
  const h = (b.max.y - b.min.y) * s;
  const v = h > maxHeight ? maxHeight / h : 1;
  const root = new THREE.Group();
  root.add(scene);
  scene.scale.multiplyScalar(s);
  scene.scale.y *= v;
  scene.position.set(-((b.min.x + b.max.x) / 2) * s, -b.min.y * s * v, -((b.min.z + b.max.z) / 2) * s);
  root.updateMatrixWorld(true);
  return root;
}

// Junta todos os triângulos (já em coordenadas do mundo) com as UVs e a textura.
function collectTriangles(root) {
  const tris = [];
  let image = null;
  const a = new THREE.Vector3(), bb = new THREE.Vector3(), c = new THREE.Vector3();
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (!image && o.material.map && o.material.map.image) image = o.material.map.image;
    const g = o.geometry, p = g.attributes.position, uv = g.attributes.uv, idx = g.index;
    const n = idx ? idx.count : p.count;
    for (let i = 0; i < n; i += 3) {
      const i0 = idx ? idx.getX(i) : i, i1 = idx ? idx.getX(i + 1) : i + 1, i2 = idx ? idx.getX(i + 2) : i + 2;
      a.fromBufferAttribute(p, i0).applyMatrix4(o.matrixWorld);
      bb.fromBufferAttribute(p, i1).applyMatrix4(o.matrixWorld);
      c.fromBufferAttribute(p, i2).applyMatrix4(o.matrixWorld);
      tris.push([a.x, a.y, a.z, bb.x, bb.y, bb.z, c.x, c.y, c.z,
        uv ? uv.getX(i0) : 0, uv ? uv.getY(i0) : 0, uv ? uv.getX(i1) : 0, uv ? uv.getY(i1) : 0, uv ? uv.getX(i2) : 0, uv ? uv.getY(i2) : 0]);
    }
  });
  return { tris, image };
}

// Amostra altura e cor numa grade N x N cobrindo [-half, half].
export function sampleWorldMesh(root, N, half) {
  const { tris, image } = collectTriangles(root);
  const G = 160, cell = (half * 2) / G;
  const buckets = Array.from({ length: G * G }, () => []);
  const toCell = (v) => Math.min(G - 1, Math.max(0, Math.floor((v + half) / cell)));
  tris.forEach((t, k) => {
    const x0 = toCell(Math.min(t[0], t[3], t[6])), x1 = toCell(Math.max(t[0], t[3], t[6]));
    const z0 = toCell(Math.min(t[2], t[5], t[8])), z1 = toCell(Math.max(t[2], t[5], t[8]));
    for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) buckets[j * G + i].push(k);
  });
  let px = null, iw = 0, ih = 0;
  if (image) {
    const cv = document.createElement('canvas');
    iw = cv.width = Math.min(1024, image.width);
    ih = cv.height = Math.min(1024, image.height);
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0, iw, ih);
    px = ctx.getImageData(0, 0, iw, ih).data;
  }
  const heights = new Float32Array(N * N), colors = new Float32Array(N * N * 3), hit = new Uint8Array(N * N);
  const step = (half * 2) / (N - 1);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = -half + i * step, z = -half + j * step;
      const list = buckets[toCell(z) * G + toCell(x)];
      let best = -1e9, bu = 0, bv = 0;
      for (const k of list) {
        const t = tris[k];
        // Ponto dentro do triângulo, projetado no plano XZ (coordenadas baricêntricas).
        const d = (t[5] - t[8]) * (t[0] - t[6]) + (t[6] - t[3]) * (t[2] - t[8]);
        if (Math.abs(d) < 1e-9) continue;
        const l1 = ((t[5] - t[8]) * (x - t[6]) + (t[6] - t[3]) * (z - t[8])) / d;
        const l2 = ((t[8] - t[2]) * (x - t[6]) + (t[0] - t[6]) * (z - t[8])) / d;
        const l3 = 1 - l1 - l2;
        if (l1 < -1e-4 || l2 < -1e-4 || l3 < -1e-4) continue;
        const y = l1 * t[1] + l2 * t[4] + l3 * t[7];
        if (y > best) { best = y; bu = l1 * t[9] + l2 * t[11] + l3 * t[13]; bv = l1 * t[10] + l2 * t[12] + l3 * t[14]; }
      }
      const k = j * N + i;
      if (best > -1e8) {
        heights[k] = best;
        hit[k] = 1;
        if (px) {
          const ux = Math.min(iw - 1, Math.max(0, Math.floor((bu - Math.floor(bu)) * iw)));
          const uy = Math.min(ih - 1, Math.max(0, Math.floor((1 - (bv - Math.floor(bv))) * ih)));
          const o = (uy * iw + ux) * 4;
          colors[k * 3] = (px[o] / 255) ** 2.2; colors[k * 3 + 1] = (px[o + 1] / 255) ** 2.2; colors[k * 3 + 2] = (px[o + 2] / 255) ** 2.2;
        }
      }
    }
  }
  // Pontos fora do modelo: copiam o vizinho mais próximo com altura.
  for (let pass = 0; pass < 6; pass++) {
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = j * N + i;
      if (hit[k]) continue;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= N || jj >= N || !hit[jj * N + ii]) continue;
        const kk = jj * N + ii;
        heights[k] = heights[kk];
        colors[k * 3] = colors[kk * 3]; colors[k * 3 + 1] = colors[kk * 3 + 1]; colors[k * 3 + 2] = colors[kk * 3 + 2];
        hit[k] = 2;
        break;
      }
    }
    for (let k = 0; k < N * N; k++) if (hit[k] === 2) hit[k] = 1;
  }
  return { heights, colors };
}

// Pontos com cor de água (azul) viram lago: afunda o chão para a água aparecer ali.
export function isWaterColor(r, g, b) {
  return b > 0.12 && b > r * 1.35 && b > g * 1.05;
}
