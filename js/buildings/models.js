// Modèles low-poly des bâtiments, construits à partir de primitives
// (boîtes, prismes). Origine du modèle : centre de l'emprise, au ras du sol.

import * as THREE from 'three';
import { GRID, PALETTE } from '../config.js';
import {
  createPlankTexture,
  createShingleTexture,
  createWindowTexture,
  getToonRamp,
} from '../render/textures.js';

const T = GRID.texelsPerTile;

// Matériaux partagés entre tous les bâtiments (créés à la demande).
let mats = null;
function materials() {
  if (mats) return mats;
  const toon = (opts) => new THREE.MeshToonMaterial({ gradientMap: getToonRamp(), ...opts });
  mats = {
    planks: toon({ map: createPlankTexture(T) }),
    shingles: toon({ map: createShingleTexture(T) }),
    woodDark: toon({ color: PALETTE.woodDark }),
    stone: toon({ color: PALETTE.slateMid }),
    chimney: toon({ color: PALETTE.slateLight }),
    // Non éclairé : la fenêtre « brille » même dans l'ombre.
    window: new THREE.MeshBasicMaterial({ map: createWindowTexture() }),
  };
  return mats;
}

// Recale les UV d'une BoxGeometry en unités monde, pour une densité de
// texels constante (T px par unité) quelle que soit la taille de la boîte.
function boxWorldUV(geometry, w, h, d) {
  const uv = geometry.attributes.uv;
  // Faces : +x, -x, +y, -y, +z, -z ; 4 sommets chacune
  const sizes = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let face = 0; face < 6; face++) {
    const [su, sv] = sizes[face];
    for (let i = 0; i < 4; i++) {
      const k = face * 4 + i;
      uv.setXY(k, uv.getX(k) * su, uv.getY(k) * sv);
    }
  }
  uv.needsUpdate = true;
  return geometry;
}

function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const geometry = boxWorldUV(new THREE.BoxGeometry(w, h, d), w, h, d);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y + h / 2, z);
  return mesh;
}

// Toit à deux pans : prisme triangulaire, faîtage le long de x.
// Pignons en planches, pans en ardoise.
function gableRoof(width, height, length, m) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0);
  shape.lineTo(width / 2, 0);
  shape.lineTo(0, height);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: length, bevelEnabled: false });
  geometry.translate(0, 0, -length / 2);
  geometry.rotateY(Math.PI / 2);
  // Groupes ExtrudeGeometry : 0 = faces avant/arrière (pignons), 1 = côtés (pans)
  return new THREE.Mesh(geometry, [m.planks, m.shingles]);
}

// La Bibliothèque : 2x2 cases. Socle de pierre, murs de planches, poteaux
// d'angle, toit d'ardoise, cheminée, porte côté +z, fenêtre ambre côté +x
// (les deux faces visibles depuis la caméra iso).
export function buildLibrary() {
  const m = materials();
  const g = new THREE.Group();
  g.name = 'library';

  const wallW = 1.5;
  const wallH = 1.0;
  const base = 0.12;

  g.add(box(1.8, base, 1.8, m.stone));
  g.add(box(wallW, wallH, wallW, m.planks, 0, base, 0));

  const p = wallW / 2;
  for (const [x, z] of [[-p, -p], [p, -p], [-p, p], [p, p]]) {
    g.add(box(0.14, wallH, 0.14, m.woodDark, x, base, z));
  }

  const roof = gableRoof(1.86, 0.8, 1.86, m);
  roof.position.y = base + wallH;
  g.add(roof);
  g.add(box(0.22, 0.5, 0.22, m.chimney, -0.4, base + wallH + 0.25, -0.35));

  // Porte (face +z)
  g.add(box(0.36, 0.6, 0.06, m.woodDark, 0, base, p + 0.02));

  // Fenêtre éclairée (face +x) : cadre sombre + vitre ambre
  g.add(box(0.06, 0.56, 0.44, m.woodDark, p + 0.02, base + 0.3, 0));
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.44), m.window);
  glass.rotation.y = Math.PI / 2;
  glass.position.set(p + 0.055, base + 0.58, 0);
  g.add(glass);

  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
}
