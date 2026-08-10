import fs from 'fs';
import * as E from './evo2.mjs';
const ENGINE = (await import('./engine.js')).default ?? (await import('./engine.js'));

const MODE = process.argv[2] || 'clean';
const N = Number(process.argv[3] || 100);
let seed = Number(process.argv[4] || 424242);
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const U = (a, b) => a + (b - a) * rnd();
const pick = a => a[Math.floor(rnd() * a.length) % a.length];
const MODELS = JSON.parse(fs.readFileSync('models.json', 'utf8')).models.map(m => m.value);

const cases = [];
for (let i = 0; i < N; i++) {
  const LONG = MODE === 'long';
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
  if (MODE === 'full') {
    c.DropDownToric = pick(MODELS); c.DropDownKIndex = pick(['1.3375', '1.3375', '1.3375', '1.3315', '1.332']);
    c.TxtSIA = (+U(0, 0.5).toFixed(2)).toFixed(2); c.TxtSIAaxis = String(Math.floor(U(0, 180)));
  } else if (MODE === 'sia') {
    c.TxtSIA = (+U(0.05, 0.5).toFixed(2)).toFixed(2); c.TxtSIAaxis = String(Math.floor(U(0, 180)));
  } else if (MODE === 'kidx') {
    c.DropDownKIndex = pick(['1.3315', '1.332']);
  } else if (MODE === 'models') {
    c.DropDownToric = pick(MODELS);
  }
  cases.push(c);
}
console.log(`mode=${MODE}  n=${cases.length}`);
const res = await E.calcMany(cases, { concurrency: 3, onProgress: (d, t) => d % 50 === 0 && console.log(`   ${d}/${t}`) });
E.saveCache();

const r2 = x => Math.round(x * 100) / 100;
let n = 0, iolS = 0, cylS = 0, axS = 0, ax1 = 0;
const tabE = [], resiE = [], seE = [], tcaBias = [];
const rows = [];
for (let i = 0; i < cases.length; i++) {
  const evo = res[i], c = cases[i];
  if (!evo || !evo.ok || evo.recIOL == null) continue;
  let m; try {
    m = ENGINE.calculate({
      al: +c.txtAL, k1: +c.txtK1, k1a: +c.TxtK1Axis, k2: +c.txtK2, k2a: +c.TxtK2Axis,
      acd: +c.txtACD, lt: +c.txtLT, cct: +c.txtCCT, target: +c.txtRefraction, aconst: +c.txtAConstant,
      model: c.DropDownToric, kindex: +c.DropDownKIndex, sia: +c.TxtSIA, siaax: +c.TxtSIAaxis,
    });
  } catch (e) { continue; }
  n++;
  if (m.baseIOL === evo.baseIOL) iolS++;
  if (m.rec.cyl === evo.recToric) cylS++;
  let d = m.rec.axis - evo.recAxis; if (d > 90) d -= 180; if (d < -90) d += 180;
  if (d === 0) axS++; if (Math.abs(d) <= 1) ax1++;
  if (evo.predCyl != null) resiE.push(Math.abs(r2(m.rec.resiCyl) - evo.predCyl));
  if (evo.predRef != null) seE.push(Math.abs(r2(m.rec.ref) - evo.predRef));
  const em = new Map(evo.pairs);
  for (const s of m.sphere) if (em.has(s.iol)) tabE.push(Math.abs(r2(s.ref) - em.get(s.iol)));
  rows.push({ AL: c.txtAL, K1: c.txtK1, K2: c.txtK2, ax: c.TxtK1Axis, A: c.txtAConstant, kidx: c.DropDownKIndex,
    model: c.DropDownToric, sia: c.TxtSIA,
    evoIOL: evo.baseIOL, myIOL: m.baseIOL, evoCyl: evo.recToric, myCyl: m.rec.cyl,
    evoAx: evo.recAxis, myAx: m.rec.axis, dAx: d,
    evoResi: evo.predCyl, myResi: r2(m.rec.resiCyl), tca: r2(m.tcaMag) });
}
const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : NaN; };
const P = (a, b) => (100 * a / b).toFixed(1) + '%';
console.log(`\n--- ${MODE} (${n} cases) ---`);
console.log(`spherical IOL identical : ${iolS}/${n} (${P(iolS, n)})`);
console.log(`toric cylinder identical: ${cylS}/${n} (${P(cylS, n)})`);
console.log(`axis exact / within 1 deg: ${P(axS, n)} / ${P(ax1, n)}`);
console.log(`table refraction err: med ${q(tabE, .5).toFixed(3)} p95 ${q(tabE, .95).toFixed(3)} max ${Math.max(...tabE).toFixed(3)}`);
console.log(`residual cyl err    : med ${q(resiE, .5).toFixed(3)} p95 ${q(resiE, .95).toFixed(3)} max ${Math.max(...resiE).toFixed(3)}`);
console.log(`predicted SE err    : med ${q(seE, .5).toFixed(3)} p95 ${q(seE, .95).toFixed(3)} max ${Math.max(...seE).toFixed(3)}`);
fs.writeFileSync(`validation-${MODE}.json`, JSON.stringify(rows, null, 1));
