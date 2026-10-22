// Instanciation des bâtiments répétés : chaque maillage à géométrie partagée (fusionnée par
// matériau, render/merge.js) d'une vue est dessiné par un InstancedMesh commun à tous les
// exemplaires (même géométrie, même matériau, mêmes ombres). Les maillages d'origine restent
// dans la vue, invisibles : leur position monde (apparition, barque animée) et leur matériau
// (ouverture allumée ou éteinte) sont recopiés à chaque image. Un appel de dessin par pièce,
// quel que soit le nombre de bâtiments.

import * as THREE from 'three';

const START_CAPACITY = 8;

class Batch {
  constructor(scene, geometry, material, mesh) {
    this.scene = scene;
    this.geometry = geometry;
    this.material = material;
    this.cast = mesh.castShadow;
    this.receive = mesh.receiveShadow;
    this.order = mesh.renderOrder;
    this.owners = []; // entrée occupant chaque emplacement
    this.mesh = null;
    this.#grow(START_CAPACITY);
  }

  #grow(capacity) {
    const old = this.mesh;
    const mesh = new THREE.InstancedMesh(this.geometry, this.material, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = this.cast;
    mesh.receiveShadow = this.receive;
    mesh.renderOrder = this.order;
    mesh.frustumCulled = false; // instances dispersées sur tout le terrain
    mesh.count = this.owners.length;
    if (old) {
      mesh.instanceMatrix.array.set(old.instanceMatrix.array);
      this.scene.remove(old);
      old.dispose(); // tampons d'instances seulement : géométrie et matériau sont partagés
    }
    this.scene.add(mesh);
    this.mesh = mesh;
  }

  add(entry) {
    if (this.owners.length === this.mesh.instanceMatrix.count) this.#grow(this.owners.length * 2);
    entry.slot = this.owners.length;
    entry.batch = this;
    entry.stamp = null;
    this.owners.push(entry);
    this.mesh.count = this.owners.length;
  }

  // Retire une entrée : la dernière prend sa place.
  remove(entry) {
    const last = this.owners.pop();
    if (last !== entry) {
      const a = this.mesh.instanceMatrix.array;
      a.copyWithin(entry.slot * 16, last.slot * 16, last.slot * 16 + 16);
      this.owners[entry.slot] = last;
      last.slot = entry.slot;
    }
    this.mesh.count = this.owners.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    entry.batch = null;
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.dispose();
  }
}

export class InstanceBatches {
  constructor(scene) {
    this.scene = scene;
    this.batches = new Map(); // géométrie|matériau|ombres → Batch
    this.entries = new Map(); // uid → [{ mesh, batch, slot, stamp }]
    this.views = new Map();   // uid → vue
  }

  // Prend en charge les maillages partagés de la vue (à rappeler si la vue gagne des maillages).
  adopt(uid, view) {
    this.views.set(uid, view);
    const list = this.entries.get(uid) || [];
    const known = new Set(list.map((e) => e.mesh));
    view.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || !o.geometry.userData.shared || known.has(o)) return;
      o.visible = false;
      list.push({ mesh: o, batch: null, slot: -1, stamp: null, material: null });
    });
    this.entries.set(uid, list);
  }

  release(uid) {
    for (const entry of this.entries.get(uid) || []) entry.batch?.remove(entry);
    this.entries.delete(uid);
    this.views.delete(uid);
    this.#prune();
  }

  clear() {
    for (const batch of this.batches.values()) batch.dispose();
    this.batches.clear();
    this.entries.clear();
    this.views.clear();
  }

  #batchFor(mesh) {
    const id = `${mesh.geometry.uuid}|${mesh.material.uuid}|${mesh.castShadow}|${mesh.receiveShadow}|${mesh.renderOrder}`;
    let batch = this.batches.get(id);
    if (!batch) {
      batch = new Batch(this.scene, mesh.geometry, mesh.material, mesh);
      this.batches.set(id, batch);
    }
    return batch;
  }

  // Lots vides (matériau qui n'est plus utilisé, ex. toutes les ouvertures rallumées) retirés.
  #prune() {
    for (const [id, batch] of this.batches) {
      if (batch.owners.length) continue;
      batch.dispose();
      this.batches.delete(id);
    }
  }

  // Recopie positions et matériaux. Renvoie vrai si une instance a changé.
  update() {
    let changed = false;
    let emptied = false;
    for (const [uid, list] of this.entries) {
      this.views.get(uid).updateMatrixWorld(true);
      for (let i = list.length - 1; i >= 0; i--) {
        const entry = list[i];
        const { mesh } = entry;
        if (!isAttached(mesh, this.views.get(uid))) { // maillage retiré de la vue (repère d'aura)
          if (entry.batch) entry.batch.remove(entry);
          list.splice(i, 1);
          emptied = changed = true;
          continue;
        }
        const visible = mesh.parent.visible;
        if (entry.material !== mesh.material || entry.shown !== visible) {
          if (entry.batch) {
            entry.batch.remove(entry);
            emptied = true;
          }
          if (visible) this.#batchFor(mesh).add(entry);
          entry.material = mesh.material;
          entry.shown = visible;
          changed = true;
        }
        if (!entry.batch) continue;
        const e = mesh.matrixWorld.elements;
        const target = entry.batch.mesh.instanceMatrix;
        const a = target.array;
        const o = entry.slot * 16;
        if (entry.stamp !== null && sameMatrix(a, o, e)) continue;
        a.set(e, o);
        entry.stamp = 1;
        target.needsUpdate = true;
        changed = true;
      }
    }
    if (emptied) this.#prune();
    return changed;
  }

  get drawCount() {
    return this.batches.size;
  }
}

function sameMatrix(a, o, e) {
  for (let i = 0; i < 16; i++) if (a[o + i] !== e[i]) return false;
  return true;
}

function isAttached(mesh, view) {
  for (let p = mesh.parent; p; p = p.parent) if (p === view) return true;
  return false;
}
