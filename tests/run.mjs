// Tests de la simulation et de la sauvegarde (sans navigateur, sans Three.js).
// Lancer depuis la racine du dépôt :   node tests/run.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE } from '../js/balance.js';
import { Simulation, productionOf } from '../js/sim/simulation.js';
import { parseSave, SAVE_VERSION } from '../js/save/save.js';
import { Journal } from '../js/story/journal.js';
import { FRAGMENTS } from '../js/story/fragments.js';

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

// Partie de départ : `layout` = types posés dans l'ordre (directement dans le
// registre, sans coût ni déblocage : on teste ici le moteur de production).
function game(layout, resources = {}) {
  const reg = new FakeRegistry();
  for (const type of layout) reg.place(type, 0, 0, { prodTicks: 0, paused: false });
  const sim = new Simulation(reg);
  Object.assign(sim.resources, resources);
  return sim;
}

const snapshot = (sim) => ({
  tick: sim.tick,
  resources: { ...sim.resources },
  buildings: sim.buildings.records.map((r) => ({ prodTicks: r.prodTicks, paused: r.paused })),
});

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

test('migrations v1 → v3 : une sauvegarde de l\'étape 4 se charge', () => {
  const data = parseSave(STEP4_SAVE);
  assert.equal(SAVE_VERSION, 3);
  assert.equal(data.version, 3);
  assert.equal(data.savedAt, 1760960000000);
  assert.deepEqual(data.sim, {
    tick: 1234,
    resources: { knowledge: 57, omens: 0 },
    earned: { knowledge: 57, omens: 0 },
  });
  assert.deepEqual(data.journal, { unlocked: [], unread: [] });
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

test('migration v2 → v3 : total cumulé estimé au solde, Carnet vide puis premier fragment', () => {
  const data = parseSave(STEP5_SAVE);
  assert.equal(data.version, 3);
  assert.deepEqual(data.sim.resources, { knowledge: 4, omens: 12 });
  assert.deepEqual(data.sim.earned, { knowledge: 4, omens: 12 });
  assert.deepEqual(data.journal, { unlocked: [], unread: [] });
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
  assert.deepEqual(FRAGMENTS.map((f) => [f.resource, f.threshold]), [['omens', 5], ['omens', 25], ['omens', 100]]);
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

test('sauvegarde v3 : aller-retour', () => {
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
  assert.deepEqual(back.toJSON(), { unlocked: FRAGMENTS.map((f) => f.id), unread: ['lettre-au-gardien'] });
});

test('Carnet : fragment inconnu ignoré au chargement, pas d\'erreur', () => {
  const v3 = { ...JSON.parse(STEP5_SAVE), version: 3,
    sim: { tick: 1, resources: {}, earned: {} },
    journal: { unlocked: ['note-sans-date', 'fragment-retire'], unread: ['fragment-retire'] } };
  assert.deepEqual(parseSave(JSON.stringify(v3)).journal, { unlocked: ['note-sans-date'], unread: [] });
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
  ];
  for (const text of bad) assert.throws(() => parseSave(text), undefined, text.slice(0, 40));
});
