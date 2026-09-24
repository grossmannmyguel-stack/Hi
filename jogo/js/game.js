// Núcleo do jogo: jogador, monstros, Predador, habilidades, evolução, aliados, missões e save.
import * as THREE from 'three';
import {
  SKILLS, MONSTERS, SPECIES, STAGES, QUESTS, SPAWNS, PLACES, GOBLIN_NAMES, NAME_COST, WATER_Y, xpNext,
} from './data.js';
import * as M from './models.js';
import { World } from './world.js';
import { UI } from './ui.js';
import { sfx, setMuted } from './audio.js';
import { clamp, lerp, angleLerp, rand } from './util.js';

const SAVE_KEY = 'slimeRenascido.save.v1';
const CFG_KEY = 'slimeRenascido.cfg.v1';
const DRAGON_NAME = 'Kaizor';
const RADIUS = { aranha: 1.0, lobo: 0.9, morcego: 0.7, serpente: 0.8, lagarto: 1.2, ogro: 1.2, loboAlfa: 1.5, ogroChefe: 2.0 };
const DRAGON_SCALE = 1.3;
const SEAL = { x: PLACES.dragao.x, z: PLACES.dragao.z - DRAGON_SCALE, r: 11.2 * DRAGON_SCALE + 0.3 };

function storage(fn) { try { return fn(); } catch { return null; } }

export class Game {
  constructor(renderer, scene, camera, input) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.input = input;
    this.t = 0;
    this.settings = { quality: 'alta', mute: false, ...(storage(() => JSON.parse(localStorage.getItem(CFG_KEY))) || {}) };
    setMuted(this.settings.mute);
    this.world = new World(scene);
    this.ui = new UI(this);
    this.monsters = [];
    this.items = [];
    this.projectiles = [];
    this.effects = [];
    this.absorbing = [];
    this.allies = [];
    this.goblins = [];
    this.bosses = new Set();
    this.flags = new Set();
    this.quest = { i: 0, n: 0 };
    this.cam = { yaw: 0, pitch: 0.42, dist: 6 };
    this.regionId = null;
    this.regionTick = 0;
    this.saveTick = 0;
    this.msgCd = 0;
    this.evolving = 0;
    this.shared = {
      ring: new THREE.RingGeometry(0.86, 1, 40).rotateX(-Math.PI / 2),
      ball: new THREE.SphereGeometry(1, 8, 6),
      blade: new THREE.TorusGeometry(0.75, 0.13, 5, 14, Math.PI).rotateX(Math.PI / 2).rotateY(Math.PI / 2),
      thread: new THREE.BoxGeometry(0.08, 0.08, 1.8),
    };
    this.marker = new THREE.Mesh(this.shared.ring, new THREE.MeshBasicMaterial({ color: 0x9ff3e8, transparent: true, opacity: 0.8, depthWrite: false }));
    this.marker.visible = false;
    scene.add(this.marker);
    this.applyQuality();
  }

  // ------------------------------------------------------------------ Início
  start(save) {
    this.newPlayer();
    if (save) this.applySave(save);
    this.spawnAll();
    this.buildPlayerModel();
    this.computeStats();
    if (!save) { this.p.hp = this.p.stats.hpMax; this.p.mp = this.p.stats.mpMax; }
    this.cam.yaw = this.p.yaw + Math.PI;
    this.cam.pitch = save ? 0.42 : 0.16;
    this.questPrecheck();
    this.updateCamera(1);
  }

  newPlayer() {
    this.p = {
      name: 'Slime', level: 1, xp: 0, stage: 0, form: 'slime', hp: 60, mp: 40, stats: null,
      skills: new Set(['predador', 'sabio']), hotbar: [null, null, null], species: new Set(),
      herbs: 0, potions: 0, ores: 0, crystals: 0,
      pos: new THREE.Vector3(PLACES.inicio.x, 3, PLACES.inicio.z), vel: new THREE.Vector3(), yaw: 0,
      onGround: false, jumps: 0, cds: {}, attackCd: 0, attackT: -1, attackHit: false, dashT: 0, hitSet: new Set(),
      invuln: 0, slowT: 0, absorbT: 0, lastHurt: 99, dead: false, waterCd: 0, hints: new Set(),
    };
  }

  applySave(s) {
    const p = this.p;
    Object.assign(p, {
      name: s.name, level: s.level, xp: s.xp, stage: s.stage, form: s.form || 'slime', hp: s.hp, mp: s.mp,
      herbs: s.herbs, potions: s.potions, ores: s.ores, crystals: s.crystals, yaw: s.yaw ?? Math.PI,
    });
    p.skills = new Set(s.skills);
    p.hotbar = s.hotbar;
    p.species = new Set(s.species);
    p.hints = new Set(s.hints || []);
    p.pos.fromArray(s.pos);
    this.quest = s.quest;
    this.bosses = new Set(s.bosses);
    this.flags = new Set(s.flags || []);
    if (typeof s.time === 'number') this.world.time = s.time;
    this._goblinSave = s.goblins;
  }

  save() {
    const p = this.p;
    if (!p || p.dead) return;
    const data = {
      v: 1, name: p.name, level: p.level, xp: p.xp, stage: p.stage, form: p.form, hp: p.hp, mp: p.mp,
      skills: [...p.skills], hotbar: p.hotbar, species: [...p.species], hints: [...p.hints],
      herbs: p.herbs, potions: p.potions, ores: p.ores, crystals: p.crystals,
      pos: p.pos.toArray().map((v) => +v.toFixed(2)), yaw: p.yaw, quest: this.quest, bosses: [...this.bosses],
      flags: [...this.flags], time: this.world.time,
      goblins: this.goblins.map((g) => ({ named: g.named, name: g.name, active: g.active })),
    };
    storage(() => localStorage.setItem(SAVE_KEY, JSON.stringify(data)));
  }

  static loadSave() { return storage(() => JSON.parse(localStorage.getItem(SAVE_KEY))); }

  resetSave() {
    storage(() => localStorage.removeItem(SAVE_KEY));
    this.resetting = true;
    location.reload();
  }

  saveSettings() { storage(() => localStorage.setItem(CFG_KEY, JSON.stringify(this.settings))); }

  setQuality(q) {
    this.settings.quality = q;
    this.saveSettings();
    this.applyQuality();
  }

  applyQuality() {
    const q = this.settings.quality;
    const dpr = window.devicePixelRatio || 1;
    this.renderer.setPixelRatio(q === 'baixa' ? 1 : q === 'media' ? Math.min(dpr, 1.5) : Math.min(dpr, 3));
    this.scene.fog.far = q === 'baixa' ? 140 : q === 'media' ? 200 : 280;
    this.scene.fog.near = this.scene.fog.far * 0.35;
    this.camera.far = this.scene.fog.far + 200;
    this.camera.updateProjectionMatrix();
    this.activeRange = Math.max(120, this.scene.fog.far * 0.7);
    this.viewRange = q === 'baixa' ? 80 : q === 'media' ? 120 : 180;
    this.world.lodDist = q === 'baixa' ? 60 : q === 'media' ? 90 : 130;
    this.renderer.shadowMap.enabled = q !== 'baixa';
    this.world.sun.castShadow = q !== 'baixa';
    this.world.sun.shadow.mapSize.setScalar(q === 'alta' ? 4096 : 2048);
    if (this.world.sun.shadow.map) { this.world.sun.shadow.map.dispose(); this.world.sun.shadow.map = null; }
    this.world.enableGrass(q !== 'baixa');
  }

  setMute(m) {
    this.settings.mute = m;
    setMuted(m);
    this.saveSettings();
  }

  // ------------------------------------------------------------------ Criação de entidades
  model(id, fallback) { return M.makeCustom(id) || fallback(); }

  makeMonsterModel(type) {
    switch (type) {
      case 'aranha': return this.model('aranha', M.makeSpider);
      case 'lobo': return this.model('lobo', () => M.makeWolf({ horn: true }));
      case 'loboAlfa': return this.model('loboAlfa', () => {
        // Sem modelo próprio: usa o lobo do Meshy, maior e mais escuro.
        const c = M.makeCustom('lobo');
        if (!c) return M.makeWolf({ color: 0x121218, eye: 0xff4040, horn: true });
        c.mats.forEach((mt) => mt.color && mt.color.multiplyScalar(0.45));
        return c;
      });
      case 'morcego': return this.model('morcego', M.makeBat);
      case 'serpente': return this.model('serpente', M.makeSnake);
      case 'lagarto': return this.model('lagarto', M.makeLizard);
      case 'ogro': return this.model('ogro', () => M.makeOgre(false));
      case 'ogroChefe': return this.model('ogroChefe', () => M.makeOgre(true));
      default: throw new Error('tipo desconhecido ' + type);
    }
  }

  prepModel(model) {
    model.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    for (const m of model.mats) {
      if (m.emissive) { m.userData.e0 = m.emissive.getHex(); m.userData.ei0 = m.emissiveIntensity; }
      if (m.color) m.userData.c0 = m.color.getHex();
    }
    return model;
  }

  spawnAll() {
    for (const sp of SPAWNS) {
      for (let i = 0; i < sp.n; i++) {
        if (MONSTERS[sp.t].chefe && this.bosses.has(sp.t) && this.p.species.has(sp.t)) continue;
        const a = Math.random() * Math.PI * 2, r = Math.random() * sp.r;
        const m = this.createMonster(sp.t, sp.x + Math.cos(a) * r, sp.z + Math.sin(a) * r);
        // Chefe derrotado mas ainda não absorvido: o corpo continua lá esperando o Predador.
        if (MONSTERS[sp.t].chefe && this.bosses.has(sp.t)) this.layCorpse(m);
      }
    }
    const { herbs, ores } = this.world.itemSpots();
    herbs.forEach((s) => this.createItem('erva', s));
    ores.forEach((s) => this.createItem('minerio', s));
    this.createNPCs();
  }

  createMonster(type, x, z) {
    const def = MONSTERS[type];
    const model = this.prepModel(this.makeMonsterModel(type));
    const scale = M.hasCustom(type) ? 1 : type === 'loboAlfa' && M.hasCustom('lobo') ? 1.6 : def.size;
    model.root.scale.setScalar(scale);
    const shadow = M.makeShadow(RADIUS[type]);
    this.scene.add(model.root, shadow);
    const m = {
      type, def, model, scale, shadow, radius: RADIUS[type],
      home: new THREE.Vector3(x, 0, z), pos: new THREE.Vector3(x, this.world.groundAt(x, z), z), vel: new THREE.Vector3(),
      yaw: Math.random() * 6.28, hp: def.hp, hpMax: def.hp, state: 'idle', timer: rand(0, 3), wander: null,
      atkCd: 0, attackT: -1, attackHit: false, target: null, dead: false, gone: false, corpseT: 0, respawnT: 0,
      flash: 0, slowT: 0, rootT: 0, poisonT: 0, poisonDps: 0, poisonTick: 0, special: rand(2, 5), distToPlayer: 999, visible: true,
    };
    this.monsters.push(m);
    return m;
  }

  createItem(kind, s) {
    const model = kind === 'erva' ? this.model('erva', M.makeHerb) : this.model('minerio', M.makeOre);
    const y = this.world.heightAt(s.x, s.z);
    model.root.position.set(s.x, y, s.z);
    this.scene.add(model.root);
    this.items.push({ kind, model, pos: model.root.position, active: true, respawnT: 0, cave: !!s.cave });
  }

  createNPCs() {
    const custom = M.makeCustom('dragao');
    const d = custom || M.makeDragon();
    d.root.position.set(PLACES.dragao.x, this.world.heightAt(PLACES.dragao.x, PLACES.dragao.z), PLACES.dragao.z);
    d.root.rotation.y = Math.PI;
    if (custom) {
      this.dragonSeal = M.makeSeal();
      this.dragonSeal.root.position.set(0, 5 * DRAGON_SCALE, DRAGON_SCALE);
      this.dragonSeal.root.scale.setScalar(DRAGON_SCALE);
      d.root.add(this.dragonSeal.root);
    } else d.root.scale.setScalar(DRAGON_SCALE);
    this.scene.add(d.root);
    this.dragon = { model: d, pos: d.root.position };
    if (this.flags.has('dragaoAbsorvido')) d.root.visible = false;

    const el = M.makeCustom('anciao') || this.elderFromGoblin() || M.makeGoblin(true);
    const ex = PLACES.anciao.x, ez = PLACES.anciao.z;
    el.root.position.set(ex, this.world.heightAt(ex, ez), ez);
    this.scene.add(el.root, this.placeShadow(M.makeShadow(0.6), ex, ez));
    this.elder = { model: el, pos: el.root.position };

    const names = [...GOBLIN_NAMES].sort(() => Math.random() - 0.5);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const hx = ex + Math.cos(a) * 7, hz = ez + 4 + Math.sin(a) * 6;
      const saved = this._goblinSave && this._goblinSave[i];
      const g = {
        i, named: !!saved?.named, name: saved?.name || '', suggest: names[i], active: !!saved?.active,
        home: new THREE.Vector3(hx, 0, hz), pos: new THREE.Vector3(hx, this.world.groundAt(hx, hz), hz), yaw: a,
        vel: new THREE.Vector3(), wander: null, timer: rand(0, 4), hp: 1, hpMax: 1, atkCd: 0, attackT: -1, downT: 0, target: null,
      };
      this.goblins.push(g);
      this.buildGoblinModel(g);
      if (g.named) this.allies.push(g);
      this.refreshAllyStats(g);
      g.hp = g.hpMax;
    }
    this.world.setVillageLevel(this.villageLevel());
  }

  // Sem modelo próprio do ancião: usa o goblin do Meshy com um cajado brilhante.
  elderFromGoblin() {
    const c = M.makeCustom('goblin');
    if (!c) return null;
    const staff = new THREE.Group();
    staff.add(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.5, 5), new THREE.MeshLambertMaterial({ color: 0x6b4a2a })));
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.1, 0), new THREE.MeshBasicMaterial({ color: 0x7dffc8 }));
    gem.position.y = 0.8;
    staff.add(gem);
    staff.position.set(0.45, 0.75, 0.15);
    c.root.add(staff);
    c.mats.forEach((m) => m.color && m.color.lerp(new THREE.Color(0xd8d0c0), 0.25));
    return c;
  }

  placeShadow(s, x, z) { s.position.set(x, this.world.groundAt(x, z) + 0.03, z); return s; }

  buildGoblinModel(g) {
    if (g.model) this.scene.remove(g.model.root);
    if (g.shadow) this.scene.remove(g.shadow);
    g.model = this.prepModel(g.named ? this.model('hobgoblin', M.makeHobgoblin) : this.model('goblin', () => M.makeGoblin(false)));
    g.shadow = M.makeShadow(g.named ? 0.6 : 0.45);
    this.scene.add(g.model.root, g.shadow);
  }

  refreshAllyStats(g) {
    const p = this.p;
    g.hpMax = 60 + p.level * 10 + p.stage * 40;
    g.atk = 6 + p.level * 1.4 + p.stage * 5;
  }

  villageLevel() { return Math.min(2, Math.floor(this.goblins.filter((g) => g.named).length / 3)); }

  // ------------------------------------------------------------------ Jogador
  buildPlayerModel() {
    const p = this.p;
    if (this.pm) this.scene.remove(this.pm.root);
    if (this.pShadow) this.scene.remove(this.pShadow);
    if (p.form === 'lobo') {
      this.pm = M.makeCustom('formaLobo') || M.makeCustom('lobo') || M.makeWolf({ color: 0x1d2440, eye: 0xf2c14e, horn: true });
    }
    else if (p.form === 'humano') this.pm = this.model('humano', M.makeHuman);
    else this.pm = this.model('slime' + p.stage, () => M.makeSlime(p.stage));
    if (p.form === 'lobo' && !M.hasCustom('formaLobo') && !M.hasCustom('lobo')) this.pm.root.scale.setScalar(1.15);
    this.prepModel(this.pm);
    this.pShadow = M.makeShadow(this.playerRadius() * 1.1);
    this.scene.add(this.pm.root, this.pShadow);
  }

  playerRadius() {
    const p = this.p;
    return p.form === 'lobo' ? 0.9 : p.form === 'humano' ? 0.5 : STAGES[p.stage].size * 0.95;
  }

  computeStats() {
    const p = this.p, s = STAGES[p.stage], L = p.level - 1, has = (k) => p.skills.has(k);
    let hpMax = s.hp + L * 9, mpMax = s.mp + L * 5 + p.crystals * 5, atk = s.atk + L * 1.6, def = s.def + L * 0.7, spd = s.spd;
    if (has('protecaoDragao')) hpMax *= 1.2;
    if (has('peleBlindada')) def *= 1.4;
    if (has('forcaBruta')) atk *= 1.15;
    if (has('faro')) spd *= 1.1;
    if (p.form === 'lobo') { spd *= 1.45; atk *= 1.15; }
    if (p.form === 'humano') { atk *= 1.3; spd *= 1.05; }
    p.stats = { hpMax: Math.round(hpMax), mpMax: Math.round(mpMax), atk, def, spd };
    p.hp = Math.min(p.hp, p.stats.hpMax);
    p.mp = Math.min(p.mp, p.stats.mpMax);
  }

  availableForms() {
    const f = ['slime'];
    if (this.p.skills.has('mimetismoLobo')) f.push('lobo');
    if (this.p.skills.has('mimetismoHumano')) f.push('humano');
    return f;
  }

  setForm(form) {
    const p = this.p;
    if (form === p.form || !this.availableForms().includes(form)) return;
    p.form = form;
    this.buildPlayerModel();
    this.computeStats();
    this.burstFx(p.pos.clone().setY(p.pos.y + 1), 0x9ff3e8, 16, 6);
    sfx.magia();
    this.ui.sage(form === 'slime' ? 'Mimetismo desfeito. Forma de slime.' : `Mimetismo: ${form === 'lobo' ? 'Lobo' : 'Humano'}.`);
    this.save();
  }

  cycleForm() {
    const f = this.availableForms();
    if (f.length < 2) return;
    this.setForm(f[(f.indexOf(this.p.form) + 1) % f.length]);
  }

  forward() { return new THREE.Vector3(Math.sin(this.p.yaw), 0, Math.cos(this.p.yaw)); }

  gainXP(n) {
    const p = this.p;
    p.xp += Math.round(n);
    this.ui.floatText(p.pos.clone().setY(p.pos.y + 2), `+${Math.round(n)} XP`, '#f2c14e');
    let up = false;
    while (p.xp >= xpNext(p.level)) {
      p.xp -= xpNext(p.level);
      p.level++;
      up = true;
    }
    if (up) {
      this.computeStats();
      p.hp = p.stats.hpMax;
      p.mp = p.stats.mpMax;
      this.allies.forEach((a) => this.refreshAllyStats(a));
      sfx.nivel();
      this.ringFx(p.pos, 0xf2c14e, 0.5, 4, 0.8);
      this.ui.sage(`Nível ${p.level} alcançado. Atributos aumentaram.`);
      if (this.canEvolve().ok && !p.hints.has('evo' + p.stage)) {
        p.hints.add('evo' + p.stage);
        this.ui.sage('Condições de evolução satisfeitas. Toque em EVOLUIR.');
      }
      this.save();
    }
  }

  grantSkill(id, silent = false) {
    const p = this.p;
    if (p.skills.has(id)) return false;
    p.skills.add(id);
    const s = SKILLS[id];
    if (s.type === 'ativa') {
      const slot = p.hotbar.indexOf(null);
      if (slot >= 0) p.hotbar[slot] = id;
    }
    this.computeStats();
    if (!silent) {
      sfx.habilidade();
      this.ui.sage(`Habilidade adquirida: ${s.nome}.`);
      if (s.type === 'forma') this.ui.sage('Toque em FORMA para se transformar.');
      if (s.type === 'ativa' && !p.hotbar.includes(id)) this.ui.sage('Barra de atalhos cheia. Troque no Menu > Habilidades.');
    }
    return true;
  }

  hurtPlayer(amount, from) {
    const p = this.p;
    if (p.invuln > 0 || p.dead || this.evolving > 0) return;
    const dmg = Math.max(1, Math.round(amount * rand(0.9, 1.1) - p.stats.def * 0.6));
    p.hp -= dmg;
    p.invuln = 0.35;
    p.lastHurt = 0;
    if (from) {
      const dx = p.pos.x - from.x, dz = p.pos.z - from.z, d = Math.hypot(dx, dz) || 1;
      p.vel.x += (dx / d) * 7;
      p.vel.z += (dz / d) * 7;
      p.vel.y = Math.max(p.vel.y, 3);
    }
    this.flashMats(this.pm, 0xff4060, 0.12);
    this.ui.floatText(p.pos.clone().setY(p.pos.y + 1.4), '-' + dmg, '#ff6b7d');
    document.getElementById('hurt').classList.remove('on');
    void document.getElementById('hurt').offsetWidth;
    document.getElementById('hurt').classList.add('on');
    sfx.dano();
    if (p.hp < p.stats.hpMax * 0.3 && p.potions > 0 && !p.hints.has('lowhp')) {
      p.hints.add('lowhp');
      this.ui.sage('Aviso: HP baixo. Toque em POÇÃO para se curar.');
    }
    if (p.hp <= 0) this.playerDeath();
  }

  playerDeath() {
    const p = this.p;
    p.hp = 0;
    p.dead = true;
    this.ui.sage('Dano crítico. Reconstituindo o corpo...', true);
    const fade = document.getElementById('fade');
    fade.textContent = 'Reconstituindo...';
    fade.classList.add('on');
    setTimeout(() => {
      const spot = this.flags.has('vilaVisitada') ? { x: PLACES.anciao.x + 3, z: PLACES.anciao.z + 3 } : PLACES.inicio;
      p.pos.set(spot.x, this.world.groundAt(spot.x, spot.z) + 1, spot.z);
      p.vel.set(0, 0, 0);
      p.hp = p.stats.hpMax;
      p.mp = Math.max(p.mp, p.stats.mpMax * 0.5);
      p.dead = false;
      p.invuln = 2;
      for (const m of this.monsters) if (!m.dead && m.state !== 'idle') { m.state = 'return'; m.target = null; }
      this.cam.yaw = p.yaw + Math.PI;
      fade.classList.remove('on');
      this.save();
    }, 2200);
  }

  // ------------------------------------------------------------------ Combate do jogador
  nearestEnemy(range, coneDeg = 360) {
    const p = this.p, f = this.forward();
    let best = null, bd = range;
    for (const m of this.monsters) {
      if (m.dead || m.gone || !m.visible) continue;
      const dx = m.pos.x - p.pos.x, dz = m.pos.z - p.pos.z;
      const d = Math.hypot(dx, dz) - m.radius;
      if (d > bd) continue;
      if (coneDeg < 360) {
        const cos = (dx * f.x + dz * f.z) / (Math.hypot(dx, dz) || 1);
        if (cos < Math.cos((coneDeg / 2) * (Math.PI / 180))) continue;
      }
      best = m;
      bd = d;
    }
    return best;
  }

  faceTarget(m) {
    if (!m) return;
    this.p.yaw = Math.atan2(m.pos.x - this.p.pos.x, m.pos.z - this.p.pos.z);
  }

  attack() {
    const p = this.p;
    if (p.attackCd > 0 || p.dead) return;
    this.faceTarget(this.nearestEnemy(3.5) || this.nearestEnemy(9, 150));
    const f = this.forward();
    sfx.ataque();
    if (p.form === 'slime') {
      p.dashT = 0.26;
      p.hitSet.clear();
      p.vel.x = f.x * 17;
      p.vel.z = f.z * 17;
      p.attackCd = 0.55;
    } else {
      p.attackT = 0;
      p.attackHit = false;
      p.attackCd = p.form === 'lobo' ? 0.45 : 0.5;
      p.vel.x += f.x * 6;
      p.vel.z += f.z * 6;
    }
  }

  meleeHit() {
    const p = this.p;
    const range = p.form === 'lobo' ? 3.0 : 3.4;
    const mult = p.form === 'lobo' ? 1.25 : 1.35;
    const f = this.forward();
    for (const m of this.monsters) {
      if (m.dead || m.gone) continue;
      const dx = m.pos.x - p.pos.x, dz = m.pos.z - p.pos.z;
      const d = Math.hypot(dx, dz);
      if (d - m.radius > range) continue;
      if ((dx * f.x + dz * f.z) / (d || 1) < 0.35 && d > m.radius + 0.5) continue;
      this.damageMonster(m, p.stats.atk * mult, p.pos);
    }
    if (p.form === 'humano') this.slashFx();
  }

  castSkill(slot) {
    const p = this.p;
    const id = p.hotbar[slot];
    if (!id || p.dead) return;
    const s = SKILLS[id];
    if ((p.cds[id] || 0) > 0) return;
    if (p.mp < s.mp) { this.notify('PM insuficiente.'); return; }
    p.mp -= s.mp;
    p.cds[id] = s.cd;
    const tgt = this.nearestEnemy(26, 110);
    this.faceTarget(tgt);
    const f = this.forward();
    const origin = p.pos.clone().setY(p.pos.y + 0.8);
    const dir = f.clone();
    if (tgt) {
      dir.set(tgt.pos.x - origin.x, tgt.pos.y + tgt.model.height * tgt.scale * 0.4 - origin.y, tgt.pos.z - origin.z).normalize();
    }
    sfx.magia();
    if (id === 'laminaAgua') {
      const mesh = new THREE.Mesh(this.shared.blade, new THREE.MeshBasicMaterial({ color: 0x8fe4ff, transparent: true, opacity: 0.9 }));
      this.addProjectile({ mesh, pos: origin, dir, speed: 32, life: 1.1, radius: 1.0, dmg: p.stats.atk * 1.2 + 10, owner: 'p', pierce: true });
    } else if (id === 'fioAco') {
      const mesh = new THREE.Mesh(this.shared.thread, new THREE.MeshBasicMaterial({ color: 0xf2f4ff }));
      this.addProjectile({ mesh, pos: origin, dir, speed: 28, life: 0.9, radius: 0.9, dmg: p.stats.atk * 0.6, owner: 'p', root: 2.8 });
    } else if (id === 'venenoCorrosivo') {
      for (const m of this.monsters) {
        if (m.dead || m.gone) continue;
        const dx = m.pos.x - p.pos.x, dz = m.pos.z - p.pos.z, d = Math.hypot(dx, dz);
        if (d - m.radius > 8) continue;
        if ((dx * f.x + dz * f.z) / (d || 1) < 0.72 && d > m.radius + 0.8) continue;
        this.damageMonster(m, p.stats.atk * 0.5, p.pos);
        m.poisonT = 5;
        m.poisonDps = p.stats.atk * 0.4;
      }
      this.coneFx(origin, f, 0x8cf05a);
    } else if (id === 'chamaNegra') {
      for (const m of this.monsters) {
        if (m.dead || m.gone) continue;
        if (Math.hypot(m.pos.x - p.pos.x, m.pos.z - p.pos.z) - m.radius < 8.5) this.damageMonster(m, p.stats.atk * 2.2 + 30, p.pos, 10);
      }
      this.ringFx(p.pos, 0x9a4dff, 1, 9, 0.6);
      this.ringFx(p.pos, 0x2a1050, 0.5, 7, 0.8);
      this.burstFx(p.pos.clone().setY(p.pos.y + 1), 0x9a4dff, 28, 12);
      sfx.explosao();
    }
  }

  damageMonster(m, amount, from, knock = 6) {
    if (m.dead || m.gone) return;
    const dmg = Math.max(1, Math.round(amount * rand(0.9, 1.1) - m.def.def * 0.5));
    m.hp -= dmg;
    m.flash = 0.12;
    this.flashMats(m.model, 0xffffff, 0.1);
    this.ui.floatText(m.pos.clone().setY(m.pos.y + m.model.height * m.scale * 0.8), String(dmg), '#ffffff', dmg >= 50);
    sfx.acerto();
    if (from && !m.def.chefe) {
      const dx = m.pos.x - from.x, dz = m.pos.z - from.z, d = Math.hypot(dx, dz) || 1;
      m.vel.x += (dx / d) * knock;
      m.vel.z += (dz / d) * knock;
    }
    if (m.state !== 'chase') { m.state = 'chase'; m.target = this.p; }
    m.provoked = 8;
    if (m.hp <= 0) this.killMonster(m);
  }

  layCorpse(m) {
    m.dead = true;
    m.hp = 0;
    m.corpseT = m.def.chefe ? Infinity : 90;
    m.attackT = -1;
    m.charging = 0;
    m.vel.set(0, 0, 0);
    for (const mt of m.model.mats) if (mt.color) mt.color.multiplyScalar(0.45);
    m.model.root.rotation.z = Math.PI / 2 * 0.9;
    if (m.def.voa) m.pos.y = this.world.groundAt(m.pos.x, m.pos.z) + 0.3;
    m.model.root.position.copy(m.pos);
    m.shadow.position.set(m.pos.x, this.world.groundAt(m.pos.x, m.pos.z) + 0.05, m.pos.z);
  }

  killMonster(m) {
    this.layCorpse(m);
    this.gainXP(m.def.xp);
    this.emit('matar:' + m.type);
    if (m.def.chefe) {
      this.bosses.add(m.type);
      this.ui.sage(`${m.def.nome} foi derrotado!`, true);
      this.save();
    }
    if (!this.p.hints.has('corpo')) {
      this.p.hints.add('corpo');
      this.ui.sage('Corpo detectado. Chegue perto e use PREDADOR para absorver e analisar.');
    }
  }

  // ------------------------------------------------------------------ Predador
  absorbTarget() {
    const p = this.p;
    if (p.dead) return null;
    const reach = this.playerRadius() + 2.4;
    let best = null, bd = 1e9;
    for (const m of this.monsters) {
      if (!m.dead || m.gone || m.beingAbsorbed) continue;
      const d = Math.hypot(m.pos.x - p.pos.x, m.pos.z - p.pos.z) - m.radius;
      if (d < reach && d < bd) { best = { kind: 'monstro', obj: m }; bd = d; }
    }
    for (const it of this.items) {
      if (!it.active) continue;
      const d = Math.hypot(it.pos.x - p.pos.x, it.pos.z - p.pos.z);
      if (d < reach && d < bd) { best = { kind: it.kind, obj: it }; bd = d; }
    }
    if (!best && this.world.inWater(p.pos.x, p.pos.z) && p.waterCd <= 0) best = { kind: 'agua' };
    return best;
  }

  absorb() {
    const p = this.p;
    const t = this.absorbTarget();
    if (!t) { this.notify('Nada para absorver aqui.'); return; }
    p.absorbT = 0.55;
    sfx.absorver();
    if (t.kind === 'agua') {
      p.waterCd = 2.5;
      this.burstFx(p.pos.clone().setY(p.pos.y + 0.3), 0x6fd3ff, 14, -5);
      if (this.grantSkill('laminaAgua', true)) {
        this.ui.sage('Água absorvida e analisada.');
        this.ui.sage("Habilidade adquirida: Lâmina d'Água. Use o botão de atalho para disparar.");
        sfx.habilidade();
      } else {
        p.mp = Math.min(p.stats.mpMax, p.mp + 12);
        this.ui.floatText(p.pos.clone().setY(p.pos.y + 1.5), '+12 PM', '#7fb8ff');
      }
      return;
    }
    if (t.kind === 'monstro') {
      const m = t.obj;
      m.beingAbsorbed = true;
      this.startAbsorbAnim(m.model.root, () => {
        m.gone = true;
        m.beingAbsorbed = false;
        m.model.root.visible = false;
        m.shadow.visible = false;
        m.respawnT = m.def.chefe ? Infinity : rand(40, 70);
        this.onMonsterAbsorbed(m);
      });
      return;
    }
    const it = t.obj;
    it.active = false;
    this.startAbsorbAnim(it.model.root, () => {
      it.model.root.visible = false;
      it.respawnT = it.cave ? 60 : 120;
      if (it.kind === 'erva') {
        p.herbs++;
        this.ui.floatText(p.pos.clone().setY(p.pos.y + 1.5), '+1 Erva', '#7dffc8');
        if (p.herbs % 2 === 0) {
          p.potions++;
          this.ui.sage('Sintetizado: Poção de Cura. Toque em POÇÃO para usar.');
        }
        this.emit('absorver:erva');
      } else {
        p.ores++;
        this.ui.floatText(p.pos.clone().setY(p.pos.y + 1.5), '+1 Minério', '#6aa8ff');
        if (p.ores % 4 === 0) {
          p.crystals++;
          this.computeStats();
          this.ui.sage('Sintetizado: Cristal Mágico. +5 de PM máximo.');
        }
      }
    }, true);
  }

  startAbsorbAnim(obj, done, keep = false) {
    this.absorbing.push({ obj, from: obj.position.clone(), s0: obj.scale.clone(), t: 0, done, keep });
  }

  onMonsterAbsorbed(m) {
    const p = this.p;
    const first = !p.species.has(m.type);
    this.gainXP(m.def.xp * 0.5);
    p.mp = Math.min(p.stats.mpMax, p.mp + p.stats.mpMax * 0.2);
    p.hp = Math.min(p.stats.hpMax, p.hp + p.stats.hpMax * 0.1);
    if (first) {
      p.species.add(m.type);
      this.ui.sage(`Análise concluída: ${m.def.nome}.`);
      this.grantSkill(m.def.skill);
      if (this.canEvolve().ok && !p.hints.has('evo' + p.stage)) {
        p.hints.add('evo' + p.stage);
        this.ui.sage('Condições de evolução satisfeitas. Toque em EVOLUIR.');
      }
    } else {
      this.ui.floatText(p.pos.clone().setY(p.pos.y + 1.8), 'Absorvido', '#9ff3e8');
    }
    this.emit('absorverMonstro:' + m.type);
    this.save();
  }

  usePotion() {
    const p = this.p;
    if (p.potions <= 0) { this.notify('Sem poções. Absorva Ervas Luminosas.'); return; }
    if (p.hp >= p.stats.hpMax) { this.notify('HP já está cheio.'); return; }
    p.potions--;
    const heal = Math.round(p.stats.hpMax * 0.5);
    p.hp = Math.min(p.stats.hpMax, p.hp + heal);
    this.ui.floatText(p.pos.clone().setY(p.pos.y + 1.5), '+' + heal, '#8cf05a');
    this.burstFx(p.pos.clone().setY(p.pos.y + 0.5), 0x8cf05a, 12, 4);
    sfx.habilidade();
  }

  notify(msg) {
    if (this.msgCd > 0) return;
    this.msgCd = 1.5;
    this.ui.sage(msg, true);
  }

  // ------------------------------------------------------------------ Evolução
  canEvolve() {
    const p = this.p;
    const next = STAGES[p.stage + 1];
    if (!next) return { ok: false, reqs: [] };
    const r = next.req, reqs = [];
    reqs.push({ txt: `Nível ${r.lvl} (atual: ${p.level})`, ok: p.level >= r.lvl });
    if (r.especies) reqs.push({ txt: `${r.especies} espécies analisadas (atual: ${p.species.size})`, ok: p.species.size >= r.especies });
    if (r.chefe) reqs.push({ txt: `Derrotar o ${MONSTERS[r.chefe].nome}`, ok: this.bosses.has(r.chefe) });
    return { ok: reqs.every((x) => x.ok), reqs };
  }

  evolve() {
    if (!this.canEvolve().ok || this.evolving > 0) return;
    const p = this.p;
    this.evolving = 3.2;
    this.input.release();
    sfx.evolucao();
    const fade = document.getElementById('fade');
    fade.textContent = 'Evoluindo...';
    fade.classList.add('on', 'white');
    this.ui.sage('Iniciando evolução. O corpo entrará em sono profundo.', true);
    setTimeout(() => {
      p.stage++;
      if (p.form !== 'slime') p.form = 'slime';
      this.buildPlayerModel();
      this.computeStats();
      p.hp = p.stats.hpMax;
      p.mp = p.stats.mpMax;
      this.allies.forEach((a) => { this.refreshAllyStats(a); a.hp = a.hpMax; });
      fade.classList.remove('on', 'white');
      this.ringFx(p.pos, 0xf2c14e, 0.5, 7, 1.2);
      this.burstFx(p.pos.clone().setY(p.pos.y + 1), 0xf2c14e, 30, 9);
      this.ui.sage(`Evolução concluída: ${STAGES[p.stage].nome}. Todos os atributos aumentaram muito.`, true);
      if (this.allies.length) this.ui.sage('Os aliados nomeados receberam parte do poder da evolução.');
      if (p.stage === 3) this.grantSkill('mimetismoHumano');
      this.emit('evoluir:' + p.stage);
      this.save();
    }, 1600);
  }

  // ------------------------------------------------------------------ Missões
  emit(evt) {
    const q = QUESTS[this.quest.i];
    if (!q) return;
    const match = q.evt === evt || (q.evt === 'absorverMonstro:any' && evt.startsWith('absorverMonstro:'));
    if (!match) return;
    this.quest.n++;
    if (this.quest.n >= q.n) this.completeQuest();
  }

  completeQuest() {
    const q = QUESTS[this.quest.i];
    this.ui.sage(`Missão concluída: ${q.titulo}.`);
    this.quest.i = Math.min(QUESTS.length - 1, this.quest.i + 1);
    this.quest.n = 0;
    if (q.xp) this.gainXP(q.xp);
    const nq = QUESTS[this.quest.i];
    this.ui.sage(`Nova missão: ${nq.titulo}.`);
    this.questPrecheck();
    this.save();
  }

  // Completa missões cujo objetivo já foi cumprido antes de começarem.
  questPrecheck() {
    const q = QUESTS[this.quest.i];
    const p = this.p;
    let done = false;
    if (q.evt.startsWith('evoluir:')) done = p.stage >= +q.evt.split(':')[1];
    else if (q.evt === 'matar:loboAlfa' || q.evt === 'matar:ogroChefe') done = this.bosses.has(q.evt.split(':')[1]);
    else if (q.evt === 'falar:dragao') done = this.flags.has('dragaoFalou');
    else if (q.evt === 'nomear') done = this.goblins.some((g) => g.named);
    else if (q.evt === 'regiao:floresta') done = this.regionId && this.regionId !== 'gruta';
    if (done) setTimeout(() => this.completeQuest(), 400);
  }

  questTarget() {
    const q = QUESTS[this.quest.i];
    if (!q || !q.alvo) return null;
    if (q.alvo === 'erva') {
      let best = null, bd = 1e9;
      for (const it of this.items) {
        if (!it.active || it.kind !== 'erva' || !it.cave) continue;
        const d = it.pos.distanceTo(this.p.pos);
        if (d < bd) { bd = d; best = it.pos; }
      }
      return best;
    }
    if (q.alvo === 'dragao') return { x: SEAL.x, z: SEAL.z + -SEAL.r };
    return PLACES[q.alvo];
  }

  // ------------------------------------------------------------------ NPCs e diálogos
  nearbyTalk() {
    const p = this.p;
    if (p.dead) return null;
    if (!this.flags.has('dragaoAbsorvido') && Math.hypot(p.pos.x - SEAL.x, p.pos.z - SEAL.z) < SEAL.r + 4.5) return { id: 'dragao', label: DRAGON_NAME };
    if (this.elder && this.elder.pos.distanceTo(p.pos) < 4.5) return { id: 'anciao', label: 'Ancião' };
    return null;
  }

  async talk() {
    const n = this.nearbyTalk();
    if (!n || this.ui.busy) return;
    if (n.id === 'dragao') await this.talkDragon();
    else await this.talkElder();
  }

  async talkDragon() {
    const p = this.p, ui = this.ui;
    if (!this.flags.has('dragaoFalou')) {
      const name = await ui.dialog([
        { quem: '???', texto: '...Hm? Você consegue me ouvir, pequeno slime?' },
        { quem: 'Dragão Selado', texto: `Eu sou ${DRAGON_NAME}, o Dragão da Tormenta. Estou preso neste selo há trezentos anos.` },
        { quem: DRAGON_NAME, texto: 'Faz tempo que ninguém fala comigo. Você não tem nome, tem? Monstros sem nome são fracos.' },
        { quem: DRAGON_NAME, texto: 'Vou lhe dar um presente. Como você quer ser chamado?', entrada: 'Sora' },
      ]);
      p.name = name || 'Sora';
      this.flags.add('dragaoFalou');
      await ui.dialog([
        { quem: DRAGON_NAME, texto: `${p.name}... Gostei! A partir de hoje somos amigos. Leve a minha proteção.` },
        { quem: 'Grande Sábio', texto: 'Aviso: Habilidade adquirida — Proteção do Dragão. HP máximo aumentou.' },
        { quem: DRAGON_NAME, texto: 'Use o seu Predador nas ervas que brilham aqui na gruta. Depois vá ver o mundo lá fora e volte para me contar as novidades!' },
      ]);
      this.grantSkill('protecaoDragao', true);
      p.hp = p.stats.hpMax;
      this.emit('falar:dragao');
      this.save();
      return;
    }
    if (p.stage >= 4 && !this.flags.has('dragaoAbsorvido')) {
      const a = await ui.dialog([
        { quem: DRAGON_NAME, texto: `${p.name}! Você virou um Lorde Demônio de verdade. Sinto o seu poder daqui.` },
        { quem: DRAGON_NAME, texto: 'Talvez agora... o seu Predador consiga me guardar no estômago. Lá dentro eu analiso o selo com o seu Grande Sábio e escapo!' },
        { quem: DRAGON_NAME, texto: 'E então, vamos tentar?', escolhas: ['Absorver o selo com o Predador', 'Ainda não'] },
      ]);
      if (a === 0) {
        this.flags.add('dragaoAbsorvido');
        this.startAbsorbAnim(this.dragon.model.root, () => { this.dragon.model.root.visible = false; }, true);
        sfx.absorver();
        this.ringFx(this.dragon.pos, 0xb49bff, 2, 16, 1.5);
        await ui.dialog([
          { quem: 'Grande Sábio', texto: `Aviso: ${DRAGON_NAME} foi guardado no estômago do Predador. Análise do Selo iniciada.` },
          { quem: DRAGON_NAME, texto: 'Hahaha! Que lugar confortável! Obrigado, amigo. Agora vá, o mundo é todo seu!' },
          { quem: 'Grande Sábio', texto: 'Parabéns. Você concluiu a história principal. Continue explorando, absorvendo e nomeando.' },
        ]);
        this.save();
      }
      return;
    }
    const lines = [
      `Já analisou ${p.species.size} de ${SPECIES.length} espécies? Continue absorvendo, ${p.name}!`,
      'Dizem que à noite os Lobos Sombrios ficam mais ousados. Tome cuidado.',
      'Os goblins da vila a oeste são fracos, mas leais. Um nome pode mudar tudo para eles.',
      'O Ogro Chefe das montanhas é forte. Evolua antes de enfrentá-lo.',
      'Quando virar Lorde Demônio, volte aqui. Tenho um pedido para você.',
    ];
    await ui.dialog([{ quem: DRAGON_NAME, texto: lines[Math.floor(Math.random() * lines.length)] }]);
  }

  async talkElder() {
    const ui = this.ui, p = this.p;
    const qid = QUESTS[this.quest.i].id;
    const idx = (id) => QUESTS.findIndex((q) => q.id === id);
    this.flags.add('vilaVisitada');
    if (this.quest.i < idx('vila')) {
      await ui.dialog([
        { quem: 'Ancião Goblin', texto: 'Um slime? Mas que presença de magia enorme... Por favor, não nos machuque!' },
        { quem: 'Ancião Goblin', texto: 'Somos só goblins fracos tentando sobreviver na floresta.' },
      ]);
      return;
    }
    if (qid === 'vila') {
      await ui.dialog([
        { quem: 'Ancião Goblin', texto: 'Grande slime! Eu sou o ancião desta vila. Os Lobos Sombrios atacam todas as noites.' },
        { quem: 'Ancião Goblin', texto: 'Muitos dos nossos já se foram. Com o seu poder, talvez possamos sobreviver.' },
        { quem: 'Ancião Goblin', texto: 'Pode nos proteger?', escolhas: ['Eu protejo vocês', 'Vou ver o que dá para fazer'] },
        { quem: 'Ancião Goblin', texto: 'Obrigado! Os lobos vivem na floresta a leste. O líder, o Lobo Alfa, fica no Covil da Matilha.' },
      ]);
      this.emit('falar:anciao');
      return;
    }
    if (this.quest.i < idx('nomes')) {
      await ui.dialog([{ quem: 'Ancião Goblin', texto: 'Os lobos ainda estão lá fora, a leste. O Lobo Alfa vive no Covil da Matilha. Cuidado!' }]);
      return;
    }
    const unnamed = this.goblins.filter((g) => !g.named).length;
    if (qid === 'nomes') {
      await ui.dialog([
        { quem: 'Ancião Goblin', texto: 'Você derrotou o Lobo Alfa! A vila está salva!' },
        { quem: 'Ancião Goblin', texto: 'Por favor, conceda nomes aos nossos guerreiros. Com um nome, um monstro pode evoluir.' },
        { quem: 'Grande Sábio', texto: `Aviso: nomear consome ${NAME_COST} PM por nome. Os nomeados evoluem para Hobgoblin e lutam ao seu lado.` },
      ]);
      ui.openNaming();
      return;
    }
    if (unnamed > 0) {
      const a = await ui.dialog([{ quem: 'Ancião Goblin', texto: `Ainda temos ${unnamed} guerreiro(s) sem nome. Quer nomear mais alguém?`, escolhas: ['Dar nomes', 'Agora não'] }]);
      if (a === 0) ui.openNaming();
      return;
    }
    await ui.dialog([{ quem: 'Ancião Goblin', texto: 'Graças a você, a vila está crescendo! Todos têm nome agora. Nós o seguiremos para sempre.' }]);
  }

  nameGoblin(i, rawName) {
    const g = this.goblins[i], p = this.p;
    const name = String(rawName || '').trim().slice(0, 14);
    if (!g || g.named || !name) return;
    if (QUESTS[this.quest.i].id !== 'nomes' && this.quest.i < QUESTS.findIndex((q) => q.id === 'nomes')) return;
    if (p.mp < NAME_COST) { this.notify('PM insuficiente para nomear.'); return; }
    p.mp -= NAME_COST;
    g.named = true;
    g.name = name;
    g.active = this.goblins.filter((x) => x.active).length < 4;
    this.buildGoblinModel(g);
    this.refreshAllyStats(g);
    g.hp = g.hpMax;
    this.allies.push(g);
    this.burstFx(g.pos.clone().setY(g.pos.y + 1), 0xf2c14e, 20, 6);
    sfx.evolucao();
    this.ui.sage(`Nome concedido: ${name}. ${name} evoluiu para Hobgoblin!`);
    if (!g.active) this.ui.sage(`${name} vai proteger a vila. Até 4 aliados seguem você.`);
    this.gainXP(30);
    this.world.setVillageLevel(this.villageLevel());
    this.emit('nomear');
    this.save();
  }

  // ------------------------------------------------------------------ Efeitos
  addProjectile(o) {
    o.pos = o.pos.clone();
    o.vel = o.dir.clone().multiplyScalar(o.speed);
    o.hit = new Set();
    o.mesh.position.copy(o.pos);
    o.mesh.lookAt(o.pos.clone().add(o.dir));
    this.scene.add(o.mesh);
    this.projectiles.push(o);
  }

  fx(obj, dur, fn) {
    this.scene.add(obj);
    this.effects.push({ obj, t: 0, dur, fn });
  }

  ringFx(pos, color, r0, r1, dur) {
    const m = new THREE.Mesh(this.shared.ring, new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    m.position.set(pos.x, this.world.groundAt(pos.x, pos.z) + 0.15, pos.z);
    this.fx(m, dur, (o, k) => { o.scale.setScalar(lerp(r0, r1, k)); o.material.opacity = 1 - k; });
  }

  burstFx(pos, color, count, speed) {
    const g = new THREE.Group();
    g.position.copy(pos);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false });
    const parts = [];
    for (let i = 0; i < count; i++) {
      const s = new THREE.Mesh(this.shared.ball, mat);
      s.scale.setScalar(rand(0.08, 0.2));
      const v = new THREE.Vector3(rand(-1, 1), rand(-0.2, 1), rand(-1, 1)).normalize().multiplyScalar(Math.abs(speed) * rand(0.4, 1));
      if (speed < 0) { s.position.copy(v).multiplyScalar(-0.5); v.multiplyScalar(-1); }
      g.add(s);
      parts.push({ s, v });
    }
    g.userData.mat = mat;
    this.fx(g, 0.7, (o, k, dt) => {
      for (const q of parts) { q.s.position.addScaledVector(q.v, dt); q.v.y -= 6 * dt; }
      mat.opacity = 1 - k;
    });
  }

  coneFx(origin, f, color) {
    const g = new THREE.Group();
    g.position.copy(origin);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, depthWrite: false });
    const parts = [];
    for (let i = 0; i < 26; i++) {
      const s = new THREE.Mesh(this.shared.ball, mat);
      s.scale.setScalar(rand(0.2, 0.45));
      const a = Math.atan2(f.x, f.z) + rand(-0.45, 0.45);
      parts.push({ s, v: new THREE.Vector3(Math.sin(a), rand(-0.1, 0.25), Math.cos(a)).multiplyScalar(rand(8, 14)) });
      g.add(s);
    }
    this.fx(g, 0.6, (o, k, dt) => {
      for (const q of parts) { q.s.position.addScaledVector(q.v, dt); q.s.scale.multiplyScalar(1 + dt * 1.5); }
      mat.opacity = 0.7 * (1 - k);
    });
  }

  slashFx() {
    const p = this.p;
    const m = new THREE.Mesh(this.shared.blade, new THREE.MeshBasicMaterial({ color: 0xe8f4ff, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    m.position.copy(p.pos).setY(p.pos.y + 1.1);
    m.rotation.y = p.yaw;
    m.scale.set(2.4, 1, 2.4);
    this.fx(m, 0.22, (o, k) => { o.material.opacity = 1 - k; o.rotation.y = p.yaw + (k - 0.5) * 1.2; });
  }

  flashMats(model, color, dur) {
    if (!model) return;
    for (const m of model.mats) if (m.emissive) { m.emissive.setHex(color); m.emissiveIntensity = 0.9; }
    model._flash = dur;
  }

  restoreFlash(model, dt) {
    if (!model || !model._flash) return;
    model._flash -= dt;
    if (model._flash <= 0) {
      model._flash = 0;
      for (const m of model.mats) if (m.emissive && m.userData.e0 !== undefined) { m.emissive.setHex(m.userData.e0); m.emissiveIntensity = m.userData.ei0; }
    }
  }

  // ------------------------------------------------------------------ Loop principal
  update(dt) {
    this.t += dt;
    this.msgCd -= dt;
    const inp = this.input, ui = this.ui, p = this.p;
    if (this.evolving > 0) this.evolving -= dt;
    const locked = ui.busy || this.evolving > 0 || p.dead;
    if (inp.took('menu')) { if (!ui.dialogState) ui.toggleMenu(); }
    if (!locked) {
      if (inp.took('atacar')) this.attack();
      if (inp.took('predador')) this.absorb();
      if (inp.took('pocao')) this.usePotion();
      if (inp.took('forma')) this.cycleForm();
      if (inp.took('evoluir')) this.evolve();
      if (inp.took('falar')) this.talk();
      for (let i = 0; i < 3; i++) if (inp.took('skill' + i)) this.castSkill(i);
    }
    this.updatePlayer(dt, locked);
    for (const m of this.monsters) this.updateMonster(m, dt);
    this.separateMonsters();
    for (const g of this.goblins) this.updateGoblin(g, dt);
    this.updateItems(dt);
    this.updateProjectiles(dt);
    this.updateEffects(dt);
    this.updateAbsorbing(dt);
    this.updateNPCs(dt);
    this.updateCamera(dt);
    this.world.update(dt, p.pos, this.camera);
    this.updateRegion(dt);
    ui.update(dt, this.camera);
    this.saveTick += dt;
    if (this.saveTick > 15) { this.saveTick = 0; this.save(); }
    inp.endFrame();
  }

  updatePlayer(dt, locked) {
    const p = this.p, w = this.world;
    for (const k in p.cds) p.cds[k] = Math.max(0, p.cds[k] - dt);
    p.attackCd -= dt;
    p.invuln -= dt;
    p.slowT -= dt;
    p.absorbT -= dt;
    p.waterCd -= dt;
    p.lastHurt += dt;
    if (!p.dead) {
      p.mp = Math.min(p.stats.mpMax, p.mp + (0.8 + p.stats.mpMax * 0.012) * dt);
      if (p.lastHurt > 6) p.hp = Math.min(p.stats.hpMax, p.hp + p.stats.hpMax * 0.012 * dt);
    }
    const ax = locked ? { x: 0, y: 0, mag: 0 } : this.input.axis();
    const cy = this.cam.yaw;
    const wx = Math.cos(cy) * ax.x - Math.sin(cy) * -ax.y;
    const wz = -Math.sin(cy) * ax.x - Math.cos(cy) * -ax.y;
    const inWater = w.inWater(p.pos.x, p.pos.z);
    const speed = p.stats.spd * (inWater ? 0.75 : 1) * (p.slowT > 0 ? 0.5 : 1);
    if (p.dashT > 0) {
      p.dashT -= dt;
      for (const m of this.monsters) {
        if (m.dead || m.gone || p.hitSet.has(m)) continue;
        if (Math.hypot(m.pos.x - p.pos.x, m.pos.z - p.pos.z) < this.playerRadius() + m.radius + 0.4) {
          p.hitSet.add(m);
          this.damageMonster(m, p.stats.atk, p.pos);
        }
      }
    } else {
      const acc = Math.min(1, dt * (p.onGround ? 12 : 4));
      p.vel.x += (wx * speed - p.vel.x) * acc;
      p.vel.z += (wz * speed - p.vel.z) * acc;
    }
    if (ax.mag > 0.1 && p.dashT <= 0 && p.attackT < 0) p.yaw = angleLerp(p.yaw, Math.atan2(wx, wz), Math.min(1, dt * 12));
    if (ax.mag > 0.1 && ax.y < -0.5 && this.input.lookId === null) this.cam.yaw = angleLerp(this.cam.yaw, p.yaw + Math.PI, dt * 0.5);
    if (!locked && this.input.took('pular')) {
      if (p.onGround || inWater) {
        p.vel.y = 9.5 + p.stage * 0.4;
        p.onGround = false;
        sfx.pulo();
      } else if (p.jumps > 0) {
        p.jumps--;
        p.vel.y = 8.5;
        this.ringFx(p.pos, 0x9ff3e8, 0.3, 1.8, 0.35);
        sfx.pulo();
      }
    }
    p.vel.y -= 26 * dt;
    if (p.skills.has('asas') && this.input.held.has('pular') && p.vel.y < -2.5 && !p.onGround) p.vel.y = -2.5;
    p.pos.addScaledVector(p.vel, dt);
    const r = this.playerRadius();
    w.resolveCollision(p.pos, r * 0.8);
    if (!this.flags.has('dragaoAbsorvido')) {
      const dx = p.pos.x - SEAL.x, dz = p.pos.z - SEAL.z, d = Math.hypot(dx, dz);
      if (d < SEAL.r) { p.pos.x = SEAL.x + (dx / d) * SEAL.r; p.pos.z = SEAL.z + (dz / d) * SEAL.r; }
    }
    for (const m of this.monsters) {
      if (m.dead || m.gone || m.def.voa) continue;
      const dx = p.pos.x - m.pos.x, dz = p.pos.z - m.pos.z, d = Math.hypot(dx, dz), min = r * 0.8 + m.radius * 0.8;
      if (d < min && d > 0.001 && p.dashT <= 0) { p.pos.x = m.pos.x + (dx / d) * min; p.pos.z = m.pos.z + (dz / d) * min; }
    }
    const ground = w.groundAt(p.pos.x, p.pos.z);
    if (p.pos.y <= ground) {
      p.pos.y = ground;
      if (p.vel.y < 0) p.vel.y = 0;
      p.onGround = true;
      p.jumps = p.skills.has('asas') ? 1 : 0;
    } else p.onGround = p.pos.y - ground < 0.08;
    if (p.attackT >= 0) {
      p.attackT += dt / 0.32;
      if (!p.attackHit && p.attackT > 0.45) { p.attackHit = true; this.meleeHit(); }
      if (p.attackT >= 1) p.attackT = -1;
    }
    if (inWater && !p.skills.has('laminaAgua') && !p.hints.has('agua')) {
      p.hints.add('agua');
      this.ui.sage('Grande quantidade de água detectada. Use PREDADOR para absorver.');
    }
    const hs = Math.hypot(p.vel.x, p.vel.z);
    const pm = this.pm;
    pm.root.position.copy(p.pos);
    pm.root.rotation.y = p.yaw;
    pm.root.visible = !p.dead;
    pm.anim(dt, { moving: hs > 0.6, speed: hs, t: this.t, air: !p.onGround, dash: p.dashT > 0, absorb: p.absorbT > 0, attack: p.attackT });
    this.restoreFlash(pm, dt);
    this.pShadow.position.set(p.pos.x, ground + 0.04, p.pos.z);
    const hgt = Math.max(0, p.pos.y - ground);
    this.pShadow.scale.setScalar(r * 2.2 / (1 + hgt * 0.15));
    this.pShadow.visible = !p.dead;
    const t = this.absorbTarget();
    this.marker.visible = !!t && t.kind !== 'agua' && !p.dead;
    if (this.marker.visible) {
      const tp = t.obj.pos;
      const rr = t.kind === 'monstro' ? t.obj.radius * 1.3 : 0.9;
      this.marker.position.set(tp.x, w.groundAt(tp.x, tp.z) + 0.12, tp.z);
      this.marker.scale.setScalar(rr * (1 + Math.sin(this.t * 6) * 0.08));
    }
  }

  updateMonster(m, dt) {
    const p = this.p, w = this.world, def = m.def;
    if (m.gone) {
      m.respawnT -= dt;
      if (m.respawnT <= 0 && Math.hypot(p.pos.x - m.home.x, p.pos.z - m.home.z) > 50) this.respawnMonster(m);
      return;
    }
    const dx = p.pos.x - m.pos.x, dz = p.pos.z - m.pos.z;
    m.distToPlayer = Math.hypot(dx, dz);
    const active = m.distToPlayer < this.activeRange;
    m.visible = active && m.distToPlayer < this.viewRange;
    m.model.root.visible = m.visible;
    m.shadow.visible = m.visible;
    if (!active) {
      if (!m.dead && m.state !== 'idle') { m.pos.copy(m.home); m.pos.y = w.groundAt(m.home.x, m.home.z); m.hp = m.hpMax; m.state = 'idle'; }
      if (m.dead) { m.corpseT -= dt; if (m.corpseT <= 0) this.hideCorpse(m); }
      return;
    }
    if (m.dead) {
      this.restoreFlash(m.model, dt);
      if (!m.beingAbsorbed) {
        m.corpseT -= dt;
        if (m.corpseT <= 0) { this.hideCorpse(m); return; }
      }
      m.shadow.visible = !m.beingAbsorbed;
      return;
    }
    m.atkCd -= dt; m.slowT -= dt; m.rootT -= dt; m.special -= dt; m.provoked = (m.provoked || 0) - dt;
    if (m.poisonT > 0) {
      m.poisonT -= dt;
      m.poisonTick -= dt;
      if (m.poisonTick <= 0) {
        m.poisonTick = 0.5;
        const d = Math.max(1, Math.round(m.poisonDps * 0.5));
        m.hp -= d;
        this.ui.floatText(m.pos.clone().setY(m.pos.y + m.model.height * m.scale * 0.8), String(d), '#8cf05a');
        if (m.hp <= 0) { this.killMonster(m); return; }
      }
    }
    // Escolhe alvo: jogador ou aliado ativo mais próximo.
    const aggro = def.aggro * (this.world.isNight ? 1.3 : 1) * (m.provoked > 0 ? 2.2 : 1);
    let target = null, td = aggro;
    if (!p.dead && m.distToPlayer < td) { target = p; td = m.distToPlayer; }
    for (const a of this.allies) {
      if (!a.active || a.downT > 0) continue;
      const d = Math.hypot(a.pos.x - m.pos.x, a.pos.z - m.pos.z);
      if (d < td * 0.8) { target = a; td = d; }
    }
    const fromHome = Math.hypot(m.pos.x - m.home.x, m.pos.z - m.home.z);
    if (m.state === 'return') {
      target = null;
      if (fromHome < 4) { m.state = 'idle'; m.hp = m.hpMax; }
    } else if (target && fromHome < (def.chefe ? 45 : 60)) {
      m.state = 'chase';
      m.target = target;
    } else if (m.state === 'chase') {
      m.state = fromHome > 20 ? 'return' : 'idle';
      m.target = null;
    }
    let wx = 0, wz = 0, spd = 0;
    const tgt = m.state === 'chase' ? m.target : null;
    if (tgt) {
      const tx = tgt.pos.x - m.pos.x, tz = tgt.pos.z - m.pos.z, d = Math.hypot(tx, tz) || 1;
      const tr = tgt === p ? this.playerRadius() : 0.6;
      m.yaw = angleLerp(m.yaw, Math.atan2(tx, tz), Math.min(1, dt * 8));
      if (d > def.reach + tr * 0.5 && m.attackT < 0) { wx = tx / d; wz = tz / d; spd = def.spd; }
      else if (m.atkCd <= 0 && m.attackT < 0) { m.attackT = 0; m.attackHit = false; m.atkCd = def.chefe ? 1.7 : 1.4; }
      this.monsterSpecial(m, tgt, d, dt);
    } else if (m.state === 'return') {
      const tx = m.home.x - m.pos.x, tz = m.home.z - m.pos.z, d = Math.hypot(tx, tz) || 1;
      wx = tx / d; wz = tz / d; spd = def.spd;
      m.yaw = angleLerp(m.yaw, Math.atan2(tx, tz), Math.min(1, dt * 6));
      m.hp = Math.min(m.hpMax, m.hp + m.hpMax * 0.2 * dt);
    } else {
      m.timer -= dt;
      if (m.timer <= 0) {
        m.timer = rand(2, 6);
        m.wander = Math.random() < 0.6 ? { x: m.home.x + rand(-10, 10), z: m.home.z + rand(-10, 10) } : null;
      }
      if (m.wander) {
        const tx = m.wander.x - m.pos.x, tz = m.wander.z - m.pos.z, d = Math.hypot(tx, tz);
        if (d > 1) { wx = tx / d; wz = tz / d; spd = def.spd * 0.35; m.yaw = angleLerp(m.yaw, Math.atan2(tx, tz), Math.min(1, dt * 4)); }
        else m.wander = null;
      }
    }
    if (m.rootT > 0) spd = 0;
    if (m.slowT > 0) spd *= 0.5;
    const acc = Math.min(1, dt * 8);
    if (!m.charging) {
      m.vel.x += (wx * spd - m.vel.x) * acc;
      m.vel.z += (wz * spd - m.vel.z) * acc;
    }
    m.pos.x += m.vel.x * dt;
    m.pos.z += m.vel.z * dt;
    if (!def.voa) w.resolveCollision(m.pos, m.radius * 0.7);
    const g = w.groundAt(m.pos.x, m.pos.z);
    m.pos.y = def.voa ? Math.max(g, WATER_Y) + 2.6 + Math.sin(this.t * 2 + m.home.x) * 0.5 : g;
    if (m.attackT >= 0) {
      m.attackT += dt / (def.chefe ? 0.75 : 0.6);
      if (!m.attackHit && m.attackT > 0.5) {
        m.attackHit = true;
        const t2 = m.target;
        if (t2) {
          const d = Math.hypot(t2.pos.x - m.pos.x, t2.pos.z - m.pos.z);
          const tr = t2 === p ? this.playerRadius() : 0.6;
          if (d < def.reach + tr + 0.9) {
            if (t2 === p) this.hurtPlayer(def.atk, m.pos);
            else this.hurtAlly(t2, def.atk);
          }
        }
      }
      if (m.attackT >= 1) m.attackT = -1;
    }
    const hs = Math.hypot(m.vel.x, m.vel.z);
    m.model.root.position.copy(m.pos);
    m.model.root.rotation.y = m.yaw;
    m.model.anim(dt, { moving: hs > 0.4, speed: hs, t: this.t + m.home.z, attack: m.attackT });
    this.restoreFlash(m.model, dt);
    m.shadow.position.set(m.pos.x, g + 0.05, m.pos.z);
  }

  monsterSpecial(m, tgt, d, dt) {
    const p = this.p;
    if (m.type === 'aranha' && m.special <= 0 && d > 4 && d < 12) {
      m.special = rand(4, 7);
      const origin = m.pos.clone().setY(m.pos.y + 1);
      const dir = new THREE.Vector3(tgt.pos.x - origin.x, tgt.pos.y + 0.5 - origin.y, tgt.pos.z - origin.z).normalize();
      const mesh = new THREE.Mesh(this.shared.ball, new THREE.MeshBasicMaterial({ color: 0xf0f0f0 }));
      mesh.scale.setScalar(0.3);
      this.addProjectile({ mesh, pos: origin, dir, speed: 16, life: 1.2, radius: 0.9, dmg: m.def.atk * 0.5, owner: 'm', slow: 2.5 });
    }
    if (m.type === 'loboAlfa' && m.special <= 0 && d > 6 && d < 18) {
      m.special = rand(5, 8);
      m.charging = 0.5;
      const k = 22 / d;
      m.vel.set((tgt.pos.x - m.pos.x) * k, 0, (tgt.pos.z - m.pos.z) * k);
      this.ui.sage('O Lobo Alfa vai investir!', true);
    }
    if (m.charging) {
      m.charging -= dt;
      if (tgt === p && Math.hypot(p.pos.x - m.pos.x, p.pos.z - m.pos.z) < m.radius + this.playerRadius() + 0.3) {
        this.hurtPlayer(m.def.atk * 1.3, m.pos);
        m.charging = 0;
      }
      if (m.charging <= 0) { m.charging = 0; m.vel.set(0, 0, 0); }
    }
    if (m.type === 'ogroChefe' && m.special <= 0 && d < 9) {
      m.special = rand(6, 9);
      const at = m.pos.clone();
      const warn = new THREE.Mesh(new THREE.CircleGeometry(7, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0.25, depthWrite: false }));
      warn.position.set(at.x, this.world.groundAt(at.x, at.z) + 0.2, at.z);
      this.fx(warn, 1.0, (o, k) => { o.material.opacity = 0.15 + 0.3 * k; });
      this.ui.sage('Aviso: o Ogro Chefe vai golpear o chão! Afaste-se!', true);
      setTimeout(() => {
        if (m.dead) return;
        this.ringFx(at, 0xff8a3a, 1, 7.5, 0.5);
        sfx.explosao();
        if (Math.hypot(p.pos.x - at.x, p.pos.z - at.z) < 7) this.hurtPlayer(m.def.atk * 1.4, at);
        for (const a of this.allies) if (a.active && Math.hypot(a.pos.x - at.x, a.pos.z - at.z) < 7) this.hurtAlly(a, m.def.atk);
      }, 1000);
    }
  }

  separateMonsters() {
    const list = this.monsters.filter((m) => m.visible && !m.dead && !m.gone && !m.def.voa && m.state === 'chase');
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz), min = (a.radius + b.radius) * 0.8;
        if (d < min && d > 0.001) {
          const push = (min - d) / 2;
          a.pos.x -= (dx / d) * push; a.pos.z -= (dz / d) * push;
          b.pos.x += (dx / d) * push; b.pos.z += (dz / d) * push;
        }
      }
    }
  }

  hideCorpse(m) {
    m.gone = true;
    m.model.root.visible = false;
    m.shadow.visible = false;
    m.respawnT = m.def.chefe ? Infinity : rand(40, 70);
  }

  respawnMonster(m) {
    m.gone = false;
    m.dead = false;
    m.hp = m.hpMax;
    m.state = 'idle';
    m.target = null;
    m.pos.copy(m.home);
    m.pos.y = this.world.groundAt(m.home.x, m.home.z);
    m.model.root.rotation.set(0, m.yaw, 0);
    m.model.root.scale.setScalar(m.scale);
    for (const mt of m.model.mats) if (mt.color && mt.userData.c0 !== undefined) mt.color.setHex(mt.userData.c0);
    m.model.root.visible = true;
    m.shadow.visible = true;
  }

  hurtAlly(a, amount) {
    if (a.downT > 0) return;
    const dmg = Math.max(1, Math.round(amount * rand(0.9, 1.1) - this.p.level * 0.4));
    a.hp -= dmg;
    this.flashMats(a.model, 0xff4060, 0.12);
    this.ui.floatText(a.pos.clone().setY(a.pos.y + 2), '-' + dmg, '#ffb0b8');
    if (a.hp <= 0) {
      a.downT = 25;
      a.model.root.visible = false;
      a.shadow.visible = false;
      this.ui.sage(`${a.name} desmaiou e volta em breve.`);
    }
  }

  updateGoblin(g, dt) {
    const p = this.p, w = this.world;
    g.atkCd -= dt;
    let wx = 0, wz = 0, spd = 0, look = 0;
    if (g.named && g.active) {
      if (g.downT > 0) {
        g.downT -= dt;
        if (g.downT <= 0) {
          g.hp = g.hpMax;
          g.pos.set(p.pos.x + rand(-3, 3), 0, p.pos.z + rand(-3, 3));
          g.model.root.visible = true;
          g.shadow.visible = true;
        } else return;
      }
      g.hp = Math.min(g.hpMax, g.hp + g.hpMax * 0.02 * dt);
      if (!g.target || g.target.dead || g.target.gone || Math.hypot(g.target.pos.x - p.pos.x, g.target.pos.z - p.pos.z) > 18) {
        g.target = null;
        let bd = 14;
        for (const m of this.monsters) {
          if (m.dead || m.gone || !m.visible) continue;
          const d = Math.hypot(m.pos.x - p.pos.x, m.pos.z - p.pos.z);
          if (d < bd && (m.state === 'chase' || d < 8)) { bd = d; g.target = m; }
        }
      }
      const dp = Math.hypot(p.pos.x - g.pos.x, p.pos.z - g.pos.z);
      if (dp > 50) {
        g.pos.set(p.pos.x + rand(-3, 3), 0, p.pos.z + rand(-3, 3));
        g.target = null;
      }
      if (g.target) {
        const m = g.target;
        const tx = m.pos.x - g.pos.x, tz = m.pos.z - g.pos.z, d = Math.hypot(tx, tz) || 1;
        g.yaw = angleLerp(g.yaw, Math.atan2(tx, tz), Math.min(1, dt * 8));
        if (d > m.radius + 1.6) { wx = tx / d; wz = tz / d; spd = 7.5; }
        else if (g.atkCd <= 0 && g.attackT < 0) { g.attackT = 0; g.atkCd = 1.1; g.hitDone = false; }
      } else {
        const slot = this.allies.filter((a) => a.active).indexOf(g);
        const ang = p.yaw + Math.PI + (slot - 1.5) * 0.6;
        const fx = p.pos.x + Math.sin(ang) * 3.2, fz = p.pos.z + Math.cos(ang) * 3.2;
        const tx = fx - g.pos.x, tz = fz - g.pos.z, d = Math.hypot(tx, tz);
        if (d > 1.2) { wx = tx / d; wz = tz / d; spd = Math.min(p.stats.spd * 1.25, 3 + d * 1.2); g.yaw = angleLerp(g.yaw, Math.atan2(tx, tz), Math.min(1, dt * 8)); }
      }
      if (g.attackT >= 0) {
        g.attackT += dt / 0.45;
        if (!g.hitDone && g.attackT > 0.5) {
          g.hitDone = true;
          if (g.target && !g.target.dead) this.damageMonster(g.target, g.atk, g.pos, 3);
        }
        if (g.attackT >= 1) g.attackT = -1;
      }
    } else {
      const dp = Math.hypot(p.pos.x - g.pos.x, p.pos.z - g.pos.z);
      g.timer -= dt;
      if (g.timer <= 0) {
        g.timer = rand(3, 7);
        g.wander = Math.random() < 0.5 ? { x: g.home.x + rand(-5, 5), z: g.home.z + rand(-5, 5) } : null;
      }
      if (dp < 6) {
        g.wander = null;
        g.yaw = angleLerp(g.yaw, Math.atan2(p.pos.x - g.pos.x, p.pos.z - g.pos.z), Math.min(1, dt * 4));
      } else if (g.wander) {
        const tx = g.wander.x - g.pos.x, tz = g.wander.z - g.pos.z, d = Math.hypot(tx, tz);
        if (d > 0.8) { wx = tx / d; wz = tz / d; spd = 1.8; g.yaw = angleLerp(g.yaw, Math.atan2(tx, tz), Math.min(1, dt * 4)); }
        else g.wander = null;
      }
      if (dp > this.viewRange) { g.model.root.visible = false; g.shadow.visible = false; return; }
    }
    g.model.root.visible = true;
    g.shadow.visible = true;
    const acc = Math.min(1, dt * 8);
    g.vel.x += (wx * spd - g.vel.x) * acc;
    g.vel.z += (wz * spd - g.vel.z) * acc;
    g.pos.x += g.vel.x * dt;
    g.pos.z += g.vel.z * dt;
    w.resolveCollision(g.pos, 0.4);
    g.pos.y = w.groundAt(g.pos.x, g.pos.z);
    const hs = Math.hypot(g.vel.x, g.vel.z);
    g.model.root.position.copy(g.pos);
    g.model.root.rotation.y = g.yaw;
    g.model.anim(dt, { moving: hs > 0.3, speed: hs, t: this.t + g.i, attack: g.attackT, look });
    this.restoreFlash(g.model, dt);
    g.shadow.position.set(g.pos.x, g.pos.y + 0.04, g.pos.z);
  }

  updateNPCs(dt) {
    const p = this.p;
    const d = this.dragon;
    if (d.model.root.visible) {
      const a = Math.atan2(p.pos.x - d.pos.x, p.pos.z - d.pos.z) - Math.PI;
      let rel = a;
      while (rel > Math.PI) rel -= Math.PI * 2;
      while (rel < -Math.PI) rel += Math.PI * 2;
      const st = { t: this.t, look: clamp(rel, -0.7, 0.7), unsealed: this.flags.has('dragaoAbsorvido'), moving: false, speed: 0, attack: -1 };
      d.model.anim(dt, st);
      if (this.dragonSeal) this.dragonSeal.anim(dt, st);
    }
    const e = this.elder;
    const ea = Math.atan2(p.pos.x - e.pos.x, p.pos.z - e.pos.z);
    e.model.root.rotation.y = angleLerp(e.model.root.rotation.y, e.pos.distanceTo(p.pos) < 12 ? ea : 0, Math.min(1, dt * 3));
    e.model.anim(dt, { moving: false, speed: 0, t: this.t, attack: -1 });
  }

  updateItems(dt) {
    const p = this.p;
    for (const it of this.items) {
      if (!it.active) {
        if (it.respawnT > 0) {
          it.respawnT -= dt;
          if (it.respawnT <= 0 && it.pos.distanceTo(p.pos) > 25) {
            it.active = true;
            it.model.root.visible = true;
            it.model.root.scale.setScalar(1);
            it.pos.y = this.world.heightAt(it.pos.x, it.pos.z);
          } else if (it.respawnT <= 0) it.respawnT = 5;
        }
        continue;
      }
      const near = Math.abs(it.pos.x - p.pos.x) < 60 && Math.abs(it.pos.z - p.pos.z) < 60;
      it.model.root.visible = near;
      if (near) it.model.anim(dt, { t: this.t });
    }
  }

  updateProjectiles(dt) {
    const p = this.p;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const o = this.projectiles[i];
      o.life -= dt;
      o.pos.addScaledVector(o.vel, dt);
      o.mesh.position.copy(o.pos);
      let dead = o.life <= 0 || o.pos.y < this.world.heightAt(o.pos.x, o.pos.z) - 0.3;
      if (!dead && o.owner === 'p') {
        for (const m of this.monsters) {
          if (m.dead || m.gone || o.hit.has(m)) continue;
          const cy = m.pos.y + m.model.height * m.scale * 0.4;
          if (Math.hypot(m.pos.x - o.pos.x, m.pos.z - o.pos.z) < m.radius + o.radius && Math.abs(cy - o.pos.y) < m.model.height * m.scale * 0.6 + 1) {
            o.hit.add(m);
            this.damageMonster(m, o.dmg, o.pos.clone().sub(o.vel));
            if (o.root) { m.rootT = o.root; this.ui.floatText(m.pos.clone().setY(m.pos.y + 2), 'Preso!', '#e8e8f0'); }
            if (!o.pierce) { dead = true; break; }
          }
        }
      } else if (!dead && o.owner === 'm' && !p.dead) {
        if (Math.hypot(p.pos.x - o.pos.x, p.pos.z - o.pos.z) < this.playerRadius() + o.radius && Math.abs(p.pos.y + 0.5 - o.pos.y) < 1.6) {
          this.hurtPlayer(o.dmg, null);
          if (o.slow) { p.slowT = o.slow; this.ui.floatText(p.pos.clone().setY(p.pos.y + 2), 'Lento!', '#e8e8f0'); }
          dead = true;
        }
      }
      if (dead) {
        this.scene.remove(o.mesh);
        o.mesh.material.dispose();
        this.projectiles.splice(i, 1);
      }
    }
  }

  updateEffects(dt) {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      e.t += dt;
      const k = Math.min(1, e.t / e.dur);
      e.fn(e.obj, k, dt);
      if (k >= 1) {
        this.scene.remove(e.obj);
        if (e.obj.material) e.obj.material.dispose();
        if (e.obj.userData.mat) e.obj.userData.mat.dispose();
        this.effects.splice(i, 1);
      }
    }
  }

  updateAbsorbing(dt) {
    const p = this.p;
    for (let i = this.absorbing.length - 1; i >= 0; i--) {
      const a = this.absorbing[i];
      a.t += dt / 0.55;
      const k = Math.min(1, a.t);
      const e = k * k;
      a.obj.position.lerpVectors(a.from, p.pos.clone().setY(p.pos.y + 0.5), e);
      a.obj.scale.copy(a.s0).multiplyScalar(1 - e * 0.95);
      a.obj.rotation.y += dt * 12;
      if (k >= 1) {
        a.obj.position.copy(a.from);
        a.obj.scale.copy(a.s0);
        this.absorbing.splice(i, 1);
        a.done();
      }
    }
  }

  updateCamera(dt) {
    const p = this.p, c = this.cam;
    const look = this.input.consumeLook();
    if (!this.ui.busy) {
      c.yaw -= look.dx * 0.006;
      c.pitch = clamp(c.pitch + look.dy * 0.004, 0.05, 1.15);
    }
    const r = this.playerRadius();
    const targetDist = p.form === 'slime' ? 5.2 + STAGES[p.stage].size * 2.2 : p.form === 'lobo' ? 7.5 : 6;
    c.dist = lerp(c.dist, targetDist, Math.min(1, dt * 3));
    const focus = new THREE.Vector3(p.pos.x, p.pos.y + (p.form === 'slime' ? r * 1.3 : 1.6), p.pos.z);
    const cp = Math.cos(c.pitch);
    const want = new THREE.Vector3(
      focus.x + Math.sin(c.yaw) * cp * c.dist,
      focus.y + Math.sin(c.pitch) * c.dist,
      focus.z + Math.cos(c.yaw) * cp * c.dist,
    );
    const gy = this.world.groundAt(want.x, want.z) + 0.7;
    if (want.y < gy) want.y = gy;
    this.camera.position.lerp(want, Math.min(1, dt * 10));
    this.camera.lookAt(focus);
  }

  updateRegion(dt) {
    this.regionTick -= dt;
    if (this.regionTick > 0) return;
    this.regionTick = 0.5;
    const r = this.world.regionAt(this.p.pos.x, this.p.pos.z);
    if (r.id !== this.regionId) {
      const first = this.regionId === null;
      this.regionId = r.id;
      if (!first || r.id !== 'gruta') this.ui.regionToast(r.nome);
      if (r.id !== 'gruta') this.emit('regiao:floresta');
      if (r.id === 'vila') this.flags.add('vilaVisitada');
    }
    if (this.world.isNight && !this.p.hints.has('noite')) {
      this.p.hints.add('noite');
      this.ui.sage('Anoiteceu. À noite os monstros enxergam mais longe.');
    }
  }
}
