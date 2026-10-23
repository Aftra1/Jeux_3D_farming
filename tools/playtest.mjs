// Simulateur d'équilibrage : joue des parties complètes en accéléré avec le moteur réel
// (js/sim/simulation.js, js/story/journal.js, js/balance.js), du début au 5e palier du Phare,
// puis, la fin vue, jusqu'à la dernière missive du chapitre II (Embarcadères et Reliques).
// Ne modifie rien : lit balance.js, écrit seulement tools/playtest-report.md.
//
//   node tools/playtest.mjs
//
// Le joueur décide une fois par seconde de jeu (il achète tant qu'une action lui convient).
// « Attente » = temps pendant lequel AUCUN achat n'est possible (aucun bâtiment débloqué
// abordable avec une place libre, aucun palier abordable). Au-delà de WAIT_ALERT_SECONDS,
// l'attente est signalée. « Pause » = temps entre deux achats du profil (il peut choisir
// d'épargner alors qu'un achat est possible) : donnée indicative, sans alerte.

import { writeFileSync } from 'node:fs';
import { BALANCE } from '../js/balance.js';
import { GRID } from '../js/config.js';
import { Simulation, levelOf } from '../js/sim/simulation.js';
import { Journal } from '../js/story/journal.js';
import { MISSIVES } from '../js/story/missives.js';
import { Terrain } from '../js/grid/terrain.js';
import { ISLAND_IDS } from '../js/world/islands.js';

const WAIT_ALERT_SECONDS = 5 * 60;
const CHAPTER1_TARGET = [45 * 60, 75 * 60]; // profil équilibré
const MAX_SECONDS = 12 * 3600;   // garde-fou : partie abandonnée au-delà
const DOCK = 'embarcadere';
const TPS = BALANCE.ticksPerSecond;
const B = BALANCE.buildings;
const LIGHTHOUSE = 'lighthouse';
const STAGES = B[LIGHTHOUSE].stages.length;
const RES = Object.keys(BALANCE.resources);

// ---------- Terrain sans Three.js : occupation des cases, mêmes refus que BuildingManager ----------

class Registry {
  constructor(size = GRID.size) {
    this.terrain = new Terrain(size); // domaine + îlots (ouverts une fois ralliés)
    this.records = [];
    this.nextUid = 1;
  }
  canPlace(type, x, z) {
    const { w, d } = B[type].footprint;
    const problem = this.terrain.footprintProblem(x, z, w, d);
    return problem ? { ok: false, reason: problem } : { ok: true };
  }
  place(type, x, z, extra = {}) {
    if (!this.canPlace(type, x, z).ok) return null;
    const record = { uid: this.nextUid++, type, x, z, rotation: 0, ...extra };
    const { w, d } = B[type].footprint;
    for (const tile of this.terrain.footprintTiles(x, z, w, d)) tile.occupant = record.uid;
    this.records.push(record);
    return record;
  }
  // Même contrat que BuildingManager (réserve du Phare, règle `edge`, îlots ralliés).
  hasFreeArea(footprint, except) {
    return this.terrain.hasFreeArea(footprint, except);
  }
  touchesEdge(x, z, w, d) {
    return this.terrain.touchesEdge(x, z, w, d);
  }
  setOpenIslands(ids) {
    this.terrain.setOpenIslands(ids);
  }
  freeSpots(type) {
    const { w, d } = B[type].footprint;
    return [...this.terrain.freeOrigins(w, d)];
  }
}

function rng(seed) { // mulberry32, comme textures.js : parties reproductibles
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- Modèle de débit (pour juger si un achat rapproche l'objectif) ----------

// Débit net par seconde de chaque ressource, d'après les bâtiments posés (niveaux, auras et paliers compris,
// lus dans le moteur : sim.cycles). Les consommateurs sont ralentis si leur entrée manque (comme les
// pauses du moteur). L'Embarcadère amélioré compte pour sa chance moyenne de cycle double.
function rates(sim) {
  const gross = Object.fromEntries(RES.map((r) => [r, 0]));
  const consumers = [];
  for (const [uid, c] of sim.cycles()) {
    const r = sim.buildings.records.find((x) => x.uid === uid);
    const perSec = 1 / c.seconds;
    const outputs = Object.fromEntries(Object.entries(c.outputs).map(([res, n]) => [res, n * (1 + c.chance)]));
    if (Object.keys(c.inputs).length) consumers.push({ r, p: { inputs: c.inputs, outputs }, perSec });
    else for (const [res, n] of Object.entries(outputs)) gross[res] += n * perSec;
  }
  // Chaîne : un consommateur n'est résolu qu'une fois produites ses entrées par d'autres
  // consommateurs (Observatoire → Présages → Embarcadère). Ralenti si l'entrée manque.
  const net = { ...gross };
  let todo = consumers;
  while (todo.length) {
    const pending = new Set(todo.flatMap(({ p }) => Object.keys(p.outputs)));
    let ready = todo.filter(({ r, p }) => Object.keys(p.inputs).every((res) => !pending.has(res)
      || todo.every((o) => !Object.hasOwn(o.p.outputs, res) || o.r.type === r.type)));
    if (!ready.length) ready = todo;
    const need = {};
    for (const { p, perSec } of ready) for (const [res, n] of Object.entries(p.inputs)) need[res] = (need[res] ?? 0) + n * perSec;
    const avail = { ...net };
    for (const c of ready) {
      const f = Math.min(1, ...Object.keys(c.p.inputs).map((res) => (need[res] ? Math.max(0, avail[res]) / need[res] : 1)));
      for (const [res, n] of Object.entries(c.p.inputs)) net[res] -= n * c.perSec * f;
      for (const [res, n] of Object.entries(c.p.outputs)) net[res] += n * c.perSec * f;
    }
    todo = todo.filter((c) => !ready.includes(c));
  }
  return net;
}

// Secondes avant de pouvoir payer `cost` au débit `rate` (Infinity si jamais).
function timeTo(cost, have, rate) {
  let t = 0;
  for (const [res, n] of Object.entries(cost)) {
    const lack = n - (have[res] ?? 0);
    if (lack <= 0) continue;
    if (!(rate[res] > 1e-9)) return Infinity;
    t = Math.max(t, lack / rate[res]);
  }
  return t;
}

const sub = (have, cost) => {
  const out = { ...have };
  for (const [res, n] of Object.entries(cost)) out[res] = (out[res] ?? 0) - n;
  return out;
};

// ---------- Profils ----------
// placeLibrary / placeSmall : choix de l'emplacement ; sanctuaryMinGain : Bibliothèques
// nouvellement renforcées exigées pour un Sanctuaire « de confort » ; greedy : achète tout
// ce qu'il peut, sinon seulement ce qui rapproche l'objectif en cours ; obsPerLibrary :
// nombre d'Observatoires visé par Bibliothèque.

// Réseau optimisé : Bibliothèques tous les 3 cases, Sanctuaire au croisement des allées
// (4 Bibliothèques renforcées chacun). Le coin bas-droit est laissé au Phare.
const CELLS = Math.floor((GRID.size + 1) / 3);
const LATTICE = [];
for (let j = 0; j < CELLS; j++) for (let i = 0; i < CELLS; i++) if (!(i === CELLS - 1 && j === CELLS - 1)) LATTICE.push([3 * i, 3 * j]);
const LIGHTHOUSE_SPOT = [3 * (CELLS - 1), 3 * (CELLS - 1)];

const PROFILES = {
  prudent: {
    label: 'prudent',
    summary: 'achète dès qu\'il peut ; emplacements au hasard ; Sanctuaire seulement pour une missive ; une fois sur trois, améliore plutôt que de bâtir',
    greedy: true, obsPerLibrary: 1 / 3, sanctuaryMinGain: Infinity, sanctuaryBest: false, lattice: false,
    upgradeShare: 0.3,
  },
  equilibre: {
    label: 'équilibré',
    summary: 'achète si cela rapproche l\'objectif (en acceptant 15 % de détour) ; Bibliothèques en rangées ; Sanctuaire au meilleur endroit s\'il en renforce 2 ; rallie chaque îlot dès qu\'il peut ; améliore quand cela rapproche l\'objectif aussi bien qu\'une construction',
    greedy: false, slack: 1.15, obsPerLibrary: 0.4, sanctuaryMinGain: 2, sanctuaryBest: true, lattice: false,
    islands: true, upgrades: true,
  },
  equilibreVisiteurs: {
    label: 'équilibré + visiteurs',
    summary: 'équilibré, et attrape chaque Visiteur du lac 5 s après son apparition (intervalles et cadeaux de balance.js)',
    greedy: false, slack: 1.15, obsPerLibrary: 0.4, sanctuaryMinGain: 2, sanctuaryBest: true, lattice: false,
    visitors: true, islands: true, upgrades: true,
  },
  optimiseur: {
    label: 'optimiseur',
    summary: 'achète seulement si cela rapproche l\'objectif ; Bibliothèques en réseau autour des Sanctuaires (4 renforcées chacun) ; améliore dès que cela rapproche l\'objectif',
    greedy: false, slack: 1, obsPerLibrary: 0.5, sanctuaryMinGain: 3, sanctuaryBest: true, lattice: true,
    upgrades: true,
  },
};

// ---------- Partie ----------

function play(profile, seed = 7) {
  const random = rng(seed);
  const reg = new Registry();
  const journal = new Journal();
  // La fin est vue dès le palier 5 (la séquence ne coûte aucun temps de simulation).
  const story = { get missives() { return journal.missives; }, finished: false };
  const sim = new Simulation(reg, story);
  let t = 0;
  const milestones = []; // { label, t }
  const purchases = [];  // { t, what }
  const mark = (label) => milestones.push({ label, t });
  let missivesDone = 0;
  let lastPurchase = 0;
  const pauses = [];     // entre deux achats du profil : { from, to, seconds, next, binding, rate }
  const waits = [];      // sans aucun achat possible : { from, to, seconds, next, binding, rate }
  let blockedSince = null;

  // Premier achat possible (bâtiment débloqué, abordable, avec une place permise ; ou palier), sinon null.
  function anyPurchase() {
    const lh = lighthouse();
    if (lh) {
      const cost = sim.nextStageCost(lh.uid);
      if (cost && Object.entries(cost).every(([res, n]) => sim.resources[res] >= n)) return `Phare palier ${lh.stage + 1}`;
    }
    if (profile.islands) {
      const id = ISLAND_IDS.find((i) => sim.canRally(i).ok);
      if (id) return `Îlot ${sim.islands.length + 1}`;
    }
    for (const type of Object.keys(B)) {
      if (!sim.isUnlocked(type) || (B[type].unique && sim.countOf(type)) || !sim.canAfford(type)) continue;
      if (keepLighthouseRoom(type, reg.freeSpots(type)).length) return type;
    }
    if (profile.upgrades || profile.upgradeShare) {
      const up = upgrades().find((a) => affordable(a));
      if (up) return `Amélioration (${up.type})`;
    }
    return null;
  }

  // Coût d'une action (pose ou amélioration) et possibilité de la payer maintenant.
  const costOfAction = (a) => (a.kind === 'upgrade' ? sim.upgradeCost(a.uid) : sim.costOf(a.type));
  const affordable = (a) => Object.entries(costOfAction(a)).every(([res, n]) => sim.resources[res] >= n);

  // Améliorations possibles : une par type, le bâtiment le moins avancé (puis le plus ancien).
  function upgrades() {
    const out = [];
    for (const type of Object.keys(B)) {
      if (!B[type].upgrade) continue;
      const target = reg.records.filter((r) => r.type === type && sim.upgradeCost(r.uid))
        .sort((a, b) => levelOf(a) - levelOf(b) || a.uid - b.uid)[0];
      if (target) out.push({ kind: 'upgrade', type, uid: target.uid });
    }
    return out;
  }

  const lighthouse = () => reg.records.find((r) => r.type === LIGHTHOUSE) || null;

  // Emplacement selon le profil (null si aucun).
  function spotFor(type) {
    if (type === LIGHTHOUSE) {
      if (profile.lattice && reg.canPlace(type, ...LIGHTHOUSE_SPOT).ok) return LIGHTHOUSE_SPOT;
      const spots = reg.freeSpots(type);
      return spots.length ? (profile.greedy ? spots[Math.floor(random() * spots.length)] : spots.at(-1)) : null;
    }
    if (type === 'library' && profile.lattice) {
      const spot = LATTICE.find(([x, z]) => reg.canPlace(type, x, z).ok && sim.leavesRoom(type, x, z));
      if (spot) return spot;
    }
    if (type === 'sanctuary' && profile.sanctuaryBest) return bestSanctuary()?.spot ?? null;
    if (type === DOCK) {
      const spots = keepLighthouseRoom(type, reg.freeSpots(type));
      return spots.length ? (profile.greedy ? spots[Math.floor(random() * spots.length)] : spots[0]) : null;
    }
    let spots = keepLighthouseRoom(type, reg.freeSpots(type));
    if (profile.lattice) {
      // Optimiseur : garde les croisements du réseau pour les Sanctuaires et le coin du Phare.
      const keep = (x, z) => (x % 3 === 2 && z % 3 === 2) || (!lighthouse() && x >= LIGHTHOUSE_SPOT[0] - 1 && z >= LIGHTHOUSE_SPOT[1] - 1);
      const filtered = spots.filter(([x, z]) => !keep(x, z));
      if (filtered.length) spots = filtered;
    }
    if (!spots.length) return null;
    return profile.greedy ? spots[Math.floor(random() * spots.length)] : spots[0];
  }

  // Le jeu refuse toute pose qui ne laisserait plus de place au Phare (sim.leavesRoom), et
  // l'Embarcadère hors du bord du terrain (sim.touchesEdge).
  function keepLighthouseRoom(type, spots) {
    return spots.filter(([x, z]) => sim.leavesRoom(type, x, z) && sim.touchesEdge(type, x, z));
  }

  // Meilleur emplacement de Sanctuaire : le plus de Bibliothèques non encore renforcées.
  function bestSanctuary() {
    const boosted = sim.boosts();
    let best = null;
    for (const [x, z] of keepLighthouseRoom('sanctuary', reg.freeSpots('sanctuary'))) {
      const gain = sim.wouldBoost('sanctuary', x, z).filter((r) => !boosted.has(r.uid)).length;
      if (!best || gain > best.gain) best = { spot: [x, z], gain };
    }
    return best;
  }

  // Objectif en cours (missive) → { cost, buy } : buy = achat direct exigé par la missive.
  function goal() {
    const m = MISSIVES[journal.missives];
    if (!m) return null;
    const c = m.condition;
    if (c.kind === 'stage') {
      const lh = lighthouse();
      if (!lh) return { cost: sim.costOf(LIGHTHOUSE), buy: { kind: 'place', type: LIGHTHOUSE } };
      return { cost: sim.nextStageCost(lh.uid), buy: { kind: 'elevate', uid: lh.uid } };
    }
    if (c.kind === 'earned') return { earn: { res: c.resource, amount: c.count } };
    if (c.kind === 'boosted') {
      // Renforcer : un Sanctuaire là où il touche le plus de Bibliothèques, ou une Bibliothèque de plus.
      if (sim.isUnlocked('sanctuary')) return { cost: sim.costOf('sanctuary'), buy: { kind: 'place', type: 'sanctuary', force: true } };
    }
    const type = c.kind === 'built' ? c.type : 'library';
    const missing = sim.missingUnlocks(type).find((x) => x.type);
    const next = missing ? missing.type : type;
    return { cost: sim.costOf(next), buy: { kind: 'place', type: next } };
  }

  function perform(action) {
    if (action.kind === 'elevate') {
      if (!sim.elevate(action.uid).ok) return false;
      const stage = lighthouse().stage;
      purchases.push({ t, what: `Phare palier ${stage}` });
      mark(`Phare palier ${stage}`);
      return true;
    }
    if (action.kind === 'upgrade') {
      const level = levelOf(reg.records.find((r) => r.uid === action.uid));
      if (!sim.upgrade(action.uid).ok) return false;
      purchases.push({ t, what: `Amélioration (${action.type})`, upgrade: action.type, level: level + 1 });
      return true;
    }
    let spot = spotFor(action.type);
    if (action.type === 'sanctuary' && action.force && !profile.sanctuaryBest) {
      const spots = keepLighthouseRoom('sanctuary', reg.freeSpots('sanctuary'));
      spot = spots.length ? spots[Math.floor(random() * spots.length)] : null;
    }
    if (!spot || !sim.placeBuilding(action.type, ...spot)) return false;
    purchases.push({ t, what: action.type, build: action.type });
    const n = sim.countOf(action.type);
    if (n === 1 && action.type !== 'library') mark(action.type === LIGHTHOUSE ? 'Phare palier 1' : `Premier ${action.type}`);
    if (action.type === DOCK) mark(`Embarcadère ${n}`);
    return true;
  }

  // Actions d'expansion candidates (hors objectif direct).
  function expansions() {
    const out = [];
    const libs = sim.countOf('library');
    if (spotFor('library')) out.push({ kind: 'place', type: 'library' });
    if (sim.isUnlocked('observatory') && sim.countOf('observatory') < Math.ceil(libs * profile.obsPerLibrary)
        && spotFor('observatory')) out.push({ kind: 'place', type: 'observatory' });
    if (sim.isUnlocked(DOCK) && spotFor(DOCK)) out.push({ kind: 'place', type: DOCK });
    if (sim.isUnlocked('sanctuary') && Number.isFinite(profile.sanctuaryMinGain)) {
      const best = bestSanctuary();
      if (best && best.gain >= profile.sanctuaryMinGain) out.push({ kind: 'place', type: 'sanctuary' });
    }
    if (profile.upgrades) out.push(...upgrades());
    return out;
  }

  // Débit si l'on faisait cette action (pose à l'emplacement réel du profil, ou niveau de plus), auras comprises.
  function ratesWith(action) {
    if (action.kind === 'upgrade') {
      const record = reg.records.find((r) => r.uid === action.uid);
      record.level = levelOf(record) + 1;
      try {
        return rates(sim);
      } finally {
        record.level--;
      }
    }
    const spot = spotFor(action.type);
    if (!spot) return null;
    const ghost = { uid: -1, type: action.type, x: spot[0], z: spot[1], rotation: 0, prodTicks: 0, paused: false,
      ...(B[action.type].upgrade ? { level: 1 } : {}) };
    reg.records.push(ghost);
    try {
      return rates(sim);
    } finally {
      reg.records.pop();
    }
  }

  // Profil prudent : le premier achat possible, mais une fois sur trois (`upgradeShare`) une amélioration si une est abordable.
  function pickGreedy(options) {
    const ups = profile.upgradeShare ? upgrades().filter(affordable) : [];
    if (ups.length && random() < profile.upgradeShare) return ups[0];
    return options.find((a) => a.kind !== 'upgrade') ?? null;
  }

  // Objectif « gagner N Reliques » : épargner pour un Embarcadère de plus s'il fait finir plus tôt
  // (l'objectif devient alors son coût), sinon tout achat qui accélère les Reliques.
  function chooseEarn({ res, amount }) {
    const lack = amount - sim.earned[res];
    if (lack <= 0) return null;
    const rate = rates(sim);
    const now = rate[res] > 1e-9 ? lack / rate[res] : Infinity;
    const dock = { kind: 'place', type: DOCK };
    const withDock = spotFor(DOCK) && ratesWith(dock);
    if (withDock) {
      const wait = timeTo(sim.costOf(DOCK), sim.resources, rate);
      const later = Math.max(0, lack - (rate[res] ?? 0) * wait);
      if (withDock[res] > 1e-9 && wait + later / withDock[res] < now) return chooseFor({ cost: sim.costOf(DOCK), buy: dock });
    }
    const options = expansions().filter((a) => (a.kind === 'upgrade' || a.type !== DOCK) && affordable(a));
    if (profile.greedy) return pickGreedy(options);
    let best = null;
    for (const a of options) {
      const r = ratesWith(a);
      const after = r && r[res] > 1e-9 ? lack / r[res] : Infinity;
      if (after < now && (!best || after < best.after)) best = { a, after };
    }
    return best?.a ?? null;
  }

  function choose() {
    const g = goal();
    if (!g) return null;
    if (g.earn) return chooseEarn(g.earn);
    return chooseFor(g);
  }

  function chooseFor(g) {
    if (g.cost && sim.canPlace && Object.entries(g.cost).every(([res, n]) => sim.resources[res] >= n)) return g.buy;
    if (!g.cost || !Object.keys(g.cost).length) return g.buy; // gratuit (première Bibliothèque)
    const options = expansions().filter(affordable);
    if (!options.length) return null;
    if (profile.greedy) return pickGreedy(options);
    // Achat utile si l'objectif est atteint plus tôt (ou à peine plus tard, `slack`) après l'achat.
    const now = timeTo(g.cost, sim.resources, rates(sim));
    let best = null;
    for (const a of options) {
      const r = ratesWith(a);
      if (!r) continue;
      const after = timeTo(g.cost, sub(sim.resources, costOfAction(a)), r);
      if (after <= now * profile.slack && (!best || after < best.after)) best = { a, after };
    }
    return best?.a ?? null;
  }

  function binding() {
    let g = goal();
    if (g?.earn) g = { cost: sim.costOf(DOCK) };
    if (!g?.cost) return null;
    const r = rates(sim);
    let worst = null;
    for (const [res, n] of Object.entries(g.cost)) {
      const lack = n - sim.resources[res];
      if (lack <= 0) continue;
      const time = r[res] > 1e-9 ? lack / r[res] : Infinity;
      if (!worst || time > worst.time) worst = { res, time, rate: r[res] };
    }
    return worst;
  }

  // Visiteurs du lac (profil `visitors`) : même règle que le jeu, le délai suivant part de
  // la disparition (ici : la capture, CATCH_DELAY secondes après l'apparition).
  const CATCH_DELAY = 5;
  const V = BALANCE.visitors;
  const visitorRandom = rng(seed + 1);
  const nextDelay = () => V.intervalSeconds.min + visitorRandom() * (V.intervalSeconds.max - V.intervalSeconds.min);
  let visitorAt = nextDelay() + CATCH_DELAY;
  const gifts = { count: 0, knowledge: 0, omens: 0 };

  let waitInfo = null; // ressource limitante au début de l'attente
  let finishedAt = null; // fin du chapitre I (palier 5 : séquence de fin vue)
  // Fin du chapitre II : dernière missive, et tous les îlots ralliés pour un profil qui les rallie.
  const done = () => journal.missives >= MISSIVES.length && (!profile.islands || sim.islands.length >= ISLAND_IDS.length);
  while (t < MAX_SECONDS && !done()) {
    if (finishedAt === null && (lighthouse()?.stage ?? 0) >= STAGES) {
      finishedAt = t;
      story.finished = true;
    }
    let bought = false;
    // Îlots : ralliés dès que possible (ils ne coûtent que des Reliques, que rien d'autre ne dépense).
    for (const id of profile.islands ? ISLAND_IDS : []) {
      if (!sim.rallyIsland(id).ok) continue;
      purchases.push({ t, what: `Îlot ${sim.islands.length}` });
      mark(`Îlot ${sim.islands.length}`);
      bought = true;
      journal.update(sim.earned, sim);
    }
    for (let guard = 0; guard < 50; guard++) {
      const action = choose();
      if (!action || !perform(action)) break;
      bought = true;
      journal.update(sim.earned, sim);
      while (missivesDone < journal.missives) mark(`Missive ${++missivesDone}`);
    }
    if (bought) {
      const seconds = t - lastPurchase;
      if (seconds > 0) pauses.push({ from: lastPurchase, to: t, seconds, next: purchases.at(-1).what, ...(waitInfo || {}) });
      lastPurchase = t;
      waitInfo = null;
    } else if (!waitInfo) {
      const b = binding();
      waitInfo = b ? { binding: b.res, rate: b.rate } : {};
    }
    const possible = bought ? purchases.at(-1).what : anyPurchase();
    if (!possible && blockedSince === null) {
      const b = binding();
      blockedSince = { from: t, ...(b ? { binding: b.res, rate: b.rate } : {}) };
    } else if (possible && blockedSince !== null) {
      waits.push({ ...blockedSince, to: t, seconds: t - blockedSince.from, next: possible });
      blockedSince = null;
    }
    if (profile.visitors && t >= visitorAt) {
      for (const [res, n] of Object.entries(sim.catchVisitor(visitorRandom))) gifts[res] += n;
      gifts.count++;
      visitorAt = t + nextDelay() + CATCH_DELAY;
    }
    sim.advance(1);
    t++;
    journal.update(sim.earned, sim);
    while (missivesDone < journal.missives) mark(`Missive ${++missivesDone}`);
  }
  const finished = finishedAt !== null;
  const doneAt = done() ? t : null;
  waits.sort((a, b) => b.seconds - a.seconds);
  pauses.sort((a, b) => b.seconds - a.seconds);
  const inChapter2 = (w) => finishedAt !== null && w.from >= finishedAt;
  const waits2 = waits.filter(inChapter2);
  return {
    profile, t: finishedAt ?? t, finished, finishedAt, doneAt, milestones, purchases, gifts,
    waits: waits.filter((w) => !inChapter2(w)), pauses: pauses.filter((w) => !inChapter2(w)), waits2,
    counts: Object.fromEntries(Object.keys(B).map((k) => [k, sim.countOf(k)])), islands: sim.islands.length,
    boosted: sim.boostedCountOf('library'),
  };
}

// ---------- Rapport ----------

const fmt = (s) => {
  if (s === undefined || s === null) return '—';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.round(s % 60);
  return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min ${String(sec).padStart(2, '0')}`;
};
const RES_NAMES = { knowledge: 'Savoirs', omens: 'Présages', relics: 'Reliques' };
const TYPE_NAMES = { library: 'Bibliothèque', observatory: 'Observatoire', sanctuary: 'Sanctuaire', lighthouse: 'Phare',
  embarcadere: 'Embarcadère' };
const nameOf = (what) => TYPE_NAMES[what] ?? what; // « Îlot n » tel quel

const results = Object.values(PROFILES).map((p) => play(p));

// Jalons communs, dans l'ordre : missives, premier Observatoire, premier Sanctuaire, paliers.
const ROWS = [
  ...MISSIVES.filter((m) => !m.chapter).map((m, i) => ({ key: `Missive ${i + 1}`, label: `Missive ${i + 1} · ${m.short}` })),
  { key: 'Premier observatory', label: 'Premier Observatoire' },
  { key: 'Premier sanctuary', label: 'Premier Sanctuaire' },
  ...Array.from({ length: STAGES }, (_, i) => ({ key: `Phare palier ${i + 1}`, label: `Phare palier ${i + 1}` })),
];
const at = (res, key) => res.milestones.find((m) => m.label === key)?.t;

function table(headers, rows) {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
  const line = (cells) => cells.map((c, i) => String(c).padEnd(widths[i])).join('  ');
  const term = [line(headers), widths.map((w) => '─'.repeat(w)).join('  '), ...rows.map(line)].join('\n');
  const md = [`| ${headers.join(' | ')} |`, `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');
  return { term, md };
}

const milestoneTable = table(
  ['Jalon', ...results.map((r) => r.profile.label)],
  ROWS.map((row) => [row.label, ...results.map((r) => fmt(at(r, row.key)))]),
);

const waitRows = [];
for (const r of results) {
  for (const w of r.waits.slice(0, 3)) {
    waitRows.push([r.profile.label, fmt(w.seconds), `${fmt(w.from)} → ${fmt(w.to)}`, nameOf(w.next),
      w.binding ? `${RES_NAMES[w.binding]} (${w.rate.toFixed(2)}/s)` : '—',
      w.seconds > WAIT_ALERT_SECONDS ? '⚠ > 5 min' : '']);
  }
}
const waitTable = table(['Profil', 'Attente', 'Période', 'Premier achat possible', 'Ressource limitante', 'Alerte'], waitRows);

const pauseTable = table(['Profil', 'Pause', 'Période', 'Achat suivant', 'Ressource limitante'],
  results.flatMap((r) => r.pauses.slice(0, 1).map((w) => [r.profile.label, fmt(w.seconds),
    `${fmt(w.from)} → ${fmt(w.to)}`, nameOf(w.next), w.binding ? `${RES_NAMES[w.binding]} (${w.rate.toFixed(2)}/s)` : '—'])));

// ---------- Chapitre II : depuis la fin vue (palier 5) jusqu'à la dernière missive ----------

const CHAPTER2_TARGET = [30 * 60, 45 * 60];
const ch2Rows = MISSIVES.map((m, i) => ({ m, i })).filter(({ m }) => m.chapter === 2)
  .map(({ m, i }) => [`Missive ${i + 1} · ${m.short}`, ...results.map((r) => {
    const at2 = at(r, `Missive ${i + 1}`);
    return at2 === undefined || r.finishedAt === null ? '—' : `+${fmt(at2 - r.finishedAt)}`;
  })]);
for (let n = 1; n <= 4; n++) {
  ch2Rows.push([`Embarcadère ${n}`, ...results.map((r) => {
    const t2 = at(r, `Embarcadère ${n}`);
    return t2 === undefined || r.finishedAt === null ? '—' : `+${fmt(t2 - r.finishedAt)}`;
  })]);
}
for (let n = 1; n <= ISLAND_IDS.length; n++) {
  ch2Rows.push([`Îlot ${n} rallié`, ...results.map((r) => {
    const t2 = at(r, `Îlot ${n}`);
    return t2 === undefined || r.finishedAt === null ? '—' : `+${fmt(t2 - r.finishedAt)}`;
  })]);
}
const ch2Table = table(['Jalon (depuis la fin)', ...results.map((r) => r.profile.label)], ch2Rows);
const ch2Waits = results.flatMap((r) => r.waits2.slice(0, 3).map((w) => [r.profile.label, fmt(w.seconds),
  `+${fmt(w.from - r.finishedAt)} → +${fmt(w.to - r.finishedAt)}`, nameOf(w.next),
  w.binding ? `${RES_NAMES[w.binding]} (${w.rate.toFixed(2)}/s)` : '—', w.seconds > WAIT_ALERT_SECONDS ? '⚠ > 5 min' : '']));
const ch2WaitTable = table(['Profil', 'Attente', 'Période', 'Premier achat possible', 'Ressource limitante', 'Alerte'],
  ch2Waits.length ? ch2Waits : [['—', '—', '—', '—', '—', '']]);
const ch2Lines = results.map((r) => {
  if (r.doneAt === null) return `- **${r.profile.label}** : chapitre II **inachevé**.`;
  const d = r.doneAt - r.finishedAt;
  const ok = d >= CHAPTER2_TARGET[0] && d <= CHAPTER2_TARGET[1];
  const long = r.waits2.filter((w) => w.seconds > WAIT_ALERT_SECONDS).length;
  return `- **${r.profile.label}** : chapitre II en **${fmt(d)}**${r.profile === PROFILES.equilibre ? (ok ? ' ✓ (cible 30–45 min)' : ' ⚠ hors cible 30–45 min') : ''}`
    + ` ; ${r.counts[DOCK]} Embarcadères${r.profile.islands ? ` ; ${r.islands} îlots ralliés (fin = dernière missive et 3 îlots)` : ''} ; ${long ? `⚠ ${long} attente(s) > 5 min` : 'aucune attente > 5 min'}.`;
});

// ---------- Constructions et améliorations (hors paliers du Phare et ralliements d'îlots) ----------

function shares(r) {
  const out = [1, 2].map(() => ({ builds: 0, upgrades: 0, byType: {} }));
  for (const p of r.purchases) {
    const part = out[r.finishedAt !== null && p.t >= r.finishedAt ? 1 : 0];
    if (p.build) part.builds++;
    if (p.upgrade) {
      part.upgrades++;
      part.byType[p.upgrade] = (part.byType[p.upgrade] ?? 0) + 1;
    }
  }
  return out;
}
const pct = (u, b) => (u + b ? `${Math.round((100 * u) / (u + b))} %` : '—');
const byType = (o) => Object.entries(o).map(([t, n]) => `${nameOf(t)} ${n}`).join(', ') || '—';
const shareRows = results.flatMap((r) => shares(r).map((part, i) => [r.profile.label, i === 0 ? 'I' : 'II', part.builds, part.upgrades,
  pct(part.upgrades, part.builds), byType(part.byType)]));
const shareTable = table(['Profil', 'Chapitre', 'Constructions', 'Améliorations', 'Part d\'améliorations', 'Améliorations par type'], shareRows);

const alerts = results.flatMap((r) => r.waits.filter((w) => w.seconds > WAIT_ALERT_SECONDS).map((w) => ({ ...w, profile: r.profile.label })));

// ---------- Propositions (rien n'est modifié : chiffres à reporter à la main dans balance.js) ----------

function proposals() {
  if (!alerts.length) return ['Aucune attente de plus de 5 minutes : aucun ajustement nécessaire.'];
  const out = [];
  // 1. Le palier le plus long à attendre : baisser son coût dans la ressource limitante.
  const stageWaits = alerts.filter((w) => w.next.startsWith('Phare palier'));
  if (stageWaits.length) {
    const worst = stageWaits.reduce((a, b) => (b.seconds > a.seconds ? b : a));
    const stage = Number(worst.next.split(' ').pop());
    const res = worst.binding ?? 'knowledge';
    const cost = B[LIGHTHOUSE].stages[stage - 1].cost[res];
    const cut = Math.ceil(((worst.seconds - WAIT_ALERT_SECONDS) * (worst.rate || 0)) / 10) * 10;
    const target = Math.max(Math.round(cost * 0.5), cost - cut);
    out.push(`**Phare, palier ${stage}** (attente la plus longue : ${fmt(worst.seconds)}, profil ${worst.profile}) : `
      + `\`lighthouse.stages[${stage - 1}].cost.${res}\` ${cost} → **${target}** (−${Math.round((1 - target / cost) * 100)} %), `
      + `soit environ ${fmt(Math.max(0, worst.seconds - (cost - target) / (worst.rate || Infinity)))} d'attente au débit observé.`);
  }
  // 2. Présages : si ce sont eux qui limitent, raccourcir le cycle de l'Observatoire.
  const omenWaits = alerts.filter((w) => w.binding === 'omens');
  const obs = B.observatory.production.intervalSeconds;
  if (omenWaits.length) {
    const share = Math.round((omenWaits.length / alerts.length) * 100);
    out.push(`**Observatoire** (Présages limitants dans ${share} % des attentes signalées) : `
      + `\`observatory.production.intervalSeconds\` ${obs} → **${obs - 1}** (+${Math.round((obs / (obs - 1) - 1) * 100)} % de Présages, `
      + `consommation de Savoirs augmentée d'autant).`);
  } else {
    out.push(`**Bibliothèque** (Savoirs limitants) : \`library.production.intervalSeconds\` 2 → **1.6** (+25 % de Savoirs), `
      + 'ce qui raccourcit d\'autant les attentes en Savoirs.');
  }
  // 3. Renfort par palier du Phare : accélère la fin de partie sans toucher au début.
  const pct = B[LIGHTHOUSE].stageBoost.percent;
  const late = alerts.filter((w) => /palier [3-5]/.test(w.next)).length;
  out.push(`**Renfort du Phare** (${late} attente(s) signalée(s) aux paliers 3 à 5) : \`lighthouse.stageBoost.percent\` ${pct} → **${pct + 5}** `
    + `(+${pct + 5} % par palier, soit +${(pct + 5) * 4} % au palier 4 au lieu de +${pct * 4} %), pour que chaque palier rapproche nettement le suivant.`);
  return out;
}

const summaryLines = results.map((r) => `- **${r.profile.label}** (${r.profile.summary}) : `
  + `${r.finished ? `Phare achevé en **${fmt(r.t)}**` : `**inachevé** après ${fmt(r.t)}`}`
  + `${r.profile === PROFILES.equilibre ? (r.t >= CHAPTER1_TARGET[0] && r.t <= CHAPTER1_TARGET[1] ? ' ✓ (cible 45–75 min)' : ' ⚠ hors cible 45–75 min') : ''} ; `
  + `${r.purchases.length} achats ; fin : ${r.counts.library} Bibliothèques (${r.boosted} renforcées), `
  + `${r.counts.observatory} Observatoires, ${r.counts.sanctuary} Sanctuaires.`);

const alertLines = alerts.length
  ? alerts.sort((a, b) => b.seconds - a.seconds).map((w) => `- ⚠ ${w.profile} : ${fmt(w.seconds)} sans achat possible `
    + `(${fmt(w.from)} → ${fmt(w.to)}), en attendant : ${nameOf(w.next)}${w.binding ? `, limité par les ${RES_NAMES[w.binding]}` : ''}.`)
  : ['- Aucune attente de plus de 5 minutes.'];

const props = proposals();

// Effet des Visiteurs : durée totale du profil équilibré avec et sans eux (baisse tolérée : 10 %).
const VISITOR_MAX_DROP = 0.1;
const base = results.find((r) => r.profile === PROFILES.equilibre);
const withVisitors = results.find((r) => r.profile === PROFILES.equilibreVisiteurs);
const drop = 1 - withVisitors.t / base.t;
const g = withVisitors.gifts;
const visitorLine = `Équilibré : ${fmt(base.t)} sans visiteurs, ${fmt(withVisitors.t)} en les attrapant tous `
  + `(${g.count} visiteurs : ${Math.round(g.knowledge)} Savoirs, ${g.omens} Présages) → `
  + `**${drop >= 0 ? '−' : '+'}${Math.abs(drop * 100).toFixed(1)} %** (limite : −${VISITOR_MAX_DROP * 100} %)`
  + `${drop > VISITOR_MAX_DROP ? ' ⚠ au-delà de la limite' : ' ✓'}.`;

const md = `# Rapport d'équilibrage (tools/playtest.mjs)

Parties jouées avec le moteur réel (\`js/sim/simulation.js\`), une décision par seconde de jeu,
jusqu'au palier ${STAGES} du Phare. Valeurs lues dans \`js/balance.js\` (non modifié). Les profils achètent aussi des améliorations (niveaux 1 à 3).
« Attente » = temps sans aucun achat possible ; alerte au-delà de 5 min. « Pause » = temps entre deux
achats du profil (il peut épargner alors qu'un achat est possible), à titre indicatif.

## Profils

${summaryLines.join('\n')}

## Temps pour atteindre chaque jalon (temps de jeu)

${milestoneTable.md}

## Plus longues attentes sans achat possible (3 par profil)

${waitTable.md}

## Plus longue pause entre deux achats (le profil épargne alors qu'un achat est possible)

${pauseTable.md}

## Durée totale

Partie complète (palier ${STAGES} du Phare) : de **${fmt(Math.min(...results.map((r) => r.t)))}** à **${fmt(Math.max(...results.map((r) => r.t)))}** de jeu actif
selon le profil. Joueur simulé idéal (décision chaque seconde) : un vrai joueur sera plus lent.

## Constructions et améliorations choisies

Une « construction » est une pose de bâtiment ; une « amélioration » un niveau acheté (Phare et îlots exclus).
Part d'améliorations = améliorations / (constructions + améliorations).

${shareTable.md}

## Chapitre II (Embarcadères et Reliques, à partir de la partie terminée)

${ch2Lines.join('\n')}

${ch2Table.md}

Plus longues attentes sans achat possible pendant le chapitre II :

${ch2WaitTable.md}

## Effet des Visiteurs du lac

${visitorLine}

## Alertes

${alertLines.join('\n')}

## Propositions d'ajustement (non appliquées)

${props.map((p, i) => `${i + 1}. ${p}`).join('\n')}
`;

writeFileSync(new URL('./playtest-report.md', import.meta.url), md);

console.log('\nTemps pour atteindre chaque jalon\n');
console.log(milestoneTable.term);
console.log('\nPlus longues attentes sans achat possible\n');
console.log(waitTable.term);
console.log('\nPlus longue pause entre deux achats (épargne volontaire)\n');
console.log(pauseTable.term);
console.log('\nChapitre II (depuis la fin vue)\n');
console.log(ch2Lines.join('\n').replace(/\*\*/g, ''));
console.log(ch2Table.term);
console.log(ch2WaitTable.term);
console.log('\nConstructions et améliorations');
console.log(shareTable.term);
console.log('\nEffet des Visiteurs du lac');
console.log(visitorLine.replace(/\*\*/g, ''));
console.log('\nAlertes');
console.log(alertLines.join('\n'));
console.log('\nPropositions (non appliquées)');
console.log(props.map((p, i) => `${i + 1}. ${p.replace(/\*\*|`/g, '')}`).join('\n'));
console.log('\nRapport écrit : tools/playtest-report.md');
