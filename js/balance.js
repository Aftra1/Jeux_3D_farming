// Équilibrage du jeu : TOUTES les valeurs de gameplay sont ici.
// Modifier ce fichier suffit pour ajuster le rythme (aucune autre valeur
// de production, de coût ou de durée ne doit être codée ailleurs).

export const BALANCE = {
  // Pas de temps fixe de la simulation (ticks par seconde).
  ticksPerSecond: 10,

  // Retard maximal rattrapé d'un coup (onglet en arrière-plan, saccade) : au-delà,
  // le temps est simplement ignoré.
  maxCatchUpSeconds: 1,

  // Progression hors ligne (rechargement ou onglet masqué).
  offline: {
    maxSeconds: 2 * 60 * 60, // absence prise en compte au maximum (2 h)
    efficiency: 1,           // rendement hors ligne des productions (1 = 100 %)
    // Absence minimale pour AFFICHER le panneau (le gain est toujours crédité) :
    // évite un message après un simple changement d'onglet de quelques secondes.
    noticeMinSeconds: 30,
  },

  // Visiteurs du lac (étape 17) : feu follet qui flotte au-dessus du domaine, à attraper
  // d'un clic ou d'un tap. Le manquer ne coûte rien. Seulement en jeu actif (ni titre ni hors ligne).
  visitors: {
    intervalSeconds: { min: 120, max: 240 }, // délai aléatoire entre deux apparitions (jeu actif)
    lifetimeSeconds: 20,                      // durée de présence avant de s'effacer
    gift: {
      // Savoirs offerts = 20 s de production actuelle de Savoirs (30 s faisait gagner 14 % sur la
      // partie au profil « équilibré + visiteurs » de tools/playtest.mjs ; 20 s : ≈ 9 %, limite 10 %).
      seconds: 20,
      minKnowledge: 5,    // plancher (début de partie, aucune Bibliothèque)
      omensChance: 0.15,  // plus rarement : des Présages (dès qu'on en a déjà obtenu)
      omens: { min: 3, max: 6 },
    },
  },

  // Valeurs de départ des ressources (noms et icônes : js/resources.js).
  resources: {
    knowledge: { start: 0 },
    omens: { start: 0 },
    relics: { start: 0 },  // chapitre II : remontées du lac par les Embarcadères
  },

  // Règles par type de bâtiment (présentation et modèle : js/buildings/catalog.js).
  //   cost        ressources payées à la pose
  //   firstFree   le tout premier exemplaire est gratuit
  //   unlock      conditions de déblocage : { buildings: { type: nombre requis } }
  //   footprint   emprise en cases (sert à la pose et au voisinage des auras)
  //   aura        effet passif sur les voisins : les bâtiments de type `targets`
  //               ayant au moins une case à `radius` cases ou moins de l'emprise
  //               reçoivent `bonus` en plus à chaque cycle. Plusieurs auras sur un
  //               même bâtiment ne se cumulent pas (on garde le plus fort bonus).
  //   costGrowth  coût du n-ième exemplaire payé = cost × costGrowth^(n − 1) (arrondi) :
  //               chaque exemplaire coûte un peu plus que le précédent
  //   unique      un seul exemplaire par partie
  //   reserveRoom tant qu'il n'est pas posé, toute autre pose doit laisser au moins
  //               une place libre de son emprise (refus « room »)
  //   stages      grand chantier en paliers : stages[0].cost = coût de la pose (palier 1),
  //               stages[n].cost = coût pour « Élever » au palier n + 1. Remplace `cost`.
  //   stageBoost  à chaque palier atteint, +`percent` % sur toutes les sorties des
  //               bâtiments de type `targets` (aura comprise), partout sur le domaine.
  //   unlock.missives  nombre de missives accomplies requis (story/missives.js)
  //   unlock.finished  la séquence de fin a été vue (mode libre, chapitre II)
  //   edge        pose seulement sur une case du bord du terrain, au contact de l'eau (refus « edge »)
  //   production  cycle : toutes les `intervalSeconds`, consomme `inputs` et donne
  //               `outputs`. Si les entrées manquent en fin de cycle, le bâtiment
  //               se met en pause (rien n'est consommé) et reprend dès que possible.
  buildings: {
    library: {
      footprint: { w: 2, d: 2 },
      cost: { knowledge: 10 },
      costGrowth: 1.2,
      firstFree: true,
      production: {
        intervalSeconds: 2,
        inputs: {},
        outputs: { knowledge: 1 },
      },
    },
    observatory: {
      footprint: { w: 1, d: 1 },
      cost: { knowledge: 450 },
      costGrowth: 1.2,
      unlock: { buildings: { library: 2 } },
      production: {
        intervalSeconds: 4,
        inputs: { knowledge: 2 },
        outputs: { omens: 1 },
      },
    },
    sanctuary: {
      footprint: { w: 1, d: 1 },
      cost: { knowledge: 950, omens: 85 },
      costGrowth: 1.5,
      unlock: { buildings: { observatory: 1 } },
      aura: { radius: 1, targets: ['library'], bonus: { knowledge: 1 } },
    },
    lighthouse: {
      footprint: { w: 2, d: 2 },
      unique: true,
      reserveRoom: true, // tant qu'il n'est pas posé, toute pose doit lui laisser une place libre
      unlock: { missives: 5 },
      // Fondations, base de pierre, fût, galerie, lanterne (étape 16 : calés avec
      // tools/playtest.mjs pour un Phare achevé en ≈ 55 min de jeu actif, profil équilibré).
      stages: [
        { cost: { knowledge: 1200, omens: 200 } },
        { cost: { knowledge: 2500, omens: 400 } },
        { cost: { knowledge: 4500, omens: 700 } },
        { cost: { knowledge: 7500, omens: 1100 } },
        { cost: { knowledge: 11500, omens: 1700 } },
      ],
      stageBoost: { targets: ['library'], percent: 10 },
    },
    // Chapitre II (après la fin) : une barque part sur le lac et revient avec une Relique.
    embarcadere: {
      footprint: { w: 1, d: 1 },
      cost: { knowledge: 6000, omens: 600 },
      costGrowth: 1.5,
      edge: true,
      unlock: { finished: true },
      production: {
        intervalSeconds: 12,
        inputs: { omens: 3 },
        outputs: { relics: 1 },
      },
    },
  },
};
