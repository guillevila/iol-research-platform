import * as E from './evo.mjs';
import { BASE_EYE, pairsOf } from './sens.mjs';

/** Compare two refraction tables at shared IOL powers. */
export function cmp(pa, pb) {
  const A = new Map(pa), B = new Map(pb);
  let n = 0, max = 0, sum = 0;
  for (const [P, R] of A) {
    if (!B.has(P)) continue;
    const d = Math.abs(R - B.get(P));
    n++; max = Math.max(max, d); sum += d;
  }
  return { n, max, mean: n ? sum / n : NaN };
}

/** Find the A-constant whose table best matches a reference table. */
export async function matchA(refPairs, eyeTemplate, lo, hi, step) {
  let best = null;
  for (let a = lo; a <= hi + 1e-9; a += step) {
    const A = a.toFixed(2);
    const p = await pairsOf({ ...eyeTemplate, txtAConstant: A });
    if (p.length < 5) continue;
    const c = cmp(refPairs, p);
    if (!best || c.max < best.c.max || (c.max === best.c.max && c.mean < best.c.mean)) best = { A, c };
  }
  E.saveCache();
  return best;
}
