import fs from 'fs';
import * as E from './evo2.mjs';
import { extract, astigEye, BASE, vec, mag, meridian } from './toric2.mjs';

const out = {};

// ---------------------------------------------------------------- 1. posterior cornea
const MAGS = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0];
const MERS = [0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165];
const modes = ['Posterior', 'Anterior'];
const jobs1 = [], meta1 = [];
for (const mode of modes)
  for (const m of MAGS)
    for (const th of MERS) {
      jobs1.push({ ...astigEye(BASE, 43.0, m, th), DropDownToric: mode });
      meta1.push({ mode, m, th });
    }
console.log(`[1] posterior-cornea sweep: ${jobs1.length} eyes ...`);
const r1 = await E.calcMany(jobs1, { concurrency: 3, onProgress: (d, t) => d % 50 === 0 && console.log(`    ${d}/${t}`) });
const rows1 = [];
for (let i = 0; i < jobs1.length; i++) {
  const r = r1[i]; if (!r || !r.ok) { rows1.push({ ...meta1[i], err: r && r.errs }); continue; }
  const ex = extract(r.torics);
  rows1.push({ ...meta1[i], ...(ex ? { ratio: ex.ratio, tcaMag: ex.tcaMag, tcaAxis: ex.tcaAxis, tcaX: ex.TCA[0], tcaY: ex.TCA[1], sameAxis: ex.sameAxis, fitres: ex.fitres, n: ex.n } : { noex: true }), iolAxis: r.recAxis, recToric: r.recToric, torics: r.torics });
}
out.posterior = rows1;
E.saveCache();

console.log('\n  mode      antMag  antMer |  TCA mag   TCA mer   ratio    fitres');
for (const r of rows1.filter(r => r.mode === 'Posterior' && [1.0, 2.0, 3.0].includes(r.m)))
  console.log(`  ${r.mode.padEnd(9)} ${String(r.m).padStart(5)}  ${String(r.th).padStart(5)}  |  ${r.tcaMag != null ? r.tcaMag.toFixed(4).padStart(7) : '   -   '}  ${r.tcaAxis != null ? r.tcaAxis.toFixed(1).padStart(6) : '  -   '}  ${r.ratio != null ? r.ratio.toFixed(4) : '  -  '}   ${r.fitres != null ? r.fitres.toFixed(4) : ''}`);

// ---------------------------------------------------------------- 2. toric ratio vs eye
const jobs2 = [], meta2 = [];
for (const AL of [21, 22, 23, 24, 25, 26, 27])
  for (const K of [40, 42, 44, 46, 48])
    for (const A of ['117.30', '119.30', '121.30']) {
      jobs2.push({ ...astigEye({ ...BASE, txtAL: AL.toFixed(2), txtAConstant: A }, K, 2.0, 90) });
      meta2.push({ AL, K, A: +A });
    }
console.log(`\n[2] toric-ratio sweep: ${jobs2.length} eyes ...`);
const r2 = await E.calcMany(jobs2, { concurrency: 3 });
const rows2 = [];
for (let i = 0; i < jobs2.length; i++) {
  const r = r2[i]; if (!r || !r.ok) { rows2.push({ ...meta2[i], err: true }); continue; }
  const ex = extract(r.torics);
  rows2.push({ ...meta2[i], ...(ex ? { ratio: ex.ratio, tcaMag: ex.tcaMag, fitres: ex.fitres } : { noex: true }), baseIOL: r.baseIOL });
}
out.ratio = rows2;
E.saveCache();
console.log('  AL   K    A      ratio    tcaMag   baseIOL');
for (const r of rows2.filter(r => r.A === 119.3))
  console.log(`  ${String(r.AL).padStart(2)}  ${r.K}  ${r.A}  ${r.ratio != null ? r.ratio.toFixed(4).padStart(7) : '   -   '}  ${r.tcaMag != null ? r.tcaMag.toFixed(4) : ' - '}   ${r.baseIOL}`);

// ---------------------------------------------------------------- 3. SIA
const jobs3 = [], meta3 = [];
for (const s of ['0', '0.10', '0.25', '0.50', '1.00'])
  for (const ax of ['0', '45', '90', '135']) {
    jobs3.push({ ...astigEye(BASE, 43.0, 2.0, 90), TxtSIA: s, TxtSIAaxis: ax });
    meta3.push({ sia: +s, ax: +ax });
  }
console.log(`\n[3] SIA sweep: ${jobs3.length} eyes ...`);
const r3 = await E.calcMany(jobs3, { concurrency: 3 });
const rows3 = [];
for (let i = 0; i < jobs3.length; i++) {
  const r = r3[i]; if (!r || !r.ok) { rows3.push({ ...meta3[i], err: true }); continue; }
  const ex = extract(r.torics);
  rows3.push({ ...meta3[i], ...(ex ? { ratio: ex.ratio, tcaMag: ex.tcaMag, tcaAxis: ex.tcaAxis, tcaX: ex.TCA[0], tcaY: ex.TCA[1] } : {}), iolAxis: r.recAxis });
}
out.sia = rows3;
console.log('  SIA   axis |  TCA mag  TCA mer  IOL axis');
for (const r of rows3)
  console.log(`  ${String(r.sia).padStart(4)}  ${String(r.ax).padStart(4)} |  ${r.tcaMag != null ? r.tcaMag.toFixed(4) : '  -   '}   ${r.tcaAxis != null ? r.tcaAxis.toFixed(1).padStart(5) : '  -  '}    ${r.iolAxis}`);

// ---------------------------------------------------------------- 4. K index
const jobs4 = [], meta4 = [];
for (const ki of ['1.3375', '1.3315', '1.332'])
  for (const m of [1.0, 2.0, 3.0]) { jobs4.push({ ...astigEye(BASE, 43.0, m, 90), DropDownKIndex: ki }); meta4.push({ ki, m }); }
console.log(`\n[4] K-index sweep ...`);
const r4 = await E.calcMany(jobs4, { concurrency: 3 });
const rows4 = [];
for (let i = 0; i < jobs4.length; i++) {
  const r = r4[i]; if (!r || !r.ok) { rows4.push({ ...meta4[i], err: true }); continue; }
  const ex = extract(r.torics);
  rows4.push({ ...meta4[i], ...(ex ? { ratio: ex.ratio, tcaMag: ex.tcaMag } : {}), baseIOL: r.baseIOL, pairs0: r.pairs[0] });
}
out.kindex = rows4;
for (const r of rows4)
  console.log(`  kindex=${r.ki} antMag=${r.m}  TCA=${r.tcaMag != null ? r.tcaMag.toFixed(4) : '-'}  ratio=${r.ratio != null ? r.ratio.toFixed(4) : '-'}  baseIOL=${r.baseIOL}`);

fs.writeFileSync('post.json', JSON.stringify(out, null, 1));
E.saveCache();
console.log('\nwrote post.json; cache =', E.cacheSize());
