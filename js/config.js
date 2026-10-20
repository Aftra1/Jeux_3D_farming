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
  parchmentShade: 0xa8977a, // joints de la pierre claire
  parchmentDark: 0xcdbb92,  // pierre claire (Observatoire)
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

  // Cycle jour/nuit (DAYCYCLE) : lumières et ciel de chaque phase, tous dans les
  // tons ardoise / bois / doré de la DA. Le ciel de l'après-midi est `slate`.
  sunDusk: 0xf0a277,      // soleil couchant, plus rosé
  sunDawn: 0xf6d2a2,      // soleil levant, doré pâle
  moonlight: 0xa9bde6,    // lune : bleu clair froid
  skyDusk: 0x3b3a58,      // ardoise teintée de prune
  skyNight: 0x1f2a42,     // entre slateDeep et slate : jamais noir
  skyDawn: 0x34425f,
  skylightDusk: 0x9a8fb8,
  skylightNight: 0x7f95cc,
  groundBounceNight: 0x2c3040,
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

// Ambiance sonore (js/audio/audio.js) : tout est synthétisé, aucun fichier audio.
// Gains linéaires (0..1) avant le volume du joueur ; durées en secondes.
export const AUDIO = {
  masterGain: 0.5,          // plafond global (volume joueur 100 %)
  defaultVolume: 0.6,       // réglage initial du curseur
  fadeSeconds: 0.4,         // fondu à la coupure, au masquage de l'onglet, au volume
  reverb: { seconds: 2.6, wet: 0.35 },

  // Gamme pentatonique majeure de ré : demi-tons au-dessus de la tonique (MIDI).
  scale: { rootMidi: 62, steps: [0, 2, 4, 7, 9] },
  detuneCents: 6,           // variation aléatoire de hauteur, ± (évite la répétition)
  velocityJitter: 0.25,     // variation aléatoire de volume, ± 25 %

  // Nappe grave : tonique et quinte deux octaves plus bas, une voix haute qui glisse
  // lentement vers une autre note de la gamme toutes les `changeSeconds`.
  pad: { gain: 0.07, octave: -2, filterHz: 420, lfoHz: 0.04, changeSeconds: 18, glideSeconds: 6 },
  // Lac : bruit filtré grave qui ondule, plus de petits clapotis aléatoires.
  water: {
    gain: 0.05, filterHz: 380, swellHz: 0.11,
    lapGain: 0.025, lapEverySeconds: [0.35, 1.3], lapHz: [500, 1500], lapSeconds: [0.12, 0.35],
  },

  // Nuit (DAYCYCLE night = 1) : nappe plus feutrée et voix haute une octave plus bas
  // (reste dans la gamme), clapotis plus rares et plus doux. Interpolé selon l'heure.
  night: { padFilterScale: 0.6, highOctaveDrop: 1, lapGainScale: 0.55, lapIntervalScale: 1.8,
    waterGainScale: 0.8, smoothSeconds: 4 },

  sfx: {
    gain: 0.6,
    place: { gain: 0.35, octave: -1 },                         // « toc-toc » boisé
    knowledge: { gain: 0.07, octave: 1, maxPerSecond: 3 },     // tintement, plafonné
    omens: { gain: 0.12, octave: 2, maxPerSecond: 0.5 },       // note cristalline, plus longue
    unlock: { gain: 0.16, octave: 1, noteSeconds: 0.2, notes: 4 }, // courte phrase
    // Phare achevé : phrase plus longue qui monte puis se pose, sur une tonique grave tenue.
    finale: { gain: 0.15, octave: 1, noteSeconds: 0.32, contour: [0, 1, 2, 4, 3, 5, 4, 6, 7],
      drone: { gain: 0.1, octave: -1, seconds: 4 } },
    refuse: { gain: 0.18, octave: -1, maxPerSecond: 3 },       // son sourd et doux
  },
};

// Cycle jour/nuit (js/world/daycycle.js) : purement visuel et sonore.
// Chaque phase est tenue `holdSeconds`, puis glisse vers la suivante pendant
// `fadeSeconds` (courbe douce). Total : 480 s = 8 min. L'heure = temps réel écoulé
// depuis le début de la partie (sauvegardé), modulo la durée du cycle.
// sun/moon : direction d'où vient la lumière (normalisée), couleur, intensité.
// hemi : lumière ambiante (ciel, sol, intensité). night (0..1) : lueur des ouvertures
// et sons de nuit. Lisibilité : intensités nocturnes volontairement élevées.
export const DAYCYCLE = {
  lightDistance: 17,
  freezeFadeSeconds: 3,   // « figer l'heure » : retour doux vers l'après-midi
  phases: [
    { id: 'afternoon', holdSeconds: 140, fadeSeconds: 50, sky: PALETTE.slate,
      sun: { dir: [-14, 9, 6], color: PALETTE.sunlight, intensity: 3.4 },
      hemi: { sky: PALETTE.skylight, ground: PALETTE.groundBounce, intensity: 1.1 }, night: 0 },
    { id: 'dusk', holdSeconds: 30, fadeSeconds: 50, sky: PALETTE.skyDusk,
      sun: { dir: [-12, 4, 11], color: PALETTE.sunDusk, intensity: 2.6 },
      hemi: { sky: PALETTE.skylightDusk, ground: PALETTE.groundBounce, intensity: 1.15 }, night: 0.45 },
    { id: 'night', holdSeconds: 80, fadeSeconds: 50, sky: PALETTE.skyNight,
      sun: { dir: [7, 13, -6], color: PALETTE.moonlight, intensity: 1.7 },
      hemi: { sky: PALETTE.skylightNight, ground: PALETTE.groundBounceNight, intensity: 1.35 }, night: 1 },
    { id: 'dawn', holdSeconds: 30, fadeSeconds: 50, sky: PALETTE.skyDawn,
      sun: { dir: [12, 5, -4], color: PALETTE.sunDawn, intensity: 2.5 },
      hemi: { sky: PALETTE.skylight, ground: PALETTE.groundBounce, intensity: 1.15 }, night: 0.35 },
  ],
  // Ouvertures et vasques allumées : luminosité x (1 + glowBoost * night) ;
  // opacité du halo des Sanctuaires : de haloOpacity[0] (jour) à haloOpacity[1] (nuit).
  glowBoost: 0.35,
  haloOpacity: [0.35, 0.6],
  // Lanterne du Phare achevé : lumière ponctuelle ambre, d'intensité beacon.intensity * night
  // (éteinte le jour). Portée courte et douce : le domaine reste lisible.
  beacon: { intensity: 6, distance: 9, decay: 1.2 },
};
