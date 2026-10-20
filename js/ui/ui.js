// Interface HTML par-dessus le canvas : compteur de Savoirs, barre d'outils
// parchemin, bulle d'aide, panneau de retour et confirmation de nouvelle partie.
// Le module ne connaît ni la 3D ni la simulation : il émet des intentions
// (onSelect, onCancel, onReset) et affiche l'état qu'on lui donne.

const RESOURCE_NAMES = { knowledge: 'Savoirs' };

function formatCost(cost) {
  const parts = Object.entries(cost || {}).map(([res, n]) => `${n} ${RESOURCE_NAMES[res] || res}`);
  return parts.length ? parts.join(', ') : 'Gratuite';
}

const REFUSALS = {
  occupied: () => 'Cet emplacement est déjà occupé.',
  bounds: () => 'Le bâtiment dépasse du terrain.',
  cost: (check) => `Pas encore assez de Savoirs : il en faut ${check.cost.knowledge ?? 0}.`,
};

export class UI {
  constructor({ onSelect, onCancel, onReset }) {
    this.hint = document.getElementById('hint');
    this.cancelButton = document.getElementById('cancel');
    this.tools = [...document.querySelectorAll('.tool[data-building]')];
    this.counterValue = document.querySelector('#counter-knowledge .value');
    this.shownKnowledge = null;

    for (const tool of this.tools) {
      tool.addEventListener('click', () => {
        if (tool.getAttribute('aria-pressed') === 'true') onCancel();
        else onSelect(tool.dataset.building);
      });
    }
    this.cancelButton.addEventListener('click', () => onCancel());
    // Relance l'animation « bump » à chaque gain
    this.counterValue.addEventListener('animationend', () => this.counterValue.classList.remove('bump'));

    // Panneau « pendant votre absence »
    this.offlinePanel = document.getElementById('offline-notice');
    this.offlineText = document.getElementById('offline-text');
    this.offlineTotal = 0;
    document.getElementById('offline-close').addEventListener('click', () => this.hideOfflineGain());

    // Confirmation de nouvelle partie
    this.resetBackdrop = document.getElementById('reset-backdrop');
    this.resetKeep = document.getElementById('reset-keep');
    document.getElementById('new-game').addEventListener('click', () => this.#openReset());
    this.resetKeep.addEventListener('click', () => this.#closeReset());
    document.getElementById('reset-go').addEventListener('click', () => {
      this.#closeReset();
      onReset();
    });
    this.resetBackdrop.addEventListener('click', (e) => {
      if (e.target === this.resetBackdrop) this.#closeReset();
    });
  }

  get dialogOpen() {
    return !this.resetBackdrop.hidden || !this.offlinePanel.hidden;
  }

  // Ferme le dialogue au premier plan (Échap). Renvoie true si un dialogue a été fermé.
  closeTopDialog() {
    if (!this.resetBackdrop.hidden) {
      this.#closeReset();
      return true;
    }
    if (!this.offlinePanel.hidden) {
      this.hideOfflineGain();
      return true;
    }
    return false;
  }

  // Cumule si le panneau est déjà ouvert (plusieurs retours avant fermeture).
  showOfflineGain(amount, libraries) {
    this.offlineTotal += amount;
    const n = this.offlineTotal;
    const who = libraries > 1 ? 'vos Bibliothèques ont' : 'votre Bibliothèque a';
    this.offlineText.textContent =
      `Pendant votre absence, ${who} rassemblé ${n} ${n > 1 ? 'Savoirs' : 'Savoir'}.`;
    this.offlinePanel.hidden = false;
  }

  hideOfflineGain() {
    this.offlinePanel.hidden = true;
    this.offlineTotal = 0;
  }

  #openReset() {
    this.resetBackdrop.hidden = false;
    this.resetKeep.focus(); // choix sûr par défaut
  }

  #closeReset() {
    this.resetBackdrop.hidden = true;
  }

  // state = {
  //   resources: { knowledge },
  //   offers: { [type]: { cost, affordable } },
  //   placing: type | null, name, check, pointerType
  // }
  render({ resources, offers, placing, name, check, pointerType }) {
    this.#renderCounter(resources.knowledge);

    for (const tool of this.tools) {
      const type = tool.dataset.building;
      const offer = offers[type];
      tool.setAttribute('aria-pressed', String(type === placing));
      tool.classList.toggle('unaffordable', !offer.affordable);
      tool.setAttribute('aria-disabled', String(!offer.affordable));
      tool.querySelector('[data-cost]').textContent = formatCost(offer.cost);
    }
    this.cancelButton.hidden = !placing;

    if (!placing) {
      this.hint.hidden = true;
      return;
    }
    const touch = pointerType === 'touch' || pointerType === 'pen';
    const howTo = touch
      ? 'Touchez une case pour poser · glissez pour viser\n2 doigts pour déplacer la vue'
      : 'Clic : poser · clic droit ou Échap : annuler';
    const refusal = check && !check.ok && REFUSALS[check.reason]
      ? REFUSALS[check.reason](check) : null;
    const cost = formatCost(offers[placing].cost);
    this.hint.textContent = `${name} — ${cost}\n${refusal || howTo}`;
    this.hint.hidden = false;
  }

  #renderCounter(value) {
    const shown = Math.floor(value);
    if (shown === this.shownKnowledge) return;
    const gained = this.shownKnowledge !== null && shown > this.shownKnowledge;
    this.shownKnowledge = shown;
    this.counterValue.textContent = String(shown);
    if (gained) {
      this.counterValue.classList.remove('bump');
      void this.counterValue.offsetWidth; // redémarre l'animation CSS
      this.counterValue.classList.add('bump');
    }
  }
}
