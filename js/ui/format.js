// Mise en forme des nombres de l'interface (sans DOM, testable sous Node).
// Grands nombres abrégés à la française : 1,2 k ; 15,4 k ; 2 M. Arrondi à l'inférieur pour ce
// qu'on possède (jamais plus qu'en réalité), au supérieur pour ce qu'il manque (`up`).

const NBSP = ' ';
const GROUP = '\u00a0'; // espace insécable (la police pixel n'a pas l'espace fine)
const UNITS = [[1e9, 'Md'], [1e6, 'M'], [1e3, 'k']];

export function abbreviate(n, { up = false } = {}) {
  const v = up ? Math.ceil(n) : Math.floor(n);
  if (v < 1000) return String(v);
  for (const [size, unit] of UNITS) {
    if (v < size) continue;
    const q = (up ? Math.ceil((v / size) * 10) : Math.floor((v / size) * 10)) / 10;
    if (q >= 1000 && size < 1e9) return abbreviate(q * size, { up });
    return `${String(q).replace('.', ',')}${NBSP}${unit}`;
  }
  return String(v);
}

// Valeur exacte, groupée par milliers : 11 500.
export function exact(n) {
  return String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, GROUP);
}
