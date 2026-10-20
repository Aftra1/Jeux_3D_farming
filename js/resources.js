// Registre des ressources : présentation uniquement (noms, icône, effet visuel).
// Les valeurs de départ sont dans js/balance.js. Ajouter une ressource = une
// entrée ici + une dans BALANCE.resources (+ une icône dans js/ui/icons.js).

export const RESOURCE_TYPES = {
  knowledge: {
    id: 'knowledge',
    one: 'Savoir',
    many: 'Savoirs',
    icon: 'grimoire',
    spark: 'star',   // étincelle ambre (render/effects.js)
  },
  omens: {
    id: 'omens',
    one: 'Présage',
    many: 'Présages',
    icon: 'eye',
    spark: 'omen',   // éclat pâle en losange, distinct de l'étoile des Savoirs
  },
};

export const RESOURCE_IDS = Object.keys(RESOURCE_TYPES);

export function resourceLabel(id, n) {
  const res = RESOURCE_TYPES[id];
  if (!res) return id;
  return Math.floor(n) > 1 ? res.many : res.one;
}
