import * as E from './evo.mjs';
import { pairsOf } from './sens.mjs';

const T = ['-3', '0', '3'];

export function diffProfile(pa, pb) {
  const B = new Map(pb), out = [];
  for (const [P, R] of pa) if (B.has(P)) out.push([P, +(R - B.get(P)).toFixed(4)]);
  return out;
}

/**
 * Find the A-constant that makes `tpl` reproduce `refEye`'s refraction table.
 * Coarse-to-fine search; returns {A, max, mean, prof}.
 */
export async function equivA(refEye, tpl, center = 119.3, span = 1.2) {
  const ref = await pairsOf(refEye, T);
  let lo = center - span, hi = center + span, best = null;
  for (const step of [0.1, 0.02, 0.01]) {
    best = null;
    for (let a = lo; a <= hi + 1e-9; a += step) {
      const A = a.toFixed(2);
      if (+A < 110 || +A > 125) continue;
      const p = await pairsOf({ ...tpl, txtAConstant: A }, T);
      if (p.length < 5) continue;
      const prof = diffProfile(ref, p);
      const max = Math.max(...prof.map(x => Math.abs(x[1])));
      const mean = prof.reduce((s, x) => s + Math.abs(x[1]), 0) / prof.length;
      if (!best || max < best.max - 1e-9 || (Math.abs(max - best.max) < 1e-9 && mean < best.mean)) best = { A, max, mean, prof };
    }
    lo = +best.A - step; hi = +best.A + step;
  }
  E.saveCache();
  return best;
}
