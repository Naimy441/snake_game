// The tutorial: a few short cards that teach one thing at a time while you
// play map 1, each moving on once you've done it (or after a while). It runs
// by itself the first time you play from map 1. H turns it off (or back on)
// at any time, and the title menu and the How to play panel can replay it.
import { saveStats } from './settings.js';

// body: text (with <kbd> keys) or a function of the app (it can depend on the
// camera). done: the event that completes the step (see on()). min: seconds
// before it can move on (time to read it); max: it moves on by itself then.
const STEPS = [
  {
    title: 'Eat the apple',
    body: (app) => (app.relativeSteer ? '<kbd>←</kbd> <kbd>→</kbd> turn left and right.' : 'The arrow keys move that way on screen.'),
    done: 'ate',
    min: 1.5,
  },
  {
    title: 'Level up',
    body: 'Apples fill the bar in the top left. Each level is a bit faster; every few levels, a new map.',
    done: 'level',
    min: 4,
    max: 10,
  },
  {
    title: 'Switch view',
    body: 'Press <kbd>C</kbd> any time: chase, first-person or overhead.',
    done: 'camera',
    min: 1.5,
    max: 10,
  },
  {
    title: 'Slow-mo',
    body: 'Hold <kbd>Space</kbd> to slow time down. Apples refill the meter.',
    done: 'slowmo',
    min: 1.5,
    max: 12,
  },
  {
    title: 'Go for the bonus',
    body: 'Prisms, orb chains and the golden mouse score big. Corner the mouse!',
    min: 6,
    max: 6,
  },
];

export class Tutorial {
  constructor(app) {
    this.app = app;
    this.active = false;
    this.step = 0;
    this.t = 0;
    this.flags = new Set();
    this.forced = false;
    this.el = document.getElementById('tutorial');
    this.el.addEventListener('click', (e) => {
      if (e.target.closest('[data-tut-skip]')) this.stop();
    });
  }

  // A run has started. The first run from map 1 starts the tutorial; one
  // already under way carries on from the step it was on.
  onRunStart(level) {
    const app = this.app;
    const first = !app.stats.tutorialDone && level === 0 && !app.playtest;
    if (this.forced || (first && !this.active)) {
      this.forced = false;
      this.active = true;
      this.step = 0;
    }
    if (!this.active) return this.hide();
    this.t = 0;
    this.flags.clear();
    this.render();
  }

  // H: stop it, or start it right now (from the menu: with the next run).
  toggle() {
    const app = this.app;
    if (this.active) return this.stop();
    if (app.mode !== 'main') return;
    this.active = true;
    this.step = 0;
    this.t = 0;
    this.flags.clear();
    if (['playing', 'paused', 'countdown'].includes(app.state)) this.render();
    else this.forced = true;
    app.toast({ kicker: 'Tutorial', title: 'On', sub: 'Press H to stop it', tone: 'sky' });
  }

  // Replay from the menus: a fresh run on map 1 with the tutorial.
  replay() {
    const app = this.app;
    this.forced = true;
    this.active = false;
    if (app.startLevel() !== 0) app.setStartLevel(0);
    app.closePanel();
    app.startGame({ bonus: false });
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    this.finish();
    this.app.toast({ kicker: 'Tutorial', title: 'Skipped', sub: 'Press H any time to bring it back', tone: 'sky' });
  }

  finish() {
    const st = this.app.stats;
    if (!st.tutorialDone) {
      st.tutorialDone = true;
      saveStats(st);
    }
    this.hide();
  }

  // Something happened in the game: 'ate', 'level', 'camera', 'slowmo'.
  on(flag) {
    if (this.active) this.flags.add(flag);
  }

  hide() {
    this.el.classList.add('hidden');
  }

  update(dt) {
    const app = this.app;
    if (!this.active) return;
    const show = app.mode === 'main' && (app.state === 'playing' || app.state === 'countdown');
    this.el.classList.toggle('hidden', !show);
    if (!show) return;
    // the text can depend on the camera
    const st = STEPS[this.step];
    const body = typeof st.body === 'function' ? st.body(app) : st.body;
    if (body !== this.shownBody) this.render();
    if (app.state !== 'playing') return;
    this.t += dt;
    if (this.t < (st.min ?? 1.5)) return;
    if ((st.done && this.flags.has(st.done)) || (st.max && this.t >= st.max)) this.next();
  }

  next() {
    const app = this.app;
    this.step++;
    this.t = 0;
    this.flags.clear();
    if (this.step >= STEPS.length) {
      this.active = false;
      this.finish();
      app.audio.chainComplete();
      app.toast({ kicker: 'Tutorial complete', title: 'You\'re ready!', sub: 'Press H any time to see it again', tone: 'gold' });
      return;
    }
    app.audio.ui();
    this.render();
  }

  render() {
    const app = this.app;
    const st = STEPS[this.step];
    const body = typeof st.body === 'function' ? st.body(app) : st.body;
    this.shownBody = body;
    const dots = STEPS.map((_, i) => `<i class="${i < this.step ? 'done' : i === this.step ? 'on' : ''}"></i>`).join('');
    this.el.innerHTML = `<div class="tut-head"><span class="tut-k">Tutorial · ${this.step + 1}/${STEPS.length}</span><button class="tut-skip" data-tut-skip>Skip <kbd>H</kbd></button></div><b class="tut-title">${st.title}</b><p class="tut-body">${body}</p><div class="tut-dots">${dots}</div>`;
    this.el.classList.remove('pop');
    void this.el.offsetWidth;
    this.el.classList.add('pop');
  }
}
