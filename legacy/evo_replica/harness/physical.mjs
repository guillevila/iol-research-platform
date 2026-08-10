import fs from 'fs';
import * as I from './interp.mjs';

const P = JSON.parse(fs.readFileSync('post.json', 'utf8'));
const { ALs, Ks, AS, tables } = JSON.parse(fs.readFileSync('tables.json', 'utf8'));
const D2R = Math.PI / 180;
const antVec = (m, th) => [m * Math.cos(2 * th * D2R), m * Math.sin(2 * th * D2R)];
const uOf = ax => [Math.cos(2 * ax * D2R), Math.sin(2 * ax * D2R)];

function bic(M, AL, K) {
  const tk = (K - Ks[0]) / (Ks[1] - Ks[0]), ta = (AL - ALs[0]) / (ALs[1] - ALs[0]);
  return I.cubic1(M.map(r => I.cubic1(r, tk)), ta);
}
/** Full spherical characterisation of an eye -> refraction function of IOL power. */
export function eyeFn(AL, K, A) {
  const f = (A - AS[0]) / (AS[1] - AS[0]);
  const mix = key => bic(tables[AS[0]][key], AL, K) * (1 - f) + bic(tables[AS[1]][key], AL, K) * f;
  const ELP = mix('ELP'), s0 = mix('s0'), kap = mix('kap');
  const P0 = I.p0Of(AL, I.KcOf(K), ELP);
  const m = -2 * s0 / kap, d = m - P0, a = s0 * m, b = -a * P0;
  return { P0, s0, kap, ref: Pw => (a * Pw + b) / (Pw + d) };
}

/**
 * PHYSICAL toric model: the toric IOL puts power P in one meridian and P+c in the other.
 * The refractive cylinder it delivers is |ref(P+c) - ref(P)| — no fitted "ratio" at all.
 */
function deliveredCyl(fn, Pbase, c) { return Math.abs(fn.ref(Pbase + c) - fn.ref(Pbase)); }

// Build observations. Each probe has its own mean K (K1=43, K2=43+m).
const obs = [];
for (const r of P.posterior.filter(r => r.mode === 'Posterior' && r.torics)) {
  const Kmean = 43 + r.m / 2;
  const fn = eyeFn(23.5, Kmean, 119.3);
  const Pbase = Math.round(fn.P0 * 2) / 2;
  const ant = antVec(r.m, r.th);
  for (const t of r.torics) {
    if (t.resiCyl == null || t.resiAxis == null || t.iolAxis == null) continue;
    obs.push({
      ant, c: t.toric, u: uOf(t.iolAxis),
      R: antVec(Math.abs(t.resiCyl), t.resiAxis + 90),
      dc: deliveredCyl(fn, Pbase, t.toric), m: r.m, th: r.th,
    });
  }
}
console.log('observations:', obs.length);

function evalModel(a, b) {
  let sse = 0, mx = 0;
  for (const o of obs) {
    const tx = a * o.ant[0] + b, ty = a * o.ant[1];
    const px = tx - o.dc * o.u[0], py = ty - o.dc * o.u[1];
    const e = Math.hypot(px - o.R[0], py - o.R[1]);
    sse += e * e; mx = Math.max(mx, e);
  }
  return { rms: Math.sqrt(sse / obs.length), mx };
}
// fit a, b
let a = 0.85, b = 0.49;
for (let round = 0; round < 120; round++) {
  for (const which of [0, 1]) {
    let lo = (which ? b : a) - 0.15, hi = (which ? b : a) + 0.15;
    for (let it = 0; it < 70; it++) {
      const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
      const e1 = which ? evalModel(a, m1).rms : evalModel(m1, b).rms;
      const e2 = which ? evalModel(a, m2).rms : evalModel(m2, b).rms;
      if (e1 < e2) hi = m2; else lo = m1;
    }
    if (which) b = (lo + hi) / 2; else a = (lo + hi) / 2;
  }
}
const r = evalModel(a, b);
console.log('\n=== PHYSICAL MODEL (ratio comes from the vergence curve, not fitted) ===');
console.log(`  TCA_x = ${a.toFixed(5)} * ANT_x + ${b.toFixed(5)}`);
console.log(`  TCA_y = ${a.toFixed(5)} * ANT_y`);
console.log(`  residual rms = ${r.rms.toFixed(5)} D   max = ${r.mx.toFixed(4)} D`);

// effective ratio implied by the physical model, per cylinder, for the baseline eye
const fn0 = eyeFn(23.5, 44, 119.3); const Pb = Math.round(fn0.P0 * 2) / 2;
console.log(`\n  effective ratio c/deliveredCyl for AL23.5 K44 A119.3 (P=${Pb}):`);
for (const c of [1, 1.5, 2.25, 3, 4.5, 6])
  console.log(`    c=${String(c).padStart(4)} -> delivered ${deliveredCyl(fn0, Pb, c).toFixed(4)}  ratio ${(c / deliveredCyl(fn0, Pb, c)).toFixed(4)}`);

// residual pattern by anterior magnitude
console.log('\n  rms by anterior astigmatism magnitude:');
for (const m of [...new Set(obs.map(o => o.m))].sort((x, y) => x - y)) {
  const s = obs.filter(o => o.m === m);
  let sse = 0, mx = 0;
  for (const o of s) {
    const tx = a * o.ant[0] + b, ty = a * o.ant[1];
    const e = Math.hypot(tx - o.dc * o.u[0] - o.R[0], ty - o.dc * o.u[1] - o.R[1]);
    sse += e * e; mx = Math.max(mx, e);
  }
  console.log(`    m=${m}: rms ${Math.sqrt(sse / s.length).toFixed(4)}  max ${mx.toFixed(4)}`);
}
