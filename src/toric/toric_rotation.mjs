/**
 * toric_rotation.mjs — rotación de la LIO tórica: residual por FÍSICA (V1.7).
 *
 * QUÉ ES ESTE MÓDULO: dado un escenario DECLARADO de orientación física de la LIO
 * (`pose.rotation_z_deg` — el ÚNICO grado de libertad geométrico de orientación, que
 * rota DE VERDAD las caras bicónicas desde V1.6) y un eje PLANIFICADO, traza el
 * sistema completo y extrae el residual astigmático con el análisis 2D. No hay
 * fórmula de penalización dentro del motor: la penalización ES el trazado.
 *
 * TRES CONCEPTOS QUE NO SE MEZCLAN (corrección del encargo V1.7 — el escalar
 * `toric_rotation_deg` fue ELIMINADO en V1.3 y NO se reintroduce):
 *  1. eje PLANIFICADO (`planned_steep_axis_deg`): dónde se pretendía dejar el
 *     meridiano potente de la GEOMETRÍA de la LIO. Dato de planificación, mod 180.
 *     NO toca la geometría.
 *  2. orientación FÍSICA postoperatoria: `pose.rotation_z_deg`. Meridiano potente
 *     físico = 90° + rotation_z (convención de fábrica: potente en y local).
 *  3. error de rotación: DERIVADO = diferencia angular (2) − (1), mod 180, firmada
 *     en (−90°, 90°]. Positivo = el eje físico está girado en el sentido de
 *     +rotation_z (regla de la mano derecha alrededor de +z; el mapeo a
 *     horario/antihorario CLÍNICO exige lateralidad OD/OS — OPEN_QUESTIONS #3).
 *     JAMÁS es una entrada geométrica: no existe forma de declararlo que no sea
 *     declarar la pose física.
 *
 * TRES EJES QUE NO SON EL MISMO (no confundirlos vale 90° de error):
 *  - eje de la GEOMETRÍA tórica: meridiano POTENTE de la cara bicónica (convención
 *    del proyecto; el que usan planned/physical de este módulo);
 *  - eje CLÍNICO minus-cylinder del residual: meridiano PLANO del sistema trazado
 *    (astigmatism.mjs — perpendicular al potente del residual);
 *  - MARCAS / eje de implantación de una LIO comercial: la correspondencia
 *    marca↔geometría es información DEL FABRICANTE y NO se asume (los fabricantes
 *    marcan típicamente el meridiano PLANO de la óptica, pero "típicamente" no es
 *    documentación) — OPEN_QUESTIONS #11.
 *
 * ANCLAS ANALÍTICAS (para VALIDAR el trazado, nunca motor de predicción):
 *  - cilindros IGUALES separados θ: residual = 2·C·|sen θ| en el límite paraxial
 *    (doble ángulo: |1 − e^{i2θ}| = 2|sen θ|);
 *  - caso GENERAL: resta/composición VECTORIAL completa (`vectorResidual`) con los
 *    módulos y ejes MEDIDOS de cada componente. A pupila finita el trazado DIVERGE
 *    del vectorial (aberraciones, efectividad): eso se REPORTA como divergencia,
 *    nunca como "error".
 *
 * La distribución REAL de rotaciones postoperatorias sigue bloqueada por datos
 * (OPEN_QUESTIONS #6): este módulo solo admite ESCENARIOS DECLARADOS.
 *
 * RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING.
 */
import { assertFinite } from '../core/units.mjs';
import { hasToricGeometry } from '../core/iol.mjs';
import { DEFAULT_FIDELITY_MODE } from '../core/fidelity.mjs';
import { buildRaytraceEye } from '../optics/eyebuilder.mjs';
import { generateBundle, SamplingKind } from '../optics/raytrace/bundle.mjs';
import { traceRay } from '../optics/raytrace/trace.mjs';
import { analyzeAstigmaticBundle, clinicalFromAstigmaticAnalysis, normDeg180 } from '../optics/raytrace/astigmatism.mjs';

/**
 * Diferencia angular DERIVADA entre dos ejes (mod 180), firmada en (−90°, 90°].
 * `signedAxisDiff_deg(fisico, planificado)` > 0 ⇔ el eje físico está girado respecto
 * del planificado en el sentido de +rotation_z (mano derecha sobre +z).
 */
export function signedAxisDiff_deg(a_deg, b_deg) {
  assertFinite(a_deg, 'a_deg'); assertFinite(b_deg, 'b_deg');
  let d = (a_deg - b_deg) % 180;
  if (d <= -90) d += 180;
  if (d > 90) d -= 180;
  return d === -0 ? 0 : d;
}

/**
 * Composición VECTORIAL de cilindros en doble ángulo. ANCLA analítica y utilidad de
 * reporte — NO motor de predicción: el residual del producto sale del TRAZADO.
 * Componentes: [{ cyl_d ≥ 0, steep_axis_deg }]. Devuelve módulo y eje del resultante.
 */
export function vectorResidual(componentes) {
  let vx = 0, vy = 0;
  for (const { cyl_d, steep_axis_deg } of componentes) {
    assertFinite(cyl_d, 'cyl_d'); assertFinite(steep_axis_deg, 'steep_axis_deg');
    if (cyl_d < 0) throw new RangeError('vectorResidual: módulos ≥ 0 (el eje lleva la dirección)');
    const a = 2 * steep_axis_deg * Math.PI / 180;
    vx += cyl_d * Math.cos(a); vy += cyl_d * Math.sin(a);
  }
  const mag = Math.hypot(vx, vy);
  return {
    cyl_d: mag,
    steep_axis_deg: mag < 1e-12 ? null : normDeg180(Math.atan2(vy, vx) * 90 / Math.PI),
  };
}

/**
 * Evalúa POR FÍSICA un escenario declarado de rotación de LIO tórica.
 *
 * La geometría la determina EXCLUSIVAMENTE `postop.iol_pose` (rotation_z activa las
 * caras bicónicas; tilt/descentración con el orden ya fijado R_tilt · Rz — este
 * módulo NO compone ninguna rotación adicional: delega en buildRaytraceEye).
 *
 * @param referencia_vectorial_d  opcional: residual esperado por composición
 *        vectorial (módulos/ejes medidos por el llamante). Si se da, la salida
 *        incluye `divergencia_vs_vectorial_d` — divergencia, NUNCA "error".
 */
export function evaluateToricRotationScenario({
  postop, iol, cornea_toric = null, cornea = undefined,
  planned_steep_axis_deg,
  pupil_radius_mm = 0.35, n_anillos = 4, perRing = 8,
  fidelity = DEFAULT_FIDELITY_MODE,
  referencia_vectorial_d = null,
  ...resto
} = {}) {
  // claves desconocidas: rechazo TOTAL nombrándolas (patrón V1.6). En particular, una
  // entrada `rotation_error_deg` NO existe y NO debe existir: el error es DERIVADO —
  // aceptarla como entrada lo convertiría en el segundo grado de libertad geométrico
  // que el encargo prohíbe. La única geometría es la pose.
  const desconocidas = Object.keys(resto);
  if (desconocidas.length > 0) {
    throw new TypeError(`evaluateToricRotationScenario: parámetros no soportados: `
      + `${desconocidas.join(', ')}. El error de rotación es DERIVADO (físico − planificado): `
      + 'para declarar un escenario, declara la POSE (rotation_z_deg), no un error.');
  }
  assertFinite(planned_steep_axis_deg, 'planned_steep_axis_deg');
  assertFinite(pupil_radius_mm, 'pupil_radius_mm');
  if (!hasToricGeometry(iol)) {
    throw new TypeError('evaluateToricRotationScenario: la LIO no tiene geometría tórica declarada '
      + '— sin cara bicónica no hay eje de LIO que rotar. (La rotación de una lente de '
      + 'revolución es exactamente inerte y este análisis no aplica.)');
  }
  const pose = postop.iol_pose ?? null;
  const rotation_z_deg = pose?.rotation_z_deg ?? 0;
  const physical_steep_axis_deg = normDeg180(90 + rotation_z_deg);
  const planned = normDeg180(planned_steep_axis_deg);
  const rotation_error_deg = signedAxisDiff_deg(physical_steep_axis_deg, planned);

  const eye = buildRaytraceEye(postop, iol, {
    ...(cornea !== undefined ? { cornea } : {}),
    ...(cornea_toric !== null ? { cornea_toric } : {}),
    fidelity,
  });
  const bundle = generateBundle({
    radius_mm: pupil_radius_mm, kind: SamplingKind.RINGS_EQUAL_AREA, n: n_anillos, perRing,
  });
  const rays = [], lost = [];
  for (const r0 of bundle.rays) {
    const tr = traceRay(eye.surfaces, r0);
    if (tr.ok) rays.push(tr.ray); else lost.push({ reason: tr.reason, at: tr.at });
  }
  if (rays.length < bundle.rays.length * 0.9) {
    throw new RangeError(`evaluateToricRotationScenario: pérdidas excesivas `
      + `(${lost.length}/${bundle.rays.length}: ${JSON.stringify(lost.slice(0, 3))})`);
  }
  const analisis = analyzeAstigmaticBundle(rays, { axis_tol_mm: 1e-5 });
  const clinico = clinicalFromAstigmaticAnalysis(analisis, {
    zRetina_mm: eye.retina_z_mm, zReference_mm: eye.iol_back_z_mm,
  });
  const residual_cyl_d = Math.abs(clinico.cylinder_d);
  return {
    planned_steep_axis_deg: planned,
    physical_steep_axis_deg,
    rotation_z_deg,
    /** DERIVADO de (físico − planificado), mod 180, firmado en (−90, 90] — jamás entrada */
    rotation_error_deg,
    residual: {
      cyl_d: residual_cyl_d,
      minus_cyl_axis_deg: clinico.minus_cyl_axis_deg,
      steep_meridian_deg: clinico.steep?.meridian_deg ?? null,
      se_d: clinico.se_d,
      sphere_d: clinico.sphere_d,
      degenerate_reason: clinico.degenerate_reason ?? null,
      warnings: clinico.warnings ?? [],
    },
    ...(referencia_vectorial_d !== null ? {
      referencia_vectorial_d,
      // divergencia del TRAZADO respecto de la composición vectorial: aberraciones y
      // efectividad de vergencia a pupila finita — se reporta, no se llama error
      divergencia_vs_vectorial_d: residual_cyl_d - referencia_vectorial_d,
    } : {}),
    raysTraced: rays.length,
    raysLost: lost.length,
    supuestos_trazado: eye.assumptions,
    fidelity,
    parametros_declarados: {
      pupil_radius_mm, n_anillos, perRing,
      pose: postop.iol_pose ?? null,   // null ≡ PoseSource.DEFAULT_CENTERED
      cornea_policy: eye.cornea_policy,
      iol_toric_design: iol.geometry.toric_design,
    },
    convenciones: 'ejes mod 180 en el datum x/y del proyecto; eje de GEOMETRÍA = meridiano '
      + 'potente (≠ eje clínico minus-cyl = meridiano plano; ≠ marcas de fabricante, OQ #11); '
      + 'error > 0 = sentido de +rotation_z (lateralidad clínica pendiente, OQ #3)',
    etiqueta: 'SIMULACION / NO GROUND TRUTH CLINICO',
  };
}
