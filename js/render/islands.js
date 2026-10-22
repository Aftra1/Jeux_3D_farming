// Îlots du lac (chapitre II) : rendu seul, jamais la simulation. main.js fournit leur état
// (cachés, visibles dans la brume, ralliés) ; chaque îlot a son socle, sa berge, son décor
// (bosquet d'aulnes, rochers et chapelle en ruine, roseaux) et sa passerelle vers le domaine.
// Le décor reste sur la berge : les cases de l'îlot sont toutes constructibles.
// Dans la brume, l'îlot est une silhouette estompée (matériaux translucides, sans ombre ni
// contour) sous des bancs de brume. Rallié : la brume se lève doucement, l'îlot se précise et
// la passerelle se construit planche par planche depuis le domaine.

import * as THREE from 'three';
import { PALETTE, GRID, LAKE } from '../config.js';
import { ISLANDS } from '../world/islands.js';
import {
  createRng, createGroundTopTexture, createGroundSideTexture, createShoreTexture, createMistTexture, getToonRamp,
} from './textures.js';

const SILHOUETTE = 0.38;   // opacité d'un îlot dans la brume
const REVEAL_SECONDS = 4;  // apparition des silhouettes
const LIFT_SECONDS = 4.5;  // la brume se lève au ralliement
const BRIDGE_SECONDS = 3.5;
const BRIDGE_DELAY = 0.6;
const PLANK_STEP = 0.42;
const MIST_OPACITY = 0.5;
const SIDES = { east: [1, 0], south: [0, 1], north: [0, -1] };

const smooth = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => Math.min(1, Math.max(0, t));

// Passerelle : matériaux partagés, jamais translucides.
let bridgeMats = null;
function bridgeMaterials() {
  if (!bridgeMats) {
    const toon = (color) => new THREE.MeshToonMaterial({ color, gradientMap: getToonRamp() });
    bridgeMats = { plank: toon(PALETTE.wood), plankLight: toon(PALETTE.woodLight), post: toon(PALETTE.woodDark) };
  }
  return bridgeMats;
}

class IslandView {
  constructor(def, grid, mistTexture) {
    this.def = def;
    this.state = 'hidden';
    this.opacity = 0;       // opacité de l'îlot (1 = net, ombres comprises)
    this.mist = 0;          // présence de la brume (0 = levée ou îlot caché)
    this.fade = null;       // { from, to, t, seconds, key }
    this.bridgeT = -1;      // avancement de la construction de la passerelle (s), -1 = pas commencée
    this.materials = [];
    this.meshes = [];
    const rng = createRng(101 + def.size * 7 + def.x);
    const n = def.size;
    this.center = grid.footprintCenter(def.x, def.z, n, n, new THREE.Vector3());
    this.reach = n / 2 + LAKE.shoreWidth; // demi-côté, berge comprise

    this.group = new THREE.Group();
    this.group.position.copy(this.center);
    this.group.visible = false;
    this.#buildGround(rng);
    if (def.kind === 'wood') this.#buildWood(rng);
    else if (def.kind === 'rock') this.#buildRock(rng);
    else this.#buildReeds(rng);
    this.#mergeParts();

    this.mists = [];
    for (let i = 0; i < 6; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: mistTexture, color: PALETTE.parchment, transparent: true, depthWrite: false, opacity: 0,
      }));
      const a = (i / 6) * Math.PI * 2 + rng();
      const r = n * (0.15 + rng() * 0.35);
      sprite.userData.home = new THREE.Vector3(Math.cos(a) * r, 0.5 + rng() * 1.1, Math.sin(a) * r);
      sprite.userData.phase = rng() * 10;
      sprite.scale.set(n * (0.6 + rng() * 0.3), n * (0.3 + rng() * 0.12), 1);
      sprite.renderOrder = 2;
      this.mists.push(sprite);
      this.group.add(sprite);
    }

    this.bridge = this.#buildBridge(grid);
  }

  #mat(color, map = null) {
    const m = new THREE.MeshToonMaterial({ color, map, gradientMap: getToonRamp() });
    this.materials.push(m);
    return m;
  }

  #mesh(geometry, material, x = 0, y = 0, z = 0) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    this.meshes.push(mesh);
    this.group.add(mesh);
    return mesh;
  }

  // Pièce de décor : sa transformation est cuite dans la géométrie, puis toutes les pièces d'un
  // même matériau sont fusionnées en un seul maillage (quelques appels de dessin par îlot).
  #part(geometry, material, x, y, z, rx = 0, ry = 0, rz = 0) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
    const g = geometry.toNonIndexed().applyMatrix4(m);
    geometry.dispose();
    (this.parts ??= new Map()).set(material, [...(this.parts.get(material) || []), g]);
  }

  #mergeParts() {
    for (const [material, geoms] of this.parts || []) {
      const merged = new THREE.BufferGeometry();
      for (const name of ['position', 'normal', 'uv']) {
        const size = geoms[0].getAttribute(name).itemSize;
        const data = new Float32Array(geoms.reduce((n, g) => n + g.getAttribute(name).array.length, 0));
        let offset = 0;
        for (const g of geoms) {
          data.set(g.getAttribute(name).array, offset);
          offset += g.getAttribute(name).array.length;
        }
        merged.setAttribute(name, new THREE.BufferAttribute(data, size));
      }
      geoms.forEach((g) => g.dispose());
      this.#mesh(merged, material);
    }
    this.parts = null;
  }

  // Socle d'herbe (texture selon l'identité) et berge de sable tout autour, comme le domaine.
  #buildGround(rng) {
    const { size: n, kind } = this.def;
    const t = GRID.texelsPerTile;
    const h = GRID.slabHeight;
    const top = this.#mat(0xffffff, createGroundTopTexture(n, t, 60 + n, kind));
    const sideTex = createGroundSideTexture(t, Math.round(h * t), 13 + n);
    sideTex.repeat.set(n, 1);
    const side = this.#mat(0xffffff, sideTex);
    this.#mesh(new THREE.BoxGeometry(n, h, n), [side, side, top, side, side, side], 0, -h / 2, 0);

    const sw = LAKE.shoreWidth;
    const shoreH = LAKE.shoreY - (LAKE.waterY - 0.1);
    const wet = this.#mat(PALETTE.parchmentShade);
    const half = n / 2;
    for (const [rot, x, z, len] of [[0, -half - sw / 2, 0, n + 2 * sw], [-Math.PI / 2, 0, -half - sw / 2, n],
      [Math.PI, half + sw / 2, 0, n + 2 * sw], [Math.PI / 2, 0, half + sw / 2, n]]) {
      // Flancs fusionnés avec le décor (un seul appel de dessin), dessus de sable texturé à part.
      this.#part(new THREE.BoxGeometry(sw, shoreH, len), wet, x, LAKE.shoreY - shoreH / 2, z, 0, rot);
      const sand = this.#mat(0xffffff, createShoreTexture(sw * t, len * t, 70 + Math.floor(rng() * 50)));
      const top = this.#mesh(new THREE.PlaneGeometry(sw, len), sand, x, LAKE.shoreY + 0.001, z);
      top.rotation.set(-Math.PI / 2, 0, rot);
    }
  }

  // Point sur la berge (local) : [x, z], `out` = écart vers l'eau (0 = bord des cases).
  #ringPoint(rng, out = 0.2 + rng() * 0.6) {
    const half = this.def.size / 2;
    const along = (rng() * 2 - 1) * (half + 0.4);
    const across = half + out;
    switch (Math.floor(rng() * 4)) {
      case 0: return [-across, along];
      case 1: return [along, -across];
      case 2: return [across, along];
      default: return [along, across];
    }
  }

  // Bosquet d'aulnes : troncs fins, houppiers en cubes de sauge, petite cabane de rondins.
  #buildWood(rng) {
    const trunk = this.#mat(PALETTE.woodDark);
    const leaves = [this.#mat(PALETTE.sageDark), this.#mat(PALETTE.sage)];
    for (let i = 0; i < 16; i++) {
      const [x, z] = this.#ringPoint(rng, 0.25 + rng() * 0.5);
      const h = 0.7 + rng() * 0.6;
      this.#part(new THREE.BoxGeometry(0.12, h, 0.12), trunk, x, LAKE.shoreY + h / 2, z);
      const s = 0.45 + rng() * 0.25;
      this.#part(new THREE.BoxGeometry(s, s * 0.9, s), leaves[0], x, LAKE.shoreY + h + s * 0.2, z, 0, Math.PI / 4 + rng() * 0.3);
      this.#part(new THREE.BoxGeometry(s * 0.6, s * 0.55, s * 0.6), leaves[1], x, LAKE.shoreY + h + s * 0.75, z, 0, rng());
    }
    // Cabane au coin nord-ouest (le plus loin de la caméra) : murs de rondins, toit d'ardoise.
    const c = -this.def.size / 2 - 0.45;
    this.#part(new THREE.BoxGeometry(0.8, 0.45, 0.7), this.#mat(PALETTE.wood), c, LAKE.shoreY + 0.22, c + 1.4);
    this.#part(new THREE.BoxGeometry(0.95, 0.12, 0.85), this.#mat(PALETTE.slateMid), c, LAKE.shoreY + 0.52, c + 1.4, 0, 0, 0.12);
  }

  // Rochers gris et murs bas d'une chapelle en ruine, avec un arc encore debout.
  #buildRock(rng) {
    const stones = [this.#mat(PALETTE.slateLight), this.#mat(PALETTE.slateMid)];
    for (let i = 0; i < 14; i++) {
      const [x, z] = this.#ringPoint(rng, 0.1 + rng() * 1.1);
      const s = 0.25 + rng() * 0.45;
      this.#part(new THREE.BoxGeometry(s, s * (0.5 + rng() * 0.4), s * (0.7 + rng() * 0.5)), stones[i % 2],
        x, LAKE.waterY + s * 0.25, z, rng() * 0.3, rng() * Math.PI, rng() * 0.2);
    }
    const pale = this.#mat(PALETTE.parchmentDark);
    const half = this.def.size / 2;
    const wallX = -half - 0.5;
    for (let i = 0, z = -half + 0.3; z < half - 0.5; i++, z += 0.9) {
      if (rng() < 0.25) continue; // brèches
      const h = 0.2 + rng() * 0.5;
      this.#part(new THREE.BoxGeometry(0.28, h, 0.85), pale, wallX, LAKE.shoreY + h / 2, z + 0.42);
    }
    // Arc de la porte, sur la berge nord.
    for (const dx of [-0.45, 0.45]) {
      this.#part(new THREE.BoxGeometry(0.24, 1.05, 0.24), pale, 0.6 + dx, LAKE.shoreY + 0.52, -half - 0.5);
    }
    this.#part(new THREE.BoxGeometry(1.2, 0.2, 0.3), pale, 0.6, LAKE.shoreY + 1.12, -half - 0.5);
  }

  // Roseaux serrés sur la berge et dans l'eau, barque retournée au sec.
  #buildReeds(rng) {
    const stems = [];
    for (let i = 0; i < 110; i++) {
      const [x, z] = this.#ringPoint(rng, 0.1 + rng() * 1.6);
      stems.push({ x, z, h: 0.4 + rng() * 0.6, c: rng() });
    }
    const colors = [PALETTE.sageDark, PALETTE.sage, PALETTE.sageLight].map((c) => new THREE.Color(c));
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 1, 0.07), this.#mat(0xffffff), stems.length);
    const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.11, 0.2, 0.11), this.#mat(PALETTE.woodDark), stems.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const v = new THREE.Vector3();
    const sc = new THREE.Vector3();
    let count = 0;
    stems.forEach((s, i) => {
      q.setFromEuler(e.set((s.c - 0.5) * 0.3, 0, (s.c - 0.3) * 0.25));
      m.compose(v.set(s.x, LAKE.waterY + s.h / 2, s.z), q, sc.set(1, s.h, 1));
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, colors[Math.floor(s.c * 3)]);
      if (s.c < 0.35) heads.setMatrixAt(count++, m.makeTranslation(s.x, LAKE.waterY + s.h, s.z));
    });
    heads.count = count;
    for (const inst of [mesh, heads]) {
      inst.receiveShadow = true;
      this.meshes.push(inst);
      this.group.add(inst);
    }
    // Barque retournée sur la berge ouest : coque bleu ardoise, quille sombre.
    const x = -this.def.size / 2 - 0.5;
    this.#part(new THREE.BoxGeometry(0.5, 0.22, 1.3), this.#mat(PALETTE.slateMid), x, LAKE.shoreY + 0.11, 0.8, 0, 0.15);
    this.#part(new THREE.BoxGeometry(0.1, 0.06, 1.25), this.#mat(PALETTE.woodDark), x, LAKE.shoreY + 0.25, 0.8, 0, 0.15);
  }

  // Passerelle du bord du domaine au bord de l'îlot, dans l'axe du milieu de leur vis-à-vis.
  #buildBridge(grid) {
    const { x, z, size: n, side } = this.def;
    const [dx, dz] = SIDES[side];
    const h = grid.half;
    let start;
    let length;
    if (dx) {
      const lane = this.center.z;
      start = new THREE.Vector3(h, 0, lane);
      length = x - grid.size; // cases d'eau entre les deux bords
    } else {
      const lane = this.center.x;
      start = new THREE.Vector3(lane, 0, dz > 0 ? h : -h);
      length = dz > 0 ? z - grid.size : -(z + n);
    }
    const m = bridgeMaterials();
    const group = new THREE.Group();
    group.position.copy(start);
    group.rotation.y = dx ? 0 : -dz * Math.PI / 2;
    const y = LAKE.shoreY + 0.04;
    // Trois maillages instanciés (planches, planches claires, pieux) : trois appels de dessin.
    const pieces = [];
    for (let i = 0, s = 0.05; s + 0.36 <= length; i++, s += PLANK_STEP) pieces.push({ kind: i % 3 === 1 ? 1 : 0, x: s + 0.18, y, z: 0 });
    for (let s = 0.9; s < length - 0.4; s += 1.6) {
      for (const z of [-0.5, 0.5]) pieces.push({ kind: 2, x: s, y: LAKE.waterY + 0.22, z });
    }
    const shapes = [[new THREE.BoxGeometry(0.36, 0.08, 1), m.plank], [new THREE.BoxGeometry(0.36, 0.08, 1), m.plankLight],
      [new THREE.BoxGeometry(0.12, 0.85, 0.12), m.post]];
    const meshes = shapes.map(([geometry, material], kind) => {
      const inst = new THREE.InstancedMesh(geometry, material, pieces.filter((p) => p.kind === kind).length);
      inst.castShadow = true;
      inst.receiveShadow = true;
      inst.frustumCulled = false; // instances animées : boîte englobante non recalculée
      group.add(inst);
      return inst;
    });
    const used = [0, 0, 0];
    for (const p of pieces) {
      p.mesh = meshes[p.kind];
      p.index = used[p.kind]++;
    }
    group.userData.pieces = pieces;
    group.userData.length = length;
    group.visible = false;
    return group;
  }

  // Opacité commune des matériaux de l'îlot : translucides (silhouette, ni ombre ni contour) ou nets.
  #applyOpacity(o) {
    const solid = o >= 0.999;
    for (const mat of this.materials) {
      if (mat.transparent === solid) {
        mat.transparent = !solid;
        mat.depthWrite = solid;
        mat.needsUpdate = true;
      }
      mat.opacity = solid ? 1 : o;
    }
    for (const mesh of this.meshes) mesh.castShadow = solid && this.shadows !== false;
    for (const mesh of this.bridge?.children ?? []) mesh.castShadow = this.shadows !== false;
    this.group.visible = o > 0.001 || this.mist > 0.001;
  }

  // État voulu : 'hidden' | 'misted' | 'rallied'. instant = au chargement (sans animation).
  setState(state, instant) {
    if (state === this.state || (state === 'rallied' && this.state === 'rallying')) return;
    if (state === 'rallied') {
      this.state = instant ? 'rallied' : 'rallying';
      this.from = { opacity: this.opacity, mist: this.mist };
      this.t = 0;
      this.bridge.visible = true;
      this.bridgeT = instant ? Infinity : 0;
      if (instant) {
        this.opacity = 1;
        this.mist = 0;
      }
    } else if (state === 'misted') {
      this.state = 'misted';
      this.opacity = instant ? SILHOUETTE : 0;
      this.t = instant ? REVEAL_SECONDS : 0;
      this.mist = 1;
    } else {
      this.state = 'hidden';
      this.opacity = 0;
      this.mist = 0;
      this.bridge.visible = false;
    }
    this.#applyOpacity(this.opacity);
    this.#updateBridge();
  }

  update(dt, time, fog) {
    if (this.state === 'misted' && this.t < REVEAL_SECONDS) {
      this.t += dt;
      this.opacity = SILHOUETTE * smooth(clamp01(this.t / REVEAL_SECONDS));
      this.#applyOpacity(this.opacity);
    } else if (this.state === 'rallying') {
      this.t += dt;
      const k = smooth(clamp01(this.t / LIFT_SECONDS));
      this.mist = this.from.mist * (1 - k);
      this.opacity = this.from.opacity + (1 - this.from.opacity) * k;
      this.bridgeT = this.t - BRIDGE_DELAY;
      if (this.t >= Math.max(LIFT_SECONDS, BRIDGE_SECONDS + BRIDGE_DELAY + 0.5)) {
        this.state = 'rallied';
        this.opacity = 1;
        this.mist = 0;
        this.bridgeT = Infinity;
      }
      this.#applyOpacity(this.opacity);
      this.#updateBridge();
    }
    // Brume : bancs qui dérivent lentement, de la couleur de l'heure ; ils s'écartent en se levant.
    const lift = 1 - this.mist;
    for (const sprite of this.mists) {
      sprite.visible = this.mist > 0.001;
      if (!sprite.visible) continue;
      const home = sprite.userData.home;
      const p = sprite.userData.phase;
      sprite.position.set(
        home.x * (1 + lift * 1.2) + Math.sin(time * 0.07 + p) * 0.8,
        home.y + lift * 1.2 + Math.sin(time * 0.11 + p) * 0.1,
        home.z * (1 + lift * 1.2) + Math.cos(time * 0.05 + p) * 0.6,
      );
      sprite.material.color.copy(fog).lerp(this.parchment ??= new THREE.Color(PALETTE.parchment), 0.55);
      sprite.material.opacity = MIST_OPACITY * this.mist * (this.state === 'misted' ? this.opacity / SILHOUETTE : 1);
    }
  }

  // Planches et pieux apparaissent un à un, du domaine vers l'îlot, avec un petit tassement.
  #updateBridge() {
    if (!this.bridge.visible) return;
    const { pieces, length } = this.bridge.userData;
    const front = (this.bridgeT / BRIDGE_SECONDS) * length;
    const m = (this.matrix ??= new THREE.Matrix4());
    for (const p of pieces) {
      const k = clamp01((front - p.x) / 0.6);
      if (k <= 0) m.makeScale(0, 0, 0);
      else m.makeScale(1, 0.2 + 0.8 * k, 1).setPosition(p.x, p.y + (1 - smooth(k)) * 0.35, p.z);
      p.mesh.setMatrixAt(p.index, m);
    }
    for (const mesh of this.bridge.children) mesh.instanceMatrix.needsUpdate = true;
  }

  refresh() {
    this.#applyOpacity(this.opacity);
  }

  // Le point du sol touche-t-il l'îlot (berge comprise) ?
  contains(point) {
    return Math.abs(point.x - this.center.x) <= this.reach && Math.abs(point.z - this.center.z) <= this.reach;
  }
}

export class IslandViews {
  constructor(scene, grid) {
    const mist = createMistTexture();
    this.views = ISLANDS.map((def) => new IslandView(def, grid, mist));
    for (const v of this.views) {
      scene.add(v.group);
      scene.add(v.bridge);
    }
  }

  // revealed : silhouettes visibles ; rallied : ids des îlots ralliés ; instant : sans animation.
  sync(revealed, rallied, instant = false) {
    for (const v of this.views) {
      const state = rallied.includes(v.def.id) ? 'rallied' : revealed ? 'misted' : 'hidden';
      v.setState(state, instant);
    }
  }

  // Îlot encore dans la brume sous ce point du sol (pour l'ouvrir d'un tap), ou null.
  pick(point) {
    if (!point) return null;
    return this.views.find((v) => v.state === 'misted' && v.contains(point))?.def.id ?? null;
  }

  // Rectangles des îlots visibles pour l'écume du lac : [{ x, z, half, amount }].
  shores() {
    return this.views.map((v) => ({ x: v.center.x, z: v.center.z, half: v.reach,
      amount: v.state === 'hidden' ? 0 : Math.max(v.opacity, 0.001) }));
  }

  // Qualité : en Basse, ni le décor des îlots ni les passerelles ne projettent d'ombre.
  setQuality(q) {
    for (const v of this.views) {
      v.shadows = q.decorShadows;
      v.refresh();
    }
  }

  update(dt, time, fog) {
    for (const v of this.views) v.update(dt, time, fog);
  }
}
