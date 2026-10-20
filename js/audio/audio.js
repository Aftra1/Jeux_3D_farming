// Ambiance sonore entièrement synthétisée par la Web Audio API (aucun fichier audio).
// Nappe grave lente + lac (bruit filtré, clapotis), sons de jeu courts et feutrés.
// Toutes les notes viennent d'une même gamme pentatonique (AUDIO.scale, config.js),
// avec de légères variations aléatoires de hauteur et de volume.
// Le contexte audio n'est créé qu'au premier geste du joueur (règle des navigateurs) ;
// il est mis en sourdine puis suspendu quand le son est coupé ou l'onglet masqué.
// Préférence (coupé, volume) stockée à part : « Nouvelle partie » ne l'efface pas.

import { AUDIO, SAVE } from '../config.js';

export const SOUND_PREF_KEY = `${SAVE.storageKey}:son`;

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const rand = (min, max) => min + Math.random() * (max - min);
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

// Préférence lue depuis le texte stocké ; tout contenu inattendu → valeurs par défaut.
export function parseSoundPref(text) {
  const fallback = { muted: false, volume: AUDIO.defaultVolume };
  try {
    const p = JSON.parse(text);
    if (!p || typeof p !== 'object') return fallback;
    return {
      muted: p.muted === true,
      volume: Number.isFinite(p.volume) ? clamp01(p.volume) : fallback.volume,
    };
  } catch {
    return fallback;
  }
}

// Note MIDI du degré `degree` de la gamme (peut dépasser une octave), décalée de `octave`.
export function scaleMidi(degree, octave = 0) {
  const { rootMidi, steps } = AUDIO.scale;
  const n = steps.length;
  return rootMidi + 12 * (octave + Math.floor(degree / n)) + steps[((degree % n) + n) % n];
}

// Au plus `maxPerSecond` déclenchements : les demandes trop rapprochées sont ignorées.
export class RateLimiter {
  constructor(maxPerSecond) {
    this.gap = 1 / maxPerSecond;
    this.next = -Infinity;
  }

  take(now) {
    if (now < this.next) return false;
    this.next = now + this.gap;
    return true;
  }
}

function readPref() {
  try {
    return parseSoundPref(window.localStorage.getItem(SOUND_PREF_KEY));
  } catch {
    return parseSoundPref(null);
  }
}

function writePref(pref) {
  try {
    window.localStorage.setItem(SOUND_PREF_KEY, JSON.stringify(pref));
  } catch {
    /* préférence facultative */
  }
}

const GESTURES = ['pointerdown', 'pointerup', 'keydown', 'touchend'];

export class SoundScape {
  constructor() {
    this.pref = readPref();
    this.ctx = null;
    this.visible = !document.hidden;
    this.night = 0; // 0 = jour, 1 = nuit (cycle jour/nuit, purement d'ambiance)
    const { knowledge, omens, refuse } = AUDIO.sfx;
    this.limits = {
      knowledge: new RateLimiter(knowledge.maxPerSecond),
      omens: new RateLimiter(omens.maxPerSecond),
      refuse: new RateLimiter(refuse.maxPerSecond),
    };
    this.onGesture = () => this.#start();
    for (const e of GESTURES) window.addEventListener(e, this.onGesture, { capture: true, passive: true });
    document.addEventListener('visibilitychange', () => {
      this.visible = !document.hidden;
      this.#applyGain();
    });
  }

  get muted() {
    return this.pref.muted;
  }

  get volume() {
    return this.pref.volume;
  }

  setMuted(muted) {
    this.pref.muted = muted;
    writePref(this.pref);
    if (this.ctx) this.#applyGain();
    else this.#start(); // appelé depuis un clic : geste valable pour créer le contexte
  }

  setVolume(volume) {
    this.pref.volume = clamp01(volume);
    writePref(this.pref);
    this.#applyGain();
  }

  // Nuit (0..1) : nappe plus feutrée, eau plus calme. Variations lentes et lissées.
  setNight(night) {
    if (Math.abs(night - this.night) < 0.01 && night !== 0 && night !== 1) return;
    this.night = night;
    if (!this.ctx) return;
    const n = AUDIO.night;
    const t = this.ctx.currentTime;
    const tau = n.smoothSeconds / 3;
    this.padFilter.frequency.setTargetAtTime(AUDIO.pad.filterHz * this.#nightScale(n.padFilterScale), t, tau);
    this.waterOut.gain.setTargetAtTime(AUDIO.water.gain * this.#nightScale(n.waterGainScale), t, tau);
  }

  #nightScale(atNight) {
    return 1 + (atNight - 1) * this.night;
  }

  // --- Sons de jeu ---------------------------------------------------------------

  // Pose : petit « toc-toc » boisé (deux coups, le second plus bas et plus doux).
  playPlace() {
    if (!this.#ready()) return;
    const { gain, octave } = AUDIO.sfx.place;
    const t = this.ctx.currentTime;
    const degree = Math.floor(rand(0, 3));
    [[0, degree + 1, 1], [0.085, degree, 0.7]].forEach(([dt, deg, level]) => {
      const g = this.#vel(gain * level);
      this.#tone({ freq: this.#pitch(scaleMidi(deg, octave)), start: t + dt, gain: g,
        decay: 0.1, type: 'triangle', partials: [[1, 1], [2.01, 0.25]] });
      this.#noiseHit({ start: t + dt, gain: g * 0.5, freq: rand(1800, 2600), q: 1.5, decay: 0.03 });
    });
  }

  // Production : tintement discret (Savoirs) ou note cristalline plus longue (Présages).
  // Appelé une fois par ressource et par image : plusieurs productions simultanées
  // se regroupent, puis le limiteur plafonne le nombre de sons par seconde.
  playProduce(resource) {
    if (!this.#ready()) return;
    const t = this.ctx.currentTime;
    if (resource === 'knowledge' && this.limits.knowledge.take(t)) {
      const { gain, octave } = AUDIO.sfx.knowledge;
      this.#tone({ freq: this.#pitch(scaleMidi(Math.floor(rand(0, 5)), octave)), start: t,
        gain: this.#vel(gain), decay: 0.5, partials: [[1, 1], [2, 0.12]] });
    } else if (resource === 'omens' && this.limits.omens.take(t)) {
      const { gain, octave } = AUDIO.sfx.omens;
      const degree = Math.floor(rand(0, 5));
      const bell = [[1, 1], [3, 0.18], [4, 0.1]];
      this.#tone({ freq: this.#pitch(scaleMidi(degree, octave)), start: t,
        gain: this.#vel(gain), decay: 1.8, partials: bell });
      this.#tone({ freq: this.#pitch(scaleMidi(degree + 3, octave)), start: t + 0.09,
        gain: this.#vel(gain * 0.45), decay: 1.4, partials: bell });
    }
  }

  // Fragment ou missive : courte phrase ascendante de quelques notes, un peu plus marquée.
  playReveal() {
    if (!this.#ready()) return;
    const { gain, octave, noteSeconds, notes } = AUDIO.sfx.unlock;
    const contours = [[0, 1, 2, 4], [0, 2, 1, 3], [0, 2, 3, 5], [0, 1, 3, 4]];
    const contour = contours[Math.floor(rand(0, contours.length))];
    const base = Math.floor(rand(0, 3));
    const t = this.ctx.currentTime;
    for (let i = 0; i < notes; i++) {
      const last = i === notes - 1;
      this.#tone({ freq: this.#pitch(scaleMidi(base + contour[i % contour.length], octave)),
        start: t + i * noteSeconds * rand(0.92, 1.08), gain: this.#vel(gain), attack: 0.01,
        decay: last ? 2 : 1, partials: [[1, 1], [2, 0.22], [3, 0.06]] });
    }
  }

  // Refus de placement : note grave et douce qui s'affaisse légèrement.
  playRefuse() {
    if (!this.#ready()) return;
    const t = this.ctx.currentTime;
    if (!this.limits.refuse.take(t)) return;
    const { gain, octave } = AUDIO.sfx.refuse;
    this.#tone({ freq: this.#pitch(scaleMidi(0, octave)), start: t, gain: this.#vel(gain),
      attack: 0.02, decay: 0.3, partials: [[1, 1], [2, 0.15]], glide: 0.85 });
  }

  // --- Moteur ------------------------------------------------------------------

  #ready() {
    return this.ctx !== null && this.ctx.state === 'running' && !this.pref.muted && this.visible;
  }

  #start() {
    if (this.pref.muted) return; // le contexte sera créé au clic « remettre le son »
    if (!this.ctx && !this.#build()) return;
    if (this.ctx.state !== 'running' && this.visible) {
      this.ctx.resume().then(() => {
        // Démarré : les gestes suivants n'ont plus rien à débloquer.
        if (this.ctx.state === 'running') {
          for (const e of GESTURES) window.removeEventListener(e, this.onGesture, { capture: true });
        }
      }).catch(() => {});
    }
  }

  // Volume perçu ≈ carré du réglage. Coupé ou masqué : fondu à zéro puis suspension.
  #applyGain() {
    if (!this.ctx) return;
    const on = !this.pref.muted && this.visible;
    const target = on ? this.pref.volume ** 2 * AUDIO.masterGain : 0;
    const gain = this.master.gain;
    const now = this.ctx.currentTime;
    if (gain.cancelAndHoldAtTime) gain.cancelAndHoldAtTime(now);
    else gain.cancelScheduledValues(now);
    gain.setTargetAtTime(target, now, AUDIO.fadeSeconds / 3);
    clearTimeout(this.suspendTimer);
    if (on) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    } else {
      this.suspendTimer = setTimeout(() => this.ctx.suspend().catch(() => {}),
        AUDIO.fadeSeconds * 1000 + 100);
    }
  }

  #build() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return false;
    const ctx = (this.ctx = new Ctx());
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);

    // Réverbération : réponse impulsionnelle générée (bruit à décroissance exponentielle).
    const reverb = ctx.createConvolver();
    reverb.buffer = this.#impulse(AUDIO.reverb.seconds);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = AUDIO.reverb.wet;
    this.reverbSend.connect(reverb).connect(this.master);

    this.ambience = this.#bus(1);
    this.sfx = this.#bus(AUDIO.sfx.gain);
    this.white = this.#noiseBuffer(1, false);
    this.#startPad();
    this.#startWater();
    this.#applyGain();
    return true;
  }

  #bus(level) {
    const bus = this.ctx.createGain();
    bus.gain.value = level;
    bus.connect(this.master);
    bus.connect(this.reverbSend);
    return bus;
  }

  // Nappe : tonique + quinte graves, voix haute qui glisse lentement dans la gamme,
  // filtre passe-bas et volume qui respirent sur des LFO très lents.
  #startPad() {
    const { ctx } = this;
    const { gain, octave, filterHz, lfoHz, changeSeconds, glideSeconds } = AUDIO.pad;
    const out = ctx.createGain();
    out.gain.value = gain;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 0.7;
    filter.frequency.value = filterHz * this.#nightScale(AUDIO.night.padFilterScale);
    this.padFilter = filter;
    filter.connect(out).connect(this.ambience);
    this.#lfo(lfoHz, filterHz * 0.35, filter.frequency);
    this.#lfo(lfoHz * 1.7, gain * 0.3, out.gain);

    const voice = (midi, level, detune) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = hz(midi);
      osc.detune.value = detune;
      const g = ctx.createGain();
      g.gain.value = level;
      osc.connect(g).connect(filter);
      osc.start();
      return osc;
    };
    voice(scaleMidi(0, octave), 1, -4);
    voice(scaleMidi(0, octave), 0.6, 5);
    voice(scaleMidi(3, octave), 0.6, 0); // quinte
    const high = voice(scaleMidi(2, octave + 1), 0.35, 0);
    setInterval(() => {
      const degree = Math.floor(rand(0, AUDIO.scale.steps.length));
      const drop = this.night > 0.5 ? AUDIO.night.highOctaveDrop : 0; // plus grave la nuit
      high.frequency.setTargetAtTime(hz(scaleMidi(degree, octave + 1 - drop)), ctx.currentTime, glideSeconds / 3);
    }, changeSeconds * 1000);
  }

  // Lac : bruit brun filtré qui ondule, et clapotis (bruit blanc bref, passe-bande
  // qui remonte un peu) à intervalles aléatoires.
  #startWater() {
    const { ctx } = this;
    const w = AUDIO.water;
    const src = ctx.createBufferSource();
    src.buffer = this.#noiseBuffer(4, true);
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = w.filterHz;
    const out = ctx.createGain();
    out.gain.value = w.gain * this.#nightScale(AUDIO.night.waterGainScale);
    this.waterOut = out;
    src.connect(filter).connect(out).connect(this.ambience);
    this.#lfo(w.swellHz, w.gain * 0.45, out.gain);
    src.start();

    const lap = () => {
      if (this.ctx.state === 'running') {
        const t = ctx.currentTime;
        const f = rand(...w.lapHz);
        const dur = rand(...w.lapSeconds);
        const lapGain = w.lapGain * this.#nightScale(AUDIO.night.lapGainScale);
        const bp = this.#noiseHit({ start: t, gain: this.#vel(lapGain), freq: f, q: 4,
          decay: dur, dest: this.ambience, attack: 0.02 });
        bp.frequency.exponentialRampToValueAtTime(f * 1.5, t + dur);
      }
      setTimeout(lap, rand(...w.lapEverySeconds) * this.#nightScale(AUDIO.night.lapIntervalScale) * 1000);
    };
    lap();
  }

  #lfo(freq, depth, param) {
    const osc = this.ctx.createOscillator();
    osc.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.value = depth;
    osc.connect(g).connect(param);
    osc.start();
  }

  // Note à enveloppe percussive, somme de partiels [rapport, amplitude].
  #tone({ freq, start, gain, attack = 0.005, decay, type = 'sine', partials = [[1, 1]], glide = 1 }) {
    const { ctx } = this;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, start);
    env.gain.linearRampToValueAtTime(gain, start + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, start + attack + decay);
    env.connect(this.sfx);
    const end = start + attack + decay + 0.05;
    for (const [ratio, amp] of partials) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(freq * ratio, start);
      if (glide !== 1) osc.frequency.exponentialRampToValueAtTime(freq * ratio * glide, end);
      const g = ctx.createGain();
      g.gain.value = amp;
      osc.connect(g).connect(env);
      osc.start(start);
      osc.stop(end);
    }
  }

  // Bref souffle de bruit blanc passe-bande ; renvoie le filtre (pour le moduler).
  #noiseHit({ start, gain, freq, q, decay, attack = 0.002, dest = this.sfx }) {
    const { ctx } = this;
    const src = ctx.createBufferSource();
    src.buffer = this.white;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(freq, start);
    bp.Q.value = q;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, start);
    env.gain.linearRampToValueAtTime(gain, start + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, start + attack + decay);
    src.connect(bp).connect(env).connect(dest);
    src.start(start, rand(0, 0.5));
    src.stop(start + attack + decay + 0.05);
    return bp;
  }

  #noiseBuffer(seconds, brown) {
    const { ctx } = this;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      if (brown) {
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.5;
      } else data[i] = white;
    }
    // Boucle sans claquement : la fin rejoint le début.
    const drift = data[data.length - 1] - data[0];
    for (let i = 0; i < data.length; i++) data[i] -= drift * (i / data.length);
    return buffer;
  }

  #impulse(seconds) {
    const { ctx } = this;
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const data = buffer.getChannelData(c);
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
    }
    return buffer;
  }

  #pitch(midi) {
    return hz(midi) * 2 ** (rand(-1, 1) * AUDIO.detuneCents / 1200);
  }

  #vel(gain) {
    return gain * (1 + rand(-1, 1) * AUDIO.velocityJitter);
  }
}
