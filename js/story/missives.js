// Missives : objectifs guidés, un seul à la fois, dans l'ordre du tableau.
// Fichier de données à éditer librement. Chaque missive :
// - text : la demande complète (affichée dans le Carnet) ;
// - short : rappel d'une ligne dans l'interface de jeu ;
// - condition : évaluée sur l'état de la simulation (voir story/journal.js) :
//     { kind: 'built', type, count }   → au moins `count` bâtiments `type` posés ;
//     { kind: 'boosted', type, count } → au moins `count` bâtiments `type` renforcés
//                                        par une aura, en même temps ;
//     { kind: 'stage', type, count }   → bâtiment `type` élevé au palier `count` au moins.
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
];
