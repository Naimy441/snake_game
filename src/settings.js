const KEY = 'coilrush.settings.v1';
const BEST_KEY = 'coilrush.best.v1';
const STATS_KEY = 'coilrush.stats.v1';

const prefersReducedMotion = () => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

export const DEFAULTS = {
  quality: 'auto',
  reduceMotion: prefersReducedMotion(),
  guide: true,
  minimap: true,
  showFps: false,
  sfx: 0.8,
  music: 0.45,
  muted: false,
  camera: 'overhead',
  skin: 'viper',
  accessory: 'none',
  ghost: false,
};

export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    /* storage unavailable: use defaults */
  }
  return { ...DEFAULTS };
}

export function saveSettings(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function loadBest() {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

export function saveBest(v) {
  try {
    localStorage.setItem(BEST_KEY, String(v));
  } catch {
    /* ignore */
  }
}

// Lifetime totals used to unlock skins and accessories.
export const STAT_DEFAULTS = { games: 0, apples: 0, mice: 0, chains: 0, pads: 0, maxZone: 0 };

export function loadStats() {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (raw) return { ...STAT_DEFAULTS, ...JSON.parse(raw) };
  } catch {
    /* storage unavailable */
  }
  return { ...STAT_DEFAULTS };
}

export function saveStats(s) {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

// Concrete rendering parameters for each quality tier.
// maxPR caps the canvas pixel ratio (Retina screens report 2 or 3);
// the 3D scene is then rendered at `scale` x that, adjusted on the fly
// between minScale and 1 to hold a smooth frame rate.
export const QUALITY = {
  high: { maxPR: 1.5, minScale: 0.6, samples: 4, bloomLevels: 5, taps: 8, shadows: 'high', particles: 600, ambient: 520, radial: 14 },
  medium: { maxPR: 1.25, minScale: 0.6, samples: 2, bloomLevels: 4, taps: 6, shadows: 'medium', particles: 350, ambient: 320, radial: 12 },
  low: { maxPR: 1, minScale: 0.55, samples: 0, bloomLevels: 0, taps: 0, shadows: 'low', particles: 160, ambient: 140, radial: 10 },
};
