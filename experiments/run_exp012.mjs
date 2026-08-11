/**
 * exp012 — Rotación de LIO tórica (V1.7): residual POR FÍSICA frente a las anclas
 *          vectoriales, con el error de rotación como cantidad DERIVADA.
 *
 * SIMULACIÓN / NO GROUND TRUTH CLÍNICO · RESEARCH USE ONLY
 *
 * Preguntas:
 *  1. ¿Cuánto residual deja cada error de rotación DECLARADO (la distribución real
 *     sigue bloqueada, OQ #6), medido rotando DE VERDAD la geometría bicónica con
 *     pose.rotation_z y re-trazando (ningún modelo de penalización interno)?
 *  2. ¿El trazado sigue la RESTA VECTORIAL completa (ancla general, módulos y ejes
 *     medidos por el propio análisis)? ¿Y la ley 2·C·|sen θ| en el caso particular de
 *     módulos EFECTIVOS igualados (ancla del criterio V1.7)?
 *  3. ¿Cuánto DIVERGE el trazado del vectorial a pupila finita (aberraciones +
 *     efectividad)? Se reporta como divergencia, nunca como "error".
 *
 * Conceptos separados (encargo V1.7): eje PLANIFICADO (dato), orientación FÍSICA
 * (pose.rotation_z — único grado de libertad geométrico) y error DERIVADO. Ninguna
 * geometría tórica de aquí pasa STRICT (sustituto sintético + córnea FROM_K).
 */
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createPreopEye, createPredictedPostopEye } from '../src/core/eye.mjs';
import { createIOLPose } from '../src/core/pose.mjs';
import { GenericIOLFactory, SyntheticToricIOLFactory } from '../src/core/iol_factory.mjs';
import { buildRaytraceEye } from '../src/optics/eyebuilder.mjs';
import { ToricCorneaPolicy } from '../src/optics/toric_cornea.mjs';
import { generateBundle, SamplingKind } from '../src/optics/raytrace/bundle.mjs';
import { traceRay } from '../src/optics/raytrace/trace.mjs';
import { analyzeAstigmaticBundle, clinicalFromAstigmaticAnalysis, normDeg180 } from '../src/optics/raytrace/astigmatism.mjs';
import { evaluateToricRotationScenario, vectorResidual } from '../src/toric/toric_rotation.mjs';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), 'exp012_rotacion_torica');
fs.mkdirSync(OUT_DIR, { recursive: true });

const CONFIG = {
  id: 'exp012_rotacion_torica',
  etiqueta: 'SIMULACION / NO GROUND TRUTH CLINICO',
  pregunta: 'Residual por rotación de LIO tórica calculado por física, frente a las anclas vectoriales',
  lente: 'SyntheticToricIOLFactory — SUSTITUTO SINTÉTICO DECLARADO (única vía etiqueta→radios)',
  cornea: 'TORIC_ANTERIOR_FROM_K (K1 42 / K2 45, empinada a 90°) — radios RECUPERADOS, no medidos',
  plan: 'eje planificado del meridiano potente de la LIO = 0° (plano corneal); físico = 90° + rotation_z',
  errores_declarados_deg: [0, 2.5, 5, 10, 15, 30, 45, 60, 90],
  pupilas_radio_mm: { ancla: 0.08, finita: 1.5 },
  fijos: { al_mm: 23.5, acd_mm: 3.2, lt_mm: 4.5, cct_um: 550, n_k: 1.3375, iol_position_mm: 4.9 },
};

const ojo = ({ k1 = 43.5, k2 = 43.5 } = {}) => createPreopEye({
  al_mm: CONFIG.fijos.al_mm, k1_d: k1, k1_axis_deg: 180, k2_d: k2, k2_axis_deg: 90,
  acd_mm: CONFIG.fijos.acd_mm, lt_mm: CONFIG.fijos.lt_mm, cct_um: CONFIG.fijos.cct_um,
  keratometric_index: CONFIG.fijos.n_k, meta: { source: 'synthetic' },
});
const postop = (pre, rot) => createPredictedPostopEye(pre, {
  iol_position_mm: CONFIG.fijos.iol_position_mm, position_source: 'declarado (experimento)',
  iol_pose: createIOLPose({ rotation_z_deg: rot }),
});
const PRE_AST = () => ojo({ k1: 42, k2: 45 });
const CORNEA_T = { policy: ToricCorneaPolicy.TORIC_ANTERIOR_FROM_K };

/** componente medido con el MISMO análisis (córnea sola / LIO sola) */
function componente(post, iol, opts, pupil) {
  const eye = buildRaytraceEye(post, iol, opts);
  const bundle = generateBundle({ radius_mm: pupil, kind: SamplingKind.RINGS_EQUAL_AREA, n: 4, perRing: 8 });
  const rays = bundle.rays.map(r0 => traceRay(eye.surfaces, r0)).filter(t => t.ok).map(t => t.ray);
  const a = analyzeAstigmaticBundle(rays, { axis_tol_mm: 1e-5 });
  const c = clinicalFromAstigmaticAnalysis(a, { zRetina_mm: eye.retina_z_mm, zReference_mm: eye.iol_back_z_mm });
  return { cyl_d: Math.abs(c.cylinder_d), steep_axis_deg: c.steep?.meridian_deg ?? null };
}

const lioEsferica = new GenericIOLFactory().create({ power_d: 21 });
const pupilAncla = CONFIG.pupilas_radio_mm.ancla;

// componentes a pupila pequeña (anclas) — córnea sola y LIO etiqueta-3 sola
const compCornea = componente(createPredictedPostopEye(PRE_AST(), {
  iol_position_mm: CONFIG.fijos.iol_position_mm, position_source: 'declarado (experimento)',
}), lioEsferica, { cornea_toric: CORNEA_T }, pupilAncla);
const lio3 = new SyntheticToricIOLFactory().create({ power_d: 21, cylinder_d: 3 });
const compLio3 = componente(postop(ojo(), 0), lio3, {}, pupilAncla);

// BLOQUE A — módulos EFECTIVOS igualados (ancla 2C|sinθ| del criterio V1.7):
// se reetiqueta la LIO midiendo, no por fórmula
const etiquetaIgualada = +(3 * compCornea.cyl_d / compLio3.cyl_d).toFixed(6);
const lioIgualada = new SyntheticToricIOLFactory().create({ power_d: 21, cylinder_d: etiquetaIgualada });
const compLioIgualada = componente(postop(ojo(), 0), lioIgualada, {}, pupilAncla);

const bloqueA = CONFIG.errores_declarados_deg.map(err => {
  const r = evaluateToricRotationScenario({
    postop: postop(PRE_AST(), 90 + err), iol: lioIgualada, cornea_toric: CORNEA_T,
    planned_steep_axis_deg: 0, pupil_radius_mm: pupilAncla,
  });
  const ancla = 2 * compCornea.cyl_d * Math.abs(Math.sin(err * Math.PI / 180));
  return {
    error_derivado_deg: r.rotation_error_deg,
    residual_trazado_d: +r.residual.cyl_d.toFixed(5),
    ancla_2C_sin_theta_d: +ancla.toFixed(5),
    divergencia_d: +(r.residual.cyl_d - ancla).toFixed(5),
    fraccion_correccion_perdida: +(r.residual.cyl_d / compCornea.cyl_d).toFixed(4),
  };
});

// BLOQUE B — caso GENERAL (módulos distintos, LIO etiqueta 3): resta vectorial
// completa con componentes medidos, a pupila de ancla y a pupila finita
const bloqueB = CONFIG.errores_declarados_deg.map(err => {
  const vect = vectorResidual([
    compCornea,
    { cyl_d: compLio3.cyl_d, steep_axis_deg: normDeg180(90 + (90 + err)) },
  ]);
  const chico = evaluateToricRotationScenario({
    postop: postop(PRE_AST(), 90 + err), iol: lio3, cornea_toric: CORNEA_T,
    planned_steep_axis_deg: 0, pupil_radius_mm: pupilAncla, referencia_vectorial_d: vect.cyl_d,
  });
  const grande = evaluateToricRotationScenario({
    postop: postop(PRE_AST(), 90 + err), iol: lio3, cornea_toric: CORNEA_T,
    planned_steep_axis_deg: 0, pupil_radius_mm: CONFIG.pupilas_radio_mm.finita, referencia_vectorial_d: vect.cyl_d,
  });
  return {
    error_derivado_deg: chico.rotation_error_deg,
    residual_vectorial_d: +vect.cyl_d.toFixed(5),
    residual_trazado_pupila_ancla_d: +chico.residual.cyl_d.toFixed(5),
    divergencia_pupila_ancla_d: +chico.divergencia_vs_vectorial_d.toFixed(5),
    residual_trazado_pupila_finita_d: +grande.residual.cyl_d.toFixed(5),
    divergencia_pupila_finita_d: +grande.divergencia_vs_vectorial_d.toFixed(5),
    eje_residual_deg: chico.residual.steep_meridian_deg === null
      ? null : +chico.residual.steep_meridian_deg.toFixed(3),
  };
});

const result = {
  config: CONFIG,
  timestamp: new Date().toISOString(),
  commit: execSync('git rev-parse HEAD').toString().trim(),
  procedencia_commit: 'último commit AL GENERAR: el experimento puede incluir cambios aún '
    + 'sin committear (hallazgo adversarial V1.3: el commit estampado era sistemáticamente '
    + 'el PADRE del que publica). La reproducibilidad NO la garantiza este campo sino '
    + 'scripts/check_experiments.mjs, que re-ejecuta contra el árbol del commit que publica '
    + 'y en cada push de CI.',
  componentes_medidos: {
    cornea: { cyl_d: +compCornea.cyl_d.toFixed(5), steep_axis_deg: +compCornea.steep_axis_deg.toFixed(3) },
    lio_etiqueta_3: { cyl_d: +compLio3.cyl_d.toFixed(5) },
    lio_igualada: { etiqueta_d: etiquetaIgualada, cyl_efectivo_d: +compLioIgualada.cyl_d.toFixed(5) },
  },
  resumen: {
    max_divergencia_ancla_2C_d: Math.max(...bloqueA.map(r => Math.abs(r.divergencia_d))),
    max_divergencia_vectorial_ancla_d: Math.max(...bloqueB.map(r => Math.abs(r.divergencia_pupila_ancla_d))),
    max_divergencia_vectorial_finita_d: Math.max(...bloqueB.map(r => Math.abs(r.divergencia_pupila_finita_d))),
    residual_a_30_sobre_C: bloqueA.find(r => r.error_derivado_deg === 30).fraccion_correccion_perdida,
    residual_a_90_sobre_C: bloqueA.find(r => r.error_derivado_deg === 90).fraccion_correccion_perdida,
  },
  bloqueA_modulos_igualados: bloqueA,
  bloqueB_caso_general: bloqueB,
};
fs.writeFileSync(join(OUT_DIR, 'results.json'), JSON.stringify(result, null, 2) + '\n');

const fmt = v => (v >= 0 ? '+' : '') + v;
const md = [
  '# exp012 — Rotación de LIO tórica (V1.7): residual por física vs anclas vectoriales',
  '',
  `**${CONFIG.etiqueta}** · commit \`${result.commit.slice(0, 10)}\``,
  '',
  'El residual sale de ROTAR de verdad la geometría bicónica (pose.rotation_z) y',
  're-trazar; el error de rotación es una cantidad DERIVADA (físico − planificado,',
  'mod 180, firmada). Las anclas (2C·|sen θ| para módulos iguales; resta vectorial',
  'completa en general) VALIDAN el trazado — no lo sustituyen. La distribución real',
  'de rotaciones sigue bloqueada (OQ #6): errores DECLARADOS.',
  '',
  '## Componentes medidos (pupila r=0.08 mm)',
  '',
  '| Componente | Cilindro efectivo (D) |',
  '|---|---|',
  `| Córnea tórica sola (empinada a ${result.componentes_medidos.cornea.steep_axis_deg}°) | ${result.componentes_medidos.cornea.cyl_d} |`,
  `| LIO tórica etiqueta 3 D sola | ${result.componentes_medidos.lio_etiqueta_3.cyl_d} |`,
  `| LIO reetiquetada ${etiquetaIgualada} D (módulos igualados midiendo) | ${result.componentes_medidos.lio_igualada.cyl_efectivo_d} |`,
  '',
  '## A · Módulos EFECTIVOS igualados — la ley 2·C·|sen θ| como ancla (criterio V1.7)',
  '',
  '| Error derivado | Residual trazado (D) | 2C·\\|sen θ\\| (D) | Divergencia (D) | Fracción de C |',
  '|---|---|---|---|---|',
  ...bloqueA.map(r => `| ${r.error_derivado_deg}° | ${r.residual_trazado_d} | ${r.ancla_2C_sin_theta_d} | ${fmt(r.divergencia_d)} | ${r.fraccion_correccion_perdida} |`),
  '',
  `A 30° el residual es ≈ C entero (fracción ${result.resumen.residual_a_30_sobre_C}) y a 90° ≈ 2C`,
  `(fracción ${result.resumen.residual_a_90_sobre_C}) — lo que la fórmula errónea C·|sen 2θ| negaba.`,
  '',
  '## B · Caso general (módulos distintos): resta VECTORIAL completa como ancla',
  '',
  '| Error derivado | Vectorial (D) | Trazado r=0.08 (D) | Diverg. (D) | Trazado r=1.5 (D) | Diverg. (D) | Eje residual |',
  '|---|---|---|---|---|---|---|',
  ...bloqueB.map(r => `| ${r.error_derivado_deg}° | ${r.residual_vectorial_d} | ${r.residual_trazado_pupila_ancla_d} | ${fmt(r.divergencia_pupila_ancla_d)} | ${r.residual_trazado_pupila_finita_d} | ${fmt(r.divergencia_pupila_finita_d)} | ${r.eje_residual_deg === null ? '—' : r.eje_residual_deg + '°'} |`),
  '',
  '## Lectura',
  '',
  '1. Con pupila de ancla el trazado coincide con la composición vectorial a '
    + `≤ ${result.resumen.max_divergencia_vectorial_ancla_d} D y con 2C·|sen θ| (módulos`,
  `   igualados) a ≤ ${result.resumen.max_divergencia_ancla_2C_d} D: la física reproduce las anclas donde son válidas.`,
  '2. A pupila finita (r=1.5 mm) el trazado DIVERGE del vectorial hasta '
    + `${result.resumen.max_divergencia_vectorial_finita_d} D — aberraciones y efectividad`,
  '   que el álgebra de doble ángulo no contiene. Es divergencia entre modelos, no "error".',
  '3. El error de rotación aquí es SIEMPRE derivado de una pose declarada: ningún',
  '   escenario introduce un segundo grado de libertad geométrico de orientación.',
  '',
  '## Lo que este experimento NO demuestra',
  '',
  'Nada clínico: distribución real de rotaciones bloqueada (OQ #6); lente sustituto',
  'sintético declarado (OQ #4); córnea tórica derivada de K, no medida (OQ #10);',
  'correspondencia con marcas de LIO comerciales sin documentar (OQ #11).',
].join('\n');
fs.writeFileSync(join(OUT_DIR, 'README.md'), md + '\n');
console.log(md);
