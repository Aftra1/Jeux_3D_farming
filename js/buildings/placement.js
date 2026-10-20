// Mode placement : un type de bâtiment est sélectionné, un aperçu fantôme
// semi-transparent suit le pointeur, la pose est validée ou refusée.

import * as THREE from 'three';
import { PALETTE } from '../config.js';
import { getBuildingType } from './catalog.js';

const GHOST_OPACITY = 0.55;

export class Placement {
  constructor({ scene, grid, buildings, highlight, onChange }) {
    this.scene = scene;
    this.grid = grid;
    this.buildings = buildings;
    this.highlight = highlight;
    this.onChange = onChange || (() => {});

    this.type = null;
    this.ghost = null;
    this.target = null; // { x, z } coin de l'emprise visée
    this.check = null;  // résultat de canPlace pour la cible
    this.refuseMaterial = new THREE.MeshBasicMaterial({
      color: PALETTE.refuse,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    });
  }

  get active() {
    return this.type !== null;
  }

  start(type) {
    const def = getBuildingType(type);
    if (!def) return;
    this.#clearGhost();
    this.type = type;
    this.ghost = this.#makeGhost(def);
    this.ghost.visible = false;
    this.scene.add(this.ghost);
    this.target = null;
    this.check = null;
    this.onChange();
  }

  cancel() {
    if (!this.active) return;
    this.#clearGhost();
    this.type = null;
    this.target = null;
    this.check = null;
    this.highlight.hide();
    this.onChange();
  }

  // Vise le point du sol donné (null = pointeur hors de la vue).
  aim(point) {
    if (!this.active) return;
    if (!point || !this.grid.tileAtWorld(point)) {
      this.ghost.visible = false;
      this.highlight.hide();
      this.target = null;
      this.check = null;
      this.onChange();
      return;
    }
    const { w, d } = getBuildingType(this.type).footprint;
    const { x, z } = this.grid.footprintOrigin(point, w, d);
    if (this.target && this.target.x === x && this.target.z === z && this.ghost.visible) return;

    this.target = { x, z };
    this.check = this.buildings.canPlace(this.type, x, z);
    this.grid.footprintCenter(x, z, w, d, this.ghost.position);
    this.ghost.visible = true;
    this.#tint(this.check.ok);
    this.highlight.setArea(x, z, w, d, this.check.ok);
    this.onChange();
  }

  // Revalide la cible actuelle (après une pose, la case devient occupée).
  refresh() {
    if (!this.target) return;
    const { x, z } = this.target;
    const { w, d } = getBuildingType(this.type).footprint;
    this.check = this.buildings.canPlace(this.type, x, z);
    this.#tint(this.check.ok);
    this.highlight.setArea(x, z, w, d, this.check.ok);
    this.onChange();
  }

  // Tente une pose au point donné. Renvoie l'enregistrement créé ou null.
  tryPlace(point) {
    this.aim(point);
    if (!this.target || !this.check || !this.check.ok) return null;
    const record = this.buildings.place(this.type, this.target.x, this.target.z);
    this.refresh();
    return record;
  }

  #makeGhost(def) {
    const ghost = def.build();
    ghost.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = false;
      o.receiveShadow = false;
      const toGhost = (m) => {
        const c = m.clone();
        c.transparent = true;
        c.opacity = GHOST_OPACITY;
        c.depthWrite = false;
        return c;
      };
      o.userData.ghostMaterial = Array.isArray(o.material)
        ? o.material.map(toGhost)
        : toGhost(o.material);
      o.material = o.userData.ghostMaterial;
      o.renderOrder = 2;
    });
    return ghost;
  }

  #tint(ok) {
    this.ghost.traverse((o) => {
      if (!o.isMesh) return;
      o.material = ok
        ? o.userData.ghostMaterial
        : (Array.isArray(o.userData.ghostMaterial)
          ? o.userData.ghostMaterial.map(() => this.refuseMaterial)
          : this.refuseMaterial);
    });
  }

  #clearGhost() {
    if (!this.ghost) return;
    this.scene.remove(this.ghost);
    this.ghost.traverse((o) => {
      if (!o.isMesh) return;
      const list = Array.isArray(o.userData.ghostMaterial)
        ? o.userData.ghostMaterial : [o.userData.ghostMaterial];
      list.forEach((m) => m.dispose());
      o.geometry.dispose();
    });
    this.ghost = null;
  }
}
