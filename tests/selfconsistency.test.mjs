/**
 * V1.13 — Autoconsistencia pupila→0 sobre REJILLA COMPLETA. Puerta de corrección de V1.
 *
 * POR QUÉ ESTE TEST EXISTE ANTES QUE LOS DEMÁS SPRINTS
 * ---------------------------------------------------
 * Un trazador con muchos grados de libertad (asfericidad, tilt, descentración, pupila,
 * tórico) es más fácil de equivocar y más difícil de auditar que un paraxial: con
 * suficientes parámetros libres, casi cualquier resultado es alcanzable y parecería
 * justificado. Este test es la red que impide construir sobre un motor roto.
 *
 * LA AFIRMACIÓN QUE VERIFICA
 * --------------------------
 * Al cerrar la pupila, el óptimo trazado debe converger al óptimo PARAXIAL DEL MISMO
 * SISTEMA FÍSICO — no al de lente delgada — y hacerlo como O(pupila²), que es el orden de
 * la aberración esférica. Se exige **sobre toda la rejilla de ojos**, no en un caso suelto:
 * un motor puede acertar en el ojo normal y desviarse en los extremos, y ahí es donde
 * importa.
 *
 * Cualquier divergencia que NO desaparezca al cerrar la pupila es un defecto, no un
 * fenómeno óptico.
 *
 * RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPreopEye, createPredictedPostopEye } from '../src/core/eye.mjs';
import { GenericIOLFactory } from '../src/core/iol_factory.mjs';
import { buildRaytraceEye, paraxialFocusOfRaytraceEye } from '../src/optics/eyebuilder.mjs';
import { ObjectiveKind } from '../src/optics/objective.mjs';
import { optimizePowerByRaytrace } from '../src/optimize/raytrace_power.mjs';
import { ConstantOffsetPredictor } from '../src/predictors/iol_position.mjs';

/** Rejilla declarada: extremos de longitud axial × extremos de curvatura corneal. */
const REJILLA = [];
for (const al_mm of [21.0, 22.5, 23.5, 25.0, 27.0, 29.0]) {
  for (const k_d of [40.0, 43.5, 47.0]) REJILLA.push({ al_mm, k_d });
}

/**
 * Búsqueda amplia: los ojos extremos de la rejilla necesitan potencias muy dispares.
 * Los límites son los del dominio de `createIOL` ([-15, 60] D), estrechados lo justo para
 * que los propios extremos sean evaluables.
 */
const RANGO_D = [-14.5, 59.5];
const TOL_D = 1e-7;

const predictor = new ConstantOffsetPredictor(1.7);
const factory = new GenericIOLFactory();

function postopDe({ al_mm, k_d }) {
  const pre = createPreopEye({
    al_mm, k1_d: k_d, k1_axis_deg: 180, k2_d: k_d, k2_axis_deg: 90,
    acd_mm: 3.2, lt_mm: 4.5, cct_um: 550, meta: { source: 'synthetic' },
  });
  const pos = predictor.predict(pre).iol_position_mm;
  return createPredictedPostopEye(pre, { iol_position_mm: pos, position_source: predictor.id });
}

/**
 * Potencia cuyo foco PARAXIAL del sistema trazado cae en la retina. Bisección con
 * validación de cambio de signo: sin ella, devolvería un extremo del intervalo como si
 * fuera la solución (el fallo que exp008 destapó).
 */
function referenciaParaxial(postop, [lo, hi] = RANGO_D) {
  const desvio = P => {
    const eye = buildRaytraceEye(postop, factory.create({ power_d: P }));
    return paraxialFocusOfRaytraceEye(eye) - eye.retina_z_mm;
  };
  const dLo = desvio(lo), dHi = desvio(hi);
  assert.ok(dLo > 0 && dHi < 0,
    `sin cambio de signo en [${lo}, ${hi}] D: desvío ${dLo.toFixed(3)} … ${dHi.toFixed(3)} mm`);
  let a = lo, b = hi;
  for (let i = 0; i < 120; i++) { const m = (a + b) / 2; if (desvio(m) > 0) a = m; else b = m; }
  return (a + b) / 2;
}

test('V1.13: el trazado converge al paraxial del mismo sistema en TODA la rejilla', () => {
  const fallos = [];
  for (const ojo of REJILLA) {
    const postop = postopDe(ojo);
    const ref = referenciaParaxial(postop);
    const trazado = optimizePowerByRaytrace({
      postop, factory, pupil_mm: 0.05, tol_d: TOL_D, search_d: RANGO_D,
      objective: ObjectiveKind.EQUIVALENT_DEFOCUS,
    }).exact_power_d;
    const dif = Math.abs(trazado - ref);
    if (!(dif < 1e-3)) {
      fallos.push(`AL=${ojo.al_mm} K=${ojo.k_d}: trazado ${trazado.toFixed(6)} vs paraxial `
        + `${ref.toFixed(6)} → ${dif.toExponential(3)} D`);
    }
  }
  assert.deepEqual(fallos, [],
    `${fallos.length}/${REJILLA.length} ojos divergen con pupila 0.05 mm:\n` + fallos.join('\n'));
});

test('V1.13: la convergencia es O(pupila²) en TODA la rejilla, no solo en el ojo normal', () => {
  const pupilas = [0.4, 0.2, 0.1];
  const malos = [];
  for (const ojo of REJILLA) {
    const postop = postopDe(ojo);
    const ref = referenciaParaxial(postop);
    const err = pupilas.map(pupil_mm => Math.abs(optimizePowerByRaytrace({
      postop, factory, pupil_mm, tol_d: TOL_D, search_d: RANGO_D,
    }).exact_power_d - ref));
    for (let i = 1; i < err.length; i++) {
      const orden = err[i - 1] / err[i];
      if (Math.abs(orden - 4) > 0.3) {
        malos.push(`AL=${ojo.al_mm} K=${ojo.k_d}: orden ${orden.toFixed(3)} entre pupila `
          + `${pupilas[i - 1]} y ${pupilas[i]} mm (errores ${err.map(e => e.toExponential(2))})`);
      }
    }
  }
  assert.deepEqual(malos, [],
    'la divergencia no se comporta como aberración esférica en:\n' + malos.join('\n'));
});

test('V1.13: los tres objetivos coinciden entre sí en TODA la rejilla con pupila→0', () => {
  const malos = [];
  for (const ojo of REJILLA) {
    const postop = postopDe(ojo);
    const potencias = Object.values(ObjectiveKind).map(objective => optimizePowerByRaytrace({
      postop, factory, objective, pupil_mm: 0.1, tol_d: 1e-6, search_d: RANGO_D,
    }).exact_power_d);
    const rango = Math.max(...potencias) - Math.min(...potencias);
    if (rango > 1e-3) malos.push(`AL=${ojo.al_mm} K=${ojo.k_d}: rango ${rango.toExponential(3)} D`);
  }
  assert.deepEqual(malos, [],
    'sin aberración los criterios no pueden diferir; difieren en:\n' + malos.join('\n'));
});

test('V1.13: ningún rayo se pierde en la rejilla con pupila clínica', () => {
  // un rayo perdido (fuera de apertura o TIR) que nadie contabiliza sesga silenciosamente
  // cualquier métrica promediada sobre la pupila
  const malos = [];
  for (const ojo of REJILLA) {
    const r = optimizePowerByRaytrace({
      postop: postopDe(ojo), factory, pupil_mm: 4.0, n_anillos: 8, search_d: RANGO_D,
    });
    if (r.at_exact.raysLost > 0) {
      malos.push(`AL=${ojo.al_mm} K=${ojo.k_d}: ${r.at_exact.raysLost} rayos perdidos`);
    }
  }
  assert.deepEqual(malos, [], 'rayos perdidos sin justificar:\n' + malos.join('\n'));
});

test('V1.13: la aberración esférica tiene el signo correcto en toda la rejilla', () => {
  // superficies esféricas convergentes: los rayos marginales cruzan ANTES que los
  // paraxiales, así que a mayor pupila hace falta MENOS potencia. Un signo invertido
  // aquí indicaría un error de normales o de convención de radios.
  const malos = [];
  for (const ojo of REJILLA) {
    const postop = postopDe(ojo);
    const p = [1, 3, 5].map(pupil_mm => optimizePowerByRaytrace({
      postop, factory, pupil_mm, search_d: RANGO_D,
    }).exact_power_d);
    for (let i = 1; i < p.length; i++) {
      if (!(p[i] < p[i - 1])) malos.push(`AL=${ojo.al_mm} K=${ojo.k_d}: potencias ${p}`);
    }
  }
  assert.deepEqual(malos, [],
    'la potencia óptima debe DECRECER al abrir la pupila:\n' + malos.join('\n'));
});
