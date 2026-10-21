// Visiteurs du lac : un feu follet ambre apparaît de temps en temps et flotte lentement
// au-dessus du domaine. Apparition, trajet et disparition sont gérés ici (rendu seul) ;
// le cadeau passe par la simulation (sim.catchVisitor), appelée par main.js.
// Le délai ne s'écoule qu'en jeu actif (update(dt, true)) : jamais au titre ni hors ligne.

import * as THREE from 'three';
import { BALANCE } from '../balance.js';
import { createWispTexture } from './textures.js';

const SIZE = 1;            // unités monde (≈ 12 px internes à zoom 1)
const HEIGHT = 2.7;        // au-dessus des toits
const SPEED = 0.45;        // unités / s : flotte, ne file pas
const FADE_IN = 1.5;       // s
const FADE_OUT = 3;        // s (fin de vie : s'efface doucement)
const CAUGHT_SECONDS = 0.7;
const MIN_TOUCH_RADIUS = 28; // px CSS : zone de 56 px de diamètre au moins (cible tactile ≥ 44 px)

const smooth = (t) => t * t * (3 - 2 * t);

export class Visitors {
  // half = demi-côté du terrain (le visiteur reste au-dessus du domaine).
  constructor(scene, half) {
    this.half = half;
    const material = new THREE.SpriteMaterial({ map: createWispTexture(), transparent: true, depthWrite: false, depthTest: false });
    this.sprite = new THREE.Sprite(material);
    this.sprite.scale.set(SIZE, SIZE, 1);
    this.sprite.renderOrder = 4;
    this.sprite.visible = false;
    scene.add(this.sprite);
    this.state = 'waiting';
    this.delay = this.#nextDelay();
    this.pos = new THREE.Vector3();
    this.projected = new THREE.Vector3();
  }

  // Attrapable : présent et pas déjà en train de s'effacer.
  get catchable() {
    return this.state === 'floating' && this.age < BALANCE.visitors.lifetimeSeconds - FADE_OUT;
  }

  #nextDelay() {
    const { min, max } = BALANCE.visitors.intervalSeconds;
    return min + Math.random() * (max - min);
  }

  #spawn() {
    // Entre par un bord du domaine, cap vers l'intérieur avec un écart aléatoire.
    const angle = Math.random() * Math.PI * 2;
    const r = this.half * 0.8;
    this.pos.set(Math.cos(angle) * r, HEIGHT, Math.sin(angle) * r);
    this.heading = angle + Math.PI + (Math.random() - 0.5) * 1.2;
    this.phase = Math.random() * 10;
    this.age = 0;
    this.state = 'floating';
    this.sprite.visible = true;
    this.sprite.material.opacity = 0;
    this.sprite.scale.set(SIZE, SIZE, 1);
  }

  #vanish() {
    this.state = 'waiting';
    this.sprite.visible = false;
    this.delay = this.#nextDelay();
  }

  // active = jeu en cours (faux sur l'écran titre) : seul le délai d'apparition en dépend ;
  // un visiteur déjà présent finit son trajet.
  update(dt, active) {
    if (this.state === 'waiting') {
      if (active && (this.delay -= dt) <= 0) this.#spawn();
      return;
    }
    if (this.state === 'caught') {
      this.t += dt / CAUGHT_SECONDS;
      if (this.t >= 1) return this.#vanish();
      const s = SIZE * (1 + 0.8 * smooth(this.t));
      this.sprite.scale.set(s, s, 1);
      this.sprite.position.y = this.pos.y + 0.5 * smooth(this.t);
      this.sprite.material.opacity = 1 - this.t;
      return;
    }
    const life = BALANCE.visitors.lifetimeSeconds;
    this.age += dt;
    if (this.age >= life) return this.#vanish();
    // Cap qui ondule lentement ; au-delà de 85 % du terrain, il revient vers le centre.
    this.heading += Math.sin(this.age * 0.35 + this.phase) * 0.5 * dt;
    const limit = this.half * 0.85;
    if (Math.hypot(this.pos.x, this.pos.z) > limit) {
      const home = Math.atan2(-this.pos.z, -this.pos.x);
      const diff = Math.atan2(Math.sin(home - this.heading), Math.cos(home - this.heading));
      this.heading += diff * Math.min(1, 1.2 * dt);
    }
    this.pos.x += Math.cos(this.heading) * SPEED * dt;
    this.pos.z += Math.sin(this.heading) * SPEED * dt;
    this.sprite.position.set(this.pos.x, this.pos.y + Math.sin(this.age * 1.4 + this.phase) * 0.18, this.pos.z);
    // Fondu d'entrée et de sortie, légère respiration (lente, jamais un clignotement).
    const fade = Math.min(1, this.age / FADE_IN, (life - this.age) / FADE_OUT);
    this.sprite.material.opacity = smooth(Math.max(0, fade)) * (0.88 + 0.12 * Math.sin(this.age * 2.1));
  }

  // Position écran (px CSS dans `rect`) du visiteur, ou null s'il n'est pas visible.
  screenPosition(camera, rect) {
    if (this.state === 'waiting') return null;
    this.projected.copy(this.sprite.position).project(camera);
    return {
      x: rect.left + (this.projected.x + 1) / 2 * rect.width,
      y: rect.top + (1 - this.projected.y) / 2 * rect.height,
    };
  }

  // Le pointeur (ndc) touche-t-il le visiteur ? Zone d'au moins MIN_TOUCH_RADIUS px CSS.
  hit(ndc, camera, rect) {
    if (!this.catchable) return false;
    const p = this.screenPosition(camera, rect);
    const x = rect.left + (ndc.x + 1) / 2 * rect.width;
    const y = rect.top + (1 - ndc.y) / 2 * rect.height;
    // Taille affichée du sprite (ortho) : SIZE unités × pixels CSS par unité.
    const unitPx = (rect.width / 2) * camera.projectionMatrix.elements[0];
    const radius = Math.max(MIN_TOUCH_RADIUS, SIZE * unitPx * 0.75);
    return Math.hypot(p.x - x, p.y - y) <= radius;
  }

  // Attrapé : bref éclat qui monte et s'efface (le cadeau est donné par main.js).
  catch() {
    this.state = 'caught';
    this.t = 0;
  }
}
