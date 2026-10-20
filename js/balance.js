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

  // Valeurs de départ des ressources (noms et icônes : js/resources.js).
  resources: {
    knowledge: { start: 0 },
    omens: { start: 0 },
  },

  // Règles par type de bâtiment (présentation et modèle : js/buildings/catalog.js).
  //   cost        ressources payées à la pose
  //   firstFree   le tout premier exemplaire est gratuit
  //   unlock      conditions de déblocage : { buildings: { type: nombre requis } }
  //   production  cycle : toutes les `intervalSeconds`, consomme `inputs` et donne
  //               `outputs`. Si les entrées manquent en fin de cycle, le bâtiment
  //               se met en pause (rien n'est consommé) et reprend dès que possible.
  buildings: {
    library: {
      cost: { knowledge: 10 },
      firstFree: true,
      production: {
        intervalSeconds: 2,
        inputs: {},
        outputs: { knowledge: 1 },
      },
    },
    observatory: {
      cost: { knowledge: 30 },
      unlock: { buildings: { library: 2 } },
      production: {
        intervalSeconds: 4,
        inputs: { knowledge: 2 },
        outputs: { omens: 1 },
      },
    },
  },
};
