// Mode placement : un type de bâtiment est sélectionné, un aperçu fantôme
// semi-transparent suit le pointeur, la pose est validée ou refusée.
// Les règles (emplacement libre + coût) et la pose passent par `rules`
// (la Simulation) : canPlace(type, x, z) et placeBuilding(type, x, z).
// Même mécanique pour déplacer un bâtiment posé (`startMove`) : l'aperçu remplace le bâtiment
// (soulevé), `canMove` / `moveBuilding` remplacent `canPlace` / `placeBuilding`, gratuit.

import * as THREE from 'three';
import { PALETTE } from '../config.js';
import { getBuildingType } from './catalog.js';
import { auraTiles } from '../sim/simulation.js';
import { BALANCE } from '../balance.js';

const GHOST_OPACITY = 0.55;

export class Placement {
  constructor({ scene, grid, rules, buildings, highlight, aura, marks, onChange }) {
    this.scene = scene;
    this.buildings = buildings; // BuildingManager : lever / reposer le bâtiment déplacé
    this.marks = marks;         // ValidMarks : cases où l'on peut poser
    this.aura = aura; // AuraPreview : zone d'effet et bâtiments renforcés
    this.grid = grid;
    this.rules = rules;
    this.highlight = highlight;
    this.onChange = onChange || (() => {});

    this.type = null;
    this.moving = null; // uid du bâtiment déplacé (null = pose d'un nouveau bâtiment)
    this.marksKey = null;
    this.armedAt = null; // tactile : { x, z } de l'aperçu que le joueur a choisi (tap ou glisser) ; un tap dessus pose
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
    this.#begin(type, null, null);
  }

  // Déplacer le bâtiment posé `record` : il est soulevé, son aperçu suit le pointeur.
  startMove(record) {
    if (!record) return;
    this.#begin(record.type, record.uid, record);
  }

  #begin(type, moving, record) {
    const def = getBuildingType(type);
    if (!def) return;
    this.#release();
    this.#clearGhost();
    this.type = type;
    this.moving = moving;
    this.ghost = this.#makeGhost(def, record);
    this.ghost.visible = false;
    this.scene.add(this.ghost);
    if (moving !== null) this.buildings.lift(moving);
    this.target = null;
    this.check = null;
    this.armedAt = null;
    this.#markValid(true);
    this.onChange();
  }

  // Sortie sans pose : un bâtiment soulevé retrouve sa place.
  cancel() {
    if (!this.active) return;
    this.#release();
    this.#end();
    this.onChange();
  }

  #release() {
    if (this.moving !== null) this.buildings.drop(this.moving);
    this.moving = null;
  }

  #end() {
    this.#clearGhost();
    this.type = null;
    this.moving = null;
    this.target = null;
    this.check = null;
    this.marksKey = null;
    this.armedAt = null;
    this.highlight.hide();
    this.aura.hide();
    this.marks.hide();
  }

  // Règle de validité de la cible : pose (coût compris) ou déplacement (gratuit).
  #rule(x, z) {
    return this.moving !== null ? this.rules.canMove(this.moving, x, z) : this.rules.canPlace(this.type, x, z);
  }

  // Effet de la pose à l'endroit visé, en une ligne (ou null) : « +2 Bibliothèques renforcées »
  // pour une source d'aura, « renforcée » pour un bâtiment qui entrerait dans une aura.
  get effect() {
    if (!this.active || !this.target || !this.ghost?.visible) return null;
    const { x, z } = this.target;
    const def = getBuildingType(this.type);
    const rules = BALANCE.buildings[this.type];
    if (rules.aura) {
      const n = this.rules.wouldBoost(this.type, x, z).length;
      const target = getBuildingType(rules.aura.targets[0]);
      const e = target.feminine ? 'e' : '';
      return n > 0
        ? `+${n} ${n > 1 ? target.plural : target.name} renforcé${e}${n > 1 ? 's' : ''}`
        : `Aucun${e} ${target.name} à renforcer ici`;
    }
    const boosted = this.rules.wouldBeBoosted(this.type, x, z, this.moving);
    return boosted ? `${def.name} renforcé${def.feminine ? 'e' : ''}` : null;
  }

  // Marque d'un coup d'œil les cases où poser (bords pour l'Embarcadère, carré 2x2 pour le Phare).
  // Le coût n'entre pas en compte : on voit où poser même quand on ne peut pas encore payer.
  // Recalculé seulement quand les bâtiments ou les îlots ouverts changent.
  #markValid(force = false) {
    const key = `${this.rules.buildings.records.length}|${this.rules.islands.length}`;
    if (!force && key === this.marksKey) return;
    this.marksKey = key;
    const { w, d } = getBuildingType(this.type).footprint;
    const cells = new Set();
    for (const [x, z] of this.grid.freeOrigins(w, d, this.moving)) {
      const check = this.#rule(x, z);
      if (!check.ok && check.reason !== 'cost') continue;
      for (const tile of this.grid.footprintTiles(x, z, w, d)) cells.add(tile);
    }
    this.marks.show([...cells]);
  }

  // Retient l'aperçu actuel comme choisi par le joueur (fin d'un geste de visée, premier tap).
  arm() {
    this.armedAt = this.target && this.ghost.visible ? { ...this.target } : null;
  }

  // Le pointeur vise-t-il l'emprise déjà choisie ? (second tap tactile = pose ; l'aperçu posé au
  // centre à la sélection de l'outil, ou déplacé par un doigt qui touche, n'est pas « choisi »)
  isTargeting(point) {
    if (!this.active || !this.armedAt || !point || !this.grid.tileAtWorld(point)) return false;
    const { w, d } = getBuildingType(this.type).footprint;
    const { x, z } = this.grid.footprintOrigin(point, w, d);
    return x === this.armedAt.x && z === this.armedAt.z;
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
    this.check = this.#rule(x, z);
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
    this.#markValid();
    const { x, z } = this.target;
    const { w, d } = getBuildingType(this.type).footprint;
    const before = this.check;
    this.check = this.#rule(x, z);
    if (before && before.ok === this.check.ok && before.reason === this.check.reason) return;
    this.#tint(this.check.ok);
    this.highlight.setArea(x, z, w, d, this.check.ok);
    this.onChange();
  }

  // Tente une pose (ou un déplacement) au point donné. Renvoie l'enregistrement créé ou déplacé, ou null.
  // Un déplacement réussi termine le mode ; une pose le laisse actif (pose en série).
  tryPlace(point) {
    this.aim(point);
    if (!this.target || !this.check || !this.check.ok) return null;
    if (this.moving !== null) {
      const record = this.rules.moveBuilding(this.moving, this.target.x, this.target.z);
      if (record) {
        this.moving = null; // le bâtiment s'est reposé de lui-même
        this.#end();
        this.onChange();
      }
      return record;
    }
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

  #makeGhost(def, record) {
    const ghost = def.build(record);
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
