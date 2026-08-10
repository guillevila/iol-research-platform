import fs from 'fs';
import * as I from './interp.mjs';
const { ALs, Ks, AS, tables } = JSON.parse(fs.readFileSync('tables.json', 'utf8'));
function bic(M, AL, K) {
  const tk = (K - Ks[0]) / (Ks[1] - Ks[0]), ta = (AL - ALs[0]) / (ALs[1] - ALs[0]);
  return I.cubic1(M.map(r => I.cubic1(r, tk)), ta);
}
export function eyeFn(AL, K, A) {
  const f = (A - AS[0]) / (AS[1] - AS[0]);
  const mix = key => bic(tables[AS[0]][key], AL, K) * (1 - f) + bic(tables[AS[1]][key], AL, K) * f;
  const ELP = mix('ELP'), s0 = mix('s0'), kap = mix('kap');
  const P0 = I.p0Of(AL, I.KcOf(K), ELP);
  const m = -2 * s0 / kap, d = m - P0, a = s0 * m, b = -a * P0;
  return { P0, s0, kap,
    ref: Pw => (a * Pw + b) / (Pw + d),
    slope: Pw => (a * d - b) / (Pw + d) ** 2 };
}
