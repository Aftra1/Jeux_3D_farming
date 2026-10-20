// Tests de la simulation et de la sauvegarde (sans navigateur, sans Three.js).
// Lancer depuis la racine du dépôt :   node tests/run.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE } from '../js/balance.js';
import { Simulation, productionOf } from '../js/sim/simulation.js';
import { parseSave, SAVE_VERSION } from '../js/save/save.js';
import { Journal, missiveProgress } from '../js/story/journal.js';
import { FRAGMENTS } from '../js/story/fragments.js';
import { MISSIVES } from '../js/story/missives.js';
import { AUDIO } from '../js/config.js';
import { RateLimiter, scaleMidi, parseSoundPref } from '../js/audio/audio.js';

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

// Partie de départ : `layout` = types posés dans l'ordre, `'type'` ou `['type', x, z]`
// (directement dans le registre, sans coût ni déblocage : on teste ici le moteur).
function game(layout, resources = {}) {
  const reg = new FakeRegistry();
  for (const entry of layout) {
    const [type, x = 0, z = 0] = Array.isArray(entry) ? entry : [entry];
    reg.place(type, x, z, productionOf(type) ? { prodTicks: 0, paused: false } : {});
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
        for (const [res, n] of Object.entries(p.inputs)) sim.resources[res] -= n;
        for (const [res, n] of Object.entries(p.outputs)) sim.resources[res] += n;
        sim.resources.knowledge += referenceBonus(sim, r);
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

test('migrations v1 → v4 : une sauvegarde de l\'étape 4 se charge', () => {
  const data = parseSave(STEP4_SAVE);
  assert.equal(SAVE_VERSION, 4);
  assert.equal(data.version, 4);
  assert.equal(data.savedAt, 1760960000000);
  assert.deepEqual(data.sim, {
    tick: 1234,
    resources: { knowledge: 57, omens: 0 },
    earned: { knowledge: 57, omens: 0 },
  });
  assert.deepEqual(data.journal, { unlocked: [], unread: [], missives: 0 });
  assert.deepEqual(data.buildings.buildings, [
    { uid: 1, type: 'library', x: 9, z: 7, rotation: 0, prodTicks: 12, paused: false },
    { uid: 2, type: 'library', x: 4, z: 8, rotation: 0, prodTicks: 3, paused: false },
  ]);

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

test('migration v2 → v4 : total cumulé estimé au solde, Carnet vide puis premier fragment', () => {
  const data = parseSave(STEP5_SAVE);
  assert.equal(data.version, 4);
  assert.deepEqual(data.sim.resources, { knowledge: 4, omens: 12 });
  assert.deepEqual(data.sim.earned, { knowledge: 4, omens: 12 });
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
    sim.resources.knowledge += 50;
    sim.resources.omens += 10;
    assert.ok(sim.placeBuilding('sanctuary', 4, 2), 'pose du Sanctuaire');
  }
  continuous(live, phases[1], 60);
  offline.applyOffline(phases[1]);
  referenceRun(reference, Math.floor(phases[1] * BALANCE.ticksPerSecond));
  assert.deepEqual(snapshot(offline), snapshot(reference));
  assert.deepEqual(snapshot(live), snapshot(reference));
  assert.deepEqual(live.earned, offline.earned);
});

test('Sanctuaire : coût, déblocage par 1 Observatoire, Présages dépensés sans toucher au cumul', () => {
  const sim = game([['library', 0, 0], ['library', 4, 0]], { knowledge: 100, omens: 30 });
  sim.earned.omens = 30;
  assert.equal(sim.canPlace('sanctuary', 8, 8).reason, 'locked');
  sim.buildings.place('observatory', 10, 10, { prodTicks: 0, paused: false });
  assert.deepEqual(sim.costOf('sanctuary'), { knowledge: 50, omens: 10 });
  assert.ok(sim.placeBuilding('sanctuary', 8, 8));
  assert.equal(sim.resources.knowledge, 50);
  assert.equal(sim.resources.omens, 20);
  assert.equal(sim.earned.omens, 30);
  sim.resources.omens = 5;
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
  assert.deepEqual(FRAGMENTS.filter((f) => !f.missive).map((f) => [f.resource, f.threshold]), [['omens', 5], ['omens', 25], ['omens', 100]]);
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

test('sauvegarde v4 : aller-retour', () => {
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
  });
  const data = parseSave(text);
  assert.deepEqual(data.sim, sim.toJSON());
  assert.deepEqual(data.buildings.buildings, sim.buildings.records);
  assert.deepEqual(data.journal, journal.toJSON());
  const back = new Journal();
  back.load(data.journal);
  const byOmens = FRAGMENTS.filter((f) => !f.missive).map((f) => f.id);
  assert.deepEqual(back.toJSON(), { unlocked: byOmens, unread: ['lettre-au-gardien'], missives: 0 });
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
  ];
  for (const text of bad) assert.throws(() => parseSave(text), undefined, text.slice(0, 40));
});

// ----- Missives -----

const fragmentOf = (missiveId) => FRAGMENTS.find((f) => f.missive === missiveId).id;

test('missives : données cohérentes, un fragment par missive', () => {
  assert.equal(MISSIVES.length, 5);
  assert.equal(new Set(MISSIVES.map((m) => m.id)).size, 5);
  for (const m of MISSIVES) {
    assert.equal(FRAGMENTS.filter((f) => f.missive === m.id).length, 1, m.id);
    assert.ok(Object.hasOwn(BALANCE.buildings, m.condition.type), m.id);
  }
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
  assert.equal(journal.currentMissive, null);
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

test('migration v3 → v4 : une partie avancée rattrape d\'elle-même la bonne missive', () => {
  const data = parseSave(STEP8_SAVE);
  assert.equal(data.version, 4);
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
  const text = JSON.stringify({ ...JSON.parse(STEP8_SAVE), version: SAVE_VERSION, journal: journal.toJSON() });
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
