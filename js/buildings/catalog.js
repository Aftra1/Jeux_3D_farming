// Registre des types de bâtiments : présentation et modèle 3D.
// Les règles chiffrées (coût, déblocage, production) sont dans js/balance.js,
// sous la même clé. Ajouter un type de bâtiment :
//   1. une entrée ici (noms, hauteur, icône, fabrique du modèle) ;
//   2. une entrée dans BALANCE.buildings (dont l'emprise) ;
//   3. son modèle dans models.js et son icône dans js/ui/icons.js.
// Barre d'outils, placement, simulation, sauvegarde et panneau hors ligne
// s'adaptent seuls.

import { BALANCE } from '../balance.js';
import { buildLibrary, buildObservatory, buildSanctuary, buildLighthouse } from './models.js';

export const BUILDING_TYPES = {
  library: {
    id: 'library',
    name: 'Bibliothèque',
    plural: 'Bibliothèques',
    one: 'votre Bibliothèque',
    many: 'vos Bibliothèques',
    verb: 'rassemblé',       // pour le panneau de retour : « … ont rassemblé 12 Savoirs »
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
    height: 2.1,
    icon: 'observatory',
    build: buildObservatory,
  },
  sanctuary: {
    id: 'sanctuary',
    name: 'Sanctuaire',
    plural: 'Sanctuaires',
    one: 'votre Sanctuaire',
    many: 'vos Sanctuaires',
    verb: 'veillé',
    height: 0.9,
    icon: 'sanctuary',
    build: buildSanctuary,
  },
  lighthouse: {
    id: 'lighthouse',
    name: 'Phare du Lac',
    plural: 'Phares',
    one: 'votre Phare',
    many: 'vos Phares',
    verb: 'éclairé',
    height: 3.9,             // achevé ; selon le palier, voir userData.top du modèle
    icon: 'lighthouse',
    build: buildLighthouse,  // reçoit l'enregistrement (palier) ; sans argument : fondations
    // Nom de chaque palier (1 à 5), affiché dans le panneau du Phare.
    stageNames: ['Fondations', 'Base de pierre', 'Fût', 'Galerie', 'Lanterne'],
  },
};

// L'emprise est une règle de jeu (pose, voisinage des auras) : elle vient de balance.js.
for (const [id, def] of Object.entries(BUILDING_TYPES)) def.footprint = BALANCE.buildings[id].footprint;

// Ordre d'affichage dans la barre d'outils.
export const BUILDING_ORDER = Object.keys(BUILDING_TYPES);

export function getBuildingType(id) {
  return BUILDING_TYPES[id] || null;
}
