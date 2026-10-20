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

// Surbrillance de case : cadre ambre d'un pixel avec coins renforcés,
// intérieur légèrement teinté.
export function createHighlightTexture(t) {
  return canvasTexture(t, t, (ctx) => {
    ctx.fillStyle = 'rgba(242, 179, 61, 0.22)';
    ctx.fillRect(0, 0, t, t);
    ctx.fillStyle = hex(PALETTE.amber);
    ctx.fillRect(0, 0, t, 1);
    ctx.fillRect(0, t - 1, t, 1);
    ctx.fillRect(0, 0, 1, t);
    ctx.fillRect(t - 1, 0, 1, t);
    ctx.fillStyle = hex(PALETTE.amberLight);
    for (const [x, y] of [[0, 0], [t - 1, 0], [0, t - 1], [t - 1, t - 1]]) {
      ctx.fillRect(x, y, 1, 1);
    }
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
