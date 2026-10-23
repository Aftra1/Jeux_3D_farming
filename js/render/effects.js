// Petits effets visuels éphémères. Purement décoratifs : ils lisent les
// événements de la simulation mais n'influencent jamais son état.

import * as THREE from 'three';
import { PALETTE } from '../config.js';
import { createSparkTexture, createOmenTexture, createRelicTexture } from './textures.js';

const SPARK_LIFE = 1.4;   // s
const SPARK_RISE = 0.9;   // unités monde
const SPARK_SIZE = 0.6;   // unités monde (≈ 7 px internes au zoom initial)

// Symboles de production qui montent doucement et s'effacent. Pool réutilisé
// par variante : 'star' (Savoirs, étoile ambre), 'omen' (Présages, losange pâle), 'relic' (coquillage).
export class Sparks {
  constructor(scene) {
    this.scene = scene;
    this.textures = { star: createSparkTexture(), omen: createOmenTexture(), relic: createRelicTexture() };
    this.pools = { star: [], omen: [], relic: [] };
    this.active = [];
  }

  spawn(position, variant = 'star') {
    if (!this.textures[variant]) variant = 'star';
    const sprite = this.pools[variant].pop() || this.#create(variant);
    sprite.position.copy(position);
    sprite.userData.start = position.y;
    sprite.userData.t = 0;
    // Légère dérive latérale pour que deux étincelles successives ne se superposent pas
    sprite.userData.drift = (Math.random() - 0.5) * 0.25;
    sprite.material.opacity = 0;
    sprite.visible = true;
    this.active.push(sprite);
  }

  // Vitesse de montée la plus forte (unités/s) tant qu'un symbole est visible : cadence de rendu.
  get speed() {
    return this.active.length ? (2 * SPARK_RISE) / SPARK_LIFE : 0;
  }

  update(dt) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const s = this.active[i];
      const d = s.userData;
      d.t += dt / SPARK_LIFE;
      if (d.t >= 1) {
        s.visible = false;
        this.active.splice(i, 1);
        this.pools[s.userData.variant].push(s);
        continue;
      }
      const ease = 1 - Math.pow(1 - d.t, 2);
      s.position.y = d.start + ease * SPARK_RISE;
      s.position.x += d.drift * dt;
      // Apparition rapide, disparition lente
      s.material.opacity = d.t < 0.15 ? d.t / 0.15 : 1 - (d.t - 0.15) / 0.85;
    }
  }

  #create(variant) {
    const material = new THREE.SpriteMaterial({
      map: this.textures[variant],
      transparent: true,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(SPARK_SIZE, SPARK_SIZE, 1);
    sprite.renderOrder = 3;
    sprite.userData.variant = variant;
    this.scene.add(sprite);
    return sprite;
  }
}

const WAVE_LIFE = 2.2;     // s : une onde, du pied de la cloche à sa portée
const WAVE_COUNT = 3;      // ondes successives par sonnerie
const WAVE_GAP = 0.4;      // s entre deux ondes

// Ondes de la Cloche : anneaux ambre pâle qui s'élargissent doucement jusqu'à la portée, puis s'effacent.
// Décoratif : ne lit que la position et la portée données à la sonnerie.
export class BellWaves {
  constructor(scene) {
    this.scene = scene;
    this.geometry = new THREE.RingGeometry(0.93, 1, 48);
    this.geometry.rotateX(-Math.PI / 2);
    this.waves = [];
    this.pool = [];
  }

  // Lance les ondes depuis `position` (pied de la cloche) jusqu'à `radius` cases.
  ring(position, radius) {
    for (let i = 0; i < WAVE_COUNT; i++) this.waves.push({ mesh: null, x: position.x, y: position.y, z: position.z,
      reach: radius + 1, t: -i * WAVE_GAP / WAVE_LIFE });
  }

  // Une onde est visible : rendu à pleine cadence.
  get active() {
    return this.waves.length > 0;
  }

  update(dt) {
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i];
      w.t += dt / WAVE_LIFE;
      if (w.t < 0) continue;
      if (w.t >= 1) {
        if (w.mesh) {
          w.mesh.visible = false;
          this.pool.push(w.mesh);
        }
        this.waves.splice(i, 1);
        continue;
      }
      w.mesh ??= this.#take();
      const ease = 1 - Math.pow(1 - w.t, 2);
      w.mesh.visible = true;
      w.mesh.position.set(w.x, w.y + 0.03, w.z);
      w.mesh.scale.setScalar(0.4 + ease * w.reach);
      w.mesh.material.opacity = 0.75 * (1 - w.t) * Math.min(1, w.t / 0.08);
    }
  }

  #take() {
    const mesh = this.pool.pop() || new THREE.Mesh(this.geometry, new THREE.MeshBasicMaterial({
      color: PALETTE.amberLight, transparent: true, opacity: 0, depthWrite: false,
    }));
    mesh.renderOrder = 2;
    if (!mesh.parent) this.scene.add(mesh);
    return mesh;
  }
}
