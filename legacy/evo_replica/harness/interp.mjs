import fs from 'fs';

const NV = 1336;
export const KcOf = K => 331.5 / (337.5 / K);   // n = 1.3315 convention

/** Emmetropic IOL power from a thin-lens vergence with effective ELP. */
export function p0Of(AL, Kc, ELP) {
  return NV / (AL - ELP) - NV / (NV / Kc - ELP);
}
/** Invert: find ELP reproducing a given P0 (monotone in ELP). */
export function elpOf(AL, Kc, P0) {
  let lo = -5, hi = Math.min(AL, NV / Kc) - 0.3;
  for (let i = 0; i < 200; i++) {
    const m = (lo + hi) / 2;
    if (p0Of(AL, Kc, m) < P0) lo = m; else hi = m;
  }
  return (lo + hi) / 2;
}

/** Catmull-Rom style 1-D cubic interpolation on a uniform grid (clamped ends). */
export function cubic1(vs, t) {
  const n = vs.length;
  const i = Math.max(0, Math.min(n - 2, Math.floor(t)));
  const f = t - i;
  const p = k => vs[Math.max(0, Math.min(n - 1, k))];
  const p0 = p(i - 1), p1 = p(i), p2 = p(i + 1), p3 = p(i + 2);
  return p1 + 0.5 * f * (p2 - p0 + f * (2 * p0 - 5 * p1 + 4 * p2 - p3 + f * (3 * (p1 - p2) + p3 - p0)));
}

export function makeSurface(ALs, Ks, valAt) {
  const M = ALs.map(al => Ks.map(k => valAt(al, k)));
  return (AL, K) => {
    const ta = (AL - ALs[0]) / (ALs[1] - ALs[0]);
    const tk = (K - Ks[0]) / (Ks[1] - Ks[0]);
    const col = M.map(row => cubic1(row, tk));
    return cubic1(col, ta);
  };
}

if (process.argv[1] && process.argv[1].endsWith('interp.mjs')) {
  const rows = JSON.parse(fs.readFileSync('mobius.json', 'utf8'));
  const ALs = [...new Set(rows.map(r => r.AL))].sort((a, b) => a - b);
  const Ks = [...new Set(rows.map(r => r.K))].sort((a, b) => a - b);
  const AS = [...new Set(rows.map(r => r.A))].sort((a, b) => a - b);
  console.log('ALs', ALs.join(','), '| Ks', Ks.join(','), '| As', AS.join(','));
  const get = (AL, K, A) => rows.find(r => r.AL === AL && r.K === K && r.A === A);

  // ELP surface (physically linearised) per A-constant
  for (const A of AS) {
    console.log(`\nELP surface @ A=${A}  (rows = AL, cols = K)`);
    console.log('        ' + Ks.map(k => ('K' + k).padStart(8)).join(''));
    for (const AL of ALs) {
      const line = Ks.map(K => {
        const r = get(AL, K, A);
        return r ? elpOf(AL, KcOf(K), r.P0).toFixed(3).padStart(8) : '     -  ';
      }).join('');
      console.log(('AL' + AL).padEnd(8) + line);
    }
  }

  // Leave-one-out test on interior points: how well does cubic interpolation predict a held-out row?
  console.log('\nLeave-one-out (drop one AL row, predict it from the rest) @ A=117.3, error in P0 (D):');
  const A = 117.3;
  for (let di = 2; di <= ALs.length - 3; di++) {
    const keptAL = ALs.filter((_, i) => i !== di);
    const errs = [];
    for (const K of Ks) {
      const surf = makeSurface(keptAL, Ks, (al, k) => {
        const r = get(al, k, A); return r ? elpOf(al, KcOf(k), r.P0) : NaN;
      });
      const tgt = get(ALs[di], K, A);
      if (!tgt) continue;
      // interpolate at the dropped AL (uneven grid: use index position)
      const pos = keptAL.findIndex(v => v > ALs[di]);
      const tAL = pos - 0.5 + (pos < 0 ? 0 : 0);
      const elpPred = (() => {
        const M = keptAL.map(al => Ks.map(k => { const r = get(al, k, A); return r ? elpOf(al, KcOf(k), r.P0) : NaN; }));
        const col = M.map(row => cubic1(row, (K - Ks[0]) / (Ks[1] - Ks[0])));
        return cubic1(col, tAL);
      })();
      const p0pred = p0Of(ALs[di], KcOf(K), elpPred);
      errs.push(p0pred - tgt.P0);
    }
    console.log(`  drop AL=${ALs[di]}: max|dP0| = ${Math.max(...errs.map(Math.abs)).toFixed(4)}  mean = ${(errs.reduce((s, e) => s + Math.abs(e), 0) / errs.length).toFixed(4)}`);
  }
}
