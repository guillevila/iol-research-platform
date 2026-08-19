/* VERIFICACION 7 — cota de discretizacion del haz. TEMPORAL, borrar. */
import { createPreopEye, createPredictedPostopEye } from './src/core/eye.mjs';
import { GenericIOLFactory } from './src/core/iol_factory.mjs';
import { EquatorialPlanePredictor } from './src/predictors/iol_position.mjs';
import { optimizePowerByRaytrace } from './src/optimize/raytrace_power.mjs';
import { buildParaxialEye } from './src/optics/eyebuilder.mjs';
import { SamplingKind } from './src/optics/raytrace/bundle.mjs';

const OJOS = [
  { id: 'corto', al_mm: 21.0, k_d: 44.0, acd_mm: 2.9, lt_mm: 4.9 },
  { id: 'normal', al_mm: 23.5, k_d: 43.5, acd_mm: 3.2, lt_mm: 4.5 },
  { id: 'largo', al_mm: 27.0, k_d: 42.5, acd_mm: 3.6, lt_mm: 4.1 },
];
const CCT = 550, PUPIL = 3.0;
const SBIO = [0.20, 0.30, 0.40], SMED = [0.05, 0.10, 0.20];
const INTERV = 16, TRUNC = 4;
const factory = new GenericIOLFactory();
const predictor = new EquatorialPlanePredictor();
const ojoDe = o => createPreopEye({
  al_mm: o.al_mm, k1_d: o.k_d, k1_axis_deg: 180, k2_d: o.k_d, k2_axis_deg: 90,
  acd_mm: o.acd_mm, lt_mm: o.lt_mm, cct_um: CCT, meta: { source: 'synthetic' },
});
function paraxialEnPos(pre, pos) {
  return buildParaxialEye(createPredictedPostopEye(pre, { iol_position_mm: pos, position_source: 'verif' }));
}
function potenciaExactaGruesa(pre, pos) {
  const eye = paraxialEnPos(pre, pos);
  let lo = 0, hi = 40;
  const f = p => eye.refractionForIOL(factory.create({ power_d: p }));
  const fLo = f(lo);
  for (let i = 0; i < 80 && hi - lo > 1e-9; i++) {
    const mid = (lo + hi) / 2;
    if (Math.sign(f(mid)) === Math.sign(fLo)) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}
function trazador(pre, anillos, tol) {
  const cache = new Map();
  return pos => {
    if (cache.has(pos)) return cache.get(pos);
    const centro = potenciaExactaGruesa(pre, pos);
    const r = optimizePowerByRaytrace({
      postop: createPredictedPostopEye(pre, { iol_position_mm: pos, position_source: 'verif' }),
      factory, pupil_mm: PUPIL, n_anillos: anillos, sampling: SamplingKind.MERIDIONAL,
      search_d: [centro - 2.5, centro + 2.5], ...(tol !== undefined ? { tol_d: tol } : {}),
    });
    cache.set(pos, r.exact_power_d);
    return r.exact_power_d;
  };
}
function esperanzaAbs(f, sigma, intervalos = INTERV) {
  const L = TRUNC * sigma, h = L / intervalos;
  const phi = x => Math.exp(-x * x / (2 * sigma * sigma)) / (sigma * Math.sqrt(2 * Math.PI));
  const lado = signo => {
    let s = 0;
    for (let i = 0; i <= intervalos; i++) {
      const x = i * h;
      const w = (i === 0 || i === intervalos) ? 1 : (i % 2 === 1 ? 4 : 2);
      s += w * Math.abs(f(signo * x)) * phi(x);
    }
    return s * h / 3;
  };
  return lado(+1) + lado(-1);
}

// ---------- A) replica exacta del bloque publicado, extendido a 320 y 640 ----------
console.log('=== A) sonda publicada (ojo corto, tol_d=1e-7 como en run_exp015) ===');
const preCorto = ojoDe(OJOS[0]);
const pos0Corto = predictor.predict(preCorto).iol_position_mm;
const trazadaCon = (anillos, tol) => {
  const T = trazador(preCorto, anillos, tol);
  const p0 = T(pos0Corto);
  return { abs: p0, r_mas: T(pos0Corto + 0.4) - p0, r_menos: T(pos0Corto - 0.4) - p0 };
};
const ref = {};
for (const n of [40, 160, 320, 640]) {
  const t0 = Date.now();
  ref[n] = trazadaCon(n, 1e-7);
  console.log(`n=${String(n).padStart(3)}  abs=${ref[n].abs.toFixed(9)}  resp+0.4=${ref[n].r_mas.toFixed(9)}  resp-0.4=${ref[n].r_menos.toFixed(9)}   (${Date.now() - t0} ms)`);
}
console.log('\n-- sesgos frente a cada referencia --');
for (const [a, b] of [[40, 160], [40, 320], [40, 640], [160, 320], [160, 640], [320, 640]]) {
  console.log(`${a} vs ${b}: dAbs=${(ref[a].abs - ref[b].abs).toExponential(3)}  dResp+=${(ref[a].r_mas - ref[b].r_mas).toExponential(3)}  dResp-=${(ref[a].r_menos - ref[b].r_menos).toExponential(3)}`);
}

// ---------- B) tol_d real de produccion (1e-4) ----------
console.log('\n=== B) misma sonda con el tol_d que usan DE VERDAD los canales (1e-4, defecto) ===');
const refProd = {};
for (const n of [40, 160, 320]) {
  refProd[n] = trazadaCon(n, undefined);
  console.log(`n=${String(n).padStart(3)}  abs=${refProd[n].abs.toFixed(9)}  resp+0.4=${refProd[n].r_mas.toFixed(9)}  resp-0.4=${refProd[n].r_menos.toFixed(9)}`);
}
for (const [a, b] of [[40, 160], [40, 320], [160, 320]]) {
  console.log(`${a} vs ${b}: dAbs=${(refProd[a].abs - refProd[b].abs).toExponential(3)}  dResp+=${(refProd[a].r_mas - refProd[b].r_mas).toExponential(3)}  dResp-=${(refProd[a].r_menos - refProd[b].r_menos).toExponential(3)}`);
}
console.log('tol 1e-7 vs 1e-4 a n=40: dAbs=' + (ref[40].abs - refProd[40].abs).toExponential(3)
  + '  dResp+=' + (ref[40].r_mas - refProd[40].r_mas).toExponential(3));

// ---------- C) el canal motor real, recomputado a 40 / 160 / 320 anillos ----------
console.log('\n=== C) canal_motor_optico_d recomputado con 40 / 160 / 320 anillos (tol de produccion) ===');
const filas = [];
for (const o of OJOS) {
  const pre = ojoDe(o);
  const pos0 = predictor.predict(pre).iol_position_mm;
  const PG = pos => potenciaExactaGruesa(pre, pos);
  const fPG = d => PG(pos0 + d) - PG(pos0);
  const EG = {};
  for (const s of [...SBIO, ...SMED]) EG[s] = esperanzaAbs(fPG, s);
  const porAnillos = {};
  for (const n of [40, 160, 320]) {
    const t0 = Date.now();
    const T = trazador(pre, n, undefined);
    const fPT = d => T(pos0 + d) - T(pos0);
    const ET = {};
    for (const s of [...SBIO, ...SMED]) ET[s] = esperanzaAbs(fPT, s);
    porAnillos[n] = ET;
    console.log(`  ${o.id} n=${n}: ${Date.now() - t0} ms`);
  }
  for (const sb of SBIO) for (const sm of SMED) {
    const f = { ojo: o.id, sb, sm };
    for (const n of [40, 160, 320]) {
      f['canal' + n] = (porAnillos[n][sb] - porAnillos[n][sm]) - (EG[sb] - EG[sm]);
      f['benPT' + n] = porAnillos[n][sb] - porAnillos[n][sm];
    }
    f.benPG = EG[sb] - EG[sm];
    filas.push(f);
  }
}
console.log('\n| ojo | sb | sm | canal(40) | canal(160) | canal(320) | 40-160 | %(40-160)/canal40 | 40-320 | %(40-320)/canal40 |');
for (const f of filas) {
  const d160 = f.canal40 - f.canal160, d320 = f.canal40 - f.canal320;
  console.log(`| ${f.ojo} | ${f.sb} | ${f.sm} | ${f.canal40.toExponential(4)} | ${f.canal160.toExponential(4)} | ${f.canal320.toExponential(4)} | `
    + `${d160.toExponential(3)} | ${(100 * Math.abs(d160 / f.canal40)).toFixed(2)} % | ${d320.toExponential(3)} | ${(100 * Math.abs(d320 / f.canal40)).toFixed(2)} % |`);
}
const peor160 = filas.reduce((a, b) => Math.abs((a.canal40 - a.canal160) / a.canal40) > Math.abs((b.canal40 - b.canal160) / b.canal40) ? a : b);
const peor320 = filas.reduce((a, b) => Math.abs((a.canal40 - a.canal320) / a.canal40) > Math.abs((b.canal40 - b.canal320) / b.canal40) ? a : b);
console.log(`\nPEOR celda 40->160 : ${peor160.ojo} sb=${peor160.sb} sm=${peor160.sm} -> ${(100 * Math.abs((peor160.canal40 - peor160.canal160) / peor160.canal40)).toFixed(2)} % del canal`);
console.log(`PEOR celda 40->320 : ${peor320.ojo} sb=${peor320.sb} sm=${peor320.sm} -> ${(100 * Math.abs((peor320.canal40 - peor320.canal320) / peor320.canal40)).toFixed(2)} % del canal`);
// tabla publicada usa sm=0.10
const sub = filas.filter(f => f.sm === 0.10);
console.log('\n-- celdas de la TABLA PUBLICADA (sm = 0.10) --');
for (const f of sub) {
  console.log(`${f.ojo} sb=${f.sb}: canal40=${f.canal40.toFixed(6)}  canal160=${f.canal160.toFixed(6)}  canal320=${f.canal320.toFixed(6)}  `
    + `desv40-320=${(100 * Math.abs((f.canal40 - f.canal320) / f.canal40)).toFixed(2)} %`);
}
