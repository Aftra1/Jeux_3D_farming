// Mode économie d'énergie : écran parchemin qui remplace la scène 3D (DOM seul, sans Three.js).
// Ressources et débit par minute, missive, achats à pose automatique, Phare, îlots, bâtiments
// possédés et leur état, Visiteur du lac en une ligne à toucher. Le module affiche l'état qu'on
// lui donne et émet des intentions (onBuy, onElevate, onRally, onVisitor, onJournal, onOptions, onLeave).
// Préférence `<clé>:economie`, hors sauvegarde de partie (non effacée par « Nouvelle partie »).

import { RESOURCE_TYPES, RESOURCE_IDS, resourceLabel } from '../resources.js';
import { BUILDING_TYPES, BUILDING_ORDER } from '../buildings/catalog.js';
import { ISLANDS } from '../world/islands.js';
import { SAVE } from '../config.js';
import { ICONS } from './icons.js';
import { amount, formatCost, formatLock, joinFr, REFUSALS } from './ui.js';
import { abbreviate, exact } from './format.js';
import { TEXTS } from '../story/texts.js';

const ECO_KEY = `${SAVE.storageKey}:economie`;

export function readEcoPref() {
  try {
    return window.localStorage.getItem(ECO_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeEcoPref(on) {
  try {
    window.localStorage.setItem(ECO_KEY, on ? '1' : '0');
  } catch {
    /* préférence facultative */
  }
}

// Refus propres à la pose automatique (les autres : ceux de la pose à la main).
const AUTO_REFUSALS = {
  full: () => TEXTS.refusals.full,
  edge: () => TEXTS.refusals.autoEdge,
  room: () => TEXTS.refusals.autoRoom,
};

export function autoRefusal(check, resources) {
  if (AUTO_REFUSALS[check.reason]) return AUTO_REFUSALS[check.reason]();
  return REFUSALS[check.reason]?.(check, resources) ?? TEXTS.refusals.other;
}

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const button = (className, text) => {
  const b = el('button', className, text);
  b.type = 'button';
  return b;
};

const card = (title) => {
  const section = el('section', 'parchment eco-card');
  section.append(el('h2', '', title));
  return section;
};

const perMinute = (n) => {
  const v = Math.round(n * 10) / 10;
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toLocaleString('fr-FR')} / min`;
};

export class EcoScreen {
  constructor({ onBuy, onElevate, onRally, onVisitor, onJournal, onOptions, onLeave }) {
    this.root = document.getElementById('eco');
    const scroll = el('div', 'eco-scroll');
    this.root.append(scroll);

    // En-tête : titre, Carnet, Options, retour à la scène.
    const head = el('header', 'eco-head');
    const title = el('h1', 'eco-title', TEXTS.eco.title);
    title.id = 'eco-title';
    const actions = el('div', 'eco-head-actions');
    this.journalButton = button('parchment eco-quick eco-journal');
    this.journalButton.innerHTML = `${ICONS.journal}<span>${TEXTS.eco.journal}</span><span class="journal-signal" aria-hidden="true"></span>`;
    this.journalButton.setAttribute('aria-haspopup', 'dialog');
    this.journalButton.addEventListener('click', () => onJournal());
    const options = button('parchment eco-quick');
    options.innerHTML = ICONS.gear;
    options.setAttribute('aria-label', TEXTS.eco.options);
    options.title = TEXTS.eco.options;
    options.addEventListener('click', () => onOptions());
    const leave = button('parchment eco-quick eco-leave');
    leave.innerHTML = `${ICONS.leaf}<span>${TEXTS.eco.leave}</span>`;
    leave.setAttribute('aria-pressed', 'true');
    leave.title = TEXTS.eco.leaveTitle;
    leave.addEventListener('click', () => onLeave());
    actions.append(this.journalButton, options, leave);
    head.append(title, actions);

    // Visiteur du lac : une ligne à toucher, présente aussi longtemps que le feu follet.
    this.visitorButton = button('parchment eco-visitor', TEXTS.eco.visitor);
    this.visitorButton.hidden = true;
    this.visitorButton.addEventListener('click', () => onVisitor(this.visitorButton.getBoundingClientRect()));

    // Ressources et débit par minute.
    const resCard = card(TEXTS.eco.resources);
    const resList = el('ul', 'eco-list');
    this.resources = {};
    for (const id of RESOURCE_IDS) {
      const li = el('li', 'eco-row');
      li.innerHTML = `<span class="eco-icon">${ICONS[RESOURCE_TYPES[id].icon] || ''}</span>`;
      const name = el('span', 'eco-name');
      const flow = el('span', 'eco-flow');
      li.append(name, flow);
      resList.append(li);
      this.resources[id] = { li, name, flow };
    }
    resCard.append(resList);

    // But du chapitre : titre et progression (comme le bandeau de la scène).
    this.goalCard = card(TEXTS.eco.objective);
    this.goalText = el('p', 'eco-text');
    this.goalCard.append(this.goalText);

    // Missive en cours et accès au Carnet.
    this.missiveCard = card(TEXTS.eco.missive);
    this.missiveText = el('p', 'eco-text');
    this.missiveCount = el('p', 'eco-note');
    this.missiveCard.append(this.missiveText, this.missiveCount);

    // Achats : la pose est automatique.
    const buyCard = card(TEXTS.eco.build);
    this.status = el('p', 'eco-status');
    this.status.setAttribute('role', 'status');
    this.status.hidden = true;
    const buyList = el('ul', 'eco-list');
    this.offers = {};
    for (const type of BUILDING_ORDER) {
      const def = BUILDING_TYPES[type];
      const li = el('li', 'eco-row');
      const icon = el('span', 'eco-icon');
      const text = el('span', 'eco-name');
      const name = el('span', '', def.name);
      const cost = el('span', 'eco-note');
      text.append(name, cost);
      const buy = button('tool eco-buy', TEXTS.eco.buy);
      buy.addEventListener('click', () => {
        if (buy.getAttribute('aria-disabled') !== 'true') onBuy(type);
      });
      li.append(icon, text, buy);
      buyList.append(li);
      this.offers[type] = { li, icon, cost, buy, locked: null };
    }
    buyCard.append(this.status, buyList);

    // Phare du Lac : palier, effet, prochain palier, « Élever ».
    this.lighthouseCard = card(TEXTS.eco.lighthouse);
    this.lighthouseStage = el('p', 'eco-text');
    this.lighthouseNext = el('p', 'eco-note');
    this.elevateButton = button('tool', TEXTS.eco.elevate);
    this.elevateButton.addEventListener('click', () => {
      if (this.lighthouseUid !== null) onElevate(this.lighthouseUid);
    });
    this.lighthouseUid = null;
    this.lighthouseCard.append(this.lighthouseStage, this.lighthouseNext, this.elevateButton);

    // Îlots du lac : rallier ceux qui sont dans la brume.
    this.islandCard = card(TEXTS.eco.islands);
    const islandList = el('ul', 'eco-list');
    this.islands = {};
    for (const isle of ISLANDS) {
      const li = el('li', 'eco-row');
      const text = el('span', 'eco-name');
      const note = el('span', 'eco-note');
      text.append(el('span', '', isle.name), note);
      const rally = button('tool eco-buy', TEXTS.eco.rally);
      rally.addEventListener('click', () => onRally(isle.id));
      li.append(text, rally);
      islandList.append(li);
      this.islands[isle.id] = { note, rally };
    }
    this.islandCard.append(islandList);

    // Bâtiments possédés et leur état.
    const ownedCard = card(TEXTS.eco.buildings);
    this.ownedList = el('ul', 'eco-list');
    this.ownedEmpty = el('p', 'eco-note', TEXTS.eco.noBuilding);
    ownedCard.append(this.ownedEmpty, this.ownedList);

    scroll.append(head, this.visitorButton, resCard, this.goalCard, this.missiveCard, buyCard, this.lighthouseCard,
      this.islandCard, ownedCard);
  }

  set shown(on) {
    this.root.hidden = !on;
    if (!on) this.say(null);
  }

  get shown() {
    return !this.root.hidden;
  }

  // Message sous « Bâtir » (pose réussie ou refusée) ; s'efface seul.
  say(text) {
    clearTimeout(this.sayTimer);
    this.status.hidden = !text;
    this.status.textContent = text ?? '';
    if (text) this.sayTimer = setTimeout(() => this.say(null), 6000);
  }

  // state = { resources, flow, hiddenResources, offers, owned: [{ type, count, active, paused, boosted }],
  //   lighthouse, islands, missive, goal: { title, have, target }, unread, visitor }
  render({ resources, flow, hiddenResources, offers, owned, lighthouse, islands, missive, goal, unread, visitor }) {
    this.visitorButton.hidden = !visitor;
    this.journalButton.classList.toggle('unread', unread > 0);
    this.journalButton.setAttribute('aria-label', unread > 0 ? TEXTS.journal.signal : TEXTS.eco.journal);

    for (const id of RESOURCE_IDS) {
      const row = this.resources[id];
      row.li.hidden = hiddenResources.includes(id);
      const n = Math.floor(resources[id] ?? 0);
      row.name.textContent = `${abbreviate(n)} ${resourceLabel(id, n === 0 ? 2 : n)}`;
      row.name.title = exact(n);
      const f = flow[id];
      row.flow.textContent = f ? perMinute(f.net) : '';
      row.flow.title = f && f.used ? TEXTS.eco.perMin(perMinute(f.gross), perMinute(-f.used)) : '';
    }

    this.goalCard.hidden = !goal;
    if (goal) this.goalText.textContent = `${goal.title} · ${goal.have} / ${goal.target}`;
    this.missiveCard.hidden = !missive;
    if (missive) {
      this.missiveText.textContent = missive.text;
      this.missiveCount.textContent = `${missive.have} / ${missive.target}`;
    }

    for (const type of BUILDING_ORDER) {
      const offer = offers[type];
      const row = this.offers[type];
      row.li.hidden = Boolean(offer.hidden) || Boolean(offer.stage); // unique déjà posé : son panneau
      const locked = offer.missing.length > 0;
      if (row.locked !== locked) {
        row.icon.innerHTML = locked ? ICONS.lock : ICONS[BUILDING_TYPES[type].icon];
        row.locked = locked;
      }
      row.li.classList.toggle('locked', locked);
      row.cost.textContent = locked ? formatLock(offer.missing) : formatCost(offer.cost);
      row.buy.setAttribute('aria-disabled', String(locked));
      row.buy.classList.toggle('unaffordable', !locked && !offer.affordable);
    }

    this.lighthouseCard.hidden = !lighthouse;
    this.lighthouseUid = lighthouse?.uid ?? null;
    if (lighthouse) {
      const names = BUILDING_TYPES.lighthouse.stageNames;
      const complete = lighthouse.stage >= lighthouse.max;
      this.lighthouseStage.textContent = TEXTS.eco.stage(lighthouse.stage, lighthouse.max, names[lighthouse.stage - 1],
        lighthouse.percent);
      this.elevateButton.hidden = complete;
      if (complete) this.lighthouseNext.textContent = TEXTS.lighthouse.done;
      else {
        const short = Object.entries(lighthouse.nextCost)
          .filter(([res, n]) => (resources[res] ?? 0) < n)
          .map(([res, n]) => amount(res, n - (resources[res] ?? 0), { up: true }));
        this.lighthouseNext.textContent = TEXTS.eco.next(names[lighthouse.stage], formatCost(lighthouse.nextCost))
          + (short.length ? TEXTS.eco.missing(joinFr(short)) : '');
        this.elevateButton.classList.toggle('unaffordable', short.length > 0);
      }
    }

    this.islandCard.hidden = !islands.revealed;
    if (islands.revealed) {
      const short = islands.cost && Object.entries(islands.cost).some(([res, n]) => (resources[res] ?? 0) < n);
      for (const isle of ISLANDS) {
        const row = this.islands[isle.id];
        const rallied = islands.rallied.includes(isle.id);
        row.note.textContent = rallied ? TEXTS.eco.rallied : TEXTS.eco.inMist(formatCost(islands.cost));
        row.rally.hidden = rallied || !islands.cost;
        row.rally.classList.toggle('unaffordable', Boolean(short));
      }
    }

    const key = owned.map((o) => `${o.type}:${o.count}:${o.active}:${o.paused}:${o.boosted ?? ''}`).join('|');
    if (key !== this.ownedKey) {
      this.ownedKey = key;
      this.ownedEmpty.hidden = owned.length > 0;
      this.ownedList.replaceChildren(...owned.map((o) => {
        const def = BUILDING_TYPES[o.type];
        const li = el('li', 'eco-row');
        const icon = el('span', 'eco-icon');
        icon.innerHTML = ICONS[def.icon] || '';
        const text = el('span', 'eco-name');
        text.append(el('span', '', `${o.count} ${o.count > 1 ? def.plural : def.name}`), el('span', 'eco-note', ownedState(o)));
        li.append(icon, text);
        if (o.paused) li.classList.add('paused');
        return li;
      }));
    }
  }
}

// « 3 en activité · 1 en pause », « renforcent 4 Bibliothèques »…
function ownedState({ count, active, paused, boosted }) {
  if (boosted !== undefined) {
    const lib = BUILDING_TYPES.library;
    return boosted ? TEXTS.eco.boosts(count, boosted, boosted > 1 ? lib.plural : lib.name) : TEXTS.eco.boostsNone;
  }
  if (active === undefined) return '';
  const parts = [];
  if (active) parts.push(TEXTS.eco.active(active));
  if (paused) parts.push(TEXTS.eco.paused(paused));
  return parts.join(' · ');
}
