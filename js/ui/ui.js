// Interface HTML par-dessus le canvas : compteurs de ressources, barre d'outils
// parchemin, bulle d'aide, Carnet et missives, panneau de retour et confirmation de nouvelle partie.
// Compteurs et outils sont générés depuis les registres (resources.js, catalog.js).
// Le module ne connaît ni la 3D ni la simulation : il émet des intentions
// (onSelect, onCancel, onReset, onJournalOpen, onElevate, onMute, onVolume) et affiche l'état qu'on lui donne.

import { RESOURCE_TYPES, RESOURCE_IDS, resourceLabel } from '../resources.js';
import { BUILDING_TYPES, BUILDING_ORDER } from '../buildings/catalog.js';
import { ICONS } from './icons.js';
import { FRAGMENTS } from '../story/fragments.js';
import { SAVE } from '../config.js';

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

const amount = (res, n) => `${Math.floor(n)} ${resourceLabel(res, n)}`;

function formatCost(cost) {
  const parts = Object.entries(cost || {}).map(([res, n]) => amount(res, n));
  return parts.length ? parts.join(', ') : 'Gratuit';
}

function formatLock(missing) {
  return 'Requiert ' + missing
    .map((m) => {
      if (m.kind === 'missives') return `${m.required} missives accomplies`;
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
  room: () => 'Gardons un carré libre de 2 x 2 cases : le Phare du Lac y prendra place.',
  unique: () => 'Il n\'y en aura qu\'un : il est déjà posé.',
  cost: (check, resources) => {
    const [res, n] = Object.entries(check.cost).find(([r, c]) => (resources[r] ?? 0) < c)
      || Object.entries(check.cost)[0];
    return `Pas encore assez de ${RESOURCE_TYPES[res].many} : il en faut ${n}.`;
  },
};

export class UI {
  constructor({ onSelect, onCancel, onReset, onJournalOpen, onElevate, sound, onMute, onVolume,
    dayFrozen, onDayFrozen }) {
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
    this.toolsBox = document.getElementById('tools');
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
        button.scrollIntoView({ block: 'nearest', inline: 'nearest' }); // outil à demi caché
        if (button.classList.contains('locked')) return;
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
    this.journalButton.addEventListener('click', () => {
      if (!this.journalPanel.hidden) {
        this.#closeJournal();
        return;
      }
      this.#closeOptions();
      this.#closeLighthouse();
      this.journalPanel.hidden = false;
      onJournalOpen(); // marque les fragments comme lus, puis re-rendu
    });
    document.getElementById('journal-close').addEventListener('click', () => this.#closeJournal());
    this.missiveText = document.getElementById('missive-text');
    this.missiveProgress = document.getElementById('missive-progress');

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

    // Options (non bloquant, comme le Carnet ; l'un ferme l'autre)
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
    return !this.resetBackdrop.hidden || !this.offlinePanel.hidden || !this.journalPanel.hidden
      || !this.optionsPanel.hidden || !this.lighthousePanel.hidden;
  }

  // Ouvre ou ferme les Options (bouton engrenage en jeu, bouton « Options » de l'écran titre).
  toggleOptions() {
    if (!this.optionsPanel.hidden) {
      this.#closeOptions();
      return;
    }
    this.#closeJournal();
    this.#closeLighthouse();
    this.optionsPanel.hidden = false;
    this.optionsButton.setAttribute('aria-expanded', 'true');
  }

  // Confirmation de nouvelle partie (Options, ou écran titre quand une sauvegarde existe).
  openReset() {
    this.#openReset();
  }

  // Ouvre le panneau du Phare (le contenu suit `state.lighthouse` à chaque rendu).
  openLighthouse() {
    this.#closeJournal();
    this.#closeOptions();
    this.lighthousePanel.hidden = false;
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
  //   placing: type | null, check, pointerType,
  //   journal: { unlocked: [id], unread: n, earned: { [res]: n },
  //              missive: { id, text, short, have, target } | null },
  //   lighthouse: { uid, stage, max, nextCost: { [res]: n } | null, percent } | null
  // }
  // Une offre peut porter `stage: { stage, max }` (bâtiment unique déjà posé).
  render({ resources, offers, placing, check, pointerType, journal, lighthouse }) {
    for (const id of RESOURCE_IDS) this.#renderCounter(id, resources[id] ?? 0);
    this.#renderJournal(journal);
    this.#renderLighthouse(lighthouse, resources);

    for (const [type, tool] of Object.entries(this.tools)) {
      const offer = offers[type];
      const locked = offer.missing.length > 0;
      const { button } = tool;
      button.setAttribute('aria-pressed', String(type === placing));
      button.classList.toggle('locked', locked);
      // Seul le verrouillage désactive le bouton : trop cher, il reste cliquable (aperçu refusé).
      button.setAttribute('aria-disabled', String(locked));
      tool.cost.textContent = locked ? formatLock(offer.missing)
        : offer.stage ? `Palier ${offer.stage.stage} / ${offer.stage.max}` : formatCost(offer.cost);
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

  #renderJournal({ unlocked, unread, earned, missive }) {
    const signal = unread > 0;
    this.journalButton.classList.toggle('unread', signal);
    this.journalButton.setAttribute('aria-label', signal ? 'Carnet — nouveau fragment' : 'Carnet');
    this.#renderReminder(missive);
    if (this.journalPanel.hidden) return;

    // Reconstruit la liste seulement si ce qui est affiché change.
    const progress = FRAGMENTS.map((f) => (f.missive ? 0 : Math.floor(earned[f.resource] ?? 0)));
    const key = `${unlocked.join()}|${progress.join()}|${missive ? `${missive.id}:${missive.have}` : ''}`;
    if (key === this.journalKey) return;
    this.journalKey = key;
    this.missiveText.textContent = missive
      ? missive.text
      : 'Aucune missive pour l\'instant. La société vous écrira quand elle aura besoin de vous.';
    this.missiveProgress.textContent = missive ? `${missive.have} / ${missive.target}` : '';
    this.missiveProgress.hidden = !missive;
    this.fragmentList.replaceChildren(...FRAGMENTS.map((f, i) => {
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
          p.textContent = 'Encre effacée · se révèle avec une missive accomplie';
        } else {
          const have = Math.min(progress[i], f.threshold);
          p.textContent = `Encre effacée · se révèle à ${amount(f.resource, f.threshold)} cumulés (${have} / ${f.threshold})`;
        }
        li.append(ink, p);
      }
      return li;
    }));
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
    this.lighthouseStage.textContent = `Palier ${lh.stage} / ${lh.max} · ${names[lh.stage - 1]}`;
    this.lighthouseEffect.textContent = `Bibliothèques : +${lh.percent} % de Savoirs`;
    this.elevateButton.hidden = complete;
    if (complete) {
      this.lighthouseNext.textContent = 'La lanterne veille sur le lac.';
      return;
    }
    const short = Object.entries(lh.nextCost)
      .filter(([res, n]) => (resources[res] ?? 0) < n)
      .map(([res, n]) => amount(res, Math.ceil(n - (resources[res] ?? 0))));
    this.lighthouseNext.textContent = `Prochain palier : ${names[lh.stage]} · ${formatCost(lh.nextCost)}`
      + (short.length ? `\nIl manque encore ${joinFr(short)}.` : '');
    // Trop cher : grisé mais cliquable (comme les outils), le clic ne fait que refuser doucement.
    this.elevateButton.classList.toggle('unaffordable', short.length > 0);
  }

  #closeLighthouse() {
    this.lighthousePanel.hidden = true;
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
    this.reminder.setAttribute('aria-label', `Missive : ${missive.text} ${missive.have} sur ${missive.target}`);
  }

  get muted() {
    return this.soundToggle.getAttribute('aria-pressed') === 'true';
  }

  #renderSound(muted) {
    const label = muted ? 'Remettre le son' : 'Couper le son';
    this.soundToggle.setAttribute('aria-pressed', String(muted));
    this.soundToggle.setAttribute('aria-label', label);
    this.soundToggle.title = label;
    this.soundIcon.innerHTML = muted ? ICONS.soundOff : ICONS.soundOn;
    // Interrupteur des Options : pressé = son actif.
    this.optionsSound.setAttribute('aria-pressed', String(!muted));
    this.optionsSoundIcon.innerHTML = muted ? ICONS.soundOff : ICONS.soundOn;
    this.optionsSoundLabel.textContent = muted ? 'Son coupé' : 'Son actif';
    this.volume.classList.toggle('muted', muted);
  }

  #renderDay(frozen) {
    this.dayToggle.setAttribute('aria-pressed', String(frozen));
    this.dayLabel.textContent = frozen ? 'Heure figée sur l\'après-midi' : 'Le jour et la nuit passent';
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
