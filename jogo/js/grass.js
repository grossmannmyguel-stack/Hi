// Grama que balança com o vento, só num raio em volta do jogador (acompanha ele andando).
import * as THREE from 'three';

export class Grass {
  constructor(world, scene, { radius = 42, spacing = 0.85 } = {}) {
    this.world = world;
    this.G = Math.ceil((radius * 2) / spacing);
    this.spacing = spacing;
    this.center = null;
    const blade = new THREE.BufferGeometry();
    // Duas lâminas cruzadas, cada uma um triângulo alongado.
    const v = [];
    for (const a of [0, Math.PI / 2]) {
      const c = Math.cos(a) * 0.06, s = Math.sin(a) * 0.06;
      v.push(-c, 0, -s, c, 0, s, 0, 0.5, 0);
      v.push(-c * 0.6, 0, -s * 0.6, 0, 0.5, 0, -c * 0.2 + s * 0.3, 0.36, -s * 0.2 - c * 0.3);
    }
    blade.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    blade.computeVertexNormals();
    this.uniforms = { uTime: { value: 0 } };
    const mat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.uniforms.uTime;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `
        vec3 transformed = vec3(position);
        vec2 ip = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
        float sway = sin(uTime * 1.8 + ip.x * 0.21 + ip.y * 0.17) * 0.5 + sin(uTime * 3.1 + ip.x * 0.7) * 0.2;
        transformed.x += sway * position.y * 0.45;
        transformed.z += sway * position.y * 0.2;`);
    };
    this.mesh = new THREE.InstancedMesh(blade, mat, this.G * this.G);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.setColorAt(0, new THREE.Color());
    scene.add(this.mesh);
    this.dummy = new THREE.Object3D();
    this.col = new THREE.Color();
  }

  hash(x, z) {
    const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
    return n - Math.floor(n);
  }

  update(focus, t) {
    this.uniforms.uTime.value = t;
    const sp = this.spacing, G = this.G;
    const cx = Math.round(focus.x / 4) * 4, cz = Math.round(focus.z / 4) * 4;
    if (this.center && this.center.x === cx && this.center.z === cz) return;
    this.center = { x: cx, z: cz };
    const w = this.world, d = this.dummy, col = this.col;
    let k = 0;
    const x0 = Math.floor((cx - (G / 2) * sp) / sp) * sp, z0 = Math.floor((cz - (G / 2) * sp) / sp) * sp;
    for (let i = 0; i < G; i++) {
      for (let j = 0; j < G; j++) {
        const gx = x0 + i * sp, gz = z0 + j * sp;
        const r1 = this.hash(gx, gz), r2 = this.hash(gz, gx);
        const x = gx + (r1 - 0.5) * sp, z = gz + (r2 - 0.5) * sp;
        const g = w.grassAt(x, z, col);
        const dist = Math.hypot(x - focus.x, z - focus.z);
        const fade = Math.min(1, Math.max(0, (G * sp * 0.5 - dist) / 8));
        const s = g * fade * (0.6 + r1 * 0.7);
        d.position.set(x, w.heightAt(x, z) - 0.05, z);
        d.rotation.set(0, r2 * 6.28, 0);
        d.scale.set(s, s * (0.8 + r2 * 0.7), s);
        d.updateMatrix();
        this.mesh.setMatrixAt(k, d.matrix);
        col.multiplyScalar(0.85 + r2 * 0.35);
        this.mesh.setColorAt(k, col);
        k++;
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }
}
