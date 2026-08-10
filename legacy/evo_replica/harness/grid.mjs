import * as E from './evo.mjs';
import { pairsOf } from './sens.mjs';
import fs from 'fs';

const T = ['-3', '0', '3'];
const ALs = [20, 21, 22, 23, 24, 25, 26, 27, 28];
const Ks = [38, 40, 42, 44, 46, 48, 50];
const As = ['117.30', '121.30'];

const out = [];
let done = 0, total = ALs.length * Ks.length * As.length;
for (const AL of ALs) {
  for (const K of Ks) {
    for (const A of As) {
      const eye = {
        txtAL: AL.toFixed(2), txtK1: K.toFixed(2), TxtK1Axis: '180',
        txtK2: K.toFixed(2), TxtK2Axis: '90',
        txtACD: '3.20', txtLT: '4.50', txtCCT: '550', txtAConstant: A,
      };
      let pairs = [];
      try { pairs = await pairsOf(eye, T); } catch (e) { /* skip */ }
      out.push({ AL, K, A: +A, pairs });
      done++;
      if (done % 20 === 0) { E.saveCache(); console.log(`  ${done}/${total}`); }
    }
  }
}
E.saveCache();
fs.writeFileSync('grid.json', JSON.stringify(out));
console.log('grid points:', out.length, ' with data:', out.filter(o => o.pairs.length >= 5).length);

// Defaults used when LT / CCT are left blank
const base = { txtAL: '23.50', txtK1: '43.50', TxtK1Axis: '180', txtK2: '43.50', TxtK2Axis: '90', txtACD: '3.20', txtAConstant: '119.30' };
const blank = await pairsOf({ ...base, txtLT: '', txtCCT: '' }, T);
const blankMap = new Map(blank);
console.log('\nBlank LT/CCT -> find equivalent explicit values:');
for (const LT of ['4.0', '4.2', '4.4', '4.5', '4.6', '4.63', '4.7', '4.8']) {
  const p = await pairsOf({ ...base, txtLT: LT, txtCCT: '550' }, T);
  let max = 0, n = 0;
  for (const [P, R] of p) if (blankMap.has(P)) { max = Math.max(max, Math.abs(R - blankMap.get(P))); n++; }
  console.log(`  LT=${LT} CCT=550 -> maxdiff ${max.toFixed(3)} (n=${n})`);
}
E.saveCache();
