// Sauvegarde dans localStorage : format versionné, migrations, validation stricte.
// Règle d'or : une sauvegarde absente, corrompue ou illisible ne bloque JAMAIS
// le jeu. On repart sur une nouvelle partie et on le signale dans la console.
//
// Format (version 1) :
// {
//   version: 1,
//   savedAt: 1700000000000,          // Date.now() : instant jusqu'où l'état est à jour
//   sim: { tick, resources: { knowledge } },
//   buildings: { nextUid, buildings: [{ uid, type, x, z, rotation, prodTicks }] }
// }

import { SAVE } from '../config.js';
import { BALANCE } from '../balance.js';
import { getBuildingType } from '../buildings/catalog.js';

export const SAVE_VERSION = 1;

// Migrations : MIGRATIONS[n] transforme une sauvegarde version n en version n + 1.
// Exemple futur : 1: (data) => ({ ...data, version: 2, nouveauChamp: 0 }),
const MIGRATIONS = {};

const TAG = '[sauvegarde]';

// ----- Accès au stockage (toutes les opérations protégées) -----

export class SaveStore {
  constructor(key = SAVE.storageKey) {
    this.key = key;
  }

  read() {
    try {
      return window.localStorage.getItem(this.key);
    } catch (err) {
      console.warn(TAG, 'lecture impossible :', err);
      return null;
    }
  }

  write(text) {
    try {
      window.localStorage.setItem(this.key, text);
      this.writeWarned = false;
      return true;
    } catch (err) {
      // Un seul avertissement tant que le problème persiste (pas de spam toutes les 10 s)
      if (!this.writeWarned) console.warn(TAG, 'écriture impossible :', err);
      this.writeWarned = true;
      return false;
    }
  }

  clear() {
    try {
      window.localStorage.removeItem(this.key);
    } catch (err) {
      console.warn(TAG, 'effacement impossible :', err);
    }
  }

  // Garde une copie d'une sauvegarde illisible, pour diagnostic éventuel.
  backup(text) {
    try {
      window.localStorage.setItem(`${this.key}:illisible`, text);
    } catch {
      /* rien : la copie de secours est facultative */
    }
  }
}

// ----- Validation -----

const isInt = (v) => Number.isInteger(v);
const isCount = (v) => Number.isFinite(v) && v >= 0;

function fail(message) {
  throw new Error(message);
}

function migrate(data) {
  let current = data;
  while (current.version < SAVE_VERSION) {
    const step = MIGRATIONS[current.version];
    if (!step) fail(`aucune migration depuis la version ${current.version}`);
    current = step(current);
  }
  return current;
}

// Texte brut → données normalisées, ou exception si quoi que ce soit cloche.
export function parseSave(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    fail('JSON invalide');
  }
  if (!data || typeof data !== 'object') fail('format inattendu');
  if (!isInt(data.version) || data.version < 1) fail('version absente ou invalide');
  if (data.version > SAVE_VERSION) fail(`version ${data.version} plus récente que le jeu`);
  data = migrate(data);

  if (!Number.isFinite(data.savedAt)) fail('date de sauvegarde invalide');

  const sim = data.sim;
  if (!sim || !isInt(sim.tick) || sim.tick < 0) fail('état de simulation invalide');
  if (!sim.resources || typeof sim.resources !== 'object') fail('ressources invalides');
  const resources = {};
  for (const id of Object.keys(BALANCE.resources)) {
    const v = sim.resources[id];
    if (v === undefined) continue;
    if (!isCount(v)) fail(`ressource ${id} invalide`);
    resources[id] = v;
  }

  const b = data.buildings;
  if (!b || !Array.isArray(b.buildings) || !isInt(b.nextUid)) fail('bâtiments invalides');
  const seen = new Set();
  const records = b.buildings.map((r) => {
    if (!r || !isInt(r.uid) || r.uid < 1 || seen.has(r.uid)) fail('identifiant de bâtiment invalide');
    seen.add(r.uid);
    if (!getBuildingType(r.type)) fail(`type de bâtiment inconnu : ${r.type}`);
    if (!isInt(r.x) || !isInt(r.z)) fail('position de bâtiment invalide');
    const rotation = r.rotation ?? 0;
    if (!isInt(rotation) || rotation < 0 || rotation > 3) fail('rotation invalide');
    const record = { uid: r.uid, type: r.type, x: r.x, z: r.z, rotation };
    if (r.prodTicks !== undefined) {
      if (!isInt(r.prodTicks) || r.prodTicks < 0) fail('progression de production invalide');
      record.prodTicks = r.prodTicks;
    }
    return record;
  });

  return {
    version: SAVE_VERSION,
    savedAt: data.savedAt,
    sim: { tick: sim.tick, resources },
    buildings: { nextUid: b.nextUid, buildings: records },
  };
}

// ----- Orchestration -----

export class SaveManager {
  constructor({ sim, buildings, store = new SaveStore() }) {
    this.sim = sim;
    this.buildings = buildings;
    this.store = store;
    this.enabled = true;
  }

  // Charge la sauvegarde si elle existe.
  // → { status: 'new' } | { status: 'loaded', savedAt } | { status: 'corrupt' }
  load() {
    const text = this.store.read();
    if (text === null) return { status: 'new' };
    try {
      const data = parseSave(text);
      this.buildings.load(data.buildings);
      this.sim.load(data.sim);
      return { status: 'loaded', savedAt: data.savedAt };
    } catch (err) {
      console.warn(TAG, 'sauvegarde illisible, nouvelle partie :', err.message);
      this.store.backup(text);
      this.buildings.clear();
      this.sim.reset();
      return { status: 'corrupt' };
    }
  }

  save() {
    if (!this.enabled) return false;
    try {
      const data = {
        version: SAVE_VERSION,
        savedAt: Date.now(),
        sim: this.sim.toJSON(),
        buildings: this.buildings.toJSON(),
      };
      return this.store.write(JSON.stringify(data));
    } catch (err) {
      console.warn(TAG, 'sérialisation impossible :', err);
      return false;
    }
  }

  // Efface la sauvegarde et bloque toute écriture ultérieure (avant rechargement).
  wipe() {
    this.enabled = false;
    this.store.clear();
  }
}
