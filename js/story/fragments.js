// Fragments du Carnet : textes et paliers, à modifier librement.
// Un fragment se révèle soit quand le joueur a attrapé `visitors` Visiteurs du lac,
// soit quand le TOTAL CUMULÉ gagné de `resource` (et non le
// solde actuel) atteint `threshold`, soit quand la missive `missive` (missives.js)
// est accomplie. L'ordre du tableau = ordre dans le Carnet.
// Ne pas changer l'`id` d'un fragment publié : les sauvegardes le référencent
// (un id inconnu est simplement ignoré au chargement). Espaces insécables avant « : » et
// dans les guillemets, pour éviter les retours à la ligne orphelins.
// `hidden: true` : absent du Carnet (même en encre effacée) tant qu'il n'est pas révélé.
// `chapter: 2` : section « Chapitre II » du Carnet, visible une fois la séquence de fin vue.

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
  {
    id: 'visiteurs-du-lac',
    visitors: 10,
    hidden: true,
    title: 'Les visiteurs du lac',
    text: 'Les lueurs qui flottent au-dessus du domaine ne viennent pas des marais. Le registre les nomme '
      + '« visiteurs » et tient leur compte, nuit après nuit. On ne les attrape pas : on les salue, '
      + 'et ils laissent un présent pour la peine. Dix saluts, note une main ancienne, et ils vous '
      + 'reconnaissent.',
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
  // Chapitre II : qui tient la lueur au fond du lac. Les Reliques en sont les indices.
  {
    id: 'lignes-du-poteau',
    chapter: 2,
    missive: 'rouvrir-l-embarcadere',
    title: 'Les lignes du poteau',
    text: 'Les planches tiennent encore. Sur le dernier poteau, quelqu\'un a gravé une ligne par nuit de '
      + 'veille : des centaines de lignes. Les plus récentes sont fraîches, et personne, au domaine, ne '
      + 'possède de couteau.',
  },
  {
    id: 'cle-de-bronze',
    chapter: 2,
    missive: 'premieres-reliques',
    title: 'Une clé de bronze',
    text: 'La première relique est une clé de bronze, froide comme si elle sortait d\'un long hiver. '
      + 'Elle ouvre le tiroir du comptoir, dans la bibliothèque basse. Dedans : le titre découpé du '
      + 'carnet d\'emprunts. « Instructions pour le gardien qui viendra après moi. »',
  },
  {
    id: 'ronde-sous-l-eau',
    chapter: 2,
    missive: 'second-embarcadere',
    title: 'La ronde sous l\'eau',
    text: 'Depuis le second ponton, on comprend que la lueur du fond ne reste pas immobile. Elle va '
      + 'd\'une barque à l\'autre, lentement, comme quelqu\'un qui fait sa ronde, une lanterne à la main.',
  },
  {
    id: 'nom-qui-revient',
    chapter: 2,
    missive: 'noms-du-registre',
    title: 'Le nom qui revient',
    text: 'Chaque relique porte un nom, et tous figurent au registre. Un seul revient sans cesse : '
      + 'sur une broche, une tasse, une boucle de ceinture. C\'est celui du premier gardien du phare, '
      + 'parti un soir faire sa ronde sur le lac, et dont la barque est revenue vide.',
  },
  // Îlots du lac (étape 22) : un fragment par îlot rallié, absent du Carnet jusque-là.
  {
    id: 'cabane-des-aulnes',
    chapter: 2,
    island: 'aulnes',
    hidden: true,
    title: 'La cabane des aulnes',
    text: 'Sous les aulnes, une cabane de rondins que la mousse a presque avalée. Une couchette, un réchaud, '
      + 'et sur la table une carte du lac où chaque îlot porte une date. Le premier gardien venait y dormir '
      + 'les nuits de grand vent, pour ne pas quitter l\'eau des yeux.',
  },
  {
    id: 'chapelle-sans-toit',
    chapter: 2,
    island: 'ruines',
    hidden: true,
    title: 'La chapelle sans toit',
    text: 'Les murs bas de la chapelle sont couverts de noms, gravés de la même main. Ce sont ceux du '
      + 'registre, recopiés un à un. Sous le dernier, une phrase plus récente : « Je ne les laisserai pas '
      + 'attendre seuls dans le noir. »',
  },
  {
    id: 'barque-dans-les-roseaux',
    chapter: 2,
    island: 'roseaux',
    hidden: true,
    title: 'La barque dans les roseaux',
    text: 'Entre les roseaux, une barque retournée, la coque peinte du même bleu que celle du ponton. '
      + 'Dessous, au sec, une lanterne de rechange et un mot : « Pour la relève. Elle saura quoi en faire. »',
  },
  {
    id: 'la-releve',
    chapter: 2,
    missive: 'la-lueur-au-fond',
    title: 'La relève',
    text: 'La dernière relique est une lanterne, encore tiède. Le premier gardien ne s\'est pas perdu : '
      + 'il a choisi de veiller de l\'autre côté du reflet, pour ceux qui cherchaient la rive. Cette nuit, '
      + 'sa lueur s\'est approchée du ponton, puis s\'est éteinte doucement, comme on pose une lampe '
      + 'quand la relève est arrivée. La relève, c\'est vous.',
    finale: true,
  },
];

export const FRAGMENT_IDS = FRAGMENTS.map((f) => f.id);
