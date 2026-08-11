/**
 * astigmatism.mjs — descripción 2D del spot de un haz emergente (V1.6).
 *
 * REQUISITO que este módulo cumple (registrado en V1.5): un sistema TÓRICO no puede
 * reducirse a un RMS escalar ni a un mejor foco axial — dos líneas focales y un eje no
 * caben en un número. Aquí el haz se describe por su matriz de SEGUNDO MOMENTO
 * transversal M(z) y de ella se extraen los DOS focos principales con sus meridianos.
 *
 * LA CLAVE MATEMÁTICA — por qué esto no depende de ningún plano concreto
 * ----------------------------------------------------------------------
 * Tras la ÚLTIMA superficie cada rayo es una RECTA: su posición transversal es
 * r_i(z) = a_i + s_i·(z − z_ref), con s = (dx/dz, dy/dz). Centrado en el centroide
 * (α = a − ā, σ = s − s̄), la matriz de covarianza transversal es EXACTAMENTE
 *
 *     M(z) = M0 + M1·Δz + M2·Δz²,   Δz = z − z_ref
 *     M0 = ⟨α αᵀ⟩,   M1 = ⟨α σᵀ + σ αᵀ⟩,   M2 = ⟨σ σᵀ⟩
 *
 * (cuadrática exacta, no un ajuste: la propagación libre es lineal en z). La varianza
 * del haz a lo largo de una dirección transversal u en el plano z es v(u,z) = uᵀM(z)u,
 * mínima en z*(u) = −(uᵀM1u)/(2·uᵀM2u). Los MERIDIANOS PRINCIPALES son las direcciones
 * que hacen z*(u) estacionario: un problema de autovalores GENERALIZADO 2×2
 *
 *     det(M1/2 + z·M2) = 0   →   z₁ ≤ z₂ (focos principales),
 *     (M1/2 + zᵢ·M2)·uᵢ = 0  →   uᵢ (meridiano de potencia del foco i).
 *
 * En cada foco el spot es MÁXIMAMENTE anisótropo (una línea): el eje se extrae donde
 * mejor está definido, nunca en un plano intermedio donde el spot puede ser casi
 * circular y el autovector queda indeterminado (el círculo de mínima confusión).
 *
 * CONVENCIÓN DE EJES (explícita, para no comerse el error de 90°)
 * ---------------------------------------------------------------
 *  - MERIDIANO DE POTENCIA uᵢ: dirección PUPILAR cuyos rayos enfocan en zᵢ; el haz se
 *    comprime a lo largo de uᵢ en zᵢ. Cuando AMBOS focos son REALES y posteriores a la
 *    referencia (el caso del ojo pseudofáquico), el foco más PRÓXIMO (z menor) es el
 *    meridiano MÁS POTENTE (el "empinado"). Con focos VIRTUALES (delante de la
 *    referencia: haces divergentes en algún meridiano) el orden en z NO es orden de
 *    potencia — la reducción clínica lo detecta y rechaza explícitamente (corrección
 *    de la revisión adversarial V1.6).
 *  - LÍNEA FOCAL en zᵢ: se extiende PERPENDICULAR a uᵢ (a lo largo del otro meridiano).
 *  - EJE CLÍNICO del cilindro corrector (convención cilindro NEGATIVO): coincide con el
 *    meridiano PLANO (el menos potente, foco más lejano) — que es también la orientación
 *    de la línea focal ANTERIOR. sphere = desenfoque del meridiano plano;
 *    cyl = D_empinado − D_plano ≤ 0; axis = meridiano plano.
 *  - Ángulos en el datum x/y del proyecto (pose.mjs), módulo 180°; el mapeo a
 *    nasal/temporal exige lateralidad (OPEN_QUESTIONS #3).
 *  - Los desenfoques usan equivalentDefocus_d (objective.mjs): dioptrías de VERGENCIA
 *    en la referencia dada, NO refracción en plano de gafa (sin distancia de vértice) —
 *    la misma convención que el objetivo C escalar.
 *
 * RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING.
 */
import { assertFinite } from '../../core/units.mjs';
import { equivalentDefocus_d } from '../objective.mjs';

export const normDeg180 = deg => ((deg % 180) + 180) % 180;

/**
 * Momentos transversales del haz de rectas: coeficientes EXACTOS de
 * M(z) = M0 + M1·Δz + M2·Δz² (matrices simétricas 2×2 como [xx, xy, yy]).
 * Exige un haz genuinamente 2D: un haz meridional (planar) tiene M2 singular y NO
 * define la métrica — se rechaza explícitamente, igual que en el optimizador.
 */
export function transverseMoments(rays, { z_ref_mm = 0 } = {}) {
  assertFinite(z_ref_mm, 'z_ref_mm');
  const n = rays.length;
  if (n < 3) throw new RangeError(`transverseMoments: haz insuficiente (${n} rayos)`);
  const A = [], S = [];
  for (const r of rays) {
    if (Math.abs(r.d[2]) < 1e-12) {
      throw new RangeError('transverseMoments: rayo perpendicular al eje — el haz no es un campo de rectas en z');
    }
    const sx = r.d[0] / r.d[2], sy = r.d[1] / r.d[2];
    A.push([r.p[0] + sx * (z_ref_mm - r.p[2]), r.p[1] + sy * (z_ref_mm - r.p[2])]);
    S.push([sx, sy]);
  }
  const mean = arr => arr.reduce((m, v) => [m[0] + v[0] / n, m[1] + v[1] / n], [0, 0]);
  const am = mean(A), sm = mean(S);
  let m0 = [0, 0, 0], m1 = [0, 0, 0], m2 = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const ax = A[i][0] - am[0], ay = A[i][1] - am[1];
    const sx = S[i][0] - sm[0], sy = S[i][1] - sm[1];
    m0 = [m0[0] + ax * ax, m0[1] + ax * ay, m0[2] + ay * ay];
    m1 = [m1[0] + 2 * ax * sx, m1[1] + ax * sy + ay * sx, m1[2] + 2 * ay * sy];
    m2 = [m2[0] + sx * sx, m2[1] + sx * sy, m2[2] + sy * sy];
  }
  const div = m => [m[0] / n, m[1] / n, m[2] / n];
  return { M0: div(m0), M1: div(m1), M2: div(m2), z_ref_mm, n_rays: n, centroid: am, centroidSlope: sm };
}

/** v(u, z) = uᵀ M(z) u con M en forma [xx, xy, yy]. */
const quadForm = (m, u) => m[0] * u[0] * u[0] + 2 * m[1] * u[0] * u[1] + m[2] * u[1] * u[1];
const mAt = ({ M0, M1, M2 }, dz) => [
  M0[0] + M1[0] * dz + M2[0] * dz * dz,
  M0[1] + M1[1] * dz + M2[1] * dz * dz,
  M0[2] + M1[2] * dz + M2[2] * dz * dz,
];

/**
 * Matriz de segundo momento del spot EN un plano z, con autovalores/autovectores —
 * la "matriz de segundo momento con ejes principales y orientación" del requisito.
 * API de inspección: el ANÁLISIS de ejes de astigmatismo NO usa esta función en un
 * plano concreto (ver analyzeAstigmaticBundle).
 */
export function spotSecondMomentAt(rays, z_mm, opts = {}) {
  const mom = transverseMoments(rays, opts);
  const m = mAt(mom, z_mm - mom.z_ref_mm);
  const tr = m[0] + m[2], det = m[0] * m[2] - m[1] * m[1];
  const disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
  const l1 = tr / 2 + disc, l2 = tr / 2 - disc;
  const angle = normDeg180(Math.atan2(2 * m[1], m[0] - m[2]) / 2 * 180 / Math.PI);
  return { matrix: m, eigenvalues: [l1, l2], major_axis_deg: angle, rms_mm: Math.sqrt(Math.max(0, tr)) };
}

/**
 * Análisis astigmático COMPLETO del haz: dos focos principales con sus meridianos.
 *
 * @returns {{
 *   astigmatic: boolean,
 *   foci: [{z_mm, power_meridian_deg, focal_line_deg, rms_power_meridian_mm, rms_focal_line_mm}] | null,
 *   delta_z_mm, mean_focus_z_mm, orthogonality_residual_deg,
 *   degenerate_reason: string|null, moments, etiqueta
 * }}
 * Con astigmatismo por debajo de `axis_tol_mm` los meridianos quedan INDEFINIDOS y se
 * devuelve `astigmatic:false` con la razón EXPLÍCITA — nunca un eje arbitrario.
 */
export function analyzeAstigmaticBundle(rays, { z_ref_mm = 0, axis_tol_mm = 1e-4 } = {}) {
  const mom = transverseMoments(rays, { z_ref_mm });
  const P = [mom.M1[0] / 2, mom.M1[1] / 2, mom.M1[2] / 2];
  const Q = mom.M2;
  // Q = ⟨σσᵀ⟩ debe ser definida positiva: si es singular el haz es 1D (meridional) y
  // no define la métrica 2D — mismo patrón de rechazo que el optimizador con pose
  const qScale = Q[0] + Q[2];
  if (!(Q[0] > 0) || !(Q[2] > 0) || (Q[0] * Q[2] - Q[1] * Q[1]) < 1e-12 * qScale * qScale) {
    throw new RangeError('analyzeAstigmaticBundle: el haz no es 2D (M2 singular — ¿haz '
      + 'meridional/planar?). La métrica astigmática exige muestreo 2D (bundle.mjs).');
  }
  // det(P + z·Q) = 0 → cuadrática en z, resuelta con CITARDAUQ (estabilidad, casa V1.2)
  const A = Q[0] * Q[2] - Q[1] * Q[1];
  const B = P[0] * Q[2] + P[2] * Q[0] - 2 * P[1] * Q[1];
  const C = P[0] * P[2] - P[1] * P[1];
  const disc = B * B - 4 * A * C;
  if (disc < 0) {
    // matemáticamente imposible con Q≻0 (los autovalores generalizados son reales);
    // solo alcanzable por ruido de flotante en haces casi perfectamente esféricos
    return sinAstigmatismo(mom, -B / (2 * A), 'discriminante < 0 por ruido flotante: haz esférico a precisión de máquina');
  }
  const s = Math.sqrt(disc);
  const q = -0.5 * (B + Math.sign(B || 1) * s);
  const roots = q === 0 ? [0, 0] : [C / q, q / A].sort((a, b) => a - b);
  const [zr1, zr2] = roots;
  if (zr2 - zr1 < axis_tol_mm) {
    return sinAstigmatismo(mom, (zr1 + zr2) / 2,
      `separación de focos ${(zr2 - zr1).toExponential(2)} mm < tolerancia ${axis_tol_mm} mm: eje indefinido`);
  }
  const foci = roots.map(zr => {
    // autovector de (P + z·Q)u = 0: vector nulo de la fila de mayor norma (estabilidad)
    const w11 = P[0] + zr * Q[0], w12 = P[1] + zr * Q[1], w22 = P[2] + zr * Q[2];
    const u = Math.hypot(w11, w12) >= Math.hypot(w12, w22) ? [w12, -w11] : [w22, -w12];
    const nu = Math.hypot(u[0], u[1]);
    const uh = [u[0] / nu, u[1] / nu];
    const meridian = normDeg180(Math.atan2(uh[1], uh[0]) * 180 / Math.PI);
    const m = mAt(mom, zr);
    const w = [-uh[1], uh[0]];
    return {
      z_mm: mom.z_ref_mm + zr,
      power_meridian_deg: meridian,
      focal_line_deg: normDeg180(meridian + 90),
      rms_power_meridian_mm: Math.sqrt(Math.max(0, quadForm(m, uh))),
      rms_focal_line_mm: Math.sqrt(Math.max(0, quadForm(m, w))),
      _u: uh,
    };
  });
  // residual de ortogonalidad entre meridianos (los autovectores son Q-ortogonales;
  // euclídeo-ortogonales solo para astigmatismo ortogonal puro — se REPORTA, no se fuerza)
  const dotU = Math.abs(foci[0]._u[0] * foci[1]._u[0] + foci[0]._u[1] * foci[1]._u[1]);
  const orth = Math.abs(90 - Math.acos(Math.min(1, dotU)) * 180 / Math.PI);
  for (const f of foci) delete f._u;
  return {
    astigmatic: true,
    foci,
    delta_z_mm: foci[1].z_mm - foci[0].z_mm,
    mean_focus_z_mm: (foci[0].z_mm + foci[1].z_mm) / 2,
    orthogonality_residual_deg: orth,
    degenerate_reason: null,
    moments: mom,
    etiqueta: 'SIMULACION / NO GROUND TRUTH CLINICO',
  };
}

function sinAstigmatismo(mom, zRel, reason) {
  return {
    astigmatic: false,
    foci: null,
    delta_z_mm: 0,
    mean_focus_z_mm: mom.z_ref_mm + zRel,
    orthogonality_residual_deg: null,
    degenerate_reason: reason,
    moments: mom,
    etiqueta: 'SIMULACION / NO GROUND TRUTH CLINICO',
  };
}

/**
 * Reducción CLÍNICA del análisis: esfera/cilindro/eje en convención de cilindro
 * NEGATIVO y en dioptrías de desenfoque equivalente (misma convención y la MISMA
 * función de conversión que el objetivo C — nada nuevo que calibrar).
 *
 * El foco más PRÓXIMO es el meridiano EMPINADO (más potente). El eje del cilindro
 * corrector negativo = meridiano PLANO (véase la convención de cabecera).
 * NO es refracción en plano de gafa: no aplica distancia de vértice.
 */
export function clinicalFromAstigmaticAnalysis(analysis, { zRetina_mm, zReference_mm }) {
  assertFinite(zRetina_mm, 'zRetina_mm'); assertFinite(zReference_mm, 'zReference_mm');
  if (!analysis.astigmatic) {
    const d = equivalentDefocus_d(analysis.mean_focus_z_mm, zRetina_mm, zReference_mm);
    return {
      sphere_d: d, cylinder_d: 0, minus_cyl_axis_deg: null, se_d: d,
      steep: null, flat: null,
      degenerate_reason: analysis.degenerate_reason,
      convencion: 'cilindro negativo; desenfoque equivalente (sin distancia de vértice); eje = meridiano plano',
      etiqueta: 'SIMULACION / NO GROUND TRUTH CLINICO',
    };
  }
  // near = empinado SOLO si ambos focos son reales tras la referencia: con un foco
  // VIRTUAL (z ≤ referencia) el orden en z no es orden de potencia — se rechaza con
  // nombre en vez de dejar que equivalentDefocus falle con un mensaje genérico
  // (corrección adversarial V1.6)
  const virtuales = analysis.foci.filter(f => f.z_mm <= zReference_mm);
  if (virtuales.length > 0) {
    throw new RangeError('clinicalFromAstigmaticAnalysis: foco(s) principal(es) VIRTUAL(es) o '
      + `anteriores a la referencia (z=${virtuales.map(f => f.z_mm.toFixed(2)).join(', ')} mm ≤ `
      + `zRef=${zReference_mm} mm) — el orden en z no es orden de potencia y la reducción `
      + 'clínica no está definida. Analiza los focos directamente (analysis.foci).');
  }
  const [near, far] = analysis.foci; // ambos reales tras la referencia: near = empinado
  const dNear = equivalentDefocus_d(near.z_mm, zRetina_mm, zReference_mm);
  const dFar = equivalentDefocus_d(far.z_mm, zRetina_mm, zReference_mm);
  // el residual de ortogonalidad VIAJA (corrección adversarial V1.6: se calculaba y la
  // reducción clínica lo descartaba — un consumidor no podía saber que el haz era
  // astigmáticamente IRREGULAR y que esfera/cilindro/eje son entonces una reducción
  // forzada de algo que no es un cilindro cruzado ortogonal)
  const orto = analysis.orthogonality_residual_deg;
  return {
    sphere_d: dFar,
    cylinder_d: dNear - dFar,                       // ≤ 0: cilindro negativo
    minus_cyl_axis_deg: far.power_meridian_deg,     // eje = meridiano PLANO
    se_d: (dNear + dFar) / 2,
    steep: { meridian_deg: near.power_meridian_deg, defocus_d: dNear, z_mm: near.z_mm },
    flat: { meridian_deg: far.power_meridian_deg, defocus_d: dFar, z_mm: far.z_mm },
    orthogonality_residual_deg: orto,
    warnings: orto > 1
      ? [`meridianos principales NO ortogonales (residual ${orto.toFixed(2)}°): el haz es `
        + 'astigmáticamente irregular y esfera/cilindro/eje son una reducción forzada']
      : [],
    degenerate_reason: null,
    convencion: 'cilindro negativo; desenfoque equivalente (sin distancia de vértice); eje = meridiano plano',
    etiqueta: 'SIMULACION / NO GROUND TRUTH CLINICO',
  };
}
