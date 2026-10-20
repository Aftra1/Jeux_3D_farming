// Éclairage de fin de journée : soleil doré rasant sur le côté,
// lumière ambiante bleutée pour des ombres ardoise.

import * as THREE from 'three';
import { PALETTE } from '../config.js';

export function createLighting(scene, gridSize) {
  // Ambiance : le ciel bleu ardoise remplit les ombres, le sol renvoie un peu de brun.
  const hemi = new THREE.HemisphereLight(PALETTE.skylight, PALETTE.groundBounce, 1.1);
  scene.add(hemi);

  // Soleil couchant : bas sur l'horizon, venant de la gauche de la vue.
  const sun = new THREE.DirectionalLight(PALETTE.sunlight, 3.4);
  sun.position.set(-14, 9, 6);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;

  const half = gridSize * 0.8;
  const cam = sun.shadow.camera;
  cam.left = -half;
  cam.right = half;
  cam.top = half;
  cam.bottom = -half;
  cam.near = 1;
  cam.far = 50;
  sun.shadow.mapSize.set(512, 512); // basse résolution volontaire : ombres pixelisées
  sun.shadow.bias = -0.001;

  scene.add(sun);
  scene.add(sun.target);

  return { sun, hemi };
}
