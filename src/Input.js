// Keyboard, touch and gamepad input. Emits intents; the app decides how a
// direction maps to a move based on the active camera.

const KEYMAP = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
};

export class Input {
  constructor(target, handlers) {
    this.h = handlers;
    this.rushKeys = new Set();
    this.touchRush = false;
    this.padRush = false;
    this.padPrev = {};
    this.padAxisDir = null;

    window.addEventListener('keydown', (e) => this.keydown(e));
    window.addEventListener('keyup', (e) => this.keyup(e));
    window.addEventListener('blur', () => {
      this.rushKeys.clear();
      this.emitRush();
    });

    // Swipes and taps on the game canvas
    let start = null;
    target.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      start = { x: e.clientX, y: e.clientY, t: performance.now() };
    });
    target.addEventListener('pointerup', (e) => {
      if (!start || e.pointerType === 'mouse') return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 24) {
        const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
        this.h.direction(dir, 'swipe');
      } else if (performance.now() - start.t < 300) {
        this.h.tap(e.clientX < window.innerWidth / 2 ? 'left' : 'right');
      }
      start = null;
    });
    target.addEventListener('pointercancel', () => (start = null));
  }

  bindTouchButtons(left, right, rush, up = null, down = null) {
    const press = (el, fn) => {
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        fn(true);
        el.classList.add('held');
      });
      const up = (e) => {
        e.preventDefault();
        fn(false);
        el.classList.remove('held');
      };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointerleave', up);
      el.addEventListener('pointercancel', up);
    };
    press(left, (down) => down && this.h.turn(-1));
    press(right, (down) => down && this.h.turn(1));
    // flight (Sunset Heavens): climb / dive
    if (up) press(up, (d) => d && this.h.pitch && this.h.pitch(true));
    if (down) press(down, (d) => d && this.h.pitch && this.h.pitch(false));
    press(rush, (down) => {
      this.touchRush = down;
      this.emitRush();
    });
  }

  emitRush() {
    this.h.rush(this.rushKeys.size > 0 || this.touchRush || this.padRush);
  }

  keydown(e) {
    if (e.target instanceof HTMLInputElement && e.target.type === 'range') return;
    const code = e.code;
    if (KEYMAP[code]) {
      e.preventDefault();
      if (!e.repeat) this.h.direction(KEYMAP[code], 'key');
      return;
    }
    switch (code) {
      case 'KeyQ':
        if (!e.repeat) this.h.turn(-1);
        break;
      case 'KeyE':
        if (!e.repeat) this.h.turn(1);
        break;
      case 'Space':
      case 'ShiftLeft':
      case 'ShiftRight':
        e.preventDefault();
        if (code === 'Space' && !e.repeat && this.h.confirm('space')) return;
        this.rushKeys.add(code);
        this.emitRush();
        break;
      case 'Enter':
      case 'NumpadEnter':
        // when the game handles Enter, don't also activate the focused button
        if (!e.repeat && this.h.confirm('enter')) e.preventDefault();
        break;
      case 'KeyC':
      case 'KeyV':
        if (!e.repeat) this.h.camera();
        break;
      case 'KeyP':
      case 'Escape':
        if (!e.repeat) this.h.pause(code);
        break;
      case 'KeyR':
        if (!e.repeat) this.h.restart();
        break;
      case 'KeyM':
        if (!e.repeat) this.h.mute();
        break;
      case 'KeyG':
        if (!e.repeat && this.h.ghost) this.h.ghost();
        break;
      default:
    }
  }

  keyup(e) {
    if (this.rushKeys.delete(e.code)) this.emitRush();
  }

  // Called every frame.
  pollGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = pads && Array.from(pads).find((p) => p && p.connected);
    if (!pad) return;
    const b = (i) => !!(pad.buttons[i] && pad.buttons[i].pressed);
    const edge = (name, now) => {
      const was = this.padPrev[name];
      this.padPrev[name] = now;
      return now && !was;
    };
    if (edge('up', b(12))) this.h.direction('up', 'pad');
    if (edge('down', b(13))) this.h.direction('down', 'pad');
    if (edge('left', b(14))) this.h.direction('left', 'pad');
    if (edge('right', b(15))) this.h.direction('right', 'pad');
    const ax = pad.axes[0] || 0;
    const ay = pad.axes[1] || 0;
    let axisDir = null;
    if (Math.hypot(ax, ay) > 0.6) axisDir = Math.abs(ax) > Math.abs(ay) ? (ax > 0 ? 'right' : 'left') : ay > 0 ? 'down' : 'up';
    if (axisDir && axisDir !== this.padAxisDir) this.h.direction(axisDir, 'pad');
    this.padAxisDir = axisDir;
    if (edge('a', b(0))) this.h.confirm('pad');
    const rush = b(0) || b(6) || b(7);
    if (rush !== this.padRush) {
      this.padRush = rush;
      this.emitRush();
    }
    if (edge('y', b(3))) this.h.camera();
    if (edge('start', b(9))) this.h.pause('pad');
    if (edge('lb', b(4))) this.h.turn(-1);
    if (edge('rb', b(5))) this.h.turn(1);
  }
}
