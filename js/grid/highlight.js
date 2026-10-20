// Surbrillance ambre de la case survolée (souris) ou touchée (doigt).

import * as THREE from 'three';
import { GRID } from '../config.js';
import { createHighlightTexture } from '../render/textures.js';

export class TileHighlight {
  constructor(grid) {
    this.grid = grid;
    this.tile = null;
    this.material = new THREE.MeshBasicMaterial({
      map: createHighlightTexture(GRID.texelsPerTile),
      transparent: true,
      depthWrite: false,
    });
    const geometry = new THREE.PlaneGeometry(GRID.tileSize, GRID.tileSize);
    geometry.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.renderOrder = 1;
    this.mesh.visible = false;
  }

  set(tile) {
    this.tile = tile;
    this.mesh.visible = !!tile;
    if (tile) {
      this.grid.tileCenter(tile.x, tile.z, this.mesh.position);
      this.mesh.position.y += 0.01;
    }
  }

  // Respiration lente et douce, jamais clignotante.
  update(time) {
    if (!this.mesh.visible) return;
    this.material.opacity = 0.8 + 0.2 * Math.sin(time * 2.2);
  }
}
