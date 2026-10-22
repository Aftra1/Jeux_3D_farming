// Bulles d'aide de premier contact : une à la fois, refermables, jamais répétées.
// Textes : js/story/guide.js (TIPS). Les conseils déjà vus sont retenus hors sauvegarde de partie
// (préférence `<clé>:conseils`) ; « Réafficher les conseils » (Options) et « Nouvelle partie » les rendent.

import { TIPS, TIP_TEXTS } from '../story/guide.js';
import { GUIDE_PREFS, readSet, writeSet } from './prefs.js';

export class Tips {
  constructor() {
    this.root = document.getElementById('tip');
    this.text = document.getElementById('tip-text');
    this.seen = readSet(GUIDE_PREFS.tips);
    this.queue = [];
    this.current = null;
    this.timer = 0;
    document.getElementById('tip-close').addEventListener('click', () => this.#next());
  }

  // Montre le conseil `id` s'il n'a jamais été vu. → vrai s'il est montré ou mis en attente.
  show(id) {
    if (!TIPS[id] || this.seen.has(id)) return false;
    this.seen.add(id);
    writeSet(GUIDE_PREFS.tips, this.seen);
    this.queue.push(id);
    if (this.current === null) this.#next();
    return true;
  }

  // Referme la bulle (changement de mode) en gardant les conseils en attente.
  pause() {
    clearTimeout(this.timer);
    this.root.hidden = true;
    if (this.current !== null) this.queue.unshift(this.current);
    this.current = null;
  }

  resume() {
    if (this.current === null) this.#next();
  }

  // « Réafficher les conseils ».
  reset() {
    this.seen.clear();
    this.queue = [];
    writeSet(GUIDE_PREFS.tips, this.seen);
  }

  #next() {
    clearTimeout(this.timer);
    this.current = this.queue.shift() ?? null;
    this.root.hidden = this.current === null;
    if (this.current === null) return;
    this.text.textContent = TIPS[this.current].text;
    this.root.classList.remove('fresh');
    void this.root.offsetWidth; // redémarre l'apparition douce
    this.root.classList.add('fresh');
    this.timer = setTimeout(() => this.#next(), TIP_TEXTS.duration * 1000);
  }
}
