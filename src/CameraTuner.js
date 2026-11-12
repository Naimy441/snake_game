// The camera tuning panel: opens with the camera debug view (the ` key).
// It can also stop and start the snake (F).
// Sliders move the playing cameras live (see CAMERA_TUNE in CameraRig), and
// what you set is kept in this browser for next time. Copy puts the numbers
// on the clipboard.
import { CAMERA_TUNE, cloneTune } from './render/CameraRig.js';
import { saveSettings } from './settings.js';

const KEY = 'snake.cameraTune';

// [group, key, label, min, max, step, hint]
const SLIDERS = [
  ['fp', 'eye', 'Eye height', 0.2, 2.5, 0.02, 'above the path, in cells'],
  ['fp', 'ahead', 'Eye forward', -2, 1.5, 0.05, 'from the head\'s middle (minus: behind it)'],
  ['fp', 'look', 'Looks ahead', 2, 20, 0.5, 'cells to the point it aims at'],
  ['fp', 'drop', 'Looks down', 0, 1.5, 0.05, '1: at the path there · 0: level'],
  ['fp', 'follow', 'Turn speed', 6, 60, 1, 'how quickly it swings round'],
  ['fp', 'lean', 'Lean in turns', 0, 0.06, 0.005, ''],
  ['tp', 'dist', 'Distance back', 1.5, 12, 0.1, ''],
  ['tp', 'height', 'Height', 0.5, 8, 0.1, ''],
  ['tp', 'ahead', 'Looks ahead', 0, 8, 0.1, 'cells in front of the head'],
  ['tp', 'fov', 'View width', 35, 100, 1, 'degrees, tall'],
  ['tp', 'follow', 'Turn speed', 3, 40, 1, ''],
  ['slow', 'punch', 'Kick in', 0, 300, 5, 'how far the view widens as it starts'],
  ['slow', 'hold', 'While held', -8, 8, 0.5, 'degrees: minus narrows (feels slower)'],
  ['slow', 'breath', 'Kick out', -200, 100, 5, 'minus: a breath in as it ends'],
  ['slow', 'damping', 'Settle', 0.3, 1.3, 0.05, 'under 1 bounces · 1 and up: no bounce'],
  ['slow', 'blur', 'Blur kept', 0, 1, 0.05, 'streak blur left once it\'s held'],
];
const GROUPS = { fp: 'First person', tp: 'Chase', slow: 'Slow-mo view' };

function loadTune() {
  const t = cloneTune();
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved) for (const g of Object.keys(t)) Object.assign(t[g], saved[g] || {});
  } catch {
    /* storage unavailable: the defaults */
  }
  return t;
}

export class CameraTuner {
  constructor(app) {
    this.app = app;
    app.rig.tune = loadTune();
    const el = (this.el = document.createElement('div'));
    el.id = 'cam-tune';
    el.className = 'hidden';
    document.body.appendChild(el);
    this.build();
    // a slider lets go of the keyboard once you let go of it, so the game's
    // keys (Space, C...) work again straight away
    el.addEventListener('pointerup', () => setTimeout(() => document.activeElement && el.contains(document.activeElement) && document.activeElement.blur(), 0));
    el.addEventListener('input', (e) => this.onInput(e.target));
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (b) this[b.dataset.act]();
    });
  }

  show(on) {
    this.el.classList.toggle('hidden', !on);
    if (on) this.refresh();
  }

  build() {
    let html = '<div class="ct-head"><b>Camera tuning</b><span>live · saved in this browser</span></div>';
    html += `<div class="ct-group"><h4>Debug run</h4><div class="ct-acts ct-run"><button data-act="toggleStop" class="ct-stop">Stop <kbd>F</kbd></button></div></div>`;
    html += `<div class="ct-group"><h4>First person</h4>${this.row('set', 'fpFov', 'View width', 75, 115, 1, 'degrees, tall (also in Settings)')}`;
    let group = 'fp';
    for (const [g, k, label, min, max, step, hint] of SLIDERS) {
      if (g !== group) {
        html += `</div><div class="ct-group"><h4>${GROUPS[g]}</h4>`;
        group = g;
      }
      html += this.row(g, k, label, min, max, step, hint);
    }
    html += '</div><div class="ct-acts"><button data-act="reset">Reset</button><button data-act="copy">Copy numbers</button></div>';
    this.el.innerHTML = html;
  }

  row(g, k, label, min, max, step, hint) {
    return `<label class="ct-row" title="${hint}"><span>${label}</span><input type="range" data-g="${g}" data-k="${k}" min="${min}" max="${max}" step="${step}"><output></output></label>`;
  }

  value(g, k) {
    return g === 'set' ? this.app.settings[k] : g === 'app' ? this.app[k] : this.app.rig.tune[g][k];
  }

  refresh() {
    const stop = this.el.querySelector('.ct-stop');
    if (stop) stop.innerHTML = this.app.debugStopped ? 'Go <kbd>F</kbd>' : 'Stop <kbd>F</kbd>';
    for (const input of this.el.querySelectorAll('input[type=range]')) {
      const v = this.value(input.dataset.g, input.dataset.k);
      input.value = v;
      this.show1(input, v);
    }
  }

  show1(input, v) {
    const step = Number(input.step);
    const dp = step >= 1 ? 0 : step >= 0.1 ? 1 : step >= 0.01 ? 2 : 3;
    const def = input.dataset.g === 'set' ? 90 : input.dataset.g === 'app' ? 0.35 : CAMERA_TUNE[input.dataset.g][input.dataset.k];
    input.nextElementSibling.textContent = Number(v).toFixed(dp);
    input.nextElementSibling.classList.toggle('changed', Math.abs(v - def) > 1e-9);
  }

  onInput(input) {
    if (!(input instanceof HTMLInputElement) || !input.dataset.g) return;
    const { g, k } = input.dataset;
    const v = Number(input.value);
    if (g === 'app') {
      this.app[k] = v;
    } else if (g === 'set') {
      this.app.settings[k] = v;
      this.app.rig.fpFov = v;
      saveSettings(this.app.settings);
      const s = document.getElementById('set-fov');
      if (s) {
        s.value = v;
        document.getElementById('set-fov-val').textContent = `${v}°`;
      }
    } else {
      this.app.rig.tune[g][k] = v;
      this.save();
    }
    this.show1(input, v);
  }

  // Stop or start the snake (the game holds still; the camera still works).
  toggleStop() {
    const app = this.app;
    app.debugStopped = !app.debugStopped;
    this.refresh();
    app.toast({ kicker: 'Debug', title: app.debugStopped ? 'Stopped' : 'Moving', sub: app.debugStopped ? 'Press F to move again' : '', tone: 'sky', ms: 1200 });
  }

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.app.rig.tune));
    } catch {
      /* not saved: still applies for now */
    }
  }

  reset() {
    this.app.rig.tune = cloneTune();
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* nothing saved */
    }
    this.refresh();
    this.app.toast({ kicker: 'Camera', title: 'Back to defaults', tone: 'sky', ms: 1400 });
  }

  copy() {
    const t = this.app.rig.tune;
    const line = (g) => `  ${g}: { ${Object.entries(t[g]).map(([k, v]) => `${k}: ${+v.toFixed(3)}`).join(', ')} },`;
    const text = `fpFov: ${this.app.settings.fpFov}\nexport const CAMERA_TUNE = {\n${Object.keys(t).map(line).join('\n')}\n};`;
    const done = () => this.app.toast({ kicker: 'Camera', title: 'Copied', tone: 'sky', ms: 1400 });
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, () => window.prompt('Camera numbers', text));
    else window.prompt('Camera numbers', text);
  }
}
