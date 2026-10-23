// Modèles low-poly des bâtiments, construits à partir de primitives
// (boîtes, prismes, cylindres). Origine du modèle : centre de l'emprise, au ras du sol.
//
// Lumières : un maillage « lumineux » (fenêtre, meurtrière) porte
// userData.lightMaterials = { on, off } ; setLightOn(view, on) bascule entre les
// deux matériaux partagés (aucune allocation, aucune vraie lumière ajoutée).

import * as THREE from 'three';
import { GRID, PALETTE, DAYCYCLE, LAKE } from '../config.js';
import {
  createPlankTexture,
  createShingleTexture,
  createStoneTexture,
  createWindowTexture,
  createSlitTexture,
  createGlowRingTexture,
  getToonRamp,
} from '../render/textures.js';
import { compactModel } from '../render/merge.js';

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
    bronze: toon({ color: PALETTE.bronze }),
    // Cloche : bronze sombre au repos, éclat ambre pâle une fois chargée ou quand elle sonne.
    bell: { on: new THREE.MeshBasicMaterial({ color: PALETTE.amberLight }), off: toon({ color: PALETTE.bronze }) },
    bellHalo: { on: new THREE.MeshBasicMaterial({ color: PALETTE.amberLight, transparent: true, opacity: 0.3, depthWrite: false }),
      off: new THREE.MeshBasicMaterial({ visible: false }) },
    parchmentSheet: toon({ color: PALETTE.parchment }),
    banner: toon({ color: PALETTE.sage }),
    bannerTrim: toon({ color: PALETTE.parchment }),
    sail: toon({ color: PALETTE.parchment }),
    basin: toon({ color: PALETTE.slateMid }),
    ember: new THREE.MeshBasicMaterial({ color: PALETTE.amber }),
    halo: new THREE.MeshBasicMaterial({
      color: PALETTE.amberLight, transparent: true, opacity: 0.35, depthWrite: false,
    }),
    // Phare : verre de lanterne éteint (ardoise) ou allumé (ambre, non éclairé)
    lantern: {
      on: new THREE.MeshBasicMaterial({ color: PALETTE.amberLight }),
      off: toon({ color: PALETTE.slate }),
    },
    lanternHalo: new THREE.MeshBasicMaterial({
      color: PALETTE.amberLight, transparent: true, opacity: 0.2, depthWrite: false,
    }),
    boostRing: new THREE.MeshBasicMaterial({
      map: createGlowRingTexture(BOOST_RING_TEXELS),
      color: PALETTE.amberLight, transparent: true, opacity: 0.7, depthWrite: false,
    }),
  };
  return mats;
}

// Séquence de fin : la lanterne reste éteinte jusqu'à l'instant où elle s'allume.
export function setLanternLit(view, lit) {
  const lantern = view?.userData.lantern;
  if (lantern) lantern.material = lit ? materials().lantern.on : materials().lantern.off;
}

// Nuit (0..1) : fenêtres, meurtrières et braises allumées brillent un peu plus, le halo
// des Sanctuaires s'épaissit. Matériaux partagés : un seul réglage pour tout le domaine.
export function setNightGlow(night) {
  const m = materials();
  const k = 1 + DAYCYCLE.glowBoost * night;
  m.window.on.color.setScalar(k);
  m.slit.on.color.setScalar(k);
  m.ember.color.set(PALETTE.amber).multiplyScalar(k);
  m.lantern.on.color.set(PALETTE.amberLight).multiplyScalar(k);
  const [day, full] = DAYCYCLE.haloOpacity;
  m.halo.opacity = day + (full - day) * night;
  m.lanternHalo.opacity = (day + (full - day) * night) * 0.6;
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

// Géométrie partagée par tous les exemplaires (jamais libérée avec un modèle) : les pièces
// lumineuses, hors fusion, sont ainsi instanciables (buildings/batches.js).
const sharedGeometries = new Map();
function sharedGeometry(key, create) {
  if (!sharedGeometries.has(key)) {
    const geometry = create();
    geometry.userData.shared = true;
    sharedGeometries.set(key, geometry);
  }
  return sharedGeometries.get(key);
}

// Panneau lumineux (fenêtre, meurtrière) orienté vers `angle` (rad, autour de y).
function lightPanel(width, height, pair, angle) {
  const mesh = new THREE.Mesh(sharedGeometry(`plane:${width}x${height}`, () => new THREE.PlaneGeometry(width, height)), pair.on);
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

// Ombres, puis fusion des pièces fixes par matériau (géométries partagées entre exemplaires).
function finish(group, key = group.name) {
  group.traverse((o) => {
    if (o.isMesh && !o.userData.noShadow) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return compactModel(group, key);
}

// Niveau d'amélioration d'un enregistrement (1 pour l'aperçu de pose, sans enregistrement).
const levelFor = (record) => Math.max(1, record?.level ?? 1);

// Bannière : mât de bois et grand fanion de parchemin liseré de vert sauge, tourné vers la caméra (45°) :
// le niveau 3 se lit d'un coup d'œil.
function bannerAt(x, y, z, height = 0.9, [fw, fh] = [0.5, 0.36]) {
  const m = materials();
  const b = new THREE.Group();
  b.position.set(x, y, z);
  b.rotation.y = Math.PI / 4;
  b.add(box(0.06, height, 0.06, m.woodDark));
  const cx = fw / 2 + 0.03;
  const top = height - 0.06;
  b.add(box(fw, fh, 0.04, m.bannerTrim, cx, top - fh));
  b.add(box(fw, 0.07, 0.05, m.banner, cx, top - 0.07));
  b.add(box(fw, 0.07, 0.05, m.banner, cx, top - fh));
  return b;
}

// Lanterne ambre sur un poteau (éteinte avec le bâtiment en pause : `lightMaterials`).
function lanternAt(x, y, z, post = 0.4, size = 0.17) {
  const m = materials();
  const b = new THREE.Group();
  b.add(box(0.06, post, 0.06, m.woodDark, x, y, z));
  const glass = box(size, size, size, m.lantern.on, x, y + post, z);
  glass.geometry.dispose();
  glass.geometry = sharedGeometry(`lanternGlass:${size}`, () => boxWorldUV(new THREE.BoxGeometry(size, size, size), size, size, size));
  glass.userData.lightMaterials = m.lantern;
  glass.userData.noShadow = true;
  b.add(glass);
  b.add(box(size + 0.06, 0.05, size + 0.06, m.woodDark, x, y + post + size, z));
  return b;
}

// La Bibliothèque : 2x2 cases. Socle de pierre, murs de planches, poteaux
// d'angle, toit d'ardoise, cheminée, porte côté +z, fenêtre ambre côté +x
// (les deux faces visibles depuis la caméra iso).
//
// Niveaux : 2 = un étage de plus (fenêtre éclairée, cheminée relevée) ; 3 = en plus une bannière
// sur le faîte et une lanterne près de la porte.
export function buildLibrary(record) {
  const level = levelFor(record);
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

  let eaves = base + wallH;
  if (level >= 2) {
    const upper = 0.55;
    g.add(box(1.5, 0.08, 1.5, m.woodDark, 0, eaves)); // plancher débordant
    g.add(box(1.28, upper, 1.28, m.planks, 0, eaves + 0.08));
    for (const [x, z] of [[-0.64, -0.64], [0.64, -0.64], [-0.64, 0.64], [0.64, 0.64]]) {
      g.add(box(0.12, upper, 0.12, m.woodDark, x, eaves + 0.08, z));
    }
    g.add(box(0.06, 0.34, 0.34, m.woodDark, 0.65, eaves + 0.2, 0));
    const upperGlass = lightPanel(0.22, 0.3, m.window, Math.PI / 2);
    upperGlass.position.set(0.685, eaves + 0.37, 0);
    g.add(upperGlass);
    eaves += 0.08 + upper;
  }
  const span = level >= 2 ? 1.62 : 1.86;
  const roof = gableRoof(span, 0.8, span, m);
  roof.position.y = eaves;
  g.add(roof);
  g.add(box(0.22, 0.5, 0.22, m.chimney, -0.4, eaves + 0.25, -0.35));
  if (level >= 3) {
    g.add(bannerAt(0.55, eaves + 0.74, 0, 1.0, [0.55, 0.4]));
    g.add(lanternAt(0.7, base, 0.78, 0.5));
  }

  // Porte (face +z)
  g.add(box(0.36, 0.6, 0.06, m.woodDark, 0, base, p + 0.02));

  // Fenêtre éclairée (face +x) : cadre sombre + vitre ambre
  g.add(box(0.06, 0.56, 0.44, m.woodDark, p + 0.02, base + 0.3, 0));
  const glass = lightPanel(0.32, 0.44, m.window, Math.PI / 2);
  glass.position.set(p + 0.055, base + 0.58, 0);
  g.add(glass);

  return finish(g, `library:${level}`);
}

// L'Observatoire : 1 case, silhouette verticale. Tour octogonale effilée en
// pierre claire, anneau d'ardoise, coupole à facettes, lunette, porte et
// meurtrière ambre sur la face tournée vers la caméra (45°).
//
// Niveaux : 2 = tour rehaussée avec une galerie de bois ; 3 = tour plus haute encore, une seconde
// meurtrière et une lanterne ambre au sommet de la coupole.
export function buildObservatory(record) {
  const level = levelFor(record);
  const m = materials();
  const g = new THREE.Group();
  g.name = 'observatory';

  const base = 0.1;
  const towerH = 1.6 + 0.4 * (level - 1);
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

  // Galerie de bois à mi-hauteur (niveaux 2 et 3) : plateforme et garde-corps.
  if (level >= 2) {
    const gy = base + towerH * 0.5;
    const gallery = new THREE.Mesh(
      faceted(new THREE.CylinderGeometry(0.46, 0.4, 0.07, sides, 1, false, thetaStart)), m.woodDark);
    gallery.position.y = gy;
    g.add(gallery);
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      g.add(box(0.035, 0.2, 0.035, m.woodDark, Math.sin(a) * 0.42, gy + 0.035, Math.cos(a) * 0.42));
    }
    const rail = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.022, 4, sides), m.woodDark);
    rail.rotation.x = Math.PI / 2;
    rail.rotation.z = Math.PI / sides;
    rail.position.y = gy + 0.23;
    g.add(rail);
  }
  if (level >= 3) {
    const top = base + towerH + ringH + 0.31; // sommet de la coupole
    g.add(lanternAt(0, top - 0.02, 0, 0.2, 0.2));
  }

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
  if (level >= 3) {
    const lowY = base + towerH * 0.22;
    const lowSlit = lightPanel(0.1, 0.24, m.slit, facing);
    lowSlit.position.copy(dir).multiplyScalar(apothem(radiusAt(lowY)) + 0.012);
    lowSlit.position.y = lowY + 0.2;
    g.add(lowSlit);
  }

  return finish(g, `observatory:${level}`);
}

// Le Sanctuaire : 1 case, silhouette basse et large. Dalle ronde de pierre claire,
// cercle de six pierres dressées d'ardoise, vasque centrale d'où monte une lueur
// ambre douce (braise non éclairée + halo translucide).
//
// Niveaux : les pierres dressées grandissent et s'épaississent (×1,6 puis ×2,1) ; au niveau 3, un second cercle de
// pierres basses les entoure, et la lueur monte plus haut.
export function buildSanctuary(record) {
  const level = levelFor(record);
  const m = materials();
  const g = new THREE.Group();
  g.name = 'sanctuary';
  const grow = [1, 1.6, 2.1][level - 1] ?? 2.1;
  const thick = 1 + 0.3 * (level - 1);

  const base = 0.06;
  const slab = new THREE.Mesh(
    faceted(new THREE.CylinderGeometry(0.46, 0.48, base, 10)),
    m.lightStone,
  );
  slab.position.y = base / 2;
  g.add(slab);

  // Pierres dressées, de hauteurs légèrement inégales, inclinées vers l'extérieur
  const heights = [0.42, 0.34, 0.46, 0.36, 0.44, 0.32].map((h) => h * grow);
  heights.forEach((h, i) => {
    const a = (i / heights.length) * Math.PI * 2 + Math.PI / 6;
    const stone = box(0.11 * thick, h, 0.08 * thick, m.standingStone);
    stone.position.set(Math.sin(a) * 0.36, base + h / 2, Math.cos(a) * 0.36);
    stone.rotation.set(0, a, 0);
    stone.rotateX(0.08);
    g.add(stone);
  });

  if (level >= 3) {
    // Second cercle, entre les grandes pierres : petites pierres basses.
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6 + Math.PI / 6;
      const low = box(0.12, 0.3 + (i % 2) * 0.1, 0.1, m.standingStone);
      low.position.set(Math.sin(a) * 0.42, base + low.geometry.parameters.height / 2, Math.cos(a) * 0.42);
      low.rotation.set(0, a, 0);
      g.add(low);
    }
  }

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
  const haloH = 0.5 * (1 + 0.5 * (level - 1));
  const halo = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.13, haloH, 8, 1, true), m.halo);
  halo.position.y = base + 0.25 + haloH / 2;
  halo.userData.noShadow = true;
  g.add(halo);

  return finish(g, `sanctuary:${level}`);
}

// Le Scriptorium : 1 case. Petit bâtiment trapu de pierre claire sous un toit bas, grande fenêtre
// ambre face +x, porte face +z, pupitre incliné et rouleaux de parchemin devant la porte.
//
// Niveaux : 2 = un second pupitre contre le mur éclairé, une lanterne et une pile de rouleaux de plus ;
// 3 = en plus une bannière sur le faîte et une seconde fenêtre face +z.
export function buildScriptorium(record) {
  const level = levelFor(record);
  const m = materials();
  const g = new THREE.Group();
  g.name = 'scriptorium';

  const base = 0.08;
  const w = 0.72;
  const h = 0.46;
  const p = w / 2;
  g.add(box(0.94, base, 0.94, m.stone));
  g.add(box(w, h, w, m.lightStone, 0, base));
  for (const [x, z] of [[-p, -p], [p, -p], [-p, p], [p, p]]) g.add(box(0.07, h, 0.07, m.woodDark, x, base, z));
  const roof = gableRoof(0.9, 0.28, 0.9, m);
  roof.position.y = base + h;
  g.add(roof);

  // Grande fenêtre ambre (face +x) et porte (face +z)
  g.add(box(0.05, 0.34, 0.5, m.woodDark, p + 0.015, base + 0.07, 0));
  const glass = lightPanel(0.42, 0.26, m.window, Math.PI / 2);
  glass.position.set(p + 0.045, base + 0.2, 0);
  g.add(glass);
  g.add(box(0.2, 0.32, 0.05, m.woodDark, 0.12, base, p + 0.015));
  if (level >= 3) {
    g.add(box(0.5, 0.26, 0.05, m.woodDark, -0.05, base + 0.1, p + 0.015));
    const front = lightPanel(0.34, 0.2, m.window, 0);
    front.position.set(-0.05, base + 0.23, p + 0.045);
    g.add(front);
  }

  // Pupitre incliné, feuille de parchemin dessus, et rouleaux couchés à son pied.
  const desk = (x, z, turn) => {
    const d = new THREE.Group();
    d.position.set(x, base, z);
    d.rotation.y = turn;
    d.add(box(0.05, 0.22, 0.05, m.woodDark, -0.09, 0, 0));
    d.add(box(0.05, 0.22, 0.05, m.woodDark, 0.09, 0, 0));
    const top = box(0.3, 0.035, 0.2, m.planks, 0, 0.22);
    top.rotation.x = -0.35;
    d.add(top);
    const sheet = box(0.22, 0.012, 0.15, m.parchmentSheet, 0, 0.25);
    sheet.rotation.x = -0.35;
    d.add(sheet);
    return d;
  };
  g.add(desk(-0.2, p + 0.1, 0));
  const scroll = (x, y, z, turn) => {
    const roll = new THREE.Mesh(sharedGeometry('scroll', () => faceted(new THREE.CylinderGeometry(0.04, 0.04, 0.24, 6))), m.parchmentSheet);
    roll.rotation.z = Math.PI / 2;
    roll.rotation.y = turn;
    roll.position.set(x, y, z);
    return roll;
  };
  g.add(scroll(0.28, base + 0.04, p + 0.12, 0.3));
  g.add(scroll(0.3, base + 0.04, p + 0.2, -0.2));
  g.add(scroll(0.29, base + 0.11, p + 0.16, 0.05));
  if (level >= 2) {
    g.add(desk(p + 0.12, 0.22, Math.PI / 2));
    g.add(scroll(p + 0.12, base + 0.04, -0.28, Math.PI / 2 + 0.2));
    g.add(scroll(p + 0.2, base + 0.04, -0.3, Math.PI / 2 - 0.25));
    g.add(lanternAt(-p - 0.04, base, p - 0.04, 0.42, 0.15));
  }
  if (level >= 3) g.add(bannerAt(0, base + h + 0.2, 0, 0.8, [0.42, 0.32]));

  return finish(g, `scriptorium:${level}`);
}

// La Cloche : 1 case. Clocher de bois léger : quatre poteaux sur une dalle, toit bas de bardeaux, cloche
// de bronze suspendue à la poutre. userData.swing = la cloche (balancée par BuildingManager quand elle sonne) ;
// bronze sombre au repos, éclat ambre (et halo) quand elle est chargée (`lightMaterials`).
//
// Niveaux : 2 = traverses de renfort et lanterne au pied ; 3 = poteaux surélevés, une seconde petite
// cloche et une bannière sur le toit.
export function buildBell(record) {
  const level = levelFor(record);
  const m = materials();
  const g = new THREE.Group();
  g.name = 'bell';

  const base = 0.08;
  const lift = level >= 3 ? 0.2 : 0;
  const post = 1.0 + lift;
  const p = 0.3;
  g.add(box(0.8, base, 0.8, m.stone));
  for (const [x, z] of [[-p, -p], [p, -p], [-p, p], [p, p]]) g.add(box(0.07, post, 0.07, m.woodDark, x, base, z));
  // Poutre haute (le long de x) où pend la cloche, et traverses.
  const beamY = base + post - 0.1;
  g.add(box(0.8, 0.07, 0.07, m.planks, 0, beamY));
  g.add(box(0.7, 0.05, 0.05, m.planks, 0, base + 0.4, p));
  g.add(box(0.05, 0.05, 0.7, m.planks, p, base + 0.4, 0));
  if (level >= 2) {
    g.add(box(0.7, 0.05, 0.05, m.planks, 0, base + 0.4, -p));
    g.add(box(0.05, 0.05, 0.7, m.planks, -p, base + 0.4, 0));
    g.add(lanternAt(p + 0.1, base, p + 0.1, 0.34, 0.14));
  }
  const roof = gableRoof(0.86, 0.3, 0.86, m);
  roof.position.y = base + post;
  g.add(roof);
  if (level >= 3) g.add(bannerAt(0, base + post + 0.26, 0, 0.7, [0.4, 0.3]));

  // Cloche : couronne, corps évasé (matériau allumé/éteint), battant. Pivot à la poutre.
  const swing = new THREE.Group();
  swing.position.set(0, beamY, 0);
  swing.userData.anchor = true; // animée : ses pièces sont fusionnées dans son propre repère
  swing.add(box(0.05, 0.12, 0.05, m.woodDark, 0, -0.12));
  const body = new THREE.Mesh(sharedGeometry('bell:body', () => faceted(new THREE.CylinderGeometry(0.1, 0.23, 0.36, 10))), m.bell.on);
  body.position.y = -0.3;
  body.userData.lightMaterials = m.bell;
  swing.add(body);
  swing.add(box(0.5, 0.04, 0.5, m.bronze, 0, -0.5)); // lèvre
  swing.add(box(0.06, 0.1, 0.06, m.woodDark, 0, -0.55));
  g.add(swing);
  g.userData.swing = swing;
  if (level >= 3) {
    const small = new THREE.Mesh(sharedGeometry('bell:small', () => faceted(new THREE.CylinderGeometry(0.06, 0.14, 0.22, 8))), m.bell.on);
    small.position.set(0.2, beamY - 0.2, 0);
    small.userData.lightMaterials = m.bell;
    g.add(small);
  }
  const halo = new THREE.Mesh(sharedGeometry('bell:halo', () => new THREE.CylinderGeometry(0.2, 0.34, 0.5, 10, 1, true)), m.bellHalo.on);
  halo.position.y = beamY - 0.3;
  halo.userData.lightMaterials = m.bellHalo;
  halo.userData.noShadow = true;
  g.add(halo);

  return finish(g, `bell:${level}`);
}

// Repère permanent d'un bâtiment renforcé par une aura : lueur pointillée au sol,
// autour du socle. Non éclairé, sans ombre ni contour (pas d'écriture de profondeur).
export function buildBoostMarker(w, d) {
  const geometry = sharedGeometry(`marker:${w}x${d}`, () => new THREE.PlaneGeometry(w + 0.1, d + 0.1));
  const mesh = new THREE.Mesh(geometry, materials().boostRing);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.012;
  mesh.renderOrder = 1;
  mesh.name = 'boostMarker';
  return mesh;
}

// L'Embarcadère : 1 case au bord du terrain. Modèle tourné vers l'eau (+x local, voir
// catalog.js `orient`) : caisses sur la case, ponton de planches qui avance sur l'eau sur ses
// pieux, petite lanterne ambre au bout (éteinte en pause) et barque amarrée.
// userData.boat = la barque (animée par BuildingManager), userData.boatHome = sa place à quai.
//
// Niveaux : 2 = une seconde lanterne au milieu du ponton et une caisse de plus ; 3 = en plus une
// bannière au bout du ponton et une voile de parchemin sur la barque.
export function buildEmbarcadere(record) {
  const level = levelFor(record);
  const m = materials();
  const g = new THREE.Group();
  g.name = 'embarcadere';
  const water = LAKE.waterY;

  // Sur la case : deux caisses et une bitte d'amarrage.
  g.add(box(0.34, 0.3, 0.34, m.planks, -0.22, 0, -0.2));
  g.add(box(0.24, 0.2, 0.24, m.planks, -0.2, 0.3, -0.2));
  g.add(box(0.1, 0.24, 0.1, m.woodDark, 0.3, 0, 0.32));

  // Ponton : planches en travers, un jour d'un pixel entre elles, sur des pieux.
  const deckY = 0.0;
  for (let i = 0, x = -0.1; x < 3.3; i++, x += 0.34) {
    g.add(box(0.29, 0.06, 0.78, i % 3 === 2 ? m.woodDark : m.planks, x + 0.15, deckY, 0));
  }
  for (const px of [1.55, 2.45, 3.3]) {
    for (const pz of [-0.42, 0.42]) g.add(box(0.1, 0.9, 0.1, m.woodDark, px, water - 0.6, pz));
  }

  // Lanterne au bout du ponton : poteau, verre ambre (éteint en pause), chapeau.
  g.add(box(0.07, 0.62, 0.07, m.woodDark, 3.3, deckY + 0.06, 0.42));
  const glass = box(0.15, 0.15, 0.15, m.lantern.on, 3.3, deckY + 0.68, 0.42);
  glass.geometry.dispose();
  glass.geometry = sharedGeometry('lanternGlass', () => boxWorldUV(new THREE.BoxGeometry(0.15, 0.15, 0.15), 0.15, 0.15, 0.15));
  glass.userData.lightMaterials = m.lantern;
  glass.userData.noShadow = true;
  g.add(glass);
  g.add(box(0.21, 0.05, 0.21, m.woodDark, 3.3, deckY + 0.83, 0.42));
  if (level >= 2) {
    g.add(lanternAt(1.55, deckY + 0.06, -0.42));
    g.add(box(0.26, 0.2, 0.26, m.planks, -0.5, 0, 0.1));
  }
  if (level >= 3) g.add(bannerAt(3.3, deckY + 0.06, -0.42, 1.25, [0.6, 0.44]));

  // Barque amarrée le long du ponton : coque, plat-bord, pointes, banc.
  const boat = new THREE.Group();
  boat.add(box(1.1, 0.18, 0.42, m.woodDark, 0, water - 0.06, 0));
  for (const side of [-1, 1]) {
    boat.add(box(1.1, 0.07, 0.06, m.planks, 0, water + 0.11, side * 0.2));
    const tip = box(0.26, 0.2, 0.26, m.woodDark, side * 0.56, water - 0.07, 0);
    tip.rotation.y = Math.PI / 4;
    tip.scale.set(1, 1, 0.8);
    boat.add(tip);
  }
  boat.add(box(0.16, 0.05, 0.38, m.planks, 0.08, water + 0.08, 0));
  if (level >= 3) { // mât et voile
    boat.add(box(0.06, 1.0, 0.06, m.woodDark, 0.08, water + 0.1, 0));
    boat.add(box(0.04, 0.62, 0.55, m.sail, 0.14, water + 0.4, 0));
  }
  boat.position.set(2.3, 0, -0.78);
  boat.userData.anchor = true; // animée : ses pièces sont fusionnées dans son propre repère
  g.add(boat);
  g.userData.boat = boat;
  g.userData.boatHome = boat.position.clone();

  return finish(g, `embarcadere:${level}`);
}

// Le Phare du Lac : 2x2 cases, construit en 5 paliers (record.stage, 1 par défaut,
// pour l'aperçu de pose) : 1 fondations, 2 base de pierre, 3 fût, 4 galerie,
// 5 lanterne allumée en ambre. userData.top = hauteur du sommet (effets) ;
// userData.lanternY = centre de la lanterne (lumière de nuit), au palier 5.
export function buildLighthouse(record = {}) {
  const stage = record.stage ?? 1;
  const m = materials();
  const g = new THREE.Group();
  g.name = 'lighthouse';
  const sides = 8;
  const thetaStart = Math.PI / sides; // une face pile face à la caméra (45°)
  const prism = (rTop, rBottom, h, material, y, n = sides) => {
    const mesh = new THREE.Mesh(
      faceted(new THREE.CylinderGeometry(rTop, rBottom, h, n, 1, false, thetaStart)), material);
    mesh.position.y = y + h / 2;
    g.add(mesh);
    return mesh;
  };
  const facing = Math.PI / 4;
  const dir = new THREE.Vector3(Math.sin(facing), 0, Math.cos(facing));
  const apothem = (r) => r * Math.cos(Math.PI / sides);
  const onFace = (mesh, r, y) => {
    mesh.rotation.y = facing;
    mesh.position.copy(dir).multiplyScalar(apothem(r) + 0.012);
    mesh.position.y = y;
    g.add(mesh);
  };

  // 1. Fondations : dalle d'ardoise, anneau de pierre claire, blocs en attente.
  const slab = 0.12;
  g.add(box(1.8, slab, 1.8, m.stone));
  prism(0.78, 0.82, 0.16, m.lightStone, slab);
  let top = slab + 0.16;
  if (stage === 1) {
    g.add(box(0.3, 0.2, 0.22, m.lightStone, -0.62, slab, 0.62));
    g.add(box(0.22, 0.16, 0.3, m.lightStone, 0.66, slab, -0.55));
    g.add(box(0.12, 0.6, 0.12, m.woodDark, -0.7, slab, -0.7)); // piquet de chantier
  }

  // 2. Base de pierre : tronc octogonal large, porte face caméra.
  if (stage >= 2) {
    const h = 0.62;
    prism(0.66, 0.74, h, m.towerStone, top);
    onFace(new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.44), m.woodDark), 0.71, top + 0.22);
    top += h;
    prism(0.7, 0.7, 0.07, m.ring, top);
    top += 0.07;
  }

  // 3. Fût : tour effilée, deux bandeaux d'ardoise, petites fenêtres sombres.
  if (stage >= 3) {
    const h = 1.75;
    const rB = 0.56;
    const rT = 0.42;
    prism(rT, rB, h, m.towerStone, top);
    for (const f of [0.35, 0.72]) {
      const r = rB + (rT - rB) * f;
      prism(r + 0.02, r + 0.02, 0.12, m.ring, top + f * h - 0.06);
    }
    const win = (f) => onFace(new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.18), m.woodDark),
      rB + (rT - rB) * f, top + f * h);
    win(0.18);
    win(0.55);
    win(0.88);
    top += h;
  }

  // 4. Galerie : plateforme débordante, garde-corps de bois.
  if (stage >= 4) {
    prism(0.6, 0.5, 0.1, m.ring, top);
    top += 0.1;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + thetaStart;
      g.add(box(0.04, 0.2, 0.04, m.woodDark, Math.sin(a) * 0.54, top, Math.cos(a) * 0.54));
    }
    const rail = new THREE.Mesh(new THREE.TorusGeometry(0.54, 0.025, 4, sides), m.woodDark);
    rail.rotation.x = Math.PI / 2;
    rail.position.y = top + 0.2;
    g.add(rail);
  }

  // 5. Lanterne : chambre vitrée ambre, toit d'ardoise, épi ; halo doux sans ombre.
  if (stage >= 5) {
    const lantern = prism(0.3, 0.3, 0.42, m.lantern.on, top);
    lantern.userData.noShadow = true;
    lantern.userData.keep = true; // matériau basculé à l'allumage (setLanternLit)
    g.userData.lantern = lantern;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      g.add(box(0.04, 0.42, 0.04, m.woodDark, Math.sin(a) * 0.3, top, Math.cos(a) * 0.3));
    }
    g.userData.lanternY = top + 0.21;
    const halo = prism(0.48, 0.48, 0.5, m.lanternHalo, top - 0.04);
    halo.userData.noShadow = true;
    top += 0.42;
    const roof = new THREE.Mesh(faceted(new THREE.ConeGeometry(0.4, 0.42, sides, 1, false, thetaStart)), m.dome);
    roof.position.y = top + 0.21;
    g.add(roof);
    top += 0.42;
    g.add(box(0.05, 0.16, 0.05, m.woodDark, 0, top, 0));
    top += 0.16;
  }

  g.userData.top = top;
  return finish(g, null); // unique : rien à partager, géométries libérées au palier suivant
}
