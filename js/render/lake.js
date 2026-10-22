// Le lac : une seule grande étendue d'eau sous et autour du domaine, posé dessus comme une
// presqu'île (berge tout autour ; rive principale ouest/nord avec ponton, barque, roseaux).
// Décor seul, hors des cases constructibles. Vers les bords de l'écran, l'eau se fond par
// paliers tramés dans une brume de la couleur de l'heure (aussi fond de scène) : pas d'horizon.
// L'eau est un shader pixel : aplats d'ardoise, tirets de reflet qui naissent et s'effacent,
// rangées décalées d'un pixel en marches (ondulation sans flou). Le motif est ancré sur la
// grille des pixels internes (la caméra est alignée au pixel) : un texel = un pixel écran.
// Suit le cycle jour/nuit, reflète la nuit les ouvertures allumées proches de la rive et la
// lanterne du Phare, et montre le passage de son faisceau. Ne lit jamais la simulation :
// main.js lui fournit l'heure, les lumières et le faisceau.

import * as THREE from 'three';
import { PALETTE, GRID, LAKE, CAMERA } from '../config.js';
import { createRng, createShoreTexture, getToonRamp } from './textures.js';

const MAX_LIGHTS = 8;
const MAX_ISLES = 3;       // îlots du lac (world/islands.js)
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
  uniform float uRipple;    // amplitude de l'ondulation des rangées (px, qualité)
  uniform int uLightCount;  // reflets d'ouvertures évalués (qualité)
  uniform float uNight;
  uniform float uShore;     // demi-côté du rectangle des berges (bord de l'eau)
  uniform vec3 uFog;        // brume des bords de l'écran (couleur de l'heure)
  uniform vec2 uRes;        // taille de la vue en pixels internes
  uniform vec4 uLights[${MAX_LIGHTS}]; // x, z, intensité, portée
  uniform vec4 uBeam;       // x, z, angle, intensité
  uniform vec4 uIsles[${MAX_ISLES}]; // îlots visibles : x, z, demi-côté berge comprise, présence
  varying vec3 vWorld;

  float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  // Trame ordonnée 4x4 (0..1) : fondus par paliers de pixels, sans dégradé lisse.
  float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
  float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }

  // Reflet perpendiculaire à une rive : d = distance dans l'eau, side = écart latéral,
  // gap = distance de la lumière à la rive ; s'éteint avec le trajet total.
  float reflection(float d, float side, float gap, vec4 L) {
    if (d <= 0.0 || abs(side) > 0.22 + d * 0.08) return 0.0;
    return L.z * (1.0 - (gap + d) / L.w);
  }

  void main() {
    vec2 s = floor(gl_FragCoord.xy) + uOffset;
    float t = floor(uTime * 5.0) / 5.0; // animation en marches, comme un sprite
    // Ondulation : chaque rangée se décale d'un pixel au plus.
    float shift = floor(sin(s.y * 0.6 + t * 1.3) * uRipple + 0.5);
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

    // Distance au rectangle des berges.
    vec2 q = abs(vWorld.xz) - uShore;
    float dShore = length(max(q, 0.0));
    // Écume d'un pixel le long de la berge, qui respire.
    float foam = 0.14 + 0.07 * sin((vWorld.x + vWorld.z) * 3.0 + t * 1.5);
    if (dShore < foam) col = mix(uBase, uLight, 0.8);
    // Écume autour des îlots, discrète tant qu'ils sont dans la brume.
    for (int i = 0; i < ${MAX_ISLES}; i++) {
      vec4 I = uIsles[i];
      if (I.w <= 0.0) continue;
      vec2 qi = abs(vWorld.xz - I.xy) - I.z;
      if (length(max(qi, 0.0)) < foam) col = mix(col, mix(uBase, uLight, 0.8), step(0.3, I.w) * (0.4 + 0.6 * I.w));
    }

    // La nuit : reflets ambre brisés des ouvertures proches, perpendiculaires à la rive ;
    // ils s'éteignent avec le trajet (ouverture → rive → reflet).
    float glow = 0.0;
    float dash = step(0.4, hash(vec2(floor(p.x / 3.0), p.y) + floor(t * 0.8)));
    for (int i = 0; i < ${MAX_LIGHTS}; i++) {
      if (i >= uLightCount) break;
      vec4 L = uLights[i];
      if (L.z <= 0.0) continue;
      glow = max(glow, reflection(-uShore - vWorld.x, vWorld.z - L.y, L.x + uShore, L)); // ouest
      glow = max(glow, reflection(vWorld.x - uShore, vWorld.z - L.y, uShore - L.x, L));  // est
      glow = max(glow, reflection(-uShore - vWorld.z, vWorld.x - L.x, L.y + uShore, L)); // nord
      glow = max(glow, reflection(vWorld.z - uShore, vWorld.x - L.x, uShore - L.y, L));  // sud
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

    // Brume vers les bords de l'écran : quatre paliers, transitions tramées.
    vec2 c = gl_FragCoord.xy / uRes * 2.0 - 1.0;
    float f = smoothstep(0.45, 1.05, length(c));
    col = mix(col, uFog, clamp(floor(f * 4.0 + bayer4(gl_FragCoord.xy)) / 4.0, 0.0, 1.0));

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

const toon = (color, map) => new THREE.MeshToonMaterial({ color, map: map || null, gradientMap: getToonRamp() });

// Décor du lac qui projette une ombre (désactivable selon la qualité).
const decor = [];
function shaded(mesh) {
  decor.push(mesh);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export class Lake {
  constructor(scene, grid) {
    const h = grid.half;
    const t = GRID.texelsPerTile;
    const length = grid.size * GRID.tileSize;
    const sw = LAKE.shoreWidth;
    this.shoreX = -h - sw; // bord de l'eau, rive ouest
    this.shoreZ = -h - sw; // bord de l'eau, rive nord
    this.scene = scene;
    this.sparkle = 0.55;
    this.group = new THREE.Group();

    // Berges tout autour du socle : même boîte (eau côté local −x) tournée par quarts de tour.
    // Ouest et est couvrent les coins. Leur pied plonge juste sous l'eau.
    const shoreH = LAKE.shoreY - (LAKE.waterY - 0.1);
    const wetSand = toon(PALETTE.parchmentShade);
    const sides = [
      [0, -h - sw / 2, 0, length + 2 * sw, 31],          // ouest
      [-Math.PI / 2, 0, -h - sw / 2, length, 41],        // nord
      [Math.PI, h + sw / 2, 0, length + 2 * sw, 43],     // est
      [Math.PI / 2, 0, h + sw / 2, length, 47],          // sud
    ];
    for (const [rot, x, z, len, seed] of sides) {
      const shore = shaded(new THREE.Mesh(new THREE.BoxGeometry(sw, shoreH, len),
        [wetSand, wetSand, toon(0xffffff, createShoreTexture(sw * t, len * t, seed)), wetSand, wetSand, wetSand]));
      shore.rotation.y = rot;
      shore.position.set(x, LAKE.shoreY - shoreH / 2, z);
      this.group.add(shore);
    }

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
      uRipple: { value: 1.2 },
      uLightCount: { value: MAX_LIGHTS },
      uNight: { value: 0 },
      uShore: { value: h + sw },
      uFog: { value: new THREE.Color() },
      uRes: { value: new THREE.Vector2(1, 1) },
      uLights: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector4()) },
      uBeam: { value: new THREE.Vector4() },
      uIsles: { value: Array.from({ length: MAX_ISLES }, () => new THREE.Vector4()) },
    };
    const surface = new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms: this.uniforms });
    // Un seul grand plan d'eau, sous tout le domaine : il couvre la vue au zoom minimal.
    const water = new THREE.Mesh(new THREE.PlaneGeometry(LAKE.extent, LAKE.extent), surface);
    water.rotation.x = -Math.PI / 2;
    water.position.y = LAKE.waterY;
    this.group.add(water);

    this.#buildDetails(h);
    scene.add(this.group);

    // Zone d'eau principale, à l'ouest (pour les Visiteurs du lac qui en arrivent).
    this.region = { xMin: this.shoreX - LAKE.width, xMax: this.shoreX, zMin: -h, zMax: h };

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

  // Niveau de qualité (QUALITY.levels) : densité des reflets, ondulation, reflets ambre, ombres du décor.
  setQuality(q) {
    this.sparkle = q.sparkle;
    this.uniforms.uRipple.value = q.ripple;
    this.uniforms.uLightCount.value = Math.min(MAX_LIGHTS, q.waterLights);
    for (const mesh of decor) mesh.castShadow = q.decorShadows;
  }

  // hour = état du cycle (daycycle.js) ; iso = IsoCamera ; lights = [{ x, z, strength }] ;
  // lantern = { x, z, strength } ou null ; beam = { x, z, angle, strength } ou null ;
  // isles = [{ x, z, half, amount }] (render/islands.js : écume autour des îlots visibles).
  update(dt, hour, iso, { lights, lantern, beam, isles = [] }) {
    const u = this.uniforms;
    u.uTime.value += dt;
    const n = hour.night;
    u.uDeep.value.lerpColors(this.day[0], this.night[0], n);
    u.uBase.value.lerpColors(this.day[1], this.night[1], n);
    u.uLight.value.lerpColors(this.day[2], this.night[2], n);
    // Reflets : couleur du soleil (doré l'après-midi, rosé au crépuscule), lune la nuit.
    u.uGlint.value.setRGB(...hour.sunColor, THREE.SRGBColorSpace).lerp(this.parchment, 0.3).lerp(this.moon, n * 0.6);
    u.uGlintAmount.value = 1 - 0.5 * n;
    u.uSparkle.value = Math.min(0.95, this.sparkle + 0.2 * n);
    u.uNight.value = n;
    // Brume et fond de scène : l'eau profonde teintée par le ciel de l'heure.
    u.uFog.value.setRGB(...hour.sky, THREE.SRGBColorSpace).lerp(u.uDeep.value, 0.45);
    this.scene.background.copy(u.uFog.value);
    u.uRes.value.set(iso.viewW, iso.viewH);

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
    const gap = (l) => u.uShore.value - Math.max(Math.abs(l.x), Math.abs(l.z));
    // Seulement les ouvertures du domaine : les rives des îlots ne portent pas de reflets.
    const near = lights.filter((l) => l.strength > 0 && gap(l) > 0 && gap(l) < LIGHT_REACH).sort((a, b) => gap(a) - gap(b));
    if (lantern) near.unshift({ ...lantern, strength: lantern.strength * 1.3, reach: LANTERN_REACH });
    for (let i = 0; i < MAX_LIGHTS; i++) {
      const l = near[i];
      if (l) slots[i].set(l.x, l.z, l.strength, l.reach ?? LIGHT_REACH);
      else slots[i].set(0, 0, 0, 1);
    }

    u.uIsles.value.forEach((v, i) => (isles[i] ? v.set(isles[i].x, isles[i].z, isles[i].half, isles[i].amount) : v.set(0, 0, 0, 0)));

    if (beam) u.uBeam.value.set(beam.x, beam.z, beam.angle, beam.strength);
    else u.uBeam.value.w = 0;
  }
}
