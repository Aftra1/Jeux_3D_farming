// Point d'entrée : assemble rendu, grille, caméra et contrôles.

import * as THREE from 'three';
import { PALETTE } from './config.js';
import { PixelRenderer } from './render/renderer.js';
import { createLighting } from './render/lighting.js';
import { IsoCamera } from './render/camera.js';
import { Grid } from './grid/grid.js';
import { TileHighlight } from './grid/highlight.js';
import { Controls } from './input/controls.js';

const container = document.getElementById('game');
const pixel = new PixelRenderer(container);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.slate);

const grid = new Grid();
scene.add(grid.mesh);
createLighting(scene, grid.size);

const highlight = new TileHighlight(grid);
scene.add(highlight.mesh);

const iso = new IsoCamera({ groundY: grid.topY, halfExtent: grid.half });

function resize() {
  const { width, height } = pixel.resize();
  iso.setViewport(width, height);
}
resize();
iso.setZoom(iso.fitZoom(grid.size));
iso.update();

const tileUnder = (ndc) => grid.tileAtWorld(iso.groundAt(ndc.x, ndc.y));

new Controls(pixel.canvas, iso, {
  onHover: (ndc) => highlight.set(tileUnder(ndc)),
  onTap: (ndc) => highlight.set(tileUnder(ndc)),
  onLeave: () => highlight.set(null),
});

window.addEventListener('resize', resize);
window.visualViewport?.addEventListener('resize', resize);

const clock = new THREE.Clock();
function frame() {
  highlight.update(clock.getElapsedTime());
  iso.update();
  pixel.render(scene, iso.camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Accès de débogage depuis la console
window.__game = { scene, grid, iso, highlight, pixel };
