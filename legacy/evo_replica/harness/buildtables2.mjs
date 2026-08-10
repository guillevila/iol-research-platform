import fs from 'fs';
import { KcOf, elpOf, p0Of } from './interp.mjs';

const grid = JSON.parse(fs.readFileSync('gridA.json', 'utf8')).filter(g => g.pairs.length >= 5);
const ALs = [...new Set(grid.map(g => g.AL))].sort((a, b) => a - b);
const Ks = [...new Set(grid.map(g => g.K))].sort((a, b) => a - b);
const AS = [...new Set(grid.map(g => g.A))].sort((a, b) => a - b);
console.log('ALs', ALs.join(','), '| Ks', Ks.join(','), '| As', AS.join(','));

function fitMobius(pairs) {
  const X = [], y = [];
  for (const [P, R] of pairs) { X.push([P, 1, -R]); y.push(R * P); }
  const n = 3, A = Array.from({ length: n }, () => new Array(n).fill(0)), b = new Array(n).fill(0);
  for (let r = 0; r < X.length; r++) for (let i = 0; i < n; i++) { b[i] += X[r][i] * y[r]; for (let j = 0; j < n; j++) A[i][j] += X[r][i] * X[r][j]; }
  for (let i = 0; i < n; i++) {
    let p = i; for (let k = i + 1; k < n; k++) if (Math.abs(A[k][i]) > Math.abs(A[p][i])) p = k;
    [A[i], A[p]] = [A[p], A[i]]; [b[i], b[p]] = [b[p], b[i]];
    for (let k = i + 1; k < n; k++) { const f = A[k][i] / A[i][i]; for (let j = i; j < n; j++) A[k][j] -= f * A[i][j]; b[k] -= f * b[i]; }
  }
  const c = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) { let s = b[i]; for (let j = i + 1; j < n; j++) s -= A[i][j] * c[j]; c[i] = s / A[i][i]; }
  return c;
}
function charOf(pairs) {
  const [a, b, d] = fitMobius(pairs);
  const P0 = -b / a, s0 = (a * d - b) / (P0 + d) ** 2, kap = -2 * (a * d - b) / (P0 + d) ** 3;
  let mx = 0; for (const [P, R] of pairs) mx = Math.max(mx, Math.abs((a * P + b) / (P + d) - R));
  return { P0, s0, kap, mx };
}
function polyfit(xs, ys, deg) {
  const n = deg + 1, A = Array.from({ length: n }, () => new Array(n).fill(0)), b = new Array(n).fill(0);
  for (let i = 0; i < xs.length; i++) for (let r = 0; r < n; r++) { b[r] += ys[i] * xs[i] ** r; for (let c = 0; c < n; c++) A[r][c] += xs[i] ** (r + c); }
  for (let i = 0; i < n; i++) {
    let p = i; for (let k = i + 1; k < n; k++) if (Math.abs(A[k][i]) > Math.abs(A[p][i])) p = k;
    [A[i], A[p]] = [A[p], A[i]]; [b[i], b[p]] = [b[p], b[i]];
    for (let k = i + 1; k < n; k++) { const f = A[k][i] / A[i][i]; for (let j = i; j < n; j++) A[k][j] -= f * A[i][j]; b[k] -= f * b[i]; }
  }
  const c = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) { let s = b[i]; for (let j = i + 1; j < n; j++) s -= A[i][j] * c[j]; c[i] = s / A[i][i]; }
  return x => c.reduce((s, ci, i) => s + ci * x ** i, 0);
}

const BAD = 0.02;
const chars = new Map();
for (const g of grid) chars.set(`${g.AL}|${g.K}|${g.A}`, { ...charOf(g.pairs), pairs: g.pairs });

const tables = {}; let repaired = 0, total = 0;
for (const A of AS) {
  const T = { ELP: [], s0: [], kap: [] };
  for (const AL of ALs) {
    const rE = [], rS = [], rK = [], gK = [], gE = [], gS = [], gKa = [];
    for (const K of Ks) {
      total++;
      const c = chars.get(`${AL}|${K}|${A}`);
      const ok = c && c.mx <= BAD && isFinite(c.P0);
      const elp = c ? elpOf(AL, KcOf(K), c.P0) : NaN;
      const okElp = ok && isFinite(elp) && elp > -2 && elp < 12;
      rE.push(okElp ? elp : NaN); rS.push(okElp ? c.s0 : NaN); rK.push(okElp ? c.kap : NaN);
      if (okElp) { gK.push(K); gE.push(elp); gS.push(c.s0); gKa.push(c.kap); }
    }
    if (gK.length >= 3 && gK.length < Ks.length) {
      const fE = polyfit(gK, gE, 2), fS = polyfit(gK, gS, 2), fK = polyfit(gK, gKa, 2);
      for (let j = 0; j < Ks.length; j++) if (Number.isNaN(rE[j])) { rE[j] = fE(Ks[j]); rS[j] = fS(Ks[j]); rK[j] = fK(Ks[j]); repaired++; }
    }
    T.ELP.push(rE); T.s0.push(rS); T.kap.push(rK);
  }
  tables[A] = T;
}
console.log('repaired cells:', repaired, 'of', total);

// verification on-grid
const mob = (P0, s0, kap) => { const m = -2 * s0 / kap, d = m - P0, a = s0 * m, b = -a * P0; return P => (a * P + b) / (P + d); };
const good = [], bad = [];
for (const g of grid) {
  const c = chars.get(`${g.AL}|${g.K}|${g.A}`);
  const T = tables[g.A], i = ALs.indexOf(g.AL), j = Ks.indexOf(g.K);
  const P0 = p0Of(g.AL, KcOf(g.K), T.ELP[i][j]);
  const f = mob(P0, T.s0[i][j], T.kap[i][j]);
  let mx = 0; for (const [P, R] of g.pairs) mx = Math.max(mx, Math.abs(f(P) - R));
  (c.mx <= BAD ? good : bad).push(mx);
}
const st = a => a.length ? `n=${a.length} mean=${(a.reduce((s, v) => s + v, 0) / a.length).toFixed(5)} max=${Math.max(...a).toFixed(4)}` : 'n=0';
console.log('on-grid reconstruction — valid cells :', st(good));
console.log('on-grid reconstruction — degenerate  :', st(bad));

fs.writeFileSync('tables2.json', JSON.stringify({ ALs, Ks, AS, tables }, null, 1));
console.log('wrote tables2.json');
