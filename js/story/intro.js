// Écran titre et lettre d'introduction : textes seuls (fichier de données à éditer).
// La lettre prépare la première missive (« Rallumer une première lampe », missives.js).

export const TITLE = {
  name: 'La Société du Lac',
  subtitle: 'Certaines lampes ne s\'éteignent jamais tout à fait.',
  continue: 'Continuer',
  newGame: 'Nouvelle partie',
  options: 'Options',
  // Résumé discret sous « Continuer » : chapitre et objectif, temps de jeu, dernière sauvegarde.
  // info = describeSave(...) + { time, ago } (texte déjà formaté).
  summary: (info) => [
    `${info.chapter} · ${info.objective}`,
    `${info.time} de jeu · ${info.buildings > 1 ? `${info.buildings} bâtiments` : info.buildings === 1 ? '1 bâtiment' : 'domaine encore vide'}`,
    `Dernière sauvegarde : ${info.ago}`,
  ].join('\n'),
};

export const LETTER = {
  title: 'À vous qui lisez ces lignes',
  paragraphs: [
    'La Société du Lac vous confie désormais son domaine ; vous en êtes le nouveau gardien.',
    'Les lampes se sont éteintes une à une, et les livres attendent qu\'on les rouvre.',
    'Rien ne presse : le lac a appris la patience, et nous aussi.',
    'L\'ancien gardien vous écrira de loin, par missives, pour vous guider.',
    'Votre but : élever le Phare du Lac, palier après palier, jusqu\'à ce que sa lanterne veille de nouveau sur l\'eau.',
    'Sa première demande est simple : qu\'une lampe se rallume au bord de l\'eau.',
  ],
  signature: '— La Société',
  accept: 'Prendre la charge',
};
