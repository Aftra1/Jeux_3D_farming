// Tests de la simulation et de la sauvegarde (sans navigateur, sans Three.js).
// Lancer depuis la racine du dépôt :   node tests/run.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE } from '../js/balance.js';
import { Simulation, productionOf, roundAmount } from '../js/sim/simulation.js';
import { parseSave, SAVE_VERSION } from '../js/save/save.js';
import { Journal, missiveProgress } from '../js/story/journal.js';
import { FRAGMENTS } from '../js/story/fragments.js';
import { MISSIVES } from '../js/story/missives.js';
import { AUDIO, DAYCYCLE } from '../js/config.js';
import { sampleDay, CYCLE_SECONDS, DayCycle, parseDayPref } from '../js/world/daycycle.js';
import { RateLimiter, scaleMidi, parseSoundPref } from '../js/audio/audio.js';
import { Progress } from '../js/story/progress.js';
import { ENDING, formatDuration } from '../js/story/ending.js';
import { QualityManager, parseQualityPref } from '../js/render/quality.js';
import { QUALITY } from '../js/config.js';

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
    const [type, x = 0, z = 0, stage] = Array.isArray(entry) ? entry : [entry];
    const extra = productionOf(type) ? { prodTicks: 0, paused: false } : {};
    if (stage) extra.stage = stage;
    reg.place(type, x, z, extra);
  }
  const sim = new Simulation(reg);
  Object.assign(sim.resources, resources);
  return sim;
}

const snapshot = (sim) => ({
  tick: sim.tick,
  resources: { ...sim.resources },
  buildings: sim.buildings.records.map((r) => ({ prodTicks: r.prodTicks, paused: r.paused })),
});

// Bonus de Sanctuaire, recalculé naïvement case par case : une Bibliothèque (2x2)
// dont une case est l'une des 8 voisines d'un Sanctuaire reçoit +1 Savoir (sans cumul).
function referenceBonus(sim, r) {
  if (r.type !== 'library') return 0;
  const cells = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([dx, dz]) => [r.x + dx, r.z + dz]);
  return sim.buildings.records.some((s) => s.type === 'sanctuary' && cells.some(([x, z]) =>
    Math.abs(x - s.x) <= 1 && Math.abs(z - s.z) <= 1 && !(x === s.x && z === s.z))) ? 1 : 0;
}

const referenceStage = (sim) => sim.buildings.records.find((r) => r.type === 'lighthouse')?.stage ?? 0;

// Implémentation de référence, volontairement naïve : un tick à la fois.
function referenceRun(sim, ticks) {
  const has = (cost) => Object.entries(cost).every(([res, n]) => sim.resources[res] >= n);
  const producers = sim.buildings.records.filter((r) => productionOf(r.type));
  for (let t = 0; t < ticks; t++) {
    for (const r of producers) if (!r.paused) r.prodTicks++;
    sim.tick++;
    for (const r of producers) {
      const p = productionOf(r.type);
      if (r.prodTicks < p.interval) continue;
      if (has(p.inputs)) {
        for (const [res, n] of Object.entries(p.inputs)) sim.resources[res] = roundAmount(sim.resources[res] - n);
        // Phare : +10 % par palier aux Bibliothèques, sur la sortie renforcée comprise.
        const k = r.type === 'library' ? 1 + 0.1 * referenceStage(sim) : 1;
        for (const [res, n] of Object.entries(p.outputs)) {
          const bonus = res === 'knowledge' ? referenceBonus(sim, r) : 0;
          sim.resources[res] = roundAmount(sim.resources[res] + roundAmount((n + bonus) * k));
        }
        r.prodTicks = 0;
        r.paused = false;
      } else {
        r.prodTicks = p.interval;
        r.paused = true;
      }
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

test('migrations v1 → v10 : une sauvegarde de l\'étape 4 se charge', () => {
  const data = parseSave(STEP4_SAVE);
  assert.equal(SAVE_VERSION, 10);
  assert.equal(data.version, SAVE_VERSION);
  assert.deepEqual(data.day, { startedAt: 1760960000000 }); // reprise en début d'après-midi
  assert.equal(data.savedAt, 1760960000000);
  assert.deepEqual(data.sim, {
    tick: 1234,
    resources: { knowledge: 57, omens: 0, relics: 0 },
    earned: { knowledge: 57, omens: 0, relics: 0 },
    visitors: 0,
  });
  assert.deepEqual(data.journal, { unlocked: [], unread: [], missives: 0 });
  assert.deepEqual(data.buildings.buildings, [
    { uid: 1, type: 'library', x: 13, z: 11, rotation: 0, prodTicks: 12, paused: false },
    { uid: 2, type: 'library', x: 8, z: 12, rotation: 0, prodTicks: 3, paused: false },
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
  assert.deepEqual(data.buildings.buildings, old.buildings.buildings.map((r) => ({ ...r, x: r.x + 4, z: r.z + 4 })));
  assert.deepEqual(data.sim, { ...old.sim, visitors: 0, // v8 : aucun visiteur avant l'étape 17
    resources: { ...old.sim.resources, relics: 0 }, earned: { ...old.sim.earned, relics: 0 } }); // v10
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
  assert.deepEqual(data.buildings.buildings, old.buildings.buildings.map((r) => ({ ...r, x: r.x + shift, z: r.z + shift })));
  assert.deepEqual(data.sim, { ...old.sim, visitors: 0, // v8 : aucun visiteur avant l'étape 17
    resources: { ...old.sim.resources, relics: 0 }, earned: { ...old.sim.earned, relics: 0 } }); // v10
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
    earned: { ...old.sim.earned, relics: 0 } }); // v10
  assert.deepEqual(data.buildings.buildings, old.buildings.buildings);
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
  assert.equal(data.version, 10);
  assert.deepEqual(data.sim.resources, { ...old.sim.resources, relics: 0 });
  assert.deepEqual(data.sim.earned, { ...old.sim.earned, relics: 0 });
  assert.deepEqual(data.buildings.buildings, old.buildings.buildings);
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
  reg.gridSize = 24;
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
  assert.ok(FRAGMENTS.filter((f) => f.chapter === 2).every((f) => journal.isUnlocked(f.id)));
  assert.ok(fresh.includes('la-releve'));
});
