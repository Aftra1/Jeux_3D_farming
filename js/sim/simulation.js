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
//   earned               total cumulé produit par ressource (jamais diminué par les dépenses)
//   record.prodTicks     (bâtiments producteurs) avancement du cycle en cours, en ticks
//   record.paused        true si le cycle est terminé mais les entrées manquent
//   visitors             nombre de Visiteurs du lac attrapés
//   record.stage         (grands chantiers : `stages` dans balance.js) palier atteint, 1..n

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

// Les bonus en pourcentage donnent des quantités fractionnaires : on arrondit au
// millionième pour que 10 × 1,1 fasse bien 11 (et non 10,999…), au même endroit en
// direct et hors ligne.
export const roundAmount = (v) => Math.round(v * 1e6) / 1e6;

const footprintOf = (type) => BALANCE.buildings[type]?.footprint || { w: 1, d: 1 };

// Cases (non bornées au terrain) de la zone d'aura d'un bâtiment de type `type`
// posé en (x, z) : l'anneau de `radius` cases autour de l'emprise (8 cases pour
// une emprise 1x1 de rayon 1). [] si le type n'a pas d'aura.
export function auraTiles(type, x, z) {
  const aura = BALANCE.buildings[type]?.aura;
  if (!aura) return [];
  const { w, d } = footprintOf(type);
  const r = aura.radius;
  const tiles = [];
  for (let tz = z - r; tz < z + d + r; tz++) {
    for (let tx = x - r; tx < x + w + r; tx++) {
      if (tx >= x && tx < x + w && tz >= z && tz < z + d) continue;
      tiles.push({ x: tx, z: tz });
    }
  }
  return tiles;
}

// Vrai si l'emprise du bâtiment `record` touche la zone d'aura de `source`.
function inAura(source, record) {
  const aura = BALANCE.buildings[source.type]?.aura;
  if (!aura || !aura.targets.includes(record.type)) return false;
  const s = footprintOf(source.type);
  const t = footprintOf(record.type);
  // Distance de Tchebychev entre les deux rectangles (0 = chevauchement).
  const gap = (a0, aLen, b0, bLen) => Math.max(0, b0 - (a0 + aLen - 1), a0 - (b0 + bLen - 1));
  const dist = Math.max(gap(source.x, s.w, record.x, t.w), gap(source.z, s.d, record.z, t.d));
  return dist >= 1 && dist <= aura.radius;
}

export class Simulation {
  // story : objet exposant `missives` (nombre accompli), lu pour les déblocages.
  constructor(buildings, story = { missives: 0 }) {
    this.buildings = buildings;
    this.story = story;
    this.tick = 0;
    this.accumulator = 0;
    this.resources = {};
    this.earned = {};
    for (const [id, res] of Object.entries(BALANCE.resources)) {
      this.resources[id] = res.start;
      this.earned[id] = 0;
    }
    this.visitors = 0;

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

  // Conditions non remplies : [{ type, required, have }] ou
  // [{ kind: 'missives', required, have }] (vide = débloqué).
  missingUnlocks(type) {
    const unlock = BALANCE.buildings[type]?.unlock || {};
    const missing = Object.entries(unlock.buildings || {})
      .map(([req, n]) => ({ type: req, required: n, have: this.countOf(req) }))
      .filter((m) => m.have < m.required);
    const done = this.story.missives ?? 0;
    if (unlock.missives && done < unlock.missives) {
      missing.push({ kind: 'missives', required: unlock.missives, have: done });
    }
    return missing;
  }

  isUnlocked(type) {
    return this.missingUnlocks(type).length === 0;
  }

  // Coût réel du prochain bâtiment de ce type : gratuit pour le tout premier si prévu,
  // puis coût de base × costGrowth^(exemplaires déjà payés), arrondi à l'entier.
  costOf(type) {
    const rules = BALANCE.buildings[type];
    if (!rules) return {};
    if (rules.stages) return { ...rules.stages[0].cost };
    let paid = this.countOf(type);
    if (rules.firstFree) {
      if (paid === 0) return {};
      paid--;
    }
    const k = (rules.costGrowth ?? 1) ** paid;
    const cost = {};
    for (const [res, n] of Object.entries(rules.cost || {})) cost[res] = Math.round(n * k);
    return cost;
  }

  // Faux si poser `type` en (x, z) ne laisserait plus aucune place libre à un bâtiment
  // `reserveRoom` encore jamais posé (le Phare). Registre sans `hasFreeArea` : pas de contrôle.
  leavesRoom(type, x, z) {
    if (!this.buildings.hasFreeArea) return true;
    const { w, d } = footprintOf(type);
    return Object.entries(BALANCE.buildings).every(([other, rules]) => !rules.reserveRoom
      || other === type || this.countOf(other) > 0
      || this.buildings.hasFreeArea(footprintOf(other), { x, z, w, d }));
  }

  canAfford(type) {
    return this.#has(this.costOf(type));
  }

  // { ok } ou { ok: false, reason: 'unknown' | 'locked' | 'bounds' | 'occupied' | 'room' | 'cost', … }
  canPlace(type, x, z) {
    if (!BALANCE.buildings[type]) return { ok: false, reason: 'unknown' };
    const missing = this.missingUnlocks(type);
    if (missing.length) return { ok: false, reason: 'locked', missing };
    if (BALANCE.buildings[type].unique && this.countOf(type) > 0) return { ok: false, reason: 'unique' };
    const check = this.buildings.canPlace(type, x, z);
    if (!check.ok) return check;
    if (!this.leavesRoom(type, x, z)) return { ok: false, reason: 'room' };
    if (!this.canAfford(type)) return { ok: false, reason: 'cost', cost: this.costOf(type) };
    return { ok: true };
  }

  // Pose atomique : vérification, paiement, création. Renvoie l'enregistrement ou null.
  placeBuilding(type, x, z) {
    if (!this.canPlace(type, x, z).ok) return null;
    const cost = this.costOf(type);
    const extra = PRODUCTION[type] ? { prodTicks: 0, paused: false } : {};
    if (BALANCE.buildings[type].stages) extra.stage = 1;
    const record = this.buildings.place(type, x, z, extra);
    if (!record) return null;
    this.#pay(cost);
    this.#notify();
    return record;
  }

  // ----- Grands chantiers (paliers) -----

  // Plus haut palier atteint par un bâtiment `type` (0 s'il n'y en a pas).
  stageOf(type) {
    return this.buildings.records.reduce((m, r) => (r.type === type ? Math.max(m, r.stage ?? 0) : m), 0);
  }

  // Coût du palier suivant du bâtiment `uid`, ou null s'il est achevé (ou sans paliers).
  nextStageCost(uid) {
    const record = this.buildings.records.find((r) => r.uid === uid);
    const stages = record && BALANCE.buildings[record.type].stages;
    if (!stages || record.stage >= stages.length) return null;
    return { ...stages[record.stage].cost };
  }

  // Élève le bâtiment `uid` d'un palier, en payant. → { ok, stage } ou
  // { ok: false, reason: 'unknown' | 'complete' | 'cost', cost }.
  elevate(uid) {
    const record = this.buildings.records.find((r) => r.uid === uid);
    if (!record || !BALANCE.buildings[record.type].stages) return { ok: false, reason: 'unknown' };
    const cost = this.nextStageCost(uid);
    if (!cost) return { ok: false, reason: 'complete' };
    if (!this.#has(cost)) return { ok: false, reason: 'cost', cost };
    this.#pay(cost);
    record.stage++;
    this.#notify();
    return { ok: true, stage: record.stage };
  }

  // Multiplicateur des sorties d'un bâtiment `type` (1 = aucun bonus de palier).
  stageMultiplier(type) {
    let percent = 0;
    for (const r of this.buildings.records) {
      const boost = BALANCE.buildings[r.type]?.stageBoost;
      if (boost && boost.targets.includes(type)) percent += boost.percent * (r.stage ?? 0);
    }
    return 1 + percent / 100;
  }

  // ----- Auras -----

  // Bonus de chaque bâtiment renforcé : Map uid → { [res]: n }. Sans cumul :
  // plusieurs auras sur un même bâtiment donnent le plus fort bonus par ressource.
  boosts() {
    const out = new Map();
    const records = this.buildings.records;
    for (const source of records) {
      const aura = BALANCE.buildings[source.type]?.aura;
      if (!aura) continue;
      for (const r of records) {
        if (!inAura(source, r)) continue;
        const bonus = out.get(r.uid) || {};
        for (const [res, n] of Object.entries(aura.bonus)) bonus[res] = Math.max(bonus[res] ?? 0, n);
        out.set(r.uid, bonus);
      }
    }
    return out;
  }

  // Nombre de bâtiments `type` actuellement renforcés par au moins une aura.
  boostedCountOf(type) {
    const boosts = this.boosts();
    return this.buildings.records.reduce((n, r) => n + (r.type === type && boosts.has(r.uid) ? 1 : 0), 0);
  }

  // Bâtiments existants que renforcerait un bâtiment `type` posé en (x, z).
  wouldBoost(type, x, z) {
    const source = { type, x, z };
    return this.buildings.records.filter((r) => inAura(source, r));
  }

  // ----- Visiteurs du lac -----

  // Production brute par seconde de chaque ressource (sorties de cycle, auras et paliers
  // compris, sans déduire ce que consomment les autres bâtiments).
  productionRate() {
    const rate = {};
    const producers = this.buildings.records.filter((r) => PRODUCTION[r.type]);
    const outputsOf = this.#outputsOf(producers);
    for (const r of producers) {
      const perSecond = TPS / PRODUCTION[r.type].interval;
      for (const [res, n] of Object.entries(outputsOf.get(r.uid))) rate[res] = (rate[res] ?? 0) + n * perSecond;
    }
    return rate;
  }

  // Cadeau d'un visiteur (sans l'appliquer). random() ∈ [0, 1[ : tiré deux fois au plus.
  // Plus rarement des Présages (seulement si le joueur en a déjà obtenu), sinon
  // l'équivalent de `gift.seconds` de production actuelle de Savoirs (avec un plancher).
  visitorGift(random = Math.random) {
    const gift = BALANCE.visitors.gift;
    if (this.earned.omens > 0 && random() < gift.omensChance) {
      const { min, max } = gift.omens;
      return { omens: min + Math.min(max - min, Math.floor(random() * (max - min + 1))) };
    }
    const rate = this.productionRate().knowledge ?? 0;
    return { knowledge: Math.max(gift.minKnowledge, Math.round(rate * gift.seconds)) };
  }

  // Visiteur attrapé : le cadeau est crédité (et compté dans le total cumulé). → cadeau.
  catchVisitor(random = Math.random) {
    const gift = this.visitorGift(random);
    for (const [res, n] of Object.entries(gift)) {
      this.resources[res] = roundAmount(this.resources[res] + n);
      this.earned[res] = roundAmount(this.earned[res] + n);
    }
    this.visitors++;
    this.#notify();
    return gift;
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
    return { tick: this.tick, resources: { ...this.resources }, earned: { ...this.earned }, visitors: this.visitors };
  }

  // Restaure un état déjà validé (voir save/save.js).
  load({ tick, resources, earned = {}, visitors = 0 }) {
    this.tick = tick;
    this.visitors = visitors;
    this.accumulator = 0;
    this.events = [];
    for (const [id, res] of Object.entries(BALANCE.resources)) {
      this.resources[id] = resources[id] ?? res.start;
      this.earned[id] = earned[id] ?? 0;
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
    // Auras et paliers ne changent qu'hors du moteur (pose, « Élever ») : sorties fixées
    // pour tout l'appel.
    const outputsOf = this.#outputsOf(producers);
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
          const outputs = outputsOf.get(r.uid);
          for (const [res, n] of Object.entries(outputs)) {
            this.resources[res] = roundAmount(this.resources[res] + n * outputScale);
            this.earned[res] = roundAmount(this.earned[res] + n * outputScale);
          }
          r.prodTicks = 0;
          if (r.paused && emit) this.events.push({ kind: 'resumed', uid: r.uid });
          r.paused = false;
          changed = true;
          if (emit) this.events.push({ kind: 'produced', uid: r.uid, outputs });
          if (track) {
            const byType = (produced[r.type] ??= {});
            for (const [res, n] of Object.entries(outputs)) {
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

  // Sorties par cycle de chaque producteur : Map uid → { [res]: n }. Le bonus de palier
  // s'applique aussi au renfort d'aura.
  #outputsOf(producers) {
    const boosts = this.boosts();
    return new Map(producers.map((r) => {
      const outputs = { ...PRODUCTION[r.type].outputs };
      for (const [res, n] of Object.entries(boosts.get(r.uid) || {})) outputs[res] = (outputs[res] ?? 0) + n;
      const k = this.stageMultiplier(r.type);
      for (const res of Object.keys(outputs)) outputs[res] = roundAmount(outputs[res] * k);
      return [r.uid, outputs];
    }));
  }

  #has(cost) {
    return Object.entries(cost).every(([res, n]) => (this.resources[res] ?? 0) >= n);
  }

  #pay(cost) {
    for (const [res, n] of Object.entries(cost)) this.resources[res] = roundAmount(this.resources[res] - n);
  }

  #notify() {
    for (const fn of this.listeners) fn(this);
  }
}
