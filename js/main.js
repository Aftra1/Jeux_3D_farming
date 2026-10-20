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
import { BuildingManager } from './buildings/buildings.js';
import { Placement } from './buildings/placement.js';
import { BUILDING_TYPES, getBuildingType } from './buildings/catalog.js';
import { Simulation } from './sim/simulation.js';
import { Sparks } from './render/effects.js';
import { Controls } from './input/controls.js';
import { UI } from './ui/ui.js';
import { SaveManager } from './save/save.js';

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
const saver = new SaveManager({ sim, buildings });

// Chargement : sauvegarde valide → reprise ; absente ou illisible → nouvelle partie.
const loaded = saver.load();
let pendingOffline = null; // { seconds, amount } à annoncer une fois l'UI prête
if (loaded.status === 'loaded') {
  pendingOffline = creditOffline((Date.now() - loaded.savedAt) / 1000);
}

// Crédite une absence et renvoie ce qu'il faut annoncer (ou null).
function creditOffline(seconds) {
  if (!(seconds > 0)) return null;
  const result = sim.applyOffline(seconds);
  saver.save(); // l'état « rattrapé » devient la nouvelle référence (pas de double comptage)
  const amount = result.gains.knowledge ?? 0;
  if (amount > 0 && seconds >= BALANCE.offline.noticeMinSeconds) return { seconds, amount };
  return null;
}

function announceOffline(info) {
  if (!info || !ui) return;
  const libraries = buildings.records.filter((r) => r.type === 'library').length;
  ui.showOfflineGain(info.amount, libraries);
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
  for (const type of Object.keys(BUILDING_TYPES)) {
    offers[type] = { cost: sim.costOf(type), affordable: sim.canAfford(type) };
  }
  ui.render({
    resources: sim.resources,
    offers,
    placing: placement.type,
    name: placement.type ? getBuildingType(placement.type).name : '',
    check: placement.check,
    pointerType: controls ? controls.lastPointerType : 'mouse',
  });
}

const placement = new Placement({ scene, grid, rules: sim, highlight, onChange: refreshUI });

// Ressources ou bâtiments changés : l'aperçu peut devenir possible/impossible.
sim.subscribe(() => {
  placement.refresh();
  refreshUI();
});

ui = new UI({
  onSelect: (type) => {
    placement.start(type);
    placement.aim(groundUnder({ x: 0, y: 0 })); // aperçu au centre de la vue
  },
  onCancel: () => placement.cancel(),
  onReset: () => {
    saver.wipe();             // efface et bloque toute écriture (pagehide compris)
    window.location.reload(); // repart d'un état propre : aucune sauvegarde → nouvelle partie
  },
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
      if (placement.tryPlace(groundUnder(ndc))) saver.save(); // sauvegarde à chaque pose
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
  sparks.spawn(sparkPos.copy(view.position).setY(view.position.y + def.height + 0.1));
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
  for (const event of sim.drainEvents()) {
    if (event.kind === 'produced') spawnProductionFeedback(event);
  }

  const dt = Math.min(realDt, 0.1);          // animations visuelles uniquement
  highlight.update(clock.elapsedTime);
  buildings.update(dt);
  sparks.update(dt);
  iso.update();
  pixel.render(scene, iso.camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Accès de débogage depuis la console
window.__game = { scene, grid, iso, highlight, pixel, buildings, placement, sim, saver };
