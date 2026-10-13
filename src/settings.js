const KEY = 'coilrush.settings.v1';
const BEST_KEY = 'coilrush.best.v1';

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

// Concrete rendering parameters for each quality tier.
export const QUALITY = {
  high: { pixelRatio: 2, shadows: 'high', bloom: true, particles: 600, radial: 16, foodLights: true },
  medium: { pixelRatio: 1.5, shadows: 'medium', bloom: false, particles: 350, radial: 12, foodLights: true },
  low: { pixelRatio: 1, shadows: 'low', bloom: false, particles: 160, radial: 10, foodLights: false },
};
