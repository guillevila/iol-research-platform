import fs from 'fs';
import * as E from './evo2.mjs';

const MODELS = JSON.parse(fs.readFileSync('models.json', 'utf8')).models.map(m => m.value);
const SERIES = [
  { tag: 'K43.5', K: 43.5, A: '119.30', ALs: [19, 19.5, 20, 20.5, 21, 21.5, 22, 22.5, 23, 24, 25, 26.5, 28] },
  { tag: 'K47', K: 47, A: '119.30', ALs: [19, 20, 21, 22, 23, 25] },       // same AL, lower power
  { tag: 'K40', K: 40, A: '117.30', ALs: [19, 20, 21, 22, 23, 25] },       // higher power at given AL
];

const jobs = [], meta = [];
for (const s of SERIES) for (const AL of s.ALs) for (const m of MODELS) {
  jobs.push({
    txtAL: AL.toFixed(2), txtK1: s.K.toFixed(2), TxtK1Axis: '180', txtK2: s.K.toFixed(2), TxtK2Axis: '90',
    txtACD: '3.20', txtLT: '4.50', txtCCT: '550', txtRefraction: '0', txtAConstant: s.A, DropDownToric: m,
  });
  meta.push({ tag: s.tag, AL, K: s.K, A: +s.A, m });
}
console.log(`probing ${jobs.length} model/eye combinations ...`);
const res = await E.calcMany(jobs, { concurrency: 3, onProgress: (d, t) => d % 100 === 0 && console.log(`   ${d}/${t}`) });
E.saveCache();

// index results
const R = new Map();
for (let i = 0; i < jobs.length; i++) {
  const k = `${meta[i].tag}|${meta[i].AL}|${meta[i].m}`;
  if (res[i] && res[i].ok) R.set(k, new Map(res[i].pairs));
}
const out = [];
for (const s of SERIES) for (const AL of s.ALs) {
  const base = R.get(`${s.tag}|${AL}|Posterior`);
  if (!base) continue;
  for (const m of MODELS) {
    if (m === 'Posterior') continue;
    const cur = R.get(`${s.tag}|${AL}|${m}`);
    if (!cur) continue;
    // mean signed offset at shared IOL powers; plus the mean power itself
    let sum = 0, n = 0, pw = 0;
    for (const [P, r] of cur) if (base.has(P)) { sum += r - base.get(P); n++; pw += P; }
    if (n) out.push({ tag: s.tag, AL, K: s.K, A: +s.A, model: m, dRef: sum / n, power: pw / n, n });
  }
}
fs.writeFileSync('modeloffset.json', JSON.stringify(out, null, 1));

console.log('\nsigned refraction offset vs generic Posterior mode, by mean IOL power (series K43.5):');
const showModels = ['Tecnis', 'MX60T', 'MX60ET', 'SN6ATx', '709M/MP', 'EMV', 'Vivity', 'Aspire', 'Kowa', 'Simedice'];
const ALs = SERIES[0].ALs;
console.log('model       ' + ALs.map(a => ('AL' + a).padStart(7)).join(''));
for (const m of showModels) {
  const cells = ALs.map(AL => {
    const r = out.find(o => o.tag === 'K43.5' && o.AL === AL && o.model === m);
    return r ? r.dRef.toFixed(2).padStart(7) : '   -   ';
  });
  console.log(m.padEnd(12) + cells.join(''));
}
console.log('\npower dependence check (Tecnis & MX60T): offset vs mean IOL power across all three series');
for (const m of ['Tecnis', 'MX60T']) {
  const s = out.filter(o => o.model === m).sort((a, b) => b.power - a.power).slice(0, 18);
  console.log('  ' + m + ': ' + s.map(o => `${o.power.toFixed(0)}D/${o.tag}:${o.dRef.toFixed(2)}`).join('  '));
}
console.log('\nwrote modeloffset.json; cache =', E.cacheSize());
