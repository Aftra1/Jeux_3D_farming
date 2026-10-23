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
//   record.level         (amélioration individuelle, `upgrade` dans balance.js) niveau atteint, 1..n
//   record.luck          (Embarcadère amélioré) cumul de `doubleChance`, 0 <= luck < 1
//   record.muse          (producteur sous un Scriptorium de niveau 3) cumul de chance de sortie en plus, 0 <= muse < 1
//   record.charge        (Cloche) ticks de charge, 0..chargeTicks ; record.ring : ticks de sonnerie restants
//   record.stage         (grands chantiers : `stages` dans balance.js) palier atteint, 1..n
//   islands              ids des îlots ralliés, dans l'ordre (leurs cases sont constructibles)

import { BALANCE } from '../balance.js';
import { ISLAND_IDS } from '../world/islands.js';

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

// ----- Niveaux (amélioration individuelle) -----

export const levelOf = (record) => record.level ?? 1;
export const maxLevelOf = (type) => BALANCE.buildings[type]?.upgrade?.levels.length ?? 1;

// Effets du niveau `level` du type `type` (valeurs absolues de balance.js), {} si aucun.
export const levelStats = (type, level) => BALANCE.buildings[type]?.upgrade?.levels[level - 1] ?? {};

// Durée du cycle d'un bâtiment en ticks, niveau compris (0 s'il ne produit rien).
export function cycleTicks(record) {
  const p = PRODUCTION[record.type];
  if (!p) return 0;
  const seconds = levelStats(record.type, levelOf(record)).intervalSeconds;
  return seconds === undefined ? p.interval : Math.max(1, Math.round(seconds * TPS));
}

// Le type peut-il porter un `luck` (un niveau avec `doubleChance`) ?
export const hasLuck = (type) => (BALANCE.buildings[type]?.upgrade?.levels ?? []).some((l) => l.doubleChance);
const chanceOf = (record) => levelStats(record.type, levelOf(record)).doubleChance ?? 0;

// Les bonus en pourcentage donnent des quantités fractionnaires : on arrondit au
// millionième pour que 10 × 1,1 fasse bien 11 (et non 10,999…), au même endroit en
// direct et hors ligne.
export const roundAmount = (v) => Math.round(v * 1e6) / 1e6;

const footprintOf = (type) => BALANCE.buildings[type]?.footprint || { w: 1, d: 1 };

// Zone d'effet d'un type : `aura` (sorties en plus, Sanctuaire), `efficiency` (entrées réduites, Scriptorium)
// ou la portée de la Cloche (tous les producteurs). { radius, targets } ou null.
function auraOf(type) {
  const rules = BALANCE.buildings[type];
  if (!rules) return null;
  if (rules.bell) return { radius: rules.bell.radius, targets: Object.keys(PRODUCTION) };
  return rules.aura ?? rules.efficiency ?? null;
}

// Portée en cases d'une source, niveau compris.
function reachOf(source) {
  const lv = levelStats(source.type, levelOf(source));
  return lv.auraRadius ?? lv.radius ?? auraOf(source.type).radius;
}

// ----- Cloche (action active) -----

export const isBell = (type) => Boolean(BALANCE.buildings[type]?.bell);

// Réglages d'une Cloche, niveau compris, en ticks : { chargeTicks, ringTicks, radius, speed }.
export function bellStats(record) {
  const base = BALANCE.buildings[record.type].bell;
  const lv = levelStats(record.type, levelOf(record));
  return {
    chargeTicks: Math.max(1, Math.round((lv.chargeSeconds ?? base.chargeSeconds) * TPS)),
    ringTicks: Math.max(1, Math.round(base.ringSeconds * TPS)),
    radius: lv.radius ?? base.radius,
    speed: base.speed,
  };
}

// Valeurs maximales qu'une Cloche peut porter (validation des sauvegardes).
export function bellLimits(type) {
  const base = BALANCE.buildings[type].bell;
  const charge = Math.max(base.chargeSeconds, ...(BALANCE.buildings[type].upgrade?.levels ?? []).map((l) => l.chargeSeconds ?? 0));
  return { chargeTicks: Math.round(charge * TPS), ringTicks: Math.round(base.ringSeconds * TPS) };
}

export const isBellReady = (record) => (record.charge ?? 0) >= bellStats(record).chargeTicks && !(record.ring > 0);
// Allumée (vue) : chargée, ou en train de sonner.
export const isBellLit = (record) => isBellReady(record) || record.ring > 0;

// Cases (non bornées au terrain) de la zone d'aura d'un bâtiment de type `type`
// posé en (x, z) : l'anneau de `radius` cases autour de l'emprise (8 cases pour
// une emprise 1x1 de rayon 1). [] si le type n'a pas d'aura.
export function auraTiles(type, x, z, level = 1) {
  const aura = auraOf(type);
  if (!aura) return [];
  const { w, d } = footprintOf(type);
  const r = reachOf({ type, level });
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
  const aura = auraOf(source.type);
  if (!aura || !aura.targets.includes(record.type)) return false;
  const dist = gapBetween(source, record);
  return dist >= 1 && dist <= reachOf(source);
}

// Distance de Tchebychev entre les emprises de deux bâtiments (0 = chevauchement).
function gapBetween(a, b) {
  const s = footprintOf(a.type);
  const t = footprintOf(b.type);
  const gap = (a0, aLen, b0, bLen) => Math.max(0, b0 - (a0 + aLen - 1), a0 - (b0 + bLen - 1));
  return Math.max(gap(a.x, s.w, b.x, t.w), gap(a.z, s.d, b.z, t.d));
}

export class Simulation {
  // story : objet exposant `missives` (nombre accompli) et `finished` (fin vue), lu pour
  // les déblocages.
  constructor(buildings, story = { missives: 0, finished: false }) {
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
    this.islands = [];

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
    for (const [req, n] of Object.entries(unlock.stages || {})) {
      const have = this.stageOf(req);
      if (have < n) missing.push({ kind: 'stage', type: req, required: n, have });
    }
    if (unlock.finished && !this.story.finished) missing.push({ kind: 'finished' });
    return missing;
  }

  // Règle `edge` : l'emprise touche le bord de sa zone (domaine ou îlot : contact avec l'eau).
  // Registre sans `touchesEdge` (tests du moteur) : pas de contrôle.
  touchesEdge(type, x, z) {
    if (!BALANCE.buildings[type]?.edge || !this.buildings.touchesEdge) return true;
    const { w, d } = footprintOf(type);
    return this.buildings.touchesEdge(x, z, w, d);
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
  // `ignore` : uid d'un bâtiment déplacé, dont l'ancienne emprise est libre.
  leavesRoom(type, x, z, ignore = null) {
    if (!this.buildings.hasFreeArea) return true;
    const { w, d } = footprintOf(type);
    return Object.entries(BALANCE.buildings).every(([other, rules]) => !rules.reserveRoom
      || other === type || this.countOf(other) > 0
      || this.buildings.hasFreeArea(footprintOf(other), { x, z, w, d }, ignore));
  }

  // Le nombre maximal d'exemplaires (`limit`) est-il atteint ?
  atLimit(type) {
    const limit = BALANCE.buildings[type]?.limit;
    return limit !== undefined && this.countOf(type) >= limit;
  }

  canAfford(type) {
    return this.#has(this.costOf(type));
  }

  // { ok } ou { ok: false, reason: 'unknown' | 'locked' | 'bounds' | 'occupied' | 'edge' | 'room' | 'cost', … }
  canPlace(type, x, z) {
    if (!BALANCE.buildings[type]) return { ok: false, reason: 'unknown' };
    const missing = this.missingUnlocks(type);
    if (missing.length) return { ok: false, reason: 'locked', missing };
    if (BALANCE.buildings[type].unique && this.countOf(type) > 0) return { ok: false, reason: 'unique' };
    if (this.atLimit(type)) return { ok: false, reason: 'limit', limit: BALANCE.buildings[type].limit };
    const check = this.buildings.canPlace(type, x, z);
    if (!check.ok) return check;
    if (!this.touchesEdge(type, x, z)) return { ok: false, reason: 'edge' };
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
    if (BALANCE.buildings[type].upgrade) extra.level = 1;
    if (hasLuck(type)) extra.luck = 0;
    if (isBell(type)) Object.assign(extra, { charge: 0, ring: 0 });
    const record = this.buildings.place(type, x, z, extra);
    if (!record) return null;
    this.#pay(cost);
    this.#notify();
    return record;
  }

  // ----- Déplacement -----

  // Déplacer le bâtiment `uid` en (x, z) : mêmes règles de terrain que la pose (emprise libre, bord,
  // place du Phare), son ancienne emprise comptant comme libre. Gratuit, sans déblocage ni coût.
  // { ok } ou { ok: false, reason: 'unknown' | 'bounds' | 'occupied' | 'edge' | 'room' }.
  canMove(uid, x, z) {
    const record = this.buildings.records.find((r) => r.uid === uid);
    if (!record) return { ok: false, reason: 'unknown' };
    const check = this.buildings.canPlace(record.type, x, z, uid);
    if (!check.ok) return check;
    if (!this.touchesEdge(record.type, x, z)) return { ok: false, reason: 'edge' };
    if (!this.leavesRoom(record.type, x, z, uid)) return { ok: false, reason: 'room' };
    return { ok: true };
  }

  // Déplace le bâtiment : il garde uid, progression de cycle, pause et palier. Les auras suivent
  // seules (recalculées au début de chaque `#run`, en direct comme hors ligne). → l'enregistrement ou null.
  moveBuilding(uid, x, z) {
    if (!this.canMove(uid, x, z).ok) return null;
    const record = this.buildings.move(uid, x, z);
    if (!record) return null;
    this.#notify();
    return record;
  }

  // Un bâtiment `type` posé en (x, z) serait-il renforcé par une aura existante (hors `except`) ?
  wouldBeBoosted(type, x, z, except = null) {
    const target = { type, x, z };
    return this.buildings.records.some((source) => source.uid !== except && BALANCE.buildings[source.type].aura && inAura(source, target));
  }

  // Idem pour une économie de Scriptorium.
  wouldBeSaved(type, x, z, except = null) {
    const target = { type, x, z };
    return this.buildings.records.some((source) => source.uid !== except && BALANCE.buildings[source.type].efficiency && inAura(source, target));
  }

  // Production d'un cycle du bâtiment `uid` (auras et paliers compris) : { seconds, inputs, outputs },
  // ou null s'il ne produit rien.
  cycleOf(uid) {
    const record = this.buildings.records.find((r) => r.uid === uid);
    const prod = record && PRODUCTION[record.type];
    if (!prod) return null;
    return { seconds: cycleTicks(record) / TPS, inputs: this.#inputsOf([record]).get(uid), outputs: this.#outputsOf([record]).get(uid),
      chance: chanceOf(record) };
  }

  // Cycle de chaque producteur (même forme que cycleOf) : Map uid → cycle, auras calculées une seule fois.
  cycles() {
    const producers = this.buildings.records.filter((r) => PRODUCTION[r.type]);
    const outputs = this.#outputsOf(producers);
    const inputs = this.#inputsOf(producers);
    return new Map(producers.map((r) => [r.uid, { seconds: cycleTicks(r) / TPS, inputs: inputs.get(r.uid),
      outputs: outputs.get(r.uid), chance: chanceOf(r) }]));
  }

  // ----- Améliorations individuelles -----

  // Coût du niveau suivant du bâtiment `uid`, ou null s'il est au maximum (ou n'a pas d'amélioration) :
  // coût du niveau 2 × costGrowth^(niveau actuel − 1), arrondi.
  upgradeCost(uid) {
    const record = this.buildings.records.find((r) => r.uid === uid);
    const rules = record && BALANCE.buildings[record.type].upgrade;
    const level = record ? levelOf(record) : 0;
    if (!rules || level >= rules.levels.length) return null;
    const k = (rules.costGrowth ?? 1) ** (level - 1);
    return Object.fromEntries(Object.entries(rules.cost).map(([res, n]) => [res, Math.round(n * k)]));
  }

  // Améliore le bâtiment `uid` d'un niveau, en payant. Le cycle en cours est conservé (raccourci
  // au besoin pour tenir dans la nouvelle durée). → { ok, level } ou
  // { ok: false, reason: 'unknown' | 'max' | 'cost', cost }.
  upgrade(uid) {
    const record = this.buildings.records.find((r) => r.uid === uid);
    if (!record || !BALANCE.buildings[record.type].upgrade) return { ok: false, reason: 'unknown' };
    const cost = this.upgradeCost(uid);
    if (!cost) return { ok: false, reason: 'max' };
    if (!this.#has(cost)) return { ok: false, reason: 'cost', cost };
    this.#pay(cost);
    record.level = levelOf(record) + 1;
    if (isBell(record.type)) record.charge = Math.min(record.charge ?? 0, bellStats(record).chargeTicks);
    if (PRODUCTION[record.type]) {
      const ticks = cycleTicks(record);
      record.prodTicks = record.paused ? ticks : Math.min(record.prodTicks ?? 0, ticks - 1);
    }
    this.#notify();
    return { ok: true, level: record.level };
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
      const scale = levelStats(source.type, levelOf(source)).auraBonusScale ?? 1;
      for (const r of records) {
        if (!inAura(source, r)) continue;
        const bonus = out.get(r.uid) || {};
        for (const [res, n] of Object.entries(aura.bonus)) bonus[res] = Math.max(bonus[res] ?? 0, n * scale);
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

  // Économies d'un Scriptorium : Map uid → { inputScale, extraChance, extra }. Sans cumul : l'échelle la plus
  // basse, la meilleure chance (avec la sortie en plus qui l'accompagne).
  savings() {
    const out = new Map();
    const records = this.buildings.records;
    for (const source of records) {
      const rules = BALANCE.buildings[source.type]?.efficiency;
      if (!rules) continue;
      const lv = levelStats(source.type, levelOf(source));
      for (const r of records) {
        if (!inAura(source, r)) continue;
        const saving = out.get(r.uid) || { inputScale: 1, extraChance: 0, extra: null };
        saving.inputScale = Math.min(saving.inputScale, rules.inputScale);
        if ((lv.extraChance ?? 0) > saving.extraChance) {
          saving.extraChance = lv.extraChance;
          saving.extra = lv.extra;
        }
        out.set(r.uid, saving);
      }
    }
    return out;
  }

  // Nombre de bâtiments `type` actuellement servis par au moins une économie.
  savedCountOf(type) {
    const savings = this.savings();
    return this.buildings.records.reduce((n, r) => n + (r.type === type && savings.has(r.uid) ? 1 : 0), 0);
  }

  // ----- Cloches -----

  // État d'une Cloche : { charge, chargeTicks, ready, ringing, ring, ringTicks, radius, speed }, ou null.
  bellState(uid) {
    const record = this.buildings.records.find((r) => r.uid === uid);
    if (!record || !isBell(record.type)) return null;
    const stats = bellStats(record);
    const charge = Math.min(record.charge ?? 0, stats.chargeTicks);
    const ring = record.ring ?? 0;
    return { ...stats, charge, ring, ready: isBellReady(record), ringing: ring > 0 };
  }

  // Fait sonner la Cloche `uid` si elle est chargée : pendant `ringSeconds`, les producteurs à portée
  // avancent `speed` fois plus vite (calculé par le moteur unique). La charge repart de zéro.
  // → { ok, radius } ou { ok: false, reason: 'unknown' | 'ringing' | 'charging' }
  ring(uid) {
    const state = this.bellState(uid);
    if (!state) return { ok: false, reason: 'unknown' };
    if (state.ringing) return { ok: false, reason: 'ringing' };
    if (!state.ready) return { ok: false, reason: 'charging' };
    const record = this.buildings.records.find((r) => r.uid === uid);
    record.ring = state.ringTicks;
    record.charge = 0;
    this.events.push({ kind: 'rung', uid, radius: state.radius });
    this.#notify();
    return { ok: true, radius: state.radius };
  }

  // Bâtiments existants que renforcerait un bâtiment `type` posé en (x, z).
  wouldBoost(type, x, z, level = 1) {
    const source = { type, x, z, level };
    return this.buildings.records.filter((r) => inAura(source, r));
  }

  // ----- Îlots du lac (chapitre II) -----

  // Les îlots apparaissent dans la brume après la 3e missive du chapitre II.
  islandsRevealed() {
    return (this.story.missives ?? 0) >= BALANCE.islands.unlock.missives;
  }

  // Prix du prochain îlot rallié (croissant), ou null s'il n'en reste aucun.
  islandCost() {
    const cost = BALANCE.islands.costs[this.islands.length];
    return cost ? { ...cost } : null;
  }

  // { ok } ou { ok: false, reason: 'unknown' | 'hidden' | 'rallied' | 'cost', cost }
  canRally(id) {
    if (!ISLAND_IDS.includes(id)) return { ok: false, reason: 'unknown' };
    if (this.islands.includes(id)) return { ok: false, reason: 'rallied' };
    if (!this.islandsRevealed()) return { ok: false, reason: 'hidden' };
    const cost = this.islandCost();
    if (!cost || !this.#has(cost)) return { ok: false, reason: 'cost', cost };
    return { ok: true, cost };
  }

  // Rallie un îlot : paiement, puis ses cases deviennent constructibles. → résultat de canRally.
  rallyIsland(id) {
    const check = this.canRally(id);
    if (!check.ok) return check;
    this.#pay(check.cost);
    this.islands.push(id);
    this.buildings.setOpenIslands?.(this.islands);
    this.#notify();
    return check;
  }

  // ----- Visiteurs du lac -----

  // Production brute par seconde de chaque ressource (sorties de cycle, auras et paliers
  // compris, sans déduire ce que consomment les autres bâtiments).
  productionRate() {
    const rate = {};
    const producers = this.buildings.records.filter((r) => PRODUCTION[r.type]);
    const outputsOf = this.#outputsOf(producers);
    for (const r of producers) {
      const perSecond = TPS / cycleTicks(r);
      for (const [res, n] of Object.entries(outputsOf.get(r.uid))) rate[res] = (rate[res] ?? 0) + n * (1 + chanceOf(r)) * perSecond;
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
    return { tick: this.tick, resources: { ...this.resources }, earned: { ...this.earned }, visitors: this.visitors,
      islands: [...this.islands] };
  }

  // Restaure un état déjà validé (voir save/save.js).
  // Les îlots ralliés sont ouverts sur le terrain avant le chargement des bâtiments (SaveManager).
  load({ tick, resources, earned = {}, visitors = 0, islands = [] }) {
    this.tick = tick;
    this.visitors = visitors;
    this.islands = [...islands];
    this.buildings.setOpenIslands?.(this.islands);
    this.accumulator = 0;
    this.events = [];
    for (const [id, res] of Object.entries(BALANCE.resources)) {
      this.resources[id] = resources[id] ?? res.start;
      this.earned[id] = earned[id] ?? 0;
    }
    for (const record of this.buildings.records) {
      if (isBell(record.type)) {
        const stats = bellStats(record);
        record.charge = Math.min(record.charge ?? 0, stats.chargeTicks);
        record.ring = Math.min(record.ring ?? 0, stats.ringTicks);
      }
      const prod = PRODUCTION[record.type];
      if (!prod) continue;
      const ticks = cycleTicks(record);
      record.prodTicks = Math.min(record.prodTicks ?? 0, ticks);
      record.paused = !!record.paused && record.prodTicks >= ticks;
    }
    this.#notify();
  }

  reset() {
    this.load({ tick: 0, resources: {} });
  }

  // ----- Moteur -----

  // Avance de `ticks` ticks en sautant d'un événement au suivant.
  // Sémantique (identique tick par tick) : à chaque tick, chaque cycle actif avance de sa vitesse
  // (1, ou `speed` s'il est à portée d'une Cloche qui sonne au début du tick) ; puis, dans l'ordre de
  // pose, chaque bâtiment arrivé en fin de cycle tente de payer ses entrées (réduites par un Scriptorium) :
  // succès → production et nouveau cycle ; échec → pause. Enfin chaque Cloche se charge d'un tick et sa
  // sonnerie diminue d'un tick.
  // Un bâtiment en pause réessaie à chaque tick ; comme les ressources ne changent
  // qu'aux fins de cycle, on ne le réveille que lorsqu'il peut effectivement payer.
  // Les fins de sonnerie sont des événements du moteur (la vitesse change) ; la fin de charge n'en est pas un.
  #run(ticks, { emit = false, outputScale = 1, track = false } = {}) {
    const records = this.buildings.records;
    const producers = records.filter((r) => PRODUCTION[r.type]);
    const bells = records.filter((r) => isBell(r.type));
    // Auras, économies et paliers ne changent qu'hors du moteur (pose, « Élever », déplacement) :
    // sorties et entrées fixées pour tout l'appel.
    const outputsOf = this.#outputsOf(producers);
    const inputsOf = this.#inputsOf(producers);
    const savings = this.savings();
    const produced = {};
    const consumed = {};
    let changed = false;
    let remaining = ticks;

    while (remaining > 0) {
      const speeds = this.#speeds(producers, bells);
      const speedOf = (r) => speeds?.get(r.uid) ?? 1;
      // Prochain tick où quelque chose peut arriver.
      let jump = Infinity;
      for (const r of producers) {
        if (r.paused) {
          if (this.#has(inputsOf.get(r.uid))) jump = 1;
        } else {
          jump = Math.min(jump, Math.max(1, Math.ceil((cycleTicks(r) - r.prodTicks) / speedOf(r))));
        }
      }
      for (const b of bells) if (b.ring > 0) jump = Math.min(jump, b.ring);

      const step = jump === Infinity || jump > remaining ? remaining : jump;
      for (const r of producers) if (!r.paused) r.prodTicks += step * speedOf(r);
      this.tick += step;
      remaining -= step;
      if (this.#advanceBells(bells, step, emit)) changed = true;
      if (step < jump || jump === Infinity) break; // aucun événement d'ici la fin : les cycles avancent, c'est tout

      for (const r of producers) {
        const prod = PRODUCTION[r.type];
        const ticksOfCycle = cycleTicks(r);
        if (r.prodTicks < ticksOfCycle) continue;
        const inputs = inputsOf.get(r.uid);
        if (this.#has(inputs)) {
          this.#pay(inputs);
          let outputs = outputsOf.get(r.uid);
          const chance = chanceOf(r);
          if (chance > 0) { // cycle double dès que le cumul des chances atteint 1
            r.luck = roundAmount((r.luck ?? 0) + chance);
            if (r.luck >= 1) {
              r.luck = roundAmount(r.luck - 1);
              outputs = Object.fromEntries(Object.entries(outputs).map(([res, n]) => [res, n * 2]));
            }
          }
          const saving = savings.get(r.uid);
          if (saving?.extraChance > 0) { // Scriptorium niveau 3 : même principe, une sortie en plus
            r.muse = roundAmount((r.muse ?? 0) + saving.extraChance);
            if (r.muse >= 1) {
              r.muse = roundAmount(r.muse - 1);
              outputs = { ...outputs };
              for (const [res, n] of Object.entries(saving.extra)) outputs[res] = (outputs[res] ?? 0) + n;
            }
          }
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
            for (const [res, n] of Object.entries(inputs)) {
              consumed[res] = (consumed[res] ?? 0) + n;
            }
          }
        } else if (!r.paused) {
          r.prodTicks = ticksOfCycle;
          r.paused = true;
          changed = true;
          if (emit) this.events.push({ kind: 'paused', uid: r.uid });
        }
      }
    }
    return { changed, produced, consumed };
  }

  // Vitesse des producteurs à portée d'une Cloche qui sonne : Map uid → vitesse (la plus forte, sans
  // cumul), ou null si aucune ne sonne.
  #speeds(producers, bells) {
    let out = null;
    for (const bell of bells) {
      if (!(bell.ring > 0)) continue;
      const { radius, speed } = bellStats(bell);
      out ??= new Map();
      for (const r of producers) {
        const dist = gapBetween(bell, r);
        if (dist >= 1 && dist <= radius) out.set(r.uid, Math.max(out.get(r.uid) ?? 1, speed));
      }
    }
    return out;
  }

  // Charge et sonnerie des Cloches sur `n` ticks. → vrai si l'une est devenue chargée ou a fini de sonner.
  #advanceBells(bells, n, emit) {
    let changed = false;
    for (const b of bells) {
      const { chargeTicks } = bellStats(b);
      const wasReady = isBellReady(b);
      b.charge = Math.min((b.charge ?? 0) + n, chargeTicks);
      const wasRinging = b.ring > 0;
      b.ring = Math.max(0, (b.ring ?? 0) - n);
      const endedRing = wasRinging && b.ring === 0;
      if (endedRing && emit) this.events.push({ kind: 'rungEnd', uid: b.uid });
      if (endedRing || (!wasReady && isBellReady(b))) {
        changed = true;
        if (emit && isBellReady(b)) this.events.push({ kind: 'bellReady', uid: b.uid });
      }
    }
    return changed;
  }

  // Entrées par cycle de chaque producteur : Map uid → { [res]: n }, réduites par un Scriptorium
  // (arrondi au-dessus : les entrées restent entières).
  #inputsOf(producers) {
    const savings = this.savings();
    return new Map(producers.map((r) => {
      const scale = savings.get(r.uid)?.inputScale ?? 1;
      const inputs = {};
      for (const [res, n] of Object.entries(PRODUCTION[r.type].inputs)) inputs[res] = scale < 1 ? Math.ceil(n * scale - 1e-9) : n;
      return [r.uid, inputs];
    }));
  }

  // Sorties par cycle de chaque producteur : Map uid → { [res]: n }. Le bonus de palier
  // s'applique aussi au renfort d'aura.
  #outputsOf(producers) {
    const boosts = this.boosts();
    return new Map(producers.map((r) => {
      const outputs = { ...PRODUCTION[r.type].outputs };
      for (const [res, n] of Object.entries(levelStats(r.type, levelOf(r)).outputBonus || {})) outputs[res] = (outputs[res] ?? 0) + n;
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
