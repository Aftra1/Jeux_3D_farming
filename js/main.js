// Point d'entrée : assemble rendu, grille, bâtiments, simulation, caméra,
// contrôles et UI. Boucle : la simulation avance à pas fixe, le rendu suit.

import * as THREE from 'three';
import { PALETTE, SAVE } from './config.js';
import { BALANCE } from './balance.js';
import { PixelRenderer } from './render/renderer.js';
import { createLighting } from './render/lighting.js';
import { IsoCamera } from './render/camera.js';
import { Grid } from './grid/grid.js';
import { TileHighlight } from './grid/highlight.js';
import { AuraPreview } from './grid/aura.js';
import { BuildingManager } from './buildings/buildings.js';
import { Placement } from './buildings/placement.js';
import { BUILDING_ORDER, getBuildingType } from './buildings/catalog.js';
import { RESOURCE_TYPES } from './resources.js';
import { Simulation } from './sim/simulation.js';
import { Sparks } from './render/effects.js';
import { Controls } from './input/controls.js';
import { UI } from './ui/ui.js';
import { SaveManager } from './save/save.js';
import { Journal, missiveProgress } from './story/journal.js';
import { SoundScape } from './audio/audio.js';

const container = document.getElementById('game');
const pixel = new PixelRenderer(container);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.slate);

const grid = new Grid();
scene.add(grid.mesh);
createLighting(scene, grid.size);

const highlight = new TileHighlight(grid);
scene.add(highlight.mesh);

const buildings = new BuildingManager(grid, scene);
const sim = new Simulation(buildings);
const sparks = new Sparks(scene);
const journal = new Journal();
const saver = new SaveManager({ sim, buildings, journal });
const sound = new SoundScape(); // muet jusqu'au premier geste du joueur

// Chargement : sauvegarde valide → reprise ; absente ou illisible → nouvelle partie.
const loaded = saver.load();
let pendingOffline = null; // { seconds, amount } à annoncer une fois l'UI prête
if (loaded.status === 'loaded') {
  pendingOffline = creditOffline((Date.now() - loaded.savedAt) / 1000);
}
buildings.syncViews(sim.boosts()); // ouvertures éteintes en pause, lueur des renforcés
// Paliers atteints hors ligne ou par migration ; missives déjà remplies accomplies d'office.
if (journal.update(sim.earned, sim).length) saver.save();

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
  });
}

const aura = new AuraPreview(grid, scene);
const placement = new Placement({ scene, grid, rules: sim, highlight, aura, onChange: refreshUI });

// Ressources, bâtiments ou pauses changés : l'aperçu peut devenir possible ou
// impossible, et les ouvertures des producteurs s'allument ou s'éteignent.
// Un palier du Carnet atteint ou une missive accomplie : simple signal sur le bouton
// (lu d'office si le Carnet est ouvert), la missive suivante remplace la précédente.
sim.subscribe(() => {
  if (journal.update(sim.earned, sim).length) {
    sound.playReveal();
    if (ui?.journalOpen) journal.markAllRead();
    saver.save();
  }
  buildings.syncViews(sim.boosts());
  placement.refresh();
  refreshUI();
});

ui = new UI({
  onSelect: (type) => {
    placement.start(type);
    placement.aim(groundUnder({ x: 0, y: 0 })); // aperçu au centre de la vue
  },
  onCancel: () => placement.cancel(),
  onJournalOpen: () => {
    if (journal.markAllRead()) saver.save();
    refreshUI();
  },
  onReset: () => {
    saver.wipe();             // efface et bloque toute écriture (pagehide compris)
    window.location.reload(); // repart d'un état propre : aucune sauvegarde → nouvelle partie
  },
  sound: { muted: sound.muted, volume: sound.volume },
  onMute: (muted) => sound.setMuted(muted),
  onVolume: (volume) => sound.setVolume(volume),
});
refreshUI();
announceOffline(pendingOffline);

controls = new Controls(pixel.canvas, iso, {
  onHover: (ndc) => {
    if (placement.active) placement.aim(groundUnder(ndc));
    else highlight.set(grid.tileAtWorld(groundUnder(ndc)));
  },
  onAim: (ndc) => placement.aim(groundUnder(ndc)),
  onTap: (ndc, pointerType, button) => {
    if (button === 2) {
      placement.cancel();
      return;
    }
    if (placement.active) {
      if (placement.tryPlace(groundUnder(ndc))) {
        saver.save(); // sauvegarde à chaque pose
        sound.playPlace();
      } else if (placement.check && !placement.check.ok) sound.playRefuse();
    }
    else highlight.set(grid.tileAtWorld(groundUnder(ndc)));
  },
  onLeave: () => {
    if (placement.active) placement.aim(null);
    else highlight.set(null);
  },
});

window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!ui.closeTopDialog()) placement.cancel();
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

const clock = new THREE.Clock();

// Page masquée : on sauvegarde et on note l'heure ; la boucle s'arrête d'elle-même.
// Page de nouveau visible : la production de l'absence est créditée en une fois.
let hiddenAt = null;
document.addEventListener('visibilitychange', () => {
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
  sim.advance(realDt);                       // pas fixe, indépendant des FPS
  sinceSave += realDt;
  if (sinceSave >= SAVE.autosaveSeconds) {
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
  highlight.update(clock.elapsedTime);
  aura.update(clock.elapsedTime);
  buildings.update(dt);
  sparks.update(dt);
  iso.update();
  pixel.render(scene, iso.camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Accès de débogage depuis la console
window.__game = { scene, grid, iso, highlight, pixel, buildings, placement, sim, saver, journal, sound };
