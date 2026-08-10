import fs from 'fs';
import * as E from './evo2.mjs';
const ENGINE = (await import('./engine.js')).default ?? (await import('./engine.js'));

// deterministic PRNG so the run is reproducible
let seed = 20260807;
function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
const U = (a, b) => a + (b - a) * rnd();
const pick = arr => arr[Math.floor(rnd() * arr.length) % arr.length];

const MODELS = JSON.parse(fs.readFileSync('models.json', 'utf8')).models.map(m => m.value);
const N = Number(process.argv[2] || 200);

const cases = [];
for (let i = 0; i < N; i++) {
  const al = +U(21.0, 27.0).toFixed(2);
  const k1 = +U(40.0, 47.0).toFixed(2);
  const cyl = +U(0.25, 4.00).toFixed(2);
  const ax = Math.floor(U(0, 180));
  const k1a = ax === 0 ? 180 : ax;
  const k2a = ((k1a + 90) % 180) === 0 ? 180 : (k1a + 90) % 180;
  const acd = +U(2.60, 4.20).toFixed(2);
  const lt = +U(3.60, 5.40).toFixed(2);
  const cct = Math.round(U(480, 620));
  const target = +(Math.round(U(-1.5, 0.5) * 4) / 4).toFixed(2);
  const aconst = +U(117.0, 120.5).toFixed(2);
  const model = pick(MODELS);
  const sia = +U(0, 0.50).toFixed(2);
  const siaax = Math.floor(U(0, 180));
  const kindex = pick(['1.3375', '1.3375', '1.3375', '1.3315', '1.332']);
  // K1 is the FLAT meridian -> K2 = K1 + cyl at the perpendicular axis
  cases.push({
    txtAL: al.toFixed(2), txtK1: k1.toFixed(2), TxtK1Axis: String(k1a),
    txtK2: (k1 + cyl).toFixed(2), TxtK2Axis: String(k2a),
    txtACD: acd.toFixed(2), txtLT: lt.toFixed(2), txtCCT: String(cct),
    txtRefraction: String(target), txtAConstant: aconst.toFixed(2),
    DropDownToric: model, DropDownKIndex: kindex,
    TxtSIA: sia.toFixed(2), TxtSIAaxis: String(siaax),
  });
}
console.log(`validating ${cases.length} random held-out cases ...`);
const res = await E.calcMany(cases, { concurrency: 3, onProgress: (d, t) => d % 25 === 0 && console.log(`   ${d}/${t}`) });
E.saveCache();

const r2 = x => Math.round(x * 100) / 100;
const stats = {
  n: 0, iolSame: 0, cylSame: 0, axisSame: 0, axisWithin1: 0,
  refErr: [], resiErr: [], seErr: [], iolErr: [], tableErr: [], failures: [],
};
const rows = [];
for (let i = 0; i < cases.length; i++) {
  const evo = res[i], c = cases[i];
  if (!evo || !evo.ok || evo.recIOL == null) { stats.failures.push({ i, errs: evo && evo.errs }); continue; }
  let mine;
  try {
    mine = ENGINE.calculate({
      al: +c.txtAL, k1: +c.txtK1, k1a: +c.TxtK1Axis, k2: +c.txtK2, k2a: +c.TxtK2Axis,
      acd: +c.txtACD, lt: +c.txtLT, cct: +c.txtCCT, target: +c.txtRefraction,
      aconst: +c.txtAConstant, model: c.DropDownToric, kindex: +c.DropDownKIndex,
      sia: +c.TxtSIA, siaax: +c.TxtSIAaxis,
    });
  } catch (e) { stats.failures.push({ i, err: e.message }); continue; }

  stats.n++;
  if (mine.baseIOL === evo.baseIOL) stats.iolSame++;
  stats.iolErr.push(Math.abs(mine.baseIOL - evo.baseIOL));
  if (evo.recToric != null && mine.rec.cyl === evo.recToric) stats.cylSame++;
  if (evo.recAxis != null) {
    let d = Math.abs(mine.rec.axis - evo.recAxis); if (d > 90) d = 180 - d;
    if (d === 0) stats.axisSame++; if (d <= 1) stats.axisWithin1++;
  }
  if (evo.predRef != null) stats.seErr.push(Math.abs(r2(mine.rec.ref) - evo.predRef));
  if (evo.predCyl != null) stats.resiErr.push(Math.abs(r2(mine.rec.resiCyl) - evo.predCyl));
  // full 5-row spherical table
  const em = new Map(evo.pairs);
  for (const s of mine.sphere) if (em.has(s.iol)) stats.tableErr.push(Math.abs(r2(s.ref) - em.get(s.iol)));
  rows.push({
    i, AL: c.txtAL, K1: c.txtK1, K2: c.txtK2, model: c.DropDownToric, A: c.txtAConstant,
    evoIOL: evo.baseIOL, myIOL: mine.baseIOL,
    evoCyl: evo.recToric, myCyl: mine.rec.cyl,
    evoAxis: evo.recAxis, myAxis: mine.rec.axis,
    evoRef: evo.predRef, myRef: r2(mine.rec.ref),
    evoResi: evo.predCyl, myResi: r2(mine.rec.resiCyl),
    evoResiAx: evo.predAxis, myResiAx: mine.rec.resiAxis,
  });
}
const pct = (a, b) => (100 * a / b).toFixed(1) + '%';
const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : NaN; };
console.log(`\n================ VALIDATION (${stats.n} cases) ================`);
console.log(`recommended spherical IOL identical : ${stats.iolSame}/${stats.n}  (${pct(stats.iolSame, stats.n)})`);
console.log(`recommended toric cylinder identical: ${stats.cylSame}/${stats.n}  (${pct(stats.cylSame, stats.n)})`);
console.log(`IOL axis identical (deg)            : ${stats.axisSame}/${stats.n}  (${pct(stats.axisSame, stats.n)});  within 1 deg: ${pct(stats.axisWithin1, stats.n)}`);
console.log(`\nspherical table refraction error (all 5 rows, n=${stats.tableErr.length}):`);
console.log(`   median ${q(stats.tableErr, .5).toFixed(3)}  p95 ${q(stats.tableErr, .95).toFixed(3)}  max ${Math.max(...stats.tableErr).toFixed(3)} D`);
console.log(`predicted SE refraction error: median ${q(stats.seErr, .5).toFixed(3)}  p95 ${q(stats.seErr, .95).toFixed(3)}  max ${Math.max(...stats.seErr).toFixed(3)} D`);
console.log(`residual cylinder error      : median ${q(stats.resiErr, .5).toFixed(3)}  p95 ${q(stats.resiErr, .95).toFixed(3)}  max ${Math.max(...stats.resiErr).toFixed(3)} D`);
if (stats.failures.length) console.log(`\nfailures/skipped: ${stats.failures.length}`);
fs.writeFileSync('validation.json', JSON.stringify({ stats: { ...stats, refErr: undefined }, rows }, null, 1));
console.log('\nwrote validation.json');
