// Caméra isométrique orthographique : orientation fixe en jeu (orbite lente à l'écran titre),
// cible et zoom bornés. Mouvements doux (CAMERA dans config.js) : glisse avec inertie au
// relâchement, zoom interpolé vers le point visé par paliers de px entiers (ou demi-px) par unité,
// limites qui freinent puis ramènent doucement au lieu de bloquer net. step(dt) chaque image.
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
    this.zoom = 1;          // zoom affiché (palier)
    this.zoomFloat = 1;     // zoom continu, interpolé vers zoomTarget
    this.zoomTarget = 1;
    this.anchor = null;     // { ndc: {x, y}, world: Vector3 } : point maintenu sous le pointeur
    this.holding = false;   // geste en cours (glisser, pincer) : pas d'inertie ni de rappel
    this.velocity = new THREE.Vector2(); // glisse (unités/s sur x, z)
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

  // Zoom immédiat (début de partie, séquence de fin) : pas d'interpolation.
  setZoom(z) {
    this.zoomFloat = this.zoomTarget = THREE.MathUtils.clamp(z, CAMERA.minZoom, CAMERA.maxZoom);
    this.zoom = this.#steppedZoom(this.zoomFloat);
    this.anchor = null;
  }

  // Zoom doux vers `z`, en gardant sous `ndc` le point du sol `world` (par défaut celui qui y est).
  zoomTo(z, ndc, world = null) {
    this.zoomTarget = THREE.MathUtils.clamp(z, CAMERA.minZoom, CAMERA.maxZoom);
    const point = world ? world.clone() : this.groundAt(ndc.x, ndc.y);
    this.anchor = point ? { ndc: { x: ndc.x, y: ndc.y }, world: point } : null;
  }

  // Palier de zoom : px internes par unité multiple de CAMERA.zoomStep (pixels nets et réguliers).
  #steppedZoom(z) {
    const ppu = CAMERA.pixelsPerUnit;
    const step = CAMERA.zoomStep;
    const lo = Math.ceil((CAMERA.minZoom * ppu) / step) * step;
    const hi = Math.floor((CAMERA.maxZoom * ppu) / step) * step;
    return THREE.MathUtils.clamp(Math.round((z * ppu) / step) * step, lo, hi) / ppu;
  }

  pan(dx, dz) {
    this.target.x += dx;
    this.target.z += dz;
  }

  // Déplacement par un geste : au-delà des limites, le mouvement vers l'extérieur est freiné.
  drag(dx, dz) {
    const b = this.bounds;
    const { resistance } = CAMERA.edge;
    const t = this.target;
    if ((t.x > b.xMax && dx > 0) || (t.x < b.xMin && dx < 0)) dx *= resistance;
    if ((t.z > b.zMax && dz > 0) || (t.z < b.zMin && dz < 0)) dz *= resistance;
    this.pan(dx, dz);
  }

  // Geste commencé : la glisse s'arrête net (le doigt « attrape » la vue).
  hold() {
    this.holding = true;
    this.velocity.set(0, 0);
  }

  // Geste relâché avec une vitesse (unités/s) : la vue continue sur sa lancée et ralentit.
  // Zoom encore en mouvement : il se termine autour du dernier point, sans glisse.
  release(vx = 0, vz = 0) {
    this.holding = false;
    if (!this.zoomSettled) vx = vz = 0;
    else this.anchor = null;
    const max = CAMERA.inertia.maxSpeed;
    this.velocity.set(vx, vz);
    if (this.velocity.length() > max) this.velocity.setLength(max);
  }

  // Tout mouvement en cours s'arrête (séquence de fin, retour au jeu).
  stop() {
    this.velocity.set(0, 0);
    this.anchor = null;
    this.zoomTarget = this.zoomFloat = this.zoom;
    this.holding = false;
  }

  // Recale la cible pour que le point d'ancrage revienne sous son pointeur (freiné hors limites).
  applyAnchor() {
    if (!this.anchor) return;
    this.update();
    const now = this.groundAt(this.anchor.ndc.x, this.anchor.ndc.y, this._tmp2 ??= new THREE.Vector3());
    if (now) this.drag(this.anchor.world.x - now.x, this.anchor.world.z - now.z);
    this.update();
  }

  get zoomSettled() {
    return this.zoomFloat === this.zoomTarget;
  }

  // Une image : zoom interpolé (point visé maintenu), glisse, rappel doux dans les limites.
  step(dt) {
    const k = (rate) => 1 - Math.exp(-rate * dt);
    if (Math.abs(this.zoomTarget - this.zoomFloat) > 1e-4) this.zoomFloat += (this.zoomTarget - this.zoomFloat) * k(CAMERA.zoomSmoothing);
    else this.zoomFloat = this.zoomTarget;
    this.zoom = this.#steppedZoom(this.zoomFloat);
    if (this.anchor) {
      this.applyAnchor();
      if (this.zoomFloat === this.zoomTarget && !this.holding) this.anchor = null;
    }
    if (this.holding) return;
    const v = this.velocity;
    if (v.lengthSq() > 0) {
      this.drag(v.x * dt, v.y * dt);
      v.multiplyScalar(Math.exp(-CAMERA.inertia.friction * dt * (this.#outside() ? 3 : 1)));
      if (v.length() < CAMERA.inertia.minSpeed) v.set(0, 0);
    }
    // Rappel : la cible revient doucement dans les limites.
    const b = this.bounds;
    const t = this.target;
    const s = k(CAMERA.edge.spring);
    t.x += (THREE.MathUtils.clamp(t.x, b.xMin, b.xMax) - t.x) * s;
    t.z += (THREE.MathUtils.clamp(t.z, b.zMin, b.zMax) - t.z) * s;
  }

  #outside() {
    const b = this.bounds;
    const t = this.target;
    return t.x < b.xMin || t.x > b.xMax || t.z < b.zMin || t.z > b.zMax;
  }

  // Limites de la cible : rectangle monde { xMin, xMax, zMin, zMax } (domaine et îlots ralliés)
  // élargi de CAMERA.panMargin.
  setBounds({ xMin, xMax, zMin, zMax }) {
    const m = CAMERA.panMargin;
    this.bounds = { xMin: xMin - m, xMax: xMax + m, zMin: zMin - m, zMax: zMax + m };
  }

  clampTarget() {
    const b = this.bounds;
    const o = CAMERA.edge.overshoot; // au-delà : butée (le rappel de step ramène dans les limites)
    this.target.x = THREE.MathUtils.clamp(this.target.x, b.xMin - o, b.xMax + o);
    this.target.z = THREE.MathUtils.clamp(this.target.z, b.zMin - o, b.zMax + o);
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
