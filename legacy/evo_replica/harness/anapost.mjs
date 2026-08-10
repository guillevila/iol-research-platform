import fs from 'fs';
const P = JSON.parse(fs.readFileSync('post.json', 'utf8'));
const D2R = Math.PI / 180;
const antVec = (m, th) => [m * Math.cos(2 * th * D2R), m * Math.sin(2 * th * D2R)];

// ---------- 1. does "Anterior" mode return the anterior astigmatism unchanged? ----------
console.log('=== VALIDATION: Anterior mode should return TCA == anterior astigmatism ===');
let amax = 0, an = 0;
for (const r of P.posterior.filter(r => r.mode === 'Anterior' && r.tcaX != null)) {
  const [ax, ay] = antVec(r.m, r.th);
  const e = Math.hypot(r.tcaX - ax, r.tcaY - ay);
  amax = Math.max(amax, e); an++;
}
console.log(`  n=${an}  max vector error = ${amax.toFixed(4)} D`);
console.log('  -> confirms the extraction algebra recovers exactly what EVO used.\n');

// ---------- 2. posterior-cornea regression ----------
const pts = P.posterior.filter(r => r.mode === 'Posterior' && r.tcaX != null)
  .map(r => ({ ...r, ant: antVec(r.m, r.th) }));
function lsq(X, y) {
  const n = X[0].length, A = Array.from({ length: n }, () => new Array(n).fill(0)), b = new Array(n).fill(0);
  for (let i = 0; i < X.length; i++) for (let r = 0; r < n; r++) { b[r] += X[i][r] * y[i]; for (let c = 0; c < n; c++) A[r][c] += X[i][r] * X[i][c]; }
  for (let i = 0; i < n; i++) {
    let p = i; for (let k = i + 1; k < n; k++) if (Math.abs(A[k][i]) > Math.abs(A[p][i])) p = k;
    [A[i], A[p]] = [A[p], A[i]]; [b[i], b[p]] = [b[p], b[i]];
    for (let k = i + 1; k < n; k++) { const f = A[k][i] / A[i][i]; for (let j = i; j < n; j++) A[k][j] -= f * A[i][j]; b[k] -= f * b[i]; }
  }
  const c = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) { let s = b[i]; for (let j = i + 1; j < n; j++) s -= A[i][j] * c[j]; c[i] = s / A[i][i]; }
  return c;
}
const cx = lsq(pts.map(p => [p.ant[0], 1]), pts.map(p => p.tcaX));
const cy = lsq(pts.map(p => [p.ant[1], 1]), pts.map(p => p.tcaY));
console.log('=== POSTERIOR-CORNEA REGRESSION (double-angle components) ===');
console.log(`  TCA_x = ${cx[0].toFixed(5)} * ANT_x + ${cx[1].toFixed(5)}`);
console.log(`  TCA_y = ${cy[0].toFixed(5)} * ANT_y + ${cy[1].toFixed(5)}`);
let rx = 0, ry = 0;
for (const p of pts) {
  rx = Math.max(rx, Math.abs(cx[0] * p.ant[0] + cx[1] - p.tcaX));
  ry = Math.max(ry, Math.abs(cy[0] * p.ant[1] + cy[1] - p.tcaY));
}
console.log(`  max residual: x ${rx.toFixed(4)}   y ${ry.toFixed(4)}`);

// per-magnitude view of the x channel to look for curvature
console.log('\n  ANT_x -> TCA_x  (steep at 0 deg = ATR, and at 90 deg = WTR)');
for (const th of [0, 90]) {
  const s = pts.filter(p => p.th === th).sort((a, b) => a.m - b.m);
  console.log(`   meridian ${th}:  ` + s.map(p => `${p.ant[0].toFixed(1)}->${p.tcaX.toFixed(3)}`).join('  '));
}

// ---------- 3. toric ratio vs 1/|s0| ----------
console.log('\n=== TORIC RATIO ===');
const byAL = {};
for (const r of P.ratio.filter(r => r.ratio != null)) (byAL[r.A] ??= []).push(r);
for (const A of Object.keys(byAL).sort()) {
  console.log(`  A=${A}`);
  const rs = byAL[A].sort((a, b) => a.AL - b.AL || a.K - b.K);
  for (const K of [...new Set(rs.map(r => r.K))])
    console.log(`    K${K}: ` + rs.filter(r => r.K === K).map(r => `AL${r.AL}:${r.ratio.toFixed(3)}`).join(' '));
}

// ---------- 4. SIA ----------
console.log('\n=== SIA ===');
for (const r of P.sia) {
  if (r.tcaX == null) { console.log(`  SIA ${r.sia} @ ${r.ax}: (no extraction)`); continue; }
  console.log(`  SIA ${String(r.sia).padStart(4)} @ ${String(r.ax).padStart(3)}:  TCA = ${r.tcaMag.toFixed(4)} @ ${r.tcaAxis.toFixed(1)}   (x=${r.tcaX.toFixed(4)}, y=${r.tcaY.toFixed(4)})  IOLaxis=${r.iolAxis}`);
}

// ---------- 5. K index ----------
console.log('\n=== K INDEX ===');
for (const r of P.kindex) console.log(`  index ${r.ki}  antMag ${r.m}  TCA ${r.tcaMag != null ? r.tcaMag.toFixed(4) : '-'}  baseIOL ${r.baseIOL}  firstPair ${JSON.stringify(r.pairs0)}`);
