import fs from 'fs';
import { KcOf, elpOf, p0Of } from './interp.mjs';

const rows = JSON.parse(fs.readFileSync('mobius.json', 'utf8'));
const grid = JSON.parse(fs.readFileSync('grid.json', 'utf8'));
const ALs = [...new Set(rows.map(r => r.AL))].sort((a, b) => a - b);
const Ks = [...new Set(rows.map(r => r.K))].sort((a, b) => a - b);
const AS = [...new Set(rows.map(r => r.A))].sort((a, b) => a - b);
const BAD = 0.02;

/** Least-squares polynomial fit y(x) of given degree; returns evaluator. */
function polyfit(xs, ys, deg) {
  const n = deg + 1;
  const A = Array.from({ length: n }, () => new Array(n).fill(0)), b = new Array(n).fill(0);
  for (let i = 0; i < xs.length; i++)
    for (let r = 0; r < n; r++) {
      b[r] += ys[i] * xs[i] ** r;
      for (let c = 0; c < n; c++) A[r][c] += xs[i] ** (r + c);
    }
  for (let i = 0; i < n; i++) {
    let p = i; for (let k = i + 1; k < n; k++) if (Math.abs(A[k][i]) > Math.abs(A[p][i])) p = k;
    [A[i], A[p]] = [A[p], A[i]]; [b[i], b[p]] = [b[p], b[i]];
    for (let k = i + 1; k < n; k++) { const f = A[k][i] / A[i][i]; for (let j = i; j < n; j++) A[k][j] -= f * A[i][j]; b[k] -= f * b[i]; }
  }
  const c = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) { let s = b[i]; for (let j = i + 1; j < n; j++) s -= A[i][j] * c[j]; c[i] = s / A[i][i]; }
  return x => c.reduce((s, ci, i) => s + ci * x ** i, 0);
}

const tables = {};
let repaired = 0;
for (const A of AS) {
  const T = { ELP: [], s0: [], kap: [] };
  for (const AL of ALs) {
    const rowELP = [], rowS = [], rowK = [], goodK = [], gELP = [], gS = [], gKap = [];
    for (const K of Ks) {
      const r = rows.find(x => x.AL === AL && x.K === K && x.A === A);
      const ok = r && r.mx <= BAD;
      const elp = r ? elpOf(AL, KcOf(K), r.P0) : NaN;
      rowELP.push(ok ? elp : NaN); rowS.push(ok ? r.s0 : NaN); rowK.push(ok ? r.kap : NaN);
      if (ok) { goodK.push(K); gELP.push(elp); gS.push(r.s0); gKap.push(r.kap); }
    }
    // repair masked entries by extrapolating along K from the good ones
    if (goodK.length >= 3 && goodK.length < Ks.length) {
      const fE = polyfit(goodK, gELP, 2), fS = polyfit(goodK, gS, 2), fK = polyfit(goodK, gKap, 2);
      for (let j = 0; j < Ks.length; j++)
        if (Number.isNaN(rowELP[j])) { rowELP[j] = fE(Ks[j]); rowS[j] = fS(Ks[j]); rowK[j] = fK(Ks[j]); repaired++; }
    }
    T.ELP.push(rowELP); T.s0.push(rowS); T.kap.push(rowK);
  }
  tables[A] = T;
}
console.log('repaired cells:', repaired, '(of', ALs.length * Ks.length * AS.length, ')');

// ---- verification: reconstruct REF(P) and compare with the raw EVO tables ----
function mobiusFrom(P0, s0, kap) {
  const m = -2 * s0 / kap, d = m - P0, a = s0 * m, b = -a * P0;
  return P => (a * P + b) / (P + d);
}
let worst = [], all = [];
for (const g of grid) {
  if (g.pairs.length < 5) continue;
  const ai = AS.indexOf(g.A), i = ALs.indexOf(g.AL), j = Ks.indexOf(g.K);
  const T = tables[AS[ai]];
  const P0 = p0Of(g.AL, KcOf(g.K), T.ELP[i][j]);
  const f = mobiusFrom(P0, T.s0[i][j], T.kap[i][j]);
  let mx = 0;
  for (const [P, R] of g.pairs) mx = Math.max(mx, Math.abs(f(P) - R));
  all.push(mx); worst.push({ AL: g.AL, K: g.K, A: g.A, mx });
}
worst.sort((a, b) => b.mx - a.mx);
console.log('\nreconstruction vs raw EVO tables (on-grid, so this tests the encoding only):');
console.log('  mean max-err =', (all.reduce((s, v) => s + v, 0) / all.length).toFixed(5),
  ' | 95th pct =', all.slice().sort((a, b) => a - b)[Math.floor(all.length * 0.95)].toFixed(4),
  ' | worst =', worst[0].mx.toFixed(4));
console.log('  worst cells:', worst.slice(0, 6).map(w => `AL${w.AL}/K${w.K}/A${w.A}:${w.mx.toFixed(3)}`).join('  '));

fs.writeFileSync('tables.json', JSON.stringify({ ALs, Ks, AS, tables }, null, 1));
console.log('\nwrote tables.json');
