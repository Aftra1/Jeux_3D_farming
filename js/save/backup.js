// Copies de secours, export et import des sauvegardes (sans DOM ni Three.js, testable sous Node).
// Une copie = le texte exact d'une sauvegarde valide ; on garde les SAVE.backupCount plus récentes,
// une nouvelle toutes les SAVE.backupEverySeconds de jeu actif. Tout passe par parseSave :
// validation et migrations sont celles de la sauvegarde normale.

import { SAVE } from '../config.js';
import { goalOf } from '../story/path.js';
import { parseSave } from './save.js';

const TAG = '[sauvegarde]';
const CODE_PREFIX = 'SDL1:';
const MAX_IMPORT_CHARS = 2_000_000;

// ----- Résumé d'une partie (écran titre, liste des copies, aperçu d'import) -----

// data = résultat de parseSave → { chapter, objective, have, target, playSeconds, savedAt, buildings }
export function describeSave(data) {
  const lighthouse = data.buildings.buildings.find((r) => r.type === 'lighthouse');
  const stage = lighthouse?.stage ?? 0;
  const goal = goalOf(data.progress.finished, { stageOf: () => stage }, data.journal.missives);
  return {
    chapter: goal.label,
    objective: goal.title,
    have: goal.have,
    target: goal.target,
    playSeconds: data.progress.playSeconds,
    savedAt: data.savedAt,
    buildings: data.buildings.buildings.length,
  };
}

// 90 s → « il y a 1 minute » ; 2 h → « il y a 2 heures » ; futur ou < 1 min → « à l'instant ».
export function formatAgo(ms) {
  const minutes = Math.floor(Math.max(0, ms) / 60000);
  if (minutes < 1) return 'à l\'instant';
  const unit = (n, word) => `il y a ${n} ${word}${n > 1 ? 's' : ''}`;
  if (minutes < 60) return unit(minutes, 'minute');
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return unit(hours, 'heure');
  return unit(Math.floor(hours / 24), 'jour');
}

// ----- Code d'export (texte compact : préfixe + base64 du JSON) -----

export function encodeCode(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return CODE_PREFIX + btoa(binary);
}

export class ImportError extends Error {}

// Fichier .json ou code collé → { data, text } (données validées et migrées, texte normalisé).
// Toute anomalie lève ImportError avec un message destiné au joueur ; rien n'est modifié.
export function readImport(input) {
  const raw = String(input ?? '').trim();
  if (!raw) throw new ImportError('Rien à importer : le contenu est vide.');
  if (raw.length > MAX_IMPORT_CHARS) throw new ImportError('Ce contenu est trop volumineux pour être une sauvegarde.');
  let json = raw;
  if (!/^[{[]/.test(raw)) {
    const body = raw.replace(/^SDL\d+:/, '').replace(/\s+/g, '');
    try {
      const binary = atob(body);
      json = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
    } catch {
      throw new ImportError('Ce code n\'est pas reconnu : il a peut-être été coupé ou modifié en route.');
    }
  }
  let data;
  try {
    data = parseSave(json);
  } catch (err) {
    if (/plus récente/.test(err.message)) {
      throw new ImportError('Cette sauvegarde vient d\'une version plus récente du jeu.');
    }
    if (/JSON invalide|format inattendu|version absente/.test(err.message)) {
      throw new ImportError('Ce n\'est pas une sauvegarde de la Société du Lac.');
    }
    throw new ImportError(`Cette sauvegarde est abîmée ou incomplète (${err.message}).`);
  }
  return { data, text: JSON.stringify(data) };
}

// ----- Copies de secours -----

// Texte brut → { text, savedAt, playSeconds }, ou null s'il n'est pas une sauvegarde valide.
export function entryOf(text) {
  try {
    const data = parseSave(text);
    return { text, savedAt: data.savedAt, playSeconds: data.progress.playSeconds };
  } catch {
    return null;
  }
}

export class BackupStore {
  // storage : { getItem, setItem } (localStorage par défaut ; injectable pour les tests)
  constructor({ storage = null, key = `${SAVE.storageKey}:copies`, count = SAVE.backupCount,
    everySeconds = SAVE.backupEverySeconds } = {}) {
    this.storage = storage;
    this.key = key;
    this.count = count;
    this.everySeconds = everySeconds;
  }

  #area() {
    try {
      return this.storage ?? window.localStorage;
    } catch {
      return null;
    }
  }

  // Copies, de la plus récente à la plus ancienne (entrées mal formées ignorées).
  list() {
    try {
      const list = JSON.parse(this.#area()?.getItem(this.key) ?? '[]');
      return Array.isArray(list)
        ? list.filter((e) => e && typeof e.text === 'string' && Number.isFinite(e.savedAt) && Number.isFinite(e.playSeconds))
          .slice(0, this.count)
        : [];
    } catch {
      return [];
    }
  }

  // Rotation automatique : appelée à chaque sauvegarde réussie. Une copie par tranche de jeu actif,
  // jamais avant la première tranche (une partie à peine commencée ne vaut pas une copie).
  consider(entry) {
    const [latest] = this.list();
    const due = latest ? Math.abs(entry.playSeconds - latest.playSeconds) >= this.everySeconds
      : entry.playSeconds >= this.everySeconds;
    return due ? this.add(entry) : false;
  }

  // Ajoute une copie en tête (avant un import ou une restauration : toujours). Texte identique : ignoré.
  add(entry) {
    const list = this.list();
    if (list[0]?.text === entry.text) return false;
    let next = [entry, ...list].slice(0, this.count);
    for (;;) {
      try {
        this.#area().setItem(this.key, JSON.stringify(next));
        return true;
      } catch (err) {
        if (next.length <= 1) {
          console.warn(TAG, 'copie de secours impossible :', err);
          return false;
        }
        next = next.slice(0, -1); // stockage plein : la plus ancienne cède la place
      }
    }
  }

  // Copies lisibles, résumées pour l'interface : [{ index, text, ...describeSave }].
  described() {
    return this.list().flatMap((entry, index) => {
      try {
        return [{ index, text: entry.text, ...describeSave(parseSave(entry.text)) }];
      } catch {
        return [];
      }
    });
  }
}
