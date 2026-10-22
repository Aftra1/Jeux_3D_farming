// Fusion de géométries : moins d'appels de dessin, géométries partagées entre modèles identiques.
// mergeGeometries : concatène des géométries non indexées (position, normale, UV).
// compactModel : remplace les maillages fixes d'un modèle par un maillage par matériau, dont la
// géométrie est mise en cache par clé (tous les bâtiments d'un même type la partagent). Ces
// géométries portent userData.shared : ne jamais les libérer avec le modèle.

import * as THREE from 'three';

export function mergeGeometries(geoms) {
  const merged = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    const size = geoms[0].getAttribute(name).itemSize;
    const data = new Float32Array(geoms.reduce((n, g) => n + g.getAttribute(name).array.length, 0));
    let offset = 0;
    for (const g of geoms) {
      data.set(g.getAttribute(name).array, offset);
      offset += g.getAttribute(name).array.length;
    }
    merged.setAttribute(name, new THREE.BufferAttribute(data, size));
  }
  return merged;
}

// Libère les géométries propres d'un objet (pas celles partagées par le cache).
export function disposeGeometries(root) {
  root.traverse((o) => {
    if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
  });
}

const cache = new Map(); // clé de modèle → géométries fusionnées, dans l'ordre des groupes

// key = null : pas de cache (modèle unique, ex. le Phare reconstruit à chaque palier) ; ses
// géométries fusionnées sont alors propres au modèle et libérées avec lui.
// Maillages laissés tels quels : lumières (matériau changeant), éléments nommés (userData.keep),
// instances. Les sous-groupes animés (userData.anchor, ex. la barque) gardent leurs propres
// maillages fusionnés, dans leur repère.
export function compactModel(root, key) {
  root.updateMatrixWorld(true);
  const groups = new Map(); // anchor|matériau|ombres → { anchor, material, flags, parts: [] }
  const removed = [];
  const anchorOf = (o) => {
    let p = o.parent;
    while (p !== root && !p.userData.anchor) p = p.parent;
    return p;
  };
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.userData.lightMaterials || o.userData.keep) return;
    const anchor = anchorOf(o);
    const materials = Array.isArray(o.material) ? o.material : [o.material];
    const slices = Array.isArray(o.material) && o.geometry.groups.length
      ? o.geometry.groups : [{ start: 0, count: Infinity, materialIndex: 0 }];
    for (const slice of slices) {
      const material = materials[slice.materialIndex];
      const id = `${anchor.uuid}|${material.uuid}|${o.castShadow}|${o.receiveShadow}|${o.renderOrder}`;
      if (!groups.has(id)) {
        groups.set(id, { anchor, material, cast: o.castShadow, receive: o.receiveShadow, order: o.renderOrder, parts: [] });
      }
      groups.get(id).parts.push({ mesh: o, slice });
    }
    removed.push(o);
  });

  let shared = key === null ? null : cache.get(key);
  const build = !shared;
  if (build) shared = [];
  const inverse = new THREE.Matrix4();
  const local = new THREE.Matrix4();
  let i = 0;
  for (const g of groups.values()) {
    let geometry = shared[i];
    if (build) {
      inverse.copy(g.anchor.matrixWorld).invert();
      const pieces = g.parts.map(({ mesh, slice }) => {
        const flat = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
        const count = Math.min(slice.count, flat.getAttribute('position').count - slice.start);
        const piece = new THREE.BufferGeometry();
        for (const name of ['position', 'normal', 'uv']) {
          const a = flat.getAttribute(name);
          piece.setAttribute(name, new THREE.BufferAttribute(
            a.array.slice(slice.start * a.itemSize, (slice.start + count) * a.itemSize), a.itemSize));
        }
        flat.dispose();
        return piece.applyMatrix4(local.multiplyMatrices(inverse, mesh.matrixWorld));
      });
      geometry = mergeGeometries(pieces);
      pieces.forEach((p) => p.dispose());
      if (key !== null) geometry.userData.shared = true;
      shared.push(geometry);
    }
    const mesh = new THREE.Mesh(geometry, g.material);
    mesh.castShadow = g.cast;
    mesh.receiveShadow = g.receive;
    mesh.renderOrder = g.order;
    g.anchor.add(mesh);
    i++;
  }
  if (build && key !== null) cache.set(key, shared);
  for (const o of removed) {
    o.parent.remove(o);
    o.geometry.dispose();
  }
  return root;
}
