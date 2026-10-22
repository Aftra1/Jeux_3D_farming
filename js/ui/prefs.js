// Préférences d'affichage : hors sauvegarde de partie (localStorage protégé, facultatif).
// Les aides déjà vues sont effacées par « Nouvelle partie » (resetGuidePrefs) ; les autres préférences non.

import { SAVE } from '../config.js';

const key = (name) => `${SAVE.storageKey}:${name}`;

export function readPref(name) {
  try {
    return window.localStorage.getItem(key(name));
  } catch {
    return null;
  }
}

export function writePref(name, value) {
  try {
    window.localStorage.setItem(key(name), value);
  } catch {
    /* préférence facultative */
  }
}

export function removePref(name) {
  try {
    window.localStorage.removeItem(key(name));
  } catch {
    /* préférence facultative */
  }
}

export function readSet(name) {
  try {
    const list = JSON.parse(readPref(name) ?? '[]');
    return new Set(Array.isArray(list) ? list.filter((x) => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

export function writeSet(name, set) {
  writePref(name, JSON.stringify([...set]));
}

export const GUIDE_PREFS = { tips: 'conseils', tools: 'outils-vus', chapterLetter: 'lettre2' };

// Nouvelle partie : conseils, signaux d'outils et lettre du chapitre II reviennent.
export function resetGuidePrefs() {
  for (const name of Object.values(GUIDE_PREFS)) removePref(name);
}
