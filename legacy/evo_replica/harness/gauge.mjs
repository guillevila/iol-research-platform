import fs from 'fs';
import * as F from './fit.mjs';

const grid = JSON.parse(fs.readFileSync('grid.json', 'utf8')).filter(g => g.pairs.length >= 5);
const cells = new Map();
for (const g of grid) {
  const k = `${g.AL}|${g.K}`;
  if (!cells.has(k)) cells.set(k, { AL: g.AL, K: g.K, byA: new Map() });
  cells.get(k).byA.set(g.A, g.pairs);
}
export const cellList = [...cells.values()];

/** Best ELP for one (cell, A) under a gauge; golden-section on a unimodal SSE. */
function bestELP(pairs, Kc, ALe, V) {
  let lo = 0.5, hi = 12.0;
  const f = e => { let s = 0; for (const [P, R] of pairs) { const d = F.refOf(P, e, Kc, ALe, V) - R; s += d * d; } return s; };
  for (let i = 0; i < 120; i++) {
    const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
    if (f(m1) < f(m2)) hi = m2; else lo = m1;
  }
  const e = (lo + hi) / 2;
  return { e, s: f(e) };
}

export function evalGauge(nk, c0, V = 0.012, want = false) {
  let sse = 0, n = 0; const elps = [];
  for (const c of cellList) {
    const Kc = ((nk - 1) * 1000) / (337.5 / c.K);
    const ALe = c.AL + c0;
    for (const [A, pairs] of c.byA) {
      const { e, s } = bestELP(pairs, Kc, ALe, V);
      sse += s; n += pairs.length;
      if (want) elps.push({ AL: c.AL, K: c.K, A, ELP: e, rms: Math.sqrt(s / pairs.length) });
    }
  }
  return want ? { rms: Math.sqrt(sse / n), n, elps } : Math.sqrt(sse / n);
}

if (process.argv[1] && process.argv[1].endsWith('gauge.mjs')) {
  console.log('coarse scan (V = 0.012):');
  let best = null;
  for (let nk = 1.310; nk <= 1.362; nk += 0.004) {
    let row = [];
    for (let c0 = -1.2; c0 <= 1.21; c0 += 0.3) {
      const r = evalGauge(nk, c0);
      row.push(r.toFixed(4));
      if (!best || r < best.r) best = { nk, c0, r };
    }
    console.log('nk=' + nk.toFixed(3), row.join(' '));
  }
  console.log('\nbest coarse:', best);
  // refine
  for (const [dn, dc] of [[0.002, 0.15], [0.0005, 0.04], [0.0001, 0.01]]) {
    let b = best;
    for (let nk = best.nk - 2 * dn; nk <= best.nk + 2 * dn + 1e-12; nk += dn)
      for (let c0 = best.c0 - 2 * dc; c0 <= best.c0 + 2 * dc + 1e-12; c0 += dc) {
        const r = evalGauge(nk, c0);
        if (r < b.r) b = { nk, c0, r };
      }
    best = b;
  }
  console.log('refined:', { nk: best.nk.toFixed(5), c0: best.c0.toFixed(4), rms: best.r.toFixed(5) });
  const out = evalGauge(best.nk, best.c0, 0.012, true);
  console.log('rms', out.rms.toFixed(5), 'n', out.n);
  console.log('worst:', out.elps.slice().sort((a, b) => b.rms - a.rms).slice(0, 6)
    .map(w => `AL${w.AL}/K${w.K}/A${w.A}:${w.rms.toFixed(4)}`).join('  '));
  fs.writeFileSync('elps.json', JSON.stringify({ gauge: { nk: best.nk, c0: best.c0, V: 0.012 }, elps: out.elps }, null, 1));
  console.log('wrote elps.json');
}
