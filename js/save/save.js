// Sauvegarde dans localStorage : format versionné, migrations, validation stricte.
// Règle d'or : une sauvegarde absente, corrompue ou illisible ne bloque JAMAIS
// le jeu. On repart sur une nouvelle partie et on le signale dans la console.
//
// Format (version 6) :
// {
//   version: 6,
//   savedAt: 1700000000000,          // Date.now() : instant jusqu'où l'état est à jour
//   sim: { tick, resources: { knowledge, omens }, earned: { knowledge, omens } },
//   buildings: { nextUid, buildings: [{ uid, type, x, z, rotation, prodTicks, paused, stage }] },
//   journal: { unlocked: [id, ...], unread: [id, ...], missives: n }, // n = missives accomplies
//   day: { startedAt }                // Date.now() du début de partie (cycle jour/nuit)
// }
// Historique : v1 (étape 4) n'avait ni `omens` ni `paused` ; v2 (étape 5) ni
// `earned` ni `journal` ; v3 (étape 6) ni `journal.missives` ; v4 (étape 9) ni `day` ;
// v5 (étape 11) ni `stage` (palier des grands chantiers, seul le Phare en a un).
//
// Ce module ne dépend pas de Three.js (testable sous Node) : les types de
// bâtiments connus sont ceux de BALANCE.buildings.

import { SAVE } from '../config.js';
import { BALANCE } from '../balance.js';
import { FRAGMENT_IDS } from '../story/fragments.js';
import { MISSIVES } from '../story/missives.js';

export const SAVE_VERSION = 6;

// Migrations : MIGRATIONS[n] transforme une sauvegarde version n en version n + 1.
// Elles ne valident rien (parseSave valide le résultat final) et ne doivent pas
// planter sur des données inattendues : au pire, la validation échouera ensuite.
const MIGRATIONS = {
  // v1 → v2 : arrivée des Présages et de la pause des producteurs.
  1: (data) => {
    const sim = data.sim && typeof data.sim === 'object' ? data.sim : {};
    const resources = sim.resources && typeof sim.resources === 'object' ? sim.resources : {};
    const b = data.buildings && typeof data.buildings === 'object' ? data.buildings : {};
    return {
      ...data,
      version: 2,
      sim: { ...sim, resources: { ...resources, omens: resources.omens ?? 0 } },
      buildings: {
        ...b,
        buildings: Array.isArray(b.buildings)
          ? b.buildings.map((r) => (r && typeof r === 'object' ? { ...r, paused: false } : r))
          : b.buildings,
      },
    };
  },
  // v2 → v3 : total cumulé et Carnet. Le vrai total est inconnu : le solde actuel
  // en est la meilleure borne basse (rien n'a jamais dépensé de Présages).
  2: (data) => {
    const sim = data.sim && typeof data.sim === 'object' ? data.sim : {};
    const resources = sim.resources && typeof sim.resources === 'object' ? sim.resources : {};
    return {
      ...data,
      version: 3,
      sim: { ...sim, earned: { ...resources } },
      journal: { unlocked: [], unread: [] },
    };
  },
  // v3 → v4 : missives. On part de 0 : au chargement, le Carnet accomplit d'office
  // les missives déjà remplies par la partie (voir Journal.advanceMissives).
  3: (data) => {
    const j = data.journal;
    return { ...data, version: 4, journal: j && typeof j === 'object' ? { ...j, missives: 0 } : j };
  },
  // v4 → v5 : heure du domaine. Début réel inconnu : la partie reprend en début d'après-midi.
  4: (data) => ({ ...data, version: 5, day: { startedAt: data.savedAt } }),
  // v5 → v6 : palier des grands chantiers (`stage`). Aucun Phare n'existait avant :
  // rien à convertir, seule la validation (`stage` requis pour un Phare) change.
  5: (data) => ({ ...data, version: 6 }),
};

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
  if (!sim.earned || typeof sim.earned !== 'object') fail('totaux cumulés invalides');
  const counts = (source, what) => {
    const out = {};
    for (const id of Object.keys(BALANCE.resources)) {
      const v = source[id];
      if (v === undefined) continue;
      if (!isCount(v)) fail(`${what} ${id} invalide`);
      out[id] = v;
    }
    return out;
  };
  const resources = counts(sim.resources, 'ressource');
  const earned = counts(sim.earned, 'total cumulé');

  // Carnet : un id inconnu (fragment retiré de fragments.js) est ignoré, pas une erreur.
  const j = data.journal;
  if (!j || !Array.isArray(j.unlocked) || !Array.isArray(j.unread)) fail('carnet invalide');
  if (![...j.unlocked, ...j.unread].every((id) => typeof id === 'string')) fail('carnet invalide');
  const unlocked = [...new Set(j.unlocked)].filter((id) => FRAGMENT_IDS.includes(id));
  const unread = [...new Set(j.unread)].filter((id) => unlocked.includes(id));
  if (!isInt(j.missives) || j.missives < 0) fail('missives invalides');
  const missives = Math.min(j.missives, MISSIVES.length); // missives retirées du jeu

  if (!data.day || !Number.isFinite(data.day.startedAt)) fail('heure du domaine invalide');

  const b = data.buildings;
  if (!b || !Array.isArray(b.buildings) || !isInt(b.nextUid)) fail('bâtiments invalides');
  const seen = new Set();
  const records = b.buildings.map((r) => {
    if (!r || !isInt(r.uid) || r.uid < 1 || seen.has(r.uid)) fail('identifiant de bâtiment invalide');
    seen.add(r.uid);
    if (typeof r.type !== 'string' || !Object.hasOwn(BALANCE.buildings, r.type)) {
      fail(`type de bâtiment inconnu : ${r.type}`);
    }
    if (!isInt(r.x) || !isInt(r.z)) fail('position de bâtiment invalide');
    const rotation = r.rotation ?? 0;
    if (!isInt(rotation) || rotation < 0 || rotation > 3) fail('rotation invalide');
    const record = { uid: r.uid, type: r.type, x: r.x, z: r.z, rotation };
    if (r.prodTicks !== undefined) {
      if (!isInt(r.prodTicks) || r.prodTicks < 0) fail('progression de production invalide');
      record.prodTicks = r.prodTicks;
    }
    if (r.paused !== undefined) {
      if (typeof r.paused !== 'boolean') fail('état de pause invalide');
      record.paused = r.paused;
    }
    const rules = BALANCE.buildings[r.type];
    if (rules.stages) {
      if (!isInt(r.stage) || r.stage < 1 || r.stage > rules.stages.length) fail('palier invalide');
      record.stage = r.stage;
    } else if (r.stage !== undefined) fail('palier inattendu');
    return record;
  });
  for (const [type, rules] of Object.entries(BALANCE.buildings)) {
    if (rules.unique && records.filter((r) => r.type === type).length > 1) fail(`${type} en double`);
  }

  return {
    version: SAVE_VERSION,
    savedAt: data.savedAt,
    sim: { tick: sim.tick, resources, earned },
    buildings: { nextUid: b.nextUid, buildings: records },
    journal: { unlocked, unread, missives },
    day: { startedAt: data.day.startedAt },
  };
}

// ----- Orchestration -----

export class SaveManager {
  constructor({ sim, buildings, journal, day, store = new SaveStore() }) {
    this.sim = sim;
    this.day = day;
    this.buildings = buildings;
    this.journal = journal;
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
      this.journal.load(data.journal);
      this.sim.load(data.sim);
      this.day.load(data.day);
      return { status: 'loaded', savedAt: data.savedAt };
    } catch (err) {
      console.warn(TAG, 'sauvegarde illisible, nouvelle partie :', err.message);
      this.store.backup(text);
      this.buildings.clear();
      this.journal.reset();
      this.sim.reset();
      this.day.reset();
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
        journal: this.journal.toJSON(),
        day: this.day.toJSON(),
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
