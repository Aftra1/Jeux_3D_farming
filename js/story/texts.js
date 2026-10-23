// Textes de l'interface (hors récit) : étiquettes, aides, refus, messages. Fichier de données à éditer.
// `HTML` : textes des éléments statiques de index.html (attribut data-t="clé" → texte ;
// data-t-aria / data-t-title → attributs). Le reste est lu par js/ui/ui.js et js/ui/eco.js.
// Espaces insécables avant « : » et « / » : pas de retour à la ligne orphelin.

import { BALANCE } from '../balance.js';

export const HTML = {
  'objective.aria': 'Objectif du chapitre — ouvrir le Carnet',
  'journal.button': 'Carnet',
  'journal.title': 'Carnet',
  'journal.missives': 'Missives',
  'journal.path': 'Chemin',
  'close': 'Refermer',
  'sound.aria': 'Couper le son',
  'eco.title': 'Mode économie d\'énergie',
  'options.title': 'Options',
  'offline.title': 'Retour au domaine',
  'offline.close': 'Reprendre',
  'lighthouse.title': 'Phare du Lac',
  'lighthouse.elevate': 'Élever',
  'move': 'Déplacer',
  'upgrade': 'Améliorer',
  'island.rally': 'Rallier',
  'bell.ring': 'Sonner',
  'quality.label': 'Qualité',
  'quality.auto': 'Auto',
  'quality.low': 'Basse',
  'quality.normal': 'Normale',
  'quality.high': 'Haute',
  'tips.reset': 'Réafficher les conseils',
  'newgame': 'Nouvelle partie',
  'reset.title': 'Nouvelle partie ?',
  'reset.text': 'Votre partie sera effacée : bâtiments, Savoirs et Présages disparaîtront. Les copies de secours restent, et pourront être restaurées depuis les Options.',
  'reset.keep': 'Garder ma partie',
  'reset.go': 'Tout effacer',
  'cancel': 'Annuler',
  'saves.title': 'Sauvegarde',
  'saves.export': 'Exporter',
  'saves.copy': 'Copier le code',
  'saves.import': 'Importer',
  'saves.copies': 'Copies de secours',
  'saved.label': 'Sauvegardé',
  'swap.cancel': 'Annuler',
  'swap.read': 'Lire',
  'swap.file': 'Choisir un fichier',
  'swap.back': 'Retour',
  'swap.code': 'Collez ici le code, ou choisissez un fichier .json.',
  'tools.aria': 'Constructions',
  'tip.close': 'Fermer ce conseil',
};

export const TEXTS = {
  free: 'Gratuit',
  toolStage: (stage, max) => `Palier ${stage} / ${max}`,
  // Condition de déblocage d'un outil verrouillé : « Requiert … (1 / 2) ».
  lock: {
    prefix: 'Requiert ',
    missives: (m) => `${m.required} missives accomplies (${m.have} / ${m.required})`,
    finished: 'que le Phare veille',
    stage: (m, def) => `${def.one} au palier ${m.required} (${m.have} / ${m.required})`,
    building: (m, def) => `${m.required} ${m.required > 1 ? def.plural : def.name} (${m.have} / ${m.required})`,
    join: ' et ',
  },
  refusals: {
    occupied: 'Cet emplacement est déjà occupé.',
    bounds: 'Le bâtiment dépasse du terrain.',
    edge: 'L\'Embarcadère se pose au bord de l\'eau, sur le domaine ou un îlot.',
    room: 'Gardons un carré libre de 2 x 2 cases : le Phare du Lac y prendra place.',
    unique: 'Il n\'y en aura qu\'un : il est déjà posé.',
    limit: (n) => `${n} exemplaires veillent déjà sur le domaine : c\'est assez.`,
    cost: (name, n) => `Pas encore assez de ${name} : il en faut ${n}.`,
    // Pose automatique (mode économie d'énergie)
    full: 'Plus aucune place libre pour ce bâtiment.',
    autoEdge: 'Plus de place libre au bord de l\'eau.',
    autoRoom: 'Le reste du terrain est gardé pour le Phare du Lac.',
    other: 'Impossible pour l\'instant.',
  },
  hint: {
    move: (verb) => `Déplacer : ${verb}`,
    touch: (verb) => `Touchez une case : aperçu · touchez-la encore : ${verb}\n2 doigts pour déplacer la vue`,
    mouse: (verb) => `Clic : ${verb} · clic droit ou Échap : annuler`,
    place: 'poser',
    drop: 'déposer',
    movingHead: (name) => `Déplacer : ${name} · gratuit`,
  },
  journal: {
    none: 'Aucune missive pour l\'instant. La société vous écrira quand elle aura besoin de vous.',
    signal: 'Carnet — nouveau fragment',
    chapter2: 'Chapitre II',
    erasedMissive: 'Encre effacée · se révèle avec une missive accomplie',
    erased: (what, have, threshold) => `Encre effacée · se révèle à ${what} cumulés (${have} / ${threshold})`,
  },
  lighthouse: {
    stage: (stage, max, name) => `Palier ${stage} / ${max} · ${name}`,
    effect: (percent) => `Bibliothèques : +${percent} % de Savoirs`,
    done: 'La lanterne veille sur le lac.',
    next: (name, cost) => `Prochain palier : ${name} · ${cost}`,
    missing: (list) => `\nIl manque encore ${list}.`,
  },
  card: {
    produces: (list, secs) => `Produit ${list} toutes les ${secs} s`,
    consumes: (list) => `Consomme ${list}`,
    paused: (list) => `En pause : il lui faut ${list}`,
    active: 'Actif',
    boosted: (fem) => `Renforcé${fem ? 'e' : ''}`,
    saved: 'Économe : moitié moins de Savoirs',
    aura: (n, name, plural, fem) => `${n} ${n > 1 ? plural : name} renforcé${fem ? 'e' : ''}${n > 1 ? 's' : ''}`,
    noAura: (name, fem) => `Aucun${fem ? 'e' : ''} ${name} à portée`,
    saves: (n, name, plural) => `${n} ${n > 1 ? `${plural} économes` : `${name} économe`}`,
    bellEffect: (radius, seconds, speed) => `Sonnée, elle fait produire ${speed === 2 ? 'deux fois' : `${speed} fois`} plus vite les bâtiments à ${radius} cases, pendant ${seconds} s`,
    bellReady: 'Chargée : touchez-la pour la faire sonner',
    bellCharging: (left) => `Se recharge · prête dans ${left}`,
    bellRinging: (left) => `Elle sonne · encore ${left}`,
    level: (level, max) => `Niveau ${level} / ${max}`,
    upgradeNext: (level, effect, cost) => `Niveau ${level} : ${effect}\nCoût : ${cost}`,
    upgradeMissing: (list) => `\nIl manque encore ${list}.`,
    maxLevel: 'Niveau maximal atteint',
  },
  upgraded: (name, level) => `${name} · niveau ${level}`,
  island: {
    cost: (cost) => `Le rallier : ${cost}`,
    missing: (list) => `\nIl manque encore ${list}.`,
    ready: '\nUne passerelle le reliera au domaine.',
  },
  offline: {
    text: (list) => `Pendant votre absence, ${list}.`,
    clause: (who, several, verb, list) => `${who} ${several ? 'ont' : 'a'} ${verb} ${list}`,
  },
  options: {
    soundOn: 'Son actif',
    soundOff: 'Son coupé',
    soundMute: 'Couper le son',
    soundUnmute: 'Remettre le son',
    dayFrozen: 'Heure figée sur l\'après-midi',
    dayCycle: 'Le jour et la nuit passent',
    ecoOn: 'Économie d\'énergie : scène en veille',
    ecoOff: 'Économie d\'énergie désactivée',
    qualityAuto: (label) => `Automatique : ${label}`,
    qualityFixed: (label) => `Fixée : ${label}`,
    fpsDetail: 'Compteur d\'images détaillé',
    fpsOn: 'Compteur d\'images affiché',
    fpsOff: 'Compteur d\'images masqué',
    tipsDone: 'Conseils réaffichés',
  },
  saves: {
    noCopies: 'Aucune copie pour l\'instant : une est gardée toutes les 10 minutes de jeu, la dernière remplaçant la plus ancienne.',
    restore: 'Restaurer',
    copyLine: (date, info) => `${date}\n${info}`,
    exported: 'Fichier de sauvegarde téléchargé.',
    copied: 'Code copié : collez-le dans « Importer » sur l\'autre appareil.',
    copyFailed: 'Copie automatique impossible : sélectionnez le code ci-dessous et copiez-le.',
    // Résumé d'une partie (aperçu d'import, copie à restaurer)
    detail: (s) => [
      `${s.chapter} · ${s.objective} (${s.have} / ${s.target})`,
      `${s.time} de jeu · ${s.buildings > 1 ? `${s.buildings} bâtiments` : s.buildings === 1 ? '1 bâtiment' : 'aucun bâtiment'}`,
      `Enregistrée ${s.ago}`,
    ].join('\n'),
    importTitle: 'Importer une partie',
    restoreTitle: 'Restaurer cette copie ?',
    confirmTitle: 'Remplacer votre partie ?',
    warn: 'Votre partie actuelle sera remplacée. Elle est d\'abord gardée en copie de secours.',
    replace: 'Remplacer ma partie',
    restoreGo: 'Restaurer',
    emptyCode: 'Collez un code ou choisissez un fichier.',
    fileUnreadable: 'Ce fichier n\'a pas pu être lu.',
    writeFailed: 'Impossible d\'écrire la sauvegarde sur cet appareil : votre partie n\'a pas été touchée.',
  },
  eco: {
    title: 'Le domaine en veille',
    journal: 'Carnet',
    options: 'Options',
    leave: 'Revenir au domaine',
    leaveTitle: 'Quitter le mode économie d\'énergie',
    visitor: 'Un feu follet passe au-dessus du lac · l\'accueillir',
    resources: 'Ressources',
    missive: 'Missive',
    objective: 'Objectif',
    build: 'Bâtir',
    buy: 'Bâtir',
    lighthouse: 'Phare du Lac',
    elevate: 'Élever',
    islands: 'Îlots du lac',
    rally: 'Rallier',
    buildings: 'Bâtiments',
    upgrade: 'Améliorer',
    levels: (counts) => counts.map(([level, n]) => `${n} au niveau ${level}`).join(', '),
    upgradeNext: (level, cost) => `Prochain : niveau ${level} · ${cost}`,
    noBuilding: 'Aucun bâtiment pour l\'instant.',
    stage: (stage, max, name, percent) => `Palier ${stage} / ${max} · ${name} · Bibliothèques +${percent} %`,
    next: (name, cost) => `Prochain : ${name} · ${cost}`,
    missing: (list) => ` · il manque ${list}`,
    rallied: 'Rallié au domaine',
    inMist: (cost) => `Dans la brume · ${cost}`,
    perMin: (v, used) => `${v} produits, ${used} utilisés`,
    boosts: (count, n, name) => `${count > 1 ? 'renforcent' : 'renforce'} ${n} ${name}`,
    boostsNone: 'ne renforce encore rien',
    active: (n) => `${n} en activité`,
    paused: (n) => `${n} en pause`,
    saves: (count, n, name) => `${count > 1 ? 'économisent' : 'économise'} des Savoirs à ${n} ${name}`,
    savesNone: 'n\'économise encore rien',
    bellReady: (n) => (n ? `${n} chargée${n > 1 ? 's' : ''}` : 'en charge'),
    bellCharged: 'chargée',
    bellCharging: (left) => `se recharge · ${left}`,
    bellRinging: (left) => `sonne · encore ${left}`,
    ring: 'Sonner',
    rung: 'La cloche a sonné.',
  },
};

// Durée lisible : « 45 s », « 3 min », « 2 min 10 s ».
export function clock(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  if (s < 60) return `${s} s`;
  const [m, r] = [Math.floor(s / 60), s % 60];
  return r ? `${m} min ${r} s` : `${m} min`;
}

// Effet du passage au niveau `level` d'un bâtiment `type` (écrit d'après balance.js), pour la fiche
// et l'écran d'économie : « +1 Savoir par cycle », « cycle de 4 s à 3 s », « aura étendue à 2 cases »…
const fr = (n) => String(Math.round(n * 100) / 100).replace('.', ',');
export function upgradeEffect(type, level, resourceName) {
  const levels = BALANCE.buildings[type]?.upgrade?.levels ?? [];
  const now = levels[level - 1] ?? {};
  const before = levels[level - 2] ?? {};
  const parts = [];
  for (const [res, n] of Object.entries(now.outputBonus ?? {})) {
    const gain = n - (before.outputBonus?.[res] ?? 0);
    if (gain > 0) parts.push(`+${gain} ${resourceName(res, gain)} par cycle`);
  }
  if (now.intervalSeconds !== undefined) {
    const was = before.intervalSeconds ?? BALANCE.buildings[type].production.intervalSeconds;
    parts.push(`cycle de ${fr(was)} s à ${fr(now.intervalSeconds)} s`);
  }
  const rules = BALANCE.buildings[type];
  if (now.auraRadius !== undefined && now.auraRadius !== (before.auraRadius ?? (rules.aura ?? rules.efficiency).radius)) {
    parts.push(`aura étendue à ${now.auraRadius} cases`);
  }
  if ((now.extraChance ?? 0) > (before.extraChance ?? 0)) {
    const extra = Object.entries(now.extra).map(([res, n]) => `${n} ${resourceName(res, n)}`).join(', ');
    parts.push(`${Math.round(now.extraChance * 100)} % de chances qu'un Observatoire voisin produise ${extra} de plus par cycle`);
  }
  if (now.chargeSeconds !== undefined && now.chargeSeconds !== (before.chargeSeconds ?? rules.bell.chargeSeconds)) {
    parts.push(`recharge en ${clock(now.chargeSeconds)} au lieu de ${clock(before.chargeSeconds ?? rules.bell.chargeSeconds)}`);
  }
  if (now.radius !== undefined && now.radius !== (before.radius ?? rules.bell.radius)) {
    parts.push(`portée de ${before.radius ?? rules.bell.radius} à ${now.radius} cases`);
  }
  if ((now.auraBonusScale ?? 1) > (before.auraBonusScale ?? 1)) {
    parts.push(`bonus des Bibliothèques renforcées ×${fr(now.auraBonusScale)}`);
  }
  if ((now.doubleChance ?? 0) > (before.doubleChance ?? 0)) {
    parts.push(`${Math.round(now.doubleChance * 100)} % de chances de remonter 2 Reliques au lieu d'une`);
  }
  return parts.join(', ');
}
