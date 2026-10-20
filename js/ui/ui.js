// Interface HTML par-dessus le canvas : compteurs de ressources, barre d'outils
// parchemin, bulle d'aide, panneau de retour et confirmation de nouvelle partie.
// Compteurs et outils sont générés depuis les registres (resources.js, catalog.js).
// Le module ne connaît ni la 3D ni la simulation : il émet des intentions
// (onSelect, onCancel, onReset) et affiche l'état qu'on lui donne.

import { RESOURCE_TYPES, RESOURCE_IDS, resourceLabel } from '../resources.js';
import { BUILDING_TYPES, BUILDING_ORDER } from '../buildings/catalog.js';
import { ICONS } from './icons.js';

const amount = (res, n) => `${Math.floor(n)} ${resourceLabel(res, n)}`;

function formatCost(cost) {
  const parts = Object.entries(cost || {}).map(([res, n]) => amount(res, n));
  return parts.length ? parts.join(', ') : 'Gratuit';
}

function formatLock(missing) {
  return 'Requiert ' + missing
    .map((m) => {
      const def = BUILDING_TYPES[m.type];
      return `${m.required} ${m.required > 1 ? def.plural : def.name}`;
    })
    .join(' et ');
}

function joinFr(parts) {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} et ${parts[parts.length - 1]}`;
}

const REFUSALS = {
  occupied: () => 'Cet emplacement est déjà occupé.',
  bounds: () => 'Le bâtiment dépasse du terrain.',
  locked: (check) => `${formatLock(check.missing)}.`,
  cost: (check, resources) => {
    const [res, n] = Object.entries(check.cost).find(([r, c]) => (resources[r] ?? 0) < c)
      || Object.entries(check.cost)[0];
    return `Pas encore assez de ${RESOURCE_TYPES[res].many} : il en faut ${n}.`;
  },
};

export class UI {
  constructor({ onSelect, onCancel, onReset }) {
    this.hint = document.getElementById('hint');
    this.cancelButton = document.getElementById('cancel');

    // Compteurs
    this.counters = {};
    const resourcesBox = document.getElementById('resources');
    for (const id of RESOURCE_IDS) {
      const res = RESOURCE_TYPES[id];
      const el = document.createElement('div');
      el.className = 'parchment counter';
      el.id = `counter-${id}`;
      el.setAttribute('role', 'status');
      el.setAttribute('aria-label', res.many);
      el.innerHTML = `${ICONS[res.icon] || ''}<span class="value">0</span><span class="label">${res.many}</span>`;
      resourcesBox.appendChild(el);
      const value = el.querySelector('.value');
      value.addEventListener('animationend', () => value.classList.remove('bump'));
      this.counters[id] = { value, label: el.querySelector('.label'), shown: null };
    }

    // Outils de construction (avant le bouton Annuler)
    this.tools = {};
    const toolbar = document.getElementById('toolbar');
    for (const type of BUILDING_ORDER) {
      const def = BUILDING_TYPES[type];
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'tool';
      button.dataset.building = type;
      button.setAttribute('aria-pressed', 'false');
      button.innerHTML = `<span class="tool-icon">${ICONS[def.icon] || ''}</span>
        <span class="tool-text"><span>${def.name}</span><span class="cost" data-cost></span></span>`;
      button.addEventListener('click', () => {
        if (button.classList.contains('locked')) return;
        if (button.getAttribute('aria-pressed') === 'true') onCancel();
        else onSelect(type);
      });
      toolbar.insertBefore(button, this.cancelButton);
      this.tools[type] = {
        button,
        icon: button.querySelector('.tool-icon'),
        cost: button.querySelector('[data-cost]'),
        locked: null,
      };
    }
    this.cancelButton.addEventListener('click', () => onCancel());

    // Panneau « pendant votre absence »
    this.offlinePanel = document.getElementById('offline-notice');
    this.offlineText = document.getElementById('offline-text');
    this.offlineTotals = {};
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

  // produced = { [type]: { [res]: n } } ; counts = { [type]: nombre de bâtiments }.
  // Cumule si le panneau est déjà ouvert (plusieurs retours avant fermeture).
  showOfflineGain(produced, counts) {
    for (const [type, outputs] of Object.entries(produced)) {
      const totals = (this.offlineTotals[type] ??= {});
      for (const [res, n] of Object.entries(outputs)) totals[res] = (totals[res] ?? 0) + n;
    }
    const clauses = [];
    for (const type of BUILDING_ORDER) {
      const totals = this.offlineTotals[type];
      if (!totals) continue;
      const parts = Object.entries(totals)
        .filter(([, n]) => Math.floor(n) > 0)
        .map(([res, n]) => amount(res, n));
      if (!parts.length) continue;
      const def = BUILDING_TYPES[type];
      const several = (counts[type] ?? 1) > 1;
      clauses.push(`${several ? def.many : def.one} ${several ? 'ont' : 'a'} ${def.verb} ${joinFr(parts)}`);
    }
    if (!clauses.length) return;
    this.offlineText.textContent = `Pendant votre absence, ${joinFr(clauses)}.`;
    this.offlinePanel.hidden = false;
  }

  hideOfflineGain() {
    this.offlinePanel.hidden = true;
    this.offlineTotals = {};
  }

  // state = {
  //   resources: { [res]: n },
  //   offers: { [type]: { cost, affordable, missing: [...] } },
  //   placing: type | null, check, pointerType
  // }
  render({ resources, offers, placing, check, pointerType }) {
    for (const id of RESOURCE_IDS) this.#renderCounter(id, resources[id] ?? 0);

    for (const [type, tool] of Object.entries(this.tools)) {
      const offer = offers[type];
      const locked = offer.missing.length > 0;
      const { button } = tool;
      button.setAttribute('aria-pressed', String(type === placing));
      button.classList.toggle('locked', locked);
      button.classList.toggle('unaffordable', !locked && !offer.affordable);
      // Seul le verrouillage désactive le bouton : trop cher, il reste cliquable (aperçu refusé).
      button.setAttribute('aria-disabled', String(locked));
      tool.cost.textContent = locked ? formatLock(offer.missing) : formatCost(offer.cost);
      if (tool.locked !== locked) {
        tool.icon.innerHTML = locked ? ICONS.lock : ICONS[BUILDING_TYPES[type].icon];
        tool.locked = locked;
      }
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
      ? REFUSALS[check.reason](check, resources) : null;
    this.hint.textContent = `${BUILDING_TYPES[placing].name} · ${formatCost(offers[placing].cost)}\n${refusal || howTo}`;
    this.hint.hidden = false;
  }

  #renderCounter(id, value) {
    const counter = this.counters[id];
    const shown = Math.floor(value);
    if (shown === counter.shown) return;
    const gained = counter.shown !== null && shown > counter.shown;
    counter.shown = shown;
    counter.value.textContent = String(shown);
    counter.label.textContent = resourceLabel(id, shown === 0 ? 2 : shown); // « 0 Savoirs », « 1 Savoir »
    if (gained) {
      counter.value.classList.remove('bump');
      void counter.value.offsetWidth; // redémarre l'animation CSS
      counter.value.classList.add('bump');
    }
  }

  #openReset() {
    this.resetBackdrop.hidden = false;
    this.resetKeep.focus(); // choix sûr par défaut
  }

  #closeReset() {
    this.resetBackdrop.hidden = true;
  }
}
