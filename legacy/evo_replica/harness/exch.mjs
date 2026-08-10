import * as E from './evo.mjs';
import { pairsOf, BASE_EYE } from './sens.mjs';
import { diffProfile } from './equiv.mjs';

const T = ['-3', '0', '3'];

/** Equivalent A-constant for a given ACD change, searched near `center`. */
export async function exchange(baseEye, acdFrom, acdTo, center, span = 0.15) {
  const ref = await pairsOf({ ...baseEye, txtACD: String(acdTo) }, T);
  if (ref.length < 5) return { err: 'ref failed' };
  let lo = center - span, hi = center + span, best = null;
  for (const step of [0.05, 0.01]) {
    best = null;
    for (let a = lo; a <= hi + 1e-9; a += step) {
      const A = a.toFixed(2);
      if (+A < 110 || +A > 125) continue;
      const p = await pairsOf({ ...baseEye, txtACD: String(acdFrom), txtAConstant: A }, T);
      if (p.length < 5) continue;
      const prof = diffProfile(ref, p);
      const max = Math.max(...prof.map(x => Math.abs(x[1])));
      const mean = prof.reduce((s, x) => s + Math.abs(x[1]), 0) / prof.length;
      if (!best || max < best.max - 1e-9 || (Math.abs(max - best.max) < 1e-9 && mean < best.mean)) best = { A: +A, max, mean, n: prof.length };
    }
    lo = best.A - step; hi = best.A + step;
  }
  E.saveCache();
  return best;
}

const baseA = +BASE_EYE.txtAConstant;
const cases = [
  ['AL 21.0        ', { ...BASE_EYE, txtAL: '21.0' }],
  ['AL 23.5 (base) ', { ...BASE_EYE }],
  ['AL 26.5        ', { ...BASE_EYE, txtAL: '26.5' }],
  ['K 40.0         ', { ...BASE_EYE, txtK1: '40', txtK2: '40' }],
  ['K 47.0         ', { ...BASE_EYE, txtK1: '47', txtK2: '47' }],
  ['LT 5.2         ', { ...BASE_EYE, txtLT: '5.2' }],
];
console.log('ACD 3.2 -> 3.8 expressed as an A-constant shift (base A = 119.30)');
for (const [name, eye] of cases) {
  const r = await exchange(eye, 3.2, 3.8, 119.78);
  console.log(name, r.err ? r.err : `A=${r.A.toFixed(2)}  dA=${(r.A - baseA).toFixed(2)}  maxdiff=${r.max.toFixed(4)}  n=${r.n}`);
}
E.saveCache();
