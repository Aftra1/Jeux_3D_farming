// Terrain constructible (sans Three.js) : un ensemble de zones rectangulaires de cases dans un
// même repère — le domaine (0..size − 1, centré sur l'origine) et les îlots (world/islands.js).
// Seules les zones ouvertes (le domaine, les îlots ralliés) offrent des cases : partout ailleurs,
// c'est l'eau. Une emprise ne peut pas chevaucher deux zones. Occupation : tile.occupant = uid.

import { GRID } from '../config.js';
import { ISLANDS } from '../world/islands.js';

const key = (x, z) => (x + 1024) * 4096 + (z + 1024);

export class Terrain {
  constructor(size = GRID.size, islands = ISLANDS) {
    this.size = size;
    this.half = (size * GRID.tileSize) / 2;
    this.topY = 0;
    this.zones = [{ id: 'domain', x: 0, z: 0, w: size, d: size },
      ...islands.map((i) => ({ id: i.id, x: i.x, z: i.z, w: i.size, d: i.size }))];
    this.open = new Set(['domain']);
    this.tiles = [];               // toutes les cases, zones fermées comprises
    this.byKey = new Map();
    for (const zone of this.zones) {
      for (let z = zone.z; z < zone.z + zone.d; z++) {
        for (let x = zone.x; x < zone.x + zone.w; x++) {
          // occupant : uid du bâtiment posé sur la case, ou null
          const tile = { x, z, zone: zone.id, ground: 'grass', occupant: null };
          this.tiles.push(tile);
          this.byKey.set(key(x, z), tile);
        }
      }
    }
  }

  // Zones ouvertes : le domaine et les îlots `ids` (les autres se ferment).
  setOpenIslands(ids) {
    this.open = new Set(['domain', ...ids]);
  }

  openZone(id) {
    this.open.add(id);
  }

  zone(id) {
    return this.zones.find((z) => z.id === id) || null;
  }

  inBounds(x, z) {
    return this.getTile(x, z) !== null;
  }

  getTile(x, z) {
    const tile = this.byKey.get(key(x, z));
    return tile && this.open.has(tile.zone) ? tile : null;
  }

  // Zone ouverte qui porte la case (x, z), ou null (eau).
  zoneAt(x, z) {
    const tile = this.getTile(x, z);
    return tile ? this.zone(tile.zone) : null;
  }

  // Case sous un point du monde, ou null hors des zones ouvertes.
  tileAtWorld(point) {
    if (!point) return null;
    return this.getTile(Math.floor((point.x + this.half) / GRID.tileSize), Math.floor((point.z + this.half) / GRID.tileSize));
  }

  // Centre (sur le dessus du sol) d'une case ; `out` : tout objet { set(x, y, z) } (Vector3).
  tileCenter(x, z, out) {
    return out.set((x + 0.5) * GRID.tileSize - this.half, this.topY, (z + 0.5) * GRID.tileSize - this.half);
  }

  // Coin (x, z) d'une emprise w x d centrée au plus près d'un point du monde.
  // Emprise impaire : la case sous le point ; paire : le sommet de grille le plus proche.
  footprintOrigin(point, w, d) {
    return {
      x: Math.floor((point.x + this.half) / GRID.tileSize - w / 2 + 0.5),
      z: Math.floor((point.z + this.half) / GRID.tileSize - d / 2 + 0.5),
    };
  }

  footprintCenter(x, z, w, d, out) {
    return out.set((x + w / 2) * GRID.tileSize - this.half, this.topY, (z + d / 2) * GRID.tileSize - this.half);
  }

  // Cases couvertes par une emprise (hors zones ouvertes : null).
  *footprintTiles(x, z, w, d) {
    for (let dz = 0; dz < d; dz++) {
      for (let dx = 0; dx < w; dx++) yield this.getTile(x + dx, z + dz);
    }
  }

  // null si l'emprise est libre, sinon 'bounds' (eau, ou à cheval sur deux zones) ou 'occupied'.
  footprintProblem(x, z, w, d) {
    let zone = null;
    for (const tile of this.footprintTiles(x, z, w, d)) {
      if (!tile || (zone && tile.zone !== zone)) return 'bounds';
      zone = tile.zone;
      if (tile.occupant !== null) return 'occupied';
    }
    return null;
  }

  // Vrai s'il reste, sur une zone ouverte, une place libre de w x d cases qui ne chevauche
  // pas `except` ({ x, z, w, d }).
  hasFreeArea({ w, d }, except) {
    const overlaps = (x, z) => except && x < except.x + except.w && except.x < x + w
      && z < except.z + except.d && except.z < z + d;
    for (const zone of this.zones) {
      if (!this.open.has(zone.id)) continue;
      for (let z = zone.z; z + d <= zone.z + zone.d; z++) {
        for (let x = zone.x; x + w <= zone.x + zone.w; x++) {
          if (!overlaps(x, z) && !this.footprintProblem(x, z, w, d)) return true;
        }
      }
    }
    return false;
  }

  // Règle `edge` : l'emprise touche le bord de sa zone (contact avec l'eau).
  touchesEdge(x, z, w, d) {
    const zone = this.zoneAt(x, z);
    if (!zone) return false;
    return x === zone.x || z === zone.z || x + w === zone.x + zone.w || z + d === zone.z + zone.d;
  }

  // Coins de toutes les cases libres d'une zone ouverte où une emprise w x d tiendrait.
  *freeOrigins(w, d) {
    for (const zone of this.zones) {
      if (!this.open.has(zone.id)) continue;
      for (let z = zone.z; z + d <= zone.z + zone.d; z++) {
        for (let x = zone.x; x + w <= zone.x + zone.w; x++) if (!this.footprintProblem(x, z, w, d)) yield [x, z];
      }
    }
  }

  // Distance au centre du monde du coin de zone ouverte le plus éloigné (étendue des ombres).
  reach() {
    let r = 0;
    for (const zone of this.zones) {
      if (!this.open.has(zone.id)) continue;
      for (const x of [zone.x, zone.x + zone.w]) {
        for (const z of [zone.z, zone.z + zone.d]) r = Math.max(r, Math.hypot(x * GRID.tileSize - this.half, z * GRID.tileSize - this.half));
      }
    }
    return r;
  }

  // Rectangle monde { xMin, xMax, zMin, zMax } couvrant les zones `ids` (domaine compris).
  worldBounds(ids = this.open) {
    const b = { xMin: Infinity, xMax: -Infinity, zMin: Infinity, zMax: -Infinity };
    for (const zone of this.zones) {
      if (zone.id !== 'domain' && ![...ids].includes(zone.id)) continue;
      b.xMin = Math.min(b.xMin, zone.x * GRID.tileSize - this.half);
      b.xMax = Math.max(b.xMax, (zone.x + zone.w) * GRID.tileSize - this.half);
      b.zMin = Math.min(b.zMin, zone.z * GRID.tileSize - this.half);
      b.zMax = Math.max(b.zMax, (zone.z + zone.d) * GRID.tileSize - this.half);
    }
    return b;
  }
}
