import fs from 'fs';
import * as E from './evo2.mjs';

const BASE = 'https://www.evoiolcalculator.com/toric.aspx';
const g = await fetch(BASE, { headers: { 'User-Agent': 'Mozilla/5.0' } });
const html = await g.text();

function options(id) {
  const m = html.match(new RegExp(`<select[^>]*id="${id}"[\\s\\S]*?</select>`));
  if (!m) return [];
  return [...m[0].matchAll(/<option[^>]*value="([^"]*)"[^>]*>([\s\S]*?)<\/option>/g)]
    .map(x => ({ value: x[1], label: x[2].replace(/&amp;/g, '&').trim() }));
}
const models = options('DropDownToric');
const kidx = options('DropDownKIndex');
const lasik = options('DropDownLASIK');
const biom = options('DropDownListPK');
const argos = options('DropDownArgos');
console.log('Toric models (%d):', models.length);
models.forEach(m => console.log(`   value="${m.value}"  label="${m.label}"`));
console.log('K index:', kidx.map(o => o.value).join(', '));
console.log('LASIK:', lasik.map(o => `${o.value}=${o.label}`).join(', '));
console.log('Biometer:', biom.map(o => o.value).join(' | '));
console.log('Argos:', argos.map(o => `${o.value}=${o.label}`).join(', '));
fs.writeFileSync('models.json', JSON.stringify({ models, kidx, lasik, biom, argos }, null, 1));

// --- enumerate available cylinders per model -------------------------------
const EYE = {
  txtAL: '23.50', TxtK1Axis: '180', TxtK2Axis: '90',
  txtACD: '3.20', txtLT: '4.50', txtCCT: '550', txtAConstant: '119.30', txtRefraction: '0',
};
const cylSweep = [];
for (let d = 0.50; d <= 9.01; d += 0.75) cylSweep.push(d);

const jobs = [];
for (const m of models)
  for (const d of cylSweep)
    jobs.push({ ...EYE, txtK1: '43.00', txtK2: (43 + d).toFixed(2), DropDownToric: m.value });

console.log(`\nprobing ${jobs.length} combinations for cylinder tables ...`);
const res = await E.calcMany(jobs, {
  concurrency: 3,
  onProgress: (d, t) => { if (d % 100 === 0) console.log(`   ${d}/${t}`); },
});

const table = {};
jobs.forEach((j, i) => {
  const r = res[i];
  if (!r || !r.ok) return;
  const m = j.DropDownToric;
  table[m] ??= { cyls: new Set(), aConst: r.aConst, maxSeen: 0, rows: 0 };
  for (const t of r.torics) if (t.toric != null) table[m].cyls.add(t.toric);
  table[m].rows = Math.max(table[m].rows, r.torics.length);
});
const outT = {};
for (const [m, v] of Object.entries(table)) {
  outT[m] = { cyls: [...v.cyls].sort((a, b) => a - b), maxRows: v.rows };
  console.log(`${m.padEnd(18)} rows<=${v.rows}  cyls: ${outT[m].cyls.join(', ')}`);
}
fs.writeFileSync('cyltable.json', JSON.stringify(outT, null, 1));
E.saveCache();
console.log('\nwrote models.json + cyltable.json; cache =', E.cacheSize());
