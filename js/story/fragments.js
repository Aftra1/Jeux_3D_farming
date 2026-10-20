// Fragments du Carnet : textes et paliers, à modifier librement.
// Un fragment se révèle quand le TOTAL CUMULÉ gagné de `resource` (et non le
// solde actuel) atteint `threshold`. L'ordre du tableau = ordre dans le Carnet.
// Ne pas changer l'`id` d'un fragment publié : les sauvegardes le référencent
// (un id inconnu est simplement ignoré au chargement). Espaces insécables avant « : » et
// dans les guillemets, pour éviter les retours à la ligne orphelins.

export const FRAGMENTS = [
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
    id: 'registre-des-absents',
    resource: 'omens',
    threshold: 25,
    title: 'Le registre des absents',
    text: 'Le manoir tenait un registre de ses membres. Certains noms y sont barrés avec soin, '
      + 'd\'autres simplement pâlis, comme si l\'encre s\'était retirée d\'elle-même. '
      + 'En marge, une même main a écrit : « Ils ne sont pas partis. »',
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
