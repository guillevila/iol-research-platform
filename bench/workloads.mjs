/**
 * workloads.mjs — cargas REPRESENTATIVAS del motor V1 (V1.14).
 *
 * Un solo lugar define los workloads, y lo usan DOS consumidores con propósitos distintos:
 *   - `bench/run_bench.mjs`      → mide TIEMPO (depende de la máquina; no es ciencia).
 *   - `bench/equivalence.mjs`    → captura las SALIDAS CIENTÍFICAS y exige identidad
 *                                  bitwise antes/después de cada optimización.
 * Compartirlos es lo que impide el sesgo de «medir un workload y verificar otro».
 *
 * CÓMO SE ELIGIERON. No es una checklist: son los caminos que el perfilado de V1.14
 * demostró computacionalmente DISTINTOS (no solo «más grandes»):
 *   fija            → una evaluación física con LIO fija: el bloque elemental (1 haz, 1 objetivo).
 *   continua        → optimización continua por trazado: sección áurea sobre el objetivo.
 *   catalogo        → búsqueda continua + contención en catálogo comercial.
 *   conica          → superficie CÓNICA (Q declarada): rama cuadrática de intersect.
 *   pose            → sistema con pose 3D: transformadas rígidas + muestreo 2D obligatorio.
 *   torico          → análisis astigmático 2D: bicónica (Newton) + momentos, sin objetivo escalar.
 *   barrido         → sweep CONTROLLED_PHYSICS: muchos ojos × muchas potencias.
 *   incertidumbre   → V1.12 con LIO fija: N extracciones, cada una re-predice y re-traza.
 *   eleccion        → V1.12 estabilidad de elección: RE-OPTIMIZA por extracción (el más caro).
 *   pipeline_eq     → cadena H_EQ de V1.11: predictor → postop → trazado.
 *
 * Los PARÁMETROS CIENTÍFICOS de cada workload (n_anillos, pupila, tolerancias, n de
 * extracciones, catálogo) son FIJOS y declarados aquí. V1.14 no los toca: reducirlos daría
 * velocidad convirtiendo el workload en otro workload distinto.
 *
 * RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING.
 */
import { createPreopEye, createPredictedPostopEye } from '../src/core/eye.mjs';
import { GenericIOLFactory, SyntheticToricIOLFactory } from '../src/core/iol_factory.mjs';
import { EquatorialPlanePredictor, ConstantOffsetPredictor } from '../src/predictors/iol_position.mjs';
import { buildRaytraceEye } from '../src/optics/eyebuilder.mjs';
import { generateBundle, SamplingKind } from '../src/optics/raytrace/bundle.mjs';
import { evaluateObjective, ObjectiveKind } from '../src/optics/objective.mjs';
import { optimizePowerByRaytrace } from '../src/optimize/raytrace_power.mjs';
import { searchBestPower, powerGrid } from '../src/optimize/power_search.mjs';
import { analyzeAstigmaticBundle, clinicalFromAstigmaticAnalysis } from '../src/optics/raytrace/astigmatism.mjs';
import { traceBundle } from '../src/optics/objective.mjs';
import { createIOLPose } from '../src/core/pose.mjs';
import { raytraceOutcomeUncertainty, raytraceChoiceStability, SigmaTipo } from '../src/uncertainty/raytrace_uncertainty.mjs';

const PROV = 'escenario declarado de benchmark V1.14 (OQ #6): no es repetibilidad real';
const sig = sd => ({ sd, tipo: SigmaTipo.DECLARADA, provenance: PROV });

const ojoEsferico = (extra = {}) => createPreopEye({
  al_mm: 23.5, k1_d: 43.5, k1_axis_deg: 180, k2_d: 43.5, k2_axis_deg: 90,
  acd_mm: 3.2, lt_mm: 4.5, cct_um: 550, keratometric_index: 1.3375,
  meta: { source: 'synthetic' }, ...extra,
});
const ojoAstigmata = () => createPreopEye({
  al_mm: 23.5, k1_d: 42.5, k1_axis_deg: 180, k2_d: 45.5, k2_axis_deg: 90,
  acd_mm: 3.2, lt_mm: 4.5, cct_um: 550, keratometric_index: 1.3375,
  meta: { source: 'synthetic' },
});
const postopDe = (pre, pos = 4.9, pose = null) => createPredictedPostopEye(pre, {
  iol_position_mm: pos, position_source: 'bench_v114', ...(pose ? { iol_pose: pose } : {}),
});

/**
 * Cada workload declara: parámetros científicos (fijos), y `run()` que devuelve la SALIDA
 * CIENTÍFICA COMPLETA que la puerta de equivalencia compara bitwise. `run()` no imprime ni
 * escribe nada: es puro.
 */
export const WORKLOADS = [
  {
    id: 'fija',
    descripcion: 'evaluación física de UNA LIO fija (bloque elemental del motor)',
    parametros: { pupil_mm: 3.0, n_anillos: 40, sampling: 'MERIDIONAL', objective: 'EQUIVALENT_DEFOCUS', power_d: 21 },
    run() {
      const eye = buildRaytraceEye(postopDe(ojoEsferico()), new GenericIOLFactory().create({ power_d: 21 }),
        { aperture_mm: 2.0 });
      const haz = generateBundle({ radius_mm: 1.5, kind: SamplingKind.MERIDIONAL, n: 40, perRing: 6 });
      const ev = evaluateObjective(eye, haz.rays, ObjectiveKind.EQUIVALENT_DEFOCUS);
      return {
        cost: ev.cost, residual_d: ev.residual_d, bestFocus_mm: ev.bestFocus_mm,
        spotRms_mm: ev.spotRms_mm, raysTraced: ev.raysTraced, raysLost: ev.raysLost,
        detail: ev.detail, supuestos: eye.assumptions, cornea_policy: eye.cornea_policy,
      };
    },
  },
  {
    id: 'continua',
    descripcion: 'optimización CONTINUA de potencia por trazado (sección áurea)',
    parametros: { pupil_mm: 3.0, n_anillos: 40, search_d: [15, 27], tol_d: 1e-4 },
    run() {
      const r = optimizePowerByRaytrace({
        postop: postopDe(ojoEsferico()), factory: new GenericIOLFactory(),
        pupil_mm: 3.0, n_anillos: 40, sampling: SamplingKind.MERIDIONAL,
        search_d: [15, 27],
      });
      return {
        exact_power_d: r.exact_power_d, at_exact: r.at_exact,
        supuestos_trazado: r.supuestos_trazado, parametros: r.parametros_declarados ?? null,
        recomendada: r.recomendada ?? null, catalog_no_evaluables: r.catalog_no_evaluables ?? null,
      };
    },
  },
  {
    id: 'catalogo',
    descripcion: 'optimización continua + contención en catálogo comercial (0.5 D)',
    parametros: { pupil_mm: 3.0, n_anillos: 40, catalogo: '10..30 paso 0.5', search_d: [15, 27] },
    run() {
      const r = optimizePowerByRaytrace({
        postop: postopDe(ojoEsferico()), factory: new GenericIOLFactory(),
        pupil_mm: 3.0, n_anillos: 40, sampling: SamplingKind.MERIDIONAL,
        search_d: [15, 27], catalog_d: powerGrid(10, 30, 0.5),
      });
      return {
        exact_power_d: r.exact_power_d, recomendada: r.recomendada ?? null,
        segunda: r.segunda ?? null, at_exact: r.at_exact,
        catalog_no_evaluables: r.catalog_no_evaluables ?? null,
        supuestos_trazado: r.supuestos_trazado,
      };
    },
  },
  {
    id: 'conica',
    descripcion: 'trazado con superficie CÓNICA (asfericidad declarada): rama cuadrática',
    parametros: { pupil_mm: 3.0, n_anillos: 40, q_anterior: -0.26, q_posterior: -0.25 },
    run() {
      const pre = ojoEsferico({
        cornea: { r_anterior_mm: 7.7, r_posterior_mm: 6.4, asphericity_q_anterior: -0.26, asphericity_q_posterior: -0.25 },
      });
      const eye = buildRaytraceEye(postopDe(pre), new GenericIOLFactory().create({ power_d: 21 }),
        { aperture_mm: 2.0 });
      const haz = generateBundle({ radius_mm: 1.5, kind: SamplingKind.MERIDIONAL, n: 40, perRing: 6 });
      const ev = evaluateObjective(eye, haz.rays, ObjectiveKind.EQUIVALENT_DEFOCUS);
      return {
        cost: ev.cost, residual_d: ev.residual_d, bestFocus_mm: ev.bestFocus_mm,
        spotRms_mm: ev.spotRms_mm, raysTraced: ev.raysTraced, raysLost: ev.raysLost,
        supuestos: eye.assumptions, cornea_kind: eye.cornea_kind,
      };
    },
  },
  {
    id: 'pose',
    descripcion: 'sistema con POSE 3D (tilt+descentración): transformadas rígidas y muestreo 2D',
    parametros: { pupil_mm: 3.0, n_anillos: 8, sampling: 'RINGS_EQUAL_AREA', tilt_x_deg: 5, decenter_y_mm: 0.3 },
    run() {
      const pose = createIOLPose({ tilt_x_deg: 5, decenter_y_mm: 0.3, source: 'DECLARED_SCENARIO' });
      const eye = buildRaytraceEye(postopDe(ojoEsferico(), 4.9, pose),
        new GenericIOLFactory().create({ power_d: 21 }), { aperture_mm: 2.0 });
      const haz = generateBundle({ radius_mm: 1.5, kind: SamplingKind.RINGS_EQUAL_AREA, n: 8, perRing: 6 });
      const ev = evaluateObjective(eye, haz.rays, ObjectiveKind.EQUIVALENT_DEFOCUS);
      return {
        cost: ev.cost, residual_d: ev.residual_d, bestFocus_mm: ev.bestFocus_mm,
        spotRms_mm: ev.spotRms_mm, raysTraced: ev.raysTraced, raysLost: ev.raysLost,
        detail: ev.detail, pose_source: eye.pose?.source ?? null,
      };
    },
  },
  {
    id: 'torico',
    descripcion: 'análisis astigmático 2D con LIO tórica (bicónica, Newton) — sin objetivo escalar',
    parametros: { pupil_mm: 3.0, n_anillos: 8, sampling: 'RINGS_EQUAL_AREA', cilindro_d: 2.0 },
    run() {
      const iol = new SyntheticToricIOLFactory().create({ power_d: 21, cylinder_d: 2.0, cylinder_axis_deg: 90 });
      const eye = buildRaytraceEye(postopDe(ojoAstigmata()), iol,
        { aperture_mm: 2.0, cornea: { toric_policy: 'DECLARED_TORIC_FROM_K' } });
      const haz = generateBundle({ radius_mm: 1.5, kind: SamplingKind.RINGS_EQUAL_AREA, n: 8, perRing: 6 });
      const { rays, lost } = traceBundle(eye.surfaces, haz.rays);
      const analisis = analyzeAstigmaticBundle(rays, { z_ref_mm: eye.retina_z_mm });
      const clinico = clinicalFromAstigmaticAnalysis(analisis, {
        zRetina_mm: eye.retina_z_mm, zReference_mm: eye.iol_back_z_mm,
      });
      return {
        clinico, focos: analisis.focos ?? null, ejes: analisis.ejes ?? null,
        raysTraced: rays.length, raysLost: lost.length,
        supuestos: eye.assumptions, toric: eye.toric ?? null,
      };
    },
  },
  {
    id: 'barrido',
    descripcion: 'barrido CONTROLLED_PHYSICS reducido: 6 ojos × potencia continua (misma física)',
    parametros: { pupil_mm: 3.0, n_anillos: 40, ojos: 6, search_d: [5, 35] },
    run() {
      const factory = new GenericIOLFactory();
      const salidas = [];
      for (const al of [21.0, 22.5, 23.5, 24.5, 26.0, 27.0]) {
        const pre = ojoEsferico({ al_mm: al });
        const r = optimizePowerByRaytrace({
          postop: postopDe(pre), factory, pupil_mm: 3.0, n_anillos: 40,
          sampling: SamplingKind.MERIDIONAL, search_d: [5, 35],
        });
        const p = searchBestPower({ postop: postopDe(pre), target_d: 0, iolFactory: factory });
        salidas.push({
          al_mm: al, trazada_d: r.exact_power_d, paraxial_gruesa_d: p.exact_power_d,
          lens_model: p.lens_model, sens_d_mm: p.sensitivity_ref_per_mm_d,
          best: p.best, second: p.second, tie: p.tie,
        });
      }
      return { salidas };
    },
  },
  {
    id: 'incertidumbre',
    descripcion: 'V1.12 con LIO FIJA: 150 extracciones, cada una re-predice y re-traza',
    parametros: { n: 150, seed: 4242, pupil_mm: 3.0, n_anillos: 12, sigmas: 'al 0.03 / acd 0.10 / pos 0.30' },
    run() {
      const r = raytraceOutcomeUncertainty({
        preop: ojoEsferico(), iol: new GenericIOLFactory().create({ power_d: 21 }),
        predictor: new EquatorialPlanePredictor(),
        sigmas: { al_mm: sig(0.03), acd_mm: sig(0.10), position_prediction_mm: sig(0.30) },
        n: 150, seed: 4242, pupil_mm: 3.0,
        sampling: { kind: SamplingKind.MERIDIONAL, n_anillos: 12 },
      });
      return {
        distribucion: r.distribucion, nominal: r.nominal, ancla_nominal_exacta: r.ancla_nominal_exacta,
        ancla_lineal: r.ancla_lineal, n_intentados: r.n_intentados, n_validos: r.n_validos,
        n_rechazados: r.n_rechazados, motivos_rechazo: r.motivos_rechazo,
        advertencia_censura: r.advertencia_censura, procedencia_posicion: r.procedencia_posicion,
        convergencia: r.convergencia, sigmas_declaradas: r.sigmas_declaradas,
        correlaciones: r.correlaciones, pupila: r.pupila,
        unsupported_dimensions: r.unsupported_dimensions ?? null,
      };
    },
  },
  {
    id: 'eleccion',
    descripcion: 'V1.12 estabilidad de ELECCIÓN: re-optimiza el catálogo por extracción (el más caro)',
    parametros: { n: 60, seed: 777, pupil_mm: 3.0, n_anillos: 12, ventana_d: 2.0, catalogo: '16..26 paso 0.5' },
    run() {
      const r = raytraceChoiceStability({
        preop: ojoEsferico(), factory: new GenericIOLFactory(),
        predictor: new ConstantOffsetPredictor(1.7),
        sigmas: { al_mm: sig(0.03), position_prediction_mm: sig(0.30) },
        n: 60, seed: 777, pupil_mm: 3.0,
        sampling: { kind: SamplingKind.MERIDIONAL, n_anillos: 12 },
        catalog_d: powerGrid(16, 26, 0.5), window_d: 2.0, search_d: [1, 44],
      });
      return {
        eleccion_nominal_d: r.eleccion_nominal_d, fraccion_eleccion_nominal: r.fraccion_eleccion_nominal,
        escalon_modal_d: r.escalon_modal_d, por_escalon: r.por_escalon,
        fuera_de_ventana: r.fuera_de_ventana, n_intentados: r.n_intentados,
        n_decididos: r.n_decididos, n_rechazados: r.n_rechazados, motivos_rechazo: r.motivos_rechazo,
        ventana_evaluada_d: r.ventana_evaluada_d, procedencia_posicion: r.procedencia_posicion,
        nota: r.nota, pupila: r.pupila,
      };
    },
  },
  {
    id: 'pipeline_eq',
    descripcion: 'cadena H_EQ de V1.11: predictor geométrico → postop previsto → trazado',
    parametros: { pupil_mm: 3.0, n_anillos: 40, ojos: 3, predictor: 'equatorial_plane_geometric' },
    run() {
      const predictor = new EquatorialPlanePredictor();
      const factory = new GenericIOLFactory();
      const salidas = [];
      for (const o of [{ al: 21.0, k: 44.0, acd: 2.9, lt: 4.9 },
        { al: 23.5, k: 43.5, acd: 3.2, lt: 4.5 },
        { al: 27.0, k: 42.5, acd: 3.6, lt: 4.1 }]) {
        const pre = createPreopEye({
          al_mm: o.al, k1_d: o.k, k1_axis_deg: 180, k2_d: o.k, k2_axis_deg: 90,
          acd_mm: o.acd, lt_mm: o.lt, cct_um: 550, meta: { source: 'synthetic' },
        });
        const pred = predictor.predict(pre);
        const r = optimizePowerByRaytrace({
          postop: createPredictedPostopEye(pre, {
            iol_position_mm: pred.iol_position_mm, position_source: pred.source,
          }),
          factory, pupil_mm: 3.0, n_anillos: 40, sampling: SamplingKind.MERIDIONAL,
          search_d: [10, 34],
        });
        salidas.push({
          posicion_mm: pred.iol_position_mm, hypothesis: pred.hypothesis,
          inputs_used: pred.inputs_used, position_source: pred.source,
          trazada_d: r.exact_power_d, at_exact: r.at_exact, supuestos: r.supuestos_trazado,
        });
      }
      return { salidas };
    },
  },
];

export const WORKLOAD_IDS = WORKLOADS.map(w => w.id);
export const getWorkload = id => {
  const w = WORKLOADS.find(x => x.id === id);
  if (!w) throw new RangeError(`workload desconocido: ${id}. Válidos: ${WORKLOAD_IDS.join(', ')}`);
  return w;
};
