/** Tests del core científico (Sprint 1): unidades, ojo, LIO, resultado, predictores. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mmToM, mToMm, degToRad, radToDeg, normMeridianDeg,
  focalMFromDiopters, dioptersFromFocalM, vergenceAtDistance, assertInRange,
} from '../src/core/units.mjs';
import { createPreopEye, createPredictedPostopEye } from '../src/core/eye.mjs';
import { createIOL, UNKNOWN, GeometryStatus, hasTraceableGeometry, assertTraceableGeometry } from '../src/core/iol.mjs';
import { createGenericThickIOL } from '../src/core/iol_factory.mjs';
import { createPredictionResult, RUO_WARNING } from '../src/core/result.mjs';
import { ConstantOffsetPredictor, FractionOfALPredictor, LinearRegressionPredictor } from '../src/predictors/iol_position.mjs';

const EYE_OK = {
  al_mm: 23.5, k1_d: 43.0, k1_axis_deg: 180, k2_d: 45.0, k2_axis_deg: 90,
  acd_mm: 3.2, lt_mm: 4.5, cct_um: 550, meta: { source: 'synthetic' },
};

test('units: round-trips exactos', () => {
  assert.equal(mToMm(mmToM(23.5)), 23.5);
  assert.ok(Math.abs(radToDeg(degToRad(37.25)) - 37.25) < 1e-12);
  assert.ok(Math.abs(dioptersFromFocalM(focalMFromDiopters(21, 1.336), 1.336) - 21) < 1e-12);
});

test('units: meridianos mod 180 y guardas', () => {
  assert.equal(normMeridianDeg(190), 10);
  assert.equal(normMeridianDeg(-10), 170);
  assert.equal(normMeridianDeg(180), 0);
  assert.throws(() => vergenceAtDistance(1.336, 0), RangeError);
  assert.throws(() => assertInRange(NaN, 0, 1, 'x'), TypeError);
  assert.throws(() => assertInRange(2, 0, 1, 'x'), RangeError);
});

test('eye: acepta parámetros ausentes y exige source', () => {
  const e = createPreopEye(EYE_OK);
  assert.equal(e.mean_k_d, 44);
  assert.equal(e.wtw_mm, null);           // ausente permitido
  assert.equal(e.cornea.r_posterior_mm, null);
  assert.throws(() => createPreopEye({ ...EYE_OK, meta: {} }), TypeError);
});

test('eye: rechaza valores absurdos', () => {
  assert.throws(() => createPreopEye({ ...EYE_OK, al_mm: 300 }), RangeError);
  assert.throws(() => createPreopEye({ ...EYE_OK, k1_d: 5 }), RangeError);
  assert.throws(() => createPreopEye({ ...EYE_OK, acd_mm: 0.2 }), RangeError);
});

test('eye: estado postoperatorio previsto, separado y etiquetado', () => {
  const pre = createPreopEye(EYE_OK);
  const post = createPredictedPostopEye(pre, { iol_position_mm: 4.9, position_source: 'test' });
  assert.equal(post.kind, 'predicted_postoperative_eye');
  assert.equal(post.preop, pre);
  assert.match(post.simulation_flag, /SIMULACION/);
  assert.throws(() => createPredictedPostopEye(pre, { iol_position_mm: 30 }), RangeError);
});

test('iol: una lente comercial sin geometría queda UNKNOWN, no genérica', () => {
  const iol = createIOL({ manufacturer: 'X', model: 'Y', nominal_power_d: 21 });
  assert.equal(iol.geometry_status, GeometryStatus.UNKNOWN);
  assert.equal(iol.is_simulation_surrogate, false);      // NO se degrada a genérica
  assert.deepEqual(iol.unknown_parameters,
    ['refractive_index', 'central_thickness_mm', 'r_anterior_mm', 'r_posterior_mm']);
  assert.equal(iol.geometry.r_anterior_mm, UNKNOWN);
  assert.equal(hasTraceableGeometry(iol), false);
  assert.throws(() => assertTraceableGeometry(iol), TypeError);
});

test('iol genérica: la lensmaker reproduce la potencia declarada', () => {
  const iol = createGenericThickIOL({ power_d: 21 });
  const { refractive_index: n, central_thickness_mm: t, r_anterior_mm: R1, r_posterior_mm: R2 } = iol.geometry;
  const nm = 1.336, D = n - nm, r1 = R1 / 1000, r2 = R2 / 1000, tm = t / 1000;
  const P = D * (1 / r1 - 1 / r2) + tm * D * D / (n * r1 * r2);
  assert.ok(Math.abs(P - 21) < 1e-9, `lensmaker devuelve ${P}`);
  assert.equal(iol.geometry_status, GeometryStatus.DERIVED_GENERIC);
  assert.equal(iol.is_simulation_surrogate, true);
  assert.match(iol.source, /SIMULACION/);
});

test('result: contrato completo y aviso RUO obligatorio', () => {
  const r = createPredictionResult({ engine: 't', predicted_refraction: -0.1, recommended_power: 21 });
  assert.equal(r.warnings[0], RUO_WARNING);
  for (const k of ['predicted_sphere', 'predicted_cylinder', 'alternative', 'uncertainty', 'intermediate_values']) {
    assert.ok(k in r);
  }
});

test('predictores de posición: implementaciones y guardas anti-invención', () => {
  const pre = createPreopEye(EYE_OK);
  const c = new ConstantOffsetPredictor(1.2).predict(pre);
  assert.ok(Math.abs(c.iol_position_mm - 4.4) < 1e-12);
  assert.match(c.source, /SIMULACION/);
  const f = new FractionOfALPredictor(0.2).predict(pre);
  assert.ok(Math.abs(f.iol_position_mm - 4.7) < 1e-12);
  // una regresión sin procedencia documentada debe ser inconstruible
  assert.throws(() => new LinearRegressionPredictor({ intercept_mm: 1, coef: { al_mm: 0.1 } }), TypeError);
  const lr = new LinearRegressionPredictor({
    intercept_mm: 0, coef: { acd_mm: 1.0 },
    provenance: 'fixture de test — no clinico',
  });
  assert.ok(Math.abs(lr.predict(pre).iol_position_mm - 3.2) < 1e-12);
});
