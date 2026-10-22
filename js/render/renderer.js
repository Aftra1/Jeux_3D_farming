// Rendu pixel art : la scène est rendue dans une cible basse résolution
// (NearestFilter), puis une passe plein écran ajoute le contour sombre
// (détection de bords sur la profondeur) et écrit dans le canvas, lui-même
// agrandi en CSS d'un facteur entier avec `image-rendering: pixelated`.

import * as THREE from 'three';
import { PALETTE, RENDER } from '../config.js';

const postVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const postFragment = /* glsl */ `
  uniform sampler2D tColor;
  uniform sampler2D tDepth;
  uniform vec2 resolution;
  uniform float cameraNear;
  uniform float cameraFar;
  uniform vec3 outlineColor;
  uniform float threshold;
  uniform float strength;
  varying vec2 vUv;

  // Caméra orthographique : la profondeur est linéaire.
  float viewDepth(vec2 uv) {
    float d = texture2D(tDepth, uv).x;
    return cameraNear + d * (cameraFar - cameraNear);
  }

  void main() {
    vec2 texel = 1.0 / resolution;
    vec4 color = texture2D(tColor, vUv);
    float d = viewDepth(vUv);

    // Un pixel est un bord de silhouette si un voisin est nettement plus loin.
    float edge = 0.0;
    edge += step(threshold, viewDepth(vUv + vec2(texel.x, 0.0)) - d);
    edge += step(threshold, viewDepth(vUv - vec2(texel.x, 0.0)) - d);
    edge += step(threshold, viewDepth(vUv + vec2(0.0, texel.y)) - d);
    edge += step(threshold, viewDepth(vUv - vec2(0.0, texel.y)) - d);
    edge = clamp(edge, 0.0, 1.0);

    gl_FragColor = vec4(mix(color.rgb, outlineColor, edge * strength), 1.0);
    #include <colorspace_fragment>
  }
`;

export class PixelRenderer {
  constructor(container) {
    this.container = container;

    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
    this.renderer.setPixelRatio(1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.BasicShadowMap; // ombres nettes, pixelisées
    this.renderer.info.autoReset = false; // statistiques d'une image entière (scène + contour)
    container.appendChild(this.renderer.domElement);

    const depthTexture = new THREE.DepthTexture(1, 1);
    this.target = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      type: THREE.HalfFloatType,
      depthTexture,
    });

    this.postMaterial = new THREE.ShaderMaterial({
      vertexShader: postVertex,
      fragmentShader: postFragment,
      uniforms: {
        tColor: { value: this.target.texture },
        tDepth: { value: depthTexture },
        resolution: { value: new THREE.Vector2(1, 1) },
        cameraNear: { value: 0.1 },
        cameraFar: { value: 100 },
        outlineColor: { value: new THREE.Color(PALETTE.slateDeep) },
        threshold: { value: RENDER.outlineThreshold },
        strength: { value: RENDER.outlineStrength },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.postScene = new THREE.Scene();
    this.postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMaterial));
    this.postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.width = 1;
    this.height = 1;
    this.scale = 1;
  }

  get canvas() {
    return this.renderer.domElement;
  }

  // Calcule la résolution interne et le facteur d'agrandissement entier.
  resize() {
    const dpr = window.devicePixelRatio || 1;
    const cssW = this.container.clientWidth;
    const cssH = this.container.clientHeight;
    const physW = Math.max(1, Math.round(cssW * dpr));
    const physH = Math.max(1, Math.round(cssH * dpr));

    this.scale = Math.max(1, Math.floor(Math.min(physW, physH) / RENDER.shortSide));
    this.width = Math.ceil(physW / this.scale);
    this.height = Math.ceil(physH / this.scale);

    this.renderer.setSize(this.width, this.height, false);
    this.target.setSize(this.width, this.height);
    this.postMaterial.uniforms.resolution.value.set(this.width, this.height);

    const style = this.canvas.style;
    style.width = `${(this.width * this.scale) / dpr}px`;
    style.height = `${(this.height * this.scale) / dpr}px`;

    return { width: this.width, height: this.height };
  }

  // Ombres activées ou non (qualité) : sans elles, aucune passe d'ombre.
  setShadows(on) {
    this.renderer.shadowMap.enabled = on;
  }

  // Coût de la dernière image : appels de dessin, triangles, géométries et textures en mémoire, programmes.
  stats() {
    const { render, memory, programs } = this.renderer.info;
    return { calls: render.calls, triangles: render.triangles, geometries: memory.geometries,
      textures: memory.textures, programs: programs?.length ?? 0 };
  }

  render(scene, camera) {
    this.renderer.info.reset();
    this.postMaterial.uniforms.cameraNear.value = camera.near;
    this.postMaterial.uniforms.cameraFar.value = camera.far;

    this.renderer.setRenderTarget(this.target);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.postScene, this.postCamera);
  }
}
