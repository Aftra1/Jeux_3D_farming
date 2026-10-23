// Tests de la simulation et de la sauvegarde (sans navigateur, sans Three.js).
// Lancer depuis la racine du dépôt :   node tests/run.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE } from '../js/balance.js';
import { Simulation, productionOf, roundAmount, hasLuck, auraTiles } from '../js/sim/simulation.js';
import { RESOURCE_TYPES } from '../js/resources.js';
import { upgradeEffect } from '../js/story/texts.js';
import { parseSave, SAVE_VERSION, SaveManager } from '../js/save/save.js';
import { Journal, missiveProgress } from '../js/story/journal.js';
import { FRAGMENTS } from '../js/story/fragments.js';
import { MISSIVES } from '../js/story/missives.js';
import { AUDIO, DAYCYCLE } from '../js/config.js';
import { sampleDay, CYCLE_SECONDS, DayCycle, parseDayPref } from '../js/world/daycycle.js';
import { RateLimiter, scaleMidi, parseSoundPref } from '../js/audio/audio.js';
import { Progress } from '../js/story/progress.js';
import { ENDING, formatDuration } from '../js/story/ending.js';
import { QualityManager, parseQualityPref } from '../js/render/quality.js';
import { QUALITY, GRID } from '../js/config.js';
import { Terrain } from '../js/grid/terrain.js';
import { ISLANDS, ISLAND_IDS } from '../js/world/islands.js';
import { autoSpot, flowPerMinute, upgradeTarget } from '../js/sim/autoplace.js';

// v11 → v12 : les bâtiments améliorables arrivent au niveau 1 (l'Embarcadère avec une chance cumulée nulle).
const v12 = (r) => ({ ...r, ...(BALANCE.buildings[r.type].upgrade ? { level: 1 } : {}),
  ...(hasLuck(r.type) ? { luck: 0 } : {}) });

const PROGRESS = { playSeconds: 0, finished: false }; // fil de la partie (v9) des sauvegardes de test

// Registre minimal qui imite BuildingManager (emplacements toujours libres).
class FakeRegistry {
  constructor() {
    this.records = [];
    this.nextUid = 1;
  }
  canPlace() {
    return { ok: true };
  }
  place(type, x, z, extra = {}) {
    const record = { uid: this.nextUid++, type, x, z, rotation: 0, ...extra };
    this.records.push(record);
    return record;
  }
}

// Partie de départ : `layout` = types posés dans l'ordre, `'type'` ou `['type', x, z, palier]`
// (directement dans le registre, sans coût ni déblocage : on teste ici le moteur).
function game(layout, resources = {}) {
  const reg = new FakeRegistry();
  for (const entry of layout) {
    const [type, x = 0, z = 0, stage, level = 1, more = {}] = Array.isArray(entry) ? entry : [entry];
    const extra = productionOf(type) ? { prodTicks: 0, paused: false } : {};
    if (BALANCE.buildings[type].bell) Object.assign(extra, { charge: 0, ring: 0 });
    Object.assign(extra, more);
    if (stage) extra.stage = stage;
    if (BALANCE.buildings[type].upgrade) extra.level = level;
    if (hasLuck(type)) extra.luck = 0;
    reg.place(type, x, z, extra);
  }
  const sim = new Simulation(reg);
  Object.assign(sim.resources, resources);
  return sim;
}

const snapshot = (sim) => ({
  tick: sim.tick,
  resources: { ...sim.resources },
  buildings: sim.buildings.records.map((r) => ({ prodTicks: r.prodTicks, paused: r.paused, level: r.level, luck: r.luck,
    muse: r.muse, charge: r.charge, ring: r.ring })),
});

// Effets du niveau d'un bâtiment, lus directement dans balance.js (indépendamment du moteur).
const levelOfRecord = (r) => BALANCE.buildings[r.type].upgrade?.levels[(r.level ?? 1) - 1] ?? {};

// Bonus de Sanctuaire, recalculé naïvement case par case : une Bibliothèque (2x2) dont une case est à
// moins de `portée` cases d'un Sanctuaire (hors de lui) reçoit +1 Savoir × l'échelle du niveau (sans cumul :
// le plus fort). Portée 1 = les 8 cases voisines.
function referenceBonus(sim, r) {
  if (r.type !== 'library') return 0;
  const cells = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([dx, dz]) => [r.x + dx, r.z + dz]);
  let best = 0;
  for (const s of sim.buildings.records) {
    if (s.type !== 'sanctuary') continue;
    const lv = levelOfRecord(s);
    const reach = lv.auraRadius ?? BALANCE.buildings.sanctuary.aura.radius;
    if (cells.some(([x, z]) => Math.abs(x - s.x) <= reach && Math.abs(z - s.z) <= reach && !(x === s.x && z === s.z))) {
      best = Math.max(best, BALANCE.buildings.sanctuary.aura.bonus.knowledge * (lv.auraBonusScale ?? 1));
    }
  }
  return best;
}

const referenceStage = (sim) => sim.buildings.records.find((r) => r.type === 'lighthouse')?.stage ?? 0;

// Distance de Tchebychev entre deux emprises (0 = chevauchement), recalculée naïvement.
function referenceGap(a, b) {
  const [fa, fb] = [BALANCE.buildings[a.type].footprint, BALANCE.buildings[b.type].footprint];
  const g = (a0, al, b0, bl) => Math.max(0, b0 - (a0 + al - 1), a0 - (b0 + bl - 1));
  return Math.max(g(a.x, fa.w, b.x, fb.w), g(a.z, fa.d, b.z, fb.d));
}

// Économies des Scriptoriums sur `r` : entrées ×0,5 (arrondies au-dessus), sans cumul ; meilleure chance de sortie en plus.
function referenceSaving(sim, r) {
  const rules = BALANCE.buildings.scriptorium.efficiency;
  const out = { scale: 1, chance: 0, extra: null };
  for (const s of sim.buildings.records) {
    if (s.type !== 'scriptorium' || !rules.targets.includes(r.type)) continue;
    const lv = levelOfRecord(s);
    const gap = referenceGap(s, r);
    if (gap < 1 || gap > (lv.auraRadius ?? rules.radius)) continue;
    out.scale = Math.min(out.scale, rules.inputScale);
    if ((lv.extraChance ?? 0) > out.chance) Object.assign(out, { chance: lv.extraChance, extra: lv.extra });
  }
  return out;
}

// Réglages d'une Cloche d'après balance.js (en ticks).
function referenceBell(b) {
  const base = BALANCE.buildings.bell.bell;
  const lv = levelOfRecord(b);
  return { charge: Math.round((lv.chargeSeconds ?? base.chargeSeconds) * BALANCE.ticksPerSecond),
    radius: lv.radius ?? base.radius, speed: base.speed };
}

// Implémentation de référence, volontairement naïve : un tick à la fois.
function referenceRun(sim, ticks) {
  const has = (cost) => Object.entries(cost).every(([res, n]) => sim.resources[res] >= n);
  const producers = sim.buildings.records.filter((r) => productionOf(r.type));
  const bells = sim.buildings.records.filter((r) => BALANCE.buildings[r.type].bell);
  // Vitesse d'un producteur pendant ce tick : celle de la Cloche qui sonne (au début du tick) la plus rapide à portée.
  const speedOf = (r) => bells.reduce((m, b) => {
    const gap = referenceGap(b, r);
    const bell = referenceBell(b);
    return b.ring > 0 && gap >= 1 && gap <= bell.radius ? Math.max(m, bell.speed) : m;
  }, 1);
  const intervalOf = (r) => {
    const seconds = levelOfRecord(r).intervalSeconds ?? BALANCE.buildings[r.type].production.intervalSeconds;
    return Math.max(1, Math.round(seconds * BALANCE.ticksPerSecond));
  };
  for (let t = 0; t < ticks; t++) {
    for (const r of producers) if (!r.paused) r.prodTicks += speedOf(r);
    sim.tick++;
    for (const r of producers) {
      const p = productionOf(r.type);
      const interval = intervalOf(r);
      if (r.prodTicks < interval) continue;
      const saving = referenceSaving(sim, r);
      const inputs = Object.fromEntries(Object.entries(p.inputs).map(([res, n]) => [res, Math.ceil(n * saving.scale)]));
      if (has(inputs)) {
        for (const [res, n] of Object.entries(inputs)) sim.resources[res] = roundAmount(sim.resources[res] - n);
        // Phare : +10 % par palier aux Bibliothèques, sur la sortie renforcée comprise.
        const k = r.type === 'library' ? 1 + 0.1 * referenceStage(sim) : 1;
        // Embarcadère amélioré : la chance s'additionne à chaque cycle, double dès que le cumul atteint 1.
        let times = 1;
        const chance = levelOfRecord(r).doubleChance ?? 0;
        if (chance) {
          r.luck = roundAmount((r.luck ?? 0) + chance);
          if (r.luck >= 1) {
            r.luck = roundAmount(r.luck - 1);
            times = 2;
          }
        }
        // Scriptorium niveau 3 : la chance s'additionne, un cycle rapporte une sortie de plus dès que le cumul atteint 1.
        let extra = {};
        if (saving.chance) {
          r.muse = roundAmount((r.muse ?? 0) + saving.chance);
          if (r.muse >= 1) {
            r.muse = roundAmount(r.muse - 1);
            extra = saving.extra;
          }
        }
        for (const [res, n] of Object.entries(p.outputs)) {
          const bonus = res === 'knowledge' ? referenceBonus(sim, r) : 0;
          const level = levelOfRecord(r).outputBonus?.[res] ?? 0;
          sim.resources[res] = roundAmount(sim.resources[res] + roundAmount((n + level + bonus) * k) * times);
        }
        for (const [res, n] of Object.entries(extra)) sim.resources[res] = roundAmount(sim.resources[res] + n);
        r.prodTicks = 0;
        r.paused = false;
      } else {
        r.prodTicks = interval;
        r.paused = true;
      }
    }
    for (const b of bells) { // la charge monte d'un tick, la sonnerie diminue d'un tick
      b.charge = Math.min(b.charge + 1, referenceBell(b).charge);
      b.ring = Math.max(0, b.ring - 1);
    }
  }
}

function continuous(sim, seconds, fps) {
  const frames = Math.round(seconds * fps);
  for (let i = 0; i < frames; i++) sim.advance(1 / fps);
}

// Scénarios couvrant : chaîne équilibrée, déficit (pauses), départ à sec,
// observatoire posé avant les bibliothèques (ordre de résolution).
const SCENARIOS = [
  { name: '2 Bibliothèques + 1 Observatoire', layout: ['library', 'library', 'observatory'] },
  { name: 'déficit : 1 Bibliothèque + 2 Observatoires', layout: ['library', 'observatory', 'observatory'] },
  { name: 'Observatoires seuls, réserve de 7 Savoirs', layout: ['observatory', 'observatory'], resources: { knowledge: 7 } },
  { name: 'Observatoire posé en premier', layout: ['observatory', 'library', 'library', 'observatory'] },
  {
    // Bibliothèques en (2,2), (5,2) et (10,10) ; Sanctuaires en (4,2) (touche les deux
    // premières), (4,3) (même deux : pas de cumul) et (13,13) (trop loin de tout).
    name: 'Sanctuaires : renfort, non-cumul, hors de portée',
    layout: [['library', 2, 2], ['library', 5, 2], ['library', 10, 10], ['observatory', 8, 8],
      ['observatory', 9, 8], ['sanctuary', 4, 2], ['sanctuary', 4, 3], ['sanctuary', 13, 13]],
  },
  {
    // Phare au palier 3 : +30 % sur les Bibliothèques (renfort d'aura compris), quantités
    // fractionnaires ; les Observatoires ne sont pas concernés.
    name: 'Phare palier 3 : +30 % aux Bibliothèques',
    layout: [['library', 2, 2], ['library', 10, 10], ['sanctuary', 4, 2], ['observatory', 8, 8],
      ['observatory', 9, 8], ['observatory', 7, 8], ['lighthouse', 12, 2, 3]],
  },
  {
    // Niveaux : Bibliothèques 2 et 3, Observatoires 2 et 3 (cycles de 3 s et 2,4 s), Sanctuaire niveau 3
    // en (6,2) (portée 2, bonus doublé) : une Bibliothèque à 2 cases de lui (3,2) et une voisine (7,2).
    name: 'Niveaux : Bibliothèques, Observatoires et Sanctuaire améliorés',
    layout: [['library', 3, 2, 0, 3], ['library', 7, 2, 0, 2], ['library', 14, 14], ['observatory', 9, 9, 0, 2],
      ['observatory', 9, 10, 0, 3], ['observatory', 9, 11], ['sanctuary', 6, 2, 0, 3]],
  },
  {
    // Embarcadères aux niveaux 1, 2 (une relique double sur 4) et 3 (une sur 2), nourris par des Présages
    // de départ puis par des Observatoires, sous un Phare palier 2 et un Sanctuaire niveau 2.
    name: 'Embarcadères aux niveaux 1, 2 et 3 : chance déterministe',
    layout: [['library', 2, 2, 0, 2], ['library', 5, 2], ['library', 14, 14, 0, 3], ['observatory', 9, 9, 0, 3],
      ['observatory', 9, 10], ['embarcadere', 0, 0], ['embarcadere', 1, 0, 0, 2], ['embarcadere', 2, 0, 0, 3],
      ['sanctuary', 4, 4, 0, 2], ['lighthouse', 12, 2, 2]],
    resources: { omens: 12, knowledge: 4 },
  },
  {
    // Scriptoriums : (9,9) niveau 1 sert (8,8) et (9,8) sans cumul, (10,12) niveau 3 (portée 2, Présage en plus)
    // sert (9,10) à 2 cases ; un Observatoire hors de portée garde ses entrées pleines.
    name: 'Scriptoriums : entrées réduites, portée 2, Présage en plus (sans cumul)',
    layout: [['library', 2, 2], ['library', 2, 5], ['library', 14, 14, 0, 2], ['observatory', 8, 8], ['observatory', 9, 8],
      ['observatory', 9, 11], ['observatory', 20, 20], ['scriptorium', 9, 9], ['scriptorium', 10, 12, 0, 3],
      ['scriptorium', 8, 9, 0, 2]],
    resources: { knowledge: 5 },
  },
  {
    // Observatoire en pause avec un seul Savoir : sous un Scriptorium il peut payer (1 Savoir) et reprend seul.
    name: 'Scriptorium : un Observatoire en pause reprend avec la moitié des Savoirs',
    layout: [['observatory', 1, 1, 0, 1, { prodTicks: 40, paused: true }], ['library', 6, 6], ['scriptorium', 2, 2]],
    resources: { knowledge: 1 },
  },
  {
    // Cloches : A (niv. 1, portée 3) sonne depuis 25 s, B (niv. 3, portée 4) depuis 12 s et chevauche A
    // sur la Bibliothèque (5,2) (vitesse ×2 sans cumul) ; C est chargée mais ne sonne pas ; (14,14) hors de portée.
    name: 'Cloches : sonnerie en cours, portées, non-cumul, recharge',
    layout: [['library', 2, 2], ['library', 5, 2], ['library', 14, 14], ['observatory', 6, 6], ['observatory', 9, 2],
      ['embarcadere', 0, 0], ['sanctuary', 4, 4],
      ['bell', 4, 6, 0, 1, { charge: 20, ring: 250 }], ['bell', 8, 5, 0, 3, { charge: 300, ring: 120 }],
      ['bell', 20, 20, 0, 2, { charge: 1300, ring: 0 }]],
    resources: { omens: 9, knowledge: 3 },
  },
];

for (const sc of SCENARIOS) {
  test(`hors ligne = jeu continu = référence — ${sc.name}`, () => {
    for (const seconds of [3.7, 61, 1800, BALANCE.offline.maxSeconds]) {
      const live = game(sc.layout, sc.resources);
      const offline = game(sc.layout, sc.resources);
      const reference = game(sc.layout, sc.resources);

      continuous(live, seconds, 60);
      offline.applyOffline(seconds);
      referenceRun(reference, Math.floor(seconds * BALANCE.ticksPerSecond));

      assert.deepEqual(snapshot(offline), snapshot(reference), `hors ligne vs référence (${seconds} s)`);
      assert.deepEqual(snapshot(live), snapshot(reference), `continu vs référence (${seconds} s)`);
    }
  });
}

test('hors ligne plafonné à BALANCE.offline.maxSeconds', () => {
  const a = game(['library']);
  const b = game(['library']);
  a.applyOffline(BALANCE.offline.maxSeconds);
  b.applyOffline(BALANCE.offline.maxSeconds * 5);
  assert.deepEqual(snapshot(a), snapshot(b));
});

test('rapport hors ligne : production par type et consommation', () => {
  const sim = game(['library', 'library', 'observatory']);
  const r = sim.applyOffline(60);
  // 2 Bibliothèques : 1 Savoir / 2 s chacune → 60 ; Observatoire : 15 cycles possibles
  assert.equal(r.produced.library.knowledge, 60);
  assert.equal(r.produced.observatory.omens, 15);
  assert.equal(r.consumed.knowledge, 30);
  assert.equal(sim.resources.knowledge, 30);
  assert.equal(sim.resources.omens, 15);
});

test('production indépendante des images par seconde', () => {
  const results = [24, 30, 60, 144].map((fps) => {
    const sim = game(['library', 'library', 'observatory']);
    continuous(sim, 60, fps);
    return snapshot(sim);
  });
  for (const r of results) assert.deepEqual(r, results[0]);
});

test('Observatoire sans Savoirs : pause sans consommer, reprise seule', () => {
  const sim = game(['observatory']);
  sim.resources.knowledge = 1;
  continuous(sim, 10, 60);
  const obs = sim.buildings.records[0];
  assert.equal(obs.paused, true);
  assert.equal(sim.resources.knowledge, 1, 'rien consommé pendant la pause');
  assert.equal(sim.resources.omens, 0);

  sim.resources.knowledge = 2;
  continuous(sim, 0.1, 60); // un tick suffit pour reprendre
  assert.equal(obs.paused, false);
  assert.equal(sim.resources.knowledge, 0);
  assert.equal(sim.resources.omens, 1);
});

test('événements de pause et de reprise', () => {
  const sim = game(['observatory']);
  continuous(sim, 4, 60);
  assert.ok(sim.drainEvents().some((e) => e.kind === 'paused'));
  sim.resources.knowledge = 2;
  continuous(sim, 0.1, 60);
  const kinds = sim.drainEvents().map((e) => e.kind);
  assert.ok(kinds.includes('resumed') && kinds.includes('produced'));
});

test('déblocage : Observatoire verrouillé tant qu\'il n\'y a pas 2 Bibliothèques', () => {
  const sim = new Simulation(new FakeRegistry());
  sim.resources.knowledge = 1000;
  assert.equal(sim.canPlace('observatory', 0, 0).reason, 'locked');
  sim.placeBuilding('library', 0, 0);
  assert.equal(sim.canPlace('observatory', 0, 0).reason, 'locked');
  sim.placeBuilding('library', 0, 0);
  assert.equal(sim.canPlace('observatory', 0, 0).ok, true);
  const before = sim.resources.knowledge;
  sim.placeBuilding('observatory', 0, 0);
  assert.equal(before - sim.resources.knowledge, BALANCE.buildings.observatory.cost.knowledge);
});

// Sauvegarde réelle de l'étape 4 (format v1), telle qu'écrite par le jeu.
const STEP4_SAVE = JSON.stringify({
  version: 1,
  savedAt: 1760960000000,
  sim: { tick: 1234, resources: { knowledge: 57 } },
  buildings: {
    nextUid: 3,
    buildings: [
      { uid: 1, type: 'library', x: 9, z: 7, rotation: 0, prodTicks: 12 },
      { uid: 2, type: 'library', x: 4, z: 8, rotation: 0, prodTicks: 3 },
    ],
  },
});

test('migrations v1 → v13 : une sauvegarde de l\'étape 4 se charge', () => {
  const data = parseSave(STEP4_SAVE);
  assert.equal(SAVE_VERSION, 13);
  assert.equal(data.version, SAVE_VERSION);
  assert.deepEqual(data.day, { startedAt: 1760960000000 }); // reprise en début d'après-midi
  assert.equal(data.savedAt, 1760960000000);
  assert.deepEqual(data.sim, {
    tick: 1234,
    resources: { knowledge: 57, omens: 0, relics: 0 },
    earned: { knowledge: 57, omens: 0, relics: 0 },
    visitors: 0,
    islands: [],
  });
  assert.deepEqual(data.journal, { unlocked: [], unread: [], missives: 0 });
  assert.deepEqual(data.buildings.buildings, [
    { uid: 1, type: 'library', x: 13, z: 11, rotation: 0, prodTicks: 12, paused: false, level: 1 },
    { uid: 2, type: 'library', x: 8, z: 12, rotation: 0, prodTicks: 3, paused: false, level: 1 },
  ]); // terrain 24x24 : décalées de +4 (v7)

  // Et la partie reprend normalement dans la simulation.
  const reg = new FakeRegistry();
  reg.records = data.buildings.buildings.map((r) => ({ ...r }));
  reg.nextUid = data.buildings.nextUid;
  const sim = new Simulation(reg);
  sim.load(data.sim);
  assert.equal(sim.resources.knowledge, 57);
  assert.equal(sim.resources.omens, 0);
  sim.applyOffline(60);
  assert.equal(sim.resources.knowledge, 57 + 60);
});

// Sauvegarde réelle de l'étape 5 (format v2) : 12 Présages au solde.
const STEP5_SAVE = JSON.stringify({
  version: 2,
  savedAt: 1761000000000,
  sim: { tick: 5000, resources: { knowledge: 4, omens: 12 } },
  buildings: {
    nextUid: 4,
    buildings: [
      { uid: 1, type: 'library', x: 9, z: 7, rotation: 0, prodTicks: 5, paused: false },
      { uid: 2, type: 'library', x: 4, z: 8, rotation: 0, prodTicks: 11, paused: false },
      { uid: 3, type: 'observatory', x: 6, z: 3, rotation: 0, prodTicks: 40, paused: true },
    ],
  },
});

test('migration v2 → v7 : total cumulé estimé au solde, Carnet vide puis premier fragment', () => {
  const data = parseSave(STEP5_SAVE);
  assert.equal(data.version, SAVE_VERSION);
  assert.deepEqual(data.sim.resources, { knowledge: 4, omens: 12, relics: 0 });
  assert.deepEqual(data.sim.earned, { knowledge: 4, omens: 12, relics: 0 });
  assert.deepEqual(data.journal, { unlocked: [], unread: [], missives: 0 });
  assert.equal(data.buildings.buildings[2].paused, true);

  const reg = new FakeRegistry();
  reg.records = data.buildings.buildings.map((r) => ({ ...r }));
  const sim = new Simulation(reg);
  sim.load(data.sim);
  const journal = new Journal();
  journal.load(data.journal);
  assert.deepEqual(journal.update(sim.earned), ['note-sans-date']); // 12 ≥ 5, < 25
  assert.deepEqual([...journal.unread], ['note-sans-date']);
});

test('Sanctuaire : 8 cases voisines, +1 Savoir par cycle, sans cumul', () => {
  const sim = game([['library', 2, 2], ['library', 7, 7], ['library', 2, 5],
    ['sanctuary', 4, 4], ['sanctuary', 4, 3]]);
  // (4,4) touche (2,2) par le coin (3,3) et (2,5) par (3,5) ; (7,7) est à 3 cases.
  const boosted = [...sim.boosts().keys()];
  assert.deepEqual(boosted.sort(), [1, 3]);
  assert.deepEqual(sim.boosts().get(1), { knowledge: 1 });
  assert.deepEqual(sim.wouldBoost('sanctuary', 9, 9).map((r) => r.uid), [2]);
  assert.deepEqual(sim.wouldBoost('sanctuary', 12, 12), []);
  const r = sim.applyOffline(20);
  assert.equal(r.produced.library.knowledge, 10 * 2 + 10 + 10 * 2);
});

test('Sanctuaire posé en cours de partie : continu = hors ligne = référence', () => {
  const layout = [['library', 2, 2], ['library', 5, 2], ['observatory', 9, 9]];
  const start = { knowledge: 3 };
  const live = game(layout, start);
  const offline = game(layout, start);
  const reference = game(layout, start);
  // Phase 1 : 95,3 s ; pose d'un Sanctuaire entre les deux Bibliothèques ; phase 2 : 1 h.
  const phases = [95.3, 3600];
  continuous(live, phases[0], 60);
  offline.applyOffline(phases[0]);
  referenceRun(reference, Math.floor(phases[0] * BALANCE.ticksPerSecond));
  for (const sim of [live, offline, reference]) {
    for (const [res, n] of Object.entries(sim.costOf('sanctuary'))) sim.resources[res] += n;
    assert.ok(sim.placeBuilding('sanctuary', 4, 2), 'pose du Sanctuaire');
  }
  continuous(live, phases[1], 60);
  offline.applyOffline(phases[1]);
  referenceRun(reference, Math.floor(phases[1] * BALANCE.ticksPerSecond));
  assert.deepEqual(snapshot(offline), snapshot(reference));
  assert.deepEqual(snapshot(live), snapshot(reference));
  assert.deepEqual(live.earned, offline.earned);
});

test('Phare élevé en cours de partie : continu = hors ligne = référence', () => {
  const layout = [['library', 2, 2], ['library', 5, 2], ['sanctuary', 4, 2], ['observatory', 9, 9]];
  const live = game(layout);
  const offline = game(layout);
  const reference = game(layout);
  const sims = [live, offline, reference];
  const run = (seconds) => {
    continuous(live, seconds, 60);
    offline.applyOffline(seconds);
    referenceRun(reference, Math.floor(seconds * BALANCE.ticksPerSecond));
  };
  for (const sim of sims) sim.story.missives = 5;
  run(41.7);
  for (const sim of sims) {
    for (const [res, n] of Object.entries(sim.costOf('lighthouse'))) sim.resources[res] += n;
    assert.ok(sim.placeBuilding('lighthouse', 12, 12), 'fondations');
  }
  // Paliers 2 à 5, chacun suivi d'une période de jeu (bonus 20 % puis 30 %, 40 %, 50 %).
  for (const [i, seconds] of [[1, 333.3], [2, 61], [3, 1200], [4, 3600]]) {
    for (const sim of sims) {
      const cost = BALANCE.buildings.lighthouse.stages[i].cost;
      for (const [res, n] of Object.entries(cost)) sim.resources[res] += n;
      assert.deepEqual(sim.elevate(sim.buildings.records.at(-1).uid), { ok: true, stage: i + 1 });
    }
    run(seconds);
    assert.deepEqual(snapshot(offline), snapshot(reference), `palier ${i + 1}`);
    assert.deepEqual(snapshot(live), snapshot(reference), `palier ${i + 1}`);
  }
  assert.deepEqual(live.earned, offline.earned);
  // Pas de dérive d'arrondi : 10 cycles à 1,1 Savoir donnent exactement 11.
  const one = game([['library', 0, 0], ['lighthouse', 5, 5, 1]]);
  one.applyOffline(20);
  assert.equal(one.resources.knowledge, 11);
});

test('Phare : déblocage par 5 missives, unique, paliers payants, bonus de 10 % par palier', () => {
  const sim = game([['library', 0, 0]], { knowledge: 50000, omens: 10000 });
  assert.equal(sim.canPlace('lighthouse', 6, 6).reason, 'locked');
  assert.deepEqual(sim.missingUnlocks('lighthouse'), [{ kind: 'missives', required: 5, have: 0 }]);
  sim.story.missives = 5;
  const stages = BALANCE.buildings.lighthouse.stages;
  assert.equal(stages.length, 5);
  assert.deepEqual(sim.costOf('lighthouse'), stages[0].cost);
  const record = sim.placeBuilding('lighthouse', 6, 6);
  assert.equal(record.stage, 1);
  assert.equal(record.prodTicks, undefined); // ne produit rien
  assert.equal(sim.canPlace('lighthouse', 10, 10).reason, 'unique');
  assert.equal(sim.stageMultiplier('library'), 1.1);
  assert.equal(sim.stageMultiplier('observatory'), 1);
  // Coûts croissants, en Savoirs et en Présages.
  for (let i = 1; i < stages.length; i++) {
    for (const res of ['knowledge', 'omens']) assert.ok(stages[i].cost[res] > stages[i - 1].cost[res]);
  }
  const before = { ...sim.resources };
  assert.deepEqual(sim.nextStageCost(record.uid), stages[1].cost);
  assert.deepEqual(sim.elevate(record.uid), { ok: true, stage: 2 });
  assert.equal(sim.resources.knowledge, before.knowledge - stages[1].cost.knowledge);
  sim.resources.omens = 0;
  assert.equal(sim.elevate(record.uid).reason, 'cost');
  assert.equal(record.stage, 2);
  sim.resources.omens = 10000;
  sim.elevate(record.uid);
  sim.elevate(record.uid);
  assert.deepEqual(sim.elevate(record.uid), { ok: true, stage: 5 });
  assert.equal(sim.elevate(record.uid).reason, 'complete');
  assert.equal(sim.nextStageCost(record.uid), null);
  assert.equal(sim.stageMultiplier('library'), 1.5);
  sim.applyOffline(2);
  assert.equal(sim.earned.knowledge, 1.5);
});

test('Phare : une missive et un fragment par palier, révélation finale', () => {
  const sim = game([['library', 0, 0], ['library', 3, 0], ['library', 9, 0], ['observatory', 6, 0],
    ['sanctuary', 2, 2]], { knowledge: 100000, omens: 100000 });
  const journal = new Journal();
  sim.story = journal;
  journal.update(sim.earned, sim);
  assert.equal(journal.missives, 5);
  assert.equal(journal.currentMissive.id, 'fondations-du-phare');
  assert.ok(sim.isUnlocked('lighthouse'));
  const record = sim.placeBuilding('lighthouse', 12, 12);
  const lighthouseMissives = MISSIVES.slice(5);
  assert.deepEqual(journal.update(sim.earned, sim), [fragmentOf(lighthouseMissives[0].id)]);
  for (let stage = 2; stage <= 5; stage++) {
    assert.deepEqual(missiveProgress(journal.currentMissive, sim), { have: stage - 1, target: stage });
    sim.elevate(record.uid);
    assert.deepEqual(journal.update(sim.earned, sim), [fragmentOf(lighthouseMissives[stage - 1].id)]);
  }
  assert.equal(journal.currentMissive.chapter, 2); // chapitre II ensuite
  const finale = FRAGMENTS.filter((f) => f.finale);
  assert.deepEqual(finale.map((f) => f.missive), ['lanterne-du-phare', 'la-lueur-au-fond']);
});

test('Sanctuaire : coût, déblocage par 1 Observatoire, Présages dépensés sans toucher au cumul', () => {
  const base = BALANCE.buildings.sanctuary.cost;
  const sim = game([['library', 0, 0], ['library', 4, 0]], { knowledge: base.knowledge + 50, omens: base.omens + 20 });
  sim.earned.omens = base.omens + 20;
  assert.equal(sim.canPlace('sanctuary', 8, 8).reason, 'locked');
  sim.buildings.place('observatory', 10, 10, { prodTicks: 0, paused: false });
  assert.deepEqual(sim.costOf('sanctuary'), base);
  assert.ok(sim.placeBuilding('sanctuary', 8, 8));
  assert.equal(sim.resources.knowledge, 50);
  assert.equal(sim.resources.omens, 20);
  assert.equal(sim.earned.omens, base.omens + 20);
  sim.resources.omens = base.omens;
  assert.equal(sim.canPlace('sanctuary', 12, 12).reason, 'cost');
});

test('total cumulé : les dépenses ne le diminuent pas', () => {
  const sim = game(['library', 'library', 'observatory']);
  sim.applyOffline(600);
  // L'Observatoire a dépensé des Savoirs : le cumul dépasse le solde.
  assert.ok(sim.earned.knowledge > sim.resources.knowledge);
  assert.equal(sim.earned.omens, sim.resources.omens);
  // Même résultat en continu (le cumul passe par le moteur unique).
  const live = game(['library', 'library', 'observatory']);
  continuous(live, 600, 30);
  assert.deepEqual(live.earned, sim.earned);
});

test('Carnet : paliers sur le total cumulé, pas sur le solde', () => {
  assert.deepEqual(FRAGMENTS.filter((f) => f.resource).map((f) => [f.resource, f.threshold]), [['omens', 5], ['omens', 25], ['omens', 100]]);
  const journal = new Journal();
  assert.deepEqual(journal.update({ omens: 4.9 }), []);
  assert.deepEqual(journal.update({ omens: 30 }), ['note-sans-date', 'registre-des-absents']);
  assert.deepEqual(journal.update({ omens: 30 }), []); // pas de double déblocage
  assert.equal(journal.unread.size, 2);
  assert.equal(journal.markAllRead(), true);
  assert.equal(journal.markAllRead(), false);
  assert.deepEqual(journal.update({ omens: 100 }), ['lettre-au-gardien']);

  // En jeu : un solde dépensé ne fait pas perdre un fragment ni n'empêche le suivant.
  const sim = game(['library', 'library', 'observatory']);
  const j = new Journal();
  sim.applyOffline(25); // 6 Présages
  j.update(sim.earned);
  sim.resources.omens = 0; // dépense hypothétique
  j.update(sim.earned);
  assert.deepEqual(j.unlocked, ['note-sans-date']);
});

test('sauvegarde v6 : aller-retour', () => {
  const sim = game(['library', 'library', 'observatory'], { knowledge: 3 });
  sim.applyOffline(17);
  const journal = new Journal();
  journal.update({ omens: 26 });
  journal.markAllRead();
  journal.update({ omens: 100 });
  const text = JSON.stringify({
    version: SAVE_VERSION,
    savedAt: 1,
    sim: sim.toJSON(),
    buildings: { nextUid: sim.buildings.nextUid, buildings: sim.buildings.records },
    journal: journal.toJSON(),
    day: { startedAt: 1234.5 },
    progress: PROGRESS,
  });
  const data = parseSave(text);
  assert.deepEqual(data.day, { startedAt: 1234.5 });
  assert.deepEqual(data.sim, sim.toJSON());
  assert.deepEqual(data.buildings.buildings, sim.buildings.records);
  assert.deepEqual(data.journal, journal.toJSON());
  const back = new Journal();
  back.load(data.journal);
  const byOmens = FRAGMENTS.filter((f) => f.resource).map((f) => f.id);
  assert.deepEqual(back.toJSON(), { unlocked: byOmens, unread: ['lettre-au-gardien'], missives: 0 });
});

// Sauvegarde réelle de l'étape 12 (format v5).
const STEP12_SAVE = JSON.stringify({
  version: 5,
  savedAt: 1763000000000,
  sim: { tick: 120000, resources: { knowledge: 340, omens: 61 }, earned: { knowledge: 2100, omens: 130 } },
  buildings: {
    nextUid: 4,
    buildings: [
      { uid: 1, type: 'library', x: 2, z: 2, rotation: 0, prodTicks: 7, paused: false },
      { uid: 2, type: 'observatory', x: 6, z: 8, rotation: 0, prodTicks: 40, paused: true },
      { uid: 3, type: 'sanctuary', x: 4, z: 2, rotation: 0 },
    ],
  },
  journal: { unlocked: ['carnet-d-emprunts', 'note-sans-date'], unread: [], missives: 5 },
  day: { startedAt: 1762990000000 },
});

test('migration v5 → v7 : partie de l\'étape 12 recentrée, le Phare devient disponible', () => {
  const data = parseSave(STEP12_SAVE);
  const old = JSON.parse(STEP12_SAVE);
  assert.equal(data.version, SAVE_VERSION);
  assert.deepEqual(data.buildings.buildings, old.buildings.buildings.map((r) => v12({ ...r, x: r.x + 4, z: r.z + 4 })));
  assert.deepEqual(data.sim, { ...old.sim, visitors: 0, // v8 : aucun visiteur avant l'étape 17
    resources: { ...old.sim.resources, relics: 0 }, earned: { ...old.sim.earned, relics: 0 }, islands: [] }); // v10, v11
  assert.deepEqual(data.day, old.day);
  assert.equal(data.journal.missives, 5);
  const reg = new FakeRegistry();
  reg.records = data.buildings.buildings.map((r) => ({ ...r }));
  reg.nextUid = data.buildings.nextUid;
  const journal = new Journal();
  journal.load(data.journal);
  const sim = new Simulation(reg, journal);
  sim.load(data.sim);
  assert.ok(sim.isUnlocked('lighthouse'));

  // Aller-retour avec un Phare, puis paliers invalides refusés.
  Object.assign(sim.resources, { knowledge: 50000, omens: 10000 });
  sim.placeBuilding('lighthouse', 10, 10);
  const save = (buildings) => JSON.stringify({ ...old, version: SAVE_VERSION, sim: data.sim,
    buildings: { nextUid: 9, buildings }, progress: PROGRESS });
  const back = parseSave(save(sim.buildings.records));
  assert.deepEqual(back.buildings.buildings.at(-1), { uid: 4, type: 'lighthouse', x: 10, z: 10, rotation: 0, stage: 1 });
  const lh = { uid: 4, type: 'lighthouse', x: 10, z: 10, rotation: 0 };
  for (const buildings of [
    [lh],
    [{ ...lh, stage: 0 }],
    [{ ...lh, stage: 6 }],
    [{ ...lh, stage: 2.5 }],
    [{ uid: 1, type: 'library', x: 2, z: 2, stage: 1 }],
    [{ ...lh, stage: 2 }, { ...lh, uid: 5, x: 0, stage: 1 }],
  ]) assert.throws(() => parseSave(save(buildings)), undefined, JSON.stringify(buildings));
});

test('Carnet : fragment inconnu ignoré au chargement, pas d\'erreur', () => {
  const v3 = { ...JSON.parse(STEP5_SAVE), version: 3,
    sim: { tick: 1, resources: {}, earned: {} },
    journal: { unlocked: ['note-sans-date', 'fragment-retire'], unread: ['fragment-retire'] } };
  assert.deepEqual(parseSave(JSON.stringify(v3)).journal,
    { unlocked: ['note-sans-date'], unread: [], missives: 0 });
});

test('sauvegardes invalides refusées', () => {
  const bad = [
    '{pas du json',
    JSON.stringify({ version: 99 }),
    JSON.stringify({ ...JSON.parse(STEP4_SAVE), savedAt: 'hier' }),
    JSON.stringify({ ...JSON.parse(STEP4_SAVE), sim: { tick: 1, resources: { knowledge: -1 } } }),
    JSON.stringify({ version: 2, savedAt: 1, sim: { tick: 0, resources: {} },
      buildings: { nextUid: 2, buildings: [{ uid: 1, type: 'dragon', x: 0, z: 0 }] } }),
    JSON.stringify({ version: 2, savedAt: 1, sim: { tick: 0, resources: {} },
      buildings: { nextUid: 2, buildings: [{ uid: 1, type: 'library', x: 0, z: 0, paused: 'oui' }] } }),
    JSON.stringify({ version: 3, savedAt: 1, sim: { tick: 0, resources: {}, earned: { omens: -2 } },
      buildings: { nextUid: 1, buildings: [] }, journal: { unlocked: [], unread: [] } }),
    JSON.stringify({ version: 3, savedAt: 1, sim: { tick: 0, resources: {}, earned: {} },
      buildings: { nextUid: 1, buildings: [] } }),
    JSON.stringify({ version: 3, savedAt: 1, sim: { tick: 0, resources: {}, earned: {} },
      buildings: { nextUid: 1, buildings: [] }, journal: { unlocked: [7], unread: [] } }),
    JSON.stringify({ version: 4, savedAt: 1, sim: { tick: 0, resources: {}, earned: {} },
      buildings: { nextUid: 1, buildings: [] }, journal: { unlocked: [], unread: [] } }),
    JSON.stringify({ version: 4, savedAt: 1, sim: { tick: 0, resources: {}, earned: {} },
      buildings: { nextUid: 1, buildings: [] }, journal: { unlocked: [], unread: [], missives: -1 } }),
    JSON.stringify({ version: 4, savedAt: 1, sim: { tick: 0, resources: {}, earned: {} },
      buildings: { nextUid: 1, buildings: [] }, journal: { unlocked: [], unread: [], missives: 1.5 } }),
    JSON.stringify({ version: 5, savedAt: 1, sim: { tick: 0, resources: {}, earned: {} },
      buildings: { nextUid: 1, buildings: [] }, journal: { unlocked: [], unread: [], missives: 0 } }),
    JSON.stringify({ version: 5, savedAt: 1, sim: { tick: 0, resources: {}, earned: {} },
      buildings: { nextUid: 1, buildings: [] }, journal: { unlocked: [], unread: [], missives: 0 },
      day: { startedAt: 'midi' } }),
  ];
  for (const text of bad) assert.throws(() => parseSave(text), undefined, text.slice(0, 40));
});

// ----- Missives -----

const fragmentOf = (missiveId) => FRAGMENTS.find((f) => f.missive === missiveId).id;

test('missives : données cohérentes, un fragment par missive', () => {
  assert.equal(MISSIVES.length, 15);
  assert.equal(new Set(MISSIVES.map((m) => m.id)).size, 15);
  for (const m of MISSIVES) {
    const fragment = FRAGMENTS.filter((f) => f.missive === m.id);
    assert.equal(fragment.length, 1, m.id);
    assert.equal(fragment[0].chapter, m.chapter, m.id); // même chapitre que sa missive
    if (m.condition.kind === 'earned') assert.ok(Object.hasOwn(BALANCE.resources, m.condition.resource), m.id);
    else assert.ok(Object.hasOwn(BALANCE.buildings, m.condition.type), m.id);
  }
  assert.deepEqual(MISSIVES.map((m) => m.chapter ?? 1), [...Array(10).fill(1), ...Array(5).fill(2)]);
});

test('missives : une à la fois, dans l\'ordre, progression puis fragment', () => {
  const sim = game([]);
  const journal = new Journal();
  const ids = MISSIVES.map((m) => m.id);
  assert.equal(journal.currentMissive.id, ids[0]);
  assert.deepEqual(missiveProgress(journal.currentMissive, sim), { have: 0, target: 1 });
  assert.deepEqual(journal.update(sim.earned, sim), []);

  sim.buildings.place('library', 0, 0);
  assert.deepEqual(journal.update(sim.earned, sim), [fragmentOf(ids[0])]);
  assert.equal(journal.currentMissive.id, ids[1]);
  assert.deepEqual(missiveProgress(journal.currentMissive, sim), { have: 1, target: 3 });
  sim.buildings.place('library', 3, 0);
  assert.deepEqual(journal.update(sim.earned, sim), []);
  assert.deepEqual(missiveProgress(journal.currentMissive, sim), { have: 2, target: 3 });

  // Un Observatoire posé avant la 3e Bibliothèque ne saute pas l'ordre…
  sim.buildings.place('observatory', 6, 0);
  assert.deepEqual(journal.update(sim.earned, sim), []);
  assert.equal(journal.currentMissive.id, ids[1]);
  // … mais compte dès que sa missive arrive.
  sim.buildings.place('library', 9, 0);
  assert.deepEqual(journal.update(sim.earned, sim), [fragmentOf(ids[1]), fragmentOf(ids[2])]);
  assert.equal(journal.currentMissive.id, ids[3]);

  // Sanctuaire loin de tout : missive 4 accomplie, aucune Bibliothèque renforcée.
  sim.buildings.place('sanctuary', 14, 14);
  assert.deepEqual(journal.update(sim.earned, sim), [fragmentOf(ids[3])]);
  assert.deepEqual(missiveProgress(journal.currentMissive, sim), { have: 0, target: 2 });
  // Sanctuaire en (2,2) : touche les Bibliothèques (0,0) et (3,0), pas (9,0).
  sim.buildings.place('sanctuary', 2, 2);
  assert.equal(sim.boostedCountOf('library'), 2);
  assert.deepEqual(journal.update(sim.earned, sim), [fragmentOf(ids[4])]);
  assert.equal(journal.currentMissive.id, 'fondations-du-phare'); // le Phare prend le relais
  assert.equal(journal.missives, 5);
  assert.equal(journal.unread.size, 5);
  assert.deepEqual(journal.update(sim.earned, sim), []); // rien de plus, pas de double déblocage
});

test('missives : deux Bibliothèques renforcées par deux Sanctuaires distincts comptent', () => {
  const sim = game([['library', 0, 0], ['library', 10, 10], ['sanctuary', 2, 0], ['sanctuary', 12, 10]]);
  assert.equal(sim.boostedCountOf('library'), 2);
  assert.equal(sim.boostedCountOf('sanctuary'), 0);
});

// Sauvegarde réelle de l'étape 8 (format v3) : 3 Bibliothèques, 1 Observatoire,
// 1 Sanctuaire qui n'en renforce qu'une, et deux fragments déjà lus.
const STEP8_SAVE = JSON.stringify({
  version: 3,
  savedAt: 1762000000000,
  sim: { tick: 90000, resources: { knowledge: 12, omens: 3 }, earned: { knowledge: 900, omens: 41 } },
  buildings: {
    nextUid: 6,
    buildings: [
      { uid: 1, type: 'library', x: 2, z: 2, rotation: 0, prodTicks: 4, paused: false },
      { uid: 2, type: 'library', x: 8, z: 2, rotation: 0, prodTicks: 9, paused: false },
      { uid: 3, type: 'library', x: 12, z: 12, rotation: 0, prodTicks: 1, paused: false },
      { uid: 4, type: 'observatory', x: 6, z: 8, rotation: 0, prodTicks: 30, paused: false },
      { uid: 5, type: 'sanctuary', x: 4, z: 2, rotation: 0 },
    ],
  },
  journal: { unlocked: ['note-sans-date', 'registre-des-absents'], unread: [] },
});

test('migration v3 → v7 : une partie avancée rattrape d\'elle-même la bonne missive', () => {
  const data = parseSave(STEP8_SAVE);
  assert.equal(data.version, SAVE_VERSION);
  assert.deepEqual(data.journal, { unlocked: ['note-sans-date', 'registre-des-absents'], unread: [], missives: 0 });

  const reg = new FakeRegistry();
  reg.records = data.buildings.buildings.map((r) => ({ ...r }));
  const sim = new Simulation(reg);
  sim.load(data.sim);
  const journal = new Journal();
  journal.load(data.journal);
  // Au chargement (main.js) : les 4 premières missives sont accomplies d'un coup.
  assert.deepEqual(journal.update(sim.earned, sim), MISSIVES.slice(0, 4).map((m) => fragmentOf(m.id)));
  assert.equal(journal.currentMissive.id, 'lampes-gardees');
  assert.deepEqual(missiveProgress(journal.currentMissive, sim), { have: 1, target: 2 });
  assert.equal(journal.unread.size, 4); // signal ambre, fragments déjà lus inchangés

  // Et l'état obtenu fait l'aller-retour.
  const text = JSON.stringify({ ...JSON.parse(STEP8_SAVE), version: SAVE_VERSION, sim: sim.toJSON(), journal: journal.toJSON(),
    day: { startedAt: 1 }, progress: PROGRESS });
  assert.equal(parseSave(text).journal.missives, 4);
  // Missives retirées du jeu : le compte est ramené au nombre existant.
  const tooMany = { ...JSON.parse(text), journal: { ...journal.toJSON(), missives: 99 } };
  assert.equal(parseSave(JSON.stringify(tooMany)).journal.missives, MISSIVES.length);
});

test('son : gamme pentatonique, limiteur de débit, préférence robuste', () => {
  const root = AUDIO.scale.rootMidi;
  const n = AUDIO.scale.steps.length;
  // Toute note reste dans la gamme, quels que soient le degré et l'octave.
  for (let d = -12; d <= 12; d++) {
    const step = ((scaleMidi(d, 1) - root) % 12 + 12) % 12;
    assert.ok(AUDIO.scale.steps.includes(step), `degré ${d}`);
  }
  assert.equal(scaleMidi(n, 0), root + 12);
  assert.equal(scaleMidi(0, -2), root - 24);

  // 100 Bibliothèques produisant à chaque image pendant 10 s : au plus 3 sons/s.
  const limiter = new RateLimiter(3);
  let played = 0;
  for (let t = 0; t < 10; t += 1 / 60) for (let i = 0; i < 100; i++) if (limiter.take(t)) played++;
  assert.ok(played <= 31 && played >= 29, `${played} sons`);

  assert.deepEqual(parseSoundPref(null), { muted: false, volume: AUDIO.defaultVolume });
  assert.deepEqual(parseSoundPref('pas du json'), { muted: false, volume: AUDIO.defaultVolume });
  assert.deepEqual(parseSoundPref('{"muted":true,"volume":3}'), { muted: true, volume: 1 });
  assert.deepEqual(parseSoundPref('{"muted":"oui","volume":"fort"}'), { muted: false, volume: AUDIO.defaultVolume });
});

// ----- Cycle jour/nuit -----

test('jour/nuit : 8 min, phases dans l\'ordre, transitions continues, nuit lisible', () => {
  assert.equal(CYCLE_SECONDS, 480);
  const seen = [];
  let prev = sampleDay(0);
  for (let t = 0; t < CYCLE_SECONDS * 2; t += 0.5) {
    const s = sampleDay(t);
    if (seen.at(-1) !== s.phase) seen.push(s.phase);
    // Pas de saut brusque d'une demi-seconde à l'autre (transition très progressive).
    assert.ok(Math.abs(s.sunIntensity - prev.sunIntensity) < 0.05, `saut d'intensité à ${t} s`);
    assert.ok(Math.abs(s.night - prev.night) < 0.02, `saut de nuit à ${t} s`);
    // Jamais trop sombre : lumière totale et ciel bornés par le bas.
    assert.ok(s.sunIntensity + s.hemiIntensity >= 2.9, `trop sombre à ${t} s`);
    assert.ok(Math.max(...s.sky) >= 0.2, `ciel trop noir à ${t} s`);
    assert.ok(s.sunDir[1] > 0.2, `lumière sous l'horizon à ${t} s`);
    prev = s;
  }
  assert.deepEqual(seen.slice(0, 5), ['afternoon', 'dusk', 'night', 'dawn', 'afternoon']);
  assert.equal(sampleDay(0).night, 0);
  assert.equal(sampleDay(DAYCYCLE.phases[0].holdSeconds + 50 + 30 + 50 + 10).night, 1);
  assert.deepEqual(sampleDay(-1), sampleDay(CYCLE_SECONDS - 1)); // horloge reculée : pas d'erreur
});

test('jour/nuit : heure = temps réel depuis le début de partie ; figer ramène l\'après-midi', () => {
  let now = 1_000_000;
  const day = new DayCycle({ now: () => now, frozen: false });
  day.load({ startedAt: now - 300_000 }); // partie commencée il y a 5 min
  assert.equal(day.update().phase, 'night');
  assert.deepEqual(day.toJSON(), { startedAt: now - 300_000 });
  day.frozen = true;
  const mid = day.update(DAYCYCLE.freezeFadeSeconds / 2); // glisse, pas de saut
  assert.ok(mid.night > 0 && mid.night < 1);
  const fixed = day.update(DAYCYCLE.freezeFadeSeconds);
  assert.deepEqual(fixed, { ...sampleDay(0), phase: 'afternoon' });
  now += 120_000; // le temps passe, l'heure affichée reste figée
  assert.deepEqual(day.update(0.1), fixed);
  assert.deepEqual(parseDayPref('{"frozen":true}'), { frozen: true });
  assert.deepEqual(parseDayPref('n\'importe quoi'), { frozen: false });
});

// ----- Étape 16 : coûts croissants, terrain 24x24, place gardée pour le Phare -----

test('coûts croissants : base × costGrowth^n, première Bibliothèque gratuite', () => {
  const sim = game([]);
  const lib = BALANCE.buildings.library;
  assert.deepEqual(sim.costOf('library'), {});
  for (let n = 1; n <= 6; n++) {
    sim.buildings.place('library', 0, 0, { prodTicks: 0, paused: false });
    assert.deepEqual(sim.costOf('library'), { knowledge: Math.round(lib.cost.knowledge * lib.costGrowth ** (n - 1)) });
  }
  const obs = BALANCE.buildings.observatory;
  assert.deepEqual(sim.costOf('observatory'), obs.cost);
  sim.buildings.place('observatory', 0, 0, { prodTicks: 0, paused: false });
  assert.deepEqual(sim.costOf('observatory'), { knowledge: Math.round(obs.cost.knowledge * obs.costGrowth) });
  // La pose paie le coût du moment, puis le suivant augmente.
  sim.resources.knowledge = 1e6;
  const next = sim.costOf('library').knowledge;
  sim.placeBuilding('library', 0, 0);
  assert.equal(sim.resources.knowledge, 1e6 - next);
  assert.ok(sim.costOf('library').knowledge > next);
  for (const rules of Object.values(BALANCE.buildings)) if (rules.cost) assert.ok(rules.costGrowth > 1);
});

// Terrain réel (occupation case par case) : même contrat que BuildingManager.
class GridRegistry extends FakeRegistry {
  constructor(size) {
    super();
    this.size = size;
  }
  free(x, z, w, d) {
    if (x < 0 || z < 0 || x + w > this.size || z + d > this.size) return false;
    return !this.records.some((r) => {
      const f = BALANCE.buildings[r.type].footprint;
      return x < r.x + f.w && r.x < x + w && z < r.z + f.d && r.z < z + d;
    });
  }
  canPlace(type, x, z) {
    const { w, d } = BALANCE.buildings[type].footprint;
    return this.free(x, z, w, d) ? { ok: true } : { ok: false, reason: 'occupied' };
  }
  hasFreeArea({ w, d }, except) {
    for (let z = 0; z + d <= this.size; z++) {
      for (let x = 0; x + w <= this.size; x++) {
        const hit = except && x < except.x + except.w && except.x < x + w && z < except.z + except.d && except.z < z + d;
        if (!hit && this.free(x, z, w, d)) return true;
      }
    }
    return false;
  }
}

test('place du Phare : refus doux de la pose qui supprimerait la dernière zone 2x2 libre', () => {
  // Terrain 4x4 : trois Bibliothèques, il reste le carré (2,2)-(3,3).
  const sim = new Simulation(new GridRegistry(4));
  for (const [x, z] of [[0, 0], [2, 0], [0, 2]]) sim.buildings.place('library', x, z, { prodTicks: 0, paused: false });
  sim.resources.knowledge = 1e6;
  sim.resources.omens = 1e6;
  sim.buildings.place('observatory', 3, 3, { prodTicks: 0, paused: false }); // le carré est entamé…
  assert.equal(sim.canPlace('observatory', 2, 2).ok, false);
  sim.buildings.records.pop(); // … retiré : le carré est libre
  assert.deepEqual(sim.canPlace('observatory', 2, 2), { ok: false, reason: 'room' });
  assert.deepEqual(sim.canPlace('library', 2, 2), { ok: false, reason: 'room' });
  // Le Phare lui-même peut s'y poser ; ensuite, plus de réserve.
  sim.story.missives = 5;
  assert.ok(sim.placeBuilding('lighthouse', 2, 2));
  // Terrain plus grand : une pose qui laisse une autre place 2x2 est acceptée.
  const big = new Simulation(new GridRegistry(6));
  big.resources.knowledge = 1e6;
  big.buildings.place('library', 0, 0, { prodTicks: 0, paused: false });
  big.buildings.place('library', 0, 2, { prodTicks: 0, paused: false });
  big.buildings.place('observatory', 2, 0, { prodTicks: 0, paused: false });
  assert.equal(big.canPlace('observatory', 2, 2).ok, true);
  // Registre sans hasFreeArea (tests du moteur) : pas de contrôle.
  assert.equal(new Simulation(new FakeRegistry()).leavesRoom('library', 0, 0), true);
});

// Sauvegarde réelle de l'étape 14 (format v6, terrain 16x16), Phare au coin.
const STEP14_SAVE = JSON.stringify({
  version: 6,
  savedAt: 1764000000000,
  sim: { tick: 90000, resources: { knowledge: 812, omens: 95 }, earned: { knowledge: 9000, omens: 700 } },
  buildings: {
    nextUid: 6,
    buildings: [
      { uid: 1, type: 'library', x: 0, z: 0, rotation: 0, prodTicks: 7, paused: false },
      { uid: 2, type: 'library', x: 3, z: 0, rotation: 0, prodTicks: 2, paused: false },
      { uid: 3, type: 'observatory', x: 15, z: 0, rotation: 0, prodTicks: 40, paused: true },
      { uid: 4, type: 'sanctuary', x: 2, z: 2, rotation: 0 },
      { uid: 5, type: 'lighthouse', x: 14, z: 14, rotation: 0, stage: 3 },
    ],
  },
  journal: { unlocked: ['note-sans-date'], unread: [], missives: 7 },
  day: { startedAt: 1763990000000 },
});

test('migration v6 → v7 : terrain 24x24, bâtiments recentrés à la même place dans le monde', () => {
  const old = JSON.parse(STEP14_SAVE);
  const data = parseSave(STEP14_SAVE);
  assert.equal(data.version, SAVE_VERSION);
  const shift = (24 - 16) / 2;
  assert.deepEqual(data.buildings.buildings, old.buildings.buildings.map((r) => v12({ ...r, x: r.x + shift, z: r.z + shift })));
  assert.deepEqual(data.sim, { ...old.sim, visitors: 0, // v8 : aucun visiteur avant l'étape 17
    resources: { ...old.sim.resources, relics: 0 }, earned: { ...old.sim.earned, relics: 0 }, islands: [] }); // v10, v11
  assert.equal(data.journal.missives, 7);
  // Centre monde inchangé (grille centrée sur l'origine) et tout reste dans le terrain.
  const center = (r, size) => r.x + BALANCE.buildings[r.type].footprint.w / 2 - size / 2;
  data.buildings.buildings.forEach((r, i) => {
    assert.equal(center(r, 24), center(old.buildings.buildings[i], 16));
    const f = BALANCE.buildings[r.type].footprint;
    assert.ok(r.x >= 0 && r.z >= 0 && r.x + f.w <= 24 && r.z + f.d <= 24);
  });
  // Se charge sur le terrain réel sans chevauchement, et la partie continue.
  const reg = new GridRegistry(24);
  for (const r of data.buildings.buildings) {
    assert.ok(reg.canPlace(r.type, r.x, r.z).ok);
    reg.records.push({ ...r });
  }
  const sim = new Simulation(reg, { missives: 7 });
  sim.load(data.sim);
  assert.equal(sim.stageOf('lighthouse'), 3);
  // Aller-retour v7 : pas de second décalage.
  const again = parseSave(JSON.stringify({ ...old, version: SAVE_VERSION, sim: data.sim, buildings: data.buildings, progress: PROGRESS }));
  assert.deepEqual(again.buildings.buildings, data.buildings.buildings);
});

test('Visiteurs du lac : cadeau = 30 s de production actuelle de Savoirs, Présages plus rares', () => {
  const gift = BALANCE.visitors.gift;
  // Aucune Bibliothèque : plancher.
  assert.deepEqual(game([]).catchVisitor(() => 0.5), { knowledge: gift.minKnowledge });
  // Bibliothèque renforcée par un Sanctuaire + une seule, Phare au palier 2 (+20 %).
  const layout = [['library', 0, 0], ['sanctuary', 2, 0], ['library', 10, 10], ['lighthouse', 20, 20, 2]];
  const sim = game(layout);
  const expected = Math.round(((2 * 1.2 + 1 * 1.2) / 2) * gift.seconds);
  assert.deepEqual(sim.visitorGift(() => 0.5), { knowledge: expected });
  // Identique à ce que la même partie produit réellement en `gift.seconds` de jeu.
  const live = game(layout);
  continuous(live, gift.seconds, 60);
  assert.equal(live.earned.knowledge, expected);
  // Jamais de Présages tant qu'on n'en a jamais obtenu.
  assert.ok(sim.visitorGift(() => 0).knowledge);
  // Puis, plus rarement, quelques Présages (bornes de balance.js).
  sim.earned.omens = 1;
  const rolls = (...values) => () => values.shift();
  assert.deepEqual(sim.visitorGift(rolls(0, 0)), { omens: gift.omens.min });
  assert.deepEqual(sim.visitorGift(rolls(0, 0.9999)), { omens: gift.omens.max });
  assert.ok(sim.visitorGift(rolls(gift.omensChance, 0)).knowledge);
  // Attraper crédite le solde ET le total cumulé, et compte le visiteur.
  const before = { ...sim.resources };
  sim.catchVisitor(rolls(0, 0));
  assert.equal(sim.resources.omens, before.omens + gift.omens.min);
  assert.equal(sim.earned.omens, 1 + gift.omens.min);
  assert.equal(sim.visitors, 1);
  // Intervalles et durée cohérents.
  const v = BALANCE.visitors;
  assert.ok(v.intervalSeconds.min > v.lifetimeSeconds && v.intervalSeconds.max >= v.intervalSeconds.min);
});

test('Visiteurs du lac : fragment caché après 10, compte sauvegardé', () => {
  const sim = game([['library', 0, 0]]);
  const journal = new Journal();
  journal.update(sim.earned, sim); // première missive (une Bibliothèque)
  for (let i = 0; i < 9; i++) sim.catchVisitor(() => 0.5);
  assert.deepEqual(journal.update(sim.earned, sim), []);
  sim.catchVisitor(() => 0.5);
  assert.deepEqual(journal.update(sim.earned, sim), ['visiteurs-du-lac']);
  assert.ok(FRAGMENTS.find((f) => f.id === 'visiteurs-du-lac').hidden);
  // Aller-retour, puis compte invalide refusé.
  const save = (simState) => JSON.stringify({ version: SAVE_VERSION, savedAt: 1, sim: simState,
    buildings: { nextUid: 2, buildings: sim.buildings.records }, journal: journal.toJSON(), day: { startedAt: 1 }, progress: PROGRESS });
  const data = parseSave(save(sim.toJSON()));
  assert.equal(data.sim.visitors, 10);
  const back = game([['library', 0, 0]]);
  back.load(data.sim);
  assert.equal(back.visitors, 10);
  for (const visitors of [-1, 2.5, '3', undefined]) {
    assert.throws(() => parseSave(save({ ...sim.toJSON(), visitors })), /visiteurs/);
  }
});

// Sauvegarde réelle de l'étape 17 (format v8) : Phare achevé, fin pas encore vue.
const STEP17_SAVE = JSON.stringify({
  version: 8,
  savedAt: 1790000000000,
  sim: { tick: 42000, resources: { knowledge: 1200, omens: 40 }, earned: { knowledge: 98000, omens: 2600 }, visitors: 7 },
  buildings: {
    nextUid: 3,
    buildings: [
      { uid: 1, type: 'library', x: 4, z: 4, rotation: 0, prodTicks: 3, paused: false },
      { uid: 2, type: 'lighthouse', x: 12, z: 12, rotation: 0, stage: 5 },
    ],
  },
  journal: { unlocked: ['lumiere-promise'], unread: [], missives: 10 },
  day: { startedAt: 1789990000000 },
});

test('migration v8 → v9 : durée de jeu estimée, fin pas encore vue', () => {
  const data = parseSave(STEP17_SAVE);
  const old = JSON.parse(STEP17_SAVE);
  assert.equal(data.version, SAVE_VERSION);
  // 42000 ticks = 4200 s, borné par les 10000 s écoulées depuis le début de partie.
  assert.deepEqual(data.progress, { playSeconds: 4200, finished: false });
  assert.deepEqual(data.sim, { ...old.sim, resources: { ...old.sim.resources, relics: 0 },
    earned: { ...old.sim.earned, relics: 0 }, islands: [] }); // v10, v11
  assert.deepEqual(data.buildings.buildings, old.buildings.buildings.map(v12));
  // Borne : début de partie récent → durée = temps écoulé.
  const recent = parseSave(JSON.stringify({ ...old, day: { startedAt: old.savedAt - 600000 } }));
  assert.equal(recent.progress.playSeconds, 600);
  // Aller-retour v9, puis fil invalide refusé.
  const back = parseSave(JSON.stringify({ ...data, progress: { playSeconds: 4321.5, finished: true } }));
  assert.deepEqual(back.progress, { playSeconds: 4321.5, finished: true });
  for (const progress of [undefined, { playSeconds: -1, finished: false }, { playSeconds: 1, finished: 'oui' },
    { finished: true }, { playSeconds: Infinity, finished: false }]) {
    assert.throws(() => parseSave(JSON.stringify({ ...data, progress })), /fil de la partie/, JSON.stringify(progress));
  }
});

test('fin de partie : durée de jeu bornée par image, textes et résumé', () => {
  const p = new Progress();
  p.tick(0.016);
  p.tick(3600); // onglet figé : une image ne compte jamais plus d'1 s
  p.tick(-2);
  assert.ok(Math.abs(p.playSeconds - 1.016) < 1e-9);
  p.finished = true;
  const q = new Progress();
  q.load(p.toJSON());
  assert.deepEqual(q.toJSON(), p.toJSON());
  assert.equal(formatDuration(30), 'moins d\'une minute');
  assert.equal(formatDuration(125), '2 min');
  assert.equal(formatDuration(3725), '1 h 02 min');
  const n = ENDING.letter.paragraphs.length;
  assert.ok(n >= 4 && n <= 5);
  const rows = ENDING.summary.rows({ playSeconds: 3725, buildings: 12, knowledge: 98000.7, omens: 2600.2, visitors: 7 });
  assert.deepEqual(rows.map(([, v]) => v), ['1 h 02 min', '12', '98000', '2600', '7']);
});

test('fin de partie : la nuit tombe en quelques secondes puis le cycle reprend', () => {
  let now = 0;
  const day = new DayCycle({ now: () => now, frozen: false });
  const steps = (seconds) => {
    let s;
    for (let t = 0; t < seconds; t += 0.1) s = day.update(0.1);
    return s;
  };
  assert.equal(day.update(0).night, 0); // après-midi
  day.holdNight(true);
  assert.equal(steps(DAYCYCLE.ending.fallSeconds + 0.2).night, 1);
  assert.equal(steps(30).night, 1); // la nuit tient tant que la séquence dure
  day.holdNight(false);
  const half = steps(DAYCYCLE.ending.releaseSeconds / 2).night;
  assert.ok(half > 0 && half < 1);
  assert.deepEqual(steps(DAYCYCLE.ending.releaseSeconds), day.update(0)); // retour au cycle réel
  assert.equal(day.update(0).night, sampleDay(0).night);
});

test('qualité : préférence, choix automatique, descente durable sans va-et-vient', () => {
  assert.deepEqual(parseQualityPref(null), { choice: 'auto', fps: false });
  assert.deepEqual(parseQualityPref('{"choice":"ultra","fps":1}'), { choice: 'auto', fps: false });
  assert.deepEqual(parseQualityPref('{"choice":"low","fps":true}'), { choice: 'low', fps: true });
  assert.deepEqual(parseQualityPref('{"choice":"high","fps":"detail"}'), { choice: 'high', fps: 'detail' });
  for (const level of QUALITY.order) {
    const q = QUALITY.levels[level];
    assert.ok(q.label && q.shadowMap > 0 && q.waterLights >= 1 && q.sparkle < 1, level);
  }

  const run = (q, fps, seconds, active = true) => {
    for (let t = 0; t < seconds; t += 1 / fps) q.frame(1 / fps, active);
  };
  const auto = (fps) => {
    const changes = [];
    const q = new QualityManager({ pref: { choice: 'auto', fps: false }, onChange: (l) => changes.push(l) });
    run(q, fps, 10);
    return { q, changes };
  };
  assert.equal(auto(60).q.level, 'high');
  assert.equal(auto(45).q.level, 'normal');
  assert.equal(auto(20).q.level, 'low');

  // Rien n'est mesuré hors jeu (écran titre), ni pour les images trop longues (onglet masqué).
  const idle = new QualityManager({ pref: { choice: 'auto', fps: false } });
  run(idle, 10, 30, false);
  for (let i = 0; i < 50; i++) idle.frame(2, true);
  assert.equal(idle.measured, false);

  // Haute, puis chute durable : un seul cran ; une courte saccade ne change rien ; jamais de remontée.
  const { q, changes } = auto(60);
  run(q, 15, QUALITY.auto.dropSeconds / 2);
  run(q, 60, 60);
  assert.equal(q.level, 'high');
  run(q, 15, QUALITY.auto.dropSeconds + 2);
  assert.equal(q.level, 'normal');
  run(q, 15, QUALITY.auto.dropSeconds + 2); // trop tôt après le changement (dwell)
  assert.equal(q.level, 'normal');
  run(q, 60, 120);
  assert.equal(q.level, 'normal');
  assert.deepEqual(changes, ['high', 'normal']);

  // Niveau fixé : jamais modifié par la mesure.
  const fixed = new QualityManager({ pref: { choice: 'high', fps: false } });
  run(fixed, 10, 60);
  assert.equal(fixed.level, 'high');
});

// ----- Chapitre II : l'Embarcadère et les Reliques -----

// Partie terminée de l'étape 20 (format v9, sans Reliques).
const STEP20_SAVE = JSON.stringify({
  version: 9,
  savedAt: 1792000000000,
  sim: { tick: 40000, resources: { knowledge: 9000, omens: 900 }, earned: { knowledge: 120000, omens: 9000 }, visitors: 3 },
  buildings: {
    nextUid: 4,
    buildings: [
      { uid: 1, type: 'library', x: 4, z: 4, rotation: 0, prodTicks: 3, paused: false },
      { uid: 2, type: 'observatory', x: 8, z: 8, rotation: 0, prodTicks: 10, paused: false },
      { uid: 3, type: 'lighthouse', x: 12, z: 12, rotation: 0, stage: 5 },
    ],
  },
  journal: { unlocked: ['lumiere-promise'], unread: [], missives: 10 },
  day: { startedAt: 1791990000000 },
  progress: { playSeconds: 3600, finished: true },
});

test('migration v9 → v10 : Reliques à zéro, chapitre II ouvert à une partie terminée', () => {
  const data = parseSave(STEP20_SAVE);
  const old = JSON.parse(STEP20_SAVE);
  assert.equal(data.version, SAVE_VERSION);
  assert.deepEqual(data.sim.resources, { ...old.sim.resources, relics: 0 });
  assert.deepEqual(data.sim.earned, { ...old.sim.earned, relics: 0 });
  assert.deepEqual(data.buildings.buildings, old.buildings.buildings.map(v12));
  assert.deepEqual(data.progress, old.progress);
  // Aller-retour : une Relique gagnée est conservée.
  const back = parseSave(JSON.stringify({ ...data, sim: { ...data.sim, resources: { ...data.sim.resources, relics: 7 } } }));
  assert.equal(back.sim.resources.relics, 7);

  const reg = new FakeRegistry();
  reg.records = data.buildings.buildings.map((r) => ({ ...r }));
  const journal = new Journal();
  journal.load(data.journal);
  const story = { get missives() { return journal.missives; }, finished: data.progress.finished };
  const sim = new Simulation(reg, story);
  sim.load(data.sim);
  journal.update(sim.earned, sim);
  assert.equal(journal.currentMissive.id, 'rouvrir-l-embarcadere');
  assert.ok(sim.isUnlocked('embarcadere'));
  story.finished = false;
  assert.deepEqual(sim.missingUnlocks('embarcadere'), [{ kind: 'finished' }]);
});

test('Embarcadère : bord du terrain seulement, coût géométrique, 3 Présages → 1 Relique, pause', () => {
  const reg = new FakeRegistry();
  const terrain = new Terrain(24);
  reg.touchesEdge = (...a) => terrain.touchesEdge(...a);
  const story = { missives: 10, finished: true };
  const sim = new Simulation(reg, story);
  const rules = BALANCE.buildings.embarcadere;
  Object.assign(sim.resources, { knowledge: 1e6, omens: 0 });
  sim.resources.omens = rules.cost.omens * 3;
  assert.equal(sim.canPlace('embarcadere', 5, 5).reason, 'edge');
  for (const [x, z] of [[0, 5], [23, 7], [6, 0], [9, 23]]) assert.ok(sim.canPlace('embarcadere', x, z).ok, `${x},${z}`);
  const first = sim.placeBuilding('embarcadere', 0, 5);
  assert.deepEqual(sim.costOf('embarcadere'),
    Object.fromEntries(Object.entries(rules.cost).map(([r, n]) => [r, Math.round(n * rules.costGrowth)])));
  sim.resources.omens = 3;
  const interval = rules.production.intervalSeconds;
  sim.advance(0); // rien
  for (let t = 0; t < interval; t += 0.5) sim.advance(0.5);
  assert.equal(sim.resources.relics, 1);
  assert.equal(sim.resources.omens, 0);
  for (let t = 0; t < interval; t += 0.5) sim.advance(0.5);
  assert.equal(first.paused, true);  // plus de Présages : barque à quai, rien consommé
  assert.equal(sim.resources.relics, 1);
  sim.resources.omens = 3;
  sim.advance(0.1);
  assert.equal(first.paused, false);
  assert.equal(sim.resources.relics, 2);
  assert.equal(sim.earned.relics, 2);
});

test('chapitre II : missives « earned » sur les Reliques cumulées, fragments du chapitre II', () => {
  const journal = new Journal();
  journal.missives = 10;
  const world = { earned: { relics: 0 }, countOf: (t) => (t === 'embarcadere' ? 2 : 0), visitors: 0 };
  journal.update(world.earned, world);
  assert.equal(journal.currentMissive.id, 'premieres-reliques'); // 1 embarcadère déjà là : accomplie
  const target = journal.currentMissive.condition.count;
  world.earned.relics = target - 0.5;
  assert.deepEqual(missiveProgress(journal.currentMissive, world), { have: target - 1, target });
  world.earned.relics = 1e9;
  const fresh = journal.update(world.earned, world);
  assert.equal(journal.currentMissive, null);
  assert.ok(FRAGMENTS.filter((f) => f.chapter === 2 && !f.island).every((f) => journal.isUnlocked(f.id)));
  assert.ok(fresh.includes('la-releve'));
});

// ----- Étape 22 : îlots du lac -----

// Registre sur le vrai terrain (zones, occupation case par case) : même contrat que BuildingManager.
class TerrainRegistry extends FakeRegistry {
  constructor() {
    super();
    this.terrain = new Terrain(GRID.size);
  }
  canPlace(type, x, z, except = null) {
    const { w, d } = BALANCE.buildings[type].footprint;
    const problem = this.terrain.footprintProblem(x, z, w, d, except);
    return problem ? { ok: false, reason: problem } : { ok: true };
  }
  place(type, x, z, extra = {}) {
    if (!this.canPlace(type, x, z).ok) return null;
    const record = super.place(type, x, z, extra);
    const { w, d } = BALANCE.buildings[type].footprint;
    for (const tile of this.terrain.footprintTiles(x, z, w, d)) tile.occupant = record.uid;
    return record;
  }
  // Même contrat que BuildingManager.move : cases libérées puis occupées, uid et champs de cycle conservés.
  move(uid, x, z) {
    const record = this.records.find((r) => r.uid === uid);
    if (!record || !this.canPlace(record.type, x, z, uid).ok) return null;
    const { w, d } = BALANCE.buildings[record.type].footprint;
    for (const tile of this.terrain.footprintTiles(record.x, record.z, w, d)) tile.occupant = null;
    Object.assign(record, { x, z });
    for (const tile of this.terrain.footprintTiles(x, z, w, d)) tile.occupant = uid;
    return record;
  }
  hasFreeArea(f, except, ignore) { return this.terrain.hasFreeArea(f, except, ignore); }
  touchesEdge(...a) { return this.terrain.touchesEdge(...a); }
  setOpenIslands(ids) { this.terrain.setOpenIslands(ids); }
}

test('terrain en zones : le domaine se comporte comme l\'ancienne grille, îlots fermés par défaut', () => {
  const t = new Terrain(24);
  // Domaine : mêmes bornes, mêmes cases (ordre z, x), même bord.
  assert.equal(t.tiles.slice(0, 24 * 24).every((tile, i) => tile.x === i % 24 && tile.z === Math.floor(i / 24)), true);
  for (let z = -15; z < 40; z++) {
    for (let x = -15; x < 40; x++) assert.equal(t.inBounds(x, z), x >= 0 && z >= 0 && x < 24 && z < 24, `${x},${z}`);
  }
  for (const [x, z, edge] of [[0, 5, true], [23, 7, true], [6, 0, true], [9, 23, true], [5, 5, false], [22, 22, false]]) {
    assert.equal(t.touchesEdge(x, z, 1, 1), edge);
  }
  assert.equal(t.touchesEdge(22, 22, 2, 2), true);
  assert.equal(t.footprintProblem(23, 5, 2, 2), 'bounds');
  // Îlot rallié : ses cases existent, son bord compte pour l'Embarcadère, pas de chevauchement entre zones.
  const isle = ISLANDS[0];
  assert.equal(t.getTile(isle.x, isle.z), null);
  t.setOpenIslands([isle.id]);
  assert.equal(t.getTile(isle.x, isle.z).zone, isle.id);
  assert.equal(t.touchesEdge(isle.x, isle.z + 2, 1, 1), true);
  assert.equal(t.touchesEdge(isle.x + 2, isle.z + 2, 1, 1), false);
  assert.equal(t.footprintProblem(isle.x + isle.size - 1, isle.z, 2, 2), 'bounds');
  assert.equal(t.footprintProblem(isle.x, isle.z, 2, 2), null);
  const b = t.worldBounds();
  assert.ok(b.xMax >= (isle.x + isle.size) - 12 && b.xMin === -12);
});

test('îlots : écart d\'eau entre zones plus large que toute aura, côtés et positions fixes', () => {
  const zones = new Terrain(24).zones;
  const maxRadius = Math.max(...Object.values(BALANCE.buildings).map((r) => r.aura?.radius ?? 0));
  for (let i = 0; i < zones.length; i++) {
    for (let j = i + 1; j < zones.length; j++) {
      const a = zones[i];
      const c = zones[j];
      const gap = Math.max(c.x - (a.x + a.w), a.x - (c.x + c.w), c.z - (a.z + a.d), a.z - (c.z + c.d));
      assert.ok(gap >= 4 && gap > maxRadius + 1, `${a.id} / ${c.id} : ${gap}`);
    }
  }
  for (const isle of ISLANDS) assert.ok(isle.size >= 6 && isle.size <= 8, isle.id);
  assert.equal(BALANCE.islands.costs.length, ISLANDS.length);
  for (let i = 1; i < BALANCE.islands.costs.length; i++) assert.ok(BALANCE.islands.costs[i].relics > BALANCE.islands.costs[i - 1].relics);
  assert.equal(MISSIVES[BALANCE.islands.unlock.missives - 1].id, 'second-embarcadere'); // 3e missive du chapitre II
});

test('îlots : visibles après la 3e missive du chapitre II, ralliés en Reliques, fragment révélé', () => {
  const reg = new TerrainRegistry();
  const journal = new Journal();
  journal.missives = BALANCE.islands.unlock.missives - 1;
  const story = { get missives() { return journal.missives; }, finished: true };
  const sim = new Simulation(reg, story);
  const [first, second] = BALANCE.islands.costs.map((c) => c.relics);
  sim.resources.relics = first + second;
  assert.equal(sim.islandsRevealed(), false);
  assert.equal(sim.rallyIsland('aulnes').reason, 'hidden');
  journal.missives++;
  assert.equal(sim.islandsRevealed(), true);
  assert.equal(sim.canRally('nulle-part').reason, 'unknown');
  const isle = ISLANDS.find((i) => i.id === 'ruines');
  assert.equal(sim.canPlace('library', isle.x, isle.z).reason, 'bounds');
  assert.ok(sim.rallyIsland('ruines').ok); // le premier rallié coûte costs[0], quel qu'il soit
  assert.equal(sim.resources.relics, second);
  assert.deepEqual(sim.islands, ['ruines']);
  assert.equal(sim.rallyIsland('ruines').reason, 'rallied');
  assert.deepEqual(sim.islandCost(), BALANCE.islands.costs[1]);
  // Le fragment de l'îlot se révèle ; les autres restent cachés.
  journal.update(sim.earned, sim);
  assert.ok(journal.isUnlocked('chapelle-sans-toit'));
  assert.equal(journal.isUnlocked('cabane-des-aulnes'), false);
  // Ses cases sont constructibles ; Sanctuaire et Bibliothèque voisins sur l'îlot ; Embarcadère sur son bord.
  sim.resources.knowledge = 1e7;
  sim.resources.omens = 1e6;
  const lib = sim.placeBuilding('library', isle.x + 2, isle.z + 2);
  assert.ok(lib);
  reg.place('library', 2, 2, { prodTicks: 0, paused: false }); // déblocages
  reg.place('observatory', 0, 0, { prodTicks: 0, paused: false });
  assert.ok(sim.placeBuilding('sanctuary', isle.x + 4, isle.z + 2));
  assert.deepEqual(sim.boosts().get(lib.uid), { knowledge: 1 });
  assert.equal(sim.canPlace('embarcadere', isle.x + 5, isle.z + 5).reason, 'edge');
  assert.ok(sim.canPlace('embarcadere', isle.x + 3, isle.z + isle.size - 1).ok);
  // Prix suivant, faute de Reliques.
  sim.resources.relics = second - 1;
  assert.equal(sim.rallyIsland('aulnes').reason, 'cost');
  sim.resources.relics = second;
  assert.ok(sim.rallyIsland('aulnes').ok);
});

test('îlots : la réserve du Phare compte toutes les zones ouvertes', () => {
  const reg = new TerrainRegistry();
  const sim = new Simulation(reg, { missives: 13, finished: false });
  // Domaine rempli de Bibliothèques sauf une place 2x2 au coin.
  for (let z = 0; z < 24; z += 2) for (let x = 0; x < 24; x += 2) if (!(x === 22 && z === 22)) reg.place('library', x, z, { prodTicks: 0, paused: false });
  sim.resources.knowledge = 1e15;
  assert.equal(sim.canPlace('library', 22, 22).reason, 'room');
  sim.resources.relics = 1000;
  assert.ok(sim.rallyIsland('roseaux').ok);
  assert.deepEqual(sim.canPlace('library', 22, 22), { ok: true }); // le Phare tiendrait sur l'îlot
});

// Sauvegarde réelle de l'étape 21 (format v10) : chapitre II en cours, Embarcadère au bord.
const STEP21_SAVE = JSON.stringify({
  version: 10,
  savedAt: 1793000000000,
  sim: { tick: 60000, resources: { knowledge: 4000, omens: 300, relics: 42 },
    earned: { knowledge: 200000, omens: 15000, relics: 120 }, visitors: 4 },
  buildings: {
    nextUid: 5,
    buildings: [
      { uid: 1, type: 'library', x: 4, z: 4, rotation: 0, prodTicks: 3, paused: false },
      { uid: 2, type: 'observatory', x: 8, z: 8, rotation: 0, prodTicks: 10, paused: false },
      { uid: 3, type: 'lighthouse', x: 12, z: 12, rotation: 0, stage: 5 },
      { uid: 4, type: 'embarcadere', x: 0, z: 9, rotation: 0, prodTicks: 40, paused: false },
    ],
  },
  journal: { unlocked: ['lumiere-promise', 'lignes-du-poteau'], unread: [], missives: 14 },
  day: { startedAt: 1792990000000 },
  progress: { playSeconds: 5400, finished: true },
});

test('migration v10 → v11 : aucun îlot rallié, partie identique ; aller-retour avec un îlot bâti', () => {
  const old = JSON.parse(STEP21_SAVE);
  const data = parseSave(STEP21_SAVE);
  assert.equal(data.version, SAVE_VERSION);
  assert.deepEqual(data.sim, { ...old.sim, islands: [] });
  assert.deepEqual(data.buildings, { ...old.buildings, buildings: old.buildings.buildings.map(v12) });
  assert.deepEqual(data.journal, old.journal);
  assert.deepEqual(data.progress, old.progress);
  // Se charge sur le vrai terrain ; les îlots apparaissent (14 missives) sans être ralliés.
  const reg = new TerrainRegistry();
  reg.setOpenIslands(data.sim.islands);
  for (const r of data.buildings.buildings) assert.ok(reg.place(r.type, r.x, r.z, r));
  const sim = new Simulation(reg, { missives: data.journal.missives, finished: true });
  sim.load(data.sim);
  assert.equal(sim.islandsRevealed(), true);
  assert.deepEqual(sim.islands, []);
  // Un îlot rallié et bâti : il se recharge, ses cases ouvertes avant ses bâtiments.
  sim.rallyIsland('aulnes');
  const isle = ISLANDS[0];
  const lib = reg.place('library', isle.x, isle.z, { prodTicks: 0, paused: false });
  const text = JSON.stringify({ ...old, version: SAVE_VERSION, sim: sim.toJSON(),
    buildings: { nextUid: reg.nextUid, buildings: reg.records } });
  const back = parseSave(text);
  assert.deepEqual(back.sim.islands, ['aulnes']);
  const reg2 = new TerrainRegistry();
  assert.equal(reg2.canPlace('library', lib.x, lib.z).reason, 'bounds'); // fermé tant que non chargé
  reg2.setOpenIslands(back.sim.islands);
  for (const r of back.buildings.buildings) assert.ok(reg2.place(r.type, r.x, r.z, r));
  // Îlots invalides : inconnu, en double.
  for (const islands of [['atlantide'], ['aulnes', 'aulnes'], 'aulnes']) {
    assert.throws(() => parseSave(JSON.stringify({ ...JSON.parse(text), sim: { ...back.sim, islands } })));
  }
  assert.deepEqual(ISLAND_IDS.length, 3);
});

// ----- TODO 3 : mode économie d'énergie (pose automatique, débit par minute) -----

// Pose automatique jusqu'à épuisement : renvoie le refus final.
function fillAuto(sim, reg, type) {
  for (;;) {
    const spot = autoSpot(sim, reg.terrain, type);
    if (!spot.ok) return spot;
    assert.ok(sim.placeBuilding(type, spot.x, spot.z), `${type} en ${spot.x},${spot.z}`);
  }
}

test('pose automatique : refus sans position (verrou, coût, unique), domaine compact', () => {
  const reg = new TerrainRegistry();
  const sim = new Simulation(reg, { missives: 0, finished: false });
  assert.equal(autoSpot(sim, reg.terrain, 'observatory').reason, 'locked');
  assert.equal(autoSpot(sim, reg.terrain, 'embarcadere').reason, 'locked');
  const first = autoSpot(sim, reg.terrain, 'library'); // gratuite
  assert.deepEqual(first, { ok: true, x: 11, z: 11 }); // au centre du domaine
  sim.placeBuilding('library', first.x, first.z);
  assert.equal(autoSpot(sim, reg.terrain, 'library').reason, 'cost');
  sim.resources.knowledge = 1e6;
  const next = autoSpot(sim, reg.terrain, 'library');
  assert.ok(next.ok && Math.hypot(next.x + 1 - 12, next.z + 1 - 12) <= 3); // collée à la première
  sim.story.missives = 5;
  sim.resources.omens = 1e6;
  const lh = autoSpot(sim, reg.terrain, 'lighthouse');
  sim.placeBuilding('lighthouse', lh.x, lh.z);
  assert.equal(autoSpot(sim, reg.terrain, 'lighthouse').reason, 'unique');
});

test('pose automatique : la place du Phare reste libre, puis le Phare s\'y pose', () => {
  const reg = new TerrainRegistry();
  const sim = new Simulation(reg, { missives: 5, finished: false });
  sim.resources.knowledge = Infinity;
  sim.resources.omens = Infinity;
  const end = fillAuto(sim, reg, 'library');
  assert.equal(end.reason, 'room');
  assert.ok(reg.terrain.hasFreeArea({ w: 2, d: 2 }));
  assert.equal(fillAuto(sim, reg, 'observatory').reason, 'room'); // 1x1 : même réserve
  const lh = autoSpot(sim, reg.terrain, 'lighthouse');
  assert.ok(lh.ok && sim.placeBuilding('lighthouse', lh.x, lh.z));
  assert.equal(autoSpot(sim, reg.terrain, 'observatory').reason, 'full');
  // Toutes les poses ont respecté le terrain : aucune case hors du domaine.
  for (const r of reg.records) assert.ok(r.x >= 0 && r.z >= 0 && r.x < 24 && r.z < 24);
});

test('pose automatique : Embarcadère au bord, îlots seulement une fois ralliés', () => {
  const reg = new TerrainRegistry();
  const sim = new Simulation(reg, { missives: 13, finished: true });
  sim.resources.knowledge = Infinity;
  sim.resources.omens = Infinity;
  sim.resources.relics = Infinity;
  reg.place('lighthouse', 11, 11, { stage: 5 }); // plus de réserve à garder
  const end = fillAuto(sim, reg, 'embarcadere');
  assert.equal(end.reason, 'edge');
  const docks = reg.records.filter((r) => r.type === 'embarcadere');
  assert.equal(docks.length, 4 * 23); // tout le pourtour du domaine 24x24
  for (const r of docks) assert.ok(reg.terrain.touchesEdge(r.x, r.z, 1, 1) && reg.terrain.zoneAt(r.x, r.z).id === 'domain');
  assert.ok(sim.rallyIsland('roseaux').ok);
  const isle = autoSpot(sim, reg.terrain, 'embarcadere');
  assert.ok(isle.ok);
  assert.equal(reg.terrain.zoneAt(isle.x, isle.z).id, 'roseaux');
  assert.ok(reg.terrain.touchesEdge(isle.x, isle.z, 1, 1));
});

test('pose automatique : le Sanctuaire va là où il renforce le plus de Bibliothèques', () => {
  const reg = new TerrainRegistry();
  const sim = new Simulation(reg, { missives: 0, finished: false });
  for (const [x, z] of [[2, 2], [10, 10], [13, 10], [10, 13], [13, 13]]) reg.place('library', x, z, { prodTicks: 0, paused: false });
  reg.place('observatory', 20, 20, { prodTicks: 0, paused: false });
  sim.resources.knowledge = 1e6;
  sim.resources.omens = 1e6;
  const spot = autoSpot(sim, reg.terrain, 'sanctuary');
  assert.deepEqual(spot, { ok: true, x: 12, z: 12 });
  assert.equal(sim.wouldBoost('sanctuary', 12, 12).length, 4);
  sim.placeBuilding('sanctuary', 12, 12);
  // Le suivant vise la Bibliothèque encore seule.
  const second = autoSpot(sim, reg.terrain, 'sanctuary');
  assert.deepEqual(sim.wouldBoost('sanctuary', second.x, second.z).map((r) => r.uid), [1]);
  sim.placeBuilding('sanctuary', second.x, second.z);
  // Une Bibliothèque se pose de préférence dans une aura (celle du second, la première est entourée).
  const lib = autoSpot(sim, reg.terrain, 'library');
  sim.placeBuilding('library', lib.x, lib.z);
  assert.ok(sim.boosts().has(reg.records.at(-1).uid));
});

test('débit par minute : production brute, consommation, net', () => {
  const sim = game(['library', 'library', 'observatory']);
  const flow = flowPerMinute(sim);
  assert.deepEqual(flow.knowledge, { gross: 60, used: 30, net: 30 });
  assert.deepEqual(flow.omens, { gross: 15, used: 0, net: 15 });
  assert.deepEqual(flowPerMinute(game([])), {});
});

// ----- Déplacement des bâtiments (TODO 4) -----

// Partie sur le vrai terrain, bâtiments posés sans coût : `['type', x, z]`.
function terrainGame(layout) {
  const sim = new Simulation(new TerrainRegistry());
  for (const [type, x, z] of layout) {
    assert.ok(sim.buildings.place(type, x, z, productionOf(type) ? { prodTicks: 0, paused: false } : {}), `${type} ${x},${z}`);
  }
  return sim;
}
const uidAt = (sim, type, nth = 0) => sim.buildings.records.filter((r) => r.type === type)[nth].uid;

test('déplacer : libère l\'ancienne emprise, occupe la nouvelle, garde uid, cycle, pause et palier, gratuit', () => {
  const sim = terrainGame([['library', 2, 2], ['observatory', 8, 8]]);
  sim.buildings.place('lighthouse', 12, 12, { stage: 3 });
  sim.resources.knowledge = 40;
  sim.advance(1.3); // la Bibliothèque est en plein cycle
  const lib = sim.buildings.records[0];
  const [uid, prodTicks, paused] = [lib.uid, lib.prodTicks, lib.paused];
  const before = { ...sim.resources };
  assert.deepEqual(sim.canMove(uid, 5, 5), { ok: true });
  assert.equal(sim.moveBuilding(uid, 5, 5), lib);
  assert.deepEqual([lib.uid, lib.x, lib.z, lib.prodTicks, lib.paused], [uid, 5, 5, prodTicks, paused]);
  assert.deepEqual(sim.resources, before, 'le déplacement est gratuit');
  const t = sim.buildings.terrain;
  assert.equal(t.getTile(2, 2).occupant, null);
  assert.equal(t.getTile(3, 3).occupant, null);
  assert.equal(t.getTile(5, 5).occupant, uid);
  assert.equal(t.getTile(6, 6).occupant, uid);
  // L'Observatoire en pause (entrées manquantes) et le Phare (palier) restent tels quels.
  const lh = sim.buildings.records.find((r) => r.type === 'lighthouse');
  assert.equal(sim.moveBuilding(lh.uid, 16, 16).stage, 3);
  assert.equal(sim.buildings.records.length, 3);
});

test('déplacer : mêmes refus que la pose (occupé, eau, bord, place du Phare), son ancienne place compte comme libre', () => {
  const sim = terrainGame([['library', 2, 2], ['library', 6, 2], ['sanctuary', 10, 10]]);
  const lib = uidAt(sim, 'library');
  assert.equal(sim.canMove(lib, 6, 2).reason, 'occupied');
  assert.equal(sim.canMove(lib, 7, 3).reason, 'occupied');
  assert.equal(sim.canMove(lib, 23, 23).reason, 'bounds');
  assert.equal(sim.canMove(lib, -1, 0).reason, 'bounds');
  assert.equal(sim.canMove(lib, 3, 3).ok, true, 'chevauche sa propre ancienne emprise : permis');
  assert.equal(sim.canMove(lib, 2, 2).ok, true, 'même place : permis');
  assert.equal(sim.canMove(9999, 0, 0).reason, 'unknown');
  assert.equal(sim.moveBuilding(lib, 6, 2), null);
  assert.equal(sim.buildings.records[0].x, 2, 'un déplacement refusé ne change rien');
  // Embarcadère : au bord seulement.
  const quay = sim.buildings.place('embarcadere', 0, 5, { prodTicks: 0, paused: false });
  assert.equal(sim.canMove(quay.uid, 5, 5).reason, 'edge');
  assert.equal(sim.canMove(quay.uid, 23, 8).ok, true);
});

test('déplacer : la place 2x2 réservée au Phare est préservée (l\'emplacement libéré compte)', () => {
  // Domaine plein de Sanctuaires 1x1, sauf (0,0) et trois cases de (10,10)-(11,11) ; le dernier coin (11,11) est
  // occupé par S. Aucun carré 2x2 n'est libre : le déplacement de S vers (0,0) libère (10,10)-(11,11).
  const sim = new Simulation(new TerrainRegistry());
  const hole = new Set(['0,0', '10,10', '11,10', '10,11']);
  for (let z = 0; z < GRID.size; z++) {
    for (let x = 0; x < GRID.size; x++) if (!hole.has(`${x},${z}`)) sim.buildings.place('sanctuary', x, z);
  }
  const s = sim.buildings.records.find((r) => r.x === 11 && r.z === 11).uid;
  const other = sim.buildings.records.find((r) => r.x === 5 && r.z === 5).uid;
  assert.equal(sim.buildings.hasFreeArea({ w: 2, d: 2 }), false);
  assert.deepEqual(sim.canMove(s, 0, 0), { ok: true });
  // Un autre Sanctuaire ne peut pas venir boucher l'un des trois coins libres : le carré ne se libérerait pas.
  assert.deepEqual(sim.canMove(other, 0, 0), { ok: false, reason: 'room' });
  assert.deepEqual(sim.canMove(other, 10, 10), { ok: false, reason: 'room' });
  assert.ok(sim.moveBuilding(s, 0, 0));
  assert.equal(sim.buildings.hasFreeArea({ w: 2, d: 2 }), true);
});

test('déplacer : les auras sont recalculées aussitôt (sortir de la portée, y revenir, auras sans cumul)', () => {
  const sim = terrainGame([['library', 2, 2], ['library', 12, 12], ['sanctuary', 4, 2]]);
  const [near, far] = [uidAt(sim, 'library', 0), uidAt(sim, 'library', 1)];
  const sanct = uidAt(sim, 'sanctuary');
  assert.deepEqual([...sim.boosts().keys()], [near]);
  assert.equal(sim.boostedCountOf('library'), 1);
  assert.equal(sim.wouldBeBoosted('library', 5, 2, null), true);
  assert.equal(sim.wouldBeBoosted('library', 7, 7, null), false);
  // Le Sanctuaire part près de l'autre Bibliothèque : le renfort change de bénéficiaire.
  sim.moveBuilding(sanct, 14, 12);
  assert.deepEqual([...sim.boosts().keys()], [far]);
  // Une Bibliothèque déplacée entre dans l'aura, une autre en sort.
  sim.moveBuilding(near, 15, 13);
  assert.deepEqual([...sim.boosts().keys()].sort(), [near, far].sort());
  sim.moveBuilding(far, 20, 3);
  assert.deepEqual([...sim.boosts().keys()], [near]);
  // La source déplacée ne se renforce jamais elle-même.
  assert.equal(sim.wouldBeBoosted('sanctuary', 3, 3, sanct), false);
  assert.equal(sim.cycleOf(near).outputs.knowledge, 2, 'cycle d\'une Bibliothèque renforcée : 1 + 1');
  assert.equal(sim.cycleOf(far).outputs.knowledge, 1);
  assert.equal(sim.cycleOf(sanct), null);
});

test('déplacer : direct = hors ligne = référence tick par tick après un déplacement en cours de route', () => {
  const layout = [['library', 2, 2], ['library', 12, 12], ['observatory', 8, 8], ['observatory', 9, 8], ['sanctuary', 4, 2]];
  const run = (offline) => {
    const sim = terrainGame(layout);
    sim.resources.knowledge = 5;
    continuous(sim, 13.7, 60);
    sim.moveBuilding(uidAt(sim, 'sanctuary'), 20, 20); // le renfort de la 1re Bibliothèque disparaît
    sim.moveBuilding(uidAt(sim, 'observatory', 0), 3, 8); // un producteur en cours de cycle
    if (offline) sim.applyOffline(300);
    else continuous(sim, 300, 24);
    return sim;
  };
  const [live, away] = [run(false), run(true)];
  assert.deepEqual(snapshot(live), snapshot(away));
  // Référence naïve (référence de Sanctuaire case par case) sur le même état déplacé.
  const ref = terrainGame(layout);
  ref.resources.knowledge = 5;
  continuous(ref, 13.7, 60);
  ref.moveBuilding(uidAt(ref, 'sanctuary'), 20, 20);
  ref.moveBuilding(uidAt(ref, 'observatory', 0), 3, 8);
  referenceRun(ref, 3000);
  const twin = terrainGame(layout);
  twin.resources.knowledge = 5;
  continuous(twin, 13.7, 60);
  twin.moveBuilding(uidAt(twin, 'sanctuary'), 20, 20);
  twin.moveBuilding(uidAt(twin, 'observatory', 0), 3, 8);
  twin.applyOffline(300);
  assert.deepEqual(snapshot(ref), snapshot(twin));
  // Le déplacement a bien changé la production par rapport à une partie sans déplacement.
  const still = terrainGame(layout);
  still.resources.knowledge = 5;
  continuous(still, 13.7, 60);
  still.applyOffline(300);
  assert.notDeepEqual(snapshot(still).resources, snapshot(twin).resources);
});

test('déplacer : notifie la simulation (abonnés), mais pas un déplacement refusé', () => {
  const sim = terrainGame([['library', 2, 2], ['library', 6, 2]]);
  let notified = 0;
  sim.subscribe(() => notified++);
  sim.moveBuilding(uidAt(sim, 'library', 0), 10, 10);
  assert.equal(notified, 1);
  sim.moveBuilding(uidAt(sim, 'library', 0), 6, 2);
  assert.equal(notified, 1);
});

// ---------- Étape 5 : clarté (but, Chemin, formats, textes) ----------

import { readFileSync } from 'node:fs';
import { abbreviate, exact } from '../js/ui/format.js';
import { goalOf, buildPath } from '../js/story/path.js';
import { PATH, GOALS, TIPS, CHAPTER_LETTERS, RESOURCE_HELP } from '../js/story/guide.js';
import { HTML } from '../js/story/texts.js';

test('grands nombres : abrégés à l\'inférieur (ou au supérieur pour un manque), exacts groupés', () => {
  assert.equal(abbreviate(0), '0');
  assert.equal(abbreviate(999.9), '999');
  assert.equal(abbreviate(1000), '1 k');
  assert.equal(abbreviate(1234), '1,2 k');
  assert.equal(abbreviate(15450), '15,4 k');
  assert.equal(abbreviate(999999), '999,9 k');
  assert.equal(abbreviate(1_200_000), '1,2 M');
  assert.equal(abbreviate(1001, { up: true }), '1,1 k');
  assert.equal(abbreviate(999_950, { up: true }), '1 M');
  assert.equal(exact(11500.9), '11\u00a0500');
  assert.equal(exact(7), '7');
});

test('Chemin et but : le but suit le Phare puis le chapitre II, les étapes secrètes restent masquées', () => {
  const reg = new FakeRegistry();
  const story = { missives: 0, finished: false };
  const sim = new Simulation(reg, story);
  let path = buildPath(false, sim, 0);
  assert.equal(path.steps[0].state, 'now');
  assert.equal(path.steps.length, 1, 'seule la première étape est visible au départ');
  assert.ok(path.hidden > 5, 'les autres restent secrètes');
  assert.ok(path.steps.every((s) => !s.id.startsWith('phare')), 'le Phare reste masqué');
  assert.deepEqual(goalOf(false, sim, 0), { chapter: 1, ...GOALS[1], have: 0, target: 5 });

  reg.place('library', 0, 0);
  path = buildPath(false, sim, 1);
  assert.equal(path.steps[0].state, 'done');
  assert.equal(path.steps[1].state, 'now');
  reg.place('library', 3, 0);
  reg.place('observatory', 8, 0);
  reg.place('sanctuary', 2, 0); // entre les deux Bibliothèques : les deux sont renforcées
  story.missives = 5;
  path = buildPath(false, sim, 5);
  assert.ok(path.steps.some((s) => s.id === 'scriptorium' && s.state === 'now'), 'le Scriptorium (7b) est proposé dès le Sanctuaire posé');
  assert.ok(path.steps.some((s) => s.id === 'phare-1' && s.state === 'next'));
  assert.ok(!path.steps.some((s) => s.id === 'cloche'), 'la Cloche reste masquée avant le palier 2');
  assert.equal(path.steps.filter((s) => s.state === 'now').length, 1);
  assert.equal(path.steps.filter((s) => s.state === 'next').length, 1);

  reg.place('lighthouse', 12, 12, { stage: 3 });
  assert.equal(goalOf(false, sim, 5).have, 3);

  // Chapitre II : seules les étapes du chapitre, îlots masqués jusqu'à la brume levée.
  const two = buildPath(true, sim, 10);
  assert.equal(two.chapter, 2);
  assert.ok(two.steps.every((s) => PATH.find((p) => p.id === s.id).chapter === 2));
  assert.ok(!two.steps.some((s) => s.id === 'ilots'), 'les îlots ne se dévoilent pas avant la brume');
  const g = goalOf(true, sim, 12);
  assert.equal(g.chapter, 2);
  assert.equal(g.target, MISSIVES.filter((m) => m.chapter === 2).length);
  assert.equal(g.have, 2);
});

test('textes de guidage : identifiants uniques, clés d\'interface présentes, conseils et lettres complets', () => {
  const ids = PATH.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  // L'ordre du Chemin doit pouvoir être mesuré : conditions de type connu.
  for (const s of PATH) assert.ok(['built', 'boosted', 'stage', 'earned', 'missives', 'islands', 'revealed'].includes(s.cond.kind), s.id);
  for (const [id, tip] of Object.entries(TIPS)) assert.ok(tip.text.length > 20 && tip.text.length < 160, id);
  for (const key of Object.keys(RESOURCE_HELP).filter((k) => k !== 'texts')) assert.ok(RESOURCE_HELP[key].length > 10, key);
  const letter = CHAPTER_LETTERS[2];
  assert.ok(letter.title && letter.paragraphs.length >= 2 && letter.accept);
  // Chaque data-t de index.html a son texte.
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const m of html.matchAll(/data-t(?:-aria|-title)?="([^"]+)"/g)) assert.ok(m[1] in HTML, `texte manquant : ${m[1]}`);
});

// ----- Étape 6 : copies de secours, export / import -----

import { BackupStore, entryOf, readImport, encodeCode, describeSave, formatAgo, ImportError } from '../js/save/backup.js';

// Sauvegarde courante valide, avec une durée de jeu donnée.
const saveAt = (playSeconds, extra = {}) => JSON.stringify({
  version: SAVE_VERSION,
  savedAt: 1_700_000_000_000 + playSeconds * 1000,
  sim: { tick: 10, resources: { knowledge: 5, omens: 0, relics: 0 }, earned: { knowledge: 5, omens: 0, relics: 0 }, visitors: 0, islands: [] },
  buildings: { nextUid: 2, buildings: [{ uid: 1, type: 'library', x: 4, z: 4, rotation: 0, prodTicks: 3, paused: false }] },
  journal: { unlocked: [], unread: [], missives: 0 },
  day: { startedAt: 1_700_000_000_000 },
  progress: { playSeconds, finished: false, ...extra },
});
const memory = () => {
  const map = new Map();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), map };
};

test('copies de secours : une par tranche de jeu, 3 conservées, la plus ancienne cède', () => {
  const backups = new BackupStore({ storage: memory(), count: 3, everySeconds: 600 });
  const play = (s) => backups.consider(entryOf(saveAt(s)));
  assert.equal(play(100), false, 'pas de copie avant la première tranche');
  assert.equal(play(650), true);
  assert.equal(play(900), false, 'moins de 10 min depuis la dernière');
  assert.equal(play(1300), true);
  assert.equal(play(2000), true);
  assert.equal(play(2700), true);
  const list = backups.list();
  assert.deepEqual(list.map((e) => e.playSeconds), [2700, 2000, 1300], 'les 3 dernières, la plus récente d\'abord');
  assert.equal(backups.add(list[0]), false, 'texte identique : pas de doublon');
  assert.deepEqual(backups.described().map((c) => c.index), [0, 1, 2]);
});

test('copies de secours : stockage plein ou corrompu ne plante jamais', () => {
  const full = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
  assert.equal(new BackupStore({ storage: full }).add(entryOf(saveAt(700))), false);
  const junk = memory();
  junk.setItem('societe-du-lac:save:copies', '{pas du json');
  assert.deepEqual(new BackupStore({ storage: junk }).list(), []);
  junk.setItem('societe-du-lac:save:copies', JSON.stringify([{ text: 1 }, { text: 'x', savedAt: 1, playSeconds: 2 }]));
  assert.equal(new BackupStore({ storage: junk }).list().length, 1);
  assert.deepEqual(new BackupStore({ storage: junk }).described(), [], 'une copie illisible n\'est pas proposée');
});

test('export puis import : fichier JSON et code compact redonnent exactement la partie', () => {
  const text = saveAt(1234);
  const expected = parseSave(text);
  assert.deepEqual(readImport(text).data, expected);
  const code = encodeCode(text);
  assert.ok(code.startsWith('SDL1:') && !/\s/.test(code));
  assert.deepEqual(readImport(code).data, expected);
  assert.deepEqual(readImport(`  ${code.slice(0, 20)}\n ${code.slice(20)}  `).data, expected, 'espaces et retours collés tolérés');
  assert.deepEqual(parseSave(readImport(code).text), expected, 'le texte normalisé se relit à l\'identique');
});

test('import d\'anciennes versions : migré comme une sauvegarde normale', () => {
  for (const old of [STEP4_SAVE, STEP5_SAVE, STEP12_SAVE, STEP8_SAVE]) {
    const viaFile = readImport(old).data;
    assert.equal(viaFile.version, SAVE_VERSION);
    assert.deepEqual(viaFile, parseSave(old));
    assert.deepEqual(readImport(encodeCode(old)).data, viaFile, 'même résultat par le code');
  }
});

test('import invalide : message clair, aucune exception brute', () => {
  const tooNew = JSON.stringify({ ...JSON.parse(saveAt(1)), version: SAVE_VERSION + 1 });
  const badType = JSON.stringify({ ...JSON.parse(saveAt(1)), buildings: { nextUid: 2, buildings: [{ uid: 1, type: 'tour', x: 1, z: 1 }] } });
  const cases = [
    ['', /vide/], ['   ', /vide/], ['bonjour', /pas reconnu/], ['SDL1:@@@', /pas reconnu/],
    ['{pas du json', /pas une sauvegarde/], ['[1,2]', /pas une sauvegarde/], ['{"version":"x"}', /pas une sauvegarde/],
    [tooNew, /plus récente/], [badType, /abîmée ou incomplète/], [encodeCode(badType), /abîmée ou incomplète/],
    [saveAt(1).slice(0, 80), /pas une sauvegarde/], ['x'.repeat(2_000_001), /volumineux/],
  ];
  for (const [input, message] of cases) {
    assert.throws(() => readImport(input), (err) => err instanceof ImportError && message.test(err.message), input.slice(0, 30));
  }
});

test('résumé de partie : chapitre, objectif, temps ; « il y a » lisible', () => {
  const info = describeSave(parseSave(saveAt(3725)));
  assert.equal(info.chapter, 'Chapitre I');
  assert.equal(info.objective, 'Élever le Phare du Lac');
  assert.deepEqual([info.have, info.target, info.playSeconds, info.buildings], [0, 5, 3725, 1]);
  const done = describeSave(parseSave(saveAt(10, { finished: true })));
  assert.equal(done.chapter, 'Chapitre II');
  assert.equal(formatAgo(5_000), 'à l\'instant');
  assert.equal(formatAgo(60_000), 'il y a 1 minute');
  assert.equal(formatAgo(2 * 3_600_000 + 5_000), 'il y a 2 heures');
  assert.equal(formatAgo(3 * 86_400_000), 'il y a 3 jours');
});

test('remplacement (import / restauration) : savedAt = maintenant, copie de la partie actuelle', () => {
  const area = memory();
  const store = { read: () => area.getItem('k'), write: (t) => { area.setItem('k', t); return true; }, clear() {} };
  store.write(saveAt(900));
  const saver = new SaveManager({ sim: null, buildings: null, journal: null, day: null, progress: null, store,
    backups: new BackupStore({ storage: memory() }) });
  saver.enabled = false; // comme au titre
  const before = Date.now();
  assert.equal(saver.replaceWith(saveAt(50)), true);
  const written = JSON.parse(store.read());
  assert.ok(written.savedAt >= before && written.savedAt <= Date.now());
  assert.equal(written.progress.playSeconds, 50);
  assert.equal(saver.backups.list()[0].playSeconds, 900, 'la partie remplacée part en copie');
});

// ----- Améliorations individuelles (étape 7a) -----

const UP = BALANCE.buildings;

test('améliorations : niveau 1 à la pose, coût géométrique par niveau, maximum, paiement', () => {
  const sim = new Simulation(new TerrainRegistry());
  sim.resources.knowledge = 10;
  const lib = sim.placeBuilding('library', 2, 2); // première gratuite
  assert.equal(lib.level, 1);
  assert.equal(sim.placeBuilding('lighthouse', 12, 12) ?? null, null); // verrouillé : pas de niveau sur le Phare
  const up = UP.library.upgrade;
  const [c2, c3] = [Math.round(up.cost.knowledge), Math.round(up.cost.knowledge * up.costGrowth)];
  assert.deepEqual(sim.upgradeCost(lib.uid), { knowledge: c2 });
  assert.ok(c3 > c2, 'coût croissant');
  // Refus doux : trop cher, rien n'est payé ni changé.
  assert.deepEqual(sim.upgrade(lib.uid), { ok: false, reason: 'cost', cost: { knowledge: c2 } });
  assert.equal(sim.resources.knowledge, 10);
  assert.equal(lib.level, 1);
  sim.resources.knowledge = c2 + c3 + 7;
  let notified = 0;
  sim.subscribe(() => notified++);
  assert.deepEqual(sim.upgrade(lib.uid), { ok: true, level: 2 });
  assert.deepEqual(sim.upgradeCost(lib.uid), { knowledge: c3 });
  assert.deepEqual(sim.upgrade(lib.uid), { ok: true, level: 3 });
  assert.equal(notified, 2);
  assert.equal(sim.resources.knowledge, 7);
  assert.equal(sim.upgradeCost(lib.uid), null);
  assert.deepEqual(sim.upgrade(lib.uid), { ok: false, reason: 'max' });
  assert.deepEqual(sim.upgrade(999), { ok: false, reason: 'unknown' });
  // Le Phare n'a pas d'amélioration (il a ses paliers).
  const lh = sim.buildings.place('lighthouse', 12, 12, { stage: 1 });
  assert.equal(sim.upgradeCost(lh.uid), null);
  assert.deepEqual(sim.upgrade(lh.uid), { ok: false, reason: 'unknown' });
  // Le niveau entre dans le coût de chaque type : tous les coûts sont définis et croissants.
  for (const [type, rules] of Object.entries(UP)) {
    if (!rules.upgrade) continue;
    assert.equal(rules.upgrade.levels.length, 3, type);
    assert.ok(rules.upgrade.costGrowth > 1, type);
  }
});

test('améliorations : effets par niveau (Bibliothèque, Observatoire, Sanctuaire, Embarcadère)', () => {
  const sim = game([['library', 3, 2, 0, 1], ['library', 7, 2, 0, 2], ['library', 20, 20, 0, 3], ['observatory', 9, 9, 0, 1],
    ['observatory', 9, 10, 0, 2], ['observatory', 9, 11, 0, 3], ['sanctuary', 6, 2, 0, 1],
    ['embarcadere', 0, 0, 0, 1], ['embarcadere', 1, 0, 0, 2], ['embarcadere', 2, 0, 0, 3]]);
  const cyc = (i) => sim.cycleOf(sim.buildings.records[i].uid);
  // Sanctuaire niveau 1 en (6,2) : voisine (7,2) renforcée, (3,2) à 2 cases hors de portée.
  assert.equal(cyc(0).outputs.knowledge, 1);
  assert.equal(cyc(1).outputs.knowledge, 1 + 1 + 1, 'niveau 2 (+1) + aura (+1)');
  assert.equal(cyc(2).outputs.knowledge, 1 + 2, 'niveau 3 : +2 par cycle');
  // Observatoires : cycle plus court, entrées inchangées.
  assert.deepEqual([cyc(3).seconds, cyc(4).seconds, cyc(5).seconds], [4, 3, 2.4]);
  for (const i of [3, 4, 5]) assert.deepEqual(cyc(i).inputs, { knowledge: 2 });
  // Embarcadères : chance de double Relique croissante.
  assert.deepEqual([cyc(7).chance, cyc(8).chance, cyc(9).chance], [0, 0.25, 0.5]);
  // Sanctuaire niveau 2 : portée 2 (la Bibliothèque en (3,2) devient renforcée) ; niveau 3 : bonus doublé.
  const sanct = sim.buildings.records[6];
  sanct.level = 2;
  assert.equal(cyc(0).outputs.knowledge, 2);
  assert.equal(cyc(1).outputs.knowledge, 3);
  assert.equal(sim.wouldBeBoosted('library', 3, 2), true);
  assert.equal(sim.wouldBeBoosted('library', 20, 20), false);
  sanct.level = 3;
  assert.equal(cyc(0).outputs.knowledge, 1 + 2, 'bonus doublé : +2');
  assert.equal(cyc(1).outputs.knowledge, 1 + 1 + 2, 'niveau 2 de la Bibliothèque + aura doublée');
  assert.equal(sim.boostedCountOf('library'), 2);
  // L'aperçu d'aura d'un Sanctuaire améliorable suit son niveau : 8 cases au niveau 1, 24 à la portée 2.
  assert.equal(auraTiles('sanctuary', 6, 2).length, 8);
  assert.equal(auraTiles('sanctuary', 6, 2, 2).length, 24);
});

test('améliorations : Embarcadère, une Relique double tous les 4 cycles au niveau 2, tous les 2 au niveau 3', () => {
  for (const [level, perCycle] of [[1, 8], [2, 10], [3, 12]]) {
    const sim = game([['embarcadere', 0, 0, 0, level]], { omens: 3 * 8 });
    sim.applyOffline(12 * 8); // 8 cycles de 12 s
    assert.equal(sim.resources.relics, perCycle, `niveau ${level}`);
    assert.equal(sim.buildings.records[0].luck, 0, 'le cumul revient à zéro après 8 cycles');
  }
  // Le cumul est sauvegardé : même résultat en coupant le jeu en deux.
  const split = game([['embarcadere', 0, 0, 0, 2]], { omens: 24 });
  split.applyOffline(12 * 3);
  assert.equal(split.buildings.records[0].luck, 0.75);
  split.applyOffline(12 * 5);
  assert.equal(split.resources.relics, 10);
});

test('améliorations : en cours de partie, continu = hors ligne = référence (cycle raccourci, aura étendue, chance)', () => {
  const layout = [['library', 3, 2], ['library', 7, 2], ['library', 14, 14], ['observatory', 9, 9], ['observatory', 9, 10],
    ['sanctuary', 6, 2], ['embarcadere', 0, 0], ['embarcadere', 1, 0], ['lighthouse', 12, 2, 2]];
  const live = game(layout, { knowledge: 3, omens: 20 });
  const offline = game(layout, { knowledge: 3, omens: 20 });
  const reference = game(layout, { knowledge: 3, omens: 20 });
  const sims = [live, offline, reference];
  const run = (seconds) => {
    continuous(live, seconds, 60);
    offline.applyOffline(seconds);
    referenceRun(reference, Math.floor(seconds * BALANCE.ticksPerSecond));
  };
  const upgrade = (nth, type) => {
    for (const sim of sims) {
      const record = sim.buildings.records.filter((r) => r.type === type)[nth];
      const cost = sim.upgradeCost(record.uid);
      for (const [res, n] of Object.entries(cost)) sim.resources[res] += n;
      assert.equal(sim.upgrade(record.uid).ok, true);
    }
  };
  run(7.3); // cycles en cours : le raccourcissement doit les garder
  upgrade(0, 'observatory');
  upgrade(0, 'library');
  upgrade(0, 'embarcadere');
  run(95.3);
  upgrade(0, 'sanctuary'); // portée 2
  upgrade(1, 'library');
  upgrade(1, 'library');
  upgrade(0, 'observatory');
  upgrade(1, 'embarcadere');
  upgrade(1, 'embarcadere');
  run(1800);
  upgrade(0, 'sanctuary'); // bonus doublé
  run(3600 + 13.7);
  assert.deepEqual(snapshot(offline), snapshot(reference));
  assert.deepEqual(snapshot(live), snapshot(reference));
  assert.deepEqual(live.earned, offline.earned);
  assert.ok(live.resources.relics > 0, 'des Reliques ont été remontées');
});

test('améliorations : le cycle en cours est gardé (ou terminé), une pause reste cohérente', () => {
  const sim = game([['observatory', 0, 0]], { knowledge: 0 });
  sim.advance(0.9); // 9 ticks sur 40, aucun Savoir : pas encore en pause
  const obs = sim.buildings.records[0];
  assert.equal(obs.prodTicks, 9);
  sim.resources.omens = 1e6;
  sim.resources.knowledge = 0;
  sim.resources.knowledge = UP.observatory.upgrade.cost.knowledge;
  assert.equal(sim.upgrade(obs.uid).ok, true);
  assert.equal(obs.prodTicks, 9, 'progression conservée');
  assert.equal(sim.cycleOf(obs.uid).seconds, UP.observatory.upgrade.levels[1].intervalSeconds);
  // En pause (fin de cycle, Savoirs manquants) puis amélioré : reste en pause, cycle bloqué à la nouvelle fin.
  sim.resources.knowledge = 0;
  sim.advance(1);
  sim.advance(1);
  sim.advance(1);
  assert.equal(obs.paused, true);
  sim.resources.knowledge = 0;
  sim.resources.omens = 1e6;
  sim.resources.knowledge = Math.round(UP.observatory.upgrade.cost.knowledge * UP.observatory.upgrade.costGrowth);
  assert.equal(sim.upgrade(obs.uid).ok, true);
  const level3Ticks = Math.round(UP.observatory.upgrade.levels[2].intervalSeconds * BALANCE.ticksPerSecond);
  assert.equal(obs.prodTicks, level3Ticks);
  assert.equal(obs.paused, true);
  // Rechargement : prodTicks borné par la durée du niveau.
  sim.load({ tick: 1, resources: { knowledge: 0, omens: 0 }, earned: {} });
  assert.equal(obs.prodTicks <= level3Ticks, true);
});

test('améliorations : le déplacement garde le niveau, le cycle et le cumul de chance', () => {
  const sim = terrainGame([['library', 2, 2], ['embarcadere', 0, 0], ['sanctuary', 8, 8]]);
  for (const r of sim.buildings.records) {
    if (UP[r.type].upgrade) r.level = 3;
    if (r.type === 'embarcadere') r.luck = 0.5;
  }
  sim.resources.omens = 10;
  const [lib, dock, sanct] = sim.buildings.records;
  sim.advance(1.3);
  const ticks = lib.prodTicks;
  assert.ok(sim.moveBuilding(lib.uid, 6, 6));
  assert.ok(sim.moveBuilding(dock.uid, 23, 5));
  assert.ok(sim.moveBuilding(sanct.uid, 12, 12));
  assert.deepEqual([lib.level, dock.level, sanct.level, dock.luck, lib.prodTicks], [3, 3, 3, 0.5, ticks]);
  // Hors de portée de l'aura (6,6 loin de 12,12) : niveau 3 seul ; la ramener contre le Sanctuaire : aura doublée en plus.
  assert.equal(sim.cycleOf(lib.uid).outputs.knowledge, 1 + 2);
  assert.ok(sim.moveBuilding(lib.uid, 10, 11)); // à 1 case du Sanctuaire (12,12)
  assert.equal(sim.cycleOf(lib.uid).outputs.knowledge, 1 + 2 + 2);
});

test('migration v11 → v12 : niveau 1 partout, chance nulle ; niveaux et chance validés ; aller-retour', () => {
  const v11 = JSON.stringify({
    version: 11, savedAt: 1764000000000,
    sim: { tick: 900, resources: { knowledge: 50, omens: 9, relics: 0 }, earned: { knowledge: 400, omens: 40, relics: 0 }, visitors: 0, islands: [] },
    buildings: { nextUid: 5, buildings: [
      { uid: 1, type: 'library', x: 3, z: 3, rotation: 0, prodTicks: 4, paused: false },
      { uid: 2, type: 'observatory', x: 8, z: 8, rotation: 0, prodTicks: 40, paused: true },
      { uid: 3, type: 'sanctuary', x: 6, z: 3, rotation: 0 },
      { uid: 4, type: 'lighthouse', x: 12, z: 12, rotation: 0, stage: 2 },
    ] },
    journal: { unlocked: [], unread: [], missives: 0 },
    day: { startedAt: 1764000000000 },
    progress: { playSeconds: 90, finished: false },
  });
  const data = parseSave(v11);
  assert.equal(data.version, SAVE_VERSION);
  assert.deepEqual(data.buildings.buildings.map((r) => r.level), [1, 1, 1, undefined]);
  assert.deepEqual(data.buildings.buildings[0], { uid: 1, type: 'library', x: 3, z: 3, rotation: 0, prodTicks: 4, paused: false, level: 1 });
  // Aller-retour avec des niveaux et une chance cumulée.
  const doc = JSON.parse(JSON.stringify(data));
  doc.buildings.buildings[0].level = 3;
  doc.buildings.buildings.push({ uid: 5, type: 'embarcadere', x: 0, z: 0, rotation: 0, prodTicks: 2, paused: false, level: 2, luck: 0.75 });
  doc.buildings.nextUid = 6;
  const again = parseSave(JSON.stringify(doc));
  assert.equal(again.buildings.buildings[0].level, 3);
  assert.deepEqual([again.buildings.buildings[4].level, again.buildings.buildings[4].luck], [2, 0.75]);
  // Refusés : niveau hors bornes, niveau sur le Phare, chance hors bornes ou sur un autre type.
  const bad = (edit) => {
    const copy = JSON.parse(JSON.stringify(doc));
    edit(copy.buildings.buildings);
    assert.throws(() => parseSave(JSON.stringify(copy)));
  };
  bad((b) => { b[0].level = 4; });
  bad((b) => { b[0].level = 0; });
  bad((b) => { b[0].level = 1.5; });
  bad((b) => { b[3].level = 2; });
  bad((b) => { b[4].luck = 1; });
  bad((b) => { b[4].luck = -0.1; });
  bad((b) => { b[0].luck = 0; });
});

test('mode économie : cible d\'amélioration = bâtiment le moins avancé, puis le plus ancien', () => {
  const sim = game([['library', 0, 0, 0, 2], ['library', 3, 0, 0, 1], ['library', 6, 0, 0, 1], ['observatory', 9, 9, 0, 3]]);
  assert.deepEqual(upgradeTarget(sim, 'library'), { ok: false, reason: 'cost', uid: 2, level: 1, cost: sim.upgradeCost(2) });
  sim.resources.knowledge = 1e6;
  assert.deepEqual(upgradeTarget(sim, 'library'), { ok: true, uid: 2, level: 1, cost: { knowledge: UP.library.upgrade.cost.knowledge } });
  assert.deepEqual(upgradeTarget(sim, 'observatory'), { ok: false, reason: 'max' });
  assert.deepEqual(upgradeTarget(sim, 'sanctuary'), { ok: false, reason: 'none' });
  assert.deepEqual(upgradeTarget(sim, 'lighthouse'), { ok: false, reason: 'unknown' });
  // Le débit par minute tient compte des niveaux : Bibliothèques 2 + 1 + 1, Observatoire niveau 3 (2,4 s).
  const flow = flowPerMinute(sim);
  assert.equal(flow.knowledge.gross, (2 + 1 + 1) * 30 + 0);
  assert.equal(flow.knowledge.used, Math.round(2 * 60 / 2.4 * 1e6) / 1e6);
});

test('améliorations : textes d\'effet lisibles pour chaque type', () => {
  const name = (res, n) => (n > 1 ? RESOURCE_TYPES[res].many : RESOURCE_TYPES[res].one);
  assert.equal(upgradeEffect('library', 2, name), '+1 Savoir par cycle');
  assert.equal(upgradeEffect('observatory', 2, name), 'cycle de 4 s à 3 s');
  assert.equal(upgradeEffect('observatory', 3, name), 'cycle de 3 s à 2,4 s');
  assert.equal(upgradeEffect('sanctuary', 2, name), 'aura étendue à 2 cases');
  assert.equal(upgradeEffect('sanctuary', 3, name), 'bonus des Bibliothèques renforcées ×2');
  assert.equal(upgradeEffect('embarcadere', 2, name), '25 % de chances de remonter 2 Reliques au lieu d\'une');
  assert.equal(upgradeEffect('embarcadere', 3, name), '50 % de chances de remonter 2 Reliques au lieu d\'une');
  assert.equal(upgradeEffect('lighthouse', 2, name), '');
});


// ----- Étape 7b : Scriptorium (efficacité) et Cloche (action active) -----

const withLighthouse = (stage) => ['lighthouse', 12, 2, stage];

test('Scriptorium : débloqué par le premier Sanctuaire, 8 cases voisines, entrées de Savoirs réduites de moitié sans cumul', () => {
  const rules = BALANCE.buildings.scriptorium;
  assert.deepEqual(rules.unlock, { buildings: { sanctuary: 1 } });
  const locked = game(['library']);
  assert.equal(locked.canPlace('scriptorium', 5, 5).reason, 'locked');
  const sim = game([['library', 0, 0], ['sanctuary', 20, 20], ['observatory', 8, 8], ['observatory', 10, 10], ['observatory', 5, 5],
    ['scriptorium', 9, 9], ['scriptorium', 9, 10]]);
  assert.equal(sim.canPlace('scriptorium', 14, 14).reason, 'cost');
  // (8,8) et (10,10) touchent (9,9) ; (5,5) est trop loin. Deux Scriptoriums sur (10,10) : pas de cumul.
  const saved = [...sim.savings().keys()].sort();
  assert.deepEqual(saved, [3, 4]);
  assert.deepEqual(sim.savings().get(4), { inputScale: 0.5, extraChance: 0, extra: null });
  assert.deepEqual(sim.cycleOf(3).inputs, { knowledge: 1 }, 'moitié moins de Savoirs par cycle');
  assert.deepEqual(sim.cycleOf(5).inputs, { knowledge: 2 }, 'hors de portée : inchangé');
  assert.deepEqual(sim.cycleOf(3).outputs, { omens: 1 }, 'ce n\'est pas une aura de production');
  assert.equal(sim.savedCountOf('observatory'), 2);
  assert.deepEqual(sim.wouldBoost('scriptorium', 5, 6).map((r) => r.uid), [5]);
  assert.equal(sim.wouldBeSaved('observatory', 9, 8), true);
  assert.equal(sim.wouldBeSaved('observatory', 20, 2), false);
  assert.equal(sim.wouldBeBoosted('observatory', 9, 8), false, 'un Scriptorium ne « renforce » pas');
  // Les Savoirs consommés : 1 par cycle de 4 s au lieu de 2.
  const a = game(['observatory'], { knowledge: 100 });
  const b = game(['observatory', ['scriptorium', 1, 0]], { knowledge: 100 });
  a.applyOffline(40);
  b.applyOffline(40);
  assert.equal(100 - a.resources.knowledge, 20);
  assert.equal(100 - b.resources.knowledge, 10);
  assert.equal(a.resources.omens, b.resources.omens, 'autant de Présages');
});

test('Scriptorium : portée 2 au niveau 2, Présage en plus tous les 5 cycles au niveau 3 (déterministe)', () => {
  const near = game([['observatory', 5, 5], ['scriptorium', 7, 5, 0, 1]]);
  assert.equal(near.savings().size, 0, 'à 2 cases : hors de portée au niveau 1');
  const two = game([['observatory', 5, 5], ['scriptorium', 7, 5, 0, 2]]);
  assert.equal(two.savings().size, 1, 'portée 2 au niveau 2');
  assert.deepEqual(auraTiles('scriptorium', 7, 5, 2).length, 24);
  assert.equal(auraTiles('scriptorium', 7, 5, 1).length, 8);
  const three = game([['observatory', 5, 5], ['scriptorium', 7, 5, 0, 3]], { knowledge: 1000 });
  assert.equal(three.savings().get(1).extraChance, 0.2);
  const r = three.applyOffline(20); // 5 cycles de 4 s
  assert.equal(three.resources.omens, 5 + 1, 'un Présage en plus pour 5 cycles');
  three.applyOffline(20);
  assert.equal(three.resources.omens, 12);
  assert.ok(r.consumed.knowledge > 0);
  // Texte d'amélioration lisible, sans « undefined ».
  assert.match(upgradeEffect('scriptorium', 2, (res) => RESOURCE_TYPES[res].name), /2 cases/);
  assert.match(upgradeEffect('scriptorium', 3, (res, n) => RESOURCE_TYPES[res].name), /20 %/);
});

test('Cloche : débloquée au palier 2 du Phare, trois au plus, état de départ vide', () => {
  const sim = game(['library', withLighthouse(1)], { knowledge: 1e6, omens: 1e5 });
  assert.equal(sim.canPlace('bell', 5, 5).reason, 'locked');
  assert.deepEqual(sim.missingUnlocks('bell'), [{ kind: 'stage', type: 'lighthouse', required: 2, have: 1 }]);
  const ok = game([withLighthouse(2)], { knowledge: 1e6, omens: 1e5 });
  assert.deepEqual(ok.missingUnlocks('bell'), []);
  for (let i = 0; i < 3; i++) {
    const record = ok.placeBuilding('bell', 4 + i, 5);
    assert.ok(record, `Cloche ${i + 1}`);
    assert.deepEqual([record.charge, record.ring], [0, 0]);
  }
  const fourth = ok.canPlace('bell', 9, 5);
  assert.equal(fourth.reason, 'limit');
  assert.equal(fourth.limit, 3);
  assert.equal(ok.atLimit('bell'), true);
  assert.equal(autoSpot(ok, new Terrain(GRID.size), 'bell').reason, 'limit');
});

test('Cloche : se charge en 3 min, sonne à la demande 30 s, jamais seule ; recharge pendant la sonnerie', () => {
  const sim = game([withLighthouse(2), ['library', 0, 0], ['library', 14, 14], ['bell', 3, 1]]);
  const bell = sim.buildings.records.at(-1);
  const lib = sim.buildings.records[1];
  const far = sim.buildings.records[2];
  assert.deepEqual(sim.ring(bell.uid), { ok: false, reason: 'charging' });
  assert.equal(sim.ring(999).reason, 'unknown');
  sim.applyOffline(179.9);
  assert.equal(sim.bellState(bell.uid).ready, false);
  sim.applyOffline(0.1);
  const state = sim.bellState(bell.uid);
  assert.equal(state.ready, true);
  assert.equal(state.ringing, false);
  assert.equal(bell.ring, 0, 'jamais seule : la cloche attend le joueur, même hors ligne');
  sim.applyOffline(3600);
  assert.equal(bell.ring, 0);
  assert.equal(bell.charge, state.chargeTicks, 'la charge reste au plafond');
  // Sonnerie : charge à zéro, 30 s à vitesse double pour la Bibliothèque à portée (cycle de 2 s → 1 s).
  const before = [sim.resources.knowledge, lib.prodTicks, far.prodTicks];
  const rung = sim.ring(bell.uid);
  assert.deepEqual(rung, { ok: true, radius: 3 });
  assert.deepEqual([bell.charge, bell.ring], [0, 300]);
  assert.equal(sim.ring(bell.uid).reason, 'ringing');
  sim.applyOffline(30);
  assert.equal(sim.resources.knowledge - before[0], Math.round((30 + 15) * 1.2), '30 cycles à portée, 15 hors de portée, Phare palier 2 : +20 %');
  assert.equal(bell.ring, 0);
  assert.equal(bell.charge, 300, 'la charge a avancé pendant la sonnerie');
  assert.equal(sim.bellState(bell.uid).ready, false);
  sim.applyOffline(150);
  assert.equal(sim.bellState(bell.uid).ready, true, 'prête 180 s après la sonnerie');
  // Évènements : sonnerie et fin.
  const live = game([withLighthouse(2), ['bell', 3, 1, 0, 1, { charge: 1799, ring: 0 }]]);
  live.advance(0.1);
  assert.deepEqual(live.drainEvents().map((e) => e.kind), ['bellReady']);
  live.ring(2);
  assert.equal(live.drainEvents()[0].kind, 'rung');
});

test('Cloche : niveaux — recharge en 130 s au niveau 2, portée 4 au niveau 3 ; plusieurs cloches sans cumul', () => {
  const l2 = game([withLighthouse(2), ['bell', 3, 1, 0, 2]]);
  assert.equal(l2.bellState(2).chargeTicks, 1300);
  assert.equal(l2.bellState(2).radius, 3);
  const l3 = game([withLighthouse(2), ['library', 7, 1], ['bell', 3, 1, 0, 3]]);
  assert.equal(l3.bellState(3).radius, 4);
  assert.equal(l3.wouldBoost('bell', 3, 1, 3).length, 1, 'la Bibliothèque à 4 cases est à portée');
  assert.equal(l3.wouldBoost('bell', 3, 1, 1).length, 0, 'mais pas au niveau 1');
  assert.equal(auraTiles('bell', 3, 1, 1).length, 48);
  assert.match(upgradeEffect('bell', 2, (res) => res), /2 min 10 s au lieu de 3 min/);
  assert.match(upgradeEffect('bell', 3, (res) => res), /portée de 3 à 4 cases/);
  // Deux cloches qui sonnent sur la même Bibliothèque : ×2 et non ×4.
  const sim = game([withLighthouse(2), ['library', 6, 1], ['bell', 3, 1, 0, 1, { ring: 300 }], ['bell', 9, 1, 0, 1, { ring: 300 }]]);
  sim.applyOffline(30);
  assert.equal(sim.resources.knowledge, 36, '30 cycles (×2 sur 30 s), Phare palier 2 : +20 %');
  // Montée de niveau : la charge ne dépasse jamais la nouvelle borne.
  const up = game([withLighthouse(2), ['bell', 3, 1, 0, 1, { charge: 1700 }]], { knowledge: 1e6, omens: 1e5 });
  assert.equal(up.upgrade(2).ok, true);
  assert.equal(up.buildings.records[1].level, 2);
  assert.equal(up.bellState(2).charge, 1300);
  assert.equal(up.bellState(2).ready, true);
});

test('Cloche sonnée en cours de partie : continu = hors ligne = référence tick par tick', () => {
  const layout = [withLighthouse(2), ['library', 2, 2], ['library', 5, 2], ['library', 14, 14], ['observatory', 6, 6],
    ['observatory', 9, 2, 0, 2], ['scriptorium', 7, 6, 0, 3], ['sanctuary', 4, 4], ['embarcadere', 0, 0],
    ['bell', 4, 6, 0, 1, { charge: 1500 }], ['bell', 8, 5, 0, 2, { charge: 600 }]];
  const start = { knowledge: 5, omens: 12 };
  const live = game(layout, start);
  const offline = game(layout, start);
  const reference = game(layout, start);
  const sims = [live, offline, reference];
  const run = (seconds) => {
    continuous(live, seconds, 60);
    offline.applyOffline(seconds);
    referenceRun(reference, Math.floor(seconds * BALANCE.ticksPerSecond));
  };
  const ring = (uid) => sims.forEach((sim) => assert.equal(sim.ring(uid).ok, true, `sonnerie de la cloche ${uid}`));
  run(7.3);                  // la 1re cloche se charge (1500 → 1573)
  run(22.9);                 // prête (1802 ≥ 1800)
  ring(10);                  // sonnerie de 30 s...
  run(11.1);                 // ... interrompue par un « hors ligne » au milieu
  run(60.4);                 // la sonnerie se termine, la recharge continue
  run(95);
  ring(11);                  // la 2e cloche (niveau 2, 130 s) est prête depuis longtemps
  run(13.7);
  ring(10);                  // la 1re : prête de nouveau (180 s)
  run(3600 + 1.3);
  assert.deepEqual(snapshot(offline), snapshot(reference));
  assert.deepEqual(snapshot(live), snapshot(reference));
  assert.deepEqual(live.earned, offline.earned);
  assert.ok(live.resources.relics >= 0 && live.earned.knowledge > 1000);
  // Sans les sonneries, la production serait plus faible : la Cloche accélère vraiment.
  const calm = game(layout, start);
  calm.applyOffline(7.3 + 22.9 + 11.1 + 60.4 + 95 + 13.7 + 3600 + 1.3);
  assert.ok(live.earned.knowledge > calm.earned.knowledge);
});

test('Cloche : le hors ligne la recharge mais ne la fait jamais sonner seule ; une sonnerie commencée se poursuit', () => {
  const layout = [withLighthouse(2), ['library', 2, 2], ['bell', 3, 1, 0, 1, { charge: 100 }]];
  const sim = game(layout);
  const report = sim.applyOffline(7200);
  const bell = sim.buildings.records[2];
  assert.equal(bell.ring, 0);
  assert.equal(bell.charge, 1800);
  assert.equal(roundAmount(report.produced.library.knowledge), 3600 * 1.2, 'production inchangée : aucune sonnerie');
  // Sonnerie commencée puis page fermée 10 s plus tard : les 20 s restantes comptent à la reprise.
  const rung = game(layout, {});
  rung.buildings.records[2].charge = 1800;
  rung.ring(3);
  rung.applyOffline(10);
  assert.equal(rung.buildings.records[2].ring, 200);
  rung.applyOffline(7200);
  assert.equal(rung.buildings.records[2].ring, 0);
  const calm = game(layout);
  calm.applyOffline(10);
  calm.applyOffline(7200); // plafond de 2 h par appel
  assert.equal(roundAmount(rung.earned.knowledge - calm.earned.knowledge), 15 * 1.2, '15 cycles de plus sur 30 s de sonnerie');
});

test('migration v12 → v13 : partie de l\'étape 7a inchangée ; Scriptorium, Cloche et cumul validés ; aller-retour', () => {
  const v12doc = {
    version: 12, savedAt: 1764000000000,
    sim: { tick: 900, resources: { knowledge: 50, omens: 9, relics: 0 }, earned: { knowledge: 400, omens: 40, relics: 0 }, visitors: 0, islands: [] },
    buildings: { nextUid: 5, buildings: [
      { uid: 1, type: 'library', x: 3, z: 3, rotation: 0, prodTicks: 4, paused: false, level: 2 },
      { uid: 2, type: 'observatory', x: 8, z: 8, rotation: 0, prodTicks: 40, paused: true, level: 1 },
      { uid: 3, type: 'sanctuary', x: 6, z: 3, rotation: 0, level: 1 },
      { uid: 4, type: 'lighthouse', x: 12, z: 12, rotation: 0, stage: 2 },
    ] },
    journal: { unlocked: [], unread: [], missives: 0 },
    day: { startedAt: 1764000000000 },
    progress: { playSeconds: 90, finished: false },
  };
  const data = parseSave(JSON.stringify(v12doc));
  assert.equal(data.version, 13);
  assert.deepEqual(data.buildings.buildings, v12doc.buildings.buildings.map((r) => ({ ...r })), 'aucun bâtiment modifié');
  // Aller-retour avec les deux nouveaux bâtiments.
  const doc = JSON.parse(JSON.stringify(data));
  doc.buildings.buildings.push(
    { uid: 5, type: 'scriptorium', x: 9, z: 9, rotation: 0, level: 3 },
    { uid: 6, type: 'bell', x: 4, z: 6, rotation: 0, level: 2, charge: 1300, ring: 250 },
    { uid: 7, type: 'bell', x: 5, z: 6, rotation: 0 });
  doc.buildings.buildings[1].muse = 0.4;
  doc.buildings.nextUid = 8;
  const again = parseSave(JSON.stringify(doc));
  assert.equal(again.buildings.buildings[1].muse, 0.4);
  assert.deepEqual([again.buildings.buildings[5].charge, again.buildings.buildings[5].ring, again.buildings.buildings[5].level], [1300, 250, 2]);
  assert.deepEqual([again.buildings.buildings[6].charge, again.buildings.buildings[6].ring, again.buildings.buildings[6].level], [0, 0, 1]);
  assert.equal(again.buildings.buildings[4].level, 3);
  // Refusés : charge ou sonnerie hors bornes, champs sur le mauvais type, cumul hors bornes, quatre Cloches.
  const bad = (edit) => {
    const copy = JSON.parse(JSON.stringify(doc));
    edit(copy.buildings.buildings);
    assert.throws(() => parseSave(JSON.stringify(copy)));
  };
  bad((b) => { b[5].charge = 1801; });
  bad((b) => { b[5].charge = -1; });
  bad((b) => { b[5].ring = 301; });
  bad((b) => { b[5].ring = 2.5; });
  bad((b) => { b[0].charge = 0; });
  bad((b) => { b[4].ring = 0; });
  bad((b) => { b[1].muse = 1; });
  bad((b) => { b[1].muse = -0.2; });
  bad((b) => { b[0].muse = 0.2; });
  bad((b) => { b[4].level = 4; });
  bad((b) => { b.push({ uid: 8, type: 'bell', x: 6, z: 6, rotation: 0 }, { uid: 9, type: 'bell', x: 7, z: 6, rotation: 0 }); });
  // Charge à la valeur maximale du niveau 1 mais conservée : la simulation ramène la charge à la borne du niveau.
  const loaded = game([['bell', 3, 1, 0, 2, { charge: 1800 }]]);
  loaded.load({ tick: 0, resources: {} });
  assert.equal(loaded.buildings.records[0].charge, 1300);
});

test('mode économie : débit net tient compte des Scriptoriums, pose automatique du Scriptorium près des Observatoires', () => {
  const sim = game([['library', 0, 0], ['sanctuary', 20, 20], ['observatory', 10, 10], ['observatory', 14, 10], ['scriptorium', 11, 10]],
    { knowledge: 1e5, omens: 1e4 });
  const flow = flowPerMinute(sim);
  assert.equal(flow.knowledge.used, (1 * 15) + (2 * 15), '1 Savoir par cycle servi, 2 sinon (15 cycles / min)');
  const terrain = new Terrain(GRID.size);
  for (const r of sim.buildings.records) {
    const { w, d } = BALANCE.buildings[r.type].footprint;
    for (const t of terrain.footprintTiles(r.x, r.z, w, d)) t.occupant = r.uid;
  }
  const spot = autoSpot(sim, terrain, 'scriptorium');
  assert.equal(spot.ok, true);
  assert.deepEqual(sim.wouldBoost('scriptorium', spot.x, spot.z).map((r) => r.uid), [4], 'sert l\'Observatoire encore non servi');
});
