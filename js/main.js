// Point d'entrée : assemble rendu, grille, bâtiments, caméra, contrôles et UI.

import * as THREE from 'three';
import { PALETTE } from './config.js';
import { PixelRenderer } from './render/renderer.js';
import { createLighting } from './render/lighting.js';
import { IsoCamera } from './render/camera.js';
import { Grid } from './grid/grid.js';
import { TileHighlight } from './grid/highlight.js';
import { BuildingManager } from './buildings/buildings.js';
import { Placement } from './buildings/placement.js';
import { getBuildingType } from './buildings/catalog.js';
import { Controls } from './input/controls.js';
import { UI } from './ui/ui.js';

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
const placement = new Placement({
  scene,
  grid,
  buildings,
  highlight,
  onChange: () => {
    if (controls) controls.aimWithTouch = placement.active;
    ui.render({
      placing: placement.type,
      name: placement.type ? getBuildingType(placement.type).name : '',
      check: placement.check,
      pointerType: controls ? controls.lastPointerType : 'mouse',
    });
  },
});

const ui = new UI({
  onSelect: (type) => {
    placement.start(type);
    placement.aim(groundUnder({ x: 0, y: 0 })); // aperçu au centre de la vue
  },
  onCancel: () => placement.cancel(),
});

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
    if (placement.active) placement.tryPlace(groundUnder(ndc));
    else highlight.set(grid.tileAtWorld(groundUnder(ndc)));
  },
  onLeave: () => {
    if (placement.active) placement.aim(null);
    else highlight.set(null);
  },
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') placement.cancel();
});
window.addEventListener('resize', resize);
window.visualViewport?.addEventListener('resize', resize);

const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.1);
  highlight.update(clock.elapsedTime);
  buildings.update(dt);
  iso.update();
  pixel.render(scene, iso.camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Accès de débogage depuis la console
window.__game = { scene, grid, iso, highlight, pixel, buildings, placement };
