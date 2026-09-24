// Interface: HUD, mensagens do Grande Sábio, diálogos, menus e minimapa.
import * as THREE from 'three';
import { SKILLS, STAGES, QUESTS, SPECIES, MONSTERS, NAME_COST, xpNext, PLACES } from './data.js';
import { HALF } from './world.js';
import { sfx } from './audio.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export class UI {
  constructor(game) {
    this.g = game;
    this.sageQueue = [];
    this.sageTimer = 0;
    this.labels = [];
    this.bars = [];
    this.textTick = 0;
    this.v3 = new THREE.Vector3();
    this.mapBig = false;
    this.hotbarShown = [];
    this.mini = $('minimap');
    this.miniCtx = this.mini.getContext('2d');
    this.dialogState = null;
    this.menuTab = 'status';

    this.setupIcons();
    $('minimap').addEventListener('click', () => { this.mapBig = !this.mapBig; $('mapWrap').classList.toggle('big', this.mapBig); sfx.ui(); });
    $('menuClose').addEventListener('click', () => this.closeMenu());
    document.querySelectorAll('#menuTabs button').forEach((b) => b.addEventListener('click', () => { this.menuTab = b.dataset.tab; this.renderMenu(); sfx.ui(); }));
    $('menuBody').addEventListener('click', (e) => this.onMenuClick(e));
    $('dialog').addEventListener('click', (e) => { if (!e.target.closest('button, input')) this.advanceDialog(); });
    $('namingClose').addEventListener('click', () => this.closeNaming());
    $('namingList').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-name]');
      if (!b) return;
      const i = +b.dataset.name;
      const input = $('nm' + i);
      this.g.nameGoblin(i, input.value);
      this.renderNaming();
    });
  }

  // ------------------------------------------------ Ícones (folhas 3x3 geradas no Canva)
  setupIcons() {
    const pos = (i) => `${(i % 3) * 50}% ${Math.floor(i / 3) * 50}%`;
    const ACT = { atacar: 0, pular: 1, predador: 2, pocao: 3, forma: 4, falar: 5, evoluir: 6, menu: 7 };
    document.querySelectorAll('.act[data-act]').forEach((b) => {
      const act = b.dataset.act;
      if (act.startsWith('skill')) return;
      const label = b.childNodes[0] && b.childNodes[0].nodeType === 3 ? b.childNodes[0].textContent : '';
      if (b.childNodes[0] && b.childNodes[0].nodeType === 3) b.childNodes[0].remove();
      const lbl = document.createElement('span');
      lbl.className = 'lbl';
      lbl.textContent = label;
      b.prepend(lbl);
      if (ACT[act] !== undefined && !b.classList.contains('small') && !b.classList.contains('talk') && !b.classList.contains('evolve')) {
        const ico = document.createElement('i');
        ico.className = 'ico';
        ico.style.backgroundImage = 'url(ui/icones-acoes.jpg)';
        ico.style.backgroundPosition = pos(ACT[act]);
        b.prepend(ico);
      }
    });
    for (let i = 0; i < 3; i++) {
      const b = $('sk' + i);
      const ico = document.createElement('i');
      ico.className = 'ico';
      b.prepend(ico);
      b.querySelector('span').className = 'lbl';
    }
    this.skillPos = pos;
    const probe = new Image();
    probe.onload = () => document.body.classList.add('has-icons');
    probe.src = 'ui/icones-habilidades.jpg';
    const art = new Image();
    art.onload = () => { $('title').style.setProperty('--title-art', 'url(ui/titulo.jpg)'); $('title').classList.add('art'); };
    art.src = 'ui/titulo.jpg';
  }

  skillIcon(id) {
    const IDX = { laminaAgua: 0, fioAco: 1, venenoCorrosivo: 2, chamaNegra: 3, predador: 4, faro: 5, mimetismoLobo: 5, asas: 6, peleBlindada: 7, forcaBruta: 8, protecaoDragao: 7, sabio: 4, mimetismoHumano: 4 };
    return IDX[id] === undefined ? null : `background-image:url(ui/icones-habilidades.jpg);background-position:${this.skillPos(IDX[id])}`;
  }

  // ------------------------------------------------ Grande Sábio
  sage(text, priority = false) {
    if (priority) this.sageQueue.unshift(text); else this.sageQueue.push(text);
    if (this.sageQueue.length > 6) this.sageQueue.length = 6;
  }

  regionToast(name) {
    const el = $('regionToast');
    el.textContent = name;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }

  floatText(pos, text, color = '#fff', big = false) {
    let l = this.labels.find((x) => x.life <= 0);
    if (!l) {
      if (this.labels.length > 24) return;
      const el = document.createElement('div');
      el.className = 'float';
      $('labels').appendChild(el);
      l = { el, pos: new THREE.Vector3(), life: 0 };
      this.labels.push(l);
    }
    l.el.textContent = text;
    l.el.style.color = color;
    l.el.classList.toggle('big', big);
    l.pos.copy(pos);
    l.pos.x += (Math.random() - 0.5) * 0.6;
    l.life = 1.1;
    l.el.hidden = false;
  }

  project(pos, camera) {
    this.v3.copy(pos).project(camera);
    if (this.v3.z > 1) return null;
    return { x: (this.v3.x * 0.5 + 0.5) * window.innerWidth, y: (-this.v3.y * 0.5 + 0.5) * window.innerHeight };
  }

  update(dt, camera) {
    const g = this.g, p = g.p;
    // Sábio
    this.sageTimer -= dt;
    if (this.sageTimer <= 0) {
      if (this.sageQueue.length) {
        $('sageText').textContent = this.sageQueue.shift();
        $('sage').hidden = false;
        $('sage').classList.remove('in'); void $('sage').offsetWidth; $('sage').classList.add('in');
        this.sageTimer = this.sageQueue.length > 2 ? 1.6 : this.sageQueue.length > 0 ? 2.2 : 3;
        sfx.sabio();
      } else {
        $('sage').hidden = true;
      }
    }
    // Números flutuantes
    for (const l of this.labels) {
      if (l.life <= 0) continue;
      l.life -= dt;
      l.pos.y += dt * 1.6;
      const s = this.project(l.pos, camera);
      if (!s || l.life <= 0) { l.el.hidden = true; if (l.life <= 0) l.life = 0; continue; }
      l.el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -50%)`;
      l.el.style.opacity = Math.min(1, l.life * 2);
    }
    // Barras de vida dos monstros
    const shown = g.monsters.filter((m) => !m.dead && m.visible && m.hp < m.hpMax && !MONSTERS[m.type].chefe && m.distToPlayer < 30).slice(0, 6);
    while (this.bars.length < shown.length) {
      const el = document.createElement('div');
      el.className = 'mbar';
      el.innerHTML = '<i></i>';
      $('labels').appendChild(el);
      this.bars.push(el);
    }
    this.bars.forEach((el, i) => {
      const m = shown[i];
      if (!m) { el.hidden = true; return; }
      const s = this.project(this.v3.set(m.pos.x, m.pos.y + m.model.height * m.scale + 0.5, m.pos.z), camera);
      if (!s) { el.hidden = true; return; }
      el.hidden = false;
      el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -50%)`;
      el.firstChild.style.width = (100 * m.hp) / m.hpMax + '%';
    });
    // Chefe
    const boss = g.monsters.find((m) => !m.dead && MONSTERS[m.type].chefe && m.state === 'chase');
    $('bossBar').hidden = !boss;
    if (boss) {
      $('bossName').textContent = MONSTERS[boss.type].nome;
      $('bossFill').style.width = (100 * boss.hp) / boss.hpMax + '%';
    }
    // Barras do jogador (todo quadro, são baratas)
    $('hpFill').style.width = (100 * p.hp) / p.stats.hpMax + '%';
    $('mpFill').style.width = (100 * p.mp) / p.stats.mpMax + '%';
    $('xpFill').style.width = (100 * p.xp) / xpNext(p.level) + '%';
    // Recargas das habilidades
    for (let i = 0; i < 3; i++) {
      const id = p.hotbar[i];
      const btn = $('sk' + i);
      const cd = btn.querySelector('.cd');
      if (!id) { btn.hidden = true; continue; }
      btn.hidden = false;
      const left = p.cds[id] || 0;
      const frac = left > 0 ? left / SKILLS[id].cd : 0;
      cd.style.background = frac > 0 ? `conic-gradient(rgba(6,10,26,.72) ${frac * 360}deg, transparent 0)` : 'none';
      btn.classList.toggle('nomp', p.mp < SKILLS[id].mp);
    }
    this.textTick -= dt;
    if (this.textTick <= 0) { this.textTick = 0.2; this.updateText(); }
    this.drawMinimap();
  }

  updateText() {
    const g = this.g, p = g.p;
    $('pName').textContent = p.name;
    $('pForm').textContent = p.form === 'slime' ? STAGES[p.stage].nome : p.form === 'lobo' ? 'Forma de Lobo' : 'Forma Humana';
    $('pLvl').textContent = 'Nv ' + p.level;
    $('lvlBadge').textContent = p.level;
    $('portrait').style.background = `radial-gradient(circle at 40% 35%, #ffffffcc, #${STAGES[p.stage].cor.toString(16).padStart(6, '0')} 50%, #0b1a44)`;
    $('hpTxt').textContent = `${Math.ceil(p.hp)} / ${p.stats.hpMax}`;
    $('mpTxt').textContent = `${Math.floor(p.mp)} / ${p.stats.mpMax}`;
    $('clock').textContent = g.world.hourLabel + (g.world.isNight ? ' · noite' : '');
    const q = QUESTS[g.quest.i];
    $('qTitle').textContent = q.titulo;
    $('qDesc').textContent = q.desc;
    let prog = q.n > 1 ? `${g.quest.n} / ${q.n}` : '';
    const tgt = g.questTarget();
    if (tgt) {
      const d = Math.round(Math.hypot(tgt.x - p.pos.x, tgt.z - p.pos.z));
      if (d > 8) prog += (prog ? ' · ' : '') + d + ' m';
    }
    $('qProg').textContent = prog;
    for (let i = 0; i < 3; i++) {
      const id = p.hotbar[i];
      if (id && this.hotbarShown[i] !== id) {
        this.hotbarShown[i] = id;
        $('sk' + i).querySelector('.lbl').textContent = SKILLS[id].nome;
        $('sk' + i).querySelector('.ico').style.cssText = this.skillIcon(id) || '';
      }
    }
    $('potionN').textContent = p.potions;
    $('btnPotion').classList.toggle('empty', p.potions === 0);
    $('btnForm').hidden = !g.availableForms().some((f) => f !== 'slime');
    $('btnEvolve').hidden = !g.canEvolve().ok;
    const near = g.nearbyTalk();
    $('btnTalk').hidden = !near || !!this.dialogState;
    if (near) $('btnTalk').textContent = 'FALAR · ' + near.label;
    $('btnPredator').classList.toggle('ready', !!g.absorbTarget());
  }

  drawMinimap() {
    const g = this.g, p = g.p, c = this.miniCtx;
    const S = this.mini.width;
    const img = g.world.minimapImage;
    const big = this.mapBig;
    const view = big ? HALF * 2 : 110;
    const cx = big ? 0 : p.pos.x, cz = big ? 0 : p.pos.z;
    const toMap = (x, z) => [((x - cx) / view + 0.5) * S, ((z - cz) / view + 0.5) * S];
    c.clearRect(0, 0, S, S);
    const scale = img.width / (HALF * 2);
    c.imageSmoothingEnabled = true;
    c.drawImage(img, (cx - view / 2 + HALF) * scale, (cz - view / 2 + HALF) * scale, view * scale, view * scale, 0, 0, S, S);
    const dot = (x, z, r, color) => {
      const [mx, my] = toMap(x, z);
      if (mx < -4 || my < -4 || mx > S + 4 || my > S + 4) return;
      c.beginPath(); c.arc(mx, my, r, 0, Math.PI * 2); c.fillStyle = color; c.fill();
    };
    const sense = p.skills.has('faro');
    for (const m of g.monsters) {
      if (m.dead) continue;
      const boss = MONSTERS[m.type].chefe;
      if (boss) dot(m.pos.x, m.pos.z, big ? 4 : 5, '#ff3b5c');
      else if (sense || m.distToPlayer < 22) dot(m.pos.x, m.pos.z, big ? 1.6 : 3, '#ff6b7d');
    }
    for (const a of g.allies) if (a.active) dot(a.pos.x, a.pos.z, big ? 2 : 3, '#8cf05a');
    const t = g.questTarget();
    if (t) {
      let [mx, my] = toMap(t.x, t.z);
      mx = Math.max(8, Math.min(S - 8, mx)); my = Math.max(8, Math.min(S - 8, my));
      c.save(); c.translate(mx, my); c.rotate(Math.PI / 4);
      c.fillStyle = '#f2c14e'; c.strokeStyle = '#1a1206'; c.lineWidth = 2;
      c.fillRect(-5, -5, 10, 10); c.strokeRect(-5, -5, 10, 10); c.restore();
    }
    const [px, py] = toMap(p.pos.x, p.pos.z);
    c.save(); c.translate(px, py); c.rotate(-p.yaw + Math.PI);
    c.beginPath(); c.moveTo(0, -9); c.lineTo(6, 6); c.lineTo(0, 3); c.lineTo(-6, 6); c.closePath();
    c.fillStyle = '#9ff3e8'; c.strokeStyle = '#06101a'; c.lineWidth = 2; c.fill(); c.stroke();
    c.restore();
    if (big) {
      c.font = '600 13px "M PLUS Rounded 1c", system-ui, sans-serif';
      c.textAlign = 'center';
      const labels = [['Gruta do Selo', 0, 172], ['Vila Goblin', -95, -30], ['Lago Cristalino', -150, 110], ['Covil', 120, -70], ['Acampamento Ogro', 70, -165], ['Planícies', 155, 95]];
      for (const [n, x, z] of labels) {
        const [mx, my] = toMap(x, z);
        c.lineWidth = 3; c.strokeStyle = 'rgba(6,10,26,.8)'; c.strokeText(n, mx, my - 8);
        c.fillStyle = '#eaf6ff'; c.fillText(n, mx, my - 8);
      }
    }
  }

  // ------------------------------------------------ Diálogo
  dialog(lines, opts = {}) {
    return new Promise((resolve) => {
      this.dialogState = { lines, i: 0, resolve, opts, typing: null };
      $('dialog').hidden = false;
      this.g.input.release();
      this.showLine();
    });
  }

  showLine() {
    const st = this.dialogState;
    const line = st.lines[st.i];
    $('dlgWho').textContent = line.quem || '';
    $('dlgWho').className = line.quem === 'Grande Sábio' ? 'sage-who' : '';
    const el = $('dlgText');
    el.textContent = '';
    const ch = $('dlgChoices');
    ch.innerHTML = '';
    ch.hidden = true;
    $('dlgInputRow').hidden = true;
    $('dlgNext').hidden = false;
    let k = 0;
    clearInterval(st.typing);
    st.full = false;
    st.typing = setInterval(() => {
      k += 2;
      el.textContent = line.texto.slice(0, k);
      if (k >= line.texto.length) this.finishTyping();
    }, 22);
  }

  finishTyping() {
    const st = this.dialogState;
    const line = st.lines[st.i];
    clearInterval(st.typing);
    $('dlgText').textContent = line.texto;
    st.full = true;
    if (line.escolhas) {
      $('dlgNext').hidden = true;
      const ch = $('dlgChoices');
      ch.hidden = false;
      ch.innerHTML = line.escolhas.map((c, i) => `<button class="choice" data-i="${i}">${esc(c)}</button>`).join('');
      ch.querySelectorAll('button').forEach((b) => b.addEventListener('click', (e) => {
        e.stopPropagation();
        sfx.ui();
        st.answer = +b.dataset.i;
        this.nextLine();
      }));
    }
    if (line.entrada) {
      $('dlgNext').hidden = true;
      $('dlgInputRow').hidden = false;
      const inp = $('dlgInput');
      inp.value = line.entrada;
      $('dlgOk').onclick = (e) => {
        e.stopPropagation();
        const v = inp.value.trim().slice(0, 16);
        if (!v) { inp.focus(); return; }
        st.answer = v;
        inp.blur();
        this.nextLine();
      };
    }
  }

  advanceDialog() {
    const st = this.dialogState;
    if (!st) return;
    if (!st.full) { this.finishTyping(); return; }
    const line = st.lines[st.i];
    if (line.escolhas || line.entrada) return;
    sfx.ui();
    this.nextLine();
  }

  nextLine() {
    const st = this.dialogState;
    st.i++;
    if (st.i >= st.lines.length) {
      clearInterval(st.typing);
      $('dialog').hidden = true;
      this.dialogState = null;
      st.resolve(st.answer);
    } else this.showLine();
  }

  get busy() { return !!this.dialogState || !$('menu').hidden || !$('naming').hidden; }

  // ------------------------------------------------ Menu
  openMenu(tab) {
    if (tab) this.menuTab = tab;
    $('menu').hidden = false;
    this.g.input.release();
    this.renderMenu();
  }
  closeMenu() { $('menu').hidden = true; sfx.ui(); }
  toggleMenu() { if ($('menu').hidden) this.openMenu(); else this.closeMenu(); }

  renderMenu() {
    document.querySelectorAll('#menuTabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === this.menuTab));
    const g = this.g, p = g.p;
    let h = '';
    if (this.menuTab === 'status') {
      const st = p.stats;
      h += `<div class="stat-head"><div><h3>${esc(p.name)}</h3><p>${STAGES[p.stage].nome} · Nível ${p.level}</p></div><p class="xp-line">XP ${p.xp} / ${xpNext(p.level)}</p></div>`;
      h += `<dl class="stats"><div><dt>HP</dt><dd>${Math.ceil(p.hp)} / ${st.hpMax}</dd></div><div><dt>PM</dt><dd>${Math.floor(p.mp)} / ${st.mpMax}</dd></div><div><dt>Ataque</dt><dd>${Math.round(st.atk)}</dd></div><div><dt>Defesa</dt><dd>${Math.round(st.def)}</dd></div><div><dt>Velocidade</dt><dd>${st.spd.toFixed(1)}</dd></div></dl>`;
      h += `<h4>Espécies analisadas (${p.species.size} / ${SPECIES.length})</h4><ul class="chips">`;
      h += SPECIES.map((s) => `<li class="${p.species.has(s) ? 'got' : ''}">${p.species.has(s) ? MONSTERS[s].nome : '???'}</li>`).join('');
      h += '</ul><h4>Estômago do Predador</h4><dl class="stats">';
      h += `<div><dt>Ervas Luminosas</dt><dd>${p.herbs}</dd></div><div><dt>Poções de Cura</dt><dd>${p.potions}</dd></div><div><dt>Minério Mágico</dt><dd>${p.ores}</dd></div><div><dt>Cristais sintetizados</dt><dd>${p.crystals}</dd></div></dl>`;
      const named = g.goblins.filter((x) => x.named);
      h += `<h4>Aliados nomeados (${named.length})</h4>`;
      h += named.length ? '<ul class="chips">' + named.map((a) => `<li class="got">${esc(a.name)}</li>`).join('') + '</ul>' : '<p class="muted">Nenhum ainda. Dê nomes aos goblins da vila.</p>';
    } else if (this.menuTab === 'skills') {
      const groups = [['unica', 'Habilidades únicas'], ['ativa', 'Ativas (usam PM)'], ['passiva', 'Passivas'], ['forma', 'Mimetismo']];
      for (const [type, title] of groups) {
        const list = [...p.skills].filter((id) => SKILLS[id].type === type);
        if (!list.length) continue;
        h += `<h4>${title}</h4><ul class="skills">`;
        for (const id of list) {
          const s = SKILLS[id];
          const icoCss = this.skillIcon(id);
          h += `<li>${icoCss ? `<span class="sk-ico" style="${icoCss}"></span>` : ''}<div><b>${s.nome}</b>${s.mp ? `<span class="cost">${s.mp} PM</span>` : ''}<p>${s.desc}</p></div>`;
          if (type === 'ativa') {
            h += '<div class="slots">' + [0, 1, 2].map((i) => `<button data-slot="${i}" data-skill="${id}" class="${p.hotbar[i] === id ? 'on' : ''}">${i + 1}</button>`).join('') + '</div>';
          }
          if (type === 'forma') {
            const f = s.forma;
            h += `<div class="slots"><button data-form="${p.form === f ? 'slime' : f}" class="wide">${p.form === f ? 'Voltar a slime' : 'Usar forma'}</button></div>`;
          }
          h += '</li>';
        }
        h += '</ul>';
      }
      h += '<p class="muted">Toque em 1, 2 ou 3 para escolher em qual botão de atalho a habilidade fica.</p>';
    } else if (this.menuTab === 'evo') {
      h += '<ol class="evo">';
      STAGES.forEach((s, i) => {
        const cls = i < p.stage ? 'done' : i === p.stage ? 'now' : '';
        h += `<li class="${cls}"><b>${s.nome}</b>`;
        if (i === p.stage + 1) {
          const ev = g.canEvolve();
          h += '<ul class="reqs">' + ev.reqs.map((r) => `<li class="${r.ok ? 'ok' : ''}">${r.ok ? '✓' : '○'} ${r.txt}</li>`).join('') + '</ul>';
          if (ev.ok) h += '<button data-evolve="1" class="gold">Evoluir agora</button>';
        } else if (i === p.stage) h += '<span class="tag">forma atual</span>';
        h += '</li>';
      });
      h += '</ol>';
    } else if (this.menuTab === 'quests') {
      const q = QUESTS[g.quest.i];
      h += `<div class="quest-card"><small>Missão atual</small><h3>${q.titulo}</h3><p>${q.desc}</p>${q.n > 1 ? `<p class="xp-line">${g.quest.n} / ${q.n}</p>` : ''}</div>`;
      if (g.quest.i > 0) {
        h += '<h4>Concluídas</h4><ul class="done-list">' + QUESTS.slice(0, g.quest.i).map((x) => `<li>✓ ${x.titulo}</li>`).join('') + '</ul>';
      }
    } else if (this.menuTab === 'config') {
      const q = g.settings.quality;
      h += '<h4>Qualidade gráfica</h4><div class="seg">' + [['baixa', 'Baixa'], ['media', 'Média'], ['alta', 'Alta']].map(([k, n]) => `<button data-quality="${k}" class="${q === k ? 'on' : ''}">${n}</button>`).join('') + '</div>';
      h += '<p class="muted">Se o jogo travar no iPhone, use Baixa.</p>';
      h += `<h4>Som</h4><div class="seg"><button data-sound="1" class="${!g.settings.mute ? 'on' : ''}">Ligado</button><button data-sound="0" class="${g.settings.mute ? 'on' : ''}">Desligado</button></div>`;
      h += '<h4>Progresso</h4><div class="seg"><button data-save="1">Salvar agora</button><button data-reset="1" class="danger">Novo jogo</button></div>';
      h += '<div id="resetConfirm" hidden><p>Isso apaga todo o progresso salvo. Tem certeza?</p><div class="seg"><button data-reset="2" class="danger">Apagar e recomeçar</button><button data-reset="0">Cancelar</button></div></div>';
      h += '<h4>Controles</h4><p class="muted">iPhone: arraste no lado esquerdo para andar e no lado direito para girar a câmera. Toque no minimapa para abrir o mapa grande. Teclado: WASD andar, Espaço pular, J atacar, K Predador, 1-3 habilidades, E falar, Q poção, F forma, M menu.</p>';
    }
    $('menuBody').innerHTML = h;
  }

  onMenuClick(e) {
    const b = e.target.closest('button');
    if (!b) return;
    const g = this.g, p = g.p;
    sfx.ui();
    if (b.dataset.slot !== undefined) {
      const i = +b.dataset.slot, id = b.dataset.skill;
      const j = p.hotbar.indexOf(id);
      if (j >= 0) p.hotbar[j] = p.hotbar[i] || null;
      p.hotbar[i] = id;
      g.save();
    } else if (b.dataset.form) {
      g.setForm(b.dataset.form);
    } else if (b.dataset.evolve) {
      this.closeMenu();
      g.evolve();
      return;
    } else if (b.dataset.quality) {
      g.setQuality(b.dataset.quality);
    } else if (b.dataset.sound) {
      g.setMute(b.dataset.sound === '0');
    } else if (b.dataset.save) {
      g.save();
      this.sage('Progresso salvo.');
    } else if (b.dataset.reset === '1') {
      $('resetConfirm').hidden = false;
      return;
    } else if (b.dataset.reset === '2') {
      g.resetSave();
      return;
    } else if (b.dataset.reset === '0') {
      $('resetConfirm').hidden = true;
      return;
    }
    this.renderMenu();
  }

  // ------------------------------------------------ Nomear goblins
  openNaming() {
    $('naming').hidden = false;
    this.g.input.release();
    this.renderNaming();
  }
  closeNaming() { $('naming').hidden = true; sfx.ui(); }
  renderNaming() {
    const g = this.g;
    $('namingMp').textContent = `PM: ${Math.floor(g.p.mp)} / ${g.p.stats.mpMax} · cada nome custa ${NAME_COST} PM`;
    $('namingList').innerHTML = g.goblins.map((gb, i) => gb.named
      ? `<li class="named"><b>${esc(gb.name)}</b><span>Hobgoblin · ${gb.active ? 'segue você' : 'protege a vila'}</span></li>`
      : `<li><label for="nm${i}">Goblin sem nome</label><input id="nm${i}" maxlength="14" value="${esc(gb.suggest)}"><button data-name="${i}" ${g.p.mp < NAME_COST ? 'disabled' : ''}>Nomear</button></li>`).join('');
  }
}
