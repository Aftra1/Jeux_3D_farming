// Éclairage de fin de journée : soleil doré rasant sur le côté,
// lumière ambiante bleutée pour des ombres ardoise.

import * as THREE from 'three';
import { PALETTE, DAYCYCLE } from '../config.js';

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
  sun.shadow.intensity = 0.7; // ombres adoucies : on devine le sol bleuté dessous

  scene.add(sun);
  scene.add(sun.target);

  return { sun, hemi };
}

// Applique un état du cycle jour/nuit (world/daycycle.js) : ciel, soleil (ou lune), ambiance.
export function applyDay({ sun, hemi }, scene, state) {
  const srgb = THREE.SRGBColorSpace;
  scene.background.setRGB(...state.sky, srgb);
  const [x, y, z] = state.sunDir;
  const d = DAYCYCLE.lightDistance;
  sun.position.set(x * d, y * d, z * d);
  sun.color.setRGB(...state.sunColor, srgb);
  sun.intensity = state.sunIntensity;
  hemi.color.setRGB(...state.hemiSky, srgb);
  hemi.groundColor.setRGB(...state.hemiGround, srgb);
  hemi.intensity = state.hemiIntensity;
}
