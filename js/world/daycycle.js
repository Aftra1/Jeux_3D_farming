// Cycle jour/nuit : purement visuel et sonore, sans effet sur le gameplay.
// Ne lit que l'horloge (Date.now) : jamais la simulation. L'heure du domaine est le
// temps réel écoulé depuis le début de la partie (`startedAt`, sauvegardé), modulo
// la durée du cycle : une partie reprise retrouve la bonne heure.
// Sans Three.js (testable sous Node) : renvoie des nombres, que lighting.js applique.
// Préférence « figer l'heure » stockée à part (comme le son) : non effacée par
// « Nouvelle partie ».

import { DAYCYCLE, SAVE } from '../config.js';

export const DAY_PREF_KEY = `${SAVE.storageKey}:heure`;

const { phases } = DAYCYCLE;
export const CYCLE_SECONDS = phases.reduce((n, p) => n + p.holdSeconds + p.fadeSeconds, 0);

const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const rgb = (hex) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
const unit = ([x, y, z]) => {
  const len = Math.hypot(x, y, z) || 1;
  return [x / len, y / len, z / len];
};

// Phase réduite à des nombres (couleurs en composantes sRGB 0..1, direction unitaire).
function flatten(p) {
  return {
    sky: rgb(p.sky),
    sunDir: unit(p.sun.dir),
    sunColor: rgb(p.sun.color),
    sunIntensity: p.sun.intensity,
    hemiSky: rgb(p.hemi.sky),
    hemiGround: rgb(p.hemi.ground),
    hemiIntensity: p.hemi.intensity,
    night: p.night,
  };
}
const FLAT = phases.map(flatten);

// Mélange de deux états (t = 0 → a, t = 1 → b). La direction est renormalisée.
export function mixDay(a, b, t) {
  const out = {};
  for (const key of Object.keys(b)) { // b = toujours un état complet sans `phase`
    const va = a[key];
    const vb = b[key];
    out[key] = Array.isArray(va) ? va.map((v, i) => lerp(v, vb[i], t)) : lerp(va, vb, t);
  }
  out.sunDir = unit(out.sunDir);
  return out;
}

// État de l'éclairage à `seconds` depuis le début de la partie, et nom de la phase.
export function sampleDay(seconds) {
  let s = ((seconds % CYCLE_SECONDS) + CYCLE_SECONDS) % CYCLE_SECONDS;
  for (let i = 0; i < phases.length; i++) {
    const p = phases[i];
    if (s < p.holdSeconds) return { ...FLAT[i], phase: p.id };
    s -= p.holdSeconds;
    if (s < p.fadeSeconds) {
      const t = smooth(s / p.fadeSeconds);
      const next = (i + 1) % phases.length;
      return { ...mixDay(FLAT[i], FLAT[next], t), phase: t < 0.5 ? p.id : phases[next].id };
    }
    s -= p.fadeSeconds;
  }
  return { ...FLAT[0], phase: phases[0].id }; // inatteignable (arrondis)
}

export function parseDayPref(text) {
  try {
    const p = JSON.parse(text);
    return { frozen: p?.frozen === true };
  } catch {
    return { frozen: false };
  }
}

function readPref() {
  try {
    return parseDayPref(window.localStorage.getItem(DAY_PREF_KEY));
  } catch {
    return parseDayPref(null);
  }
}

export class DayCycle {
  constructor({ now = () => Date.now(), frozen = readPref().frozen } = {}) {
    this.now = now;
    this.startedAt = now();
    this.frozen = frozen;
    this.freezeBlend = frozen ? 1 : 0; // 1 = entièrement figé sur l'après-midi
  }

  elapsedSeconds() {
    return Math.max(0, (this.now() - this.startedAt) / 1000);
  }

  setFrozen(frozen) {
    this.frozen = frozen;
    try {
      window.localStorage.setItem(DAY_PREF_KEY, JSON.stringify({ frozen }));
    } catch {
      /* préférence facultative */
    }
  }

  // État à afficher ; `dt` (s) fait glisser doucement vers l'heure figée et retour.
  update(dt = 0) {
    const step = dt / DAYCYCLE.freezeFadeSeconds;
    this.freezeBlend = Math.min(1, Math.max(0, this.freezeBlend + (this.frozen ? step : -step)));
    const live = sampleDay(this.elapsedSeconds());
    if (this.freezeBlend === 0) return live;
    if (this.freezeBlend === 1) return { ...FLAT[0], phase: phases[0].id };
    const state = mixDay(live, FLAT[0], smooth(this.freezeBlend)); // `phase` de live ignoré
    return { ...state, phase: live.phase };
  }

  toJSON() {
    return { startedAt: this.startedAt };
  }

  load(data) {
    this.startedAt = data.startedAt;
  }

  reset() {
    this.startedAt = this.now();
  }
}
