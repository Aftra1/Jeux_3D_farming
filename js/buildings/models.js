// Modèles low-poly des bâtiments, construits à partir de primitives
// (boîtes, prismes, cylindres). Origine du modèle : centre de l'emprise, au ras du sol.
//
// Lumières : un maillage « lumineux » (fenêtre, meurtrière) porte
// userData.lightMaterials = { on, off } ; setLightOn(view, on) bascule entre les
// deux matériaux partagés (aucune allocation, aucune vraie lumière ajoutée).

import * as THREE from 'three';
import { GRID, PALETTE, DAYCYCLE } from '../config.js';
import {
  createPlankTexture,
  createShingleTexture,
  createStoneTexture,
  createWindowTexture,
  createSlitTexture,
  createGlowRingTexture,
  getToonRamp,
} from '../render/textures.js';

const T = GRID.texelsPerTile;
const BOOST_RING_TEXELS = 17; // ≈ 2,1 unités : déborde juste du socle de la Bibliothèque

// Matériaux partagés entre tous les bâtiments (créés à la demande).
let mats = null;
function materials() {
  if (mats) return mats;
  const toon = (opts) => new THREE.MeshToonMaterial({ gradientMap: getToonRamp(), ...opts });
  // Non éclairés : une ouverture allumée « brille » même dans l'ombre.
  const basic = (map) => new THREE.MeshBasicMaterial({ map });

  const towerStone = createStoneTexture(T);
  towerStone.repeat.set(2, 1.7); // ≈ circonférence x hauteur de la tour, en unités
  const domeShingles = createShingleTexture(T);
  domeShingles.repeat.set(3, 1);

  mats = {
    planks: toon({ map: createPlankTexture(T) }),
    shingles: toon({ map: createShingleTexture(T) }),
    woodDark: toon({ color: PALETTE.woodDark }),
    stone: toon({ color: PALETTE.slateMid }),
    chimney: toon({ color: PALETTE.slateLight }),
    towerStone: toon({ map: towerStone }),
    lightStone: toon({ color: PALETTE.parchmentDark }),
    dome: toon({ map: domeShingles }),
    ring: toon({ color: PALETTE.slateMid }),
    window: { on: basic(createWindowTexture(true)), off: basic(createWindowTexture(false)) },
    slit: { on: basic(createSlitTexture(true)), off: basic(createSlitTexture(false)) },
    standingStone: toon({ color: PALETTE.slateLight }),
    basin: toon({ color: PALETTE.slateMid }),
    ember: new THREE.MeshBasicMaterial({ color: PALETTE.amber }),
    halo: new THREE.MeshBasicMaterial({
      color: PALETTE.amberLight, transparent: true, opacity: 0.35, depthWrite: false,
    }),
    boostRing: new THREE.MeshBasicMaterial({
      map: createGlowRingTexture(BOOST_RING_TEXELS),
      color: PALETTE.amberLight, transparent: true, opacity: 0.7, depthWrite: false,
    }),
  };
  return mats;
}

// Nuit (0..1) : fenêtres, meurtrières et braises allumées brillent un peu plus, le halo
// des Sanctuaires s'épaissit. Matériaux partagés : un seul réglage pour tout le domaine.
export function setNightGlow(night) {
  const m = materials();
  const k = 1 + DAYCYCLE.glowBoost * night;
  m.window.on.color.setScalar(k);
  m.slit.on.color.setScalar(k);
  m.ember.color.set(PALETTE.amber).multiplyScalar(k);
  const [day, full] = DAYCYCLE.haloOpacity;
  m.halo.opacity = day + (full - day) * night;
}

export function setLightOn(view, on) {
  view.traverse((o) => {
    const lm = o.userData.lightMaterials;
    if (lm) o.material = on ? lm.on : lm.off;
  });
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

// Normales par face (aspect facetté low-poly) : MeshToonMaterial n'a pas de
// `flatShading`, on désindexe donc la géométrie avant de recalculer les normales.
function faceted(geometry) {
  const flat = geometry.toNonIndexed();
  flat.computeVertexNormals();
  geometry.dispose();
  return flat;
}

function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const geometry = boxWorldUV(new THREE.BoxGeometry(w, h, d), w, h, d);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y + h / 2, z);
  return mesh;
}

// Panneau lumineux (fenêtre, meurtrière) orienté vers `angle` (rad, autour de y).
function lightPanel(width, height, pair, angle) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), pair.on);
  mesh.rotation.y = angle;
  mesh.userData.lightMaterials = pair;
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

function finish(group) {
  group.traverse((o) => {
    if (o.isMesh && !o.userData.noShadow) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return group;
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
  const glass = lightPanel(0.32, 0.44, m.window, Math.PI / 2);
  glass.position.set(p + 0.055, base + 0.58, 0);
  g.add(glass);

  return finish(g);
}

// L'Observatoire : 1 case, silhouette verticale. Tour octogonale effilée en
// pierre claire, anneau d'ardoise, coupole à facettes, lunette, porte et
// meurtrière ambre sur la face tournée vers la caméra (45°).
export function buildObservatory() {
  const m = materials();
  const g = new THREE.Group();
  g.name = 'observatory';

  const base = 0.1;
  const towerH = 1.6;
  const rBottom = 0.34;
  const rTop = 0.27;
  const sides = 8;
  const thetaStart = Math.PI / sides; // une face pile face à la caméra (45°)

  // Socle octogonal
  const plinth = new THREE.Mesh(
    faceted(new THREE.CylinderGeometry(0.44, 0.46, base, sides, 1, false, thetaStart)),
    m.lightStone,
  );
  plinth.position.y = base / 2;
  g.add(plinth);

  // Tour
  const tower = new THREE.Mesh(
    faceted(new THREE.CylinderGeometry(rTop, rBottom, towerH, sides, 1, false, thetaStart)),
    m.towerStone,
  );
  tower.position.y = base + towerH / 2;
  g.add(tower);

  // Anneau sous la coupole
  const ringH = 0.08;
  const ring = new THREE.Mesh(
    faceted(new THREE.CylinderGeometry(0.33, 0.33, ringH, sides, 1, false, thetaStart)),
    m.ring,
  );
  ring.position.y = base + towerH + ringH / 2;
  g.add(ring);

  // Coupole à facettes (demi-sphère très basse résolution)
  const dome = new THREE.Mesh(
    faceted(new THREE.SphereGeometry(0.31, sides, 3, thetaStart, Math.PI * 2, 0, Math.PI / 2)),
    m.dome,
  );
  dome.position.y = base + towerH + ringH;
  g.add(dome);

  // Lunette qui dépasse de la coupole, pointée vers le ciel du soir
  const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.42, 6), m.woodDark);
  scope.position.set(0.12, base + towerH + ringH + 0.2, 0.12);
  scope.rotation.set(0.6, Math.PI / 4, 0, 'YXZ');
  g.add(scope);

  // Face tournée vers la caméra : direction (sin 45°, 0, cos 45°)
  const facing = Math.PI / 4;
  const dir = new THREE.Vector3(Math.sin(facing), 0, Math.cos(facing));
  const apothem = (r) => r * Math.cos(Math.PI / sides);
  const radiusAt = (y) => rBottom + (rTop - rBottom) * ((y - base) / towerH);

  // Porte
  const doorH = 0.42;
  const door = new THREE.Mesh(new THREE.PlaneGeometry(0.2, doorH), m.woodDark);
  door.rotation.y = facing;
  door.position.copy(dir).multiplyScalar(apothem(radiusAt(base + doorH / 2)) + 0.012);
  door.position.y = base + doorH / 2;
  g.add(door);

  // Meurtrière éclairée, en haut de la tour
  const slitY = base + towerH - 0.42;
  const slit = lightPanel(0.12, 0.3, m.slit, facing);
  slit.position.copy(dir).multiplyScalar(apothem(radiusAt(slitY)) + 0.012);
  slit.position.y = slitY;
  g.add(slit);

  return finish(g);
}

// Le Sanctuaire : 1 case, silhouette basse et large. Dalle ronde de pierre claire,
// cercle de six pierres dressées d'ardoise, vasque centrale d'où monte une lueur
// ambre douce (braise non éclairée + halo translucide).
export function buildSanctuary() {
  const m = materials();
  const g = new THREE.Group();
  g.name = 'sanctuary';

  const base = 0.06;
  const slab = new THREE.Mesh(
    faceted(new THREE.CylinderGeometry(0.46, 0.48, base, 10)),
    m.lightStone,
  );
  slab.position.y = base / 2;
  g.add(slab);

  // Pierres dressées, de hauteurs légèrement inégales, inclinées vers l'extérieur
  const heights = [0.42, 0.34, 0.46, 0.36, 0.44, 0.32];
  heights.forEach((h, i) => {
    const a = (i / heights.length) * Math.PI * 2 + Math.PI / 6;
    const stone = box(0.11, h, 0.08, m.standingStone);
    stone.position.set(Math.sin(a) * 0.36, base + h / 2, Math.cos(a) * 0.36);
    stone.rotation.set(0, a, 0);
    stone.rotateX(0.08);
    g.add(stone);
  });

  // Vasque : pied court et coupe évasée
  const foot = new THREE.Mesh(faceted(new THREE.CylinderGeometry(0.07, 0.1, 0.14, 6)), m.basin);
  foot.position.y = base + 0.07;
  g.add(foot);
  const bowl = new THREE.Mesh(faceted(new THREE.CylinderGeometry(0.18, 0.1, 0.1, 8)), m.basin);
  bowl.position.y = base + 0.19;
  g.add(bowl);

  // Lueur : braise ambre au ras de la vasque, halo qui monte (sans ombre)
  const ember = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.02, 8), m.ember);
  ember.position.y = base + 0.24;
  g.add(ember);
  const halo = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.13, 0.5, 8, 1, true), m.halo);
  halo.position.y = base + 0.5;
  halo.userData.noShadow = true;
  g.add(halo);

  return finish(g);
}

// Repère permanent d'un bâtiment renforcé par une aura : lueur pointillée au sol,
// autour du socle. Non éclairé, sans ombre ni contour (pas d'écriture de profondeur).
export function buildBoostMarker(w, d) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.1, d + 0.1), materials().boostRing);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.012;
  mesh.renderOrder = 1;
  mesh.name = 'boostMarker';
  return mesh;
}
