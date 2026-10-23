// Confort des retours d'interface (DOM seul, sans Three.js) : animations réduites, vibrations,
// déroulé des panneaux parchemin. Préférences hors sauvegarde de partie (`<clé>:mouvement`,
// `<clé>:vibrations`), non effacées par « Nouvelle partie ». Purement décoratif : aucun effet sur la simulation.

import { readPref, writePref } from './prefs.js';

const MOTION_PREF = 'mouvement';   // 'reduit' | 'plein' ; absent = suit le système (prefers-reduced-motion)
const HAPTIC_PREF = 'vibrations';  // 'non' ; absent = actives (si le navigateur les gère)

// Motifs de vibration (ms) : légers, brefs.
const PATTERNS = { place: [14], refuse: [10, 50, 10], missive: [16, 70, 16] };

const media = typeof window !== 'undefined' && window.matchMedia
  ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

class Feel {
  constructor() {
    this.stored = readPref(MOTION_PREF);
    this.reduced = this.#motion();
    this.haptics = readPref(HAPTIC_PREF) !== 'non';
    this.listeners = [];
    this.#apply();
    // Tant que le joueur n'a rien choisi, le réglage du système fait foi, même modifié en cours de partie.
    media?.addEventListener?.('change', () => {
      if (this.stored) return;
      this.reduced = this.#motion();
      this.#apply();
    });
  }

  #motion() {
    if (this.stored === 'reduit') return true;
    if (this.stored === 'plein') return false;
    return Boolean(media?.matches);
  }

  #apply() {
    document.body.classList.toggle('reduce-motion', this.reduced);
    for (const fn of this.listeners) fn(this.reduced);
  }

  // `fn(reduced)` à chaque changement (et tout de suite).
  onMotion(fn) {
    this.listeners.push(fn);
    fn(this.reduced);
  }

  setReduced(on) {
    this.stored = on ? 'reduit' : 'plein';
    writePref(MOTION_PREF, this.stored);
    this.reduced = on;
    this.#apply();
  }

  get canVibrate() {
    return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
  }

  setHaptics(on) {
    this.haptics = on;
    writePref(HAPTIC_PREF, on ? 'oui' : 'non');
  }

  // Vibration légère ('place' | 'refuse' | 'missive'). Rien si désactivée, non gérée, ou sans geste préalable
  // (le navigateur l'ignorerait en journalisant un avertissement).
  buzz(kind) {
    if (!this.haptics || !this.canVibrate || !PATTERNS[kind]) return;
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
    try {
      navigator.vibrate(PATTERNS[kind]);
    } catch {
      /* facultatif */
    }
  }
}

export const feel = new Feel();

// Joue une animation CSS à la demande : la classe est retirée à la fin, et peut être relancée aussitôt.
export function play(el, cls) {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth; // relance l'animation
  el.classList.add(cls);
  const done = (e) => {
    if (e.target !== el) return;
    el.classList.remove(cls);
    el.removeEventListener('animationend', done);
  };
  el.addEventListener('animationend', done);
}

// Fermeture en « enroulé » des panneaux parchemin : à la fermeture (attribut `hidden` posé), la classe
// `closing` garde le panneau affiché le temps de l'animation CSS ; elle part à la fin ou à la réouverture.
export function watchPanels(elements) {
  const observer = new MutationObserver((records) => {
    for (const r of records) {
      const el = r.target;
      if (el.hidden && r.oldValue === null) {
        el.classList.add('closing');
        setTimeout(() => { if (el.hidden) el.classList.remove('closing'); }, 500); // filet si l'animation ne finit pas
      }
      else if (!el.hidden) el.classList.remove('closing');
    }
  });
  for (const el of elements) {
    if (!el) continue;
    observer.observe(el, { attributes: true, attributeFilter: ['hidden'], attributeOldValue: true });
    el.addEventListener('animationend', (e) => {
      if (e.target === el && el.hidden) el.classList.remove('closing');
    });
  }
}
