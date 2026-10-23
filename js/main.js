// Point d'entrée : assemble rendu, grille, bâtiments, simulation, caméra,
// contrôles et UI. Boucle : la simulation avance à pas fixe, le rendu suit.

import * as THREE from 'three';
import { PALETTE, SAVE, QUALITY, CAMERA } from './config.js';
import { BALANCE } from './balance.js';
import { PixelRenderer } from './render/renderer.js';
import { createLighting, applyDay, applyBeacon, applyQuality, setShadowReach } from './render/lighting.js';
import { IslandViews } from './render/islands.js';
import { QualityManager } from './render/quality.js';
import { setNightGlow, setLanternLit } from './buildings/models.js';
import { DayCycle } from './world/daycycle.js';
import { IsoCamera } from './render/camera.js';
import { Grid } from './grid/grid.js';
import { TileHighlight } from './grid/highlight.js';
import { AuraPreview } from './grid/aura.js';
import { ValidMarks } from './grid/valid.js';
import { BuildingManager } from './buildings/buildings.js';
import { Placement } from './buildings/placement.js';
import { BUILDING_ORDER, getBuildingType, heightOf } from './buildings/catalog.js';
import { RESOURCE_TYPES, resourceLabel } from './resources.js';
import { Simulation, productionOf, levelOf, maxLevelOf } from './sim/simulation.js';
import { autoSpot, flowPerMinute, upgradeTarget } from './sim/autoplace.js';
import { EcoScreen, readEcoPref, writeEcoPref, autoRefusal } from './ui/eco.js';
import { getIsland } from './world/islands.js';
import { Sparks, BellWaves, Dust } from './render/effects.js';
import { TEXTS } from './story/texts.js';
import { Visitors } from './render/visitors.js';
import { Lake } from './render/lake.js';
import { Controls } from './input/controls.js';
import { UI } from './ui/ui.js';
import { feel } from './ui/feel.js';
import { SaveManager } from './save/save.js';
import { describeSave, formatAgo, encodeCode, readImport } from './save/backup.js';
import { formatDuration } from './story/ending.js';
import { Journal, missiveProgress } from './story/journal.js';
import { FRAGMENTS } from './story/fragments.js';
import { SoundScape } from './audio/audio.js';
import { TitleScreen } from './ui/title.js';
import { EndingScreen } from './ui/ending.js';
import { LighthouseBeam } from './render/beam.js';
import { Progress } from './story/progress.js';
import { goalOf, buildPath } from './story/path.js';
import { CHAPTER_LETTERS } from './story/guide.js';
import { GUIDE_PREFS, readPref, writePref, resetGuidePrefs } from './ui/prefs.js';

const container = document.getElementById('game');
const pixel = new PixelRenderer(container);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.slate);

const grid = new Grid();
scene.add(grid.mesh);
const lighting = createLighting(scene, grid.size);
const lake = new Lake(scene, grid); // décor au bord du domaine : ni simulation ni sauvegarde
const islands = new IslandViews(scene, grid); // îlots du lac (chapitre II) : rendu seul, état lu sur la simulation

const highlight = new TileHighlight(grid);
scene.add(highlight.mesh);

const buildings = new BuildingManager(grid, scene);
const journal = new Journal();
// Déblocages : le Phare avec les missives, le chapitre II (Embarcadère) une fois la fin vue.
const story = { get missives() { return journal.missives; }, get finished() { return progress.finished; } };
const sim = new Simulation(buildings, story);
const sparks = new Sparks(scene);
const waves = new BellWaves(scene); // ondes de la Cloche
const dust = new Dust(scene);       // poussière des poses
const visitors = new Visitors(scene, grid.half, lake.region); // Visiteurs du lac : délai compté en jeu actif seulement
const day = new DayCycle();      // heure du domaine : ne lit que l'horloge, jamais la simulation
const progress = new Progress(); // durée de jeu active, fin de partie vue
const beam = new LighthouseBeam(scene);
const saver = new SaveManager({ sim, buildings, journal, day, progress });
const sound = new SoundScape(); // muet jusqu'au premier geste du joueur

// Qualité graphique : reflets, ondulation, ombres, clapotis, lumières de nuit (jamais la résolution).
const quality = new QualityManager({ onChange: () => setQuality() });
function setQuality() {
  const q = quality.settings;
  pixel.setShadows(q.shadows);
  lake.setQuality(q);
  islands.setQuality(q);
  applyQuality(lighting, q);
  sound.setLapRate(q.laps);
  ui?.renderQuality(qualityState());
}
const qualityState = () => ({ choice: quality.choice, level: quality.level, label: quality.settings.label,
  fps: quality.showFps });

// Chargement : sauvegarde valide → reprise ; absente ou illisible → nouvelle partie.
// L'écran titre s'affiche d'abord : la simulation est figée et rien n'est écrit tant que le
// joueur n'a pas choisi (sinon `savedAt` avancerait sans la production de l'absence).
// L'absence est créditée à « Continuer » (Date.now() − savedAt couvre aussi le temps du titre).
const loaded = saver.load();
saver.enabled = false;
let playing = false;
buildings.syncViews(sim.boosts()); // ouvertures éteintes en pause, lueur des renforcés
// Paliers atteints par migration ; missives déjà remplies accomplies d'office (sauvé au départ).
journal.update(sim.earned, sim);

// « Nouvelle partie » efface puis recharge la page : ce drapeau de session ouvre alors
// directement la lettre d'introduction au lieu du menu.
const INTRO_FLAG = `${SAVE.storageKey}:intro`;
function takeIntroFlag() {
  try {
    const set = window.sessionStorage.getItem(INTRO_FLAG) === '1';
    window.sessionStorage.removeItem(INTRO_FLAG);
    return set;
  } catch {
    return false;
  }
}

// Crédite une absence et renvoie ce qu'il faut annoncer (ou null).
function creditOffline(seconds) {
  if (!(seconds > 0)) return null;
  const result = sim.applyOffline(seconds);
  saver.save(); // l'état « rattrapé » devient la nouvelle référence (pas de double comptage)
  const anything = Object.values(result.produced)
    .some((outputs) => Object.values(outputs).some((n) => Math.floor(n) > 0));
  if (anything && seconds >= BALANCE.offline.noticeMinSeconds) return result;
  return null;
}

function announceOffline(result) {
  if (!result || !ui) return;
  const counts = {};
  for (const type of BUILDING_ORDER) counts[type] = sim.countOf(type);
  ui.showOfflineGain(result.produced, counts);
}

const iso = new IsoCamera({ groundY: grid.topY, halfExtent: grid.half });

function resize() {
  const { width, height } = pixel.resize();
  iso.setViewport(width, height);
}
resize();
iso.setZoom(iso.fitZoom(grid.size));
iso.update();

// Îlots : silhouettes dans la brume après la 3e missive du chapitre II, puis ralliés un à un.
// Les îlots ralliés élargissent les limites de la caméra et l'étendue des ombres.
function syncIslands(instant = false) {
  islands.sync(sim.islandsRevealed(), sim.islands, instant);
  iso.setBounds(grid.worldBounds());
  setShadowReach(lighting, grid.size, grid.reach());
}
syncIslands(true);

const groundUnder = (ndc) => iso.groundAt(ndc.x, ndc.y);

let controls = null;
let ui = null;

// Le Phare du Lac : grand chantier unique, élevé palier par palier depuis son panneau.
const LIGHTHOUSE = 'lighthouse';
const lighthouseRecord = () => buildings.records.find((r) => r.type === LIGHTHOUSE) || null;

function lighthouseState() {
  const record = lighthouseRecord();
  if (!record) return null;
  return {
    uid: record.uid,
    stage: record.stage,
    max: BALANCE.buildings[LIGHTHOUSE].stages.length,
    nextCost: sim.nextStageCost(record.uid),
    percent: Math.round((sim.stageMultiplier('library') - 1) * 100),
  };
}

// Bâtiment unique déjà posé : son outil ouvre son panneau au lieu de la pose.
const isUniqueBuilt = (type) => BALANCE.buildings[type].unique && sim.countOf(type) > 0;

function refreshUI() {
  if (!ui) return;
  uiDirty = false;
  if (controls) controls.aimWithTouch = placement.active;
  const offers = {};
  for (const type of BUILDING_ORDER) {
    offers[type] = {
      cost: sim.costOf(type),
      affordable: sim.canAfford(type),
      missing: sim.missingUnlocks(type),
      owned: sim.countOf(type),
    };
    // Chapitre II : outil absent de la barre tant que la fin n'a pas été vue (pas de cadenas qui dévoile).
    if (BALANCE.buildings[type].unlock?.finished && !progress.finished) offers[type].hidden = true;
    const record = isUniqueBuilt(type) && buildings.records.find((r) => r.type === type);
    if (record?.stage) offers[type].stage = { stage: record.stage, max: BALANCE.buildings[type].stages.length };
  }
  // Une missive du chapitre II n'est proposée qu'après la séquence de fin.
  const current = journal.currentMissive;
  const missive = current && (!current.chapter || progress.finished)
    ? { ...current, ...missiveProgress(current, sim) } : null;
  // Compteur caché tant que le bâtiment qui produit la ressource n'est pas débloqué.
  const hiddenResources = Object.values(RESOURCE_TYPES)
    .filter((r) => r.revealWith && !sim.isUnlocked(r.revealWith) && !(sim.earned[r.id] > 0)).map((r) => r.id);
  const lighthouse = lighthouseState();
  const goal = goalOf(progress.finished, sim, journal.missives);
  const isles = { revealed: sim.islandsRevealed(), rallied: sim.islands, cost: sim.islandCost() };
  ui.render({
    resources: sim.resources,
    offers,
    placing: placement.type,
    moving: placement.moving !== null,
    effect: placement.effect,
    card: cardState(),
    check: placement.check,
    pointerType: controls ? controls.lastPointerType : 'mouse',
    journal: { unlocked: journal.unlocked, unread: journal.unread.size, earned: sim.earned, missive,
      finished: progress.finished, goal, path: buildPath(progress.finished, sim, journal.missives) },
    lighthouse,
    islands: isles,
    hiddenResources,
  });
  if (!eco) return;
  ecoRenderedAt = performance.now() / 1000;
  ecoScreen.render({ resources: sim.resources, flow: flowPerMinute(sim), hiddenResources, offers, owned: ownedBuildings(),
    lighthouse, islands: isles, missive, goal, unread: journal.unread.size, visitor: ecoVisitor });
}

// Données de la fiche ouverte (bâtiment posé, hors Phare) : production d'un cycle, état, renfort.
function cardState() {
  const record = ui?.cardUid != null ? buildings.get(ui.cardUid) : null;
  if (!record) return null;
  const card = { uid: record.uid, type: record.type, cycle: sim.cycleOf(record.uid) };
  if (card.cycle) {
    card.paused = Boolean(record.paused);
    card.boosted = sim.boosts().has(record.uid);
    card.saved = sim.savings().has(record.uid);
  }
  const rules = BALANCE.buildings[record.type];
  const aura = rules.aura ?? rules.efficiency;
  if (aura) {
    card.aura = { n: sim.wouldBoost(record.type, record.x, record.z, levelOf(record)).length, target: aura.targets[0],
      kind: rules.aura ? 'boost' : 'saving' };
  }
  if (rules.bell) card.bell = sim.bellState(record.uid);
  if (BALANCE.buildings[record.type].upgrade) {
    card.upgrade = { level: levelOf(record), max: maxLevelOf(record.type), cost: sim.upgradeCost(record.uid) };
  }
  return card;
}

// « Déplacer » (fiche ou panneau du Phare) : le bâtiment est soulevé, son aperçu part de sa place.
function moveBuilding(uid) {
  const record = buildings.get(uid);
  if (!record || eco || ending.active) return;
  ui.closeAll();
  highlight.set(null);
  placement.startMove(record);
  placement.aim(grid.tileCenter(record.x, record.z, new THREE.Vector3()));
}

// Bâtiments possédés par type (le Phare a sa propre section) : en activité / en pause, ou renforts.
function ownedBuildings() {
  const boosts = sim.boosts();
  return BUILDING_ORDER.filter((type) => type !== LIGHTHOUSE).map((type) => {
    const list = buildings.records.filter((r) => r.type === type);
    if (!list.length) return null;
    const owned = { type, count: list.length };
    const aura = BALANCE.buildings[type].aura;
    const efficiency = BALANCE.buildings[type].efficiency;
    if (BALANCE.buildings[type].upgrade) {
      owned.levels = Array.from({ length: maxLevelOf(type) }, (_, i) => list.filter((r) => levelOf(r) === i + 1).length);
      const next = upgradeTarget(sim, type);
      owned.upgrade = next.ok || next.reason === 'cost'
        ? { uid: next.uid, level: next.level, cost: next.cost, affordable: next.ok } : null;
    }
    if (productionOf(type)) {
      owned.paused = list.filter((r) => r.paused).length;
      owned.active = owned.count - owned.paused;
    } else if (aura) {
      owned.boosted = buildings.records.filter((r) => aura.targets.includes(r.type) && boosts.has(r.uid)).length;
    } else if (efficiency) {
      owned.saved = list.length ? sim.savedCountOf(efficiency.targets[0]) : 0;
      owned.savedType = efficiency.targets[0];
    } else if (BALANCE.buildings[type].bell) {
      owned.bells = list.map((r) => ({ uid: r.uid, ...sim.bellState(r.uid) }));
    }
    return owned;
  }).filter(Boolean);
}

const aura = new AuraPreview(grid, scene);
const marks = new ValidMarks(grid, scene); // cases valides pendant la pose et le déplacement
const placement = new Placement({ scene, grid, rules: sim, buildings, highlight, aura, marks, onChange: refreshUI });

// Ouvertures allumées qui peuvent se refléter dans le lac (recalculé à chaque notification
// de la simulation : poses et pauses). Le Phare se reflète par sa lanterne.
let lakeLights = [];
function refreshLakeLights() {
  lakeLights = [];
  for (const record of buildings.records) {
    const view = buildings.views.get(record.uid);
    if (!view || record.type === LIGHTHOUSE) continue;
    lakeLights.push({ x: view.position.x, z: view.position.z, strength: record.paused ? 0 : 1 });
  }
}
refreshLakeLights();

// Ressources, bâtiments ou pauses changés : l'aperçu peut devenir possible ou
// impossible, et les ouvertures des producteurs s'allument ou s'éteignent.
// Un palier du Carnet atteint ou une missive accomplie : simple signal sur le bouton
// (lu d'office si le Carnet est ouvert), la missive suivante remplace la précédente.
// Mode économie d'énergie : la scène n'est pas tenue à jour (resynchronisée au retour) et
// l'interface est redessinée au plus 2 fois par seconde (boucle).
sim.subscribe(() => {
  const fresh = journal.update(sim.earned, sim);
  if (fresh.length) {
    // Révélation finale (Phare achevé) : phrase plus longue ; sinon la phrase habituelle.
    const revealed = FRAGMENTS.filter((f) => fresh.includes(f.id));
    if (revealed.some((f) => f.finale)) sound.playFinale();
    else if (!revealed.every((f) => f.island)) sound.playReveal(); // îlot rallié : sa propre phrase
    if (ui?.journalOpen) journal.markAllRead();
    if (playing) feel.buzz('missive');
    saver.save();
  }
  if (eco) sceneStale = true;
  else syncScene();
  if (playing && lighthouseComplete() && !progress.finished) startEnding(); // après le fragment final
  if (eco) {
    uiDirty = true;
    return;
  }
  placement.refresh();
  watchFirsts();
  refreshUI();
});

// Conseils de premier contact : déclenchés par un passage de 0 à 1 (jamais par l'état d'une partie chargée).
const countsNow = () => ({
  total: buildings.records.length,
  observatory: sim.countOf('observatory'),
  sanctuary: sim.countOf('sanctuary'),
  scriptorium: sim.countOf('scriptorium'),
  bell: sim.countOf('bell'),
  paused: buildings.records.filter((r) => r.paused).length,
});
let firsts = countsNow();
function tip(id) {
  if (playing && !ending.active && !eco) ui.tips.show(id);
}
function watchFirsts() {
  const before = firsts;
  firsts = countsNow();
  if (before.total === 0 && firsts.total > 0) tip('place');
  if (before.observatory === 0 && firsts.observatory > 0) tip('observatory');
  if (before.sanctuary === 0 && firsts.sanctuary > 0) tip('sanctuary');
  if (before.scriptorium === 0 && firsts.scriptorium > 0) tip('scriptorium');
  if (before.bell === 0 && firsts.bell > 0) tip('bell');
  if (before.paused === 0 && firsts.paused > 0) tip('pause');
}

// Lettre qui ouvre le chapitre II : une fois à la fin de la séquence, et pour une partie déjà
// terminée qui ne l'a pas encore lue.
function showChapterLetter() {
  writePref(GUIDE_PREFS.chapterLetter, '1');
  ui.showChapterLetter(CHAPTER_LETTERS[2]);
}

function syncScene(instant = false) {
  buildings.syncViews(sim.boosts());
  refreshLakeLights();
  syncIslands(instant);
}

ui = new UI({
  onSelect: (type) => {
    if (isUniqueBuilt(type)) {
      placement.cancel();
      ui.openLighthouse();
      refreshUI();
      return;
    }
    placement.start(type);
    placement.aim(groundUnder({ x: 0, y: 0 })); // aperçu au centre de la vue
  },
  onCancel: () => placement.cancel(),
  onJournalOpen: () => {
    if (journal.markAllRead()) saver.save();
    refreshUI();
  },
  onElevate: elevate,
  onRally: rally,
  onMove: moveBuilding,
  onUpgrade: upgradeBuilding,
  onRing: ringBell,
  onReset: () => {
    saver.wipe();             // efface et bloque toute écriture (pagehide compris)
    resetGuidePrefs();        // conseils, signaux d'outils et lettre du chapitre II reviennent
    try {
      window.sessionStorage.setItem(INTRO_FLAG, '1');
    } catch {
      /* sans drapeau : le menu titre propose « Nouvelle partie » */
    }
    window.location.reload(); // repart d'un état propre : aucune sauvegarde → nouvelle partie
  },
  sound: { muted: sound.muted, volume: sound.volume },
  onMute: (muted) => sound.setMuted(muted),
  onVolume: (volume) => sound.setVolume(volume),
  dayFrozen: day.frozen,
  onDayFrozen: (frozen) => day.setFrozen(frozen),
  onReread: () => endingScreen.showLetter({ reread: true }),
  quality: qualityState(),
  onQuality: (choice) => {
    quality.setChoice(choice);
    ui.renderQuality(qualityState());
  },
  onShowFps: (on) => quality.setShowFps(on),
  eco: readEcoPref(),
  onEco: (on) => setEco(on),
  saves: {
    exportText: () => saver.exportText(),
    exportCode: () => encodeCode(saver.exportText()),
    copies: () => saver.backups.described(),
    read: (input) => {
      const { data, text } = readImport(input);
      return { text, info: describeSave(data) };
    },
    replace: (text) => {
      if (!saver.replaceWith(readImport(text).text)) return false; // validé une seconde fois, normalisé
      window.location.reload(); // repart d'un état propre, comme « Nouvelle partie »
      return true;
    },
    timeOf: formatDuration,
    agoOf: (savedAt) => formatAgo(Date.now() - savedAt),
    dateOf: (savedAt) => new Date(savedAt).toLocaleString('fr-FR',
      { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
  },
});

// ----- Retours d'action (décoratifs : jamais d'effet sur la simulation) -----
// Ce que l'action a dépensé, d'après les ressources avant / après (les producteurs ne passent pas par là).
function spentSince(before) {
  const out = {};
  for (const [res, n] of Object.entries(before)) {
    const d = n - (sim.resources[res] ?? 0);
    if (d > 0.5) out[res] = d;
  }
  return out;
}

// Refus : son sourd, vibration, le bouton (ou l'aperçu) oscille doucement.
function refuse(button = null, preview = false) {
  sound.playRefuse();
  feel.buzz('refuse');
  if (button) ui.nudge(button);
  if (preview && !feel.reduced) placement.nudge();
}

// Pose ou reposée : vibration et petit nuage de poussière au pied du bâtiment (moins dense en qualité Basse).
const dustPos = new THREE.Vector3();
function landFeedback(record) {
  feel.buzz('place');
  const view = !eco && buildings.views.get(record.uid);
  if (!view) return;
  const { w, d } = getBuildingType(record.type).footprint;
  dust.puff(dustPos.copy(view.position), Math.max(w, d) * 0.5 + 0.1, quality.settings.puffs, feel.reduced);
}

function elevate(uid) {
  const before = { ...sim.resources };
  if (sim.elevate(uid).ok) {
    saver.save(); // le fragment du palier joue sa phrase (abonnement)
    ui.spent(spentSince(before));
    ui.glintObjective();
  } else refuse(ui.elevateButton);
  if (eco) refreshUI();
}

// Fait sonner une Cloche chargée (fiche, toucher, écran d'économie) : la simulation lance la sonnerie,
// puis cloche de bronze et ondes jusqu'à la portée. Pas prête : refus doux.
const bellPos = new THREE.Vector3();
function ringBell(uid) {
  const record = buildings.get(uid);
  const result = record ? sim.ring(uid) : { ok: false };
  if (!result.ok) {
    if (result.reason !== 'ringing') refuse(ui.ringButton);
    if (eco) refreshUI();
    return false;
  }
  saver.save();
  sound.playBell();
  if (eco) {
    ecoScreen.say(TEXTS.eco.rung);
    refreshUI();
    return true;
  }
  const view = buildings.views.get(uid);
  if (view) waves.ring(bellPos.copy(view.position), result.radius);
  return true;
}

// « Améliorer » (fiche ou écran d'économie) : paiement, nouveau modèle (reconstruit par syncViews),
// petite gerbe d'étincelles et phrase sonore.
function upgradeBuilding(uid) {
  const record = buildings.get(uid);
  const before = { ...sim.resources };
  const result = record ? sim.upgrade(uid) : { ok: false };
  if (!result.ok) {
    refuse(ui.upgradeButton);
    if (eco) refreshUI();
    return;
  }
  saver.save();
  ui.spent(spentSince(before));
  sound.playUpgrade(result.level);
  if (eco) {
    ecoScreen.say(`${getBuildingType(record.type).name} : niveau ${result.level}.`);
    refreshUI();
    return;
  }
  const view = buildings.views.get(uid);
  if (view) {
    const top = view.position.y + heightOf(record) + 0.1;
    for (let i = 0; i < 2 + result.level; i++) {
      const a = (i / (2 + result.level)) * Math.PI * 2;
      sparks.spawn(sparkPos.set(view.position.x + Math.cos(a) * 0.45, top + (i % 2) * 0.25, view.position.z + Math.sin(a) * 0.45), 'star');
    }
  }
  refreshUI();
}

function rally(id) {
  // La brume se lève, la passerelle se construit (abonnement → syncIslands), le fragment se révèle.
  const before = { ...sim.resources };
  if (sim.rallyIsland(id).ok) {
    saver.save();
    sound.playRally();
    ui.spent(spentSince(before));
  } else refuse(ui.rallyButton);
  if (eco) refreshUI();
}

// ----- Mode économie d'énergie -----
// Plus aucune image dessinée (canvas masqué), interface à 2 Hz au plus, nappe et lac coupés.
// La simulation, les sauvegardes et le délai des Visiteurs continuent à l'identique.
// Au titre, seule la préférence change : elle s'applique au départ de la partie.
let eco = false;
let uiDirty = false;
let ecoRenderedAt = 0;
let ecoVisitor = false;  // Visiteur du lac attrapable (ligne à toucher)
let sceneStale = false;  // scène à resynchroniser au retour
const ECO_UI_SECONDS = 0.5;

const ecoScreen = new EcoScreen({
  onBuy: buyAuto,
  onElevate: elevate,
  onUpgrade: upgradeBuilding,
  onRing: ringBell,
  onRally: rally,
  onVisitor: (rect) => {
    if (visitors.catchable) giveVisitorGift(rect.left + rect.width / 2, rect.top);
  },
  onJournal: () => ui.toggleJournal(),
  onOptions: () => ui.toggleOptions(),
  onLeave: () => setEco(false),
});

function setEco(on) {
  on = Boolean(on) && !ending.active; // la séquence de fin garde la scène
  writeEcoPref(on);
  ui.renderEco(on);
  if (!playing || on === eco) return;
  eco = on;
  document.body.classList.toggle('eco-mode', on);
  ecoScreen.shown = on;
  sound.setAmbience(!on);
  if (on) ui.tips.pause();
  else ui.tips.resume();
  if (on) {
    placement.cancel();
    highlight.set(null);
    ui.closeAll();
  } else {
    // La scène réapparaît à jour : vues, îlots sans animation, apparitions terminées ; caméra intacte.
    if (sceneStale) syncScene(true);
    sceneStale = false;
    buildings.update(1);
    lastRender = -Infinity;
    lastInput = performance.now() / 1000;
  }
  refreshUI();
}

// Achat depuis l'écran : pose automatique sur une case valide, ou refus expliqué.
function buyAuto(type) {
  const spot = autoSpot(sim, grid, type);
  const before = { ...sim.resources };
  const record = spot.ok && sim.placeBuilding(type, spot.x, spot.z);
  if (record) {
    saver.save();
    sound.playPlace();
    feel.buzz('place');
    ui.spent(spentSince(before));
    const zone = grid.zoneAt(record.x, record.z);
    const isle = zone && getIsland(zone.id);
    const where = isle ? `sur ${isle.name[0].toLowerCase()}${isle.name.slice(1)}` : 'sur le domaine';
    ecoScreen.say(`Nouvelle construction : ${getBuildingType(type).name}, ${where}.`);
  } else {
    refuse();
    ecoScreen.say(autoRefusal(spot.ok ? sim.canPlace(type, spot.x, spot.z) : spot, sim.resources));
  }
  refreshUI();
}
setQuality();
refreshUI();
feel.onMotion((reduced) => { buildings.reduceMotion = reduced; });
// Bouton de l'interface : froissement de papier / frôlement de plume (pas pour un bouton grisé ou verrouillé).
document.addEventListener('click', (e) => {
  const button = e.target.closest?.('button');
  if (button && !button.disabled && button.getAttribute('aria-disabled') !== 'true') sound.playClick();
}, true);

// Écran titre : la scène tourne lentement derrière (cycle jour/nuit compris). Le premier
// clic démarre aussi l'audio (SoundScape écoute tout geste de la page).
const TITLE_ORBIT_SPEED = (2 * Math.PI) / 150; // un tour en 2 min 30
let orbit = 0;

function startGame(continuing) {
  title.leave(() => {
    // Sous le voile : vue de jeu fixe, puis l'absence est créditée et l'état sauvé.
    orbit = 0;
    iso.setOrbit(0);
    iso.target.set(0, grid.topY, 0);
    iso.setZoom(iso.fitZoom(grid.size));
    iso.stop();
    saver.enabled = true;
    playing = true;
    clock.getDelta(); // le temps passé sur le titre n'entre pas dans sim.advance
    const offline = continuing ? creditOffline((Date.now() - loaded.savedAt) / 1000) : null;
    if (journal.update(sim.earned, sim).length) refreshUI();
    saver.save();
    firsts = countsNow(); // l'absence créditée ne déclenche aucun conseil
    if (readEcoPref()) setEco(true);
    refreshUI();
    // Panneau de retour une fois le jeu révélé.
    if (offline) setTimeout(() => announceOffline(offline), 500);
  }, () => {
    // Phare achevé sans fin vue (partie migrée, page fermée pendant la séquence) : on la joue.
    if (lighthouseComplete() && !progress.finished) startEnding();
    else if (progress.finished && readPref(GUIDE_PREFS.chapterLetter) !== '1') showChapterLetter();
  });
}

// ----- Séquence de fin (Phare achevé, après le fragment final) -----
// La caméra glisse vers le Phare pendant que la nuit tombe, la lanterne s'allume et son
// faisceau balaie le lac, puis viennent la dernière lettre, le générique et le résumé.
// Échap ou « Passer » y mettent fin à tout moment. Ensuite : mode libre, la nuit se lève
// et le cycle reprend ; la séquence ne se rejoue pas (progress.finished, sauvegardé).
const ENDING_TIMES = { glide: 5, light: 5.5, letter: 12.5 }; // secondes depuis le début
const lighthouseComplete = () => {
  const record = lighthouseRecord();
  return Boolean(record) && record.stage >= BALANCE.buildings[LIGHTHOUSE].stages.length;
};
const ending = { active: false, t: 0, letterShown: false, from: new THREE.Vector3(), to: new THREE.Vector3(), zoomFrom: 1, zoomTo: 1 };
const smoothstep = (t) => t * t * (3 - 2 * t);

function startEnding() {
  if (ending.active || progress.finished) return;
  setEco(false); // la séquence se joue dans la scène
  const record = lighthouseRecord();
  Object.assign(ending, { active: true, t: 0, letterShown: false, zoomFrom: iso.zoom });
  iso.stop(); // plus de glisse ni de zoom en cours : la séquence pilote la caméra
  ending.from.copy(iso.target);
  grid.tileCenter(record.x, record.z, ending.to).add(new THREE.Vector3(0.5, 0, 0.5)); // centre de l'emprise 2x2
  ending.zoomTo = Math.max(iso.zoom, Math.min(iso.fitZoom(grid.size) * 1.9, 2.2));
  placement.cancel();
  highlight.set(null);
  ui.closeAll();
  ui.tips.pause();
  controls.enabled = false;
  document.body.classList.add('ending-mode');
  day.holdNight(true);
  endingScreen.start({
    playSeconds: progress.playSeconds,
    buildings: buildings.records.length,
    knowledge: sim.earned.knowledge ?? 0,
    omens: sim.earned.omens ?? 0,
    visitors: sim.visitors,
  });
}

function finishEnding() {
  if (!ending.active) return;
  ending.active = false;
  progress.finished = true;
  saver.save();
  setLanternLit(buildings.views.get(lighthouseRecord()?.uid), true);
  endingScreen.hide();
  day.holdNight(false); // la nuit se lève doucement, le cycle reprend
  controls.enabled = true;
  document.body.classList.remove('ending-mode');
  refreshUI();
  ui.tips.resume();
  showChapterLetter();
}

function updateEnding(dt) {
  ending.t += dt;
  const k = smoothstep(Math.min(1, ending.t / ENDING_TIMES.glide));
  iso.target.lerpVectors(ending.from, ending.to, k);
  iso.setZoom(ending.zoomFrom + (ending.zoomTo - ending.zoomFrom) * k);
  setLanternLit(buildings.views.get(lighthouseRecord()?.uid), ending.t >= ENDING_TIMES.light);
  if (!ending.letterShown && ending.t >= ENDING_TIMES.letter) {
    ending.letterShown = true;
    endingScreen.showLetter();
  }
}

// Lanterne et faisceau pendant la séquence : 0 avant l'allumage, puis montée douce.
const lanternRise = () => (ending.active
  ? smoothstep(Math.min(1, Math.max(0, (ending.t - ENDING_TIMES.light) / 2))) : 1);

const endingScreen = new EndingScreen({ onSkip: finishEnding, onStay: finishEnding });

const title = new TitleScreen({
  onContinue: () => startGame(true),
  onNewGame: () => {
    if (loaded.status === 'loaded') ui.openReset(); // confirmation existante → lettre après rechargement
    else title.showLetter();
  },
  onOptions: () => ui.toggleOptions(),
  onAccept: () => startGame(false),
});
if (takeIntroFlag() && loaded.status !== 'loaded') title.showLetter();
else if (loaded.status === 'loaded') {
  title.showMenu({
    ...loaded.info,
    time: formatDuration(loaded.info.playSeconds),
    ago: formatAgo(Date.now() - loaded.savedAt),
    finished: progress.finished,
  });
} else title.showMenu(null);

controls = new Controls(pixel.canvas, iso, {
  onHover: (ndc) => {
    if (ending.active) return;
    pixel.canvas.classList.toggle('over-visitor', playing && (visitors.hit(ndc, iso.camera, canvasRect())
      || (!placement.active && islands.pick(groundUnder(ndc)) !== null)));
    if (placement.active) placement.aim(groundUnder(ndc));
    else highlight.set(grid.tileAtWorld(groundUnder(ndc)));
  },
  onAim: (ndc) => placement.aim(groundUnder(ndc)),
  onAimEnd: () => placement.arm(), // doigt levé après avoir visé : un tap sur cette case pose
  onTap: (ndc, pointerType, button) => {
    if (button === 2) {
      placement.cancel();
      return;
    }
    if (playing && catchVisitor(ndc)) return; // le visiteur passe avant la pose et la sélection
    if (placement.active) {
      const point = groundUnder(ndc);
      // Tactile : le premier tap montre l'aperçu, un second tap sur la même case pose (pas de pose accidentelle).
      if (pointerType !== 'mouse' && !placement.isTargeting(point)) {
        placement.aim(point);
        placement.arm();
        return;
      }
      const { type, moving } = placement;
      const before = { ...sim.resources };
      const placed = placement.tryPlace(point);
      if (placed) {
        saver.save(); // sauvegarde à chaque pose
        sound.playPlace();
        landFeedback(placed);
        ui.spent(spentSince(before));
        // Pose en série tant que le suivant est payable ; l'unique (Phare) n'a pas de suivant.
        if (moving === null && (BALANCE.buildings[type].unique || sim.atLimit(type) || !sim.canAfford(type))) placement.cancel();
      } else if (placement.check && !placement.check.ok) refuse(ui.tools[placement.type]?.button, true);
    }
    else {
      const isle = playing && islands.pick(groundUnder(ndc)); // îlot dans la brume : son panneau
      if (isle) {
        ui.openIsland(isle);
        refreshUI();
        return;
      }
      const tile = grid.tileAtWorld(groundUnder(ndc));
      // Un bâtiment posé (sa silhouette, haute, ou sa case) : sa fiche, ou le panneau du Phare.
      const record = playing ? (pickBuilding(ndc) || (tile && buildings.at(tile.x, tile.z))) : null;
      if (record) {
        const { w, d } = getBuildingType(record.type).footprint;
        highlight.setArea(record.x, record.z, w, d, true);
        if (record.type === LIGHTHOUSE) ui.openLighthouse();
        else if (BALANCE.buildings[record.type].bell && sim.bellState(record.uid).ready) ringBell(record.uid); // Cloche chargée : elle sonne, sans fiche
        else ui.openCard(record.uid);
        refreshUI();
        return;
      }
      highlight.set(tile);
      ui.closeCard();
    }
  },
  onLeave: () => {
    if (placement.active) placement.aim(null);
    else highlight.set(null);
  },
});

window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (ending.active) {
    finishEnding();
    return;
  }
  if (endingScreen.rereading) {
    endingScreen.hide();
    return;
  }
  if (!ui.closeTopDialog() && playing) placement.cancel();
});
window.addEventListener('resize', resize);
window.visualViewport?.addEventListener('resize', resize);

const sparkPos = new THREE.Vector3();
function spawnProductionFeedback(event) {
  const view = buildings.views.get(event.uid);
  if (!view) return;
  for (const res of Object.keys(event.outputs)) {
    sparks.spawn(
      sparkPos.copy(view.position).setY(view.position.y + heightOf(buildings.get(event.uid)) + 0.1),
      RESOURCE_TYPES[res]?.spark,
    );
  }
}

// Visiteur du lac touché : le cadeau passe par la simulation, puis son et texte flottant.
const canvasRect = () => pixel.canvas.getBoundingClientRect();
function catchVisitor(ndc) {
  const rect = canvasRect();
  if (!visitors.hit(ndc, iso.camera, rect)) return false;
  const at = visitors.screenPosition(iso.camera, rect);
  giveVisitorGift(at.x, at.y);
  pixel.canvas.classList.remove('over-visitor');
  return true;
}

// Cadeau du visiteur (scène ou ligne du mode économie), texte flottant en (x, y) px CSS.
function giveVisitorGift(x, y) {
  visitors.catch();
  const gift = sim.catchVisitor(); // notifie : Carnet (10 visiteurs), compteurs
  saver.save();
  sound.playVisitor();
  ui.glint(Object.keys(gift));
  const text = Object.entries(gift).map(([res, n]) => `+${Math.floor(n)} ${resourceLabel(res, n)}`).join(' · ');
  ui.floatText(x, y, text);
  ecoVisitor = false;
  if (eco) refreshUI();
}

const picker = new THREE.Raycaster();
function pickBuilding(ndc) {
  picker.setFromCamera(ndc, iso.camera);
  return buildings.pick(picker);
}

// Lumière de la lanterne : seulement quand le Phare est achevé (son modèle porte lanternY).
const beaconPos = new THREE.Vector3();
function beaconPosition() {
  const record = lighthouseRecord();
  const view = record && buildings.views.get(record.uid);
  if (!view || view.userData.lanternY === undefined) return null;
  return beaconPos.copy(view.position).setY(view.position.y + view.userData.lanternY);
}

const clock = new THREE.Clock();

// Page masquée : on sauvegarde et on note l'heure ; la boucle s'arrête d'elle-même.
// Page de nouveau visible : la production de l'absence est créditée en une fois.
let hiddenAt = null;
document.addEventListener('visibilitychange', () => {
  if (!playing) return; // écran titre : l'absence sera comptée depuis savedAt à « Continuer »
  if (document.hidden) {
    saver.save();
    hiddenAt = Date.now();
  } else if (hiddenAt !== null) {
    const away = (Date.now() - hiddenAt) / 1000;
    hiddenAt = null;
    clock.getDelta(); // le temps masqué ne doit pas aussi passer par sim.advance
    announceOffline(creditOffline(away));
  }
});
window.addEventListener('pagehide', () => saver.save());

// ----- Cadence de rendu -----
// La scène n'est redessinée à chaque image que si quelque chose bouge vite : caméra, geste récent,
// apparition, visiteur, faisceau, îlot qui se dévoile, aperçu de pose, écran titre, séquence de fin.
// Sinon, cadence réduite (idleFps), relevée juste assez pour qu'un objet lent (barque, symbole de
// production) avance d'au plus un pixel par image. Basse : plafond de 30 images/s.
let lastRender = -Infinity;
let lastInput = 0;
let rested = false;
const lastView = { x: NaN, y: NaN, z: NaN, w: NaN, h: NaN };
for (const type of ['pointerdown', 'pointermove', 'wheel', 'keydown']) {
  window.addEventListener(type, () => { lastInput = performance.now() / 1000; }, { passive: true, capture: true });
}

function viewChanged() {
  const c = iso.camera;
  const changed = c.position.x !== lastView.x || c.position.y !== lastView.y || c.position.z !== lastView.z
    || c.right !== lastView.w || c.top !== lastView.h;
  Object.assign(lastView, { x: c.position.x, y: c.position.y, z: c.position.z, w: c.right, h: c.top });
  return changed;
}

function renderRate() {
  const q = quality.settings;
  const moved = viewChanged();
  const busy = !playing || ending.active || placement.active || moved || buildings.animating
    || visitors.sprite.visible || beam.group.visible || islands.animating || waves.active
    || dust.busy || placement.wobbling
    || performance.now() / 1000 - lastInput < QUALITY.idleAfterSeconds;
  const pixelsPerSecond = Math.max(buildings.motion, sparks.speed) * CAMERA.pixelsPerUnit * iso.zoom;
  const rate = busy ? Infinity : Math.max(q.idleFps, pixelsPerSecond);
  return q.maxFps ? Math.min(rate, q.maxFps) : rate;
}

// Compteur d'images (Options) ; mode détaillé : coût de l'image (appels, triangles, mémoire,
// programmes, lumières, matériaux), recompté chaque seconde.
let statsAt = 0;
let sceneCount = { lights: 0, materials: 0 };
function showStats(now) {
  if (!quality.showFps) return;
  const head = `${Math.round(quality.fps)} i/s · ${quality.settings.label}${quality.choice === 'auto' ? ' (auto)' : ''}`
    + (rested ? ' · repos' : '');
  if (quality.showFps !== 'detail') {
    ui.setFps(head);
    return;
  }
  if (now - statsAt >= 1) {
    statsAt = now;
    sceneCount = countScene();
  }
  const s = pixel.stats();
  ui.setFps(`${head}\n${s.calls} appels · ${(s.triangles / 1000).toFixed(1)} k triangles\n`
    + `${s.geometries} géométries · ${s.textures} textures\n`
    + `${s.programs} programmes · ${sceneCount.lights} lumières · ${sceneCount.materials} matériaux`);
}

function countScene() {
  const materials = new Set();
  let lights = 0;
  scene.traverseVisible((o) => {
    if (o.isLight && o.intensity > 0) lights++;
    if (!o.material) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m);
  });
  return { lights, materials: materials.size };
}

// Sauvegarde périodique, au rythme de la boucle (donc jamais pendant que la page
// est masquée : `savedAt` reste l'instant exact jusqu'où l'état est à jour).
let sinceSave = 0;

// Fiche d'une Cloche ouverte : le compte à rebours de sa charge avance sans notification de la simulation.
let sinceCard = 0;
function refreshBellCard(dt) {
  sinceCard += dt;
  if (sinceCard < 0.5) return;
  sinceCard = 0;
  const record = ui.cardUid != null ? buildings.get(ui.cardUid) : null;
  if (record && BALANCE.buildings[record.type].bell) refreshUI();
}

function frame() {
  const realDt = clock.getDelta();
  if (playing) {
    sim.advance(realDt);                     // pas fixe, indépendant des FPS ; figée au titre
    progress.tick(realDt);                   // durée de jeu active
  }
  else iso.setOrbit((orbit += Math.min(realDt, 0.1) * TITLE_ORBIT_SPEED));
  sinceSave += realDt;
  if (playing && sinceSave >= SAVE.autosaveSeconds) {
    sinceSave = 0;
    if (saver.save()) ui.flashSaved();
  }
  const producedNow = new Set(); // un son par ressource et par image, au plus
  for (const event of sim.drainEvents()) {
    if (event.kind !== 'produced') continue;
    if (!eco) spawnProductionFeedback(event);
    for (const res of Object.keys(event.outputs)) producedNow.add(res);
  }
  for (const res of producedNow) sound.playProduce(res);

  if (eco) {
    // Aucune image : seuls le Visiteur (délai, durée de vie) et l'écran, à 2 Hz au plus.
    visitors.update(Math.min(realDt, 0.1), playing);
    if (visitors.catchable !== ecoVisitor) {
      ecoVisitor = visitors.catchable;
      uiDirty = true;
    }
    if (sim.countOf('bell') > 0) uiDirty = true; // comptes à rebours des Cloches
    if (uiDirty && performance.now() / 1000 - ecoRenderedAt >= ECO_UI_SECONDS) refreshUI();
    requestAnimationFrame(frame);
    return;
  }

  const dt = Math.min(realDt, 0.1);          // animations visuelles uniquement
  if (ending.active) updateEnding(dt);
  const hour = day.update(dt);               // cycle jour/nuit : lumière, lueurs, sons
  applyDay(lighting, scene, hour);
  const lantern = beaconPosition();
  applyBeacon(lighting, lantern, hour.night * lanternRise());
  // Faisceau : pendant la séquence, puis chaque nuit une fois la partie terminée.
  beam.update(dt, (ending.active || progress.finished) ? lantern : null, hour.night * lanternRise());
  lake.update(dt, hour, iso, {
    lights: lakeLights,
    lantern: lantern && { x: lantern.x, z: lantern.z, strength: lanternRise() },
    beam: beam.state,
    isles: islands.shores(),
  });
  islands.update(dt, clock.elapsedTime, lake.uniforms.uFog.value);
  setNightGlow(hour.night);
  sound.setNight(hour.night);
  const pulse = quality.settings.pulse ? clock.elapsedTime : 0; // Basse : cadres fixes
  highlight.update(pulse);
  aura.update(pulse);
  buildings.update(dt);
  sparks.update(dt);
  waves.update(dt);
  dust.update(dt);
  placement.update(dt);
  visitors.update(dt, playing && !ending.active);
  refreshBellCard(realDt);
  if (visitors.catchable) tip('visitor');
  if (!ending.active) iso.step(dt);        // glisse, zoom doux, rappel dans les limites
  iso.update();
  const now = performance.now() / 1000;
  const rate = renderRate();
  if (now - lastRender >= 1 / rate - 0.004) {
    pixel.render(scene, iso.camera);
    // Mesure de l'automatique : seulement à pleine cadence, en jeu (pas au repos ni plafonnée).
    quality.frame(now - lastRender, playing && !ending.active && rate === Infinity && !rested);
    lastRender = now;
    rested = rate !== Infinity && rate < (quality.settings.maxFps || Infinity);
  }
  showStats(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Accès de débogage depuis la console
window.__game = { dust, feel, setEco, ecoScreen, controls, ui, quality, lake, islands, title, ending, startEnding, progress, scene, grid, iso, highlight, pixel, buildings, placement, sim, saver, journal, sound, day, visitors };
