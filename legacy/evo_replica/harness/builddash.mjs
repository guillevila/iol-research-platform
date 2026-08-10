import fs from 'fs';
import * as E from './evo2.mjs';
const ENGINE = (await import('./engine.js')).default ?? (await import('./engine.js'));

const MODELS_META = JSON.parse(fs.readFileSync('models.json', 'utf8')).models;
const MODELS = MODELS_META.map(m => m.value);
const r2 = x => Math.round(x * 100) / 100;

// ---- regenerate every campaign's case list (same seeds as the original runs) ----
function gen(mode, N, seed0) {
  let seed = seed0;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const U = (a, b) => a + (b - a) * rnd();
  const pick = a => a[Math.floor(rnd() * a.length) % a.length];
  const out = [];
  for (let i = 0; i < N; i++) {
    const LONG = mode === 'long';
    const al = +(LONG ? U(27.0, 31.5) : U(21.0, 27.0)).toFixed(2);
    const k1 = +(LONG ? U(34.0, 40.0) : U(40.0, 47.0)).toFixed(2);
    const cyl = +U(0.25, 4.00).toFixed(2);
    const ax = Math.floor(U(0, 180)); const k1a = ax === 0 ? 180 : ax;
    const k2a = ((k1a + 90) % 180) === 0 ? 180 : (k1a + 90) % 180;
    const c = {
      txtAL: al.toFixed(2), txtK1: k1.toFixed(2), TxtK1Axis: String(k1a),
      txtK2: (k1 + cyl).toFixed(2), TxtK2Axis: String(k2a),
      txtACD: (+U(2.6, 4.2).toFixed(2)).toFixed(2), txtLT: (+U(3.6, 5.4).toFixed(2)).toFixed(2),
      txtCCT: String(Math.round(U(480, 620))),
      txtRefraction: String(+(Math.round(U(-1.5, 0.5) * 4) / 4).toFixed(2)),
      txtAConstant: (+U(117.0, 120.5).toFixed(2)).toFixed(2),
      DropDownToric: 'Posterior', DropDownKIndex: '1.3375', TxtSIA: '0', TxtSIAaxis: '0',
    };
    if (mode === 'full') {
      c.DropDownToric = pick(MODELS); c.DropDownKIndex = pick(['1.3375', '1.3375', '1.3375', '1.3315', '1.332']);
      c.TxtSIA = (+U(0, 0.5).toFixed(2)).toFixed(2); c.TxtSIAaxis = String(Math.floor(U(0, 180)));
    } else if (mode === 'sia') {
      c.TxtSIA = (+U(0.05, 0.5).toFixed(2)).toFixed(2); c.TxtSIAaxis = String(Math.floor(U(0, 180)));
    } else if (mode === 'kidx') {
      c.DropDownKIndex = pick(['1.3315', '1.332']);
    } else if (mode === 'models') {
      c.DropDownToric = pick(MODELS);
    }
    out.push(c);
  }
  return out;
}

const CAMPAIGNS = [
  ['clean', gen('clean', 200, 999111)],
  ['long', gen('long', 150, 24681357)],
  ['full', gen('full', 250, 888222)],
  ['models', gen('models', 100, 313131)],
  ['kidx', gen('kidx', 100, 515151)],
  ['sia', gen('sia', 100, 616161)],
  ['permodel', JSON.parse(fs.readFileSync('permodel-cases.json', 'utf8'))],
];

const rows = [];
for (const [mode, cases] of CAMPAIGNS) {
  const res = await E.calcMany(cases, { concurrency: 3, onProgress: (d, t) => d % 100 === 0 && console.log(`  ${mode} ${d}/${t}`) });
  let evoFail = 0, engReject = 0;
  for (let i = 0; i < cases.length; i++) {
    const evo = res[i], c = cases[i];
    if (!evo || !evo.ok || evo.recIOL == null || evo.recToric == null) { evoFail++; continue; }
    let m;
    try {
      m = ENGINE.calculate({
        al: +c.txtAL, k1: +c.txtK1, k1a: +c.TxtK1Axis, k2: +c.txtK2, k2a: +c.TxtK2Axis,
        acd: +c.txtACD, lt: +c.txtLT, cct: +c.txtCCT, target: +c.txtRefraction, aconst: +c.txtAConstant,
        model: c.DropDownToric, kindex: +c.DropDownKIndex, sia: +c.TxtSIA, siaax: +c.TxtSIAaxis,
      });
    } catch (e) { engReject++; continue; }
    const em = new Map(evo.pairs);
    let tableMax = 0, tableN = 0;
    for (const s of m.sphere) if (em.has(s.iol)) { tableMax = Math.max(tableMax, Math.abs(r2(s.ref) - em.get(s.iol))); tableN++; }
    let dAx = Math.abs(m.rec.axis - evo.recAxis); if (dAx > 90) dAx = 180 - dAx;
    const row = {
      mode, model: c.DropDownToric, kidx: c.DropDownKIndex, sia: +c.TxtSIA,
      AL: +c.txtAL, Km: (+c.txtK1 + +c.txtK2) / 2, cylAnt: r2(+c.txtK2 - +c.txtK1),
      dIOL: r2(Math.abs(m.baseIOL - evo.baseIOL)),
      dCyl: r2(Math.abs(m.rec.cyl - evo.recToric)),
      dAx,
      dRef: evo.predRef != null ? r2(Math.abs(r2(m.rec.ref) - evo.predRef)) : null,
      dResi: evo.predCyl != null ? r2(Math.abs(r2(m.rec.resiCyl) - evo.predCyl)) : null,
      tableMax: r2(tableMax), tableN,
      nearZero: evo.predCyl != null && Math.abs(evo.predCyl) <= 0.02,
    };
    rows.push(row);
  }
  console.log(`${mode}: ${cases.length} generados, ${rows.filter(r => r.mode === mode).length} comparados (evoFail ${evoFail}, rechazados ${engReject})`);
}
E.saveCache();

// ---------------- aggregation ----------------
const N = rows.length;
const pct = (k, n) => n ? 100 * k / n : 0;
const mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
const median = a => { const s = a.filter(v => v != null).slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const stat = list => ({
  n: list.length,
  iol: pct(list.filter(r => r.dIOL === 0).length, list.length),
  cyl: pct(list.filter(r => r.dCyl === 0).length, list.length),
  ax1: pct(list.filter(r => r.dAx <= 1).length, list.length),
  dec: pct(list.filter(r => r.dIOL === 0 && r.dCyl === 0 && r.dAx <= 1).length, list.length),
  mRef: mean(list.map(r => r.dRef).filter(v => v != null)),
  mResi: mean(list.map(r => r.dResi).filter(v => v != null)),
  mTab: mean(list.map(r => r.tableMax)),
  medTab: median(list.map(r => r.tableMax)),
});

const tiers = [
  ['Todos los números idénticos (0.00 D)', rows.filter(r => r.dIOL === 0 && r.dCyl === 0 && r.dAx === 0 && r.tableMax === 0 && (r.dRef ?? 0) === 0 && (r.dResi ?? 0) === 0).length],
  ['Idéntico salvo redondeo (±0.01 D), eje exacto', rows.filter(r => r.dIOL === 0 && r.dCyl === 0 && r.dAx === 0 && r.tableMax <= 0.011 && (r.dRef ?? 0) <= 0.011 && (r.dResi ?? 0) <= 0.011).length],
  ['±0.01 D y eje ±1°', rows.filter(r => r.dIOL === 0 && r.dCyl === 0 && r.dAx <= 1 && r.tableMax <= 0.011 && (r.dRef ?? 0) <= 0.011 && (r.dResi ?? 0) <= 0.011).length],
  ['Misma decisión y números a ±0.05 D', rows.filter(r => r.dIOL === 0 && r.dCyl === 0 && r.dAx <= 1 && r.tableMax <= 0.05 && (r.dRef ?? 0) <= 0.05 && (r.dResi ?? 0) <= 0.05).length],
  ['Misma decisión de lente (potencia + cilindro, eje ±1°)', rows.filter(r => r.dIOL === 0 && r.dCyl === 0 && r.dAx <= 1).length],
  ['Misma potencia esférica', rows.filter(r => r.dIOL === 0).length],
];

const modeNames = { clean: 'Ojo estándar', long: 'Miopía magna', full: 'Todo combinado', models: 'Modelos de LIO', kidx: 'Otros índices K', sia: 'Con SIA', permodel: 'Por modelo (campaña)' };
const perMode = ['clean', 'long', 'full', 'models', 'kidx', 'sia', 'permodel'].map(m => ({ key: m, name: modeNames[m], ...stat(rows.filter(r => r.mode === m)) }));

const labelOf = v => (MODELS_META.find(x => x.value === v) || { label: v }).label;
const perModel = MODELS.map(v => ({ key: v, name: labelOf(v), ...stat(rows.filter(r => r.model === v)) }))
  .filter(x => x.n >= 5);

// histograms
const hist = (vals, edges) => {
  const counts = new Array(edges.length + 1).fill(0);
  for (const v of vals) {
    let i = 0; while (i < edges.length && v > edges[i]) i++;
    counts[i]++;
  }
  return counts;
};
const histTab = hist(rows.map(r => r.tableMax), [0.0001, 0.01, 0.02, 0.05, 0.10]);
const histAx = hist(rows.map(r => r.dAx), [0.5, 1.5, 2.5, 5.5, 10.5]);
const histResi = hist(rows.map(r => r.dResi).filter(v => v != null), [0.0001, 0.05, 0.10, 0.20, 0.30]);

// scatter: dRef vs AL (subsample to <=700 points)
const sc = rows.filter(r => r.dRef != null).map(r => [r2(r.AL), r.dRef]);
const scatter = sc.length > 700 ? sc.filter((_, i) => i % Math.ceil(sc.length / 700) === 0) : sc;

const data = {
  fecha: '09/08/2026',
  totalQueries: E.cacheSize(),
  totalRows: N,
  global: stat(rows),
  tiers: tiers.map(([name, k]) => ({ name, k, p: pct(k, N) })),
  perMode, perModel,
  hist: {
    tab: { labels: ['0.00', '0.01', '0.02', '0.03–0.05', '0.06–0.10', '>0.10'], counts: histTab },
    ax: { labels: ['0°', '1°', '2°', '3–5°', '6–10°', '>10°'], counts: histAx },
    resi: { labels: ['0.00', '0.01–0.05', '0.06–0.10', '0.11–0.20', '0.21–0.30', '>0.30'], counts: histResi },
  },
  scatter,
  barrett: {
    labels: ['OD (AL 29.4)', 'OS (AL 31.1)'],
    replica: [0.01, 0.01],
    barrett: [0.20, 0.63],
  },
};
fs.writeFileSync('dashboard-data.json', JSON.stringify(data));
console.log('\nTOTAL comparados:', N, ' consultas EVO en caché:', E.cacheSize());
console.log('global:', JSON.stringify(data.global));
console.log('perModel entries:', perModel.length, ' min n:', Math.min(...perModel.map(p => p.n)), ' max n:', Math.max(...perModel.map(p => p.n)));
console.log('wrote dashboard-data.json');
