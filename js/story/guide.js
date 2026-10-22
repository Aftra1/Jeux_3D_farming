// Guidage : but de chaque chapitre, lettre du chapitre II, « Chemin » du Carnet, conseils de
// premier contact et aides des compteurs. Fichier de données à éditer librement.

// But affiché dans le bandeau permanent. La progression est mesurée par js/story/path.js :
//   chapitre I  → palier du Phare / nombre de paliers ; chapitre II → missives du chapitre accomplies.
export const GOALS = {
  1: { title: 'Élever le Phare du Lac', label: 'Chapitre I' },
  2: { title: 'Faire remonter la lueur', label: 'Chapitre II' },
};

// Courte lettre qui ouvre le chapitre II (après la séquence de fin, une seule fois par partie).
export const CHAPTER_LETTERS = {
  2: {
    title: 'Une lettre sans cachet',
    paragraphs: [
      'Le Phare veille, et pourtant quelque chose répond depuis le fond du lac.',
      'Un vieil embarcadère peut encore servir : les barques rapporteront des Reliques, et chaque Relique porte un nom.',
      'Votre nouveau but : faire remonter la lueur, nom après nom, jusqu\'à ce que le registre soit complet.',
    ],
    signature: '— Une main qui n\'a pas signé',
    accept: 'Je m\'en charge',
  },
};

// Étapes du « Chemin » (Carnet), dans l'ordre. Chaque étape :
//   label     texte de l'étape (accomplie ou non) ;
//   chapter   chapitre qui la montre (1 par défaut) ;
//   cond      mesure : { kind: 'built' | 'boosted' | 'stage' | 'earned', … } (comme les missives),
//             { kind: 'missives', count } (missives accomplies), { kind: 'islands', count }
//             (îlots ralliés), { kind: 'revealed' } (îlots sortis de la brume) ;
//   reveal    même forme : l'étape n'est visible qu'une fois cette condition remplie ;
//             sinon elle reste masquée (comptée dans « des étapes restent à découvrir »).
export const PATH = [
  { id: 'lampe', label: 'Rallumer une première lampe', cond: { kind: 'built', type: 'library', count: 1 } },
  { id: 'observatoire-ouvert', label: 'Rouvrir le savoir : deux Bibliothèques', cond: { kind: 'built', type: 'library', count: 2 },
    reveal: { kind: 'built', type: 'library', count: 1 } },
  { id: 'observatoire', label: 'Lever le regard : un Observatoire', cond: { kind: 'built', type: 'observatory', count: 1 },
    reveal: { kind: 'built', type: 'library', count: 2 } },
  { id: 'sanctuaire', label: 'Relever un cercle de pierres', cond: { kind: 'built', type: 'sanctuary', count: 1 },
    reveal: { kind: 'built', type: 'observatory', count: 1 } },
  { id: 'gardees', label: 'Deux lampes sous la garde des pierres', cond: { kind: 'boosted', type: 'library', count: 2 },
    reveal: { kind: 'built', type: 'sanctuary', count: 1 } },
  { id: 'phare-debloque', label: 'Le Phare du Lac devient disponible', cond: { kind: 'missives', count: 5 },
    reveal: { kind: 'built', type: 'sanctuary', count: 1 } },
  { id: 'phare-1', label: 'Phare : poser les fondations', cond: { kind: 'stage', type: 'lighthouse', count: 1 },
    reveal: { kind: 'missives', count: 5 } },
  { id: 'phare-2', label: 'Phare : élever la base de pierre', cond: { kind: 'stage', type: 'lighthouse', count: 2 },
    reveal: { kind: 'missives', count: 5 } },
  { id: 'phare-3', label: 'Phare : monter le fût', cond: { kind: 'stage', type: 'lighthouse', count: 3 },
    reveal: { kind: 'missives', count: 5 } },
  { id: 'phare-4', label: 'Phare : poser la galerie', cond: { kind: 'stage', type: 'lighthouse', count: 4 },
    reveal: { kind: 'missives', count: 5 } },
  { id: 'phare-5', label: 'Phare : allumer la lanterne', cond: { kind: 'stage', type: 'lighthouse', count: 5 },
    reveal: { kind: 'missives', count: 5 } },
  // Chapitre II : l'ordre est indicatif, chaque étape se coche dès qu'elle est remplie.
  { id: 'embarcadere', chapter: 2, label: 'Rouvrir un embarcadère', cond: { kind: 'built', type: 'embarcadere', count: 1 } },
  { id: 'reliques-5', chapter: 2, label: 'Remonter les premières Reliques', cond: { kind: 'earned', resource: 'relics', count: 5 } },
  { id: 'embarcadere-2', chapter: 2, label: 'Un second embarcadère', cond: { kind: 'built', type: 'embarcadere', count: 2 } },
  { id: 'brume', chapter: 2, label: 'Voir les îlots sortir de la brume', cond: { kind: 'revealed' }, reveal: { kind: 'revealed' } },
  { id: 'ilots', chapter: 2, label: 'Rallier les trois îlots', cond: { kind: 'islands', count: 3 }, reveal: { kind: 'revealed' } },
  { id: 'reliques-100', chapter: 2, label: 'Rendre les noms du registre', cond: { kind: 'earned', resource: 'relics', count: 100 },
    reveal: { kind: 'earned', resource: 'relics', count: 5 } },
  { id: 'reliques-360', chapter: 2, label: 'Sous la lueur : le dernier nom', cond: { kind: 'earned', resource: 'relics', count: 360 },
    reveal: { kind: 'earned', resource: 'relics', count: 100 } },
];

export const PATH_TEXTS = {
  done: 'accompli',
  now: 'En cours',
  next: 'Ensuite',
  later: 'Plus tard',
  hidden: 'D\'autres étapes restent à découvrir',
  complete: 'Tout est accompli. Le domaine peut se reposer.',
  previous: 'Chapitre I accompli : le Phare veille',
  all: 'Toutes les étapes',
  fewer: 'Réduire',
  summary: (done, total) => `${done} / ${total} étapes`,
};

// Conseils de premier contact : courts, refermables, jamais répétés (préférence `<clé>:conseils`).
//   when : 'place' (première pose), 'observatory', 'sanctuary', 'pause', 'visitor' (voir main.js).
export const TIPS = {
  place: {
    text: 'Chaque bâtiment produit seul, à son rythme. Posez-en d\'autres quand les Savoirs le permettent : rien ne presse.',
  },
  observatory: {
    text: 'L\'Observatoire transforme des Savoirs en Présages. Il en consomme à chaque cycle : gardez des Bibliothèques actives.',
  },
  pause: {
    text: 'Un bâtiment en pause attend des ressources. Rien n\'est perdu : il reprend seul dès qu\'elles reviennent.',
  },
  sanctuary: {
    text: 'Le Sanctuaire renforce les Bibliothèques voisines. Il ne produit rien lui-même : placez-le contre elles.',
  },
  visitor: {
    text: 'Un feu follet traverse le lac : touchez-le pour recevoir un petit cadeau. Il repartira de lui-même.',
  },
};

export const TIP_TEXTS = { duration: 16 }; // secondes avant que la bulle ne s'efface d'elle-même

// Aide d'un compteur (toucher ou survoler) : « à quoi elle sert » ; « produit par » et « consommé par »
// sont déduits de BALANCE (bâtiments visibles seulement).
export const RESOURCE_HELP = {
  knowledge: 'Sert à bâtir et à élever le Phare. Se rassemble tout seul.',
  omens: 'Sert au Sanctuaire, au Phare et, plus tard, aux barques du lac.',
  relics: 'Remontées du lac : elles rallient les îlots et complètent le registre.',
  texts: {
    exact: (n) => `Exactement : ${n}`,
    producers: 'Produit par',
    consumers: 'Consommé par',
    none: 'rien pour l\'instant',
  },
};

// Signal d'un outil nouvellement disponible (petit point ambre) et son libellé accessible.
export const NEW_TOOL = 'nouveau';
