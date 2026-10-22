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
  sun.shadow.mapSize.set(768, 768); // basse résolution volontaire : ombres pixelisées (32 texels par case)
  sun.shadow.bias = -0.001;
  sun.shadow.intensity = 0.7; // ombres adoucies : on devine le sol bleuté dessous

  scene.add(sun);
  scene.add(sun.target);

  // Lanterne du Phare : présente dès le départ, éteinte (intensité 0), pour ne jamais
  // forcer la recompilation des shaders quand elle s'allume. Sans ombre.
  const beacon = new THREE.PointLight(PALETTE.amberLight, 0, DAYCYCLE.beacon.distance, DAYCYCLE.beacon.decay);
  scene.add(beacon);

  return { sun, hemi, beacon };
}

// Applique un état du cycle jour/nuit (world/daycycle.js) : ciel, soleil (ou lune), ambiance.
export function applyDay({ sun, hemi }, scene, state) {
  const srgb = THREE.SRGBColorSpace;
  scene.background.setRGB(...state.sky, srgb);
  const [x, y, z] = state.sunDir;
  const d = Math.max(DAYCYCLE.lightDistance, (sun.userData.reach ?? 0) + 4); // îlots ralliés : soleil reculé
  sun.position.set(x * d, y * d, z * d);
  sun.color.setRGB(...state.sunColor, srgb);
  sun.intensity = state.sunIntensity;
  hemi.color.setRGB(...state.hemiSky, srgb);
  hemi.groundColor.setRGB(...state.hemiGround, srgb);
  hemi.intensity = state.hemiIntensity;
}

// Place la lumière du Phare sur sa lanterne (position monde, ou null si aucun Phare achevé).
export function applyBeacon({ beacon }, position, night) {
  if (position) beacon.position.copy(position);
  beacon.intensity = position ? DAYCYCLE.beacon.intensity * night : 0;
}

// Étendue de la carte d'ombres : le domaine, élargi aux îlots ralliés (`radius` = distance au
// centre du point constructible le plus éloigné). Même résolution, texels un peu plus grands.
export function setShadowReach({ sun }, gridSize, radius = 0) {
  const half = Math.max(gridSize * 0.8, radius);
  const cam = sun.shadow.camera;
  if (cam.right === half) return;
  cam.left = -half;
  cam.right = half;
  cam.top = half;
  cam.bottom = -half;
  sun.userData.reach = radius;
  cam.far = Math.max(50, Math.max(DAYCYCLE.lightDistance, radius + 4) + half * 1.5);
  cam.updateProjectionMatrix();
}

// Qualité : taille de la carte d'ombres (recréée au prochain rendu) et lumière de la lanterne
// (retirée du rendu en Basse : une lumière de moins dans tous les shaders éclairés).
export function applyQuality({ sun, beacon }, q) {
  if (sun.shadow.mapSize.x !== q.shadowMap) {
    sun.shadow.mapSize.set(q.shadowMap, q.shadowMap);
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
  }
  beacon.visible = q.beacon;
}
