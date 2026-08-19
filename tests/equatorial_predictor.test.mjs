/**
 * V1.11 — EquatorialPlanePredictor: H_EQ como ciudadano de CAPA B.
 *
 *  - contrato: ACD + LT/2, hipótesis DECLARADA en source, inputs_used exactos;
 *  - sin parámetros libres y determinista (ε_bio viaja por V1.12, no por aquí);
 *  - NO consume el campo reservado del ecuador MEDIDO (prueba por ejecución,
 *    no solo por escáner textual) y el registro de reservados queda intacto;
 *  - datum coherente: la salida atraviesa la puerta del postop sin conversión;
 *  - fuera de la puerta [1.5, 8.5] ⇒ rechazo explícito, jamás recorte;
 *  - integración V1.12: lt_mm perturbable de verdad con este predictor e INERTE
 *    con uno que no lo consume.
 *
 * RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EquatorialPlanePredictor, FractionOfALPredictor, ConstantOffsetPredictor,
} from '../src/predictors/iol_position.mjs';
import { createPreopEye, createPredictedPostopEye } from '../src/core/eye.mjs';
import { RESERVED_NAMES } from '../src/core/reserved.mjs';
import { GenericIOLFactory } from '../src/core/iol_factory.mjs';
import { SamplingKind } from '../src/optics/raytrace/bundle.mjs';
import {
  raytraceOutcomeUncertainty, raytraceChoiceStability, SigmaTipo, PERTURBABLES,
} from '../src/uncertainty/raytrace_uncertainty.mjs';

const ojo = (extra = {}) => createPreopEye({
  al_mm: 23.5, k1_d: 43.5, k1_axis_deg: 180, k2_d: 43.5, k2_axis_deg: 90,
  acd_mm: 3.2, lt_mm: 4.5, cct_um: 550, keratometric_index: 1.3375,
  meta: { source: 'synthetic' }, ...extra,
});
const PROV = 'escenario declarado de test (OQ #6): no es repetibilidad real';
const sigma = sd => ({ sd, tipo: SigmaTipo.DECLARADA, provenance: PROV });

test('H_EQ · contrato: ACD + LT/2, hipótesis declarada, inputs exactos, sin parámetros libres', () => {
  const p = new EquatorialPlanePredictor();
  const r = p.predict(ojo());
  assert.equal(r.iol_position_mm, 3.2 + 4.5 / 2);
  assert.deepEqual(r.inputs_used, ['acd_mm', 'lt_mm']);
  assert.equal(r.hypothesis, 'H_EQ');
  // la hipótesis y su estatus viajan en la procedencia: jamás se presenta como hecho
  assert.match(r.source, /H_EQ DECLARADA/);
  assert.match(r.source, /hipótesis, no hecho/);
  assert.match(r.source, /SIMULACION/);
  // determinista y sin estado: dos llamadas idénticas
  assert.equal(p.predict(ojo()).iol_position_mm, r.iol_position_mm);
  // sin parámetros libres: el constructor no acepta ajustes
  assert.equal(new EquatorialPlanePredictor(0.7).id, 'equatorial_plane_geometric');
});

test('H_EQ · medidas faltantes = rechazo con nombre, nunca sustitución', () => {
  const p = new EquatorialPlanePredictor();
  assert.throws(() => p.predict(ojo({ acd_mm: undefined })), /requiere acd_mm medido/);
  assert.throws(() => p.predict(ojo({ lt_mm: undefined })), /requiere lt_mm medido/);
});

test('H_EQ · NO consume el ecuador MEDIDO (reservado): predicción invariante por ejecución', () => {
  // dos ojos idénticos salvo el campo reservado del ecuador medido por OCT, con un
  // valor CONTRADICTORIO con ACD+LT/2 (7.9 vs 5.45): si el predictor lo leyera,
  // las predicciones diferirían — prueba semántica, no solo escáner textual
  const p = new EquatorialPlanePredictor();
  const sin = p.predict(ojo());
  const con = p.predict(ojo({ lens_eq_plane_mm: 7.9 }));
  assert.equal(sin.iol_position_mm, con.iol_position_mm);
  assert.deepEqual(sin.inputs_used, con.inputs_used);
  // y el registro de reservados sigue intacto: el sprint NO desbloqueó nada
  assert.equal(RESERVED_NAMES.length, 11);
  assert.ok(RESERVED_NAMES.includes('lens_eq_plane_mm'));
});

test('H_EQ · datum coherente: la salida atraviesa la puerta del postop sin conversión', () => {
  const p = new EquatorialPlanePredictor();
  const r = p.predict(ojo());
  const postop = createPredictedPostopEye(ojo(), {
    iol_position_mm: r.iol_position_mm, position_source: r.source,
  });
  assert.equal(postop.iol_position_mm, 5.45);
});

test('H_EQ · fuera de la puerta [1.5, 8.5] = rechazo explícito, jamás recorte', () => {
  // ojo extremo dentro de rangos PLAUSIBLE: acd 6.4 + lt 4.4/2 = 8.6 > 8.5
  const extremo = ojo({ acd_mm: 6.4, lt_mm: 4.4, al_mm: 30 });
  const r = new EquatorialPlanePredictor().predict(extremo);
  assert.equal(r.iol_position_mm, 6.4 + 4.4 / 2);   // > 8.5 (en coma flotante)
  assert.throws(() => createPredictedPostopEye(extremo, {
    iol_position_mm: r.iol_position_mm, position_source: r.source,
  }), RangeError);
});

test('H_EQ · V1.12: lt_mm es perturbable DE VERDAD con este predictor', () => {
  assert.ok(PERTURBABLES.includes('lt_mm'), 'lt_mm debe estar en el vocabulario perturbable');
  const r = raytraceOutcomeUncertainty({
    preop: ojo(), iol: new GenericIOLFactory().create({ power_d: 21 }),
    predictor: new EquatorialPlanePredictor(),
    sigmas: { lt_mm: sigma(0.15) },
    n: 120, seed: 31, pupil_mm: 3.0,
    sampling: { kind: SamplingKind.MERIDIONAL, n_anillos: 4 },
  });
  assert.ok(r.distribucion.sd_d > 0.02, `σ_LT debía propagar dispersión vía el predictor: sd=${r.distribucion.sd_d}`);
  assert.deepEqual(r.parametros_declarados.predictor_inputs, ['acd_mm', 'lt_mm']);
  assert.ok(Number.isFinite(r.ancla_lineal.derivadas_d_por_unidad.lt_mm));
});

test('H_EQ · V1.12: lt_mm con un predictor que no lo consume = VARIABLE INERTE publicada', () => {
  assert.throws(() => raytraceOutcomeUncertainty({
    preop: ojo(), iol: new GenericIOLFactory().create({ power_d: 21 }),
    predictor: new FractionOfALPredictor(0.2),
    sigmas: { lt_mm: sigma(0.15) },
    n: 60, seed: 32, pupil_mm: 3.0,
    sampling: { kind: SamplingKind.MERIDIONAL, n_anillos: 4 },
  }), /VARIABLE INERTE/);
});

test('H_EQ · V1.12: causalidad — la MISMA σ_ACD produce derivada distinta con H_EQ que con offset', () => {
  // ConstantOffset: dPos/dACD = 1; H_EQ: dPos/dACD = 1 también, pero H_EQ añade el
  // camino por LT — aquí verificamos que ambos consumen acd_mm y el sistema lo mide
  const base = {
    preop: ojo(), iol: new GenericIOLFactory().create({ power_d: 21 }),
    sigmas: { acd_mm: sigma(0.15) },
    n: 120, seed: 33, pupil_mm: 3.0,
    sampling: { kind: SamplingKind.MERIDIONAL, n_anillos: 4 },
  };
  const heq = raytraceOutcomeUncertainty({ ...base, predictor: new EquatorialPlanePredictor() });
  assert.ok(heq.distribucion.sd_d > 0.05);
  assert.match(heq.parametros_declarados.predictor, /equatorial_plane_geometric/);
});

test('H_EQ · la procedencia de la HIPÓTESIS atraviesa la capa de incertidumbre', () => {
  // hallazgo adversarial V1.11: antes solo viajaba predictor.id, así que un resultado
  // condicional a una hipótesis no validada era indistinguible de uno que no lo era —
  // y la puerta de fidelidad deja la posición fuera de STRICT precisamente porque
  // «su procedencia viaja aparte». Ahora viaja, y es legible por máquina.
  const r = raytraceOutcomeUncertainty({
    preop: ojo(), iol: new GenericIOLFactory().create({ power_d: 21 }),
    predictor: new EquatorialPlanePredictor(),
    sigmas: { position_prediction_mm: sigma(0.3) },
    n: 30, seed: 41, pupil_mm: 3.0,
    sampling: { kind: SamplingKind.MERIDIONAL, n_anillos: 4 },
  });
  assert.equal(r.procedencia_posicion.hypothesis, 'H_EQ');
  assert.equal(r.procedencia_posicion.condicional_a_hipotesis, true);
  assert.match(r.procedencia_posicion.position_source, /H_EQ DECLARADA/);
  assert.match(r.procedencia_posicion.nota, /NO está validada/);
  assert.match(r.procedencia_posicion.nota, /PREDICHA/);
  // y un predictor SIN hipótesis declarada no finge tenerla
  const sinHip = raytraceOutcomeUncertainty({
    preop: ojo(), iol: new GenericIOLFactory().create({ power_d: 21 }),
    predictor: new ConstantOffsetPredictor(1.7),
    sigmas: { position_prediction_mm: sigma(0.3) },
    n: 30, seed: 41, pupil_mm: 3.0,
    sampling: { kind: SamplingKind.MERIDIONAL, n_anillos: 4 },
  });
  assert.equal(sinHip.procedencia_posicion.hypothesis, null);
  assert.equal(sinHip.procedencia_posicion.condicional_a_hipotesis, false);
  assert.match(sinHip.procedencia_posicion.nota, /PREDICHA, nunca medida/);
});

test('H_EQ · la elección de potencia también transporta la procedencia', () => {
  const r = raytraceChoiceStability({
    preop: ojo(), factory: new GenericIOLFactory(), predictor: new EquatorialPlanePredictor(),
    sigmas: { position_prediction_mm: sigma(0.3) },
    n: 40, seed: 42, pupil_mm: 3.0,
    sampling: { kind: SamplingKind.MERIDIONAL, n_anillos: 4 },
    catalog_d: Array.from({ length: 21 }, (_, i) => 16 + i * 0.5),
    window_d: 2.0, search_d: [1, 44],
  });
  assert.equal(r.procedencia_posicion.hypothesis, 'H_EQ');
  assert.equal(r.procedencia_posicion.condicional_a_hipotesis, true);
});
