/** Tests del motor tórico independiente (Sprint 9): property tests de vectores + física por meridianos. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toVec, fromVec, addVec, scaleVec, cylFromMeridians, siaVec } from '../src/toric/vectors.mjs';
import { totalCornealAstigmatism, recommendToric } from '../src/toric/toric_engine.mjs';
import { createPreopEye, createPredictedPostopEye } from '../src/core/eye.mjs';
import { makeRng } from '../src/synth/generator.mjs';

const CATALOGO_TEST = [0, 1.0, 1.5, 2.25, 3.0, 3.75, 4.5, 5.25, 6.0]; // fixture explícita de test

function preopAstig({ k1 = 43, ax1 = 180, k2 = 45, ax2 = 90, posterior = null } = {}) {
  return createPreopEye({
    al_mm: 23.5, k1_d: k1, k1_axis_deg: ax1, k2_d: k2, k2_axis_deg: ax2,
    acd_mm: 3.2, lt_mm: 4.5, cct_um: 550,
    ...(posterior ? { cornea: posterior } : {}),
    meta: { source: 'synthetic' },
  });
}

test('vectores: ida y vuelta exacta y equivalencia mod 180', () => {
  const rnd = makeRng(2026);
  for (let i = 0; i < 200; i++) {
    const m = rnd() * 6, ax = rnd() * 180;
    const { magnitude_d, steepAxis_deg } = fromVec(toVec(m, ax));
    assert.ok(Math.abs(magnitude_d - m) < 1e-12);
    const d = Math.min(Math.abs(steepAxis_deg - ax), 180 - Math.abs(steepAxis_deg - ax));
    assert.ok(m < 1e-9 || d < 1e-9, `eje ${ax} → ${steepAxis_deg}`);
    // θ y θ+180 son el mismo vector
    const [x1, y1] = toVec(m, ax), [x2, y2] = toVec(m, ax + 180);
    assert.ok(Math.abs(x1 - x2) < 1e-9 && Math.abs(y1 - y2) < 1e-9);
  }
});

test('vectores: suma conmutativa y cancelación de perpendiculares iguales', () => {
  const a = toVec(2, 30), b = toVec(1.2, 100);
  assert.deepEqual(addVec(a, b), addVec(b, a));
  const s = addVec(toVec(1.5, 40), toVec(1.5, 130));
  assert.ok(Math.hypot(...s) < 1e-12, 'cilindros iguales perpendiculares se anulan');
  assert.deepEqual(scaleVec(a, 2), addVec(a, a));
});

test('vectores: cylFromMeridians con potencias firmadas (posterior negativa)', () => {
  // anterior 43@180 / 45@90 → 2 D curvo a 90
  const ant = fromVec(cylFromMeridians(43, 180, 45, 90));
  assert.ok(Math.abs(ant.magnitude_d - 2) < 1e-12 && Math.abs(ant.steepAxis_deg - 90) < 1e-9);
  // posterior −6.3@90 / −5.9@180: mayor potencia (−5.9) en 180 → curvo a 180
  const post = fromVec(cylFromMeridians(-6.3, 90, -5.9, 180));
  assert.ok(Math.abs(post.magnitude_d - 0.4) < 1e-12);
  assert.ok(post.steepAxis_deg < 1e-9 || Math.abs(post.steepAxis_deg - 180) < 1e-9);
  assert.throws(() => cylFromMeridians(43, 0, 45, 30), RangeError, 'no perpendiculares');
});

test('SIA: aplana el meridiano de la incisión (reduce WTR si se incide a 90)', () => {
  const eye = preopAstig();                        // 2 D curvo a 90 (WTR)
  const sin = totalCornealAstigmatism(eye);
  const con = totalCornealAstigmatism(eye, { sia_d: 0.5, sia_axis_deg: 90 });
  assert.ok(Math.abs(sin.magnitude_d - 2) < 1e-12);
  assert.ok(Math.abs(con.magnitude_d - 1.5) < 1e-12, 'incisión en el curvo resta');
  const contra = totalCornealAstigmatism(eye, { sia_d: 0.5, sia_axis_deg: 180 });
  assert.ok(Math.abs(contra.magnitude_d - 2.5) < 1e-12, 'incisión en el plano suma');
});

test('TCA: la posterior MEDIDA se compone; sin medida queda declarado', () => {
  const sinPost = totalCornealAstigmatism(preopAstig());
  assert.equal(sinPost.posterior_included, false);
  const conPost = totalCornealAstigmatism(preopAstig({
    posterior: { posterior_k1_d: -6.3, posterior_k2_d: -5.9, posterior_axis_deg: 90 },
  }));
  assert.equal(conPost.posterior_included, true);
  // posterior curva a 90 con potencia negativa → resta astigmatismo WTR: 2 − 0.4
  assert.ok(Math.abs(conPost.magnitude_d - 1.6) < 1e-12, String(conPost.magnitude_d));
});

test('recomendación tórica: residual mínimo, eje del TCA y física coherente', () => {
  const pre = preopAstig({ k1: 43, k2: 46 });      // 3 D WTR
  const post = createPredictedPostopEye(pre, { iol_position_mm: 4.9, position_source: 'test' });
  const r = recommendToric({ postop: post, sePower_d: 20, catalog_d: CATALOGO_TEST });
  assert.ok(Math.abs(r.implantation_axis_deg - 90) < 1e-9);
  // el cilindro recomendado sobrepasa el TCA corneal (plano LIO > plano corneal)
  assert.ok(r.recommended.cylinder_d >= 3.0, 'esperado ≥ TCA: ' + r.recommended.cylinder_d);
  // en el óptimo, el residual es menor que el de sus vecinos y pequeño
  assert.ok(Math.abs(r.recommended.residual_cyl_d) < 0.45);
  assert.ok(Math.abs(r.recommended.residual_cyl_d) <= Math.abs(r.alternative.residual_cyl_d));
  // el residual firmado cruza cero al recorrer el catálogo: con c=0 el meridiano
  // curvo queda miope (signo −) y al añadir cilindro se hipermetropiza (crece)
  const signos = CATALOGO_TEST.map(c => recommendToric({
    postop: post, sePower_d: 20, catalog_d: [c],
  }).recommended.signed_residual_d);
  for (let i = 1; i < signos.length; i++) assert.ok(signos[i] > signos[i - 1] - 1e-12, 'monotonía creciente');
  assert.ok(signos[0] < 0 && signos[signos.length - 1] > 0, 'cruce por cero dentro del catálogo');
  // sin posterior medida debe declararlo
  assert.ok(r.warnings.some(w => w.includes('posterior NO medida')));
});

test('recomendación tórica: catálogo obligatorio y eje oblicuo correcto', () => {
  const pre = preopAstig({ k1: 43, ax1: 35, k2: 44.5, ax2: 125 });
  const post = createPredictedPostopEye(pre, { iol_position_mm: 4.9, position_source: 'test' });
  assert.throws(() => recommendToric({ postop: post, sePower_d: 20, catalog_d: [] }), TypeError);
  const r = recommendToric({ postop: post, sePower_d: 20, catalog_d: CATALOGO_TEST });
  assert.ok(Math.abs(r.implantation_axis_deg - 125) < 1e-9, 'eje = meridiano curvo');
});
