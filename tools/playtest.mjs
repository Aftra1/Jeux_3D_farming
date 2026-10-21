// Simulateur d'équilibrage : joue des parties complètes en accéléré avec le moteur réel
// (js/sim/simulation.js, js/story/journal.js, js/balance.js), du début au 5e palier du Phare.
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
import { Simulation, productionOf, auraTiles } from '../js/sim/simulation.js';
import { Journal } from '../js/story/journal.js';
import { MISSIVES } from '../js/story/missives.js';

const WAIT_ALERT_SECONDS = 5 * 60;
const MAX_SECONDS = 12 * 3600;   // garde-fou : partie abandonnée au-delà
const TPS = BALANCE.ticksPerSecond;
const B = BALANCE.buildings;
const LIGHTHOUSE = 'lighthouse';
const STAGES = B[LIGHTHOUSE].stages.length;
const RES = Object.keys(BALANCE.resources);

// ---------- Terrain sans Three.js : occupation des cases, mêmes refus que BuildingManager ----------

class Registry {
  constructor(size = GRID.size) {
    this.size = size;
    this.records = [];
    this.nextUid = 1;
    this.cells = new Array(size * size).fill(null);
  }
  canPlace(type, x, z) {
    const { w, d } = B[type].footprint;
    if (x < 0 || z < 0 || x + w > this.size || z + d > this.size) return { ok: false, reason: 'bounds' };
    for (let dz = 0; dz < d; dz++) {
      for (let dx = 0; dx < w; dx++) if (this.cells[(z + dz) * this.size + x + dx] !== null) return { ok: false, reason: 'occupied' };
    }
    return { ok: true };
  }
  place(type, x, z, extra = {}) {
    if (!this.canPlace(type, x, z).ok) return null;
    const record = { uid: this.nextUid++, type, x, z, rotation: 0, ...extra };
    const { w, d } = B[type].footprint;
    for (let dz = 0; dz < d; dz++) for (let dx = 0; dx < w; dx++) this.cells[(z + dz) * this.size + x + dx] = record.uid;
    this.records.push(record);
    return record;
  }
  // Même contrat que BuildingManager.hasFreeArea (règle de réserve du Phare dans la Simulation).
  hasFreeArea({ w, d }, except) {
    for (let z = 0; z + d <= this.size; z++) {
      for (let x = 0; x + w <= this.size; x++) {
        if (except && x < except.x + except.w && except.x < x + w && z < except.z + except.d && except.z < z + d) continue;
        let free = true;
        for (let dz = 0; dz < d && free; dz++) for (let dx = 0; dx < w && free; dx++) free = this.cells[(z + dz) * this.size + x + dx] === null;
        if (free) return true;
      }
    }
    return false;
  }
  freeSpots(type) {
    const spots = [];
    for (let z = 0; z < this.size; z++) for (let x = 0; x < this.size; x++) if (this.canPlace(type, x, z).ok) spots.push([x, z]);
    return spots;
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

// Débit net par seconde de chaque ressource, d'après les bâtiments posés, auras et paliers
// compris. Les consommateurs sont ralentis si leur entrée manque (comme les pauses du moteur).
function rates(sim, records = sim.buildings.records, boosts = sim.boosts()) {
  const gross = Object.fromEntries(RES.map((r) => [r, 0]));
  const demand = Object.fromEntries(RES.map((r) => [r, 0]));
  const consumers = [];
  for (const r of records) {
    const p = productionOf(r.type);
    if (!p) continue;
    const perSec = TPS / p.interval;
    if (Object.keys(p.inputs).length) {
      consumers.push({ r, p, perSec });
      for (const [res, n] of Object.entries(p.inputs)) demand[res] += n * perSec;
    } else {
      const k = sim.stageMultiplierFor(r.type, records);
      const bonus = boosts.get(r.uid) || {};
      for (const [res, n] of Object.entries(p.outputs)) gross[res] += (n + (bonus[res] ?? 0)) * k * perSec;
    }
  }
  const net = { ...gross };
  for (const { p, perSec } of consumers) {
    const f = Math.min(1, ...Object.keys(p.inputs).map((res) => (demand[res] ? gross[res] / demand[res] : 1)));
    for (const [res, n] of Object.entries(p.inputs)) net[res] -= n * perSec * f;
    for (const [res, n] of Object.entries(p.outputs)) net[res] += n * perSec * f;
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
    summary: 'achète dès qu\'il peut ; emplacements au hasard ; Sanctuaire seulement pour une missive',
    greedy: true, obsPerLibrary: 1 / 3, sanctuaryMinGain: Infinity, sanctuaryBest: false, lattice: false,
  },
  equilibre: {
    label: 'équilibré',
    summary: 'achète si cela rapproche l\'objectif (en acceptant 15 % de détour) ; Bibliothèques en rangées ; Sanctuaire au meilleur endroit s\'il en renforce 2',
    greedy: false, slack: 1.15, obsPerLibrary: 0.4, sanctuaryMinGain: 2, sanctuaryBest: true, lattice: false,
  },
  optimiseur: {
    label: 'optimiseur',
    summary: 'achète seulement si cela rapproche l\'objectif ; Bibliothèques en réseau autour des Sanctuaires (4 renforcées chacun)',
    greedy: false, slack: 1, obsPerLibrary: 0.5, sanctuaryMinGain: 3, sanctuaryBest: true, lattice: true,
  },
};

// ---------- Partie ----------

function play(profile, seed = 7) {
  const random = rng(seed);
  const reg = new Registry();
  const journal = new Journal();
  const sim = new Simulation(reg, journal);
  // Multiplicateur de palier pour une liste de bâtiments hypothétique (même règle que le moteur).
  sim.stageMultiplierFor = (type, records) => {
    let percent = 0;
    for (const r of records) {
      const boost = B[r.type]?.stageBoost;
      if (boost && boost.targets.includes(type)) percent += boost.percent * (r.stage ?? 0);
    }
    return 1 + percent / 100;
  };

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
    for (const type of Object.keys(B)) {
      if (!sim.isUnlocked(type) || (B[type].unique && sim.countOf(type)) || !sim.canAfford(type)) continue;
      if (keepLighthouseRoom(type, reg.freeSpots(type)).length) return type;
    }
    return null;
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

  // Le jeu refuse toute pose qui ne laisserait plus de place au Phare (sim.leavesRoom).
  function keepLighthouseRoom(type, spots) {
    return spots.filter(([x, z]) => sim.leavesRoom(type, x, z));
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
    let spot = spotFor(action.type);
    if (action.type === 'sanctuary' && action.force && !profile.sanctuaryBest) {
      const spots = keepLighthouseRoom('sanctuary', reg.freeSpots('sanctuary'));
      spot = spots.length ? spots[Math.floor(random() * spots.length)] : null;
    }
    if (!spot || !sim.placeBuilding(action.type, ...spot)) return false;
    purchases.push({ t, what: action.type });
    const n = sim.countOf(action.type);
    if (n === 1 && action.type !== 'library') mark(action.type === LIGHTHOUSE ? 'Phare palier 1' : `Premier ${action.type}`);
    return true;
  }

  // Actions d'expansion candidates (hors objectif direct).
  function expansions() {
    const out = [];
    const libs = sim.countOf('library');
    if (spotFor('library')) out.push({ kind: 'place', type: 'library' });
    if (sim.isUnlocked('observatory') && sim.countOf('observatory') < Math.ceil(libs * profile.obsPerLibrary)
        && spotFor('observatory')) out.push({ kind: 'place', type: 'observatory' });
    if (sim.isUnlocked('sanctuary') && Number.isFinite(profile.sanctuaryMinGain)) {
      const best = bestSanctuary();
      if (best && best.gain >= profile.sanctuaryMinGain) out.push({ kind: 'place', type: 'sanctuary' });
    }
    return out;
  }

  // Débit si l'on ajoutait ce bâtiment (emplacement réel du profil, auras comprises).
  function ratesWith(action) {
    const spot = spotFor(action.type);
    if (!spot) return null;
    const ghost = { uid: -1, type: action.type, x: spot[0], z: spot[1], prodTicks: 0, paused: false };
    const records = [...reg.records, ghost];
    const boosts = new Map(sim.boosts());
    const aura = B[action.type].aura;
    if (aura) {
      for (const r of sim.wouldBoost(action.type, spot[0], spot[1])) {
        const bonus = { ...(boosts.get(r.uid) || {}) };
        for (const [res, n] of Object.entries(aura.bonus)) bonus[res] = Math.max(bonus[res] ?? 0, n);
        boosts.set(r.uid, bonus);
      }
    }
    return rates(sim, records, boosts);
  }

  function choose() {
    const g = goal();
    if (!g) return null;
    if (g.cost && sim.canPlace && Object.entries(g.cost).every(([res, n]) => sim.resources[res] >= n)) return g.buy;
    if (!g.cost || !Object.keys(g.cost).length) return g.buy; // gratuit (première Bibliothèque)
    const affordable = expansions().filter((a) => Object.entries(sim.costOf(a.type)).every(([res, n]) => sim.resources[res] >= n));
    if (!affordable.length) return null;
    if (profile.greedy) return affordable[0];
    // Achat utile si l'objectif est atteint plus tôt (ou à peine plus tard, `slack`) après l'achat.
    const now = timeTo(g.cost, sim.resources, rates(sim));
    let best = null;
    for (const a of affordable) {
      const r = ratesWith(a);
      if (!r) continue;
      const after = timeTo(g.cost, sub(sim.resources, sim.costOf(a.type)), r);
      if (after <= now * profile.slack && (!best || after < best.after)) best = { a, after };
    }
    return best?.a ?? null;
  }

  function binding() {
    const g = goal();
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

  let waitInfo = null; // ressource limitante au début de l'attente
  while (t < MAX_SECONDS && (lighthouse()?.stage ?? 0) < STAGES) {
    let bought = false;
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
    sim.advance(1);
    t++;
    journal.update(sim.earned, sim);
    while (missivesDone < journal.missives) mark(`Missive ${++missivesDone}`);
  }
  const finished = (lighthouse()?.stage ?? 0) >= STAGES;
  waits.sort((a, b) => b.seconds - a.seconds);
  pauses.sort((a, b) => b.seconds - a.seconds);
  return {
    profile, t, finished, milestones, waits, pauses, purchases,
    counts: Object.fromEntries(Object.keys(B).map((k) => [k, sim.countOf(k)])),
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
const RES_NAMES = { knowledge: 'Savoirs', omens: 'Présages' };
const TYPE_NAMES = { library: 'Bibliothèque', observatory: 'Observatoire', sanctuary: 'Sanctuaire', lighthouse: 'Phare' };
const nameOf = (what) => TYPE_NAMES[what] ?? what;

const results = Object.values(PROFILES).map((p) => play(p));

// Jalons communs, dans l'ordre : missives, premier Observatoire, premier Sanctuaire, paliers.
const ROWS = [
  ...MISSIVES.map((m, i) => ({ key: `Missive ${i + 1}`, label: `Missive ${i + 1} · ${m.short}` })),
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
  + `${r.finished ? `Phare achevé en **${fmt(r.t)}**` : `**inachevé** après ${fmt(r.t)}`} ; `
  + `${r.purchases.length} achats ; fin : ${r.counts.library} Bibliothèques (${r.boosted} renforcées), `
  + `${r.counts.observatory} Observatoires, ${r.counts.sanctuary} Sanctuaires.`);

const alertLines = alerts.length
  ? alerts.sort((a, b) => b.seconds - a.seconds).map((w) => `- ⚠ ${w.profile} : ${fmt(w.seconds)} sans achat possible `
    + `(${fmt(w.from)} → ${fmt(w.to)}), en attendant : ${nameOf(w.next)}${w.binding ? `, limité par les ${RES_NAMES[w.binding]}` : ''}.`)
  : ['- Aucune attente de plus de 5 minutes.'];

const props = proposals();

const md = `# Rapport d'équilibrage (tools/playtest.mjs)

Parties jouées avec le moteur réel (\`js/sim/simulation.js\`), une décision par seconde de jeu,
jusqu'au palier ${STAGES} du Phare. Valeurs lues dans \`js/balance.js\` (non modifié).
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
console.log('\nAlertes');
console.log(alertLines.join('\n'));
console.log('\nPropositions (non appliquées)');
console.log(props.map((p, i) => `${i + 1}. ${p.replace(/\*\*|`/g, '')}`).join('\n'));
console.log('\nRapport écrit : tools/playtest-report.md');
