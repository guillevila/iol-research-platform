/** Tests del sistema de incertidumbre Monte Carlo (Sprint 10). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gaussianSampler, monteCarloRefraction, alternativeBetterProbability } from '../src/uncertainty/montecarlo.mjs';
import { makeRng } from '../src/synth/generator.mjs';
import { createPreopEye, createPredictedPostopEye } from '../src/core/eye.mjs';
import { searchBestPower } from '../src/optimize/power_search.mjs';

const PRE = createPreopEye({
  al_mm: 23.5, k1_d: 43.5, k1_axis_deg: 180, k2_d: 43.5, k2_axis_deg: 90,
  acd_mm: 3.2, lt_mm: 4.5, cct_um: 550, meta: { source: 'synthetic' },
});
const POS = 4.9;
const P = searchBestPower({
  postop: createPredictedPostopEye(PRE, { iol_position_mm: POS, position_source: 't' }),
  target_d: 0,
}).best.power_d;

test('gauss: media y sigma correctas; sigma 0 degenerada; sigma negativa rechazada', () => {
  const g = gaussianSampler(makeRng(7));
  const xs = Array.from({ length: 20000 }, () => g(1.5, 0.4));
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
  assert.ok(Math.abs(mean - 1.5) < 0.02, 'media ' + mean);
  assert.ok(Math.abs(sd - 0.4) < 0.02, 'sd ' + sd);
  assert.equal(g(2.2, 0), 2.2);
  assert.throws(() => g(0, -1), RangeError);
});

test('MC: reproducible con semilla, exige semilla entera', () => {
  const args = { preop: PRE, iol_position_mm: POS, power_d: P, sigmas: { iol_position_mm: 0.3 }, n: 500, seed: 11 };
  const a = monteCarloRefraction(args);
  const b = monteCarloRefraction(args);
  assert.deepEqual(a, b);
  const c = monteCarloRefraction({ ...args, seed: 12 });
  assert.notDeepEqual(a.percentiles_d, c.percentiles_d);
  assert.throws(() => monteCarloRefraction({ ...args, seed: undefined }), TypeError);
});

test('MC: sigmas 0 → distribución degenerada en el valor determinista', () => {
  const r = monteCarloRefraction({ preop: PRE, iol_position_mm: POS, power_d: P, sigmas: {}, n: 100, seed: 3 });
  assert.ok(r.sd_d < 1e-12);
  assert.ok(Math.abs(r.percentiles_d.p5 - r.percentiles_d.p95) < 1e-12);
  assert.equal(r.rejected, 0);
});

test('MC: percentiles ordenados y etiqueta de simulación presente', () => {
  const r = monteCarloRefraction({
    preop: PRE, iol_position_mm: POS, power_d: P,
    sigmas: { iol_position_mm: 0.3, al_mm: 0.05, mean_k_d: 0.15 }, n: 1500, seed: 21,
  });
  const q = r.percentiles_d;
  assert.ok(q.p5 <= q.p25 && q.p25 <= q.p50 && q.p50 <= q.p75 && q.p75 <= q.p95);
  assert.match(r.etiqueta, /SIMULACION/);
});

test('MC: consistente con la sensibilidad local (sd ≈ |∂R/∂pos|·σ_pos)', () => {
  const s = searchBestPower({
    postop: createPredictedPostopEye(PRE, { iol_position_mm: POS, position_source: 't' }),
    target_d: 0,
  });
  const sigma = 0.30;
  const r = monteCarloRefraction({
    preop: PRE, iol_position_mm: POS, power_d: s.best.power_d,
    sigmas: { iol_position_mm: sigma }, n: 4000, seed: 5,
  });
  const esperado = Math.abs(s.sensitivity_ref_per_mm_d) * sigma;
  assert.ok(Math.abs(r.sd_d - esperado) / esperado < 0.15,
    `sd MC ${r.sd_d.toFixed(4)} vs lineal ${esperado.toFixed(4)}`);
});

test('probabilidad de alternativa: 0-1, reproducible, y ~50% para potencias equidistantes con sigma grande', () => {
  const base = { preop: PRE, iol_position_mm: POS, target_d: 0, sigmas: { iol_position_mm: 0.6 }, n: 3000, seed: 9 };
  // A y B equidistantes de la potencia exacta continua → empate estadístico
  const exact = searchBestPower({
    postop: createPredictedPostopEye(PRE, { iol_position_mm: POS, position_source: 't' }), target_d: 0,
  }).exact_power_d;
  const r = alternativeBetterProbability({ ...base, powerA_d: exact - 0.25, powerB_d: exact + 0.25 });
  assert.ok(r.probability > 0.4 && r.probability < 0.6, 'p=' + r.probability);
  // B claramente peor → probabilidad baja
  const peor = alternativeBetterProbability({ ...base, sigmas: { iol_position_mm: 0.1 }, powerA_d: exact, powerB_d: exact + 3 });
  assert.ok(peor.probability < 0.05);
  const rep = alternativeBetterProbability({ ...base, powerA_d: exact - 0.25, powerB_d: exact + 0.25 });
  assert.equal(rep.probability, r.probability);
});
