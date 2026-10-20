// Carnet : fragments débloqués et non lus. Sans Three.js ni DOM (testable sous Node).
// Un fragment débloqué le reste, même si son palier change ensuite dans fragments.js.

import { FRAGMENTS } from './fragments.js';

export class Journal {
  constructor() {
    this.reset();
  }

  reset() {
    this.unlocked = [];        // ids, dans l'ordre de déblocage
    this.unread = new Set();   // sous-ensemble de unlocked
  }

  isUnlocked(id) {
    return this.unlocked.includes(id);
  }

  // Débloque les fragments dont le palier est atteint.
  // earned = total cumulé gagné par ressource. → ids nouvellement débloqués.
  update(earned) {
    const fresh = [];
    for (const f of FRAGMENTS) {
      if (this.isUnlocked(f.id) || (earned[f.resource] ?? 0) < f.threshold) continue;
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
    return { unlocked: [...this.unlocked], unread: [...this.unread] };
  }

  // Restaure un état déjà validé (voir save/save.js).
  load({ unlocked, unread }) {
    this.unlocked = [...unlocked];
    this.unread = new Set(unread.filter((id) => this.unlocked.includes(id)));
  }
}
