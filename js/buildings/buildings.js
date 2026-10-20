// Registre des bâtiments posés : données pures (sérialisables) séparées
// de leur représentation 3D.
//
// Enregistrement d'un bâtiment :
//   { uid: number, type: 'library', x: number, z: number, rotation: 0,
//     prodTicks?, paused?,    (champs de production gérés par la simulation)
//     stage? }                (palier d'un grand chantier : la vue est reconstruite s'il change)
// (x, z) = coin -x/-z de l'emprise ; les cases couvertes portent `occupant = uid`.

import { getBuildingType } from './catalog.js';
import { setLightOn, buildBoostMarker } from './models.js';

const POP_DURATION = 0.35; // s, apparition douce à la pose

export class BuildingManager {
  constructor(grid, scene) {
    this.grid = grid;
    this.scene = scene;
    this.records = [];        // ordre de pose
    this.byUid = new Map();   // uid -> enregistrement
    this.views = new Map();   // uid -> Object3D
    this.nextUid = 1;
    this.pops = [];           // animations d'apparition en cours
  }

  // { ok: true } ou { ok: false, reason: 'unknown' | 'bounds' | 'occupied' }
  canPlace(type, x, z) {
    const def = getBuildingType(type);
    if (!def) return { ok: false, reason: 'unknown' };
    const { w, d } = def.footprint;
    for (const tile of this.grid.footprintTiles(x, z, w, d)) {
      if (!tile) return { ok: false, reason: 'bounds' };
      if (tile.occupant !== null) return { ok: false, reason: 'occupied' };
    }
    return { ok: true };
  }

  place(type, x, z, extra = {}) {
    if (!this.canPlace(type, x, z).ok) return null;
    const record = { uid: this.nextUid++, type, x, z, rotation: 0, ...extra };
    this.#add(record, true);
    return record;
  }

  get(uid) {
    return this.byUid.get(uid) || null;
  }

  at(x, z) {
    const tile = this.grid.getTile(x, z);
    return tile && tile.occupant !== null ? this.get(tile.occupant) : null;
  }

  // Aligne l'aspect des vues sur l'état des données : ouverture éteinte si en pause,
  // lueur au pied si le bâtiment est renforcé (`boosted` : ensemble ou Map d'uid).
  syncViews(boosted = new Set()) {
    for (const record of this.records) {
      let view = this.views.get(record.uid);
      if (!view) continue;
      if (view.userData.stage !== record.stage) view = this.#rebuildView(record, view);
      const lit = !record.paused;
      if (view.userData.lit !== lit) {
        setLightOn(view, lit);
        view.userData.lit = lit;
      }
      const boost = boosted.has(record.uid);
      if (!!view.userData.boostMarker !== boost) {
        if (boost) {
          const { w, d } = getBuildingType(record.type).footprint;
          view.userData.boostMarker = buildBoostMarker(w, d);
          view.add(view.userData.boostMarker);
        } else {
          view.remove(view.userData.boostMarker);
          view.userData.boostMarker.geometry.dispose();
          view.userData.boostMarker = null;
        }
      }
    }
  }

  // Animation d'apparition : léger rebond, jamais brusque.
  update(dt) {
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const pop = this.pops[i];
      pop.t = Math.min(1, pop.t + dt / POP_DURATION);
      const k = 1 - Math.pow(1 - pop.t, 3);
      const s = 0.7 + 0.3 * k + Math.sin(pop.t * Math.PI) * 0.06;
      pop.view.scale.set(s, 0.4 + 0.6 * k + Math.sin(pop.t * Math.PI) * 0.08, s);
      if (pop.t >= 1) {
        pop.view.scale.set(1, 1, 1);
        this.pops.splice(i, 1);
      }
    }
  }

  // Données sauvegardées (la version globale est portée par save/save.js).
  toJSON() {
    return {
      nextUid: this.nextUid,
      buildings: this.records.map((r) => ({ ...r })),
    };
  }

  // Restaure des enregistrements déjà validés. Lève une erreur si deux bâtiments
  // se chevauchent ou sortent du terrain (le registre est alors vidé).
  load({ nextUid, buildings }) {
    this.clear();
    try {
      for (const record of buildings) {
        const check = this.canPlace(record.type, record.x, record.z);
        if (!check.ok) throw new Error(`bâtiment ${record.uid} invalide (${check.reason})`);
        this.#add({ ...record }, false);
      }
    } catch (err) {
      this.clear();
      throw err;
    }
    const maxUid = this.records.reduce((m, r) => Math.max(m, r.uid), 0);
    this.nextUid = Math.max(nextUid, maxUid + 1);
  }

  // Retire tous les bâtiments (données, occupation des cases, vues 3D).
  clear() {
    for (const view of this.views.values()) this.scene.remove(view);
    for (const tile of this.grid.tiles) tile.occupant = null;
    this.records.length = 0;
    this.byUid.clear();
    this.views.clear();
    this.pops.length = 0;
    this.nextUid = 1;
  }

  // Nouveau palier : nouveau modèle à la même place, avec la même apparition douce.
  #rebuildView(record, old) {
    this.scene.remove(old);
    old.traverse((o) => o.geometry?.dispose()); // matériaux partagés : on ne libère que les géométries
    this.pops = this.pops.filter((p) => p.view !== old);
    const view = this.#createView(record);
    this.pops.push({ view, t: 0 });
    return view;
  }

  #createView(record) {
    const def = getBuildingType(record.type);
    const { w, d } = def.footprint;
    const view = def.build(record);
    this.grid.footprintCenter(record.x, record.z, w, d, view.position);
    view.rotation.y = (record.rotation * Math.PI) / 2;
    view.userData.uid = record.uid;
    view.userData.lit = true;
    view.userData.stage = record.stage;
    this.scene.add(view);
    this.views.set(record.uid, view);
    return view;
  }

  #add(record, animate) {
    const def = getBuildingType(record.type);
    const { w, d } = def.footprint;
    for (const tile of this.grid.footprintTiles(record.x, record.z, w, d)) {
      tile.occupant = record.uid;
    }
    this.records.push(record);
    this.byUid.set(record.uid, record);

    const view = this.#createView(record);
    if (animate) this.pops.push({ view, t: 0 });
  }
}
