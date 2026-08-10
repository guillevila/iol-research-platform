import fs from 'fs';
import * as E from './evo2.mjs';

const TARGETS = ['-3', '0', '3'];
const ALs = [20, 21, 22, 23, 24, 25, 26, 27, 28];
const Ks = [38, 40, 42, 44, 46, 48, 50];
const NEW_AS = ['112.30', '115.30', '119.30', '123.30'];

const jobs = [], meta = [];
for (const AL of ALs) for (const K of Ks) for (const A of NEW_AS) for (const t of TARGETS) {
  jobs.push({
    txtAL: AL.toFixed(2), txtK1: K.toFixed(2), TxtK1Axis: '180',
    txtK2: K.toFixed(2), TxtK2Axis: '90',
    txtACD: '3.20', txtLT: '4.50', txtCCT: '550', txtAConstant: A, txtRefraction: t,
  });
  meta.push({ AL, K, A: +A, t });
}
console.log(`sampling ${jobs.length} calls (${ALs.length}x${Ks.length}x${NEW_AS.length} eyes x ${TARGETS.length} targets) ...`);
const res = await E.calcMany(jobs, { concurrency: 3, onProgress: (d, t) => d % 100 === 0 && console.log(`   ${d}/${t}`) });

const byEye = new Map();
for (let i = 0; i < jobs.length; i++) {
  const m = meta[i], key = `${m.AL}|${m.K}|${m.A}`;
  if (!byEye.has(key)) byEye.set(key, { AL: m.AL, K: m.K, A: m.A, pairs: new Map() });
  const r = res[i];
  if (r && r.ok) for (const [Pw, R] of r.pairs) byEye.get(key).pairs.set(Pw, R);
}
const out = [...byEye.values()].map(e => ({ AL: e.AL, K: e.K, A: e.A, pairs: [...e.pairs.entries()].sort((a, b) => a[0] - b[0]) }));
const old = JSON.parse(fs.readFileSync('grid.json', 'utf8'));
fs.writeFileSync('gridA.json', JSON.stringify([...old, ...out]));
E.saveCache();
console.log('new eyes:', out.length, ' with >=5 pairs:', out.filter(o => o.pairs.length >= 5).length);
console.log('wrote gridA.json (total eyes ' + (old.length + out.length) + '); cache =', E.cacheSize());
