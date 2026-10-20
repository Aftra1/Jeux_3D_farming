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
    efficiency: 1,           // rendement hors ligne (1 = 100 %)
    // Absence minimale pour AFFICHER le panneau (le gain est toujours crédité) :
    // évite un message après un simple changement d'onglet de quelques secondes.
    noticeMinSeconds: 30,
  },

  resources: {
    knowledge: { name: 'Savoirs', start: 0 },
  },

  buildings: {
    library: {
      cost: { knowledge: 10 },
      firstFree: true, // la toute première Bibliothèque ne coûte rien
      production: {
        resource: 'knowledge',
        amount: 1,
        intervalSeconds: 2,
      },
    },
  },
};
