// Îlots du lac (chapitre II, étape 22) : positions fixes autour du domaine, dans le même repère
// de cases (domaine = 0..GRID.size − 1 ; un îlot peut avoir des coordonnées négatives ou au-delà).
// Données pures (sans Three.js) : lues par le terrain, la simulation, la sauvegarde et le rendu.
// Coûts en Reliques : balance.js (BALANCE.islands). Côtés carrés : une texture de sol par îlot.
// Écart d'eau entre deux zones ≥ 4 cases : aucune aura ni emprise ne franchit l'eau (vérifié par les tests).
//   side  côté du domaine d'où part la passerelle ('east' = +x, 'south' = +z, 'north' = −z)

export const ISLANDS = [
  {
    id: 'aulnes',
    name: 'L\'îlot des Aulnes',
    kind: 'wood',
    blurb: 'Un bosquet d\'aulnes serrés, dont les racines boivent le lac.',
    x: 29, z: 4, size: 7,
    side: 'east',
  },
  {
    id: 'ruines',
    name: 'L\'îlot des Pierres',
    kind: 'rock',
    blurb: 'Des rochers gris et les murs bas d\'une ancienne chapelle.',
    x: 9, z: 29, size: 8,
    side: 'south',
  },
  {
    id: 'roseaux',
    name: 'L\'îlot des Roseaux',
    kind: 'reeds',
    blurb: 'Une langue de terre humide, cernée de roseaux qui chuchotent.',
    x: 15, z: -11, size: 6,
    side: 'north',
  },
];

export const ISLAND_IDS = ISLANDS.map((i) => i.id);

export function getIsland(id) {
  return ISLANDS.find((i) => i.id === id) || null;
}
