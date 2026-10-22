// Terrain de cases (domaine + îlots) et socle 3D du domaine.
// Repère : le domaine est centré sur l'origine, case (0,0) au coin -x/-z.

import * as THREE from 'three';
import { GRID } from '../config.js';
import {
  createGroundTopTexture,
  createGroundSideTexture,
  getToonRamp,
} from '../render/textures.js';
import { Terrain } from './terrain.js';

// Le domaine porte le socle 3D ; les îlots ont leur propre rendu (render/islands.js).
// Toute la logique des cases (zones, occupation, emprises) vient de Terrain.
export class Grid extends Terrain {
  constructor(size = GRID.size) {
    super(size);
    this.mesh = this.#buildMesh();
  }

  tileCenter(x, z, out = new THREE.Vector3()) {
    return super.tileCenter(x, z, out);
  }

  footprintCenter(x, z, w, d, out = new THREE.Vector3()) {
    return super.footprintCenter(x, z, w, d, out);
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
