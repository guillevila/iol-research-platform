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
  // y la comparación CONTROLLED_PHYSICS verifica sus controles y aísla el modelo
  // óptico: exige MISMO predictor, MISMA córnea y MISMA LENTE GRUESA (la lente
  // delgada del paraxial dominaba la cifra — hallazgo adversarial V1.8)
  const predictor = new ConstantOffsetPredictor(1.7);
  const factoryCompartida = new GenericIOLFactory();
  const cmp = controlledPhysicsComparison({
    paraxialEngine: new ParaxialEngine(predictor, { iolFactory: factoryCompartida }),
    raytraceEngine: motor({ positionPredictor: predictor, iolFactory: factoryCompartida, pupil_mm: 0.1 }),
    benchCase: caso(),
  });
  assert.equal(cmp.modo, 'CONTROLLED_PHYSICS');
  assert.ok(cmp.controles_verificados.length >= 6);
  assert.ok(cmp.controles_verificados.some(x => /lens_model/.test(x)));
  // con TODO controlado y pupila→0, la divergencia del modelo óptico es ~0: el trazado
  // converge al paraxial del MISMO sistema (esta es la afirmación fuerte de V1.8)
  assert.ok(Math.abs(cmp.divergencia.exact_power_d) < 5e-3,
    `pupila→0 debía converger al paraxial: ${cmp.divergencia.exact_power_d} D`);
  // y las refracciones NO se restan: convenciones declaradas distintas
  assert.match(cmp.no_directamente_comparable.predicted_refraction, /convenciones distintas/);
  // la potencia RECOMENDADA no se compara si las cuantizaciones difieren
  assert.equal(cmp.divergencia.recommended_power_d, null);
  assert.match(cmp.no_directamente_comparable.recommended_power, /cuantizaciones|DISTINTOS/);
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
  // la clave es `fallo` (excepción de EJECUCIÓN), no "error": la terminología de
  // divergencia se reserva a las comparaciones entre motores
  assert.match(out.results[m.id].fallo, /geometría trazable|no se traza|prohibido sustituir/i);
  assert.equal(out.results[m.id].error, undefined);
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

// ---------------------------------------------------------------------------------
// Regresiones de la REVISIÓN ADVERSARIAL V1.8 (adaptador).
// ---------------------------------------------------------------------------------

test('bench · adversarial: el objetivo A no es publicable en el contrato (unidades ≠ dioptrías)', () => {
  // antes: con SPOT_RMS_AT_RETINA, predicted_refraction pasaba a ser mm de RMS con el
  // mismo nombre y un warning que afirmaba que eran dioptrías (0.0037 "D" parecía
  // emetropía casi perfecta y eran 3.7 µm de spot)
  assert.throws(() => motor({ objective: ObjectiveKind.SPOT_RMS_AT_RETINA }),
    /radio RMS en mm|dioptrías/);
});

test('bench · adversarial: la pupila no tiene precedencia tácita — conflicto motor↔caso = rechazo', () => {
  // antes: el caso ganaba en silencio sobre la pupila del motor (1.58 D de movimiento)
  const m = motor({ pupil_mm: 3.0 });
  assert.throws(() => m.predict(caso({ pupil_mm: 5.5, pupil_source: 'medida del preop' })),
    /CONFLICTO de pupila.*FROM_CASE/s);
  // coincidencia exacta: no es conflicto (y la procedencia del caso es la que viaja)
  const r = m.predict(caso({ pupil_mm: 3.0, pupil_source: 'medida del preop' }));
  assert.equal(r.intermediate_values.pupil_source, 'medida del preop');
});

test('bench · adversarial: las opciones corneales tienen vocabulario CERRADO', () => {
  // antes: `cornea` tragaba cualquier clave; lo peor, opciones de ratio SIN policy
  // caían a P=K en silencio (1.59 D) creyendo haber configurado la política
  assert.throws(() => motor({ cornea: { cornea_toric: { policy: 'X' } } }), /no reconocidas/);
  assert.throws(() => motor({ cornea: { toric: true } }), /no reconocidas/);
  assert.throws(() => motor({
    cornea: { posterior_ratio: 0.82, provenance: 'ratio de ojo esquemático — test' },
  }), /SIN `policy` declarada/);
  // con policy declarada, la opción es válida
  const ok = motor({
    cornea: { policy: 'TWO_SURFACE_RATIO', posterior_ratio: 0.883, provenance: 'ratio de test declarado' },
  });
  assert.equal(ok.predict(caso()).intermediate_values.cornea_policy, 'TWO_SURFACE_RATIO');
});

test('bench · adversarial: el catálogo debe CONTENER el óptimo — un borde no es recomendación', () => {
  // antes: catálogo [1,2,3] con óptimo en 19.65 D recomendaba 3 D en silencio
  const m = motor({ catalog_d: [1, 2, 3] });
  assert.throws(() => m.predict(caso()), /FUERA del catálogo|BORDE, no un óptimo/);
});

test('bench · adversarial: meta y córnea del caso viajan enteras; una clave corneal mal escrita FALLA', () => {
  const espia = {
    id: 'espia', predict(preop) { this.visto = preop; return { iol_position_mm: 4.9, source: 'espía' }; },
  };
  const m = motor({ positionPredictor: espia });
  m.predict(caso({ meta: { source: 'measured', device: 'DISPOSITIVO_X', note: 'NOTA QUE NO DEBE PERDERSE' } }));
  assert.equal(espia.visto.meta.device, 'DISPOSITIVO_X');
  assert.equal(espia.visto.meta.note, 'NOTA QUE NO DEBE PERDERSE');
  // un typo en una clave corneal ya no se descarta en silencio afirmando "no medida"
  assert.throws(() => motor().predict(caso({
    cornea: { r_anterior_mm: 7.7, asphericity_q_ant: -0.18 },
  })), /claves corneales no reconocidas: asphericity_q_ant/);
});

test('bench · adversarial: SIA declarada con K esférica tampoco publica un cilindro 0 "físico"', () => {
  const r = motor().predict(caso({ sia_d: 0.75, sia_axis_deg: 90 }));
  assert.deepEqual([...r.unsupported_dimensions], ['toric']);
  assert.equal(r.predicted_cylinder, null);
  assert.deepEqual(r.intermediate_values.toric_inputs_ignorados, ['sia_d', 'sia_axis_deg']);
});

test('bench · adversarial: compareEngines rechaza ids duplicados (uno desaparecía en silencio)', () => {
  const a = motor({ pupil_mm: 2.0 });
  const b = motor({ pupil_mm: 5.0 });    // configuración distinta, MISMO id
  assert.equal(a.id, b.id);
  assert.throws(() => compareEngines([a, b], caso()), /ids de motor DUPLICADOS/);
});

test('bench · adversarial: un fallo de motor en las comparaciones se nombra y lleva etiqueta', () => {
  // antes: la excepción de EVO fuera de dominio escapaba cruda, sin decir qué motor
  const fuera = caso({ al_mm: 35, a_constant: 119.3 });
  assert.throws(() => fullEngineComparison({
    raytraceEngine: motor({ search_d: [1, 40], catalog_d: null }),
    evoEngine: new EvoReplicaEngine(), benchCase: fuera,
  }), err => /SIMULACION/.test(err.message) && /el motor (raytrace|evo_replica)/.test(err.message));
});

test('bench · adversarial: la trazabilidad declarada está COMPLETA (si un refactor la vacía, falla aquí)', () => {
  const r = motor().predict(caso({ a_constant: 119.3 }));
  const iv = r.intermediate_values;
  for (const campo of ['position_predictor', 'position_source', 'iol_position_mm', 'iol_factory',
    'iol_geometry_status', 'iol_provenance', 'is_simulation_surrogate', 'objective', 'objective_label',
    'pupil_mm', 'pupil_source', 'sampling', 'n_anillos', 'perRing', 'rayos', 'muestreo_2d',
    'cornea_policy', 'cornea_rotationally_symmetric', 'fidelity', 'search_d', 'tol_d', 'catalog_d',
    'target_d', 'exact_power_d', 'at_exact', 'at_recommended', 'lens_model', 'supuestos_trazado',
    'refraction_convention', 'evo_inputs_ignorados', 'toric_inputs_ignorados']) {
    assert.ok(campo in iv, `falta el campo de trazabilidad: ${campo}`);
  }
  assert.equal(iv.pose, null);      // null ≡ DEFAULT_CENTERED, declarado
  assert.ok(iv.at_recommended.power_d === r.recommended_power);
});

test('bench · adversarial (menores): sphere sin descomposición, vocabulario, pupila plausible, perRing, modelo EVO', () => {
  // con la dimensión tórica UNSUPPORTED no hay descomposición: sphere también null
  const r = motor().predict(caso({ k1_d: 42, k2_d: 45 }));
  assert.equal(r.predicted_sphere, null);
  assert.ok(Number.isFinite(r.predicted_refraction), 'la refracción SÍ existe: es la dimensión esférica');
  // vocabulario cerrado de dimensiones
  assert.throws(() => createPredictionResult({
    engine: 'x', predicted_refraction: 0, recommended_power: 20, unsupported_dimensions: ['Toric'],
  }), /dimensión desconocida/);
  // pupila del escenario: rango plausible y procedencia con CONTENIDO
  assert.throws(() => motor({ pupil_mm: 'FROM_CASE' }).predict(
    caso({ pupil_mm: 25, pupil_source: 'medida' })), /fuera de plausibilidad/);
  assert.throws(() => motor({ pupil_mm: 'FROM_CASE' }).predict(
    caso({ pupil_mm: 4, pupil_source: '   ' })), /pupil_source/);
  // perRing: obligatorio donde aplica, rechazado donde es inerte
  assert.throws(() => motor({ sampling: { kind: SamplingKind.RINGS_EQUAL_AREA, n_anillos: 4 } }), /perRing OBLIGATORIO/);
  assert.throws(() => motor({ sampling: { kind: SamplingKind.MERIDIONAL, n_anillos: 5, perRing: 6 } }), /no aplica/);
  // un modelo comercial inexistente no produce una divergencia falsa
  assert.throws(() => new EvoReplicaEngine().predict(caso({ iol_model: 'NO_EXISTE_XYZ', a_constant: 119.3 })),
    /no existe en el benchmark congelado/);
});
