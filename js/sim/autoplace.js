// Mode économie d'énergie (sans Three.js ni DOM) : pose automatique d'un bâtiment sur une case
// valide, et débit des ressources par minute. Testé sous Node (tests/run.mjs).
//
// autoSpot ne pose rien : il choisit, parmi les emprises libres des zones ouvertes (domaine,
// îlots ralliés), celles que la simulation accepte (`sim.canPlace` : règle `edge`, réserve du
// Phare, coût), puis la meilleure :
//   - bâtiment à aura (Sanctuaire) : le plus de cibles nouvellement renforcées, puis le plus de
//     cibles en tout ;
//   - cible d'une aura existante (Bibliothèque) : de préférence dans une aura ;
//   - à égalité : au plus près du centre du domaine (domaine compact, îlots en dernier).

import { BALANCE } from '../balance.js';
import { auraTiles, productionOf, cycleTicks, levelOf } from './simulation.js';

const footprintOf = (type) => BALANCE.buildings[type]?.footprint || { w: 1, d: 1 };

// → { ok: true, x, z } ou { ok: false, reason: 'unknown' | 'locked' | 'unique' | 'cost' | 'edge' | 'room' | 'full', … }
export function autoSpot(sim, terrain, type) {
  const rules = BALANCE.buildings[type];
  if (!rules) return { ok: false, reason: 'unknown' };
  const missing = sim.missingUnlocks(type);
  if (missing.length) return { ok: false, reason: 'locked', missing };
  if (rules.unique && sim.countOf(type) > 0) return { ok: false, reason: 'unique' };
  if (!sim.canAfford(type)) return { ok: false, reason: 'cost', cost: sim.costOf(type) };

  const { w, d } = footprintOf(type);
  const reasons = new Set();
  const spots = [];
  for (const [x, z] of terrain.freeOrigins(w, d)) {
    const check = sim.canPlace(type, x, z);
    if (check.ok) spots.push({ x, z });
    else reasons.add(check.reason);
  }
  if (!spots.length) {
    // Le plus parlant d'abord : place gardée au Phare, puis plus de bord libre.
    return { ok: false, reason: reasons.has('room') ? 'room' : reasons.has('edge') ? 'edge' : 'full' };
  }

  const score = scorer(sim, type, w, d);
  const center = terrain.size / 2;
  const dist = ({ x, z }) => Math.hypot(x + w / 2 - center, z + d / 2 - center);
  let best = null;
  for (const spot of spots) {
    spot.score = score(spot.x, spot.z);
    spot.dist = dist(spot);
    if (!best || better(spot, best)) best = spot;
  }
  return { ok: true, x: best.x, z: best.z };
}

// Comparaison lexicographique des scores, puis distance au centre, puis z, x (déterministe).
function better(a, b) {
  for (let i = 0; i < a.score.length; i++) {
    if (a.score[i] !== b.score[i]) return a.score[i] > b.score[i];
  }
  if (Math.abs(a.dist - b.dist) > 1e-9) return a.dist < b.dist;
  return a.z !== b.z ? a.z < b.z : a.x < b.x;
}

// Fonction (x, z) → tableau de critères (plus grand = mieux).
function scorer(sim, type, w, d) {
  if (BALANCE.buildings[type].aura) {
    const boosted = sim.boosts();
    return (x, z) => {
      const targets = sim.wouldBoost(type, x, z);
      return [targets.filter((r) => !boosted.has(r.uid)).length, targets.length];
    };
  }
  // Cases couvertes par les auras qui visent ce type.
  const aura = new Set();
  for (const r of sim.buildings.records) {
    if (!BALANCE.buildings[r.type]?.aura?.targets.includes(type)) continue;
    for (const t of auraTiles(r.type, r.x, r.z, levelOf(r))) aura.add(`${t.x},${t.z}`);
  }
  if (!aura.size) return () => [];
  return (x, z) => {
    for (let dz = 0; dz < d; dz++) {
      for (let dx = 0; dx < w; dx++) if (aura.has(`${x + dx},${z + dz}`)) return [1];
    }
    return [0];
  };
}

// Bâtiment du type `type` à améliorer en priorité (mode économie) : le moins avancé, puis le plus
// ancien. → { ok: true, uid, level, cost } ou { ok: false, reason: 'unknown' | 'none' | 'max' | 'cost', cost }.
export function upgradeTarget(sim, type) {
  if (!BALANCE.buildings[type]?.upgrade) return { ok: false, reason: 'unknown' };
  const list = sim.buildings.records.filter((r) => r.type === type);
  if (!list.length) return { ok: false, reason: 'none' };
  const target = list.filter((r) => sim.upgradeCost(r.uid)).sort((a, b) => levelOf(a) - levelOf(b) || a.uid - b.uid)[0];
  if (!target) return { ok: false, reason: 'max' };
  const cost = sim.upgradeCost(target.uid);
  const affordable = Object.entries(cost).every(([res, n]) => sim.resources[res] >= n);
  return affordable ? { ok: true, uid: target.uid, level: levelOf(target), cost } : { ok: false, reason: 'cost', uid: target.uid, level: levelOf(target), cost };
}

// Débit par minute de chaque ressource : { [res]: { gross, used, net } }. gross = production
// brute (auras et paliers compris), used = ce que consomment les producteurs à pleine cadence.
export function flowPerMinute(sim) {
  const flow = {};
  const entry = (res) => (flow[res] ??= { gross: 0, used: 0, net: 0 });
  for (const [res, perSecond] of Object.entries(sim.productionRate())) entry(res).gross = perSecond * 60;
  const ticksPerMinute = BALANCE.ticksPerSecond * 60;
  for (const r of sim.buildings.records) {
    const prod = productionOf(r.type);
    if (!prod) continue;
    for (const [res, n] of Object.entries(prod.inputs)) entry(res).used += n * ticksPerMinute / cycleTicks(r);
  }
  for (const f of Object.values(flow)) {
    f.gross = Math.round(f.gross * 1e6) / 1e6;
    f.used = Math.round(f.used * 1e6) / 1e6;
    f.net = Math.round((f.gross - f.used) * 1e6) / 1e6;
  }
  return flow;
}
