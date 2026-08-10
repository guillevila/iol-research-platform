import fs from 'fs';
const P = JSON.parse(fs.readFileSync('post.json', 'utf8'));
const D2R = Math.PI / 180;
const antVec = (m, th) => [m * Math.cos(2 * th * D2R), m * Math.sin(2 * th * D2R)];
const uOf = ax => [Math.cos(2 * ax * D2R), Math.sin(2 * ax * D2R)];

// ---- what does "Anterior" mode actually return? ----
console.log('=== "Anterior" mode: TCA vs entered anterior astigmatism ===');
for (const r of P.posterior.filter(r => r.mode === 'Anterior' && r.tcaX != null && [1, 2, 3].includes(r.m) && [0, 45, 90].includes(r.th)))
  console.log(`  ant ${r.m} @ ${String(r.th).padStart(3)}  ->  TCA ${r.tcaMag.toFixed(4)} @ ${r.tcaAxis.toFixed(1)}   (expected ${r.m} @ ${r.th})`);

/**
 * Joint fit over ALL rows of ALL probes of one eye.
 * Unknowns: ratio (shared), and the posterior regression a (slope) and b (x-intercept).
 *   TCA   = (a*ANTx + b, a*ANTy)
 *   resid = TCA - (toric/ratio) * u        u = unit double-angle vector at the reported IOL axis
 */
function fitJoint(rows) {
  const obs = [];
  for (const r of rows) {
    if (!r.torics) continue;
    const ant = antVec(r.m, r.th);
    for (const t of r.torics) {
      if (t.resiCyl == null || t.resiAxis == null || t.iolAxis == null) continue;
      const R = antVec(Math.abs(t.resiCyl), t.resiAxis + 90);   // steep meridian of the residual
      obs.push({ ant, t: t.toric, u: uOf(t.iolAxis), R });
    }
  }
  const err = ([a, b, invRatio]) => {
    let s = 0;
    for (const o of obs) {
      const tx = a * o.ant[0] + b, ty = a * o.ant[1];
      const px = tx - o.t * invRatio * o.u[0], py = ty - o.t * invRatio * o.u[1];
      s += (px - o.R[0]) ** 2 + (py - o.R[1]) ** 2;
    }
    return s;
  };
  // coordinate descent (well-conditioned, 3 params)
  let x = [0.85, 0.48, 1 / 1.59];
  const step = [0.2, 0.2, 0.05];
  for (let round = 0; round < 200; round++)
    for (let i = 0; i < 3; i++) {
      let lo = x[i] - step[i], hi = x[i] + step[i];
      for (let it = 0; it < 80; it++) {
        const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
        const a1 = x.slice(); a1[i] = m1; const a2 = x.slice(); a2[i] = m2;
        if (err(a1) < err(a2)) hi = m2; else lo = m1;
      }
      x[i] = (lo + hi) / 2;
    }
  const n = obs.length * 2;
  return { a: x[0], b: x[1], ratio: 1 / x[2], rms: Math.sqrt(err(x) / n), n: obs.length };
}

const post = P.posterior.filter(r => r.mode === 'Posterior');
const J = fitJoint(post);
console.log('\n=== JOINT FIT (one eye: AL 23.5, K 43/45-ish, ACD 3.2, A 119.3) ===');
console.log(`  observations (toric rows): ${J.n}`);
console.log(`  TCA_x = ${J.a.toFixed(5)} * ANT_x + ${J.b.toFixed(5)}`);
console.log(`  TCA_y = ${J.a.toFixed(5)} * ANT_y`);
console.log(`  toric ratio = ${J.ratio.toFixed(5)}`);
console.log(`  residual rms = ${J.rms.toFixed(5)} D  (quantisation floor ~0.006)`);

// per-probe residual check
let worst = [];
for (const r of post) {
  if (!r.torics) continue;
  const ant = antVec(r.m, r.th);
  const tx = J.a * ant[0] + J.b, ty = J.a * ant[1];
  for (const t of r.torics) {
    if (t.resiCyl == null) continue;
    const u = uOf(t.iolAxis), R = antVec(Math.abs(t.resiCyl), t.resiAxis + 90);
    const px = tx - t.toric / J.ratio * u[0], py = ty - t.toric / J.ratio * u[1];
    worst.push({ m: r.m, th: r.th, t: t.toric, e: Math.hypot(px - R[0], py - R[1]) });
  }
}
worst.sort((a, b) => b.e - a.e);
console.log('  worst rows:', worst.slice(0, 6).map(w => `m${w.m}@${w.th}/cyl${w.t}:${w.e.toFixed(3)}`).join('  '));

// ---- compare fitted ratio with 1/|s0| from the spherical engine ----
const { ALs, Ks, AS, tables } = JSON.parse(fs.readFileSync('tables.json', 'utf8'));
const I = await import('./interp.mjs');
function bicubic(M, AL, K) {
  const tk = (K - Ks[0]) / (Ks[1] - Ks[0]), ta = (AL - ALs[0]) / (ALs[1] - ALs[0]);
  return I.cubic1(M.map(row => I.cubic1(row, tk)), ta);
}
function s0At(AL, K, A) {
  const lo = tables[AS[0]], hi = tables[AS[1]];
  const f = (A - AS[0]) / (AS[1] - AS[0]);
  return bicubic(lo.s0, AL, K) * (1 - f) + bicubic(hi.s0, AL, K) * f;
}
console.log(`\n  1/|s0| from the spherical model at AL 23.5, K 44, A 119.3 = ${(1 / Math.abs(s0At(23.5, 44, 119.3))).toFixed(5)}`);
console.log(`  fitted toric ratio                                        = ${J.ratio.toFixed(5)}`);

console.log('\n=== ratio measured vs 1/|s0| across the AL/K/A sweep ===');
const rows = P.ratio.filter(r => r.ratio != null);
let de = [];
for (const r of rows) {
  const pred = 1 / Math.abs(s0At(r.AL, r.K, r.A));
  de.push({ ...r, pred, d: r.ratio - pred });
}
for (const A of [117.3, 119.3, 121.3]) {
  const s = de.filter(r => r.A === A);
  const md = s.reduce((t, r) => t + r.d, 0) / s.length;
  console.log(`  A=${A}: mean(measured-predicted) = ${md.toFixed(4)}   max|diff| = ${Math.max(...s.map(r => Math.abs(r.d))).toFixed(4)}`);
}
