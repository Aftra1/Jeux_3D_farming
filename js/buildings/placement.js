// Mode placement : un type de bâtiment est sélectionné, un aperçu fantôme
// semi-transparent suit le pointeur, la pose est validée ou refusée.
// Les règles (emplacement libre + coût) et la pose passent par `rules`
// (la Simulation) : canPlace(type, x, z) et placeBuilding(type, x, z).

import * as THREE from 'three';
import { PALETTE } from '../config.js';
import { getBuildingType } from './catalog.js';
import { auraTiles } from '../sim/simulation.js';

const GHOST_OPACITY = 0.55;

export class Placement {
  constructor({ scene, grid, rules, highlight, aura, onChange }) {
    this.scene = scene;
    this.aura = aura; // AuraPreview : zone d'effet et bâtiments renforcés
    this.grid = grid;
    this.rules = rules;
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
    this.aura.hide();
    this.onChange();
  }

  // Vise le point du sol donné (null = pointeur hors de la vue).
  aim(point) {
    if (!this.active) return;
    if (!point || !this.grid.tileAtWorld(point)) {
      this.ghost.visible = false;
      this.highlight.hide();
      this.aura.hide();
      this.target = null;
      this.check = null;
      this.onChange();
      return;
    }
    const { w, d } = getBuildingType(this.type).footprint;
    const { x, z } = this.grid.footprintOrigin(point, w, d);
    if (this.target && this.target.x === x && this.target.z === z && this.ghost.visible) return;

    this.target = { x, z };
    this.check = this.rules.canPlace(this.type, x, z);
    this.grid.footprintCenter(x, z, w, d, this.ghost.position);
    const { orient } = getBuildingType(this.type);
    if (orient) this.ghost.rotation.y = orient(x, z);
    this.ghost.visible = true;
    this.#tint(this.check.ok);
    this.highlight.setArea(x, z, w, d, this.check.ok);
    this.#showAura();
    this.onChange();
  }

  // Revalide la cible actuelle (case devenue occupée, Savoirs gagnés ou dépensés…).
  refresh() {
    if (!this.active || !this.target || !this.ghost.visible) return;
    this.#showAura(); // une pose a pu ajouter ou couvrir une Bibliothèque
    const { x, z } = this.target;
    const { w, d } = getBuildingType(this.type).footprint;
    const before = this.check;
    this.check = this.rules.canPlace(this.type, x, z);
    if (before && before.ok === this.check.ok && before.reason === this.check.reason) return;
    this.#tint(this.check.ok);
    this.highlight.setArea(x, z, w, d, this.check.ok);
    this.onChange();
  }

  // Tente une pose au point donné. Renvoie l'enregistrement créé ou null.
  tryPlace(point) {
    this.aim(point);
    if (!this.target || !this.check || !this.check.ok) return null;
    const record = this.rules.placeBuilding(this.type, this.target.x, this.target.z);
    this.refresh();
    return record;
  }

  // Cases teintées autour de l'aperçu et cadre sur les bâtiments qui seraient renforcés.
  #showAura() {
    const { x, z } = this.target;
    const targets = this.rules.wouldBoost(this.type, x, z)
      .map((r) => ({ x: r.x, z: r.z, ...getBuildingType(r.type).footprint }));
    this.aura.show(auraTiles(this.type, x, z), targets);
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
      if (!o.geometry.userData.shared) o.geometry.dispose(); // géométries fusionnées : partagées
    });
    this.ghost = null;
  }
}
