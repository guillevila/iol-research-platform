import fs from 'fs';
import * as E from './evo2.mjs';

// Dedicated per-IOL-model campaign: same standard-domain distribution for every
// model so the model effect is isolated. Cases are persisted so the dashboard
// builder replays exactly this list against the cache.
const MODELS = JSON.parse(fs.readFileSync('models.json', 'utf8')).models.map(m => m.value);
const PER_MODEL = 14;

let seed = 20260809;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const U = (a, b) => a + (b - a) * rnd();

const cases = [];
for (const model of MODELS) {
  for (let i = 0; i < PER_MODEL; i++) {
    const al = +U(21.0, 27.0).toFixed(2);
    const k1 = +U(40.0, 47.0).toFixed(2);
    const cyl = +U(0.25, 4.00).toFixed(2);
    const ax = Math.floor(U(0, 180)); const k1a = ax === 0 ? 180 : ax;
    const k2a = ((k1a + 90) % 180) === 0 ? 180 : (k1a + 90) % 180;
    cases.push({
      txtAL: al.toFixed(2), txtK1: k1.toFixed(2), TxtK1Axis: String(k1a),
      txtK2: (k1 + cyl).toFixed(2), TxtK2Axis: String(k2a),
      txtACD: (+U(2.6, 4.2).toFixed(2)).toFixed(2), txtLT: (+U(3.6, 5.4).toFixed(2)).toFixed(2),
      txtCCT: String(Math.round(U(480, 620))),
      txtRefraction: String(+(Math.round(U(-1.5, 0.5) * 4) / 4).toFixed(2)),
      txtAConstant: (+U(117.0, 120.5).toFixed(2)).toFixed(2),
      DropDownToric: model, DropDownKIndex: '1.3375', TxtSIA: '0', TxtSIAaxis: '0',
    });
  }
}
fs.writeFileSync('permodel-cases.json', JSON.stringify(cases));
console.log(`per-model campaign: ${cases.length} cases (${MODELS.length} models x ${PER_MODEL})`);
const res = await E.calcMany(cases, { concurrency: 3, onProgress: (d, t) => d % 50 === 0 && console.log(`   ${d}/${t}`) });
E.saveCache();
console.log('ok:', res.filter(r => r && r.ok).length, '/', res.length, ' cache =', E.cacheSize());
