// Controles: joystick virtual + botões de toque (iPhone) e teclado/mouse (computador).

export class Input {
  constructor(root) {
    this.move = { x: 0, y: 0 };
    this.look = { dx: 0, dy: 0 };
    this.held = new Set();
    this.pressed = new Set();
    this.keys = new Set();
    this.stick = null;
    this.lookId = null;
    this.root = root;
    this.stickEl = document.getElementById('stick');
    this.knobEl = document.getElementById('knob');

    root.addEventListener('pointerdown', (e) => this.onDown(e));
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    window.addEventListener('pointercancel', (e) => this.onUp(e));

    document.querySelectorAll('[data-act]').forEach((b) => {
      const act = b.dataset.act;
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.press(act);
        b.classList.add('down');
      });
      const up = () => { this.held.delete(act); b.classList.remove('down'); };
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('pointerleave', up);
    });

    const keymap = {
      Space: 'pular', KeyJ: 'atacar', KeyK: 'predador', KeyE: 'falar', KeyQ: 'pocao',
      Digit1: 'skill0', Digit2: 'skill1', Digit3: 'skill2', KeyF: 'forma', KeyM: 'menu', Escape: 'menu', KeyR: 'evoluir',
    };
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      this.keys.add(e.code);
      if (keymap[e.code] && !e.repeat) this.press(keymap[e.code]);
      if (e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (keymap[e.code]) this.held.delete(keymap[e.code]);
    });
    window.addEventListener('blur', () => { this.keys.clear(); this.held.clear(); });
  }

  press(act) {
    this.held.add(act);
    this.pressed.add(act);
    if (this.onAny) this.onAny();
  }

  onDown(e) {
    if (e.target.closest('[data-act], .panel, .hud-top, #minimap, button, input')) return;
    if (this.onAny) this.onAny();
    const leftSide = e.clientX < window.innerWidth * 0.45;
    if (leftSide && !this.stick && e.pointerType !== 'mouse') {
      this.stick = { id: e.pointerId, x: e.clientX, y: e.clientY };
      this.stickEl.style.left = e.clientX + 'px';
      this.stickEl.style.top = e.clientY + 'px';
      this.stickEl.hidden = false;
      this.knobEl.style.transform = 'translate(-50%, -50%)';
    } else if (this.lookId === null) {
      this.lookId = e.pointerId;
      this.lastLook = { x: e.clientX, y: e.clientY };
    }
  }

  onMove(e) {
    if (this.stick && e.pointerId === this.stick.id) {
      let dx = e.clientX - this.stick.x, dy = e.clientY - this.stick.y;
      const max = 52, d = Math.hypot(dx, dy);
      if (d > max) { dx = (dx / d) * max; dy = (dy / d) * max; }
      this.move.x = dx / max;
      this.move.y = dy / max;
      this.knobEl.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    } else if (e.pointerId === this.lookId) {
      this.look.dx += e.clientX - this.lastLook.x;
      this.look.dy += e.clientY - this.lastLook.y;
      this.lastLook = { x: e.clientX, y: e.clientY };
    }
  }

  onUp(e) {
    if (this.stick && e.pointerId === this.stick.id) {
      this.stick = null;
      this.move.x = this.move.y = 0;
      this.stickEl.hidden = true;
    }
    if (e.pointerId === this.lookId) this.lookId = null;
  }

  // Direção de movimento combinando joystick e WASD.
  axis() {
    let x = this.move.x, y = this.move.y;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y += 1;
    const d = Math.hypot(x, y);
    if (d > 1) { x /= d; y /= d; }
    return { x, y, mag: Math.min(1, d) };
  }

  consumeLook() {
    const l = { dx: this.look.dx, dy: this.look.dy };
    this.look.dx = this.look.dy = 0;
    return l;
  }

  took(act) {
    if (this.pressed.has(act)) { this.pressed.delete(act); return true; }
    return false;
  }

  endFrame() { this.pressed.clear(); }
  release() {
    this.stick = null; this.lookId = null; this.move.x = this.move.y = 0;
    this.stickEl.hidden = true; this.held.clear(); this.pressed.clear();
  }
}
