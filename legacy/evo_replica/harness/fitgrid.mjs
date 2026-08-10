import fs from 'fs';
import * as F from './fit.mjs';

const grid = JSON.parse(fs.readFileSync('grid.json', 'utf8')).filter(g => g.pairs.length >= 5);
console.log('usable grid points:', grid.length);

const cells = new Map();
for (const g of grid) {
  const k = `${g.AL}|${g.K}`;
  if (!cells.has(k)) cells.set(k, { AL: g.AL, K: g.K, byA: new Map() });
  cells.get(k).byA.set(g.A, g.pairs);
}
const cellList = [...cells.values()].filter(c => c.byA.size >= 1);
console.log('cells (AL,K):', cellList.length);

/** Global gauge: Kc = nk*1000/r with r = 337.5/Kmean; AL_eff = c1*AL + c0; vertex V. */
function build(params) {
  const [nk, c0, c1, V] = params;
  return (AL, K) => ({ Kc: (nk * 1000) / (337.5 / K), ALe: c1 * AL + c0, V });
}

/** For fixed gauge, best ELP per (cell, A) by 1-D search; returns total SSE and the ELPs. */
function evalGauge(params, want) {
  const g = build(params);
  let sse = 0, n = 0; const elps = [];
  for (const c of cellList) {
    const { Kc, ALe, V } = g(c.AL, c.K);
    for (const [A, pairs] of c.byA) {
      let lo = 1.0, hi = 9.0;
      const f = e => { let s = 0; for (const [P, R] of pairs) { const d = F.refOf(P, e, Kc, ALe, V) - R; s += d * d; } return s; };
      for (let i = 0; i < 90; i++) {
        const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
        if (f(m1) < f(m2)) hi = m2; else lo = m1;
      }
      const e = (lo + hi) / 2, s = f(e);
      sse += s; n += pairs.length;
      if (want) elps.push({ AL: c.AL, K: c.K, A, ELP: e, rms: Math.sqrt(s / pairs.length) });
    }
  }
  return want ? { sse, n, elps } : sse;
}

const seeds = [
  [1.3315, 0, 1, 0.012], [1.3375, 0, 1, 0.012], [1.336, 0.2, 1, 0.012],
  [1.3315, -0.3, 1, 0.0094], [1.34, 0.5, 1, 0.012],
];
let best = null;
for (const s of seeds) {
  const r = F.nm(p => evalGauge(p, false), s, 0.01, 900);
  if (!best || r.f < best.f) best = r;
}
const { sse, n, elps } = evalGauge(best.x, true);
console.log('\ngauge: nk=%s  ALoff=%s  ALscale=%s  V=%s',
  best.x[0].toFixed(6), best.x[1].toFixed(4), best.x[2].toFixed(6), best.x[3].toFixed(5));
console.log('global rms = %s over %d points', Math.sqrt(sse / n).toFixed(5), n);
const worst = elps.slice().sort((a, b) => b.rms - a.rms).slice(0, 8);
console.log('worst cells:', worst.map(w => `AL${w.AL}/K${w.K}/A${w.A}:${w.rms.toFixed(4)}`).join('  '));
fs.writeFileSync('elps.json', JSON.stringify({ gauge: best.x, elps }, null, 1));
console.log('wrote elps.json');
