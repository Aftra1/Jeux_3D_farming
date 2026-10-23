// Écran titre et lettre d'introduction (DOM seul, aucun Three.js).
// Émet onContinue / onNewGame / onOptions / onAccept ; `leave(onSwitch)` joue le fondu :
// le menu s'efface sous un voile ardoise, onSwitch() bascule la scène en jeu, puis le voile se lève.

import { TITLE, LETTER } from '../story/intro.js';
import { ENDING } from '../story/ending.js';
import { ICONS } from './icons.js';

const FADE_IN_MS = 600;   // menu → voile (doit suivre .title-screen.leaving dans style.css)
const FADE_OUT_MS = 900;  // voile → jeu (.title-screen.revealing)

export class TitleScreen {
  constructor({ onContinue, onNewGame, onOptions, onAccept }) {
    this.root = document.getElementById('title-screen');
    this.menu = document.getElementById('title-menu');
    this.letter = document.getElementById('intro-letter');
    this.continueButton = document.getElementById('title-continue');

    document.getElementById('title-name').textContent = TITLE.name;
    document.getElementById('title-subtitle').textContent = TITLE.subtitle;
    document.getElementById('title-continue-label').textContent = TITLE.continue;
    document.getElementById('title-new').textContent = TITLE.newGame;
    document.getElementById('title-options').textContent = TITLE.options;

    document.getElementById('letter-title').textContent = LETTER.title;
    document.getElementById('letter-body').replaceChildren(...LETTER.paragraphs.map((text) => {
      const p = document.createElement('p');
      p.textContent = text;
      return p;
    }));
    document.getElementById('letter-signature').textContent = LETTER.signature;
    const accept = document.getElementById('letter-accept');
    accept.textContent = LETTER.accept;

    this.continueButton.addEventListener('click', () => this.#once(onContinue));
    document.getElementById('title-new').addEventListener('click', () => onNewGame());
    document.getElementById('title-options').addEventListener('click', () => onOptions());
    accept.addEventListener('click', () => this.#once(onAccept));
    this.busy = false;
  }

  get active() {
    return !this.root.hidden;
  }

  // summary = { chapter, objective, time, buildings, ago, finished } si une sauvegarde existe, sinon null.
  // Partie terminée : petite lanterne allumée à côté de « Continuer ».
  showMenu(summary) {
    document.body.classList.add('title-mode');
    this.root.hidden = false;
    this.continueButton.hidden = !summary;
    if (summary) document.getElementById('title-summary').textContent = TITLE.summary(summary);
    const mark = document.getElementById('title-mark');
    mark.hidden = !summary?.finished;
    if (summary?.finished) {
      mark.innerHTML = ICONS.lantern;
      mark.setAttribute('aria-label', ENDING.titleMark);
      mark.title = ENDING.titleMark;
    }
    (summary ? this.continueButton : document.getElementById('title-new')).focus({ preventScroll: true });
  }

  showLetter() {
    document.body.classList.add('title-mode');
    this.root.hidden = false;
    this.menu.hidden = true;
    this.letter.hidden = false;
    document.getElementById('letter-accept').focus({ preventScroll: true });
  }

  // Fondu vers le jeu ; onSwitch() est appelé quand le voile couvre la scène.
  leave(onSwitch, onDone) {
    this.root.classList.add('leaving');
    setTimeout(() => {
      onSwitch();
      document.body.classList.remove('title-mode'); // l'interface de jeu apparaît en fondu
      this.root.classList.add('revealing');
      setTimeout(() => {
        this.root.hidden = true;
        this.root.classList.remove('leaving', 'revealing');
        onDone?.();
      }, FADE_OUT_MS);
    }, FADE_IN_MS);
  }

  // Un seul départ, même si le joueur clique deux fois pendant le fondu.
  #once(fn) {
    if (this.busy) return;
    this.busy = true;
    fn();
  }
}
