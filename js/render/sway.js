// Roseaux qui ondulent (qualité Haute) : tiges instanciées recalculées en marches (4 pas/s,
// comme les sprites), têtes de massettes au sommet de leur tige. Ailleurs, pose fixe.

import * as THREE from 'three';

const STEPS = 4;      // pas par seconde
const AMPLITUDE = 0.07;

const m = new THREE.Matrix4();
const q = new THREE.Quaternion();
const e = new THREE.Euler();
const v = new THREE.Vector3();
const sc = new THREE.Vector3();
const top = new THREE.Vector3();

export class ReedSway {
  // stems : [{ x, z, h, c }] ; tilt = [kx, kz] (inclinaison de repos) ; heads : indices des tiges
  // qui portent une tête, dans l'ordre des instances de headMesh.
  constructor({ stemMesh, headMesh = null, stems, heads = [], y, tilt }) {
    Object.assign(this, { stemMesh, headMesh, stems, heads, y, tilt });
    this.step = null;
    this.write(0);
  }

  write(amount, t = 0) {
    const [kx, kz] = this.tilt;
    const tops = [];
    this.stems.forEach((s, i) => {
      const wave = amount * Math.sin(t * 1.3 + s.x * 0.6 + s.z * 0.4);
      q.setFromEuler(e.set((s.c - 0.5) * kx + wave * 0.5, 0, (s.c - 0.3) * kz + wave));
      v.set(s.x, this.y + s.h / 2, s.z);
      m.compose(v, q, sc.set(1, s.h, 1));
      this.stemMesh.setMatrixAt(i, m);
      tops[i] = top.set(0, s.h / 2, 0).applyQuaternion(q).add(v).clone();
    });
    this.stemMesh.instanceMatrix.needsUpdate = true;
    if (!this.headMesh) return;
    this.heads.forEach((stem, i) => {
      const p = tops[stem];
      this.headMesh.setMatrixAt(i, m.makeTranslation(p.x, p.y, p.z));
    });
    this.headMesh.instanceMatrix.needsUpdate = true;
  }

  // on : qualité Haute. Renvoie vrai si les tiges ont bougé.
  update(time, on) {
    if (!on) {
      if (this.step === null) return false;
      this.step = null;
      this.write(0);
      return true;
    }
    const step = Math.floor(time * STEPS);
    if (step === this.step) return false;
    this.step = step;
    this.write(AMPLITUDE, step / STEPS);
    return true;
  }
}
