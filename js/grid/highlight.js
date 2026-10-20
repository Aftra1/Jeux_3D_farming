// Surbrillance de la zone survolée (souris) ou touchée (doigt) :
// ambre si l'action est possible, rouge discret si elle est refusée.

import * as THREE from 'three';
import { GRID, PALETTE } from '../config.js';
import { createHighlightTexture } from '../render/textures.js';

export class TileHighlight {
  constructor(grid) {
    this.grid = grid;
    this.tile = null;
    this.material = new THREE.MeshBasicMaterial({
      map: createHighlightTexture(GRID.texelsPerTile),
      color: PALETTE.amber,
      transparent: true,
      depthWrite: false,
    });
    const geometry = new THREE.PlaneGeometry(GRID.tileSize, GRID.tileSize);
    geometry.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.renderOrder = 1;
    this.mesh.visible = false;
  }

  // Une seule case (ou null pour masquer).
  set(tile) {
    if (tile) this.setArea(tile.x, tile.z, 1, 1, true);
    else this.hide();
    this.tile = tile;
  }

  // Une emprise w x d de coin (x, z) ; un cadre par case.
  setArea(x, z, w, d, valid = true) {
    this.tile = this.grid.getTile(x, z);
    this.mesh.visible = true;
    this.mesh.scale.set(w, 1, d);
    this.material.map.repeat.set(w, d);
    this.material.color.set(valid ? PALETTE.amber : PALETTE.refuse);
    this.grid.footprintCenter(x, z, w, d, this.mesh.position);
    this.mesh.position.y += 0.01;
  }

  hide() {
    this.tile = null;
    this.mesh.visible = false;
  }

  // Respiration lente et douce, jamais clignotante.
  update(time) {
    if (!this.mesh.visible) return;
    this.material.opacity = 0.8 + 0.2 * Math.sin(time * 2.2);
  }
}
