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
  sanctuary: svg(`
    <path fill="#ffd98a" d="M5 3h2v1H5z"/>
    <path fill="#f2b33d" d="M5 4h2v2H5zM4 5h1v1H4zM7 5h1v1H7z"/>
    <path fill="#3e4e6e" d="M4 6h4v1H4zM5 7h2v2H5z"/>
    <path fill="#5d7194" d="M1 5h1v5H1zM10 5h1v5H10zM3 4h1v3H3zM8 4h1v3H8z"/>
    <path fill="#cdbb92" d="M1 9h10v2H1z"/>
    <path fill="#1b2333" d="M1 11h10v1H1z"/>`),

  // Carnet : couverture bois, tranche parchemin, signet ardoise
  journal: svg(`
    <path fill="#4a2f22" d="M2 1h8v10H2z"/>
    <path fill="#6e4a31" d="M3 1h7v9H3z"/>
    <path fill="#eadfc0" d="M3 10h7v1H3z"/>
    <path fill="#cdbb92" d="M5 3h3v1H5zM5 5h3v1H5z"/>
    <path fill="#3e4e6e" d="M8 9h1v3H8z"/>`),

  // Cadenas (bâtiment verrouillé)
  lock: svg(`
    <path fill="#3e4e6e" d="M4 1h4v1h1v3H8V2H4v3H3V2h1z"/>
    <path fill="#6e4a31" d="M2 5h8v6H2z"/>
    <path fill="#4a2f22" d="M5 7h2v2H5z"/>`),
};
