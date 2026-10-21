// Point d'entrée : assemble rendu, grille, bâtiments, simulation, caméra,
// contrôles et UI. Boucle : la simulation avance à pas fixe, le rendu suit.

import * as THREE from 'three';
import { PALETTE, SAVE } from './config.js';
import { BALANCE } from './balance.js';
import { PixelRenderer } from './render/renderer.js';
import { createLighting, applyDay, applyBeacon } from './render/lighting.js';
import { setNightGlow } from './buildings/models.js';
import { DayCycle } from './world/daycycle.js';
import { IsoCamera } from './render/camera.js';
import { Grid } from './grid/grid.js';
import { TileHighlight } from './grid/highlight.js';
import { AuraPreview } from './grid/aura.js';
import { BuildingManager } from './buildings/buildings.js';
import { Placement } from './buildings/placement.js';
import { BUILDING_ORDER, getBuildingType } from './buildings/catalog.js';
import { RESOURCE_TYPES, resourceLabel } from './resources.js';
import { Simulation } from './sim/simulation.js';
import { Sparks } from './render/effects.js';
import { Visitors } from './render/visitors.js';
import { Controls } from './input/controls.js';
import { UI } from './ui/ui.js';
import { SaveManager } from './save/save.js';
import { Journal, missiveProgress } from './story/journal.js';
import { FRAGMENTS } from './story/fragments.js';
import { SoundScape } from './audio/audio.js';
import { TitleScreen } from './ui/title.js';

const container = document.getElementById('game');
const pixel = new PixelRenderer(container);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.slate);

const grid = new Grid();
scene.add(grid.mesh);
const lighting = createLighting(scene, grid.size);

const highlight = new TileHighlight(grid);
scene.add(highlight.mesh);

const buildings = new BuildingManager(grid, scene);
const journal = new Journal();
const sim = new Simulation(buildings, journal); // le Phare se débloque avec les missives
const sparks = new Sparks(scene);
const visitors = new Visitors(scene, grid.half); // Visiteurs du lac : délai compté en jeu actif seulement
const day = new DayCycle();      // heure du domaine : ne lit que l'horloge, jamais la simulation
const saver = new SaveManager({ sim, buildings, journal, day });
const sound = new SoundScape(); // muet jusqu'au premier geste du joueur

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
  if (controls) controls.aimWithTouch = placement.active;
  const offers = {};
  for (const type of BUILDING_ORDER) {
    offers[type] = {
      cost: sim.costOf(type),
      affordable: sim.canAfford(type),
      missing: sim.missingUnlocks(type),
    };
    const record = isUniqueBuilt(type) && buildings.records.find((r) => r.type === type);
    if (record?.stage) offers[type].stage = { stage: record.stage, max: BALANCE.buildings[type].stages.length };
  }
  const current = journal.currentMissive;
  const missive = current && { ...current, ...missiveProgress(current, sim) };
  ui.render({
    resources: sim.resources,
    offers,
    placing: placement.type,
    check: placement.check,
    pointerType: controls ? controls.lastPointerType : 'mouse',
    journal: { unlocked: journal.unlocked, unread: journal.unread.size, earned: sim.earned, missive },
    lighthouse: lighthouseState(),
  });
}

const aura = new AuraPreview(grid, scene);
const placement = new Placement({ scene, grid, rules: sim, highlight, aura, onChange: refreshUI });

// Ressources, bâtiments ou pauses changés : l'aperçu peut devenir possible ou
// impossible, et les ouvertures des producteurs s'allument ou s'éteignent.
// Un palier du Carnet atteint ou une missive accomplie : simple signal sur le bouton
// (lu d'office si le Carnet est ouvert), la missive suivante remplace la précédente.
sim.subscribe(() => {
  const fresh = journal.update(sim.earned, sim);
  if (fresh.length) {
    // Révélation finale (Phare achevé) : phrase plus longue ; sinon la phrase habituelle.
    if (FRAGMENTS.some((f) => f.finale && fresh.includes(f.id))) sound.playFinale();
    else sound.playReveal();
    if (ui?.journalOpen) journal.markAllRead();
    saver.save();
  }
  buildings.syncViews(sim.boosts());
  placement.refresh();
  refreshUI();
});

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
  onElevate: (uid) => {
    if (sim.elevate(uid).ok) saver.save(); // le fragment du palier joue sa phrase (abonnement)
    else sound.playRefuse();
  },
  onReset: () => {
    saver.wipe();             // efface et bloque toute écriture (pagehide compris)
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
});
refreshUI();

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
    saver.enabled = true;
    playing = true;
    clock.getDelta(); // le temps passé sur le titre n'entre pas dans sim.advance
    const offline = continuing ? creditOffline((Date.now() - loaded.savedAt) / 1000) : null;
    if (journal.update(sim.earned, sim).length) refreshUI();
    saver.save();
    refreshUI();
    // Panneau de retour une fois le jeu révélé.
    if (offline) setTimeout(() => announceOffline(offline), 500);
  });
}

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
  const record = lighthouseRecord();
  title.showMenu({
    buildings: buildings.records.length,
    stage: record?.stage ?? null,
    maxStage: BALANCE.buildings[LIGHTHOUSE].stages.length,
  });
} else title.showMenu(null);

controls = new Controls(pixel.canvas, iso, {
  onHover: (ndc) => {
    pixel.canvas.classList.toggle('over-visitor', playing && visitors.hit(ndc, iso.camera, canvasRect()));
    if (placement.active) placement.aim(groundUnder(ndc));
    else highlight.set(grid.tileAtWorld(groundUnder(ndc)));
  },
  onAim: (ndc) => placement.aim(groundUnder(ndc)),
  onTap: (ndc, pointerType, button) => {
    if (button === 2) {
      placement.cancel();
      return;
    }
    if (playing && catchVisitor(ndc)) return; // le visiteur passe avant la pose et la sélection
    if (placement.active) {
      if (placement.tryPlace(groundUnder(ndc))) {
        saver.save(); // sauvegarde à chaque pose
        sound.playPlace();
      } else if (placement.check && !placement.check.ok) sound.playRefuse();
    }
    else {
      const tile = grid.tileAtWorld(groundUnder(ndc));
      highlight.set(tile);
      // Sélectionner le Phare (sa case ou sa silhouette, haute) ouvre son panneau.
      if ((tile && buildings.at(tile.x, tile.z)?.type === LIGHTHOUSE) || pointsAtLighthouse(ndc)) {
        ui.openLighthouse();
        refreshUI();
      }
    }
  },
  onLeave: () => {
    if (placement.active) placement.aim(null);
    else highlight.set(null);
  },
});

window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!ui.closeTopDialog() && playing) placement.cancel();
});
window.addEventListener('resize', resize);
window.visualViewport?.addEventListener('resize', resize);

const sparkPos = new THREE.Vector3();
function spawnProductionFeedback(event) {
  const view = buildings.views.get(event.uid);
  if (!view) return;
  const def = getBuildingType(buildings.get(event.uid).type);
  for (const res of Object.keys(event.outputs)) {
    sparks.spawn(
      sparkPos.copy(view.position).setY(view.position.y + def.height + 0.1),
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
  visitors.catch();
  const gift = sim.catchVisitor(); // notifie : Carnet (10 visiteurs), compteurs
  saver.save();
  sound.playVisitor();
  const text = Object.entries(gift).map(([res, n]) => `+${Math.floor(n)} ${resourceLabel(res, n)}`).join(' · ');
  ui.floatText(at.x, at.y, text);
  pixel.canvas.classList.remove('over-visitor');
  return true;
}

const picker = new THREE.Raycaster();
function pointsAtLighthouse(ndc) {
  const record = lighthouseRecord();
  const view = record && buildings.views.get(record.uid);
  if (!view) return false;
  picker.setFromCamera(ndc, iso.camera);
  return picker.intersectObject(view, true).length > 0;
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

// Sauvegarde périodique, au rythme de la boucle (donc jamais pendant que la page
// est masquée : `savedAt` reste l'instant exact jusqu'où l'état est à jour).
let sinceSave = 0;

function frame() {
  const realDt = clock.getDelta();
  if (playing) sim.advance(realDt);          // pas fixe, indépendant des FPS ; figée au titre
  else iso.setOrbit((orbit += Math.min(realDt, 0.1) * TITLE_ORBIT_SPEED));
  sinceSave += realDt;
  if (playing && sinceSave >= SAVE.autosaveSeconds) {
    sinceSave = 0;
    saver.save();
  }
  const producedNow = new Set(); // un son par ressource et par image, au plus
  for (const event of sim.drainEvents()) {
    if (event.kind !== 'produced') continue;
    spawnProductionFeedback(event);
    for (const res of Object.keys(event.outputs)) producedNow.add(res);
  }
  for (const res of producedNow) sound.playProduce(res);

  const dt = Math.min(realDt, 0.1);          // animations visuelles uniquement
  const hour = day.update(dt);               // cycle jour/nuit : lumière, lueurs, sons
  applyDay(lighting, scene, hour);
  applyBeacon(lighting, beaconPosition(), hour.night);
  setNightGlow(hour.night);
  sound.setNight(hour.night);
  highlight.update(clock.elapsedTime);
  aura.update(clock.elapsedTime);
  buildings.update(dt);
  sparks.update(dt);
  visitors.update(dt, playing);
  iso.update();
  pixel.render(scene, iso.camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Accès de débogage depuis la console
window.__game = { title, scene, grid, iso, highlight, pixel, buildings, placement, sim, saver, journal, sound, day, visitors };
