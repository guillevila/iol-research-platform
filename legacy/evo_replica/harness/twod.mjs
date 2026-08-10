import * as E from './evo.mjs';
import { pairsOf, characterise, BASE_EYE } from './sens.mjs';
import { diffProfile } from './equiv.mjs';

const T = ['-3', '0', '3'];

async function chr(eye) {
  const p = await pairsOf(eye, T);
  if (p.length < 5) return null;
  return { ...characterise(p), pairs: p };
}

/** Solve for (dAL, dA) making `tpl` reproduce `ref`, via local linearisation then exact search. */
export async function solve2(refEye, tpl, alBase, aBase) {
  const ref = await chr(refEye);
  const c00 = await chr({ ...tpl, txtAL: alBase.toFixed(2), txtAConstant: aBase.toFixed(2) });
  const cAL = await chr({ ...tpl, txtAL: (alBase + 0.20).toFixed(2), txtAConstant: aBase.toFixed(2) });
  const cA = await chr({ ...tpl, txtAL: alBase.toFixed(2), txtAConstant: (aBase + 0.40).toFixed(2) });
  E.saveCache();
  // Jacobian of (P0, slope) wrt (AL, A)
  const J = [
    [(cAL.P0 - c00.P0) / 0.20, (cA.P0 - c00.P0) / 0.40],
    [(cAL.slope - c00.slope) / 0.20, (cA.slope - c00.slope) / 0.40],
  ];
  const r = [ref.P0 - c00.P0, ref.slope - c00.slope];
  const det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
  const dAL = (r[0] * J[1][1] - J[0][1] * r[1]) / det;
  const dA = (J[0][0] * r[1] - r[0] * J[1][0]) / det;
  console.log(`  linearised guess: dAL=${dAL.toFixed(3)}  dA=${dA.toFixed(3)}`);

  // Exact local search around the guess
  let best = null;
  for (let i = -4; i <= 4; i++) {
    for (let j = -5; j <= 5; j++) {
      const AL = alBase + dAL + i * 0.01;
      const A = aBase + dA + j * 0.01;
      if (A < 110 || A > 125) continue;
      const p = await pairsOf({ ...tpl, txtAL: AL.toFixed(2), txtAConstant: A.toFixed(2) }, T);
      if (p.length < 5) continue;
      const prof = diffProfile(ref.pairs, p);
      if (prof.length < 10) continue;
      const max = Math.max(...prof.map(x => Math.abs(x[1])));
      const mean = prof.reduce((s, x) => s + Math.abs(x[1]), 0) / prof.length;
      if (!best || max < best.max - 1e-9 || (Math.abs(max - best.max) < 1e-9 && mean < best.mean)) best = { AL, A, max, mean, n: prof.length };
    }
  }
  E.saveCache();
  return best;
}
