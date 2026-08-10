/** Tests de builder, optimizador, generador sintético y framework de benchmark (Sprints 4-5). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPreopEye, createPredictedPostopEye } from '../src/core/eye.mjs';
import { buildParaxialEye, corneaModelOf } from '../src/optics/eyebuilder.mjs';
import { searchBestPower, powerGrid } from '../src/optimize/power_search.mjs';
import { ConstantOffsetPredictor } from '../src/predictors/iol_position.mjs';
import { ParaxialEngine } from '../src/bench/engines/paraxial_engine.mjs';
import { EvoReplicaEngine } from '../src/bench/engines/evo_engine.mjs';
import { compareEngines, assertBenchCase } from '../src/bench/interface.mjs';
import { gridEyes, randomEyes, makeRng } from '../src/synth/generator.mjs';
import { RUO_WARNING } from '../src/core/result.mjs';

const PRE = createPreopEye({
  al_mm: 23.5, k1_d: 43.0, k1_axis_deg: 180, k2_d: 44.0, k2_axis_deg: 90,
  acd_mm: 3.2, lt_mm: 4.5, cct_um: 550, meta: { source: 'synthetic' },
});
const POST = createPredictedPostopEye(PRE, { iol_position_mm: 4.9, position_source: 'test' });

test('eyebuilder: elige y documenta la representación corneal', () => {
  assert.equal(corneaModelOf(PRE).kind, 'keratometric_reading');
  assert.equal(corneaModelOf(PRE).power_d, 43.5);
  const conRadios = createPreopEye({
    al_mm: 23.5, k1_d: 43, k1_axis_deg: 180, k2_d: 44, k2_axis_deg: 90,
    cct_um: 550, cornea: { r_anterior_mm: 7.7, r_posterior_mm: 6.8 },
    meta: { source: 'synthetic' },
  });
  const c = corneaModelOf(conRadios);
  assert.equal(c.kind, 'two_surface_physical');
  assert.ok(c.power_d > 35 && c.power_d < 50, 'potencia física plausible: ' + c.power_d);
});

test('optimizador: el óptimo de rejilla rodea a la potencia exacta continua', () => {
  const s = searchBestPower({ postop: POST, target_d: 0 });
  assert.ok(Math.abs(s.best.power_d - s.exact_power_d) <= 0.25 + 1e-9,
    `best ${s.best.power_d} vs exacta ${s.exact_power_d}`);
  assert.ok(s.second !== null && s.delta_between_top2_d >= 0);
  // sensibilidad a posición: positiva (LIO más posterior → refracción más hipermetrópica)
  assert.ok(s.sensitivity_ref_per_mm_d > 0.5 && s.sensitivity_ref_per_mm_d < 5,
    'sensibilidad fuera de orden físico: ' + s.sensitivity_ref_per_mm_d);
});

test('optimizador: detección de empate con rejilla fina', () => {
  const s = searchBestPower({ postop: POST, target_d: 0, grid: powerGrid(0, 35, 0.05), tieThreshold_d: 0.05 });
  assert.equal(s.tie, true, 'con paso 0.05 D las dos mejores deben empatar');
});

test('bench: motor paraxial cumple contrato y expone incertidumbre', () => {
  const eng = new ParaxialEngine(new ConstantOffsetPredictor(1.7));
  const r = eng.predict({
    al_mm: 23.5, k1_d: 43, k1_axis_deg: 180, k2_d: 44, k2_axis_deg: 90,
    acd_mm: 3.2, target_d: 0, meta: { source: 'synthetic' },
  });
  assert.equal(r.warnings[0], RUO_WARNING);
  assert.ok(Number.isFinite(r.recommended_power));
  assert.ok(r.uncertainty.sensitivities.iol_position_mm > 0);
  assert.ok(r.alternative && Number.isFinite(r.alternative.delta_d));
});

test('bench: comparación multi-motor sin red (EVO desde motor congelado)', () => {
  const engines = [new ParaxialEngine(new ConstantOffsetPredictor(1.7)), new EvoReplicaEngine()];
  const out = compareEngines(engines, {
    al_mm: 23.5, k1_d: 43, k1_axis_deg: 180, k2_d: 45, k2_axis_deg: 90,
    acd_mm: 3.2, lt_mm: 4.5, cct_um: 550, target_d: 0, a_constant: 119.3,
    iol_model: 'Posterior', meta: { source: 'synthetic' },
  });
  for (const id of Object.keys(out.results)) assert.ok(out.results[id].ok, id + ' falló');
  const evo = out.results['evo_replica_frozen_v1'].result;
  assert.equal(evo.recommended_power, 21, 'caso de referencia del baseline');
  // ambos motores dan potencias en el mismo orden de magnitud (no se exige acuerdo)
  const par = out.results[engines[0].id].result;
  assert.ok(Math.abs(par.recommended_power - evo.recommended_power) < 5);
});

test('bench: casos sin meta.source se rechazan (etiquetado obligatorio)', () => {
  assert.throws(() => assertBenchCase({ al_mm: 23, k1_d: 43, k2_d: 44, meta: {} }), TypeError);
});

test('sintético: reproducible por semilla y etiquetado', () => {
  const a = randomEyes(5, 42), b = randomEyes(5, 42), c = randomEyes(5, 43);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  for (const e of a) {
    assert.equal(e.meta.source, 'synthetic');
    assert.equal(e.meta.distribution, 'uniform_declared');
  }
  const g = gridEyes();
  assert.equal(g.length, 11 * 6);
  assert.ok(g.every(e => e.meta.kind === 'grid'));
  // el LCG genera en [0,1)
  const rnd = makeRng(7);
  for (let i = 0; i < 1000; i++) { const v = rnd(); assert.ok(v >= 0 && v < 1); }
});
