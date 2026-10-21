// Faisceau du Phare achevé : deux pinceaux de lumière ambre opposés qui tournent lentement
// depuis la lanterne et balaient le lac au-delà du domaine. Purement visuel : translucide,
// sans écriture de profondeur (donc sans contour) ni ombre. Intensité 0..1 fournie par main.js.

import * as THREE from 'three';
import { PALETTE } from '../config.js';

const LENGTH = 16;        // unités monde : dépasse le bord du terrain
const RADIUS = 1.3;       // demi-ouverture au bout du pinceau
const TILT = -0.07;       // radians : le pinceau plonge un peu vers l'eau
const TURN_SECONDS = 26;  // un tour complet, sans hâte
const OPACITY = 0.16;

export class LighthouseBeam {
  constructor(scene) {
    this.group = new THREE.Group();
    this.material = new THREE.MeshBasicMaterial({
      color: PALETTE.amberLight, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
    });
    const geometry = new THREE.ConeGeometry(RADIUS, LENGTH, 10, 1, true);
    geometry.translate(0, -LENGTH / 2, 0); // pointe à l'origine, ouverture vers −y
    geometry.rotateZ(Math.PI / 2);         // ouverture vers +x
    for (const side of [0, Math.PI]) {
      const arm = new THREE.Group();
      arm.rotation.y = side;
      const cone = new THREE.Mesh(geometry, this.material);
      cone.rotation.z = TILT;
      cone.renderOrder = 3;
      arm.add(cone);
      this.group.add(arm);
    }
    this.group.visible = false;
    scene.add(this.group);
  }

  // position = centre de la lanterne (ou null), strength = 0..1.
  update(dt, position, strength) {
    const on = Boolean(position) && strength > 0.01;
    this.group.visible = on;
    if (!on) return;
    this.group.position.copy(position);
    this.group.rotation.y -= (dt / TURN_SECONDS) * Math.PI * 2;
    this.material.opacity = OPACITY * strength;
  }
}
