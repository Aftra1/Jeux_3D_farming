// Carnet : fragments débloqués et non lus, missives accomplies.
// Sans Three.js ni DOM (testable sous Node).
// Un fragment débloqué le reste, même si son palier change ensuite dans fragments.js.

import { FRAGMENTS } from './fragments.js';
import { MISSIVES } from './missives.js';

// Mesure d'une condition de missive sur l'état de la simulation (jamais sur le rendu).
// world = la Simulation (ou tout objet offrant countOf / boostedCountOf).
const MEASURES = {
  built: (world, c) => world.countOf(c.type),
  boosted: (world, c) => world.boostedCountOf(c.type),
};

// → { have, target } (have plafonné à target, pour l'affichage « 2 / 3 »)
export function missiveProgress(missive, world) {
  const c = missive.condition;
  return { have: Math.min(MEASURES[c.kind](world, c), c.count), target: c.count };
}

export class Journal {
  constructor() {
    this.reset();
  }

  reset() {
    this.unlocked = [];        // ids, dans l'ordre de déblocage
    this.unread = new Set();   // sous-ensemble de unlocked
    this.missives = 0;         // nombre de missives accomplies (dans l'ordre de MISSIVES)
  }

  isUnlocked(id) {
    return this.unlocked.includes(id);
  }

  // Missive en cours, ou null si toutes sont accomplies.
  get currentMissive() {
    return MISSIVES[this.missives] ?? null;
  }

  // Accomplit, dans l'ordre, toutes les missives déjà remplies (une partie avancée
  // rattrape d'elle-même la bonne missive). → ids des missives accomplies.
  advanceMissives(world) {
    const done = [];
    for (let m = this.currentMissive; m; m = this.currentMissive) {
      const { have, target } = missiveProgress(m, world);
      if (have < target) break;
      this.missives++;
      done.push(m.id);
    }
    return done;
  }

  // Avance les missives (si `world` est fourni), puis débloque les fragments dont la
  // condition est remplie. earned = total cumulé gagné par ressource.
  // → ids des fragments nouvellement débloqués.
  update(earned, world = null) {
    if (world) this.advanceMissives(world);
    const done = new Set(MISSIVES.slice(0, this.missives).map((m) => m.id));
    const fresh = [];
    for (const f of FRAGMENTS) {
      if (this.isUnlocked(f.id)) continue;
      const ready = f.missive ? done.has(f.missive) : (earned[f.resource] ?? 0) >= f.threshold;
      if (!ready) continue;
      this.unlocked.push(f.id);
      this.unread.add(f.id);
      fresh.push(f.id);
    }
    return fresh;
  }

  markAllRead() {
    const had = this.unread.size > 0;
    this.unread.clear();
    return had;
  }

  toJSON() {
    return { unlocked: [...this.unlocked], unread: [...this.unread], missives: this.missives };
  }

  // Restaure un état déjà validé (voir save/save.js).
  load({ unlocked, unread, missives = 0 }) {
    this.unlocked = [...unlocked];
    this.unread = new Set(unread.filter((id) => this.unlocked.includes(id)));
    this.missives = missives;
  }
}
