/**
 * V1.8 — RaytraceEngine en el benchmark: contrato de COMPARABILIDAD.
 *
 * Los ocho criterios de aceptación del encargo, uno a uno:
 *  1. pose cero + pupila→0 + geometría compatible → converge al ancla paraxial;
 *  2. adapter ≡ pipeline directo con los mismos parámetros (igualdad exacta);
 *  3. ningún input del caso se pierde en silencio al cruzar BenchCase → dominio;
 *  4. geometría UNKNOWN = FALLO reportado, jamás sustituto;
 *  5. STRICT atraviesa la capa benchmark (bloquea enumerando y también PASA);
 *  6. cambiar solo pupil_mm cambia solo el grado de libertad esperado;
 *  7. warnings sin "error frente a EVO" ni superioridad — solo divergencia;
 *  8. una dimensión UNSUPPORTED jamás se presenta como cero físico.
 *
 * RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RaytraceEngine } from '../src/bench/engines/raytrace_engine.mjs';
import { ParaxialEngine } from '../src/bench/engines/paraxial_engine.mjs';
import { EvoReplicaEngine } from '../src/bench/engines/evo_engine.mjs';
import { controlledPhysicsComparison, fullEngineComparison } from '../src/bench/comparisons.mjs';
import { compareEngines } from '../src/bench/interface.mjs';
import { createPredictionResult } from '../src/core/result.mjs';
import { GenericIOLFactory, ManufacturerIOLFactory } from '../src/core/iol_factory.mjs';
import { createIOL, GeometryStatus } from '../src/core/iol.mjs';
import { ConstantOffsetPredictor } from '../src/predictors/iol_position.mjs';
import { ObjectiveKind } from '../src/optics/objective.mjs';
import { SamplingKind } from '../src/optics/raytrace/bundle.mjs';
import { FidelityMode, StrictModeViolation } from '../src/core/fidelity.mjs';
import { optimizePowerByRaytrace } from '../src/optimize/raytrace_power.mjs';
import { createPreopEye, createPredictedPostopEye } from '../src/core/eye.mjs';
import { buildRaytraceEye, paraxialFocusOfRaytraceEye } from '../src/optics/eyebuilder.mjs';

const PROV = 'FICTICIA — fixture de test, no es una ficha real de fabricante';
const CATALOGO = Array.from({ length: 25 }, (_, i) => 15 + i * 0.5);

const caso = (extra = {}) => ({
  al_mm: 23.5, k1_d: 43.5, k1_axis_deg: 180, k2_d: 43.5, k2_axis_deg: 90,
  acd_mm: 3.2, lt_mm: 4.5, cct_um: 550, k_index: 1.3375, target_d: 0,
  meta: { source: 'synthetic' },
  ...extra,
});

const motor = (extra = {}) => new RaytraceEngine({
  positionPredictor: new ConstantOffsetPredictor(1.7),
  iolFactory: new GenericIOLFactory(),
  objective: ObjectiveKind.EQUIVALENT_DEFOCUS,
  sampling: { kind: SamplingKind.MERIDIONAL, n_anillos: 5 },
  search_d: [5, 40],
  catalog_d: CATALOGO,
  cornea: {},
  fidelity: FidelityMode.RESEARCH,
  pupil_mm: 3.0,
  ...extra,
});

test('bench · construcción: TODO se inyecta explícitamente — ningún parámetro se escoge en silencio', () => {
  const base = {
    positionPredictor: new ConstantOffsetPredictor(1.7), iolFactory: new GenericIOLFactory(),
    objective: ObjectiveKind.EQUIVALENT_DEFOCUS,
    sampling: { kind: SamplingKind.MERIDIONAL, n_anillos: 5 },
    search_d: [5, 40], cornea: {}, fidelity: FidelityMode.RESEARCH, pupil_mm: 3.0,
  };
  for (const falta of ['positionPredictor', 'iolFactory', 'objective', 'sampling', 'search_d', 'cornea', 'fidelity', 'pupil_mm']) {
    const sin = { ...base };
    delete sin[falta];
    assert.throws(() => new RaytraceEngine(sin), Error, `${falta} ausente debía rechazarse`);
  }
});

test('bench · criterio 1: pupila→0 y pose cero convergen al ancla paraxial del sistema controlado', () => {
  const m = motor({ pupil_mm: 0.1 });
  const r = m.predict(caso());
  // el ancla V1.13: el foco PARAXIAL del MISMO sistema físico a la potencia continua
  // debe caer en la retina (pupila→0 ⇒ el trazado y las vergencias coinciden)
  const preop = createPreopEye({
    al_mm: 23.5, k1_d: 43.5, k1_axis_deg: 180, k2_d: 43.5, k2_axis_deg: 90,
    acd_mm: 3.2, lt_mm: 4.5, cct_um: 550, keratometric_index: 1.3375, meta: { source: 'synthetic' },
  });
  const postop = createPredictedPostopEye(preop, {
    iol_position_mm: r.intermediate_values.iol_position_mm,
    position_source: 'ancla de test',
  });
  const eye = buildRaytraceEye(postop, new GenericIOLFactory().create({ power_d: r.intermediate_values.exact_power_d }));
  const zFoco = paraxialFocusOfRaytraceEye(eye);
  assert.ok(Math.abs(zFoco - eye.retina_z_mm) < 2e-3,
    `foco paraxial a ${zFoco} mm vs retina ${eye.retina_z_mm} (Δ=${Math.abs(zFoco - eye.retina_z_mm)})`);
  // y la comparación CONTROLLED_PHYSICS verifica sus controles y aísla el modelo óptico
  const predictor = new ConstantOffsetPredictor(1.7);
  const cmp = controlledPhysicsComparison({
    paraxialEngine: new ParaxialEngine(predictor),
    raytraceEngine: motor({ positionPredictor: predictor, pupil_mm: 0.1 }),
    benchCase: caso(),
  });
  assert.equal(cmp.modo, 'CONTROLLED_PHYSICS');
  assert.ok(cmp.controles_verificados.length >= 3);
  assert.ok(Number.isFinite(cmp.divergencia.exact_power_d));
  // la divergencia paraxial(delgada)↔trazado(gruesa) del modelo óptico es acotada
  assert.ok(Math.abs(cmp.divergencia.exact_power_d) < 1.5,
    `divergencia de modelo óptico implausible: ${cmp.divergencia.exact_power_d} D`);
  // y las refracciones NO se restan: convenciones declaradas distintas
  assert.match(cmp.no_directamente_comparable.predicted_refraction, /convenciones distintas/);
});

test('bench · criterio 1b: los controles de CONTROLLED_PHYSICS se VERIFICAN — predictores distintos = rechazo', () => {
  assert.throws(() => controlledPhysicsComparison({
    paraxialEngine: new ParaxialEngine(new ConstantOffsetPredictor(1.7)),
    raytraceEngine: motor({ positionPredictor: new ConstantOffsetPredictor(2.1) }),
    benchCase: caso(),
  }), /control violado/);
});

test('bench · criterio 2: el adapter produce EXACTAMENTE lo mismo que el pipeline directo', () => {
  const m = motor();
  const r = m.predict(caso());
  // pipeline directo con los MISMOS parámetros
  const preop = createPreopEye({
    al_mm: 23.5, k1_d: 43.5, k1_axis_deg: 180, k2_d: 43.5, k2_axis_deg: 90,
    acd_mm: 3.2, lt_mm: 4.5, cct_um: 550, keratometric_index: 1.3375, meta: { source: 'synthetic' },
  });
  const pos = new ConstantOffsetPredictor(1.7).predict(preop);
  const postop = createPredictedPostopEye(preop, { iol_position_mm: pos.iol_position_mm, position_source: pos.source });
  const directo = optimizePowerByRaytrace({
    postop, factory: new GenericIOLFactory(), objective: ObjectiveKind.EQUIVALENT_DEFOCUS,
    catalog_d: CATALOGO, pupil_mm: 3.0, sampling: SamplingKind.MERIDIONAL, n_anillos: 5, perRing: 6,
    search_d: [5, 40], cornea: {}, fidelity: FidelityMode.RESEARCH,
  });
  assert.equal(r.recommended_power, directo.best.power_d);
  assert.equal(r.predicted_refraction, directo.best.residual_d);
  assert.equal(r.intermediate_values.exact_power_d, directo.exact_power_d);
  assert.equal(r.alternative.power, directo.second.power_d);
  assert.deepEqual(r.intermediate_values.supuestos_trazado, directo.supuestos_trazado);
});

test('bench · criterio 3: ningún input se pierde en silencio — desconocidos rechazados, EVO/tóricos con nombre', () => {
  const m = motor();
  // campo desconocido → rechazo NOMBRÁNDOLO
  assert.throws(() => m.predict(caso({ campo_sorpresa: 1 })), /campo_sorpresa/);
  // a_constant / iol_model: entradas EVO, ignoradas CON NOMBRE, jamás fingidas
  const r = m.predict(caso({ a_constant: 119.3, iol_model: 'Posterior' }));
  assert.deepEqual(r.intermediate_values.evo_inputs_ignorados, ['a_constant', 'iol_model']);
  assert.ok(r.warnings.some(w => /específicas de EVO ignoradas.*a_constant, iol_model/.test(w)));
  // sia_d: entrada de la dimensión tórica UNSUPPORTED
  const r2 = m.predict(caso({ k1_d: 42, k2_d: 45, sia_d: 0.3, sia_axis_deg: 100 }));
  assert.deepEqual(r2.intermediate_values.toric_inputs_ignorados, ['sia_d', 'sia_axis_deg']);
  // target_d ≠ 0: no soportado → rechazo, no resta fingida
  assert.throws(() => m.predict(caso({ target_d: -0.5 })), /target_d ≠ 0 no soportado/);
  // pupila del caso exige procedencia
  assert.throws(() => m.predict(caso({ pupil_mm: 4.5 })), /pupil_source/);
});

test('bench · criterio 4: geometría UNKNOWN = FALLO reportado, nunca sustituto', () => {
  const mfrVacia = new ManufacturerIOLFactory({
    manufacturer: 'ACME', model: 'SIN_FICHA', provenance: PROV,
    geometryByPower: { 21: { refractive_index: 1.47, central_thickness_mm: 0.7, r_anterior_mm: 20, r_posterior_mm: -20 } },
  });
  const m = motor({ iolFactory: mfrVacia, catalog_d: [20, 21, 22] });
  const out = compareEngines([m], caso());
  assert.equal(out.results[m.id].ok, false);
  assert.match(out.results[m.id].error, /geometría trazable|no se traza|prohibido sustituir/i);
});

test('bench · criterio 5: STRICT atraviesa la capa benchmark — bloquea enumerando y también PASA', () => {
  // BLOQUEA: caso solo-K → la política de lectura lleva supuestos y STRICT los enumera
  const estricto = motor({ fidelity: FidelityMode.STRICT });
  assert.throws(() => estricto.predict(caso()),
    err => err instanceof StrictModeViolation && /P = K/.test(err.message));
  // PASA: córnea medida con Q por el caso (passthrough V1.8) + lente de fabricante
  // documentada con Q → supuestos_trazado vacío a través del benchmark. La fábrica
  // "espía" cubre el CONTINUO (la sección áurea sondea potencias fuera del catálogo:
  // una tabla discreta fallaría por UNKNOWN, que es SU contrato — aquí se aísla STRICT)
  const gen = new GenericIOLFactory();
  const mfrDocumentada = {
    id: 'mfr_continua_ficticia',
    create({ power_d }) {
      const g = gen.create({ power_d }).geometry;
      return createIOL({
        manufacturer: 'ACME', model: 'MQ_CONT', nominal_power_d: power_d,
        cylinder_d: 0,   // esférica DECLARADA (UNKNOWN registraría supuesto y bloquearía STRICT)
        geometry: {
          refractive_index: g.refractive_index, central_thickness_mm: g.central_thickness_mm,
          r_anterior_mm: g.r_anterior_mm, r_posterior_mm: g.r_posterior_mm,
          asphericity_q_anterior: -0.1, asphericity_q_posterior: -0.1,
        },
        geometry_status: GeometryStatus.MANUFACTURER, provenance: PROV,
        source: 'fixture de fabricante continua (test)',
      });
    },
  };
  const r = motor({ iolFactory: mfrDocumentada, fidelity: FidelityMode.STRICT }).predict(caso({
    cornea: {
      r_anterior_mm: 7.7, r_posterior_mm: 6.8,
      asphericity_q_anterior: -0.18, asphericity_q_posterior: -0.30,
    },
  }));
  assert.deepEqual(r.intermediate_values.supuestos_trazado, []);
  assert.equal(r.intermediate_values.fidelity, FidelityMode.STRICT);
  assert.equal(r.intermediate_values.cornea_policy, 'TWO_SURFACE_MEASURED');
});

test('bench · criterio 5b: pupila jamás cae al defecto silencioso — FROM_CASE sin pupila = rechazo explícito', () => {
  const m = motor({ pupil_mm: 'FROM_CASE' });
  assert.throws(() => m.predict(caso()), /no se cae en silencio al 3\.0 mm/);
  const r = m.predict(caso({ pupil_mm: 4.5, pupil_source: 'escenario declarado del caso' }));
  assert.equal(r.intermediate_values.pupil_mm, 4.5);
  assert.equal(r.intermediate_values.pupil_source, 'escenario declarado del caso');
});

test('bench · criterio 6: cambiar SOLO pupil_mm cambia solo el grado de libertad esperado', () => {
  const m = motor({ pupil_mm: 'FROM_CASE' });
  const chica = m.predict(caso({ pupil_mm: 2.0, pupil_source: 'escenario declarado' }));
  const grande = m.predict(caso({ pupil_mm: 5.5, pupil_source: 'escenario declarado' }));
  const a = chica.intermediate_values, b = grande.intermediate_values;
  // todo lo NO óptico idéntico: posición, política, muestreo, fidelidad, pose
  assert.equal(a.iol_position_mm, b.iol_position_mm);
  assert.equal(a.position_source, b.position_source);
  assert.equal(a.cornea_policy, b.cornea_policy);
  assert.equal(a.sampling, b.sampling);
  assert.equal(a.fidelity, b.fidelity);
  assert.deepEqual(a.pose, b.pose);
  // el canal esperado SÍ cambia: pupila distinta ⇒ óptimo continuo distinto
  // (aberración esférica de la lente gruesa; el paraxial no lo vería)
  assert.equal(a.pupil_mm, 2.0);
  assert.equal(b.pupil_mm, 5.5);
  assert.ok(Math.abs(a.exact_power_d - b.exact_power_d) > 1e-5,
    `la pupila debía mover el óptimo del trazado: ${a.exact_power_d} vs ${b.exact_power_d}`);
});

test('bench · criterio 7: FULL_ENGINE = DIVERGENCIA ENTRE MOTORES, sin "error" ni superioridad', () => {
  const full = fullEngineComparison({
    raytraceEngine: motor(),
    evoEngine: new EvoReplicaEngine(),
    benchCase: caso({ a_constant: 119.3, iol_model: 'Posterior' }),
  });
  assert.equal(full.modo, 'FULL_ENGINE');
  assert.match(full.denominacion, /DIVERGENCIA ENTRE MOTORES/);
  assert.ok(Number.isFinite(full.divergencia_entre_motores.recommended_power_d));
  assert.ok(full.diferencias_de_configuracion.length >= 4, 'las diferencias de configuración se listan');
  assert.match(full.atribucion, /IMPOSIBLE atribuir/);
  // ni "error" ni superioridad en NINGÚN texto de la comparación ni en los warnings
  const texto = JSON.stringify(full).toLowerCase();
  assert.ok(!texto.includes('error'), 'la comparación con EVO jamás dice "error"');
  assert.ok(!/superior|mejor que|acierta más/.test(texto), 'jamás superioridad');
});

test('bench · criterio 8: una dimensión UNSUPPORTED jamás se presenta como cero físico', () => {
  // caso ASTIGMÁTICO: el trazado no optimiza cilindro+eje → tórico declarado UNSUPPORTED
  const r = motor().predict(caso({ k1_d: 42, k2_d: 45 }));
  assert.deepEqual([...r.unsupported_dimensions], ['toric']);
  assert.equal(r.predicted_cylinder, null);
  assert.equal(r.recommended_toric, null);
  assert.equal(r.recommended_axis, null);
  assert.ok(r.warnings.some(w => /UNSUPPORTED.*no es un cero físico/.test(w)));
  // caso SIN astigmatismo: cilindro 0 SÍ es física del modelo
  const r0 = motor().predict(caso());
  assert.deepEqual([...r0.unsupported_dimensions], []);
  assert.equal(r0.predicted_cylinder, 0);
  // el ParaxialEngine sin catálogo tórico sobre caso astigmático: mismo contrato
  const par = new ParaxialEngine(new ConstantOffsetPredictor(1.7)).predict(caso({ k1_d: 42, k2_d: 45 }));
  assert.deepEqual([...par.unsupported_dimensions], ['toric']);
  assert.equal(par.predicted_cylinder, null);
  // y el propio PredictionResult IMPIDE un tórico falsamente completo
  assert.throws(() => createPredictionResult({
    engine: 'x', predicted_refraction: 0, recommended_power: 20,
    unsupported_dimensions: ['toric'], recommended_toric: 1.5,
    predicted_cylinder: null, predicted_axis: null, recommended_axis: null,
  }), /no lleva valores que parezcan físicos/);
  // ...y un null sin declaración es ambigüedad prohibida
  assert.throws(() => createPredictionResult({
    engine: 'x', predicted_refraction: 0, recommended_power: 20, predicted_cylinder: null,
  }), /SIN declarar/);
});
