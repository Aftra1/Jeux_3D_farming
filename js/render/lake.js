// Le lac, au bord du domaine (côté −x, et un bras côté −z qui contourne le coin du fond) :
// décor seul, hors des cases constructibles. Blocs d'eau et berges prolongent le socle de la grille (même épaisseur, effet diorama).
// L'eau est un shader pixel : aplats d'ardoise, tirets de reflet qui naissent et s'effacent,
// rangées décalées d'un pixel en marches (ondulation sans flou). Le motif est ancré sur la
// grille des pixels internes (la caméra est alignée au pixel) : un texel = un pixel écran.
// Suit le cycle jour/nuit, reflète la nuit les ouvertures allumées proches de la rive et la
// lanterne du Phare, et montre le passage de son faisceau. Ne lit jamais la simulation :
// main.js lui fournit l'heure, les lumières et le faisceau.

import * as THREE from 'three';
import { PALETTE, GRID, LAKE, CAMERA } from '../config.js';
import {
  createRng, createShoreTexture, createWaterSideTexture, createGroundSideTexture, getToonRamp,
} from './textures.js';

const MAX_LIGHTS = 8;
const LIGHT_REACH = 6;     // reflet visible jusqu'à 6 unités de l'ouverture (rive comprise)
const LANTERN_REACH = 14;  // reflet plus long pour la lanterne du Phare

const vertexShader = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec2 uOffset;     // pixel écran → pixel ancré au monde
  uniform float uTime;
  uniform vec3 uDeep;
  uniform vec3 uBase;
  uniform vec3 uLight;
  uniform vec3 uGlint;
  uniform vec3 uAmber;
  uniform float uGlintAmount;
  uniform float uSparkle;   // seuil : plus haut = moins de reflets
  uniform float uNight;
  uniform vec2 uShore;      // bord de l'eau : x de la rive ouest, z de la rive nord
  uniform vec4 uLights[${MAX_LIGHTS}]; // x, z, intensité, portée
  uniform vec4 uBeam;       // x, z, angle, intensité
  varying vec3 vWorld;

  float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  void main() {
    vec2 s = floor(gl_FragCoord.xy) + uOffset;
    float t = floor(uTime * 5.0) / 5.0; // animation en marches, comme un sprite
    // Ondulation : chaque rangée se décale d'un pixel au plus.
    float shift = floor(sin(s.y * 0.6 + t * 1.3) * 1.2 + 0.5);
    vec2 p = vec2(s.x + shift, s.y);

    // Aplats : grandes nappes lentes, paliers nets.
    float band = sin(p.x * 0.045 + p.y * 0.13 + t * 0.3) + 0.7 * sin(p.x * 0.021 - p.y * 0.07 - t * 0.2);
    vec3 col = band < -1.1 ? uDeep : uBase;
    if (band > 1.35) col = mix(uBase, uLight, 0.5);

    // Reflets : courts tirets horizontaux qui naissent, s'allongent et s'effacent.
    vec2 cell = floor(p / vec2(9.0, 4.0));
    vec2 local = p - cell * vec2(9.0, 4.0);
    float r = hash(cell);
    float phase = fract(t * 0.22 + r * 7.31);
    float len = phase < 0.1 ? 1.0 : (phase < 0.25 ? 3.0 : 2.0);
    float x0 = floor(hash(cell + 17.0) * 5.0);
    float on = step(uSparkle, r) * step(phase, 0.32)
      * step(x0, local.x) * step(local.x, x0 + len - 1.0) * (1.0 - step(0.5, abs(local.y - 1.0)));
    col = mix(col, uGlint, on * uGlintAmount);

    // Distance à la berge (rive ouest, rive nord, ou leur coin).
    float dW = uShore.x - vWorld.x;
    float dN = uShore.y - vWorld.z;
    float dShore = (dW > 0.0 && dN > 0.0) ? length(vec2(dW, dN)) : max(dW, dN);
    // Écume d'un pixel le long de la berge, qui respire.
    if (dShore < 0.14 + 0.07 * sin((vWorld.x + vWorld.z) * 3.0 + t * 1.5)) col = mix(uBase, uLight, 0.8);

    // La nuit : reflets ambre brisés des ouvertures proches, perpendiculaires à la rive ;
    // ils s'éteignent avec le trajet (ouverture → rive → reflet).
    float glow = 0.0;
    float dash = step(0.4, hash(vec2(floor(p.x / 3.0), p.y) + floor(t * 0.8)));
    for (int i = 0; i < ${MAX_LIGHTS}; i++) {
      vec4 L = uLights[i];
      if (L.z <= 0.0) continue;
      if (dW > 0.0 && abs(vWorld.z - L.y) < 0.22 + dW * 0.08) {
        glow = max(glow, L.z * (1.0 - (L.x - uShore.x + dW) / L.w));
      }
      if (dN > 0.0 && abs(vWorld.x - L.x) < 0.22 + dN * 0.08) {
        glow = max(glow, L.z * (1.0 - (L.y - uShore.y + dN) / L.w));
      }
    }
    glow *= dash;
    col = mix(col, uAmber, glow * uNight * 0.75);

    // Faisceau du Phare : deux pinceaux opposés qui balaient l'eau (bord net, deux paliers).
    if (uBeam.w > 0.0) {
      vec2 d = vWorld.xz - uBeam.xy;
      float dist = length(d);
      float diff = abs(mod(atan(d.y, d.x) - uBeam.z + 1.5708, 3.14159) - 1.5708);
      float lateral = dist * sin(diff);
      float w = 0.35 + dist * 0.07;
      float b = 0.5 * step(lateral, w) + 0.5 * step(lateral, w * 0.45);
      col = mix(col, uAmber, b * clamp(1.0 - dist / 32.0, 0.0, 1.0) * uBeam.w * 0.6);
    }

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

const toon = (color, map) => new THREE.MeshToonMaterial({ color, map: map || null, gradientMap: getToonRamp() });

function shaded(mesh) {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export class Lake {
  constructor(scene, grid) {
    const h = grid.half;
    const t = GRID.texelsPerTile;
    const bottom = grid.topY - GRID.slabHeight;
    const length = grid.size * GRID.tileSize;
    const sw = LAKE.shoreWidth;
    const W = LAKE.width;
    const N = LAKE.northWidth;
    this.shoreX = -h - sw; // bord de l'eau, rive ouest
    this.shoreZ = -h - sw; // bord de l'eau, rive nord
    this.group = new THREE.Group();

    // Berges : bandes de sable et galets entre la grille et l'eau (la rive ouest couvre le coin).
    // Même boîte tournée d'un quart de tour pour la rive nord : l'eau reste du côté local −x.
    const shoreH = LAKE.shoreY - bottom;
    const shoreSideMat = toon(0xffffff, createGroundSideTexture(t, Math.round(shoreH * t)));
    const wetSand = toon(PALETTE.parchmentShade);
    const shoreBox = (len, seed) => shaded(new THREE.Mesh(
      new THREE.BoxGeometry(sw, shoreH, len),
      [shoreSideMat, wetSand, toon(0xffffff, createShoreTexture(sw * t, len * t, seed)),
        shoreSideMat, shoreSideMat, shoreSideMat],
    ));
    const west = shoreBox(length + sw, 31);
    west.position.set(-h - sw / 2, bottom + shoreH / 2, -sw / 2);
    const north = shoreBox(length, 41);
    north.rotation.y = -Math.PI / 2;
    north.position.set(0, bottom + shoreH / 2, -h - sw / 2);
    this.group.add(west, north);

    // Eau : blocs dont seul le dessus porte le shader ; tranches sombres sur les côtés.
    const waterH = LAKE.waterY - bottom;
    const sideTexels = Math.round(waterH * t);
    const sideTex = (repeat) => {
      const tex = createWaterSideTexture(t, sideTexels);
      tex.repeat.set(repeat, 1);
      return toon(0xffffff, tex);
    };
    this.uniforms = {
      uOffset: { value: new THREE.Vector2() },
      uTime: { value: 0 },
      uDeep: { value: new THREE.Color() },
      uBase: { value: new THREE.Color() },
      uLight: { value: new THREE.Color() },
      uGlint: { value: new THREE.Color() },
      uAmber: { value: new THREE.Color(PALETTE.amberLight) },
      uGlintAmount: { value: 1 },
      uSparkle: { value: 0.55 },
      uNight: { value: 0 },
      uShore: { value: new THREE.Vector2(this.shoreX, this.shoreZ) },
      uLights: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector4()) },
      uBeam: { value: new THREE.Vector4() },
    };
    const surface = new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms: this.uniforms });
    // Ordre des faces BoxGeometry : +x, −x, +y, −y, +z, −z. Ouest : x ∈ [shoreX − W, shoreX],
    // z ∈ [shoreZ − N, h] ; nord : x ∈ [shoreX, h], z ∈ [shoreZ − N, shoreZ].
    const westLen = h - (this.shoreZ - N);
    const longSide = sideTex(westLen);
    const westWater = new THREE.Mesh(new THREE.BoxGeometry(W, waterH, westLen),
      [longSide, longSide, surface, longSide, sideTex(W), sideTex(W)]);
    westWater.position.set(this.shoreX - W / 2, bottom + waterH / 2, h - westLen / 2);
    const northLen = h - this.shoreX;
    const northSide = sideTex(northLen);
    const northWater = new THREE.Mesh(new THREE.BoxGeometry(northLen, waterH, N),
      [sideTex(N), sideTex(N), surface, northSide, northSide, northSide]);
    northWater.position.set(h - northLen / 2, bottom + waterH / 2, this.shoreZ - N / 2);
    for (const water of [westWater, northWater]) {
      water.receiveShadow = true;
      this.group.add(water);
    }

    this.#buildDetails(h);
    scene.add(this.group);

    // Zone d'eau principale, à l'ouest (pour les Visiteurs du lac qui en arrivent).
    this.region = { xMin: this.shoreX - W, xMax: this.shoreX, zMin: -h, zMax: h };

    // Couleurs de jour et de nuit, mélangées selon l'heure.
    this.day = [PALETTE.waterDeep, PALETTE.water, PALETTE.waterLight].map((c) => new THREE.Color(c));
    this.night = [PALETTE.waterNightDeep, PALETTE.waterNight, PALETTE.waterNightLight].map((c) => new THREE.Color(c));
    this.parchment = new THREE.Color(PALETTE.parchment);
    this.moon = new THREE.Color(PALETTE.moonlight);
  }

  // Roseaux, ponton, petite barque immobile, galets : primitives, deux appels de dessin
  // pour les roseaux (instances), le reste en quelques boîtes.
  #buildDetails(h) {
    const rng = createRng(53);
    const x0 = this.shoreX;
    const y = LAKE.waterY;
    const wood = toon(PALETTE.wood);
    const woodLight = toon(PALETTE.woodLight);
    const woodDark = toon(PALETTE.woodDark);
    const box = (w, hh, d, mat) => shaded(new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), mat));

    // Ponton : planches en travers (jours d'un pixel entre elles) sur quatre pieux.
    const dock = new THREE.Group();
    const dockLen = 3.4;
    const deckY = LAKE.shoreY - 0.02;
    for (let i = 0, x = 0.12; x < dockLen; i++, x += 0.42) {
      const plank = box(0.36, 0.08, 1, i % 3 === 1 ? woodLight : wood);
      plank.position.set(-x - 0.18, deckY - 0.04, 0);
      dock.add(plank);
    }
    for (const [px, pz] of [[-0.6, -0.55], [-0.6, 0.55], [-dockLen + 0.1, -0.55], [-dockLen + 0.1, 0.55]]) {
      const post = box(0.14, 0.75, 0.14, woodDark);
      post.position.set(px, y + 0.12, pz);
      dock.add(post);
    }
    dock.position.set(x0 + 0.3, 0, -3.5);
    this.group.add(dock);

    // Barque immobile amarrée le long du ponton : coque, plat-bord, banc, rame.
    const boat = new THREE.Group();
    const hull = box(1.5, 0.22, 0.62, woodDark);
    hull.position.y = y + 0.05;
    boat.add(hull);
    for (const side of [-1, 1]) {
      const rail = box(1.5, 0.12, 0.08, wood);
      rail.position.set(0, y + 0.2, side * 0.28);
      boat.add(rail);
      const bow = box(0.36, 0.3, 0.36, woodDark); // pointes : cubes tournés de 45°
      bow.rotation.y = Math.PI / 4;
      bow.scale.set(1, 1, 0.85);
      bow.position.set(side * 0.76, y + 0.09, 0);
      boat.add(bow);
    }
    const seat = box(0.22, 0.06, 0.5, woodLight);
    seat.position.set(0.1, y + 0.2, 0);
    boat.add(seat);
    const oar = box(1.1, 0.04, 0.07, woodLight);
    oar.position.set(-0.15, y + 0.2, 0.12);
    oar.rotation.y = 0.18;
    boat.add(oar);
    boat.position.set(x0 - 1.8, 0, -2.1);
    boat.rotation.y = 0.06;
    this.group.add(boat);

    // Roseaux : touffes de tiges fines près des rives, quelques massettes brunes.
    // [rive, position le long de la rive] : 'w' = ouest (le long de z), 'n' = nord (le long de x).
    const clusters = [['w', -10.2], ['w', -8.6], ['w', -6.1], ['w', 1.6], ['w', 2.6], ['w', 6.8],
      ['w', 8.1], ['w', 10.3], ['n', -9.5], ['n', -2.4], ['n', 4.8], ['n', 6], ['n', 10.6]];
    const stems = [];
    const heads = [];
    for (const [side, along] of clusters) {
      const out = 0.35 + rng() * 1.2; // distance à la rive
      const n = 5 + Math.floor(rng() * 4);
      for (let i = 0; i < n; i++) {
        const o = out + rng() * 0.6;
        const a = along + (rng() - 0.5) * 0.9;
        const sx = side === 'w' ? x0 - o : a;
        const sz = side === 'w' ? a : this.shoreZ - o;
        const sh = 0.45 + rng() * 0.55;
        stems.push({ x: sx, z: sz, h: sh, c: rng() });
        if (rng() < 0.3) heads.push({ x: sx, z: sz, y: y + sh });
      }
    }
    const reedColors = [PALETTE.sageDark, PALETTE.sage, PALETTE.sageLight].map((c) => new THREE.Color(c));
    const stemMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 1, 0.07), toon(0xffffff), stems.length);
    const headMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.11, 0.2, 0.11), woodDark, heads.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const v = new THREE.Vector3();
    const sc = new THREE.Vector3();
    stems.forEach((s, i) => {
      q.setFromEuler(e.set((s.c - 0.5) * 0.25, 0, (s.c - 0.3) * 0.2)); // légèrement penchés
      m.compose(v.set(s.x, y + s.h / 2, s.z), q, sc.set(1, s.h, 1));
      stemMesh.setMatrixAt(i, m);
      stemMesh.setColorAt(i, reedColors[Math.floor(s.c * 3)]);
    });
    heads.forEach((s, i) => headMesh.setMatrixAt(i, m.makeTranslation(s.x, s.y, s.z)));
    for (const mesh of [stemMesh, headMesh]) this.group.add(shaded(mesh));

    // Galets sur la berge et dans l'eau peu profonde.
    const stone = toon(PALETTE.slateLight);
    const pale = toon(PALETTE.parchmentShade);
    for (let i = 0; i < 22; i++) {
      const s = 0.14 + rng() * 0.22;
      const rock = box(s, s * 0.6, s * (0.8 + rng() * 0.5), rng() < 0.5 ? stone : pale);
      const inWater = rng() < 0.35;
      const across = inWater ? -0.2 - rng() * 0.8 : 0.15 + rng() * 0.7; // vers la grille : +
      const along = -h + 0.5 + rng() * (2 * h - 1);
      const onWest = i % 3 !== 2;
      rock.position.set(
        onWest ? x0 + across : along,
        (inWater ? y : LAKE.shoreY) + s * 0.2,
        onWest ? along : this.shoreZ + across,
      );
      rock.rotation.y = rng() * Math.PI;
      this.group.add(rock);
    }
  }

  // hour = état du cycle (daycycle.js) ; iso = IsoCamera ; lights = [{ x, z, strength }] ;
  // lantern = { x, z, strength } ou null ; beam = { x, z, angle, strength } ou null.
  update(dt, hour, iso, { lights, lantern, beam }) {
    const u = this.uniforms;
    u.uTime.value += dt;
    const n = hour.night;
    u.uDeep.value.lerpColors(this.day[0], this.night[0], n);
    u.uBase.value.lerpColors(this.day[1], this.night[1], n);
    u.uLight.value.lerpColors(this.day[2], this.night[2], n);
    // Reflets : couleur du soleil (doré l'après-midi, rosé au crépuscule), lune la nuit.
    u.uGlint.value.setRGB(...hour.sunColor, THREE.SRGBColorSpace).lerp(this.parchment, 0.3).lerp(this.moon, n * 0.6);
    u.uGlintAmount.value = 1 - 0.5 * n;
    u.uSparkle.value = 0.55 + 0.2 * n;
    u.uNight.value = n;

    // Ancrage du motif : pixel écran + position de la caméra en pixels internes (entiers,
    // la caméra étant alignée au pixel) ⇒ le motif ne glisse pas quand on déplace la vue.
    const ppu = CAMERA.pixelsPerUnit * iso.zoom;
    const cam = iso.camera.position;
    u.uOffset.value.set(
      Math.round(cam.dot(iso.right) * ppu - iso.viewW / 2),
      Math.round(cam.dot(iso.up) * ppu - iso.viewH / 2),
    );

    // Lumières les plus proches d'une rive (le shader éteint le reflet avec la distance).
    const slots = u.uLights.value;
    const gap = (l) => Math.min(l.x - this.shoreX, l.z - this.shoreZ);
    const near = lights.filter((l) => l.strength > 0 && gap(l) < LIGHT_REACH).sort((a, b) => gap(a) - gap(b));
    if (lantern) near.unshift({ ...lantern, strength: lantern.strength * 1.3, reach: LANTERN_REACH });
    for (let i = 0; i < MAX_LIGHTS; i++) {
      const l = near[i];
      if (l) slots[i].set(l.x, l.z, l.strength, l.reach ?? LIGHT_REACH);
      else slots[i].set(0, 0, 0, 1);
    }

    if (beam) u.uBeam.value.set(beam.x, beam.z, beam.angle, beam.strength);
    else u.uBeam.value.w = 0;
  }
}
