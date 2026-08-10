import fs from 'fs';
import { KcOf, elpOf, p0Of } from './interp.mjs';

const grid = JSON.parse(fs.readFileSync('gridFull.json', 'utf8')).filter(g => g.pairs.length >= 5);
const ALs = [...new Set(grid.map(g => g.AL))].sort((a, b) => a - b);
const Ks = [...new Set(grid.map(g => g.K))].sort((a, b) => a - b);
const AS = [...new Set(grid.map(g => g.A))].sort((a, b) => a - b);
console.log('ALs', ALs.join(','), '| Ks', Ks.join(','), '| As', AS.join(','));

function solve(A, b) {
  const n = A.length;
  for (let i = 0; i < n; i++) {
    let p = i; for (let k = i + 1; k < n; k++) if (Math.abs(A[k][i]) > Math.abs(A[p][i])) p = k;
    [A[i], A[p]] = [A[p], A[i]]; [b[i], b[p]] = [b[p], b[i]];
    if (Math.abs(A[i][i]) < 1e-12) continue;
    for (let k = i + 1; k < n; k++) { const f = A[k][i] / A[i][i]; for (let j = i; j < n; j++) A[k][j] -= f * A[i][j]; b[k] -= f * b[i]; }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) { let s = b[i]; for (let j = i + 1; j < n; j++) s -= A[i][j] * x[j]; x[i] = Math.abs(A[i][i]) < 1e-12 ? 0 : s / A[i][i]; }
  return x;
}
/** 2-D polynomial surface fit, degree dA in AL and dK in K. */
function surfFit(pts, dA, dK) {
  const terms = [];
  for (let i = 0; i <= dA; i++) for (let j = 0; j <= dK; j++) terms.push([i, j]);
  const n = terms.length;
  const M = Array.from({ length: n }, () => new Array(n).fill(0)), b = new Array(n).fill(0);
  const basis = (al, k) => terms.map(([i, j]) => Math.pow(al - 26, i) * Math.pow(k - 42, j));
  for (const p of pts) {
    const v = basis(p.AL, p.K);
    for (let i = 0; i < n; i++) { b[i] += v[i] * p.v; for (let j = 0; j < n; j++) M[i][j] += v[i] * v[j]; }
  }
  const c = solve(M, b);
  return (al, k) => basis(al, k).reduce((s, v, i) => s + v * c[i], 0);
}
function fitMobius(pairs) {
  const X = [], y = [];
  for (const [P, R] of pairs) { X.push([P, 1, -R]); y.push(R * P); }
  const n = 3, A = Array.from({ length: n }, () => new Array(n).fill(0)), b = new Array(n).fill(0);
  for (let r = 0; r < X.length; r++) for (let i = 0; i < n; i++) { b[i] += X[r][i] * y[r]; for (let j = 0; j < n; j++) A[i][j] += X[r][i] * X[r][j]; }
  return solve(A, b);
}

const chars = new Map();
for (const g of grid) {
  const [a, b, d] = fitMobius(g.pairs);
  const P0 = -b / a, s0 = (a * d - b) / (P0 + d) ** 2, kap = -2 * (a * d - b) / (P0 + d) ** 3;
  let mx = 0; for (const [P, R] of g.pairs) mx = Math.max(mx, Math.abs((a * P + b) / (P + d) - R));
  chars.set(`${g.AL}|${g.K}|${g.A}`, { P0, s0, kap, mx });
}

const tables = {}, validMask = {};
let repaired = 0, total = 0;
for (const A of AS) {
  const good = { ELP: [], s0: [], kap: [] }, mask = [];
  for (const AL of ALs) for (const K of Ks) {
    total++;
    const c = chars.get(`${AL}|${K}|${A}`);
    if (!c) continue;
    const elp = elpOf(AL, KcOf(K), c.P0);
    const ok = c.mx <= 0.02 && isFinite(elp) && elp > -1 && elp < 12 && c.P0 > 5.0;
    if (ok) {
      good.ELP.push({ AL, K, v: elp }); good.s0.push({ AL, K, v: c.s0 }); good.kap.push({ AL, K, v: c.kap });
    }
    mask.push({ AL, K, ok });
  }
  const fE = surfFit(good.ELP, 3, 3), fS = surfFit(good.s0, 3, 3), fK = surfFit(good.kap, 3, 3);
  const T = { ELP: [], s0: [], kap: [] }, Mk = [];
  for (const AL of ALs) {
    const rE = [], rS = [], rK = [], rM = [];
    for (const K of Ks) {
      const c = chars.get(`${AL}|${K}|${A}`);
      const elp = c ? elpOf(AL, KcOf(K), c.P0) : NaN;
      const ok = c && c.mx <= 0.02 && isFinite(elp) && elp > -1 && elp < 12 && c.P0 > 5.0;
      if (ok) { rE.push(elp); rS.push(c.s0); rK.push(c.kap); }
      else { rE.push(fE(AL, K)); rS.push(fS(AL, K)); rK.push(fK(AL, K)); repaired++; }
      rM.push(ok ? 1 : 0);
    }
    T.ELP.push(rE); T.s0.push(rS); T.kap.push(rK); Mk.push(rM);
  }
  tables[A] = T; validMask[A] = Mk;
}
console.log('repaired (masked) cells:', repaired, 'of', total);

const mob = (P0, s0, kap) => { const m = -2 * s0 / kap, d = m - P0, a = s0 * m, b = -a * P0; return P => (a * P + b) / (P + d); };
const gd = [], bd = [];
for (const g of grid) {
  const c = chars.get(`${g.AL}|${g.K}|${g.A}`);
  const i = ALs.indexOf(g.AL), j = Ks.indexOf(g.K);
  const P0 = p0Of(g.AL, KcOf(g.K), tables[g.A].ELP[i][j]);
  const f = mob(P0, tables[g.A].s0[i][j], tables[g.A].kap[i][j]);
  let mx = 0; for (const [P, R] of g.pairs) mx = Math.max(mx, Math.abs(f(P) - R));
  (validMask[g.A][i][j] ? gd : bd).push(mx);
}
const st = a => a.length ? `n=${a.length} mean=${(a.reduce((s, v) => s + v, 0) / a.length).toFixed(5)} p95=${a.slice().sort((x, y) => x - y)[Math.floor(a.length * .95)].toFixed(4)} max=${Math.max(...a).toFixed(4)}` : 'n=0';
console.log('on-grid, celdas válidas    :', st(gd));
console.log('on-grid, celdas enmascaradas:', st(bd));
fs.writeFileSync('tables4.json', JSON.stringify({ ALs, Ks, AS, tables, validMask }, null, 1));
console.log('wrote tables4.json');
