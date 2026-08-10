import fs from 'fs';
import { eyeFn } from './eye2.mjs';

const R = JSON.parse(fs.readFileSync('refine.json', 'utf8'));

/** Solve (dAL, dA) so the model at (AL+dAL, K, A+dA) matches the measured (P0, s0). */
function solve(AL, K, A, P0t, s0t) {
  let dAL = 0, dA = 0;
  for (let it = 0; it < 60; it++) {
    const f = eyeFn(AL + dAL, K, A + dA);
    const r = [f.P0 - P0t, f.s0 - s0t];
    if (Math.abs(r[0]) < 1e-9 && Math.abs(r[1]) < 1e-11) break;
    const h1 = 0.01, h2 = 0.01;
    const fa = eyeFn(AL + dAL + h1, K, A + dA), fb = eyeFn(AL + dAL, K, A + dA + h2);
    const J = [[(fa.P0 - f.P0) / h1, (fb.P0 - f.P0) / h2], [(fa.s0 - f.s0) / h1, (fb.s0 - f.s0) / h2]];
    const det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
    if (!isFinite(det) || Math.abs(det) < 1e-12) break;
    dAL -= (r[0] * J[1][1] - J[0][1] * r[1]) / det;
    dA -= (J[0][0] * r[1] - r[0] * J[1][0]) / det;
    if (!isFinite(dAL) || !isFinite(dA)) return null;
  }
  return { dAL, dA };
}

const EYES = [[22, 41], [23.5, 43.5], [25, 46]];
function analyse(name, key, ref, scale) {
  console.log(`\n=== ${name} ===`);
  const pts = [];
  for (const [AL, K] of EYES) {
    const rows = R[name].filter(r => r.AL === AL && r.K === K);
    for (const r of rows) {
      const s = solve(AL, K, 119.3, r.P0, r.s0);
      if (!s) continue;
      pts.push({ AL, K, v: r.v, dAL: s.dAL, dA: s.dA });
    }
  }
  // print per eye
  for (const [AL, K] of EYES) {
    const s = pts.filter(p => p.AL === AL && p.K === K).sort((a, b) => a.v - b.v);
    console.log(`  AL${AL} K${K}: ` + s.map(p => `${p.v}:(dAL ${p.dAL.toFixed(4)}, dA ${p.dA.toFixed(4)})`).join('  '));
  }
  // linear fit through the reference point
  let sxx = 0, sxy1 = 0, sxy2 = 0;
  for (const p of pts) { const x = (p.v - ref) / scale; sxx += x * x; sxy1 += x * p.dAL; sxy2 += x * p.dA; }
  const cAL = sxy1 / sxx, cA = sxy2 / sxx;
  let e1 = 0, e2 = 0;
  for (const p of pts) { const x = (p.v - ref) / scale; e1 = Math.max(e1, Math.abs(cAL * x - p.dAL)); e2 = Math.max(e2, Math.abs(cA * x - p.dA)); }
  console.log(`  => dAL = ${cAL.toFixed(6)} per ${scale} unit(s)   (max dev ${e1.toFixed(4)})`);
  console.log(`  => dA  = ${cA.toFixed(6)} per ${scale} unit(s)   (max dev ${e2.toFixed(4)})`);
  return { cAL, cA };
}

// sanity: ACD should come out as pure A shift of 0.8 per mm and zero AL shift
const acd = analyse('ACD', 'txtACD', 3.2, 1);
const lt = analyse('LT', 'txtLT', 4.5, 1);
const cct = analyse('CCT', 'txtCCT', 550, 1);

// A-constant self-check: solving the A sweep should give dA = v-119.3 and dAL = 0
console.log('\n=== A-CONSTANT self-check (should recover dA = A-119.3, dAL = 0) ===');
for (const [AL, K] of EYES) {
  const rows = R['A-CONSTANT'].filter(r => r.AL === AL && r.K === K);
  const out = [];
  for (const r of rows) {
    const s = solve(AL, K, 119.3, r.P0, r.s0);
    if (s) out.push(`${r.v}:(${s.dA.toFixed(3)}, ${s.dAL.toFixed(3)})`);
  }
  console.log(`  AL${AL} K${K}: ` + out.join(' '));
}

const params = {
  acdRef: 3.2, acdPerMm: acd.cA, acdPerMm_AL: acd.cAL,
  ltDefault: 4.5, ltPerMm_A: lt.cA, ltPerMm_AL: lt.cAL,
  cctDefault: 550, cctPerUm_A: cct.cA, cctPerUm_AL: cct.cAL,
};
fs.writeFileSync('channels.json', JSON.stringify(params, null, 1));
console.log('\nwrote channels.json:', JSON.stringify(params, null, 1));
