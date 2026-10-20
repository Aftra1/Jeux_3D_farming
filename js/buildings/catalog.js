// Registre des types de bâtiments : présentation et modèle 3D.
// Les règles chiffrées (coût, déblocage, production) sont dans js/balance.js,
// sous la même clé. Ajouter un type de bâtiment :
//   1. une entrée ici (noms, emprise, hauteur, icône, fabrique du modèle) ;
//   2. une entrée dans BALANCE.buildings ;
//   3. son modèle dans models.js et son icône dans js/ui/icons.js.
// Barre d'outils, placement, simulation, sauvegarde et panneau hors ligne
// s'adaptent seuls.

import { buildLibrary, buildObservatory } from './models.js';

export const BUILDING_TYPES = {
  library: {
    id: 'library',
    name: 'Bibliothèque',
    plural: 'Bibliothèques',
    one: 'votre Bibliothèque',
    many: 'vos Bibliothèques',
    verb: 'rassemblé',       // pour le panneau de retour : « … ont rassemblé 12 Savoirs »
    footprint: { w: 2, d: 2 },
    height: 1.95,            // hauteur du faîte, pour placer les effets au-dessus
    icon: 'library',
    build: buildLibrary,
  },
  observatory: {
    id: 'observatory',
    name: 'Observatoire',
    plural: 'Observatoires',
    one: 'votre Observatoire',
    many: 'vos Observatoires',
    verb: 'déchiffré',
    footprint: { w: 1, d: 1 },
    height: 2.1,
    icon: 'observatory',
    build: buildObservatory,
  },
};

// Ordre d'affichage dans la barre d'outils.
export const BUILDING_ORDER = Object.keys(BUILDING_TYPES);

export function getBuildingType(id) {
  return BUILDING_TYPES[id] || null;
}
