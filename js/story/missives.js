// Missives : objectifs guidés, un seul à la fois, dans l'ordre du tableau.
// Fichier de données à éditer librement. Chaque missive :
// - text : la demande complète (affichée dans le Carnet) ;
// - short : rappel d'une ligne dans l'interface de jeu ;
// - condition : évaluée sur l'état de la simulation (voir story/journal.js) :
//     { kind: 'built', type, count }   → au moins `count` bâtiments `type` posés ;
//     { kind: 'boosted', type, count } → au moins `count` bâtiments `type` renforcés
//                                        par une aura, en même temps ;
//     { kind: 'stage', type, count }   → bâtiment `type` élevé au palier `count` au moins ;
//     { kind: 'earned', resource, count } → au moins `count` de `resource` gagnés au total.
// `chapter: 2` : chapitre II, proposé seulement une fois la séquence de fin vue.
// Le fragment révélé par une missive porte `missive: <id>` dans fragments.js.
// La sauvegarde ne retient que le NOMBRE de missives accomplies : ne pas réordonner
// les missives déjà publiées (en ajouter à la fin ne pose aucun problème).

export const MISSIVES = [
  {
    id: 'premiere-lampe',
    text: 'Le gardien souhaite qu\'une première lampe se rallume au domaine.',
    short: 'Rallumer une première lampe',
    condition: { kind: 'built', type: 'library', count: 1 },
  },
  {
    id: 'trois-lampes',
    text: 'Le gardien souhaite que trois lampes veillent sur le domaine.',
    short: 'Trois lampes veillent',
    condition: { kind: 'built', type: 'library', count: 3 },
  },
  {
    id: 'regard-vers-le-ciel',
    text: 'La société aimerait qu\'un regard se lève de nouveau vers le ciel, au-dessus du lac.',
    short: 'Un regard vers le ciel',
    condition: { kind: 'built', type: 'observatory', count: 1 },
  },
  {
    id: 'cercle-de-pierres',
    text: 'On vous prie de relever un cercle de pierres, là où l\'on veillait autrefois.',
    short: 'Relever un cercle de pierres',
    condition: { kind: 'built', type: 'sanctuary', count: 1 },
  },
  {
    id: 'lampes-gardees',
    text: 'Il serait bon que deux lampes, au moins, brûlent ensemble sous la garde des pierres.',
    short: 'Deux lampes gardées',
    condition: { kind: 'boosted', type: 'library', count: 2 },
  },
  // Le Phare du Lac : une missive par palier.
  {
    id: 'fondations-du-phare',
    text: 'Sur la pointe, face au lac, la société vous prie de poser les fondations d\'un phare.',
    short: 'Poser les fondations du phare',
    condition: { kind: 'stage', type: 'lighthouse', count: 1 },
  },
  {
    id: 'base-de-pierre',
    text: 'Que la base du phare s\'élève, pierre sur pierre, comme on l\'avait dessinée jadis.',
    short: 'Élever la base de pierre',
    condition: { kind: 'stage', type: 'lighthouse', count: 2 },
  },
  {
    id: 'fut-du-phare',
    text: 'Le fût doit monter assez haut pour qu\'on le voie depuis l\'autre rive.',
    short: 'Monter le fût du phare',
    condition: { kind: 'stage', type: 'lighthouse', count: 3 },
  },
  {
    id: 'galerie-du-phare',
    text: 'Il faudra une galerie, pour qu\'un veilleur puisse faire le tour de la lumière.',
    short: 'Poser la galerie',
    condition: { kind: 'stage', type: 'lighthouse', count: 4 },
  },
  {
    id: 'lanterne-du-phare',
    text: 'Il ne manque que la lanterne. Le gardien attend qu\'elle s\'allume.',
    short: 'Allumer la lanterne',
    condition: { kind: 'stage', type: 'lighthouse', count: 5 },
  },
  // Chapitre II : l'Embarcadère et les Reliques (après la dernière lettre).
  {
    id: 'rouvrir-l-embarcadere',
    chapter: 2,
    text: 'Une lettre sans cachet, glissée sous la porte : « Le vieil embarcadère peut encore servir. '
      + 'Rouvrez-le au bord de l\'eau, là où la lueur répond. »',
    short: 'Rouvrir un embarcadère',
    condition: { kind: 'built', type: 'embarcadere', count: 1 },
  },
  {
    id: 'premieres-reliques',
    chapter: 2,
    text: 'Les barques reviennent parfois chargées de choses qu\'on croyait perdues. La société aimerait '
      + 'que les premières soient remontées et rangées au sec.',
    short: 'Remonter des Reliques',
    condition: { kind: 'earned', resource: 'relics', count: 5 },
  },
  {
    id: 'second-embarcadere',
    chapter: 2,
    text: 'Une seule barque ne suffit plus : la lueur s\'est déplacée le long de la rive. Il faudrait '
      + 'un second embarcadère pour la suivre.',
    short: 'Un second embarcadère',
    condition: { kind: 'built', type: 'embarcadere', count: 2 },
  },
  {
    id: 'noms-du-registre',
    chapter: 2,
    text: 'Chaque relique porte un nom du registre. On vous prie d\'en remonter assez pour que la liste '
      + 'soit presque complète.',
    short: 'Rendre les noms du registre',
    condition: { kind: 'earned', resource: 'relics', count: 100 },
  },
  {
    id: 'la-lueur-au-fond',
    chapter: 2,
    text: 'Il ne manque qu\'un nom, et il repose tout au fond, sous la lueur. Remontez les dernières reliques.',
    short: 'Sous la lueur',
    condition: { kind: 'earned', resource: 'relics', count: 360 },
  },
];
