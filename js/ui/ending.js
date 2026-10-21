// Séquence de fin, côté interface (DOM seul) : bouton « Passer », dernière lettre,
// générique et résumé de la partie. Textes : story/ending.js.
// Émet onNext (lettre → générique), onStay (« Continuer à veiller ») et onSkip.
// La lettre peut aussi être relue depuis le Carnet (`reread`) : simple panneau à refermer.

import { ENDING } from '../story/ending.js';

export class EndingScreen {
  constructor({ onSkip, onStay }) {
    this.root = document.getElementById('ending');
    this.skipButton = document.getElementById('ending-skip');
    this.letter = document.getElementById('ending-letter');
    this.final = document.getElementById('ending-final');
    this.nextButton = document.getElementById('ending-next');
    this.rereading = false;

    const { letter, credits, summary } = ENDING;
    document.getElementById('ending-letter-title').textContent = letter.title;
    document.getElementById('ending-letter-body').replaceChildren(...letter.paragraphs.map((text) => {
      const p = document.createElement('p');
      p.textContent = text;
      return p;
    }));
    document.getElementById('ending-letter-signature').textContent = letter.signature;
    document.getElementById('credits-title').textContent = credits.title;
    document.getElementById('credits-lines').replaceChildren(...credits.lines.map((text) => {
      const p = document.createElement('p');
      p.textContent = text;
      return p;
    }));
    document.getElementById('summary-title').textContent = summary.title;
    this.skipButton.textContent = ENDING.skip;
    const stay = document.getElementById('ending-stay');
    stay.textContent = ENDING.stay;

    this.skipButton.addEventListener('click', () => onSkip());
    stay.addEventListener('click', () => onStay());
    this.nextButton.addEventListener('click', () => {
      if (this.rereading) this.hide();
      else this.#showFinal();
    });
  }

  get active() {
    return !this.root.hidden;
  }

  // Début de la séquence : seul « Passer » est visible, la scène joue derrière.
  start(stats) {
    this.stats = stats;
    this.rereading = false;
    this.root.hidden = false;
    this.root.classList.remove('reread', 'veiled');
    this.skipButton.hidden = false;
    this.letter.hidden = true;
    this.final.hidden = true;
  }

  // Dernière lettre (après le balayage du faisceau), ou relecture depuis le Carnet.
  showLetter({ reread = false } = {}) {
    if (reread) {
      this.rereading = true;
      this.root.hidden = false;
      this.root.classList.add('reread');
      this.skipButton.hidden = true;
      this.final.hidden = true;
    } else {
      this.root.classList.add('veiled');
    }
    this.nextButton.textContent = reread ? ENDING.close : ENDING.letter.next;
    this.letter.hidden = false;
    this.nextButton.focus({ preventScroll: true });
  }

  #showFinal() {
    this.letter.hidden = true;
    this.skipButton.hidden = true;
    const rows = ENDING.summary.rows(this.stats).flatMap(([label, value]) => {
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.textContent = value;
      return [dt, dd];
    });
    document.getElementById('summary-rows').replaceChildren(...rows);
    this.final.hidden = false;
    document.getElementById('ending-stay').focus({ preventScroll: true });
  }

  hide() {
    this.root.hidden = true;
    this.rereading = false;
    this.root.classList.remove('reread', 'veiled');
  }
}
