// Petits effets visuels éphémères. Purement décoratifs : ils lisent les
// événements de la simulation mais n'influencent jamais son état.

import * as THREE from 'three';
import { createSparkTexture, createOmenTexture } from './textures.js';

const SPARK_LIFE = 1.4;   // s
const SPARK_RISE = 0.9;   // unités monde
const SPARK_SIZE = 0.6;   // unités monde (≈ 7 px internes au zoom initial)

// Symboles de production qui montent doucement et s'effacent. Pool réutilisé
// par variante : 'star' (Savoirs, étoile ambre) et 'omen' (Présages, losange pâle).
export class Sparks {
  constructor(scene) {
    this.scene = scene;
    this.textures = { star: createSparkTexture(), omen: createOmenTexture() };
    this.pools = { star: [], omen: [] };
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
