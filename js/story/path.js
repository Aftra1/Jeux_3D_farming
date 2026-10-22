// But du chapitre et « Chemin » du Carnet : logique pure (sans DOM ni Three.js, testable sous Node).
// `sim` = la Simulation (countOf, boostedCountOf, stageOf, earned, islands, islandsRevealed) ;
// `missives` = nombre de missives accomplies (Journal.missives).

import { BALANCE } from '../balance.js';
import { GOALS, PATH } from './guide.js';
import { MISSIVES } from './missives.js';
import { missiveProgress } from './journal.js';

const LIGHTHOUSE = 'lighthouse';

// → { have, target } (have plafonné à target)
export function measure(cond, sim, missives) {
  switch (cond.kind) {
    case 'missives': return { have: Math.min(missives, cond.count), target: cond.count };
    case 'islands': return { have: Math.min(sim.islands.length, cond.count), target: cond.count };
    case 'revealed': return { have: sim.islandsRevealed() ? 1 : 0, target: 1 };
    default: return missiveProgress({ condition: cond }, sim);
  }
}

export const chapterOf = (finished) => (finished ? 2 : 1);

// But du chapitre en cours : { chapter, title, label, have, target }.
export function goalOf(finished, sim, missives) {
  const chapter = chapterOf(finished);
  const goal = GOALS[chapter];
  if (chapter === 1) {
    const target = BALANCE.buildings[LIGHTHOUSE].stages.length;
    return { chapter, ...goal, have: Math.min(sim.stageOf(LIGHTHOUSE), target), target };
  }
  const first = MISSIVES.filter((m) => !m.chapter).length;
  const target = MISSIVES.filter((m) => m.chapter === 2).length;
  return { chapter, ...goal, have: Math.max(0, Math.min(missives - first, target)), target };
}

// Étapes du chapitre en cours : { chapter, steps: [{ id, label, state, have, target }], hidden, done, complete }.
// state : 'done' | 'now' (première étape à faire) | 'next' (la suivante) | 'later'.
// Une étape dont `reveal` n'est pas remplie reste masquée (comptée dans `hidden`, sans détail).
export function buildPath(finished, sim, missives) {
  const chapter = chapterOf(finished);
  const steps = [];
  let hidden = 0;
  let pending = 0;
  for (const step of PATH.filter((s) => (s.chapter ?? 1) === chapter)) {
    const { have, target } = measure(step.cond, sim, missives);
    const done = have >= target;
    if (!done && step.reveal) {
      const r = measure(step.reveal, sim, missives);
      if (r.have < r.target) {
        hidden++;
        continue;
      }
    }
    let state = 'done';
    if (!done) state = ['now', 'next'][pending] ?? 'later';
    if (!done) pending++;
    steps.push({ id: step.id, label: step.label, state, have, target });
  }
  return {
    chapter, steps, hidden,
    done: steps.filter((s) => s.state === 'done').length,
    complete: hidden === 0 && pending === 0,
  };
}
