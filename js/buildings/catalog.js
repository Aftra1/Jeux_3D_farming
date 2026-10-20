// Catalogue des types de bâtiments. Une entrée = données de conception
// (nom, emprise) + fabrique du modèle 3D. Les règles de simulation
// viendront s'ajouter ici (production, coût, effets…).

import { buildLibrary } from './models.js';

export const BUILDING_TYPES = {
  library: {
    id: 'library',
    name: 'Bibliothèque',
    footprint: { w: 2, d: 2 },
    build: buildLibrary,
  },
};

export function getBuildingType(id) {
  return BUILDING_TYPES[id] || null;
}
