import fs from 'fs';
import * as E from './evo2.mjs';
const ENGINE = (await import('./engine.js')).default ?? (await import('./engine.js'));

const MODELS = JSON.parse(fs.readFileSync('models.json', 'utf8')).models.map(m => m.value);
const r2 = x => Math.round(x * 100) / 100;

function genCases(mode, N, seed0) {
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
    }
    out.push(c);
  }
  return out;
}

const SETS = [
  ['clean', 200, 999111],
  ['long', 150, 24681357],
  ['full', 250, 888222],
];

const agg = { pairs: [], perMode: {} };
for (const [mode, N, seed] of SETS) {
  const cases = genCases(mode, N, seed);
  const res = await E.calcMany(cases, { concurrency: 3 });
  for (let i = 0; i < cases.length; i++) {
    const evo = res[i], c = cases[i];
    if (!evo || !evo.ok || evo.recIOL == null || evo.recToric == null) continue;
    let m; try {
      m = ENGINE.calculate({
        al: +c.txtAL, k1: +c.txtK1, k1a: +c.TxtK1Axis, k2: +c.txtK2, k2a: +c.TxtK2Axis,
        acd: +c.txtACD, lt: +c.txtLT, cct: +c.txtCCT, target: +c.txtRefraction, aconst: +c.txtAConstant,
        model: c.DropDownToric, kindex: +c.DropDownKIndex, sia: +c.TxtSIA, siaax: +c.TxtSIAaxis,
      });
    } catch (e) { continue; }
    // components, all at DISPLAYED precision
    const em = new Map(evo.pairs);
    let tableSame = m.sphere.length > 0, tableMax = 0, tableN = 0;
    for (const s of m.sphere) {
      if (!em.has(s.iol)) { tableSame = false; continue; }
      const d = Math.abs(r2(s.ref) - em.get(s.iol));
      tableMax = Math.max(tableMax, d); tableN++;
      if (d > 0.0001) tableSame = false;
    }
    if (tableN < 5) tableSame = false;
    let dAx = Math.abs(m.rec.axis - evo.recAxis); if (dAx > 90) dAx = 180 - dAx;
    const dIOL = Math.abs(m.baseIOL - evo.baseIOL);
    const dCyl = Math.abs(m.rec.cyl - evo.recToric);
    const dRef = evo.predRef != null ? Math.abs(r2(m.rec.ref) - evo.predRef) : null;
    const dResi = evo.predCyl != null ? Math.abs(r2(m.rec.resiCyl) - evo.predCyl) : null;
    let dResiAx = evo.predAxis != null ? Math.abs(m.rec.resiAxis - evo.predAxis) : null;
    if (dResiAx != null && dResiAx > 90) dResiAx = 180 - dResiAx;
    const nearZeroResi = evo.predCyl != null && Math.abs(evo.predCyl) <= 0.02;

    const exactAll = tableSame && dIOL === 0 && dCyl === 0 && dAx === 0 &&
      (dRef === null || dRef < 0.005) && (dResi === null || dResi < 0.005) &&
      (dResiAx === null || dResiAx === 0 || nearZeroResi);
    const decisionSame = dIOL === 0 && dCyl === 0 && dAx <= 1;

    agg.pairs.push({ mode, evoIOL: evo.baseIOL, evoCyl: evo.recToric, evoAx: evo.recAxis,
      dIOL, dCyl, dAx, dRef, dResi, tableMax, exactAll, decisionSame, nearZeroResi });
  }
}
E.saveCache();

function stats(list) {
  const n = list.length;
  const ex = list.filter(p => p.exactAll).length;
  const dec = list.filter(p => p.decisionSame).length;
  return { n, ex, dec };
}
const all = agg.pairs;
console.log('=== GLOBAL (todos los modos) ===');
const g = stats(all);
console.log(`pares evaluados: ${g.n}`);
console.log(`IDÉNTICOS en todos los números mostrados: ${g.ex}  (${(100 * g.ex / g.n).toFixed(1)}%)`);
console.log(`Misma decisión de lente (LIO+cilindro, eje ±1°): ${g.dec}  (${(100 * g.dec / g.n).toFixed(1)}%)`);
for (const mode of ['clean', 'long', 'full']) {
  const s = stats(all.filter(p => p.mode === mode));
  console.log(`  ${mode.padEnd(6)}: n=${s.n}  idénticos ${(100 * s.ex / s.n).toFixed(1)}%  misma decisión ${(100 * s.dec / s.n).toFixed(1)}%`);
}

console.log('\n=== LOS QUE NO SON IDÉNTICOS: ¿en qué y cuánto difieren? ===');
const diff = all.filter(p => !p.exactAll);
console.log(`no idénticos: ${diff.length}`);
const mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
const iolDiff = diff.filter(p => p.dIOL > 0);
const cylDiff = diff.filter(p => p.dCyl > 0);
const axDiff = diff.filter(p => p.dAx > 0);
console.log(`\n- potencia LIO distinta: ${iolDiff.length} (${(100 * iolDiff.length / all.n || 0).toFixed(1)}...)`);
console.log(`  de ${all.length} totales: ${(100 * iolDiff.length / all.length).toFixed(1)}%`);
console.log(`  desviación media ${mean(iolDiff.map(p => p.dIOL)).toFixed(3)} D  (media % sobre la potencia: ${mean(iolDiff.map(p => 100 * p.dIOL / Math.abs(p.evoIOL))).toFixed(2)}%)`);
console.log(`  máxima ${Math.max(0, ...iolDiff.map(p => p.dIOL)).toFixed(2)} D;  casos a más de un escalón (>0.5 D): ${iolDiff.filter(p => p.dIOL > 0.5).length}`);
console.log(`\n- cilindro distinto: ${cylDiff.length} de ${all.length} (${(100 * cylDiff.length / all.length).toFixed(1)}%)`);
console.log(`  desviación media ${mean(cylDiff.map(p => p.dCyl)).toFixed(3)} D  (media % sobre el cilindro: ${mean(cylDiff.filter(p => p.evoCyl > 0).map(p => 100 * p.dCyl / p.evoCyl)).toFixed(1)}%)`);
console.log(`  máxima ${Math.max(0, ...cylDiff.map(p => p.dCyl)).toFixed(2)} D;  a más de un escalón (>0.75 D): ${cylDiff.filter(p => p.dCyl > 0.751).length}`);
console.log(`\n- eje distinto: ${axDiff.length} de ${all.length} (${(100 * axDiff.length / all.length).toFixed(1)}%)`);
console.log(`  desviación media ${mean(axDiff.map(p => p.dAx)).toFixed(2)}°  máxima ${Math.max(0, ...axDiff.map(p => p.dAx))}°`);
const refs = diff.map(p => p.dRef).filter(v => v != null);
const resis = diff.map(p => p.dResi).filter(v => v != null);
console.log(`\n- refracción prevista (EE), solo en los no idénticos: desviación media ${mean(refs).toFixed(3)} D, máx ${Math.max(0, ...refs).toFixed(2)} D`);
console.log(`- cilindro residual previsto, solo en los no idénticos: media ${mean(resis).toFixed(3)} D, máx ${Math.max(0, ...resis).toFixed(2)} D`);
console.log(`- tabla esférica (5 filas), desviación máxima media en los no idénticos: ${mean(diff.map(p => p.tableMax)).toFixed(3)} D`);

// where identity fails even when the decision matches
const decNotExact = all.filter(p => p.decisionSame && !p.exactAll);
console.log(`\nCasos con la MISMA decisión pero no idénticos al céntimo: ${decNotExact.length}`);
console.log(`  su desviación media de refracción: ${mean(decNotExact.map(p => p.dRef).filter(v => v != null)).toFixed(3)} D`);
console.log(`  su desviación media de resi-cyl : ${mean(decNotExact.map(p => p.dResi).filter(v => v != null)).toFixed(3)} D`);
fs.writeFileSync('identical.json', JSON.stringify(agg.pairs, null, 1));
console.log('\nwrote identical.json');
