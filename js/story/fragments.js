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
  // Le Phare du Lac : un fragment par palier, jusqu'à la révélation (provisoire).
  {
    id: 'pierre-d-angle',
    missive: 'fondations-du-phare',
    title: 'La pierre d\'angle',
    text: 'En creusant, on trouve une pierre d\'angle déjà posée, à la bonne place, tournée vers le lac. '
      + 'Elle porte le cercle tracé d\'un seul geste et une date effacée. Ce phare n\'est pas un projet : '
      + 'c\'est une promesse qu\'on reprend.',
  },
  {
    id: 'plans-du-phare',
    missive: 'base-de-pierre',
    title: 'Les plans du phare',
    text: 'Les plans dormaient dans la bibliothèque basse. Aucun port n\'y figure, aucune barque, aucun '
      + 'chenal. Le faisceau n\'est pas dessiné vers le large : il plonge, en pointillés, droit dans le lac.',
  },
  {
    id: 'marche-de-trop',
    missive: 'fut-du-phare',
    title: 'Une marche de trop',
    text: 'Les maçons racontent qu\'au crépuscule, l\'écho du fût ne renvoie pas leurs voix mais d\'autres, '
      + 'plus lentes, qui comptent les marches. Elles en comptent toujours une de plus qu\'il n\'y en a.',
  },
  {
    id: 'second-domaine',
    missive: 'galerie-du-phare',
    title: 'Le second domaine',
    text: 'Depuis la galerie, on voit enfin le lac en entier. Les nuits sans vent, il reflète un second '
      + 'domaine, exact en tout point, sauf un : là-bas, toutes les fenêtres sont déjà allumées.',
  },
  {
    id: 'lumiere-promise',
    missive: 'lanterne-du-phare',
    title: 'La lumière promise',
    text: 'La société n\'a jamais surveillé le lac : elle lui tient compagnie. Les noms pâlis du registre '
      + 'attendent de l\'autre côté du reflet, et ce phare est la lumière qu\'on leur avait promise pour '
      + 'retrouver la rive. Ce soir, quand la lanterne s\'est allumée, une seconde lueur lui a répondu, '
      + 'tout au fond de l\'eau. Personne ne sait encore qui la tient.',
    finale: true, // révélation finale : phrase musicale plus longue
  },
];

export const FRAGMENT_IDS = FRAGMENTS.map((f) => f.id);
