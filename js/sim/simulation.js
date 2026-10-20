// Simulation à pas de temps fixe, indépendante du rendu.
// Le rendu appelle advance(dt) à chaque image ; la simulation exécute autant de
// ticks fixes que le temps écoulé le permet (accumulateur). Résultat : la
// production est identique à 30, 60 ou 144 images par seconde.
//
// Le jeu en direct ET le rattrapage hors ligne passent par le même moteur
// (#run), qui saute directement d'un événement de production au suivant.
// Le résultat hors ligne est donc, par construction, celui du jeu continu.
//
// État de la simulation (sérialisable) :
//   tick                 nombre de ticks écoulés depuis le début de la partie
//   resources            { knowledge, omens, ... }
//   record.prodTicks     (bâtiments producteurs) avancement du cycle en cours, en ticks
//   record.paused        true si le cycle est terminé mais les entrées manquent

import { BALANCE } from '../balance.js';

const TPS = BALANCE.ticksPerSecond;
const STEP = 1 / TPS;
const EPSILON = 1e-9; // absorbe les erreurs d'arrondi de l'accumulateur

// Règles de production pré-calculées par type (intervalle en ticks).
const PRODUCTION = {};
for (const [type, rules] of Object.entries(BALANCE.buildings)) {
  if (!rules.production) continue;
  const p = rules.production;
  PRODUCTION[type] = {
    interval: Math.max(1, Math.round(p.intervalSeconds * TPS)),
    inputs: p.inputs || {},
    outputs: p.outputs || {},
  };
}

export function productionOf(type) {
  return PRODUCTION[type] || null;
}

export class Simulation {
  constructor(buildings) {
    this.buildings = buildings;
    this.tick = 0;
    this.accumulator = 0;
    this.resources = {};
    for (const [id, res] of Object.entries(BALANCE.resources)) this.resources[id] = res.start;

    this.events = [];        // événements à consommer par le rendu (production, pause…)
    this.listeners = new Set();
  }

  // Abonnement aux changements d'état (ressources, bâtiments, pauses).
  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  advance(dtSeconds) {
    this.accumulator += Math.min(dtSeconds, BALANCE.maxCatchUpSeconds);
    let ticks = 0;
    while (this.accumulator >= STEP - EPSILON) {
      this.accumulator -= STEP;
      ticks++;
    }
    if (ticks > 0 && this.#run(ticks, { emit: true }).changed) this.#notify();
  }

  // Événements survenus depuis le dernier appel.
  drainEvents() {
    const out = this.events;
    this.events = [];
    return out;
  }

  // ----- Déblocage et économie -----

  countOf(type) {
    return this.buildings.records.reduce((n, r) => n + (r.type === type ? 1 : 0), 0);
  }

  // Conditions non remplies : [{ type, required, have }] (vide = débloqué).
  missingUnlocks(type) {
    const need = BALANCE.buildings[type]?.unlock?.buildings || {};
    return Object.entries(need)
      .map(([req, n]) => ({ type: req, required: n, have: this.countOf(req) }))
      .filter((m) => m.have < m.required);
  }

  isUnlocked(type) {
    return this.missingUnlocks(type).length === 0;
  }

  // Coût réel du prochain bâtiment de ce type (gratuit pour le tout premier si prévu).
  costOf(type) {
    const rules = BALANCE.buildings[type];
    if (!rules) return {};
    if (rules.firstFree && this.countOf(type) === 0) return {};
    return { ...(rules.cost || {}) };
  }

  canAfford(type) {
    return this.#has(this.costOf(type));
  }

  // { ok } ou { ok: false, reason: 'unknown' | 'locked' | 'bounds' | 'occupied' | 'cost', … }
  canPlace(type, x, z) {
    if (!BALANCE.buildings[type]) return { ok: false, reason: 'unknown' };
    const missing = this.missingUnlocks(type);
    if (missing.length) return { ok: false, reason: 'locked', missing };
    const check = this.buildings.canPlace(type, x, z);
    if (!check.ok) return check;
    if (!this.canAfford(type)) return { ok: false, reason: 'cost', cost: this.costOf(type) };
    return { ok: true };
  }

  // Pose atomique : vérification, paiement, création. Renvoie l'enregistrement ou null.
  placeBuilding(type, x, z) {
    if (!this.canPlace(type, x, z).ok) return null;
    const cost = this.costOf(type);
    const extra = PRODUCTION[type] ? { prodTicks: 0, paused: false } : {};
    const record = this.buildings.place(type, x, z, extra);
    if (!record) return null;
    this.#pay(cost);
    this.#notify();
    return record;
  }

  // ----- Hors ligne -----

  // Crédite une absence de `seconds` secondes (plafonnée), en rejouant exactement
  // la chaîne de production : un Observatoire ne consomme que les Savoirs
  // réellement disponibles au moment de chaque fin de cycle.
  // → { seconds, ticks, produced: { [type]: { [res]: n } }, consumed: { [res]: n } }
  applyOffline(seconds) {
    const { maxSeconds, efficiency } = BALANCE.offline;
    const effective = Math.max(0, Math.min(Number(seconds) || 0, maxSeconds));
    const ticks = Math.floor(effective * TPS);
    const report = this.#run(ticks, { emit: false, outputScale: efficiency, track: true });
    if (ticks > 0) this.#notify();
    return { seconds: effective, ticks, produced: report.produced, consumed: report.consumed };
  }

  // ----- Sauvegarde -----

  toJSON() {
    return { tick: this.tick, resources: { ...this.resources } };
  }

  // Restaure un état déjà validé (voir save/save.js).
  load({ tick, resources }) {
    this.tick = tick;
    this.accumulator = 0;
    this.events = [];
    for (const [id, res] of Object.entries(BALANCE.resources)) {
      this.resources[id] = resources[id] ?? res.start;
    }
    for (const record of this.buildings.records) {
      const prod = PRODUCTION[record.type];
      if (!prod) continue;
      record.prodTicks = Math.min(record.prodTicks ?? 0, prod.interval);
      record.paused = !!record.paused && record.prodTicks >= prod.interval;
    }
    this.#notify();
  }

  reset() {
    this.load({ tick: 0, resources: {} });
  }

  // ----- Moteur -----

  // Avance de `ticks` ticks en sautant d'un événement au suivant.
  // Sémantique (identique tick par tick) : à chaque tick, chaque cycle actif avance
  // de 1 ; puis, dans l'ordre de pose, chaque bâtiment arrivé en fin de cycle tente
  // de payer ses entrées : succès → production et nouveau cycle ; échec → pause.
  // Un bâtiment en pause réessaie à chaque tick ; comme les ressources ne changent
  // qu'aux fins de cycle, on ne le réveille que lorsqu'il peut effectivement payer.
  #run(ticks, { emit = false, outputScale = 1, track = false } = {}) {
    const producers = this.buildings.records.filter((r) => PRODUCTION[r.type]);
    const produced = {};
    const consumed = {};
    let changed = false;
    let remaining = ticks;

    while (remaining > 0) {
      // Prochain tick où quelque chose peut arriver.
      let jump = Infinity;
      for (const r of producers) {
        const prod = PRODUCTION[r.type];
        if (r.paused) {
          if (this.#has(prod.inputs)) jump = 1;
        } else {
          jump = Math.min(jump, Math.max(1, prod.interval - r.prodTicks));
        }
      }
      if (jump === Infinity || jump > remaining) {
        // Aucun événement d'ici la fin : les cycles actifs avancent, c'est tout.
        for (const r of producers) if (!r.paused) r.prodTicks += remaining;
        this.tick += remaining;
        break;
      }

      for (const r of producers) if (!r.paused) r.prodTicks += jump;
      this.tick += jump;
      remaining -= jump;

      for (const r of producers) {
        const prod = PRODUCTION[r.type];
        if (r.prodTicks < prod.interval) continue;
        if (this.#has(prod.inputs)) {
          this.#pay(prod.inputs);
          for (const [res, n] of Object.entries(prod.outputs)) {
            this.resources[res] += n * outputScale;
          }
          r.prodTicks = 0;
          if (r.paused && emit) this.events.push({ kind: 'resumed', uid: r.uid });
          r.paused = false;
          changed = true;
          if (emit) this.events.push({ kind: 'produced', uid: r.uid, outputs: prod.outputs });
          if (track) {
            const byType = (produced[r.type] ??= {});
            for (const [res, n] of Object.entries(prod.outputs)) {
              byType[res] = (byType[res] ?? 0) + n * outputScale;
            }
            for (const [res, n] of Object.entries(prod.inputs)) {
              consumed[res] = (consumed[res] ?? 0) + n;
            }
          }
        } else if (!r.paused) {
          r.prodTicks = prod.interval;
          r.paused = true;
          changed = true;
          if (emit) this.events.push({ kind: 'paused', uid: r.uid });
        }
      }
    }
    return { changed, produced, consumed };
  }

  #has(cost) {
    return Object.entries(cost).every(([res, n]) => (this.resources[res] ?? 0) >= n);
  }

  #pay(cost) {
    for (const [res, n] of Object.entries(cost)) this.resources[res] -= n;
  }

  #notify() {
    for (const fn of this.listeners) fn(this);
  }
}
