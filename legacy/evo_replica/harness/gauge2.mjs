import fs from 'fs';
import * as F from './fit.mjs';
import { cellList } from './gauge.mjs';

function bestELP(pairs, Kc, ALe, V) {
  let lo = 0.2, hi = 14.0;
  const f = e => { let s = 0; for (const [P, R] of pairs) { const d = F.refOf(P, e, Kc, ALe, V) - R; s += d * d; } return s; };
  for (let i = 0; i < 140; i++) {
    const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
    if (f(m1) < f(m2)) hi = m2; else lo = m1;
  }
  const e = (lo + hi) / 2; return { e, s: f(e) };
}

/** p = [k0, k1, a0, a1, V] ; Kc = k0 + k1*K ; ALe = a0 + a1*AL */
export function evalG(p, want = false) {
  const [k0, k1, a0, a1, V] = p;
  let sse = 0, n = 0; const elps = [];
  for (const c of cellList) {
    const Kc = k0 + k1 * c.K, ALe = a0 + a1 * c.AL;
    if (!(Kc > 5) || !(ALe > 5) || !(V > 0)) return want ? { rms: 1e9, elps: [] } : 1e9;
    for (const [A, pairs] of c.byA) {
      const { e, s } = bestELP(pairs, Kc, ALe, V);
      sse += s; n += pairs.length;
      if (want) elps.push({ AL: c.AL, K: c.K, A, ELP: e, Kc, ALe, rms: Math.sqrt(s / pairs.length) });
    }
  }
  const rms = Math.sqrt(sse / n);
  return want ? { rms, n, elps } : rms;
}

if (process.argv[1] && process.argv[1].endsWith('gauge2.mjs')) {
  const seeds = [
    [0, 0.98222, 1.45, 1, 0.012],
    [0, 0.98222, 0, 1, 0.012],
    [5, 0.9, 1.0, 1, 0.012],
    [-5, 1.08, 2.0, 1, 0.012],
    [0, 1.0, 1.45, 1, 0.010],
  ];
  let best = null;
  for (const s of seeds) {
    // scale-aware simplex: perturb each coordinate by a sensible absolute step
    const steps = [1.0, 0.02, 0.3, 0.02, 0.001];
    const f = x => evalG(x);
    let cur = s.slice();
    for (let round = 0; round < 6; round++) {
      for (let i = 0; i < cur.length; i++) {
        let lo = cur[i] - steps[i] * 8, hi = cur[i] + steps[i] * 8;
        for (let it = 0; it < 60; it++) {
          const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
          const t1 = cur.slice(); t1[i] = m1; const t2 = cur.slice(); t2[i] = m2;
          if (f(t1) < f(t2)) hi = m2; else lo = m1;
        }
        cur[i] = (lo + hi) / 2;
      }
    }
    const r = f(cur);
    console.log('seed ->', cur.map(x => x.toFixed(5)).join(', '), ' rms', r.toFixed(5));
    if (!best || r < best.r) best = { x: cur, r };
  }
  console.log('\nBEST: k0=%s k1=%s a0=%s a1=%s V=%s  rms=%s',
    ...best.x.map(x => x.toFixed(5)), best.r.toFixed(5));
  const out = evalG(best.x, true);
  console.log('worst cells:', out.elps.slice().sort((a, b) => b.rms - a.rms).slice(0, 8)
    .map(w => `AL${w.AL}/K${w.K}/A${w.A}:${w.rms.toFixed(4)}`).join('  '));
  fs.writeFileSync('elps2.json', JSON.stringify({ gauge: best.x, elps: out.elps }, null, 1));
  console.log('wrote elps2.json');
}
