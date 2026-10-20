// Simulation à pas de temps fixe, indépendante du rendu.
// Le rendu appelle advance(dt) à chaque image ; la simulation exécute autant de
// ticks fixes que le temps écoulé le permet (accumulateur). Résultat : la
// production est identique à 30, 60 ou 144 images par seconde.
//
// État de la simulation (sérialisable) :
//   tick                 nombre de ticks écoulés depuis le début de la partie
//   resources            { knowledge: number, ... }
//   record.prodTicks     (sur chaque bâtiment producteur) ticks depuis la dernière production

import { BALANCE } from '../balance.js';

const STEP = 1 / BALANCE.ticksPerSecond;
const EPSILON = 1e-9; // absorbe les erreurs d'arrondi de l'accumulateur

export class Simulation {
  constructor(buildings) {
    this.buildings = buildings;
    this.tick = 0;
    this.accumulator = 0;
    this.resources = {};
    for (const [id, res] of Object.entries(BALANCE.resources)) this.resources[id] = res.start;

    this.events = [];        // événements à consommer par le rendu (production…)
    this.listeners = new Set();
  }

  // Abonnement aux changements d'état (ressources, bâtiments). Renvoie un désabonnement.
  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  advance(dtSeconds) {
    this.accumulator += Math.min(dtSeconds, BALANCE.maxCatchUpSeconds);
    let changed = false;
    while (this.accumulator >= STEP - EPSILON) {
      this.accumulator -= STEP;
      changed = this.#step() || changed;
    }
    if (changed) this.#notify();
  }

  // Événements survenus depuis le dernier appel.
  drainEvents() {
    const out = this.events;
    this.events = [];
    return out;
  }

  // ----- Économie -----

  // Coût réel du prochain bâtiment de ce type (gratuit pour le tout premier si prévu).
  costOf(type) {
    const rules = BALANCE.buildings[type];
    if (!rules) return {};
    const count = this.buildings.records.filter((r) => r.type === type).length;
    if (rules.firstFree && count === 0) return {};
    return { ...rules.cost };
  }

  canAfford(type) {
    const cost = this.costOf(type);
    return Object.entries(cost).every(([res, n]) => (this.resources[res] ?? 0) >= n);
  }

  // Emplacement libre ET moyens suffisants.
  // { ok } ou { ok: false, reason: 'bounds' | 'occupied' | 'unknown' | 'cost', cost? }
  canPlace(type, x, z) {
    const check = this.buildings.canPlace(type, x, z);
    if (!check.ok) return check;
    if (!this.canAfford(type)) return { ok: false, reason: 'cost', cost: this.costOf(type) };
    return { ok: true };
  }

  // Pose atomique : vérification, paiement, création. Renvoie l'enregistrement ou null.
  placeBuilding(type, x, z) {
    if (!this.canPlace(type, x, z).ok) return null;
    const cost = this.costOf(type);
    const record = this.buildings.place(type, x, z);
    if (!record) return null;
    for (const [res, n] of Object.entries(cost)) this.resources[res] -= n;
    if (BALANCE.buildings[type]?.production) record.prodTicks = 0;
    this.#notify();
    return record;
  }

  toJSON() {
    return { version: 1, tick: this.tick, resources: { ...this.resources } };
  }

  // ----- Interne -----

  #step() {
    this.tick++;
    let changed = false;
    for (const record of this.buildings.records) {
      const prod = BALANCE.buildings[record.type]?.production;
      if (!prod) continue;
      const interval = Math.max(1, Math.round(prod.intervalSeconds * BALANCE.ticksPerSecond));
      record.prodTicks = (record.prodTicks ?? 0) + 1;
      if (record.prodTicks >= interval) {
        record.prodTicks -= interval;
        this.resources[prod.resource] += prod.amount;
        this.events.push({ kind: 'produced', uid: record.uid, resource: prod.resource, amount: prod.amount });
        changed = true;
      }
    }
    return changed;
  }

  #notify() {
    for (const fn of this.listeners) fn(this);
  }
}
