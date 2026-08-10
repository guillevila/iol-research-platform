import fs from 'fs';
import * as F from './fit.mjs';

const grid = JSON.parse(fs.readFileSync('grid.json', 'utf8')).filter(g => g.pairs.length >= 5);
const cells = new Map();
for (const g of grid) {
  const k = `${g.AL}|${g.K}`;
  if (!cells.has(k)) cells.set(k, { AL: g.AL, K: g.K, byA: new Map() });
  cells.get(k).byA.set(g.A, g.pairs);
}
const cellList = [...cells.values()].sort((a, b) => a.AL - b.AL || a.K - b.K);
const AS = [117.3, 121.3];

/**
 * Per (AL,K) cell: shared Kc and ALe (eye properties) plus one ELP per A-constant.
 * Regularised toward the physical values so the solution sits on the physical branch
 * and varies smoothly from cell to cell.
 */
function fitCell(c, lambda = 1e-5) {
  const KcPhys = 331.5 / (337.5 / c.K);      // n = 1.3315 convention
  const ALPhys = c.AL;
  const sets = AS.map(A => c.byA.get(A)).filter(Boolean);
  const obj = x => {
    const [Kc, ALe, ...elps] = x;
    if (!(Kc > 20 && Kc < 70) || !(ALe > 15 && ALe < 35)) return 1e9;
    let s = 0;
    for (let i = 0; i < sets.length; i++) {
      if (!(elps[i] > 0.5 && elps[i] < 12)) return 1e9;
      for (const [P, R] of sets[i]) { const d = F.refOf(P, elps[i], Kc, ALe) - R; s += d * d; }
    }
    return s + lambda * ((Kc - KcPhys) ** 2 + (ALe - ALPhys) ** 2 * 10);
  };
  let best = null;
  for (const e0 of [4.5, 5.2, 6.0]) {
    const seed = [KcPhys, ALPhys, e0, e0 + 1.5];
    const r = F.nm(obj, seed, 0.01, 20000);
    if (!best || r.f < best.f) best = r;
  }
  const [Kc, ALe, ...elps] = best.x;
  let sse = 0, n = 0, maxr = 0;
  for (let i = 0; i < sets.length; i++)
    for (const [P, R] of sets[i]) {
      const d = F.refOf(P, elps[i], Kc, ALe) - R; sse += d * d; n++; maxr = Math.max(maxr, Math.abs(d));
    }
  return { AL: c.AL, K: c.K, Kc, ALe, elps, rms: Math.sqrt(sse / n), maxr, n };
}

const out = cellList.map(fitCell);
const allRms = Math.sqrt(out.reduce((s, o) => s + o.rms ** 2 * o.n, 0) / out.reduce((s, o) => s + o.n, 0));
console.log('cells:', out.length, ' overall rms:', allRms.toFixed(5),
  ' max residual:', Math.max(...out.map(o => o.maxr)).toFixed(4));
console.log('\nworst 6 cells:');
for (const o of out.slice().sort((a, b) => b.rms - a.rms).slice(0, 6))
  console.log(`  AL${o.AL} K${o.K}: rms=${o.rms.toFixed(4)} max=${o.maxr.toFixed(4)} Kc=${o.Kc.toFixed(3)} ALe=${o.ALe.toFixed(3)} ELP=${o.elps.map(e => e.toFixed(3)).join('/')}`);
console.log('\nsmoothness check (K=44 row):');
for (const o of out.filter(o => o.K === 44))
  console.log(`  AL${o.AL}: Kc=${o.Kc.toFixed(3)} ALe=${o.ALe.toFixed(3)} ELP=${o.elps.map(e => e.toFixed(3)).join('/')} rms=${o.rms.toFixed(4)}`);
fs.writeFileSync('cells.json', JSON.stringify({ AS, cells: out }, null, 1));
console.log('\nwrote cells.json');
