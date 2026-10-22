// Caméra isométrique orthographique : orientation fixe en jeu (orbite lente à l'écran titre),
// cible et zoom bornés.
// La position est alignée sur la grille des pixels internes pour éviter
// le scintillement des textures pixel lors des déplacements.

import * as THREE from 'three';
import { CAMERA } from '../config.js';

const DISTANCE = 150; // assez loin pour que le plan d'eau ne soit jamais coupé (near/far)

export class IsoCamera {
  constructor({ groundY, halfExtent }) {
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, DISTANCE * 2);
    this.groundY = groundY;
    const m = halfExtent + CAMERA.panMargin;
    this.bounds = { xMin: -m, xMax: m, zMin: -m, zMax: m };
    this.target = new THREE.Vector3(0, groundY, 0);
    this.zoom = 1;
    this.viewW = 1;
    this.viewH = 1;

    this.offsetDir = new THREE.Vector3();
    this.right = new THREE.Vector3();
    this.up = new THREE.Vector3();
    this.forward = new THREE.Vector3();
    this.setOrbit(0);

    this._raycaster = new THREE.Raycaster();
    this._plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -groundY);
    this._ndc = new THREE.Vector2();
    this._tmp = new THREE.Vector3();
  }

  // Orientation : azimut CAMERA.azimuthDeg + `angle` (radians). En jeu, toujours 0 (vue fixe) ;
  // l'écran titre fait tourner lentement la scène. Recalcule la base de l'écran.
  setOrbit(angle) {
    const el = THREE.MathUtils.degToRad(CAMERA.elevationDeg);
    const az = THREE.MathUtils.degToRad(CAMERA.azimuthDeg) + angle;
    this.offsetDir.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
    this.camera.position.copy(this.offsetDir);
    this.camera.lookAt(0, 0, 0);
    this.right.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
    this.up.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
    this.forward.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
  }

  setViewport(width, height) {
    this.viewW = width;
    this.viewH = height;
    this.update();
  }

  // Zoom qui fait tenir toute la grille dans la vue.
  fitZoom(gridSize) {
    const diagonalPx = gridSize * Math.SQRT2 * CAMERA.pixelsPerUnit;
    const zoomW = (this.viewW * 0.92) / diagonalPx;
    const zoomH = (this.viewH * 0.92) / (diagonalPx * 0.5 + 4 * CAMERA.pixelsPerUnit);
    return Math.min(zoomW, zoomH);
  }

  setZoom(z) {
    this.zoom = THREE.MathUtils.clamp(z, CAMERA.minZoom, CAMERA.maxZoom);
  }

  pan(dx, dz) {
    this.target.x += dx;
    this.target.z += dz;
  }

  // Limites de la cible : rectangle monde { xMin, xMax, zMin, zMax } (domaine et îlots ralliés)
  // élargi de CAMERA.panMargin.
  setBounds({ xMin, xMax, zMin, zMax }) {
    const m = CAMERA.panMargin;
    this.bounds = { xMin: xMin - m, xMax: xMax + m, zMin: zMin - m, zMax: zMax + m };
  }

  clampTarget() {
    const b = this.bounds;
    this.target.x = THREE.MathUtils.clamp(this.target.x, b.xMin, b.xMax);
    this.target.z = THREE.MathUtils.clamp(this.target.z, b.zMin, b.zMax);
    this.target.y = this.groundY;
  }

  update() {
    this.clampTarget();
    const ppu = CAMERA.pixelsPerUnit * this.zoom;
    const halfW = this.viewW / 2 / ppu;
    const halfH = this.viewH / 2 / ppu;
    const cam = this.camera;
    cam.left = -halfW;
    cam.right = halfW;
    cam.top = halfH;
    cam.bottom = -halfH;

    // Alignement au pixel interne dans le plan de l'écran.
    const step = 1 / ppu;
    const r = Math.round(this.target.dot(this.right) / step) * step;
    const u = Math.round(this.target.dot(this.up) / step) * step;
    const f = this.target.dot(this.forward);
    const snapped = this._tmp
      .copy(this.right).multiplyScalar(r)
      .addScaledVector(this.up, u)
      .addScaledVector(this.forward, f);

    cam.position.copy(snapped).addScaledVector(this.offsetDir, DISTANCE);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }

  // Point du sol (plan y = groundY) sous des coordonnées normalisées [-1, 1].
  groundAt(ndcX, ndcY, out = new THREE.Vector3()) {
    this._ndc.set(ndcX, ndcY);
    this._raycaster.setFromCamera(this._ndc, this.camera);
    return this._raycaster.ray.intersectPlane(this._plane, out);
  }
}
