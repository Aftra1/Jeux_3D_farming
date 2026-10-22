// Cases où le bâtiment en cours de pose (ou de déplacement) peut aller : de petits carrés pâles,
// un seul appel de dessin (InstancedMesh). Plus discrets que l'aura (ambre) : repère, pas bouton.

import * as THREE from 'three';
import { GRID, PALETTE } from '../config.js';

const SIZE = 0.8; // part de la case couverte : on devine la grille entre les carrés

export class ValidMarks {
  constructor(grid, scene) {
    this.grid = grid;
    const geometry = new THREE.PlaneGeometry(GRID.tileSize * SIZE, GRID.tileSize * SIZE);
    geometry.rotateX(-Math.PI / 2);
    this.material = new THREE.MeshBasicMaterial({
      color: PALETTE.parchment, transparent: true, opacity: 0.26, depthWrite: false,
    });
    this.mesh = new THREE.InstancedMesh(geometry, this.material, grid.tiles.length);
    this.mesh.renderOrder = 1;
    this.mesh.frustumCulled = false; // cases dispersées sur tout le terrain
    this.mesh.count = 0;
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.matrix = new THREE.Matrix4();
    this.point = new THREE.Vector3();
  }

  // tiles : [{ x, z }] cases à marquer.
  show(tiles) {
    const n = Math.min(tiles.length, this.grid.tiles.length);
    for (let i = 0; i < n; i++) {
      this.grid.tileCenter(tiles[i].x, tiles[i].z, this.point);
      this.point.y += 0.006;
      this.mesh.setMatrixAt(i, this.matrix.makeTranslation(this.point.x, this.point.y, this.point.z));
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.visible = n > 0;
  }

  hide() {
    this.mesh.visible = false;
  }
}
