// Grille logique de cases et socle 3D qui la représente.
// Repère : la grille est centrée sur l'origine, case (0,0) au coin -x/-z.

import * as THREE from 'three';
import { GRID } from '../config.js';
import {
  createGroundTopTexture,
  createGroundSideTexture,
  getToonRamp,
} from '../render/textures.js';

export class Grid {
  constructor(size = GRID.size) {
    this.size = size;
    this.half = (size * GRID.tileSize) / 2;
    this.topY = 0;
    this.tiles = [];
    for (let z = 0; z < size; z++) {
      for (let x = 0; x < size; x++) {
        this.tiles.push({ x, z, ground: 'grass' });
      }
    }
    this.mesh = this.#buildMesh();
  }

  inBounds(x, z) {
    return x >= 0 && z >= 0 && x < this.size && z < this.size;
  }

  getTile(x, z) {
    return this.inBounds(x, z) ? this.tiles[z * this.size + x] : null;
  }

  // Case sous un point du monde, ou null hors grille.
  tileAtWorld(point) {
    if (!point) return null;
    const x = Math.floor((point.x + this.half) / GRID.tileSize);
    const z = Math.floor((point.z + this.half) / GRID.tileSize);
    return this.getTile(x, z);
  }

  // Centre (sur le dessus du socle) d'une case.
  tileCenter(x, z, out = new THREE.Vector3()) {
    return out.set(
      (x + 0.5) * GRID.tileSize - this.half,
      this.topY,
      (z + 0.5) * GRID.tileSize - this.half,
    );
  }

  #buildMesh() {
    const t = GRID.texelsPerTile;
    const width = this.size * GRID.tileSize;
    const h = GRID.slabHeight;
    const sideTexels = Math.round(h * t);

    const top = new THREE.MeshToonMaterial({
      map: createGroundTopTexture(this.size, t),
      gradientMap: getToonRamp(),
    });
    const sideTex = createGroundSideTexture(t, sideTexels);
    sideTex.repeat.set(this.size, 1);
    const side = new THREE.MeshToonMaterial({ map: sideTex, gradientMap: getToonRamp() });

    // Ordre des faces BoxGeometry : +x, -x, +y, -y, +z, -z
    const geometry = new THREE.BoxGeometry(width, h, width);
    const mesh = new THREE.Mesh(geometry, [side, side, top, side, side, side]);
    mesh.position.y = this.topY - h / 2;
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    return mesh;
  }
}
