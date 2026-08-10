import fs from 'fs';
import * as E from './evo2.mjs';

// Astigmatic eyes spanning the FULL extended domain, to constrain the corneal model
const ALs = [20, 22, 24, 26, 28, 30, 32];
const Ks = [34, 38, 42, 46, 50];
const MAGS = [1.0, 2.5];
const MERS = [0, 45, 90, 135];
const jobs = [], meta = [];
for (const AL of ALs) for (const K of Ks) for (const m of MAGS) for (const th of MERS) {
  const steep = th === 0 ? 180 : th, flat = ((steep + 90) % 180) === 0 ? 180 : (steep + 90) % 180;
  jobs.push({
    txtAL: AL.toFixed(2), txtK1: K.toFixed(2), TxtK1Axis: String(flat),
    txtK2: (K + m).toFixed(2), TxtK2Axis: String(steep),
    txtACD: '3.20', txtLT: '4.50', txtCCT: '550', txtRefraction: '0', txtAConstant: '119.30',
  });
  meta.push({ AL, K, m, th });
}
console.log(`toric coverage sweep: ${jobs.length} eyes`);
const res = await E.calcMany(jobs, { concurrency: 3, onProgress: (d, t) => d % 50 === 0 && console.log(`   ${d}/${t}`) });
E.saveCache();
console.log('ok:', res.filter(r => r && r.ok).length, '/', res.length);
