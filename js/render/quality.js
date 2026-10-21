// Qualité graphique adaptative : niveau choisi (Basse / Normale / Haute) ou Automatique.
// Automatique mesure les images par seconde au début du jeu, choisit un niveau, puis ne
// peut que redescendre d'un cran si la fluidité chute durablement (jamais de va-et-vient).
// Sans Three.js ni DOM (testable sous Node) : main.js applique le niveau au rendu et au son.
// Préférence stockée à part (comme le son) : non effacée par « Nouvelle partie ».

import { QUALITY, SAVE } from '../config.js';

export const QUALITY_PREF_KEY = `${SAVE.storageKey}:qualite`;
const CHOICES = ['auto', ...QUALITY.order];

export function parseQualityPref(text) {
  try {
    const p = JSON.parse(text);
    return { choice: CHOICES.includes(p?.choice) ? p.choice : 'auto', fps: p?.fps === true };
  } catch {
    return { choice: 'auto', fps: false };
  }
}

function readPref() {
  try {
    return parseQualityPref(window.localStorage.getItem(QUALITY_PREF_KEY));
  } catch {
    return parseQualityPref(null);
  }
}

export class QualityManager {
  // onChange(level) : appelé à chaque changement de niveau effectif (et une fois au départ par main.js).
  constructor({ pref = readPref(), onChange = () => {} } = {}) {
    this.choice = pref.choice;
    this.showFps = pref.fps;
    this.onChange = onChange;
    this.level = this.choice === 'auto' ? QUALITY.auto.start : this.choice;
    this.measured = false; // Automatique : premier choix fait
    this.samples = [];     // images par seconde de chaque tranche d'une seconde (mesure)
    this.played = 0;       // secondes de jeu actif mesurées
    this.window = { frames: 0, seconds: 0 };
    this.slow = 0;         // secondes consécutives sous dropFps
    this.sinceChange = 0;
    this.fps = 0;          // dernière valeur du compteur
    this.fpsAcc = { frames: 0, seconds: 0 };
  }

  get settings() {
    return QUALITY.levels[this.level];
  }

  setChoice(choice) {
    if (!CHOICES.includes(choice)) return;
    this.choice = choice;
    this.measured = false;
    this.samples = [];
    this.played = 0;
    this.window = { frames: 0, seconds: 0 };
    this.slow = 0;
    this.#set(choice === 'auto' ? QUALITY.auto.start : choice);
    this.#save();
  }

  setShowFps(on) {
    this.showFps = on;
    this.#save();
  }

  // Une image de `dt` secondes ; active = jeu en cours (l'automatique ne mesure qu'en jeu).
  // Les images trop longues (onglet masqué, chargement) sont ignorées.
  frame(dt, active) {
    const a = QUALITY.auto;
    if (!(dt > 0) || dt > a.maxFrameSeconds) return;
    this.fpsAcc.frames += 1;
    this.fpsAcc.seconds += dt;
    if (this.fpsAcc.seconds >= QUALITY.fpsRefreshSeconds) {
      this.fps = this.fpsAcc.frames / this.fpsAcc.seconds;
      this.fpsAcc = { frames: 0, seconds: 0 };
    }
    if (this.choice !== 'auto' || !active) return;
    this.played += dt;
    this.sinceChange += dt;
    if (this.played < a.warmupSeconds) return;
    const w = this.window;
    w.frames += 1;
    w.seconds += dt;
    if (!this.measured) {
      // Médiane des tranches d'une seconde : une saccade de démarrage (compilation des
      // shaders, chargement) ne fait pas choisir un niveau trop bas.
      if (w.seconds < 1) return;
      this.samples.push(w.frames / w.seconds);
      this.window = { frames: 0, seconds: 0 };
      if (this.samples.length < a.measureSeconds) return;
      const sorted = [...this.samples].sort((x, y) => x - y);
      const fps = sorted[Math.floor(sorted.length / 2)];
      this.measured = true;
      this.#set(fps >= a.high ? 'high' : fps >= a.normal ? 'normal' : 'low');
      return;
    }
    // Surveillance par tranches d'une seconde : chute durable ⇒ un cran plus bas.
    if (w.seconds < 1) return;
    const fps = w.frames / w.seconds;
    this.window = { frames: 0, seconds: 0 };
    this.slow = fps < a.dropFps ? this.slow + w.seconds : 0;
    const i = QUALITY.order.indexOf(this.level);
    if (this.slow >= a.dropSeconds && this.sinceChange >= a.dwellSeconds && i > 0) {
      this.slow = 0;
      this.#set(QUALITY.order[i - 1]);
    }
  }

  #set(level) {
    this.sinceChange = 0;
    if (level === this.level) return;
    this.level = level;
    this.onChange(level);
  }

  #save() {
    try {
      window.localStorage.setItem(QUALITY_PREF_KEY, JSON.stringify({ choice: this.choice, fps: this.showFps }));
    } catch {
      /* préférence facultative */
    }
  }
}
