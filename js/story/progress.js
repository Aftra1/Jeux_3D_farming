// Fil de la partie : durée de jeu active et drapeau de fin (sans DOM ni Three.js).
// La durée ne compte que le jeu actif (boucle en jeu) : ni l'écran titre, ni l'absence.

export class Progress {
  constructor() {
    this.reset();
  }

  reset() {
    this.playSeconds = 0;
    this.finished = false; // séquence de fin vue (ou passée) : mode libre
  }

  // dt réel d'une image, borné (un onglet resté figé ne compte pas des heures).
  tick(dt) {
    if (dt > 0) this.playSeconds += Math.min(dt, 1);
  }

  toJSON() {
    return { playSeconds: this.playSeconds, finished: this.finished };
  }

  // Restaure un état déjà validé (voir save/save.js).
  load({ playSeconds, finished }) {
    this.playSeconds = playSeconds;
    this.finished = finished;
  }
}
