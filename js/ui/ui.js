// Interface HTML par-dessus le canvas : compteurs de ressources, barre d'outils
// parchemin, bulle d'aide, Carnet et missives, panneau de retour et confirmation de nouvelle partie.
// Compteurs et outils sont générés depuis les registres (resources.js, catalog.js).
// Le module ne connaît ni la 3D ni la simulation : il émet des intentions
// (onSelect, onCancel, onReset, onJournalOpen, onElevate, onRally, onMute, onVolume) et affiche l'état qu'on lui donne.

import { RESOURCE_TYPES, RESOURCE_IDS, resourceLabel } from '../resources.js';
import { BUILDING_TYPES, BUILDING_ORDER } from '../buildings/catalog.js';
import { BALANCE } from '../balance.js';
import { ICONS } from './icons.js';
import { FRAGMENTS } from '../story/fragments.js';
import { ENDING } from '../story/ending.js';
import { PATH_TEXTS, RESOURCE_HELP, NEW_TOOL } from '../story/guide.js';
import { HTML, TEXTS } from '../story/texts.js';
import { SAVE } from '../config.js';
import { getIsland } from '../world/islands.js';
import { abbreviate, exact } from './format.js';
import { GUIDE_PREFS, readSet, writeSet } from './prefs.js';
import { Tips } from './tips.js';

// Rappel de missive replié ou non : simple préférence d'affichage, hors sauvegarde de partie.
const FOLD_KEY = `${SAVE.storageKey}:missive-repliee`;
function readFold() {
  try {
    return window.localStorage.getItem(FOLD_KEY) === '1';
  } catch {
    return false;
  }
}
function writeFold(folded) {
  try {
    window.localStorage.setItem(FOLD_KEY, folded ? '1' : '0');
  } catch {
    /* préférence facultative */
  }
}

// Quantité abrégée (« 1,2 k Savoirs ») ; `exact` : valeur complète ; `up` : arrondi au supérieur (ce qui manque).
export const amount = (res, n, { exact: full = false, up = false } = {}) => {
  const whole = up ? Math.ceil(n) : Math.floor(n);
  return `${full ? exact(n) : abbreviate(n, { up })} ${resourceLabel(res, whole)}`;
};

export function formatCost(cost, options) {
  const parts = Object.entries(cost || {}).map(([res, n]) => amount(res, n, options));
  return parts.length ? parts.join(', ') : TEXTS.free;
}

export function formatLock(missing) {
  return TEXTS.lock.prefix + missing
    .map((m) => {
      if (m.kind === 'missives') return TEXTS.lock.missives(m);
      if (m.kind === 'finished') return TEXTS.lock.finished;
      return TEXTS.lock.building(m, BUILDING_TYPES[m.type]);
    })
    .join(TEXTS.lock.join);
}

export function joinFr(parts) {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} et ${parts[parts.length - 1]}`;
}

export const REFUSALS = {
  occupied: () => TEXTS.refusals.occupied,
  bounds: () => TEXTS.refusals.bounds,
  locked: (check) => `${formatLock(check.missing)}.`,
  edge: () => TEXTS.refusals.edge,
  room: () => TEXTS.refusals.room,
  unique: () => TEXTS.refusals.unique,
  cost: (check, resources) => {
    const [res, n] = Object.entries(check.cost).find(([r, c]) => (resources[r] ?? 0) < c)
      || Object.entries(check.cost)[0];
    return TEXTS.refusals.cost(RESOURCE_TYPES[res].many, exact(n));
  },
};

// Remplit les éléments statiques de index.html depuis js/story/texts.js (data-t, data-t-aria, data-t-title).
function applyTexts() {
  for (const el of document.querySelectorAll('[data-t]')) el.textContent = HTML[el.dataset.t];
  for (const el of document.querySelectorAll('[data-t-aria]')) el.setAttribute('aria-label', HTML[el.dataset.tAria]);
  for (const el of document.querySelectorAll('[data-t-title]')) el.title = HTML[el.dataset.tTitle];
}

export class UI {
  constructor({ onSelect, onCancel, onReset, onJournalOpen, onElevate, onRally, onMove, sound, onMute, onVolume,
    dayFrozen, onDayFrozen, onReread, quality, onQuality, onShowFps, eco, onEco }) {
    applyTexts();
    this.tips = new Tips();
    this.toolsSeen = readSet(GUIDE_PREFS.tools);
    this.offers = {};
    this.hint = document.getElementById('hint');

    // But du chapitre (bandeau permanent, ouvre le Carnet)
    this.objective = document.getElementById('objective');
    this.objectiveTitle = document.getElementById('objective-title');
    this.objectiveCount = document.getElementById('objective-count');
    this.objectiveBar = document.getElementById('objective-bar');
    this.objectiveKey = null;
    this.objective.addEventListener('click', () => this.toggleJournal());
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
      el.tabIndex = 0;
      el.innerHTML = `${ICONS[res.icon] || ''}<span class="value">0</span><span class="label">${res.many}</span>`;
      resourcesBox.appendChild(el);
      const value = el.querySelector('.value');
      value.addEventListener('animationend', () => value.classList.remove('bump'));
      this.counters[id] = { el, value, label: el.querySelector('.label'), shown: null, exact: 0 };
      // Aide : survol (souris), toucher ou clavier ; un deuxième toucher la referme.
      el.addEventListener('pointerenter', (e) => {
        if (e.pointerType === 'mouse') this.#showCounterTip(id);
      });
      el.addEventListener('pointerleave', (e) => {
        if (e.pointerType === 'mouse') this.#hideCounterTip();
      });
      el.addEventListener('click', () => (this.counterTipFor === id ? this.#hideCounterTip() : this.#showCounterTip(id)));
      el.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        el.click();
      });
      el.addEventListener('blur', () => this.#hideCounterTip());
    }
    this.counterTip = document.getElementById('counter-tip');
    this.counterTipFor = null;
    document.addEventListener('pointerdown', (e) => {
      if (this.counterTipFor && !e.target.closest?.('.counter')) this.#hideCounterTip();
    });

    // Outils de construction (avant le bouton Annuler)
    this.tools = {};
    this.toolsBox = document.getElementById('tools');
    for (const type of BUILDING_ORDER) {
      const def = BUILDING_TYPES[type];
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'tool';
      button.dataset.building = type;
      button.setAttribute('aria-pressed', 'false');
      button.innerHTML = `<span class="tool-icon">${ICONS[def.icon] || ''}</span>
        <span class="tool-text"><span>${def.name}</span><span class="cost" data-cost></span></span>
        <span class="new-dot" aria-hidden="true"></span>`;
      button.addEventListener('click', () => {
        button.scrollIntoView({ block: 'nearest', inline: 'nearest' }); // outil à demi caché
        if (button.classList.contains('locked')) return;
        this.#markToolSeen(type);
        if (button.getAttribute('aria-pressed') === 'true') onCancel();
        else onSelect(type);
      });
      this.toolsBox.appendChild(button);
      this.tools[type] = {
        button,
        icon: button.querySelector('.tool-icon'),
        cost: button.querySelector('[data-cost]'),
        locked: null,
      };
    }
    this.cancelButton.addEventListener('click', () => onCancel());
    // Bords estompés selon ce qui reste à faire défiler ; molette verticale → horizontale.
    const hints = () => this.#updateToolHints();
    this.toolsBox.addEventListener('scroll', hints, { passive: true });
    window.addEventListener('resize', hints);
    this.toolsBox.addEventListener('wheel', (e) => {
      if (this.toolsBox.scrollWidth <= this.toolsBox.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      this.toolsBox.scrollLeft += e.deltaY;
      e.preventDefault();
    }, { passive: false });

    // Carnet (non bloquant : la partie continue derrière)
    this.journalButton = document.getElementById('journal-open');
    this.journalPanel = document.getElementById('journal');
    this.fragmentList = document.getElementById('fragments');
    this.journalKey = null;
    document.getElementById('journal-icon').innerHTML = ICONS.journal;
    this.onJournalOpen = onJournalOpen;
    this.journalButton.addEventListener('click', () => this.toggleJournal());
    document.getElementById('journal-close').addEventListener('click', () => this.#closeJournal());
    // Partie terminée : « Le Phare veille » et relecture de la dernière lettre
    this.watchBox = document.getElementById('journal-watch');
    document.getElementById('journal-watch-text').textContent = ENDING.watch;
    const reread = document.getElementById('journal-reread');
    reread.textContent = ENDING.reread;
    reread.addEventListener('click', () => {
      this.#closeJournal();
      onReread();
    });
    this.missiveText = document.getElementById('missive-text');
    this.missiveProgress = document.getElementById('missive-progress');
    // Chemin : frise des étapes du chapitre (réduite : en cours et suivante ; dépliée : toutes)
    this.pathPips = document.getElementById('path-pips');
    this.pathNow = document.getElementById('path-now');
    this.pathNext = document.getElementById('path-next');
    this.pathList = document.getElementById('path-list');
    this.pathToggle = document.getElementById('path-toggle');
    this.pathToggle.textContent = PATH_TEXTS.all;
    this.pathToggle.addEventListener('click', () => {
      const open = this.pathList.hidden;
      this.pathList.hidden = !open;
      this.pathToggle.setAttribute('aria-expanded', String(open));
      this.pathToggle.textContent = open ? PATH_TEXTS.fewer : PATH_TEXTS.all;
    });

    // Rappel de la missive en cours (un clic le replie ou le déplie)
    this.reminder = document.getElementById('missive-reminder');
    this.reminderShort = document.getElementById('missive-short');
    this.reminderCount = document.getElementById('missive-count');
    this.reminderId = undefined;
    document.getElementById('missive-icon').innerHTML = ICONS.missive;
    this.reminder.setAttribute('aria-expanded', String(!readFold()));
    this.reminder.addEventListener('click', () => {
      const folded = this.reminder.getAttribute('aria-expanded') === 'true';
      this.reminder.setAttribute('aria-expanded', String(!folded));
      writeFold(folded);
    });
    this.reminder.addEventListener('animationend', () => this.reminder.classList.remove('fresh'));

    // Son : bouton rapide en jeu et interrupteur des Options, toujours synchronisés ;
    // bouger le curseur remet le son s'il était coupé.
    this.soundToggle = document.getElementById('sound-toggle');
    this.soundIcon = document.getElementById('sound-icon');
    this.optionsSound = document.getElementById('options-sound');
    this.optionsSoundIcon = document.getElementById('options-sound-icon');
    this.optionsSoundLabel = document.getElementById('options-sound-label');
    this.volume = document.getElementById('sound-volume');
    this.volume.value = String(Math.round(sound.volume * 100));
    this.#renderSound(sound.muted);
    for (const button of [this.soundToggle, this.optionsSound]) {
      button.addEventListener('click', () => {
        const muted = !this.muted;
        this.#renderSound(muted);
        onMute(muted);
      });
    }
    this.volume.addEventListener('input', () => {
      onVolume(Number(this.volume.value) / 100);
      if (this.muted) {
        this.#renderSound(false);
        onMute(false);
      }
    });

    // Heure : figer sur l'après-midi doré, ou laisser passer le jour et la nuit.
    this.dayToggle = document.getElementById('day-toggle');
    this.dayIcon = document.getElementById('day-icon');
    this.dayLabel = document.getElementById('day-label');
    this.#renderDay(dayFrozen);
    this.dayToggle.addEventListener('click', () => {
      const frozen = this.dayToggle.getAttribute('aria-pressed') !== 'true';
      this.#renderDay(frozen);
      onDayFrozen(frozen);
    });

    // Qualité graphique (Auto / Basse / Normale / Haute) et compteur d'images par seconde.
    this.qualityButtons = [...document.querySelectorAll('#quality-choice button')];
    this.qualityNote = document.getElementById('quality-note');
    for (const button of this.qualityButtons) {
      button.addEventListener('click', () => onQuality(button.dataset.choice));
    }
    this.fpsToggle = document.getElementById('fps-toggle');
    this.fpsLabel = document.getElementById('fps-label');
    this.fpsCounter = document.getElementById('fps-counter');
    // Trois états à la suite : masqué → affiché → détaillé (coût de l'image) → masqué.
    this.fpsToggle.addEventListener('click', () => {
      const next = { false: true, true: 'detail', detail: false }[String(this.quality.fps)];
      onShowFps(next);
      this.renderQuality({ ...this.quality, fps: next });
    });
    this.renderQuality(quality);

    // Mode économie d'énergie : bouton rapide (feuille) et interrupteur des Options, synchronisés.
    this.ecoToggle = document.getElementById('eco-toggle');
    this.ecoOption = document.getElementById('eco-option');
    document.getElementById('eco-icon').innerHTML = ICONS.leaf;
    document.getElementById('eco-option-icon').innerHTML = ICONS.leaf;
    this.ecoLabel = document.getElementById('eco-option-label');
    this.renderEco(eco);
    for (const b of [this.ecoToggle, this.ecoOption]) {
      b.addEventListener('click', () => onEco(b.getAttribute('aria-pressed') !== 'true'));
    }

    // Options (non bloquant, comme le Carnet ; l'un ferme l'autre)
    this.tipsReset = document.getElementById('tips-reset');
    this.tipsReset.addEventListener('click', () => {
      this.tips.reset();
      this.toolsSeen.clear();
      writeSet(GUIDE_PREFS.tools, this.toolsSeen);
      this.tipsReset.textContent = TEXTS.options.tipsDone;
      setTimeout(() => { this.tipsReset.textContent = HTML['tips.reset']; }, 2500);
    });
    this.optionsButton = document.getElementById('options-open');
    this.optionsPanel = document.getElementById('options');
    document.getElementById('options-icon').innerHTML = ICONS.gear;
    this.optionsButton.addEventListener('click', () => this.toggleOptions());
    document.getElementById('options-close').addEventListener('click', () => this.#closeOptions());

    // Phare du Lac (non bloquant ; ferme le Carnet et les Options, et inversement)
    this.lighthousePanel = document.getElementById('lighthouse');
    this.lighthouseTrack = document.getElementById('lighthouse-track');
    this.lighthouseStage = document.getElementById('lighthouse-stage');
    this.lighthouseEffect = document.getElementById('lighthouse-effect');
    this.lighthouseNext = document.getElementById('lighthouse-next');
    this.elevateButton = document.getElementById('lighthouse-elevate');
    this.lighthouseUid = null;
    this.elevateButton.addEventListener('click', () => {
      if (this.lighthouseUid !== null) onElevate(this.lighthouseUid);
    });
    document.getElementById('lighthouse-close').addEventListener('click', () => this.#closeLighthouse());
    document.getElementById('lighthouse-move').addEventListener('click', () => {
      if (this.lighthouseUid !== null) onMove(this.lighthouseUid);
    });

    // Fiche d'un bâtiment posé (non bloquant, comme le Phare)
    this.cardPanel = document.getElementById('building-card');
    this.cardTitle = document.getElementById('card-title');
    this.cardRole = document.getElementById('card-role');
    this.cardProduction = document.getElementById('card-production');
    this.cardState = document.getElementById('card-state');
    this.cardUid = null;
    this.cardKey = null;
    document.getElementById('card-move').addEventListener('click', () => {
      if (this.cardUid !== null) onMove(this.cardUid);
    });
    document.getElementById('card-close').addEventListener('click', () => this.#closeCard());

    // Îlot dans la brume : nom, coût en Reliques, « Rallier » (non bloquant, comme le Phare)
    this.islandPanel = document.getElementById('island');
    this.islandTitle = document.getElementById('island-title');
    this.islandBlurb = document.getElementById('island-blurb');
    this.islandCost = document.getElementById('island-cost');
    this.rallyButton = document.getElementById('island-rally');
    this.islandId = null;
    this.rallyButton.addEventListener('click', () => {
      if (this.islandId) onRally(this.islandId);
    });
    document.getElementById('island-close').addEventListener('click', () => this.#closeIsland());

    // Panneau « pendant votre absence »
    this.offlinePanel = document.getElementById('offline-notice');
    this.offlineText = document.getElementById('offline-text');
    this.offlineTotals = {};
    document.getElementById('offline-close').addEventListener('click', () => this.hideOfflineGain());

    // Lettre d'un nouveau chapitre (voile léger, un seul bouton)
    this.chapterBackdrop = document.getElementById('chapter-backdrop');
    this.chapterAccept = document.getElementById('chapter-accept');
    this.chapterAccept.addEventListener('click', () => this.#closeChapter());
    this.chapterBackdrop.addEventListener('click', (e) => {
      if (e.target === this.chapterBackdrop) this.#closeChapter();
    });

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
    return !this.resetBackdrop.hidden || !this.chapterBackdrop.hidden || !this.offlinePanel.hidden || !this.journalPanel.hidden
      || !this.optionsPanel.hidden || !this.lighthousePanel.hidden || !this.islandPanel.hidden
      || !this.cardPanel.hidden;
  }

  // Ouvre ou ferme le Carnet (bouton en jeu, écran du mode économie).
  toggleJournal() {
    if (!this.journalPanel.hidden) {
      this.#closeJournal();
      return;
    }
    this.#closeOptions();
    this.#closeLighthouse();
    this.#closeCard();
    this.#closeIsland();
    this.journalPanel.hidden = false;
    this.onJournalOpen(); // marque les fragments comme lus, puis re-rendu
  }

  // Lettre du chapitre II : { title, paragraphs, signature, accept }. `onClose` à la fermeture.
  showChapterLetter(letter, onClose) {
    document.getElementById('chapter-title').textContent = letter.title;
    document.getElementById('chapter-body').replaceChildren(...letter.paragraphs.map((text) => {
      const p = document.createElement('p');
      p.textContent = text;
      return p;
    }));
    document.getElementById('chapter-signature').textContent = letter.signature;
    this.chapterAccept.textContent = letter.accept;
    this.chapterClose = onClose;
    this.chapterBackdrop.hidden = false;
    this.chapterAccept.focus({ preventScroll: true });
  }

  #closeChapter() {
    if (this.chapterBackdrop.hidden) return;
    this.chapterBackdrop.hidden = true;
    const done = this.chapterClose;
    this.chapterClose = null;
    done?.();
  }

  renderEco(on) {
    for (const b of [this.ecoToggle, this.ecoOption]) b.setAttribute('aria-pressed', String(on));
    this.ecoLabel.textContent = on ? TEXTS.options.ecoOn : TEXTS.options.ecoOff;
  }

  // Ouvre ou ferme les Options (bouton engrenage en jeu, bouton « Options » de l'écran titre).
  toggleOptions() {
    if (!this.optionsPanel.hidden) {
      this.#closeOptions();
      return;
    }
    this.#closeJournal();
    this.#closeLighthouse();
    this.#closeCard();
    this.#closeIsland();
    this.optionsPanel.hidden = false;
    this.optionsButton.setAttribute('aria-expanded', 'true');
  }

  // Séquence de fin : tous les panneaux non bloquants se referment.
  closeAll() {
    this.hideOfflineGain();
    this.#closeJournal();
    this.#closeOptions();
    this.#closeLighthouse();
    this.#closeCard();
    this.#closeIsland();
  }

  // Confirmation de nouvelle partie (Options, ou écran titre quand une sauvegarde existe).
  openReset() {
    this.#openReset();
  }

  // Ouvre le panneau du Phare (le contenu suit `state.lighthouse` à chaque rendu).
  openLighthouse() {
    this.#closeJournal();
    this.#closeOptions();
    this.#closeIsland();
    this.#closeCard();
    this.lighthousePanel.hidden = false;
  }

  // Ouvre la fiche du bâtiment `uid` (le contenu suit `state.card` à chaque rendu).
  openCard(uid) {
    this.#closeJournal();
    this.#closeOptions();
    this.#closeLighthouse();
    this.#closeIsland();
    this.cardUid = uid;
    this.cardKey = null;
    this.cardPanel.hidden = false;
  }

  closeCard() {
    this.#closeCard();
  }

  // Ouvre le panneau d'un îlot encore dans la brume (contenu : `state.islands` à chaque rendu).
  openIsland(id) {
    this.#closeJournal();
    this.#closeOptions();
    this.#closeLighthouse();
    this.#closeCard();
    this.islandId = id;
    this.islandKey = null;
    this.islandPanel.hidden = false;
  }

  get journalOpen() {
    return !this.journalPanel.hidden;
  }

  // Ferme le dialogue au premier plan (Échap). Renvoie true si un dialogue a été fermé.
  closeTopDialog() {
    if (!this.resetBackdrop.hidden) {
      this.#closeReset();
      return true;
    }
    if (!this.chapterBackdrop.hidden) {
      this.#closeChapter();
      return true;
    }
    if (!this.offlinePanel.hidden) {
      this.hideOfflineGain();
      return true;
    }
    if (!this.journalPanel.hidden) {
      this.#closeJournal();
      return true;
    }
    if (!this.optionsPanel.hidden) {
      this.#closeOptions();
      return true;
    }
    if (!this.lighthousePanel.hidden) {
      this.#closeLighthouse();
      return true;
    }
    if (!this.cardPanel.hidden) {
      this.#closeCard();
      return true;
    }
    if (!this.islandPanel.hidden) {
      this.#closeIsland();
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
      clauses.push(TEXTS.offline.clause(several ? def.many : def.one, several, def.verb, joinFr(parts)));
    }
    if (!clauses.length) return;
    this.offlineText.textContent = TEXTS.offline.text(joinFr(clauses));
    this.offlinePanel.hidden = false;
  }

  hideOfflineGain() {
    this.offlinePanel.hidden = true;
    this.offlineTotals = {};
  }

  // state = {
  //   resources: { [res]: n },
  //   offers: { [type]: { cost, affordable, missing: [...] } },
  //   placing: type | null, check, pointerType,
  //   journal: { unlocked: [id], unread: n, earned: { [res]: n },
  //              missive: { id, text, short, have, target } | null },
  //   lighthouse: { uid, stage, max, nextCost: { [res]: n } | null, percent } | null,
  //   moving: déplacement d'un bâtiment posé (gratuit) ; effect: effet de la pose visée (ligne) | null,
  //   card: { uid, type, cycle: { seconds, inputs, outputs } | null, paused, boosted,
  //           aura: { n, target } | null } | null  (fiche ouverte)
  // }
  // Une offre peut porter `stage: { stage, max }` (bâtiment unique déjà posé).
  // `hiddenResources` : compteurs encore invisibles (Reliques avant le chapitre II) ; une
  // offre `hidden` : outil absent de la barre (bâtiment du chapitre II avant la fin).
  render({ resources, offers, placing, moving, effect, card, check, pointerType, journal, lighthouse, islands,
    hiddenResources = [] }) {
    this.offers = offers;
    for (const id of RESOURCE_IDS) {
      this.counters[id].el.hidden = hiddenResources.includes(id);
      this.#renderCounter(id, resources[id] ?? 0);
    }
    this.#renderObjective(journal.goal);
    this.#renderJournal(journal);
    this.#renderLighthouse(lighthouse, resources);
    this.#renderCard(card);
    this.#renderIsland(islands, resources);

    for (const [type, tool] of Object.entries(this.tools)) {
      const offer = offers[type];
      const locked = offer.missing.length > 0;
      const { button } = tool;
      button.hidden = Boolean(offer.hidden);
      button.setAttribute('aria-pressed', String(type === placing && !moving));
      button.classList.toggle('locked', locked);
      // Seul le verrouillage désactive le bouton : trop cher, il reste cliquable (aperçu refusé).
      button.setAttribute('aria-disabled', String(locked));
      tool.cost.textContent = locked ? formatLock(offer.missing)
        : offer.stage ? TEXTS.toolStage(offer.stage.stage, offer.stage.max) : formatCost(offer.cost);
      button.title = locked || offer.stage ? '' : formatCost(offer.cost, { exact: true });
      this.#renderToolSignal(type, tool, locked, offer);
      button.classList.toggle('unaffordable', !locked && !offer.stage && !offer.affordable);
      if (tool.locked !== locked) {
        tool.icon.innerHTML = locked ? ICONS.lock : ICONS[BUILDING_TYPES[type].icon];
        tool.locked = locked;
      }
    }
    this.cancelButton.hidden = !placing;
    this.#updateToolHints(); // largeur des boutons (coût, verrou) ou du bouton Annuler changée

    if (!placing) {
      this.hint.hidden = true;
      return;
    }
    const touch = pointerType === 'touch' || pointerType === 'pen';
    const verb = moving ? TEXTS.hint.drop : TEXTS.hint.place;
    const howTo = touch ? TEXTS.hint.touch(verb) : TEXTS.hint.mouse(verb);
    const refusal = check && !check.ok && REFUSALS[check.reason]
      ? REFUSALS[check.reason](check, resources) : null;
    const head = moving ? TEXTS.hint.movingHead(BUILDING_TYPES[placing].name)
      : `${BUILDING_TYPES[placing].name} · ${formatCost(offers[placing].cost, { exact: true })}`;
    // L'effet de la pose passe avant le mode d'emploi, qui se réduit alors à sa première ligne.
    const body = refusal || (effect ? `${effect}\n${howTo.split('\n')[0]}` : howTo);
    this.hint.textContent = `${head}\n${body}`;
    this.hint.hidden = false;
  }

  #renderCounter(id, value) {
    const counter = this.counters[id];
    const shown = Math.floor(value);
    if (shown === counter.shown) return;
    const gained = counter.shown !== null && shown > counter.shown;
    counter.shown = shown;
    counter.value.textContent = abbreviate(shown);
    counter.exact = shown;
    if (this.counterTipFor === id) this.#showCounterTip(id);
    counter.label.textContent = resourceLabel(id, shown === 0 ? 2 : shown); // « 0 Savoirs », « 1 Savoir »
    if (gained) {
      counter.value.classList.remove('bump');
      void counter.value.offsetWidth; // redémarre l'animation CSS
      counter.value.classList.add('bump');
    }
  }

  #renderJournal({ unlocked, unread, earned, missive, finished, path }) {
    this.watchBox.hidden = !finished;
    const signal = unread > 0;
    this.journalButton.classList.toggle('unread', signal);
    this.journalButton.setAttribute('aria-label', signal ? TEXTS.journal.signal : HTML['journal.button']);
    this.#renderReminder(missive);
    if (this.journalPanel.hidden) return;

    // Reconstruit la liste seulement si ce qui est affiché change.
    // Fragments cachés (Visiteurs du lac) : absents tant qu'ils ne sont pas révélés.
    // Chapitre II : sa section n'apparaît qu'une fois la séquence de fin vue.
    const shown = FRAGMENTS.filter((f) => (!f.hidden || unlocked.includes(f.id)) && (!f.chapter || finished));
    const progress = shown.map((f) => (f.resource ? Math.floor(earned[f.resource] ?? 0) : 0));
    const pathKey = path.steps.map((st) => `${st.id}${st.state}${st.have}`).join() + path.hidden;
    const key = `${unlocked.join()}|${progress.join()}|${missive ? `${missive.id}:${missive.have}` : ''}|${pathKey}`;
    if (key === this.journalKey) return;
    this.journalKey = key;
    this.#renderPath(path);
    this.missiveText.textContent = missive ? missive.text : TEXTS.journal.none;
    this.missiveProgress.textContent = missive ? `${missive.have} / ${missive.target}` : '';
    this.missiveProgress.hidden = !missive;
    const items = shown.map((f, i) => {
      const li = document.createElement('li');
      li.className = 'fragment';
      if (unlocked.includes(f.id)) {
        const h = document.createElement('h3');
        h.textContent = f.title;
        const p = document.createElement('p');
        p.textContent = f.text;
        li.append(h, p);
      } else {
        li.classList.add('erased');
        const ink = document.createElement('div');
        ink.className = 'ink';
        ink.setAttribute('aria-hidden', 'true');
        const p = document.createElement('p');
        if (f.missive) {
          p.textContent = TEXTS.journal.erasedMissive;
        } else {
          const have = Math.min(progress[i], f.threshold);
          p.textContent = TEXTS.journal.erased(amount(f.resource, f.threshold), have, f.threshold);
        }
        li.append(ink, p);
      }
      return li;
    });
    const first = shown.findIndex((f) => f.chapter === 2);
    if (first >= 0) {
      const title = document.createElement('li');
      title.className = 'chapter-title';
      title.textContent = TEXTS.journal.chapter2;
      items.splice(first, 0, title);
    }
    this.fragmentList.replaceChildren(...items);
  }

  // Texte flottant discret (cadeau d'un Visiteur du lac) en (x, y) px CSS : monte et s'efface.
  floatText(x, y, text) {
    const el = document.createElement('div');
    el.className = 'float-text';
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.addEventListener('animationend', () => el.remove());
    document.getElementById('ui').append(el);
  }

  #renderLighthouse(lh, resources) {
    if (!lh) {
      this.lighthouseUid = null;
      this.#closeLighthouse();
      return;
    }
    this.lighthouseUid = lh.uid;
    if (this.lighthousePanel.hidden) return;
    const names = BUILDING_TYPES.lighthouse.stageNames;
    const complete = lh.stage >= lh.max;
    const key = `${lh.stage}`;
    if (this.lighthouseTrack.dataset.key !== key) {
      this.lighthouseTrack.dataset.key = key;
      this.lighthouseTrack.classList.toggle('complete', complete);
      this.lighthouseTrack.replaceChildren(...names.slice(0, lh.max).map((_, i) => {
        const li = document.createElement('li');
        li.classList.toggle('done', i < lh.stage);
        return li;
      }));
    }
    this.lighthouseStage.textContent = TEXTS.lighthouse.stage(lh.stage, lh.max, names[lh.stage - 1]);
    this.lighthouseEffect.textContent = TEXTS.lighthouse.effect(lh.percent);
    this.elevateButton.hidden = complete;
    if (complete) {
      this.lighthouseNext.textContent = TEXTS.lighthouse.done;
      return;
    }
    const short = Object.entries(lh.nextCost)
      .filter(([res, n]) => (resources[res] ?? 0) < n)
      .map(([res, n]) => amount(res, n - (resources[res] ?? 0), { up: true }));
    this.lighthouseNext.textContent = TEXTS.lighthouse.next(names[lh.stage], formatCost(lh.nextCost, { exact: true }))
      + (short.length ? TEXTS.lighthouse.missing(joinFr(short)) : '');
    // Trop cher : grisé mais cliquable (comme les outils), le clic ne fait que refuser doucement.
    this.elevateButton.classList.toggle('unaffordable', short.length > 0);
  }

  #closeLighthouse() {
    this.lighthousePanel.hidden = true;
  }

  // Fiche d'un bâtiment (voir `render`) : un bâtiment disparu ou une fiche sans données la referme.
  #renderCard(card) {
    if (this.cardPanel.hidden) return;
    if (!card || card.uid !== this.cardUid) {
      this.#closeCard();
      return;
    }
    const def = BUILDING_TYPES[card.type];
    const lines = [];
    if (card.cycle) {
      const { seconds, inputs, outputs } = card.cycle;
      const secs = String(Math.round(seconds * 10) / 10).replace('.', ',');
      lines.push(TEXTS.card.produces(joinFr(Object.entries(outputs).map(([r, n]) => amount(r, n))), secs));
      if (Object.keys(inputs).length) {
        lines.push(TEXTS.card.consumes(joinFr(Object.entries(inputs).map(([r, n]) => amount(r, n)))));
      }
    }
    const states = [];
    if (card.cycle) {
      states.push(card.paused ? TEXTS.card.paused(joinFr(Object.keys(card.cycle.inputs).map((r) => RESOURCE_TYPES[r].many)))
        : TEXTS.card.active);
      if (card.boosted) states.push(TEXTS.card.boosted(def.feminine));
    }
    if (card.aura) {
      const target = BUILDING_TYPES[card.aura.target];
      states.push(card.aura.n > 0
        ? TEXTS.card.aura(card.aura.n, target.name, target.plural, target.feminine)
        : TEXTS.card.noAura(target.name, target.feminine));
    }
    const key = [def.name, lines.join('|'), states.join('|')].join('#');
    if (key === this.cardKey) return;
    this.cardKey = key;
    this.cardTitle.textContent = def.name;
    this.cardRole.textContent = def.role || '';
    this.cardProduction.textContent = lines.join('\n');
    this.cardProduction.hidden = lines.length === 0;
    this.cardState.textContent = states.join(' · ');
    this.cardState.hidden = states.length === 0;
  }

  #closeCard() {
    this.cardPanel.hidden = true;
    this.cardUid = null;
  }

  // islands = { revealed, rallied: [id], cost: { relics } | null }. Un îlot rallié (ou plus
  // visible) referme son panneau. Trop cher : « Rallier » grisé mais cliquable (refus doux).
  #renderIsland(islands, resources) {
    if (this.islandPanel.hidden || !this.islandId) return;
    const isle = getIsland(this.islandId);
    if (!islands?.revealed || islands.rallied.includes(this.islandId) || !islands.cost) {
      this.#closeIsland();
      return;
    }
    const short = Object.entries(islands.cost)
      .filter(([res, n]) => (resources[res] ?? 0) < n)
      .map(([res, n]) => amount(res, n - (resources[res] ?? 0), { up: true }));
    const key = `${this.islandId}|${formatCost(islands.cost)}|${short.join()}`;
    if (key === this.islandKey) return;
    this.islandKey = key;
    this.islandTitle.textContent = isle.name;
    this.islandBlurb.textContent = isle.blurb;
    this.islandCost.textContent = TEXTS.island.cost(formatCost(islands.cost, { exact: true }))
      + (short.length ? TEXTS.island.missing(joinFr(short)) : TEXTS.island.ready);
    this.rallyButton.classList.toggle('unaffordable', short.length > 0);
  }

  #closeIsland() {
    this.islandPanel.hidden = true;
    this.islandId = null;
  }

  // Bandeau du but : titre, progression « 2 / 5 », fine barre (rien ne clignote).
  #renderObjective(goal) {
    const key = goal ? `${goal.chapter}:${goal.have}:${goal.target}` : '';
    if (key === this.objectiveKey) return;
    this.objectiveKey = key;
    this.objective.hidden = !goal;
    if (!goal) return;
    this.objectiveTitle.textContent = goal.title;
    this.objectiveCount.textContent = `${goal.have} / ${goal.target}`;
    this.objectiveBar.style.width = `${Math.round((100 * goal.have) / goal.target)}%`;
    this.objective.title = goal.label;
    this.objective.setAttribute('aria-label', `${goal.label} : ${goal.title}, ${goal.have} / ${goal.target}. ${HTML['objective.aria']}`);
  }

  // Chemin du Carnet : pastilles (accomplie / en cours / à venir / masquée), étape en cours, suivante, liste.
  #renderPath(path) {
    const { steps, hidden, chapter } = path;
    const pips = steps.map((st) => {
      const li = document.createElement('li');
      li.className = st.state;
      return li;
    });
    if (hidden) {
      const secret = document.createElement('li');
      secret.className = 'secret';
      pips.push(secret);
    }
    this.pathPips.replaceChildren(...pips);
    const label = (st) => (st.target > 1 ? `${st.label} (${st.have} / ${st.target})` : st.label);
    const now = steps.find((st) => st.state === 'now');
    const next = steps.find((st) => st.state === 'next');
    this.pathNow.textContent = now ? `${PATH_TEXTS.now} : ${label(now)}`
      : path.complete ? PATH_TEXTS.complete : PATH_TEXTS.hidden;
    this.pathNext.textContent = next ? `${PATH_TEXTS.next} : ${label(next)}` : '';
    this.pathNext.hidden = !next;
    const items = [];
    if (chapter === 2) items.push(this.#pathItem('done', PATH_TEXTS.previous));
    for (const st of steps) items.push(this.#pathItem(st.state, label(st)));
    if (hidden) items.push(this.#pathItem('secret', PATH_TEXTS.hidden));
    this.pathList.replaceChildren(...items);
  }

  #pathItem(state, text) {
    const li = document.createElement('li');
    li.className = state;
    li.textContent = text;
    return li;
  }

  // Petit point ambre sur un outil devenu disponible et jamais touché (ni posé) : fixe, sans clignotement.
  #renderToolSignal(type, tool, locked, offer) {
    const def = BALANCE.buildings[type];
    if (offer.owned > 0) this.#markToolSeen(type);
    const fresh = !locked && !offer.hidden && !offer.stage && Boolean(def.unlock) && !this.toolsSeen.has(type);
    tool.button.classList.toggle('new', fresh);
    if (fresh) tool.button.setAttribute('aria-label', `${BUILDING_TYPES[type].name} — ${NEW_TOOL}`);
    else tool.button.removeAttribute('aria-label');
  }

  #markToolSeen(type) {
    if (this.toolsSeen.has(type)) return;
    this.toolsSeen.add(type);
    writeSet(GUIDE_PREFS.tools, this.toolsSeen);
  }

  // Aide d'un compteur : à quoi elle sert, valeur exacte, ce qui la produit et la consomme (bâtiments visibles).
  #showCounterTip(id) {
    const counter = this.counters[id];
    const names = (pick) => BUILDING_ORDER
      .filter((type) => !this.offers[type]?.hidden && pick(BALANCE.buildings[type].production))
      .map((type) => BUILDING_TYPES[type].plural);
    const list = (items) => (items.length ? joinFr(items) : RESOURCE_HELP.texts.none);
    const T = RESOURCE_HELP.texts;
    const lines = [
      `${RESOURCE_TYPES[id].many} · ${T.exact(exact(counter.exact))}`,
      RESOURCE_HELP[id],
      `${T.producers} : ${list(names((p) => p?.outputs?.[id]))}`,
      `${T.consumers} : ${list(names((p) => p?.inputs?.[id]))}`,
    ];
    this.counterTip.replaceChildren(...lines.map((text, i) => {
      const p = document.createElement(i === 0 ? 'strong' : 'p');
      p.textContent = text;
      return p;
    }));
    this.counterTipFor = id;
    const box = counter.el.getBoundingClientRect();
    this.counterTip.hidden = false;
    this.counterTip.style.left = `${Math.max(8, Math.min(box.left, window.innerWidth - this.counterTip.offsetWidth - 8))}px`;
    this.counterTip.style.top = `${box.bottom + 6}px`;
  }

  #hideCounterTip() {
    this.counterTipFor = null;
    this.counterTip.hidden = true;
  }

  #updateToolHints() {
    const box = this.toolsBox;
    const rest = box.scrollWidth - box.clientWidth - box.scrollLeft;
    box.classList.toggle('more-left', box.scrollLeft > 1);
    box.classList.toggle('more-right', rest > 1);
  }

  // Une ligne discrète ; une nouvelle missive apparaît en douceur (pas au premier affichage).
  #renderReminder(missive) {
    const id = missive ? missive.id : null;
    if (id !== this.reminderId) {
      if (this.reminderId !== undefined && id) {
        this.reminder.classList.remove('fresh');
        void this.reminder.offsetWidth; // redémarre l'animation CSS
        this.reminder.classList.add('fresh');
      }
      this.reminderId = id;
      this.reminder.hidden = !missive;
      if (missive) {
        this.reminderShort.textContent = missive.short;
        this.reminder.title = missive.text;
      }
    }
    if (!missive) return;
    this.reminderCount.textContent = `${missive.have} / ${missive.target}`;
    this.reminder.setAttribute('aria-label', `${HTML['journal.missives']} : ${missive.text} ${missive.have} / ${missive.target}`);
  }

  get muted() {
    return this.soundToggle.getAttribute('aria-pressed') === 'true';
  }

  #renderSound(muted) {
    const label = muted ? TEXTS.options.soundUnmute : TEXTS.options.soundMute;
    this.soundToggle.setAttribute('aria-pressed', String(muted));
    this.soundToggle.setAttribute('aria-label', label);
    this.soundToggle.title = label;
    this.soundIcon.innerHTML = muted ? ICONS.soundOff : ICONS.soundOn;
    // Interrupteur des Options : pressé = son actif.
    this.optionsSound.setAttribute('aria-pressed', String(!muted));
    this.optionsSoundIcon.innerHTML = muted ? ICONS.soundOff : ICONS.soundOn;
    this.optionsSoundLabel.textContent = muted ? TEXTS.options.soundOff : TEXTS.options.soundOn;
    this.volume.classList.toggle('muted', muted);
  }

  // { choice, level, label, fps } : choix, niveau effectif et son libellé, compteur affiché.
  renderQuality(q) {
    this.quality = q;
    for (const button of this.qualityButtons) {
      button.setAttribute('aria-checked', String(button.dataset.choice === q.choice));
    }
    this.qualityNote.textContent = q.choice === 'auto' ? TEXTS.options.qualityAuto(q.label) : TEXTS.options.qualityFixed(q.label);
    this.fpsToggle.setAttribute('aria-pressed', String(Boolean(q.fps)));
    this.fpsLabel.textContent = q.fps === 'detail' ? TEXTS.options.fpsDetail
      : q.fps ? TEXTS.options.fpsOn : TEXTS.options.fpsOff;
    this.fpsCounter.hidden = !q.fps;
  }

  setFps(text) {
    if (!this.fpsCounter.hidden) this.fpsCounter.textContent = text;
  }

  #renderDay(frozen) {
    this.dayToggle.setAttribute('aria-pressed', String(frozen));
    this.dayLabel.textContent = frozen ? TEXTS.options.dayFrozen : TEXTS.options.dayCycle;
    this.dayIcon.innerHTML = frozen ? ICONS.dayFixed : ICONS.dayCycle;
  }

  #closeOptions() {
    this.optionsPanel.hidden = true;
    this.optionsButton.setAttribute('aria-expanded', 'false');
  }

  #closeJournal() {
    this.journalPanel.hidden = true;
    this.journalKey = null;
  }

  #openReset() {
    this.resetBackdrop.hidden = false;
    this.resetKeep.focus(); // choix sûr par défaut
  }

  #closeReset() {
    this.resetBackdrop.hidden = true;
  }
}
