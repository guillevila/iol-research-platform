import fs from 'fs';

const C = JSON.parse(fs.readFileSync('cache2.json', 'utf8'));
const MODELS = JSON.parse(fs.readFileSync('models.json', 'utf8')).models.map(m => m.value);
const SERIES = [
  { K: 43.5, A: '119.30', ALs: [19, 19.5, 20, 20.5, 21, 21.5, 22, 22.5, 23, 24, 25, 26.5, 28] },
  { K: 47, A: '119.30', ALs: [19, 20, 21, 22, 23, 25] },
  { K: 40, A: '117.30', ALs: [19, 20, 21, 22, 23, 25] },
];
const key = (AL, K, A, m) => JSON.stringify({
  TextBoxName: 'T', TextBoxID: '1', TextBoxSurgeon: 'D', DropDownArgos: '0', RadioButtonRLEye: '1',
  txtAL: AL.toFixed(2), txtK1: K.toFixed(2), TxtK1Axis: '180', txtK2: K.toFixed(2), TxtK2Axis: '90',
  txtACD: '3.20', txtLT: '4.50', txtCCT: '550', txtRefraction: '0', txtAConstant: A,
  DropDownToric: m, DropDownKIndex: '1.3375', TxtSIA: '0', TxtSIAaxis: '0', DropDownLASIK: '0',
  DropDownListPK: 'IOLMaster 700', txtPK1: '', TxtPK1axis: '', txtPK2: '', TxtPK2axis: '', txtPreLASIK: '', txtPostLASIK: '',
});

// collect (power -> offset) samples per model
const per = {};
for (const m of MODELS) per[m] = new Map();
for (const s of SERIES) for (const AL of s.ALs) {
  const b = C[key(AL, s.K, s.A, 'Posterior')];
  if (!b || !b.ok) continue;
  const bm = new Map(b.pairs);
  for (const m of MODELS) {
    const c = C[key(AL, s.K, s.A, m)];
    if (!c || !c.ok) continue;
    for (const [P, r] of c.pairs) if (bm.has(P)) {
      if (!per[m].has(P)) per[m].set(P, []);
      per[m].get(P).push(r - bm.get(P));
    }
  }
}

const table = {};
let flat = 0;
for (const m of MODELS) {
  const pts = [...per[m].entries()].map(([P, a]) => [P, a.reduce((s, v) => s + v, 0) / a.length])
    .sort((x, y) => x[0] - y[0]);
  // spread check: how consistent is the offset at a given power across series?
  let spread = 0;
  for (const [P, a] of per[m]) if (a.length > 1) spread = Math.max(spread, Math.max(...a) - Math.min(...a));
  const maxAbs = Math.max(0, ...pts.map(p => Math.abs(p[1])));
  if (maxAbs < 0.005) { table[m] = []; flat++; continue; }
  // compress: keep points where the offset changes, rounded to 0.005
  table[m] = pts.map(([P, v]) => [P, Math.round(v * 200) / 200]);
  console.log(`${m.padEnd(11)} n=${pts.length}  power ${pts[0][0]}..${pts[pts.length - 1][0]}  offset ${pts[0][1].toFixed(2)}..${pts[pts.length - 1][1].toFixed(2)}  max|off| ${maxAbs.toFixed(2)}  cross-series spread ${spread.toFixed(3)}`);
}
console.log(`\nmodels with no measurable offset: ${flat}`);
fs.writeFileSync('offsets.json', JSON.stringify(table));
console.log('wrote offsets.json');
