// Sistema de partículas (um único Points com shader, brilho aditivo). Usado em ataques,
// impactos, magias, mortes e no Predador.
import * as THREE from 'three';

const MAX = 4000;

export class Particles {
  constructor(scene) {
    this.pos = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3);
    this.size = new Float32Array(MAX);
    this.alpha = new Float32Array(MAX);
    this.vel = new Float32Array(MAX * 3);
    this.life = new Float32Array(MAX);
    this.maxLife = new Float32Array(MAX);
    this.grav = new Float32Array(MAX);
    this.drag = new Float32Array(MAX);
    this.grow = new Float32Array(MAX);
    this.target = new Array(MAX).fill(null);
    this.next = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uScale: { value: 400 } },
      vertexShader: `
        attribute float size; attribute float alpha; attribute vec3 color;
        varying vec3 vC; varying float vA; uniform float uScale;
        void main(){ vC = color; vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = size * uScale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `
        varying vec3 vC; varying float vA;
        void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); if (r > 0.5) discard;
          float a = smoothstep(0.5, 0.0, r); a = a * a; gl_FragColor = vec4(vC * (1.0 + a), a * vA); }`,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    this.mat = mat;
    scene.add(this.points);
    this.c = new THREE.Color();
  }

  // o: {pos, vel, color, size, life, gravity, drag, grow, target(Vector3 para puxar)}
  emit(o) {
    const i = this.next;
    this.next = (this.next + 1) % MAX;
    this.pos[i * 3] = o.pos.x; this.pos[i * 3 + 1] = o.pos.y; this.pos[i * 3 + 2] = o.pos.z;
    const v = o.vel || { x: 0, y: 0, z: 0 };
    this.vel[i * 3] = v.x; this.vel[i * 3 + 1] = v.y; this.vel[i * 3 + 2] = v.z;
    this.c.set(o.color ?? 0xffffff);
    this.col[i * 3] = this.c.r; this.col[i * 3 + 1] = this.c.g; this.col[i * 3 + 2] = this.c.b;
    this.size[i] = o.size ?? 0.4;
    this.life[i] = this.maxLife[i] = o.life ?? 0.8;
    this.grav[i] = o.gravity ?? 0;
    this.drag[i] = o.drag ?? 1.5;
    this.grow[i] = o.grow ?? 0;
    this.target[i] = o.target || null;
    this.alpha[i] = 1;
  }

  burst(pos, { n = 20, color = 0xffffff, colors = null, speed = 6, up = 0.3, size = 0.35, life = 0.7, gravity = 6, spread = 1, drag = 2, grow = 0 } = {}) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, e = (Math.random() - 0.5) * Math.PI * spread;
      const s = speed * (0.35 + Math.random() * 0.65);
      this.emit({
        pos: { x: pos.x + (Math.random() - 0.5) * 0.3, y: pos.y + (Math.random() - 0.5) * 0.3, z: pos.z + (Math.random() - 0.5) * 0.3 },
        vel: { x: Math.cos(a) * Math.cos(e) * s, y: Math.sin(e) * s + up * speed, z: Math.sin(a) * Math.cos(e) * s },
        color: colors ? colors[k % colors.length] : color, size: size * (0.6 + Math.random() * 0.8),
        life: life * (0.6 + Math.random() * 0.6), gravity, drag, grow,
      });
    }
  }

  update(dt) {
    const p = this.pos, v = this.vel;
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) { if (this.alpha[i] !== 0) { this.alpha[i] = 0; this.size[i] = 0; } continue; }
      this.life[i] -= dt;
      const t = this.target[i];
      if (t) {
        // Partícula puxada para um ponto (Predador sugando, magicules subindo para o jogador).
        const dx = t.x - p[i * 3], dy = t.y - p[i * 3 + 1], dz = t.z - p[i * 3 + 2];
        const k = 18 * dt;
        v[i * 3] += dx * k; v[i * 3 + 1] += dy * k; v[i * 3 + 2] += dz * k;
        if (dx * dx + dy * dy + dz * dz < 0.2) this.life[i] = Math.min(this.life[i], 0.05);
      }
      const dr = Math.max(0, 1 - this.drag[i] * dt);
      v[i * 3] *= dr; v[i * 3 + 1] = v[i * 3 + 1] * dr - this.grav[i] * dt; v[i * 3 + 2] *= dr;
      p[i * 3] += v[i * 3] * dt; p[i * 3 + 1] += v[i * 3 + 1] * dt; p[i * 3 + 2] += v[i * 3 + 2] * dt;
      const f = this.life[i] / this.maxLife[i];
      this.alpha[i] = Math.min(1, f * 2.2);
      this.size[i] += this.grow[i] * dt;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.attributes.size.needsUpdate = true;
    this.geo.attributes.alpha.needsUpdate = true;
  }

  resize(h) { this.mat.uniforms.uScale.value = h * 0.9; }
}
