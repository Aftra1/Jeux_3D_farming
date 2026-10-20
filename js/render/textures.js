// Génération procédurale des textures pixel (couleurs pleines, aucun dégradé).
// Toutes les textures utilisent NearestFilter et pas de mipmaps.

import * as THREE from 'three';
import { PALETTE } from '../config.js';

// Générateur pseudo-aléatoire déterministe (mulberry32) : même monde à chaque chargement.
export function createRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;

function canvasTexture(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  draw(ctx);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function px(ctx, x, y, color) {
  ctx.fillStyle = hex(color);
  ctx.fillRect(x, y, 1, 1);
}

// Dessus de la grille : un atlas size*t x size*t, une variante d'herbe par case,
// avec un liseré d'un pixel plus sombre qui matérialise les cases.
export function createGroundTopTexture(size, t, seed = 7) {
  const rng = createRng(seed);
  return canvasTexture(size * t, size * t, (ctx) => {
    ctx.fillStyle = hex(PALETTE.sage);
    ctx.fillRect(0, 0, size * t, size * t);

    for (let tz = 0; tz < size; tz++) {
      for (let tx = 0; tx < size; tx++) {
        const ox = tx * t;
        const oy = tz * t;
        // Touffes d'herbe claires et sombres, clairsemées
        const tufts = Math.floor(rng() * 3);
        for (let i = 0; i < tufts; i++) {
          const x = ox + 1 + Math.floor(rng() * (t - 2));
          const y = oy + 1 + Math.floor(rng() * (t - 2));
          px(ctx, x, y, rng() < 0.6 ? PALETTE.sageLight : PALETTE.sageDark);
        }
        // Rare petite fleur crème
        if (rng() < 0.12) {
          const x = ox + 2 + Math.floor(rng() * (t - 4));
          const y = oy + 2 + Math.floor(rng() * (t - 4));
          px(ctx, x, y, PALETTE.parchment);
        }
        // Liseré de case (bord droit et bas)
        ctx.fillStyle = hex(PALETTE.sageDark);
        ctx.fillRect(ox + t - 1, oy, 1, t);
        ctx.fillRect(ox, oy + t - 1, t, 1);
      }
    }
  });
}

// Flancs du socle : bordure d'herbe en haut, puis terre brune striée.
// Une tuile de t x h pixels, répétée horizontalement une fois par case.
export function createGroundSideTexture(t, h, seed = 11) {
  const rng = createRng(seed);
  const tex = canvasTexture(t, h, (ctx) => {
    ctx.fillStyle = hex(PALETTE.wood);
    ctx.fillRect(0, 0, t, h);
    // Strates sombres
    for (let y = 3; y < h; y += 3) {
      for (let x = 0; x < t; x++) {
        if (rng() < 0.45) px(ctx, x, y, PALETTE.woodDark);
      }
    }
    // Quelques cailloux clairs
    for (let i = 0; i < 2; i++) {
      px(ctx, Math.floor(rng() * t), 3 + Math.floor(rng() * (h - 3)), PALETTE.woodLight);
    }
    // Bordure d'herbe qui déborde, irrégulière
    ctx.fillStyle = hex(PALETTE.sage);
    ctx.fillRect(0, 0, t, 1);
    for (let x = 0; x < t; x++) {
      if (rng() < 0.5) px(ctx, x, 1, PALETTE.sageDark);
    }
  });
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

// Surbrillance de case : cadre d'un pixel avec coins renforcés, intérieur
// légèrement voilé. Texture en niveaux de gris, teintée par la couleur du
// matériau (ambre = interactif, rouge discret = refus). Répétable par case.
export function createHighlightTexture(t) {
  const tex = canvasTexture(t, t, (ctx) => {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.fillRect(0, 0, t, t);
    ctx.fillStyle = '#d8d8d8';
    ctx.fillRect(0, 0, t, 1);
    ctx.fillRect(0, t - 1, t, 1);
    ctx.fillRect(0, 0, 1, t);
    ctx.fillRect(t - 1, 0, 1, t);
    ctx.fillStyle = '#ffffff';
    for (const [x, y] of [[0, 0], [t - 1, 0], [0, t - 1], [t - 1, t - 1]]) {
      ctx.fillRect(x, y, 1, 1);
    }
  });
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// Lueur au pied d'un bâtiment renforcé : liseré pointillé sur le pourtour d'un
// carré de n x n texels (niveaux de gris, teinté par le matériau), intérieur vide.
export function createGlowRingTexture(n) {
  return canvasTexture(n, n, (ctx) => {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.fillRect(0, 0, n, 2);
    ctx.fillRect(0, n - 2, n, 2);
    ctx.fillRect(0, 0, 2, n);
    ctx.fillRect(n - 2, 0, 2, n);
    ctx.fillStyle = '#ffffff';
    for (let i = 1; i < n - 1; i += 2) {
      for (const [x, y] of [[i, 0], [i, n - 1], [0, i], [n - 1, i]]) ctx.fillRect(x, y, 1, 1);
    }
  });
}

function repeating(tex) {
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// Planches verticales de bois brun (1 unité monde = t pixels).
export function createPlankTexture(t, seed = 21) {
  const rng = createRng(seed);
  return repeating(canvasTexture(t, t, (ctx) => {
    ctx.fillStyle = hex(PALETTE.wood);
    ctx.fillRect(0, 0, t, t);
    for (let x = 0; x < t; x += 4) {
      ctx.fillStyle = hex(PALETTE.woodDark);
      ctx.fillRect(x, 0, 1, t);
    }
    for (let i = 0; i < 2; i++) {
      px(ctx, 1 + Math.floor(rng() * (t - 1)), Math.floor(rng() * t), PALETTE.woodLight);
    }
  }));
}

// Bardeaux d'ardoise en rangées décalées.
export function createShingleTexture(t) {
  return repeating(canvasTexture(t, t, (ctx) => {
    ctx.fillStyle = hex(PALETTE.slateMid);
    ctx.fillRect(0, 0, t, t);
    for (let y = 0; y < t; y += 2) {
      ctx.fillStyle = hex(PALETTE.slate);
      ctx.fillRect(0, y + 1, t, 1);
      const offset = (y / 2) % 2 === 0 ? 0 : 2;
      for (let x = offset; x < t; x += 4) {
        px(ctx, x, y, PALETTE.slateLight);
        px(ctx, x + 3, y, PALETTE.slate);
      }
    }
  }));
}

// Fenêtre : vitre ambre éclairée (reflet clair) ou éteinte (ardoise), croisillon de bois.
export function createWindowTexture(lit = true) {
  return canvasTexture(5, 7, (ctx) => {
    ctx.fillStyle = hex(lit ? PALETTE.amber : PALETTE.slateDeep);
    ctx.fillRect(0, 0, 5, 7);
    ctx.fillStyle = hex(lit ? PALETTE.amberLight : PALETTE.slate);
    ctx.fillRect(0, 0, 2, 3);
    ctx.fillRect(3, 4, 1, 1);
    ctx.fillStyle = hex(PALETTE.woodDark);
    ctx.fillRect(2, 0, 1, 7);
    ctx.fillRect(0, 3, 5, 1);
  });
}

// Meurtrière : fente verticale éclairée (ambre) ou éteinte (ardoise), 3x7 px.
export function createSlitTexture(lit = true) {
  return canvasTexture(3, 7, (ctx) => {
    ctx.fillStyle = hex(lit ? PALETTE.amber : PALETTE.slateDeep);
    ctx.fillRect(0, 0, 3, 7);
    ctx.fillStyle = hex(lit ? PALETTE.amberLight : PALETTE.slate);
    ctx.fillRect(1, 1, 1, 4);
  });
}

// Pierre claire en assises décalées (1 unité = t pixels).
export function createStoneTexture(t) {
  return repeating(canvasTexture(t, t, (ctx) => {
    ctx.fillStyle = hex(PALETTE.parchmentDark);
    ctx.fillRect(0, 0, t, t);
    ctx.fillStyle = hex(PALETTE.parchmentShade);
    for (let y = 0; y < t; y += 3) {
      ctx.fillRect(0, y + 2, t, 1);
      const offset = (y / 3) % 2 === 0 ? 1 : 4;
      ctx.fillRect(offset, y, 1, 2);
    }
    ctx.fillStyle = hex(PALETTE.parchment);
    ctx.fillRect(5, 0, 1, 1);
    ctx.fillRect(2, 3, 1, 1);
  }));
}

// Étincelle de production : petite étoile ambre à 4 branches (7x7 px).
export function createSparkTexture() {
  return canvasTexture(7, 7, (ctx) => {
    ctx.fillStyle = hex(PALETTE.amber);
    ctx.fillRect(3, 0, 1, 7);
    ctx.fillRect(0, 3, 7, 1);
    ctx.fillRect(2, 2, 3, 3);
    ctx.fillStyle = hex(PALETTE.amberLight);
    ctx.fillRect(3, 1, 1, 5);
    ctx.fillRect(1, 3, 5, 1);
  });
}

// Éclat de Présage : petit losange creux pâle (doré clair et parchemin), 7x7 px —
// distinct de l'étoile ambre pleine des Savoirs.
export function createOmenTexture() {
  return canvasTexture(7, 7, (ctx) => {
    ctx.fillStyle = hex(PALETTE.amberLight);
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(3 - i, i, 1, 1);
      ctx.fillRect(3 + i, i, 1, 1);
      ctx.fillRect(3 - i, 6 - i, 1, 1);
      ctx.fillRect(3 + i, 6 - i, 1, 1);
    }
    ctx.fillStyle = hex(PALETTE.parchment);
    ctx.fillRect(3, 3, 1, 1);
  });
}

// Rampe d'ombrage plat à 3 niveaux pour MeshToonMaterial.
let toonRamp = null;
export function getToonRamp() {
  if (!toonRamp) {
    const data = new Uint8Array([90, 170, 255]);
    toonRamp = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
    toonRamp.magFilter = THREE.NearestFilter;
    toonRamp.minFilter = THREE.NearestFilter;
    toonRamp.generateMipmaps = false;
    toonRamp.needsUpdate = true;
  }
  return toonRamp;
}
