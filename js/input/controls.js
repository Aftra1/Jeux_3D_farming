// Contrôles unifiés souris + tactile via Pointer Events.
//  - Glisser (souris ou 1 doigt) : déplacer la vue, le point saisi reste sous le pointeur.
//  - Molette : zoom centré sur le curseur.
//  - Pincer (2 doigts) : zoom + déplacement centrés entre les doigts.
//  - Survol (souris) : onHover. Appui bref sans glisser (souris ou doigt) : onTap,
//    avec le bouton (0 = principal, 2 = droit).
//  - Si `aimWithTouch` est vrai (mode placement), glisser 1 doigt appelle onAim
//    au lieu de déplacer la vue ; 2 doigts déplacent/zooment toujours.

import * as THREE from 'three';

const TAP_SLOP_PX = 8; // déplacement CSS max pour qu'un appui compte comme un « tap »

export class Controls {
  constructor(canvas, isoCamera, { onHover, onTap, onLeave, onAim } = {}) {
    this.canvas = canvas;
    this.cam = isoCamera;
    this.onHover = onHover || (() => {});
    this.onTap = onTap || (() => {});
    this.onLeave = onLeave || (() => {});
    this.onAim = onAim || (() => {});
    this.aimWithTouch = false;
    this.enabled = true; // false : la vue ne répond plus (séquence de fin)
    this.lastPointerType = 'mouse';

    this.pointers = new Map(); // pointerId -> { x, y } (CSS px)
    this.grab = new THREE.Vector3();
    this.downPos = { x: 0, y: 0 };
    this.moved = false;
    this.pinchStartDist = 0;
    this.pinchStartZoom = 1;
    this._p = new THREE.Vector3();

    canvas.addEventListener('pointerdown', (e) => this.#down(e));
    canvas.addEventListener('pointermove', (e) => this.#move(e));
    canvas.addEventListener('pointerup', (e) => this.#up(e));
    canvas.addEventListener('pointercancel', (e) => this.#up(e, true));
    canvas.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse' && this.pointers.size === 0) this.onLeave();
    });
    canvas.addEventListener('wheel', (e) => this.#wheel(e), { passive: false });
    // Type du dernier pointeur, y compris sur l'UI (pour adapter les aides affichées)
    window.addEventListener('pointerdown', (e) => { this.lastPointerType = e.pointerType; }, true);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    // Safari iOS : bloque le zoom natif par geste
    document.addEventListener('gesturestart', (e) => e.preventDefault());
  }

  ndc(x, y) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((x - rect.left) / rect.width) * 2 - 1,
      y: -((y - rect.top) / rect.height) * 2 + 1,
    };
  }

  groundAt(x, y, out) {
    const n = this.ndc(x, y);
    return this.cam.groundAt(n.x, n.y, out);
  }

  #midpoint() {
    const [a, b] = [...this.pointers.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, dist: Math.hypot(a.x - b.x, a.y - b.y) };
  }

  // (Re)démarre une saisie : 1 pointeur = déplacement, 2 = pincement.
  #beginGesture() {
    if (this.pointers.size === 1) {
      const p = this.pointers.values().next().value;
      this.groundAt(p.x, p.y, this.grab);
    } else if (this.pointers.size >= 2) {
      const m = this.#midpoint();
      this.pinchStartDist = Math.max(1, m.dist);
      this.pinchStartZoom = this.cam.zoom;
      this.groundAt(m.x, m.y, this.grab);
    }
  }

  // Recale la caméra pour que this.grab revienne sous (x, y).
  #anchorTo(x, y) {
    this.cam.update();
    const now = this.groundAt(x, y, this._p);
    if (!now) return;
    this.cam.pan(this.grab.x - now.x, this.grab.z - now.z);
    this.cam.update();
  }

  #down(e) {
    if (!this.enabled) return;
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 2) return;
    e.preventDefault();
    this.lastPointerType = e.pointerType;
    this.canvas.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 1) {
      this.downPos = { x: e.clientX, y: e.clientY };
      this.moved = false;
      if (this.aimWithTouch && e.pointerType !== 'mouse') this.onAim(this.ndc(e.clientX, e.clientY));
    } else {
      this.moved = true; // un 2e doigt annule le tap
    }
    this.#beginGesture();
  }

  #move(e) {
    this.lastPointerType = e.pointerType;
    const p = this.pointers.get(e.pointerId);
    if (!p) {
      if (e.pointerType === 'mouse') this.onHover(this.ndc(e.clientX, e.clientY));
      return;
    }
    p.x = e.clientX;
    p.y = e.clientY;

    if (this.pointers.size === 1) {
      if (!this.moved &&
          Math.hypot(p.x - this.downPos.x, p.y - this.downPos.y) > TAP_SLOP_PX) {
        this.moved = true;
        this.canvas.classList.add('dragging');
      }
      const aiming = this.aimWithTouch && e.pointerType !== 'mouse';
      if (aiming) this.onAim(this.ndc(p.x, p.y));
      else if (this.moved) this.#anchorTo(p.x, p.y);
      if (e.pointerType === 'mouse') this.onHover(this.ndc(e.clientX, e.clientY));
    } else if (this.pointers.size >= 2) {
      const m = this.#midpoint();
      this.cam.setZoom(this.pinchStartZoom * (m.dist / this.pinchStartDist));
      this.#anchorTo(m.x, m.y);
    }
  }

  #up(e, cancelled = false) {
    if (!this.pointers.has(e.pointerId)) return;
    const wasTap = this.pointers.size === 1 && !this.moved && !cancelled;
    this.pointers.delete(e.pointerId);
    if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);

    if (wasTap) this.onTap(this.ndc(e.clientX, e.clientY), e.pointerType, e.button);
    if (this.pointers.size === 0) this.canvas.classList.remove('dragging');
    else this.#beginGesture(); // 2 doigts -> 1 : on reprend en déplacement sans saut
  }

  #wheel(e) {
    e.preventDefault();
    if (!this.enabled) return;
    const n = this.ndc(e.clientX, e.clientY);
    this.cam.groundAt(n.x, n.y, this.grab);
    this.cam.setZoom(this.cam.zoom * Math.exp(-e.deltaY * 0.0015));
    this.#anchorTo(e.clientX, e.clientY);
    this.onHover(n);
  }
}
