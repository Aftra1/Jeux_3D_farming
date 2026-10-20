// Tests de la simulation et de la sauvegarde (sans navigateur, sans Three.js).
// Lancer depuis la racine du dépôt :   node tests/run.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE } from '../js/balance.js';
import { Simulation, productionOf } from '../js/sim/simulation.js';
import { parseSave, SAVE_VERSION } from '../js/save/save.js';

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

test('migration v1 → v2 : une sauvegarde de l\'étape 4 se charge', () => {
  const data = parseSave(STEP4_SAVE);
  assert.equal(SAVE_VERSION, 2);
  assert.equal(data.version, 2);
  assert.equal(data.savedAt, 1760960000000);
  assert.deepEqual(data.sim, { tick: 1234, resources: { knowledge: 57, omens: 0 } });
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

test('sauvegarde v2 : aller-retour', () => {
  const sim = game(['library', 'library', 'observatory'], { knowledge: 3 });
  sim.applyOffline(17);
  const text = JSON.stringify({
    version: SAVE_VERSION,
    savedAt: 1,
    sim: sim.toJSON(),
    buildings: { nextUid: sim.buildings.nextUid, buildings: sim.buildings.records },
  });
  const data = parseSave(text);
  assert.deepEqual(data.sim, sim.toJSON());
  assert.deepEqual(data.buildings.buildings, sim.buildings.records);
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
  ];
  for (const text of bad) assert.throws(() => parseSave(text), undefined, text.slice(0, 40));
});
