// Icônes pixel en SVG (grille 12x12, `shape-rendering: crispEdges`).
// Couleurs = palette (config.js). Une icône par ressource et par bâtiment.

const svg = (paths) =>
  `<svg class="icon" viewBox="0 0 12 12" aria-hidden="true" shape-rendering="crispEdges">${paths}</svg>`;

export const ICONS = {
  // Petit grimoire (Savoirs)
  grimoire: svg(`
    <path fill="#4a2f22" d="M1 2h10v9H1z"/>
    <path fill="#6e4a31" d="M2 2h8v8H2z"/>
    <path fill="#eadfc0" d="M2 9h8v1H2z"/>
    <path fill="#cdbb92" d="M2 10h8v1H2z"/>
    <path fill="#9a6a43" d="M4 4h4v1H4zM4 6h4v1H4zM5 4h2v3H5z"/>
    <path fill="#3e4e6e" d="M8 1h1v3H8z"/>`),

  // Œil stylisé (Présages) : paupière ardoise, iris doré pâle
  eye: svg(`
    <path fill="#2a3650" d="M4 3h4v1h2v1h1v2h-1v1H8v1H4V8H2V7H1V5h1V4h2z"/>
    <path fill="#eadfc0" d="M4 4h4v1h1v2H8v1H4V7H3V5h1z"/>
    <path fill="#ffd98a" d="M5 4h2v4H5z"/>
    <path fill="#1b2333" d="M5.5 5h1v2h-1z"/>
    <path fill="#5d7194" d="M5 1h2v1H5zM2 2h1v1H2zM9 2h1v1H9z"/>`),

  // Coquillage stylisé (Reliques) : valves crème striées de bois, charnière sombre
  shell: svg(`
    <path fill="#4a2f22" d="M5 1h2v1h2v1h1v1h1v3h-1v1H9v1H8v1H4V9H3V8H2V7H1V4h1V3h1V2h2z"/>
    <path fill="#eadfc0" d="M5 2h2v1h2v1h1v3H9v1H8v1H4V8H3V7H2V4h1V3h2z"/>
    <path fill="#cdbb92" d="M4 4h1v4H4zM7 4h1v4H7zM9 5h1v2H9zM2 5h1v2H2z"/>
    <path fill="#9a6a43" d="M5 9h2v2H5z"/>`),

  // Bibliothèque : toit ardoise, murs bois, fenêtre ambre
  library: svg(`
    <path fill="#3e4e6e" d="M5 1h2v1h1v1h1v1h1v1h1v1H1V5h1V4h1V3h1V2h1z"/>
    <path fill="#6e4a31" d="M2 6h8v5H2z"/>
    <path fill="#4a2f22" d="M2 6h1v5H2zM9 6h1v5H9zM5 8h2v3H5z"/>
    <path fill="#f2b33d" d="M7 7h2v1H7z"/>
    <path fill="#1b2333" d="M1 11h10v1H1z"/>`),

  // Observatoire : tour de pierre claire, coupole ardoise, meurtrière ambre
  observatory: svg(`
    <path fill="#3e4e6e" d="M5 0h2v1h1v1h1v2H3V2h1V1h1z"/>
    <path fill="#4a2f22" d="M8 0h1v1H8z"/>
    <path fill="#cdbb92" d="M4 4h4v7H4z"/>
    <path fill="#a8977a" d="M4 6h4v1H4zM4 9h4v1H4z"/>
    <path fill="#f2b33d" d="M6 5h1v2H6z"/>
    <path fill="#4a2f22" d="M5 9h2v2H5z"/>
    <path fill="#1b2333" d="M3 11h6v1H3z"/>`),

  // Sanctuaire : pierres dressées ardoise autour d'une vasque, lueur ambre
  // Embarcadère : eau ardoise, ponton de bois sur pieux, lanterne ambre au bout
  embarcadere: svg(`
    <path fill="#3e4e6e" d="M0 8h12v4H0z"/>
    <path fill="#5d7194" d="M1 10h3v1H1zM7 11h3v1H7z"/>
    <path fill="#9a6a43" d="M0 6h11v2H0z"/>
    <path fill="#4a2f22" d="M2 8h1v3H2zM6 8h1v3H6zM10 8h1v3h-1zM10 2h1v4h-1z"/>
    <path fill="#f2b33d" d="M9 3h3v2H9z"/>`),

  sanctuary: svg(`
    <path fill="#ffd98a" d="M5 3h2v1H5z"/>
    <path fill="#f2b33d" d="M5 4h2v2H5zM4 5h1v1H4zM7 5h1v1H7z"/>
    <path fill="#3e4e6e" d="M4 6h4v1H4zM5 7h2v2H5z"/>
    <path fill="#5d7194" d="M1 5h1v5H1zM10 5h1v5H10zM3 4h1v3H3zM8 4h1v3H8z"/>
    <path fill="#cdbb92" d="M1 9h10v2H1z"/>
    <path fill="#1b2333" d="M1 11h10v1H1z"/>`),

  // Phare du Lac : toit ardoise, lanterne ambre, galerie bois, fût de pierre claire
  lighthouse: svg(`
    <path fill="#3e4e6e" d="M5 0h2v1H5zM4 1h4v1H4z"/>
    <path fill="#f2b33d" d="M4 2h4v2H4z"/>
    <path fill="#4a2f22" d="M4 2h1v2H4zM7 2h1v2H7zM3 4h6v1H3z"/>
    <path fill="#eadfc0" d="M4 5h4v3H4zM3 8h6v3H3z"/>
    <path fill="#3e4e6e" d="M4 6h4v1H4zM3 9h6v1H3z"/>
    <path fill="#4a2f22" d="M5 9h2v2H5z"/>
    <path fill="#1b2333" d="M2 11h8v1H2z"/>`),

  // Carnet : couverture bois, tranche parchemin, signet ardoise
  journal: svg(`
    <path fill="#4a2f22" d="M2 1h8v10H2z"/>
    <path fill="#6e4a31" d="M3 1h7v9H3z"/>
    <path fill="#eadfc0" d="M3 10h7v1H3z"/>
    <path fill="#cdbb92" d="M5 3h3v1H5zM5 5h3v1H5z"/>
    <path fill="#3e4e6e" d="M8 9h1v3H8z"/>`),

  // Lanterne allumée (écran titre, partie terminée) : toit ardoise, verre ambre, socle bois
  lantern: svg(`
    <path fill="#3e4e6e" d="M5 0h2v1h1v1h1v1H3V2h1V1h1z"/>
    <path fill="#4a2f22" d="M3 3h6v1H3zM3 9h6v1H3zM4 10h4v1H4zM3 4h1v5H3zM8 4h1v5H8z"/>
    <path fill="#ffd98a" d="M4 4h4v5H4z"/>
    <path fill="#f2b33d" d="M5 5h2v3H5z"/>`),

  // Missive : lettre pliée, rabat ardoise, cachet de cire bois
  missive: svg(`
    <path fill="#4a2f22" d="M1 2h10v8H1z"/>
    <path fill="#eadfc0" d="M2 3h8v6H2z"/>
    <path fill="#5d7194" d="M2 3h1v1H2zM3 4h1v1H3zM4 5h1v1H4zM7 5h1v1H7zM8 4h1v1H8zM9 3h1v1H9z"/>
    <path fill="#9a6a43" d="M5 5h2v2H5z"/>`),

  // Cadenas (bâtiment verrouillé)
  // Haut-parleur (son actif) et haut-parleur barré (son coupé)
  soundOn: svg(`
    <path fill="#1b2333" d="M1 4h2v4H1zM3 4h1V3h1V2h1v8H5V9H4V8H3z"/>
    <path fill="#3e4e6e" d="M8 5h1v2H8zM10 3h1v6h-1z"/>`),
  soundOff: svg(`
    <path fill="#1b2333" d="M1 4h2v4H1zM3 4h1V3h1V2h1v8H5V9H4V8H3z"/>
    <path fill="#3e4e6e" d="M8 4h1v1H8zM11 4h1v1h-1zM9 5h2v2H9zM8 7h1v1H8zM11 7h1v1h-1z"/>`),

  // Heure qui passe : soleil à gauche, croissant de lune à droite.
  dayCycle: svg(`
    <path fill="#6e4a31" d="M3 1h1v1H3zM1 3h1v1H1zM5 3h1v1H5zM3 5h1v1H3z"/>
    <path fill="#9a6a43" d="M2 2h3v3H2z"/>
    <path fill="#3e4e6e" d="M8 6h2v1h1v3h-1v1H7v-1H6V9h2V8h1V7H8z"/>`),
  // Heure figée : soleil plein de l'après-midi.
  dayFixed: svg(`
    <path fill="#6e4a31" d="M5 0h2v2H5zM5 10h2v2H5zM0 5h2v2H0zM10 5h2v2h-2zM2 2h1v1H2zM9 2h1v1H9zM2 9h1v1H2zM9 9h1v1H9z"/>
    <path fill="#9a6a43" d="M4 3h4v1h1v4H8v1H4V8H3V4h1z"/>`),

  // Engrenage (Options) : roue de bois sombre, moyeu ardoise.
  gear: svg(`
    <path fill="#4a2f22" d="M5 1h2v2h1V2h1v1h1v1H9v1h2v2H9v1h1v1H9v1H8V9H7v2H5V9H4v1H3V9H2V8h1V7H1V5h2V4H2V3h1V2h1v1h1z"/>
    <path fill="#9a6a43" d="M5 4h2v1h1v2H7v1H5V7H4V5h1z"/>
    <path fill="#3e4e6e" d="M5 5h2v2H5z"/>`),

  // Feuille (mode économie d'énergie) : limbe sauge, nervure et tige de bois.
  leaf: svg(`
    <path fill="#4a2f22" d="M6 1h4v1h1v4h-1v2H9v1H7v1H4v1H2v-1h1V9H2V6h1V4h1V3h1V2h1z"/>
    <path fill="#748f68" d="M7 2h3v4H9v2H7v1H4V6h1V4h1V3h1z"/>
    <path fill="#93ab83" d="M7 3h2v1H7zM6 4h1v1H6z"/>
    <path fill="#4a2f22" d="M8 4h1v1H8zM7 5h1v1H7zM6 6h1v1H6zM5 7h1v1H5z"/>`),

  lock: svg(`
    <path fill="#3e4e6e" d="M4 1h4v1h1v3H8V2H4v3H3V2h1z"/>
    <path fill="#6e4a31" d="M2 5h8v6H2z"/>
    <path fill="#4a2f22" d="M5 7h2v2H5z"/>`),
};
