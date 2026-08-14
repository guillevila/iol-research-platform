/**
 * V1.9 — barridos de divergencia: las trampas que el encargo pide vigilar.
 *
 *  - ningún mapa mezcla lente delgada/gruesa (la comparación lo RECHAZA);
 *  - ningún default de pupila reaparece (sin pupila declarada no hay celda);
 *  - AL/K/pupila no se intercambian ni se redondean antes de tiempo;
 *  - una celda solo es CONTROLLED_PHYSICS si los controles son idénticos;
 *  - los casos rechazados NO desaparecen de los denominadores;
 *  - la cuantización no se interpreta como física;
 *  - la monotonía en pupila se OBSERVA, no se impone;
 *  - ninguna variable llamada `error` representa divergencia entre modelos;
 *  - ninguna salida afirma que un motor acierte o sea mejor.
 *
 * RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  controlledPhysicsSweep, fullEngineSweep, resumen, resumenPorEje, percentil,
  analizarMonotoniaEnPupila, classifyRejection, RejectionReason, bandaDe, BANDAS_D,
} from '../src/bench/divergence.mjs';
import { ParaxialEngine } from '../src/bench/engines/paraxial_engine.mjs';
import { RaytraceEngine } from '../src/bench/engines/raytrace_engine.mjs';
import { GenericIOLFactory } from '../src/core/iol_factory.mjs';
import { ConstantOffsetPredictor } from '../src/predictors/iol_position.mjs';
import { ObjectiveKind } from '../src/optics/objective.mjs';
import { SamplingKind } from '../src/optics/raytrace/bundle.mjs';
import { FidelityMode } from '../src/core/fidelity.mjs';
import { powerGrid } from '../src/optimize/power_search.mjs';
import { StrictModeViolation } from '../src/core/fidelity.mjs';
import { EvoReplicaEngine } from '../src/bench/engines/evo_engine.mjs';

const REJILLA = powerGrid(-5, 45, 0.5);
const predictor = new ConstantOffsetPredictor(1.7);
const factory = new GenericIOLFactory();
const BASE = { acd_mm: 3.2, lt_mm: 4.5, cct_um: 550, k_index: 1.3375, target_d: 0, meta: { source: 'synthetic' } };

const paraxial = (opts = {}) => new ParaxialEngine(predictor, { grid: REJILLA, iolFactory: factory, ...opts });
const raytrace = (opts = {}) => new RaytraceEngine({
  positionPredictor: predictor, iolFactory: factory,
  objective: ObjectiveKind.EQUIVALENT_DEFOCUS,
  sampling: { kind: SamplingKind.MERIDIONAL, n_anillos: 5 },
  search_d: [-6, 45], catalog_d: null, cornea: {}, fidelity: FidelityMode.RESEARCH,
  pupil_mm: 'FROM_CASE', ...opts,
});
/** procedencia POR VALOR: una rejilla que mezcla ancla y escenario la EXIGE (V1.9) */
const procedenciaPupila = p => (p < 1 ? 'ancla numérica de convergencia' : 'escenario declarado');
const rejilla = (extra = {}) => ({
  al_mm: [22, 24], k_d: [42, 45], pupil_mm: [0.1, 3.0],
  pupil_source: procedenciaPupila, ...extra,
});

test('divergencia · ningún mapa mezcla lente delgada/gruesa: la celda se RECHAZA y se cuenta', () => {
  // el paraxial SIN factory evalúa lente delgada: el contraste ya no aislaría el modelo
  // óptico (la geometría dominaría), así que ninguna celda es comparable — pero todas
  // aparecen, clasificadas
  const s = controlledPhysicsSweep({
    paraxialEngine: new ParaxialEngine(predictor, { grid: REJILLA }),   // sin iolFactory
    raytraceEngine: raytrace(), grid: rejilla(), baseCase: BASE,
  });
  const r = resumen(s.celdas);
  assert.equal(r.n_intentados, 8);
  assert.equal(r.n_comparables, 0);
  assert.equal(r.n_rechazados, 8);
  assert.equal(r.motivos_rechazo[RejectionReason.CONTROL_VIOLATED], 8);
  assert.ok(s.celdas.every(c => /lens_model/.test(c.mensaje)));
});

test('divergencia · ningún default de pupila reaparece: sin pupila declarada no hay celda', () => {
  const s = controlledPhysicsSweep({
    paraxialEngine: paraxial(), raytraceEngine: raytrace(),
    grid: { al_mm: [23], k_d: [43.5], pupil_mm: [3.0], pupil_source: 'escenario declarado' },
    baseCase: BASE,
  });
  assert.equal(s.celdas[0].estado, 'comparable');
  // la rejilla EXIGE procedencia de pupila
  assert.throws(() => controlledPhysicsSweep({
    paraxialEngine: paraxial(), raytraceEngine: raytrace(),
    grid: { al_mm: [23], k_d: [43.5], pupil_mm: [3.0] },   // sin pupil_source
    baseCase: BASE,
  }), /pupil_source/);
  // y un motor con pupila propia entra en CONFLICTO con la del caso: no hay precedencia
  const s2 = controlledPhysicsSweep({
    paraxialEngine: paraxial(), raytraceEngine: raytrace({ pupil_mm: 4.0 }),
    grid: { al_mm: [23], k_d: [43.5], pupil_mm: [3.0], pupil_source: 'escenario declarado' },
    baseCase: BASE,
  });
  assert.equal(s2.celdas[0].estado, 'rechazado');
  assert.match(s2.celdas[0].mensaje, /CONFLICTO de pupila/);
});

test('divergencia · AL/K/pupila viajan SIN redondear y sin intercambiarse', () => {
  const s = controlledPhysicsSweep({
    paraxialEngine: paraxial(), raytraceEngine: raytrace(),
    grid: { al_mm: [23.456789], k_d: [43.21], pupil_mm: [2.5], pupil_source: 'escenario declarado' },
    baseCase: BASE,
  });
  const c = s.celdas[0];
  assert.equal(c.al_mm, 23.456789, 'la longitud axial no se redondea en el barrido');
  assert.equal(c.k_d, 43.21);
  assert.equal(c.pupil_mm, 2.5);
  // el orden de los ejes no se cruza: AL es AL y K es K (valores deliberadamente distintos)
  assert.ok(c.al_mm > 20 && c.al_mm < 30);
  assert.ok(c.k_d > 35 && c.k_d < 50);
});

test('divergencia · los rechazos NO desaparecen del denominador y llevan motivo clasificado', () => {
  // STRICT sobre casos solo-K: la política de lectura registra supuestos → bloquea SIEMPRE
  const s = controlledPhysicsSweep({
    paraxialEngine: paraxial(), raytraceEngine: raytrace({ fidelity: FidelityMode.STRICT }),
    grid: rejilla(), baseCase: BASE,
  });
  const r = resumen(s.celdas);
  assert.equal(r.n_intentados, 8);
  assert.equal(r.n_comparables + r.n_rechazados, r.n_intentados, 'todo intento aparece');
  assert.equal(r.n_rechazados, 8);
  assert.equal(r.motivos_rechazo[RejectionReason.FIDELITY_STRICT], 8);
  // y los resúmenes por eje conservan también el denominador
  for (const fila of resumenPorEje(s.celdas, 'al_mm')) {
    assert.equal(fila.n_intentados, 4);
    assert.equal(fila.n_comparables, 0);
    assert.equal(fila.n_rechazados, 4);
  }
  // con cero comparables, los estadísticos son null — NO cero (que parecería un dato)
  assert.equal(r.mediana_abs_d, null);
  assert.equal(r.p95_abs_d, null);
  assert.equal(r.bandas_fraccion[BANDAS_D[0]], null);
});

test('divergencia · un motivo desconocido NO desaparece: cae en OTHER con su mensaje íntegro', () => {
  assert.equal(classifyRejection(new StrictModeViolation('ctx', ['x'])), RejectionReason.FIDELITY_STRICT);
  assert.equal(classifyRejection(new Error('control violado — lens_model difiere')), RejectionReason.CONTROL_VIOLATED);
  assert.equal(classifyRejection(new Error('el óptimo continuo cae FUERA del catálogo')), RejectionReason.CATALOG_BOUNDARY);
  assert.equal(classifyRejection(new Error('cae en el borde del intervalo de búsqueda')), RejectionReason.SEARCH_BOUNDARY);
  assert.equal(classifyRejection(new Error('longitud axial fuera del rango validado')), RejectionReason.EVO_OUT_OF_DOMAIN);
  const raro = classifyRejection(new Error('algo totalmente inesperado'));
  assert.equal(raro, RejectionReason.OTHER);
});

test('divergencia · la cuantización no se interpreta como física', () => {
  // con catálogos DISTINTOS (paraxial: rejilla; trazado: continuo) la divergencia de
  // catálogo es null: solo se publica la CONTINUA
  const s = controlledPhysicsSweep({
    paraxialEngine: paraxial(), raytraceEngine: raytrace(),
    grid: { al_mm: [23.5], k_d: [43.5], pupil_mm: [3.0], pupil_source: 'escenario declarado' },
    baseCase: BASE,
  });
  assert.equal(s.celdas[0].estado, 'comparable');
  assert.equal(s.celdas[0].divergencia_catalogo_d, null);
  assert.ok(Number.isFinite(s.celdas[0].divergencia_d));
  // con la MISMA rejilla en ambos, la divergencia de catálogo existe y es múltiplo del paso
  const s2 = controlledPhysicsSweep({
    paraxialEngine: paraxial(), raytraceEngine: raytrace({ catalog_d: REJILLA }),
    grid: { al_mm: [23.5], k_d: [43.5], pupil_mm: [3.0], pupil_source: 'escenario declarado' },
    baseCase: BASE,
  });
  const dcat = s2.celdas[0].divergencia_catalogo_d;
  assert.ok(Number.isFinite(dcat));
  assert.ok(Math.abs(dcat / 0.5 - Math.round(dcat / 0.5)) < 1e-9, 'la decisión de catálogo es múltiplo del paso');
});

test('divergencia · la monotonía en pupila se OBSERVA: una serie no monótona se reporta, no falla', () => {
  const celdas = [
    { al_mm: 23, k_d: 43, pupil_mm: 1, estado: 'comparable', divergencia_d: -0.1 },
    { al_mm: 23, k_d: 43, pupil_mm: 2, estado: 'comparable', divergencia_d: -0.3 },
    { al_mm: 23, k_d: 43, pupil_mm: 3, estado: 'comparable', divergencia_d: -0.5 },
    // serie NO monótona y que además CAMBIA DE SIGNO
    { al_mm: 24, k_d: 43, pupil_mm: 1, estado: 'comparable', divergencia_d: +0.2 },
    { al_mm: 24, k_d: 43, pupil_mm: 2, estado: 'comparable', divergencia_d: -0.05 },
    { al_mm: 24, k_d: 43, pupil_mm: 3, estado: 'rechazado', divergencia_d: null, motivo: 'other' },
  ];
  const m = analizarMonotoniaEnPupila(celdas);
  assert.equal(m.n_series, 2);
  assert.equal(m.n_monotonas_crecientes, 1);
  assert.equal(m.n_no_monotonas, 1);
  assert.equal(m.n_cambian_de_signo, 1);
  assert.equal(m.series_no_monotonas[0].al_mm, 24);
  // la serie incompleta conserva su denominador
  const serie24 = m.series.find(s => s.al_mm === 24);
  assert.equal(serie24.n_intentados, 3);
  assert.equal(serie24.n_comparables, 2);
});

test('divergencia · estadísticos: signo y magnitud separados, bandas descriptivas correctas', () => {
  const celdas = [-0.02, 0.06, -0.2, 0.4, -0.9].map((d, i) => ({
    al_mm: 23, k_d: 43, pupil_mm: i, estado: 'comparable', divergencia_d: d,
  }));
  const r = resumen(celdas);
  assert.equal(r.n_comparables, 5);
  assert.equal(r.mediana_abs_d, 0.2);
  assert.equal(r.max_abs_d, 0.9);
  assert.equal(r.min_firmado_d, -0.9);
  assert.equal(r.max_firmado_d, 0.4);
  assert.equal(r.n_positivos, 2);
  assert.equal(r.n_negativos, 3);
  assert.deepEqual(r.bandas_n, { '<0.05': 1, '0.05-0.10': 1, '0.10-0.25': 1, '>=0.25': 2 });
  assert.equal(bandaDe(0.049), '<0.05');
  assert.equal(bandaDe(0.05), '0.05-0.10');
  assert.equal(bandaDe(0.25), '>=0.25');
  assert.match(r.nota_bandas, /NO umbrales de relevancia|DESCRIPTIVAS/);
  // percentil por interpolación lineal (convención declarada)
  assert.equal(percentil([0, 1, 2, 3, 4], 0.5), 2);
  assert.equal(percentil([0, 10], 0.95), 9.5);
});

test('divergencia · terminología: nada llamado "error", nada que afirme acierto o superioridad', () => {
  const s = controlledPhysicsSweep({
    paraxialEngine: paraxial(), raytraceEngine: raytrace(),
    grid: rejilla(), baseCase: BASE,
  });
  const b = fullEngineSweep({
    raytraceEngine: raytrace({ catalog_d: REJILLA }),
    evoEngine: new EvoReplicaEngine(),
    grid: { al_mm: [23.5], k_d: [43.5], pupil_mm: [3.0], pupil_mm_fija: 3.0, pupil_source: 'escenario declarado' },
    baseCase: { ...BASE, a_constant: 119.3, iol_model: 'Posterior' },
    discretizacion_comparable: true,
  });
  for (const salida of [s, resumen(s.celdas), b]) {
    const claves = JSON.stringify(salida).match(/"[a-z_]*error[a-z_]*"\s*:/gi) ?? [];
    assert.deepEqual(claves, [], `ninguna CLAVE debe llamarse error: ${claves}`);
  }
  const texto = JSON.stringify(b).toLowerCase();
  assert.ok(!/superior|mejor que|acierta|más preciso/.test(texto));
  assert.match(b.denominacion, /DIVERGENCIA ENTRE MOTORES/);
});

test('divergencia · exp013 publicado: denominadores cuadran y el ancla converge', () => {
  const j = JSON.parse(fs.readFileSync('experiments/exp013_atlas_divergencia/results.json', 'utf8'));
  const A = j.A_controlled_physics, B = j.B_full_engine;
  // el ancla de apertura→0 converge dentro de la tolerancia demostrada en V1.8
  assert.equal(A.ancla_pupila_0.converge, true);
  assert.ok(A.ancla_pupila_0.max_abs_d < 0.01);
  // toda celda intentada aparece, y las cuentas cuadran con las celdas publicadas
  const celdas = A.celdas;
  assert.equal(celdas.length, 8 * 6 * 6);
  const comparables = celdas.filter(c => c.estado === 'comparable').length;
  const rechazadas = celdas.filter(c => c.estado === 'rechazado').length;
  assert.equal(comparables + rechazadas, celdas.length);
  assert.equal(A.ancla_pupila_0.n_intentados + A.global_con_apertura_finita.n_intentados, celdas.length);
  // los resúmenes por eje suman el total intentado (ninguna celda se pierde al agrupar)
  const sumaAL = A.por_al.reduce((s, r) => s + r.n_intentados, 0);
  assert.equal(sumaAL, A.global_con_apertura_finita.n_intentados);
  const sumaK = A.por_k.reduce((s, r) => s + r.n_intentados, 0);
  assert.equal(sumaK, A.global_con_apertura_finita.n_intentados);
  // el bloque B declara sus rechazos y ninguno desaparece
  assert.equal(B.resumen.n_comparables + B.resumen.n_rechazados, B.resumen.n_intentados);
  assert.equal(B.celdas.length, B.resumen.n_intentados);
});

// ---------------------------------------------------------------------------------
// Regresiones de la REVISIÓN ADVERSARIAL V1.9.
// ---------------------------------------------------------------------------------

test('divergencia · adversarial: un valor NO FINITO nunca se publica como dato', () => {
  // Math.abs(null) === 0 publicaba "acuerdo perfecto" donde no había dato; un NaN
  // corrompía el orden (mediana finita pero FALSA) y bandaDe(NaN) caía en la banda más
  // alarmante. Una celda comparable sin número es una contradicción, no un dato.
  for (const malo of [null, NaN, Infinity, undefined]) {
    assert.throws(() => resumen([
      { al_mm: 23, k_d: 43, pupil_mm: 3, estado: 'comparable', divergencia_d: 0.1 },
      { al_mm: 23, k_d: 43, pupil_mm: 4, estado: 'comparable', divergencia_d: malo },
    ]), /no finito/, `valor ${String(malo)} debía rechazarse`);
  }
  // y un estado desconocido rompería la identidad del denominador: también se rechaza
  assert.throws(() => resumen([
    { al_mm: 23, k_d: 43, pupil_mm: 3, estado: 'timeout', divergencia_d: null },
  ]), /estado desconocido/);
});

test('divergencia · adversarial: un motor que devuelva NaN produce RECHAZO clasificado, no celda', () => {
  const stub = (valor) => ({
    id: 'stub_' + String(valor),
    predict: () => ({
      engine: 'stub', predicted_refraction: 0, recommended_power: 20,
      predicted_cylinder: 0, recommended_toric: 0, unsupported_dimensions: [],
      intermediate_values: {
        exact_power_d: valor, position_source: 's', iol_position_mm: 4.9,
        cornea_policy: 'KERATOMETRIC_READING', lens_model: 'thick_lens_from_factory',
        iol_factory: 'f', target_d: 0, pupil_mm: 3, pupil_source: 'escenario declarado',
        objective: 'EQUIVALENT_DEFOCUS', catalog_d: null, fidelity: 'RESEARCH',
      },
      warnings: [],
    }),
  });
  for (const valor of [NaN, Infinity, null]) {
    const s = controlledPhysicsSweep({
      paraxialEngine: stub(20), raytraceEngine: stub(valor),
      grid: { al_mm: [23], k_d: [43.5], pupil_mm: [3.0], pupil_source: 'escenario declarado' },
      baseCase: BASE,
    });
    assert.equal(s.celdas[0].estado, 'rechazado', `${String(valor)} debía rechazarse`);
    assert.equal(s.celdas[0].divergencia_d, null);
  }
});

test('divergencia · adversarial: FULL_ENGINE sin discretización comparable NO publica acuerdo perfecto', () => {
  // antes: todas las celdas "comparables" con divergencia null → mediana/p95/máx 0.0000
  // y 100 % en la banda <0.05. Ahora hay que DECLARAR la comparabilidad...
  assert.throws(() => fullEngineSweep({
    raytraceEngine: raytrace({ catalog_d: REJILLA }), evoEngine: new EvoReplicaEngine(),
    grid: { al_mm: [23.5], k_d: [43.5], pupil_mm: [3.0], pupil_mm_fija: 3.0, pupil_source: 'escenario declarado' },
    baseCase: { ...BASE, a_constant: 119.3, iol_model: 'Posterior' },
  }), /discretizacion_comparable.*debe declararse/s);
  // ...y si se declara NO comparable, la celda se cuenta como RECHAZADA con motivo
  const s = fullEngineSweep({
    raytraceEngine: raytrace({ catalog_d: REJILLA }), evoEngine: new EvoReplicaEngine(),
    grid: { al_mm: [23.5], k_d: [43.5], pupil_mm: [3.0], pupil_mm_fija: 3.0, pupil_source: 'escenario declarado' },
    baseCase: { ...BASE, a_constant: 119.3, iol_model: 'Posterior' },
    discretizacion_comparable: false,
  });
  assert.equal(s.celdas[0].estado, 'rechazado');
  assert.equal(s.celdas[0].motivo, RejectionReason.UNSUPPORTED);
  const r = resumen(s.celdas);
  assert.equal(r.n_comparables, 0);
  assert.equal(r.mediana_abs_d, null, 'sin comparables NO hay 0.0000 D que publicar');
});

test('divergencia · adversarial: la procedencia de pupila es POR VALOR y la guarda sub-fisiológica no se anula', () => {
  // antes: una cadena única con la palabra "ancla" para toda la rejilla hacía que
  // CUALQUIER pupila (incluso 1 µm) pasara la guarda de apertura sub-fisiológica
  const mezclada = 'ancla numérica (0.1 mm) / escenario declarado (resto)';
  assert.throws(() => controlledPhysicsSweep({
    paraxialEngine: paraxial(), raytraceEngine: raytrace(),
    grid: { al_mm: [23], k_d: [43.5], pupil_mm: [0.001, 3.0], pupil_source: mezclada },
    baseCase: BASE,
  }), /sub-fisiológica|ancla/);
  // con procedencia POR VALOR, el ancla legítima pasa y cada celda lleva SU procedencia
  const porValor = p => (p < 1 ? 'ancla numérica de convergencia' : 'escenario declarado');
  const s = controlledPhysicsSweep({
    paraxialEngine: paraxial(), raytraceEngine: raytrace(),
    grid: { al_mm: [23], k_d: [43.5], pupil_mm: [0.1, 3.0], pupil_source: porValor },
    baseCase: BASE,
  });
  assert.equal(s.celdas.filter(c => c.estado === 'comparable').length, 2);
  // y una procedencia demasiado corta se rechaza EN LA REJILLA (error de configuración),
  // no celda a celda como si fuera una región no comparable
  assert.throws(() => controlledPhysicsSweep({
    paraxialEngine: paraxial(), raytraceEngine: raytrace(),
    grid: { al_mm: [23], k_d: [43.5], pupil_mm: [3.0], pupil_source: 'ab' },
    baseCase: BASE,
  }), /procedencia/);
});

test('divergencia · adversarial: exp013 publica muestreo convergido y la cota del criterio', () => {
  const j = JSON.parse(fs.readFileSync('experiments/exp013_atlas_divergencia/results.json', 'utf8'));
  const A = j.A_controlled_physics;
  // la convergencia del muestreo se PUBLICA y la deriva del último paso es pequeña
  const serie = A.convergencia_del_muestreo.serie;
  assert.ok(serie.length >= 4);
  assert.ok(Math.abs(A.convergencia_del_muestreo.deriva_ultimo_paso_d) < 0.01,
    `deriva del último paso ${A.convergencia_del_muestreo.deriva_ultimo_paso_d} D: no convergido`);
  // el n_anillos publicado es el usado en el atlas
  assert.equal(A.convergencia_del_muestreo.n_anillos_publicado, j.config.muestreo.n_anillos);
  // la sensibilidad al criterio existe y declara su limitación
  assert.match(A.sensibilidad_al_criterio_de_foco.limitacion, /acotada, no aislada/);
  assert.equal(A.sensibilidad_al_criterio_de_foco.por_objetivo.SPOT_RMS_AT_RETINA.disponible_en_benchmark, false);
});
