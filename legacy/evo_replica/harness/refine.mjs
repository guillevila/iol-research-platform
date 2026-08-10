import fs from 'fs';
import * as E from './evo2.mjs';
import { KcOf, elpOf } from './interp.mjs';

const TARGETS = ['-3', '0', '3'];

function fitMobius(pairs) {
  const A = [], y = [];
  for (const [P, R] of pairs) { A.push([P, 1, -R]); y.push(R * P); }
  const n = 3;
  const AtA = Array.from({ length: n }, () => new Array(n).fill(0)), Aty = new Array(n).fill(0);
  for (let r = 0; r < A.length; r++)
    for (let i = 0; i < n; i++) { Aty[i] += A[r][i] * y[r]; for (let j = 0; j < n; j++) AtA[i][j] += A[r][i] * A[r][j]; }
  for (let i = 0; i < n; i++) {
    let p = i; for (let k = i + 1; k < n; k++) if (Math.abs(AtA[k][i]) > Math.abs(AtA[p][i])) p = k;
    [AtA[i], AtA[p]] = [AtA[p], AtA[i]]; [Aty[i], Aty[p]] = [Aty[p], Aty[i]];
    for (let k = i + 1; k < n; k++) { const f = AtA[k][i] / AtA[i][i]; for (let j = i; j < n; j++) AtA[k][j] -= f * AtA[i][j]; Aty[k] -= f * Aty[i]; }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) { let s = Aty[i]; for (let j = i + 1; j < n; j++) s -= AtA[i][j] * x[j]; x[i] = s / AtA[i][i]; }
  return x;
}
export function charOf(pairs) {
  if (pairs.length < 5) return null;
  const [a, b, d] = fitMobius(pairs);
  const P0 = -b / a, s0 = (a * d - b) / (P0 + d) ** 2, kap = -2 * (a * d - b) / (P0 + d) ** 3;
  let mx = 0;
  for (const [P, R] of pairs) mx = Math.max(mx, Math.abs((a * P + b) / (P + d) - R));
  return { P0, s0, kap, mx };
}

/** Characterise a list of eyes (3 target sweeps each). */
export async function charMany(eyes, concurrency = 3) {
  const jobs = [];
  for (const e of eyes) for (const t of TARGETS) jobs.push({ ...e, txtRefraction: t });
  const rs = await E.calcMany(jobs, { concurrency });
  const out = [];
  for (let i = 0; i < eyes.length; i++) {
    const m = new Map();
    for (let k = 0; k < TARGETS.length; k++) {
      const r = rs[i * TARGETS.length + k];
      if (r && r.ok) for (const [P, R] of r.pairs) m.set(P, R);
    }
    out.push(charOf([...m.entries()].sort((x, y) => x[0] - y[0])));
  }
  return out;
}

const EYES = [
  { txtAL: '22.00', txtK1: '41.00', txtK2: '41.00' },
  { txtAL: '23.50', txtK1: '43.50', txtK2: '43.50' },
  { txtAL: '25.00', txtK1: '46.00', txtK2: '46.00' },
];
const FIX = { TxtK1Axis: '180', TxtK2Axis: '90', txtACD: '3.20', txtLT: '4.50', txtCCT: '550', txtAConstant: '119.30' };
const report = {};

async function sweep(name, key, values, fmt = v => String(v)) {
  const eyes = [], meta = [];
  for (const e of EYES) for (const v of values) { eyes.push({ ...FIX, ...e, [key]: fmt(v) }); meta.push({ e, v }); }
  const cs = await charMany(eyes);
  const rows = [];
  console.log(`\n=== ${name} ===`);
  for (let i = 0; i < cs.length; i++) {
    const c = cs[i]; if (!c) continue;
    const { e, v } = meta[i];
    const AL = parseFloat(e.txtAL), K = parseFloat(e.txtK1);
    const ELP = elpOf(AL, KcOf(K), c.P0);
    rows.push({ AL, K, v, P0: c.P0, s0: c.s0, kap: c.kap, ELP, mx: c.mx });
  }
  for (const e of EYES) {
    const AL = parseFloat(e.txtAL), K = parseFloat(e.txtK1);
    const sub = rows.filter(r => r.AL === AL && r.K === K);
    console.log(`  AL${AL} K${K}:`);
    for (const r of sub)
      console.log(`     ${key}=${String(r.v).padStart(7)}  P0=${r.P0.toFixed(4)}  ELP=${r.ELP.toFixed(4)}  s0=${r.s0.toFixed(5)}  fitmax=${r.mx.toFixed(4)}`);
  }
  report[name] = rows;
  E.saveCache();
}

await sweep('A-CONSTANT', 'txtAConstant', [112, 114, 116, 118, 119.3, 121, 123, 125], v => v.toFixed(2));
await sweep('ACD', 'txtACD', [2.4, 2.8, 3.2, 3.6, 4.0, 4.4], v => v.toFixed(2));
await sweep('LT', 'txtLT', [3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0], v => v.toFixed(2));
await sweep('CCT', 'txtCCT', [450, 500, 550, 600, 650, 700], v => String(v));
fs.writeFileSync('refine.json', JSON.stringify(report, null, 1));
E.saveCache();
console.log('\nwrote refine.json; cache =', E.cacheSize());
