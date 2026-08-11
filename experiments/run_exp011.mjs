/**
 * exp011 — Trazado TÓRICO (V1.6): recuperación de eje, convergencia pupila→0 y
 *          residual por rotación de la LIO frente a la composición vectorial.
 *
 * SIMULACIÓN / NO GROUND TRUTH CLÍNICO · RESEARCH USE ONLY
 *
 * Preguntas:
 *  1. ¿El análisis 2D (matriz de segundo momento → autoproblema generalizado) recupera
 *     el eje del cilindro en ejes ARBITRARIOS, no solo 0/90°?
 *  2. ¿El cilindro trazado converge con pupila→0 al ancla paraxial por meridiano
 *     (sistemas de revolución equivalentes, maquinaria V1.2 ya verificada)?
 *  3. ¿El residual al rotar la LIO tórica sigue la RESTA VECTORIAL completa de doble
 *     ángulo construida con los módulos MEDIDOS por el propio trazador? (El caso de
 *     módulos IGUALES da 2·C·|sen θ| — el criterio corregido de V1.7; aquí los módulos
 *     difieren por efectividad de vergencia y se usa la resta completa, nunca una
 *     fórmula simplificada.)
 *
 * Lente tórica: SUSTITUTO SINTÉTICO DECLARADO (SyntheticToricIOLFactory) — la única
 * vía por la que una etiqueta de cilindro se convierte en radios, y lo hace
 * etiquetándose. Córnea tórica: TORIC_ANTERIOR_FROM_K — radios por meridiano
 * RECUPERADOS de K1/K2 bajo la convención declarada, NO córnea astigmática medida.
 *
 * Lo que este experimento NO dice: nada clínico. Ninguna geometría tórica de aquí
 * pasa STRICT (todas llevan supuestos registrados); las cifras son propiedades del
 * modelo sintético, no de ojos reales.
 */
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createPreopEye, createPredictedPostopEye } from '../src/core/eye.mjs';
import { createIOLPose } from '../src/core/pose.mjs';
import { createIOL, GeometryStatus } from '../src/core/iol.mjs';
import { GenericIOLFactory, SyntheticToricIOLFactory } from '../src/core/iol_factory.mjs';
import { buildRaytraceEye, paraxialFocusOfRaytraceEye } from '../src/optics/eyebuilder.mjs';
import { ToricCorneaPolicy } from '../src/optics/toric_cornea.mjs';
import { generateBundle, SamplingKind } from '../src/optics/raytrace/bundle.mjs';
import { traceRay } from '../src/optics/raytrace/trace.mjs';
import { analyzeAstigmaticBundle, clinicalFromAstigmaticAnalysis, normDeg180 } from '../src/optics/raytrace/astigmatism.mjs';
import { vectorResidual } from '../src/toric/toric_rotation.mjs';
import { equivalentDefocus_d } from '../src/optics/objective.mjs';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), 'exp011_torico_trazado');
fs.mkdirSync(OUT_DIR, { recursive: true });

const CONFIG = {
  id: 'exp011_torico_trazado',
  etiqueta: 'SIMULACION / NO GROUND TRUTH CLINICO',
  pregunta: 'Recuperación de eje, convergencia pupila→0 y residual por rotación del trazado tórico',
  lente_torica: 'SyntheticToricIOLFactory EE 21 D + cilindro 3 D — SUSTITUTO SINTÉTICO DECLARADO',
  cornea_torica: 'TORIC_ANTERIOR_FROM_K (K1 42 / K2 45) — radios RECUPERADOS por meridiano, no medidos',
  ejes_barrido_deg: [0, 17, 35, 63.4, 90, 121, 158],
  pupilas_radio_mm: [0.1, 0.35, 0.75, 1.25, 2.0],
  rotaciones_deg: [0, 5, 10, 15, 30, 45, 60, 90],
  muestreo: { kind: 'RINGS_EQUAL_AREA', n: 4, perRing: 8 },
  fijos: { al_mm: 23.5, acd_mm: 3.2, lt_mm: 4.5, cct_um: 550, n_k: 1.3375, iol_position_mm: 4.9 },
};

const ojo = ({ k1 = 43.5, k2 = 43.5, ejeK1 = 180, ejeK2 = 90 } = {}) => createPreopEye({
  al_mm: CONFIG.fijos.al_mm, k1_d: k1, k1_axis_deg: ejeK1, k2_d: k2, k2_axis_deg: ejeK2,
  acd_mm: CONFIG.fijos.acd_mm, lt_mm: CONFIG.fijos.lt_mm, cct_um: CONFIG.fijos.cct_um,
  keratometric_index: CONFIG.fijos.n_k, meta: { source: 'synthetic' },
});
const postop = (pre, pose = null) => createPredictedPostopEye(pre, {
  iol_position_mm: CONFIG.fijos.iol_position_mm, position_source: 'declarado (experimento)',
  ...(pose ? { iol_pose: pose } : {}),
});

function analiza(eye, pupilRadius) {
  const bundle = generateBundle({ radius_mm: pupilRadius, kind: SamplingKind.RINGS_EQUAL_AREA, n: 4, perRing: 8 });
  const rays = [];
  for (const r0 of bundle.rays) {
    const tr = traceRay(eye.surfaces, r0);
    if (tr.ok) rays.push(tr.ray);
  }
  if (rays.length < bundle.rays.length) throw new Error(`pérdidas: ${rays.length}/${bundle.rays.length}`);
  const a = analyzeAstigmaticBundle(rays, { axis_tol_mm: 1e-5 });
  if (!a.astigmatic) return { cyl_d: 0, eje_empinado_deg: null };
  const clin = clinicalFromAstigmaticAnalysis(a, { zRetina_mm: eye.retina_z_mm, zReference_mm: eye.iol_back_z_mm });
  return { cyl_d: Math.abs(clin.cylinder_d), eje_empinado_deg: clin.steep.meridian_deg, eje_minus_cyl_deg: clin.minus_cyl_axis_deg };
}

const lioEsferica = new GenericIOLFactory().create({ power_d: 21 });
const lioTorica = new SyntheticToricIOLFactory().create({ power_d: 21, cylinder_d: 3 });

// 1 — recuperación de eje: córnea tórica FROM_K con el eje empinado barrido
const ejes = CONFIG.ejes_barrido_deg.map(eje => {
  const ejeK = eje === 0 ? 180 : eje;   // los ejes K se declaran en (0, 180]
  const pre = ojo({ k1: 45, k2: 42, ejeK1: ejeK, ejeK2: normDeg180(ejeK + 90) === 0 ? 180 : normDeg180(ejeK + 90) });
  const eye = buildRaytraceEye(postop(pre), lioEsferica, { cornea_toric: { policy: ToricCorneaPolicy.TORIC_ANTERIOR_FROM_K } });
  const r = analiza(eye, 0.35);
  const dif = Math.min(Math.abs(r.eje_empinado_deg - normDeg180(eje)), 180 - Math.abs(r.eje_empinado_deg - normDeg180(eje)));
  return {
    eje_declarado_deg: +normDeg180(eje).toFixed(4),
    eje_recuperado_deg: +r.eje_empinado_deg.toFixed(6),
    error_deg: +dif.toFixed(6),
    eje_minus_cyl_deg: +r.eje_minus_cyl_deg.toFixed(6),
  };
});

// 2 — convergencia pupila→0 de la LIO tórica hacia el ancla paraxial por meridiano
const tb = lioTorica.geometry.toric_anterior;
const lenteMeridiano = r_ant => createIOL({
  manufacturer: 'EXP', model: `meridiano_${r_ant.toFixed(4)}`, nominal_power_d: 21,
  geometry: {
    refractive_index: lioTorica.geometry.refractive_index,
    central_thickness_mm: lioTorica.geometry.central_thickness_mm,
    r_anterior_mm: r_ant, r_posterior_mm: lioTorica.geometry.r_posterior_mm,
    asphericity_q_anterior: 0, asphericity_q_posterior: 0,
  },
  geometry_status: GeometryStatus.MANUFACTURER,
  provenance: 'ancla de validación del experimento — no es una lente real',
  source: 'ancla meridional',
});
const eyeTorica = buildRaytraceEye(postop(ojo()), lioTorica);
const zY = paraxialFocusOfRaytraceEye(buildRaytraceEye(postop(ojo()), lenteMeridiano(tb.r_y_mm)));
const zX = paraxialFocusOfRaytraceEye(buildRaytraceEye(postop(ojo()), lenteMeridiano(tb.r_x_mm)));
const cylParaxial = equivalentDefocus_d(zY, eyeTorica.retina_z_mm, eyeTorica.iol_back_z_mm)
  - equivalentDefocus_d(zX, eyeTorica.retina_z_mm, eyeTorica.iol_back_z_mm);
const convergencia = CONFIG.pupilas_radio_mm.map(rp => {
  const r = analiza(eyeTorica, rp);
  return {
    pupila_radio_mm: rp,
    cyl_trazado_d: +r.cyl_d.toFixed(5),
    cyl_paraxial_ancla_d: +Math.abs(cylParaxial).toFixed(5),
    divergencia_d: +(r.cyl_d - Math.abs(cylParaxial)).toFixed(5),
  };
});

// 3 — rotación de la LIO tórica sobre córnea tórica: residual trazado vs vectorial
const preT = ojo({ k1: 42, k2: 45 });
const soloCornea = analiza(buildRaytraceEye(postop(preT), lioEsferica,
  { cornea_toric: { policy: ToricCorneaPolicy.TORIC_ANTERIOR_FROM_K } }), 0.35);
const soloLIO = analiza(buildRaytraceEye(postop(ojo()), lioTorica), 0.35);
// composición de doble ángulo: desde V1.7 la hace vectorResidual (misma aritmética en
// el mismo orden: floats idénticos, verificado por check_experiments) — la cuenta a
// mano que había aquí era duplicación (hallazgo de la revisión adversarial V1.7)
const rotacion = CONFIG.rotaciones_deg.map(rot => {
  const combinado = analiza(buildRaytraceEye(
    postop(preT, createIOLPose({ rotation_z_deg: rot })), lioTorica,
    { cornea_toric: { policy: ToricCorneaPolicy.TORIC_ANTERIOR_FROM_K } }), 0.35);
  const esperadoVectorial = vectorResidual([
    { cyl_d: soloCornea.cyl_d, steep_axis_deg: soloCornea.eje_empinado_deg },
    { cyl_d: soloLIO.cyl_d, steep_axis_deg: normDeg180(90 + rot) },
  ]).cyl_d;
  return {
    rotacion_deg: rot,
    residual_trazado_d: +combinado.cyl_d.toFixed(5),
    residual_vectorial_d: +esperadoVectorial.toFixed(5),
    divergencia_d: +(combinado.cyl_d - esperadoVectorial).toFixed(5),
    // referencia del criterio V1.7 con módulos IGUALES: 2·C·|sen θ| (C = módulo LIO)
    ley_2C_sin_theta_d: +(2 * soloLIO.cyl_d * Math.abs(Math.sin(rot * Math.PI / 180))).toFixed(5),
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
  resumen: {
    max_error_eje_deg: Math.max(...ejes.map(e => e.error_deg)),
    cyl_paraxial_ancla_d: +Math.abs(cylParaxial).toFixed(5),
    divergencia_pupila_min_d: convergencia[0].divergencia_d,
    divergencia_pupila_max_d: convergencia[convergencia.length - 1].divergencia_d,
    cyl_cornea_sola_d: +soloCornea.cyl_d.toFixed(5),
    cyl_lio_sola_d: +soloLIO.cyl_d.toFixed(5),
    max_divergencia_vectorial_d: Math.max(...rotacion.map(r => Math.abs(r.divergencia_d))),
    residual_rot0_d: rotacion[0].residual_trazado_d,
    residual_rot90_d: rotacion[rotacion.length - 1].residual_trazado_d,
  },
  ejes, convergencia, rotacion,
};
fs.writeFileSync(join(OUT_DIR, 'results.json'), JSON.stringify(result, null, 2) + '\n');

const fmt = v => (v >= 0 ? '+' : '') + v;
const md = [
  '# exp011 — Trazado tórico (V1.6): eje, convergencia y rotación',
  '',
  `**${CONFIG.etiqueta}** · commit \`${result.commit.slice(0, 10)}\``,
  '',
  'LIO tórica = **sustituto sintético declarado** (la única vía etiqueta→radios, y se',
  'declara); córnea tórica = radios **recuperados** de K1/K2 (no medidos). Ninguna',
  'geometría tórica de este experimento pasa STRICT — por construcción.',
  '',
  '## Resumen',
  '',
  '| Métrica | Valor |',
  '|---|---|',
  `| Máximo error de recuperación de eje (7 ejes arbitrarios) | **${result.resumen.max_error_eje_deg}°** |`,
  `| Cilindro del ancla paraxial por meridiano | ${result.resumen.cyl_paraxial_ancla_d} D |`,
  `| Divergencia trazado−paraxial con pupila mínima (r=0.1 mm) | ${fmt(result.resumen.divergencia_pupila_min_d)} D |`,
  `| Divergencia con pupila máxima (r=2.0 mm) | ${fmt(result.resumen.divergencia_pupila_max_d)} D |`,
  `| Máxima divergencia trazado vs composición vectorial (rotación) | **${result.resumen.max_divergencia_vectorial_d} D** |`,
  '',
  '## 1 · Recuperación de eje (córnea tórica FROM_K, ejes arbitrarios)',
  '',
  '| Eje declarado | Eje recuperado | Error | Eje minus-cyl (= meridiano plano) |',
  '|---|---|---|---|',
  ...ejes.map(e => `| ${e.eje_declarado_deg}° | ${e.eje_recuperado_deg}° | ${e.error_deg}° | ${e.eje_minus_cyl_deg}° |`),
  '',
  '## 2 · Convergencia pupila→0 (LIO tórica 3 D sobre córnea esférica)',
  '',
  '| Radio de pupila (mm) | Cilindro trazado (D) | Ancla paraxial (D) | Divergencia (D) |',
  '|---|---|---|---|',
  ...convergencia.map(c => `| ${c.pupila_radio_mm} | ${c.cyl_trazado_d} | ${c.cyl_paraxial_ancla_d} | ${fmt(c.divergencia_d)} |`),
  '',
  '## 3 · Rotación de la LIO tórica sobre córnea tórica (ejes de partida alineados a 90°)',
  '',
  'El residual trazado se compara con la **resta vectorial completa** en doble ángulo',
  'construida con los módulos MEDIDOS por el propio análisis (córnea sola y LIO sola).',
  'La columna 2C·|sen θ| es la ley del criterio V1.7 para módulos IGUALES: aquí los',
  'módulos difieren (efectividad de vergencia), así que NO debe coincidir — se incluye',
  'para mostrar que la composición completa es la referencia válida, no una fórmula.',
  '',
  '| Rotación | Residual trazado (D) | Vectorial completa (D) | Divergencia (D) | 2C·\\|sen θ\\| (C=LIO) |',
  '|---|---|---|---|---|',
  ...rotacion.map(r => `| ${r.rotacion_deg}° | ${r.residual_trazado_d} | ${r.residual_vectorial_d} | ${fmt(r.divergencia_d)} | ${r.ley_2C_sin_theta_d} |`),
  '',
  '## Lectura',
  '',
  '1. El autoproblema generalizado recupera ejes arbitrarios con error ≤ '
    + `${result.resumen.max_error_eje_deg}° — sin depender de ningún plano donde el spot`,
  '   pudiera ser casi circular.',
  '2. El cilindro trazado converge al ancla paraxial por meridiano cuando la pupila se',
  '   cierra (la divergencia restante a pupila grande es aberración, no error de eje).',
  '3. El residual por rotación sigue la composición vectorial de doble ángulo con los',
  '   módulos medidos; la ley 2C·|sen θ| del criterio V1.7 es el caso particular de',
  '   módulos iguales y NO sustituye a la resta vectorial completa.',
  '',
  '## Lo que este experimento NO demuestra',
  '',
  'Nada clínico: la lente es un sustituto sintético declarado (OQ #4), la córnea tórica',
  'procede de K1/K2 bajo una convención (no de mapas de elevación medidos, OQ #10) y la',
  'relevancia clínica de cualquier residual exige datos postoperatorios (OQ #8).',
].join('\n');
fs.writeFileSync(join(OUT_DIR, 'README.md'), md + '\n');
console.log(md);
