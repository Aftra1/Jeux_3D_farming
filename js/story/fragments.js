// Fragments du Carnet : textes et paliers, à modifier librement.
// Un fragment se révèle soit quand le TOTAL CUMULÉ gagné de `resource` (et non le
// solde actuel) atteint `threshold`, soit quand la missive `missive` (missives.js)
// est accomplie. L'ordre du tableau = ordre dans le Carnet.
// Ne pas changer l'`id` d'un fragment publié : les sauvegardes le référencent
// (un id inconnu est simplement ignoré au chargement). Espaces insécables avant « : » et
// dans les guillemets, pour éviter les retours à la ligne orphelins.

export const FRAGMENTS = [
  {
    id: 'carnet-d-emprunts',
    missive: 'premiere-lampe',
    title: 'Le carnet d\'emprunts',
    text: 'Sous la poussière du comptoir, un carnet d\'emprunts. La dernière ligne date d\'un hiver '
      + 'dont personne ne se souvient. Le livre emprunté n\'a jamais été rendu, et son titre '
      + 'a été soigneusement découpé.',
  },
  {
    id: 'trois-fenetres',
    missive: 'trois-lampes',
    title: 'Trois fenêtres',
    text: 'Depuis l\'autre rive, trois fenêtres allumées dessinent un triangle sur l\'eau. Les anciens '
      + 'appelaient cela « ouvrir le lac ». Une écriture plus jeune a ajouté : '
      + '« Il faut qu\'il nous voie, lui aussi. »',
  },
  {
    id: 'carte-inversee',
    missive: 'regard-vers-le-ciel',
    title: 'La carte inversée',
    text: 'Dans la tour, une carte du ciel est clouée à l\'envers. Ce n\'est pas une erreur : les '
      + 'étoiles y sont tracées telles qu\'elles paraissent dans le lac, les nuits où l\'eau '
      + 'ne bouge plus.',
  },
  {
    id: 'note-sans-date',
    resource: 'omens',
    threshold: 5,
    title: 'Note sans date',
    text: 'Les premiers membres ne se sont pas installés ici par hasard. '
      + 'Ils parlaient d\'un lac qui « se souvient », et notaient chaque nuit ce que l\'eau '
      + 'leur montrait. Personne n\'a jamais dit ce qu\'ils espéraient y lire.',
  },
  {
    id: 'septieme-marque',
    missive: 'cercle-de-pierres',
    title: 'La septième marque',
    text: 'Six pierres pour six fondateurs, dit la tradition. Pourtant, au centre de la dalle, sous '
      + 'la braise, quelqu\'un a gravé une septième marque : un cercle tracé d\'un seul geste.',
  },
  {
    id: 'registre-des-absents',
    resource: 'omens',
    threshold: 25,
    title: 'Le registre des absents',
    text: 'Le manoir tenait un registre de ses membres. Certains noms y sont barrés avec soin, '
      + 'd\'autres simplement pâlis, comme si l\'encre s\'était retirée d\'elle-même. '
      + 'En marge, une même main a écrit : « Ils ne sont pas partis. »',
  },
  {
    id: 'ce-que-le-lac-rend',
    missive: 'lampes-gardees',
    title: 'Ce que le lac rend',
    text: 'Près des lampes gardées, on lit à voix basse les noms pâlis du registre, pour que le lac '
      + 'les entende. Certains matins, dit-on, la bibliothèque compte une page de plus, '
      + 'écrite d\'une encre encore humide.',
  },
  {
    id: 'lettre-au-gardien',
    resource: 'omens',
    threshold: 100,
    title: 'Lettre au gardien',
    text: '« Si tu lis ceci, les présages t\'ont jugé digne. Ne cherche pas la clé de la '
      + 'bibliothèque basse : c\'est elle qui te trouvera, quand le lac sera calme. » '
      + 'La lettre est signée d\'un simple cercle, tracé d\'un seul geste.',
  },
];

export const FRAGMENT_IDS = FRAGMENTS.map((f) => f.id);
