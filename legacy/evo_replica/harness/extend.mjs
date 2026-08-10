import fs from 'fs';
import * as E from './evo2.mjs';

const TARGETS = ['-3', '0', '3'];
const ALs = [20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32];
const Ks = [34, 36, 38, 40, 42, 44, 46, 48, 50];
const AS = ['110.30', '112.30', '115.30', '117.30', '119.30', '121.30', '123.30', '125.00'];

const existing = JSON.parse(fs.readFileSync('gridA.json', 'utf8'));
const have = new Set(existing.map(e => `${e.AL}|${e.K}|${e.A}`));

const jobs = [], meta = [];
for (const AL of ALs) for (const K of Ks) for (const A of AS) {
  if (have.has(`${AL}|${K}|${+A}`)) continue;
  for (const t of TARGETS) {
    jobs.push({
      txtAL: AL.toFixed(2), txtK1: K.toFixed(2), TxtK1Axis: '180',
      txtK2: K.toFixed(2), TxtK2Axis: '90',
      txtACD: '3.20', txtLT: '4.50', txtCCT: '550', txtAConstant: A, txtRefraction: t,
    });
    meta.push({ AL, K, A: +A });
  }
}
console.log(`existing nodes ${existing.length}; new nodes ${jobs.length / 3}; calls ${jobs.length}`);
const res = await E.calcMany(jobs, { concurrency: 3, onProgress: (d, t) => d % 100 === 0 && console.log(`   ${d}/${t}`) });

const byEye = new Map();
for (let i = 0; i < jobs.length; i++) {
  const m = meta[i], key = `${m.AL}|${m.K}|${m.A}`;
  if (!byEye.has(key)) byEye.set(key, { AL: m.AL, K: m.K, A: m.A, pairs: new Map() });
  const r = res[i];
  if (r && r.ok) for (const [P, R] of r.pairs) byEye.get(key).pairs.set(P, R);
}
const add = [...byEye.values()].map(e => ({ AL: e.AL, K: e.K, A: e.A, pairs: [...e.pairs.entries()].sort((a, b) => a[0] - b[0]) }));
fs.writeFileSync('gridFull.json', JSON.stringify([...existing, ...add]));
E.saveCache();
console.log('new eyes with >=5 pairs:', add.filter(a => a.pairs.length >= 5).length, 'of', add.length);
console.log('wrote gridFull.json (total ' + (existing.length + add.length) + ' nodes); cache =', E.cacheSize());
