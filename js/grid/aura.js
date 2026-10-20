// Aperçu d'aura pendant le placement : les cases de la zone d'effet sont
// légèrement teintées d'ambre et les bâtiments qui seraient renforcés reçoivent
// un cadre ambre (même texture que la surbrillance), avec la même respiration douce.

import * as THREE from 'three';
import { GRID, PALETTE } from '../config.js';
import { createHighlightTexture } from '../render/textures.js';

const FRAME_MARGIN = 0.5; // unités ajoutées à l'emprise ciblée

export class AuraPreview {
  constructor(grid, scene) {
    this.grid = grid;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.tileMaterial = new THREE.MeshBasicMaterial({
      color: PALETTE.amber, transparent: true, opacity: 0.18, depthWrite: false,
    });
    this.frameMaterial = new THREE.MeshBasicMaterial({
      map: createHighlightTexture(GRID.texelsPerTile),
      color: PALETTE.amber, transparent: true, depthWrite: false,
    });
    this.tiles = [];   // maillages réutilisés d'un appel à l'autre
    this.frames = [];
  }

  // tiles : [{ x, z }] (hors terrain ignorées) ; targets : [{ x, z, w, d }]
  show(tiles, targets) {
    const inside = tiles.filter((t) => this.grid.inBounds(t.x, t.z));
    inside.forEach((t, i) => {
      const mesh = this.tiles[i] || this.#plane(this.tiles, this.tileMaterial);
      mesh.scale.set(1, 1, 1);
      this.grid.tileCenter(t.x, t.z, mesh.position);
      mesh.position.y += 0.008;
      mesh.visible = true;
    });
    for (let i = inside.length; i < this.tiles.length; i++) this.tiles[i].visible = false;

    targets.forEach((t, i) => {
      // Un seul cadre autour de l'emprise, élargi pour déborder du socle du bâtiment.
      const mesh = this.frames[i] || this.#plane(this.frames, this.frameMaterial);
      mesh.scale.set(t.w + FRAME_MARGIN, 1, t.d + FRAME_MARGIN);
      this.grid.footprintCenter(t.x, t.z, t.w, t.d, mesh.position);
      mesh.position.y += 0.014;
      mesh.visible = true;
    });
    for (let i = targets.length; i < this.frames.length; i++) this.frames[i].visible = false;
  }

  hide() {
    for (const mesh of [...this.tiles, ...this.frames]) mesh.visible = false;
  }

  update(time) {
    this.frameMaterial.opacity = 0.8 + 0.2 * Math.sin(time * 2.2);
  }

  #plane(pool, material) {
    const geometry = new THREE.PlaneGeometry(GRID.tileSize, GRID.tileSize);
    geometry.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 1;
    this.group.add(mesh);
    pool.push(mesh);
    return mesh;
  }
}
