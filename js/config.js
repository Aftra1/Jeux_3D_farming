// Constantes partagées : palette, grille, rendu, caméra.
// Toute couleur du jeu doit venir de PALETTE.

export const PALETTE = {
  // Bleu ardoise : ombres, ciel, contours
  slateDeep: 0x1b2333,
  slate: 0x2a3650,
  slateMid: 0x3e4e6e,
  slateLight: 0x5d7194,

  // Bois brun chaud : constructions, terre
  woodDark: 0x4a2f22,
  wood: 0x6e4a31,
  woodLight: 0x9a6a43,

  // Parchemin crème : chemins, UI
  parchmentDark: 0xcdbb92,
  parchment: 0xeadfc0,

  // Vert sauge : végétation
  sageDark: 0x56704f,
  sage: 0x748f68,
  sageLight: 0x93ab83,

  // Ambre doré : RÉSERVÉ aux éléments interactifs
  amber: 0xf2b33d,
  amberLight: 0xffd98a,

  // Rouge brique discret : UNIQUEMENT pour signaler un refus (placement impossible)
  refuse: 0xa8524a,

  // Lumières (pas des couleurs de surface)
  sunlight: 0xffc98a,
  skylight: 0x7d93c4,
  groundBounce: 0x3a3226,
};

export const GRID = {
  size: 16,          // 16x16 cases
  tileSize: 1,       // 1 unité monde par case
  texelsPerTile: 8,  // résolution des textures pixel (px par case)
  slabHeight: 1.25,  // épaisseur du socle de terre
};

export const RENDER = {
  shortSide: 180,          // résolution interne visée sur le plus petit côté
  outlineThreshold: 0.6,   // écart de profondeur (unités monde) déclenchant un contour
  outlineStrength: 0.85,
};

export const SAVE = {
  storageKey: 'societe-du-lac:save',
  autosaveSeconds: 10,
};

export const CAMERA = {
  elevationDeg: 30,     // 30° => losanges 2:1 classiques du pixel art iso
  azimuthDeg: 45,
  pixelsPerUnit: 12,    // px internes par unité monde à zoom 1
  minZoom: 0.5,
  maxZoom: 3,
  panMargin: 1,         // marge autorisée au-delà du bord de la grille
};
