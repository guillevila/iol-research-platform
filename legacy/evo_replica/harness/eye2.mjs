import fs from 'fs';
import * as I from './interp.mjs';
const T = JSON.parse(fs.readFileSync('tables4.json', 'utf8'));
export const { ALs, Ks, AS, tables } = T;

function bic(M, AL, K) {
  const ta = (AL - ALs[0]) / (ALs[1] - ALs[0]), tk = (K - Ks[0]) / (Ks[1] - Ks[0]);
  return I.cubic1(M.map(r => I.cubic1(r, tk)), ta);
}
/** 3-point Lagrange along the (uniform-ish) A axis. */
function alongA(key, AL, K, A) {
  const n = AS.length;
  let j = 0; while (j < n - 2 && AS[j + 1] < A) j++;
  const lo = Math.max(0, Math.min(n - 3, j - (A < AS[j] ? 1 : 0)));
  const idx = [lo, lo + 1, lo + 2];
  const x = idx.map(q => AS[q]), v = idx.map(q => bic(tables[AS[q]][key], AL, K));
  let s = 0;
  for (let a = 0; a < 3; a++) { let L = 1; for (let b = 0; b < 3; b++) if (a !== b) L *= (A - x[b]) / (x[a] - x[b]); s += v[a] * L; }
  return s;
}
const __memo = new Map();
export function eyeFn(AL, K, A) {
  const __k = AL.toFixed(4)+"|"+K.toFixed(4)+"|"+A.toFixed(4);
  const __h = __memo.get(__k); if (__h) return __h;
  const ELP = alongA('ELP', AL, K, A), s0 = alongA('s0', AL, K, A), kap = alongA('kap', AL, K, A);
  const P0 = I.p0Of(AL, I.KcOf(K), ELP);
  const m = -2 * s0 / kap, d = m - P0, a = s0 * m, b = -a * P0;
  const __r = {
    P0, s0, kap, ELP,
    ref: P => (a * P + b) / (P + d),
    powerFor: R => (b - d * R) / (R - a),
    slope: P => (a * d - b) / (P + d) ** 2,
  };
  __memo.set(__k, __r); return __r;
}
