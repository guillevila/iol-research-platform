/**
 * eye.mjs — modelo de datos anatómico (CAPA A y B).
 *
 * Separa explícitamente:
 *   - `preoperative_eye`  : lo medido (biometría), con ausencias permitidas (null);
 *   - `predicted_postoperative_eye` : lo previsto tras cirugía (posición de LIO, y
 *     desde el diseño: tilt, descentración, rotación tórica, estado capsular).
 *
 * Datum geométrico (ver units.mjs): ápex corneal anterior = 0 mm, +z hacia retina.
 * RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING.
 */
import { assertFinite, assertInRange, normMeridianDeg } from './units.mjs';
import { createIOLPose } from './pose.mjs';

/** Rangos de PLAUSIBILIDAD física amplia (no rangos clínicos de dispositivo). */
export const PLAUSIBLE = Object.freeze({
  al_mm: [14, 40],
  k_d: [28, 65],
  acd_mm: [1.0, 6.5],       // óptica: epitelio → cristalino anterior
  lt_mm: [2.0, 7.5],
  cct_um: [250, 900],
  wtw_mm: [8, 15],
  ata_mm: [8, 15],
  sts_mm: [8, 15],
  pupil_mm: [1, 10],
  lens_eq_diameter_mm: [6, 12],
  lens_eq_plane_mm: [2, 8], // posición axial del plano ecuatorial del cristalino
  r_mm: [4, 15],            // radios corneales
});

function opt(v, range, name) {
  if (v === null || v === undefined) return null;
  return assertInRange(v, range[0], range[1], name);
}
function optQ(v, name) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  throw new TypeError(`${name} debe ser un número finito (Q medida) o ausente; recibido: ${String(v)}`);
}
function optAxis(v, name) {
  if (v === null || v === undefined) return null;
  assertFinite(v, name);
  return normMeridianDeg(v);
}

/**
 * Crea un ojo preoperatorio validado. Obligatorios: al_mm, k1_d, k2_d y sus ejes.
 * Todo lo demás es opcional (null = no medido). `meta.source` es obligatorio:
 * 'measured' | 'synthetic' — los sintéticos quedan siempre etiquetados.
 */
export function createPreopEye(f) {
  if (!f || typeof f !== 'object') throw new TypeError('createPreopEye: faltan campos');
  const src = f.meta?.source;
  if (src !== 'measured' && src !== 'synthetic') {
    throw new TypeError("meta.source obligatorio: 'measured' | 'synthetic'");
  }
  const k1_axis_deg = optAxis(f.k1_axis_deg, 'k1_axis_deg');
  const k2_axis_deg = optAxis(f.k2_axis_deg, 'k2_axis_deg');
  if (k1_axis_deg === null || k2_axis_deg === null) throw new TypeError('ejes K obligatorios');

  const eye = {
    kind: 'preoperative_eye',
    al_mm: assertInRange(f.al_mm, ...PLAUSIBLE.al_mm, 'al_mm'),
    k1_d: assertInRange(f.k1_d, ...PLAUSIBLE.k_d, 'k1_d'),
    k1_axis_deg,
    k2_d: assertInRange(f.k2_d, ...PLAUSIBLE.k_d, 'k2_d'),
    k2_axis_deg,
    // Convención de conversión radio→K del dato de entrada (1.3375 / 1.3315 / 1.332...).
    // NO se rellena por defecto: asumir 1.3375 sobre un dato generado bajo otra
    // convención falsea el radio corneal recuperado. Si no se declara queda `null` y las políticas que lo necesitan fallan
    // explícitamente en vez de adivinar (V0.5 / P0.1, hallazgo H1).
    keratometric_index: f.keratometric_index ?? null,
    // córnea física (opcional; si hay radios, la óptica puede usar 2 superficies)
    cornea: {
      r_anterior_mm: opt(f.cornea?.r_anterior_mm, PLAUSIBLE.r_mm, 'r_anterior_mm'),
      r_posterior_mm: opt(f.cornea?.r_posterior_mm, PLAUSIBLE.r_mm, 'r_posterior_mm'),
      posterior_k1_d: f.cornea?.posterior_k1_d ?? null,
      posterior_k2_d: f.cornea?.posterior_k2_d ?? null,
      posterior_axis_deg: optAxis(f.cornea?.posterior_axis_deg, 'posterior_axis_deg'),
      // asfericidad corneal MEDIDA (constante cónica Q del topógrafo/tomógrafo);
      // null = no medida (el trazador registrará el supuesto de esfera).
      // PENDIENTE (OPEN_QUESTIONS #9): una Q real exige PROCEDENCIA — dispositivo,
      // zona de ajuste (6/8/10 mm) y convención — para ser comparable entre aparatos;
      // "Q numérica presente" NO equivale a "Q comparable". El esquema de procedencia
      // llegará con la integración de datos reales.
      asphericity_q_anterior: optQ(f.cornea?.asphericity_q_anterior, 'cornea.asphericity_q_anterior'),
      asphericity_q_posterior: optQ(f.cornea?.asphericity_q_posterior, 'cornea.asphericity_q_posterior'),
    },
    cct_um: opt(f.cct_um, PLAUSIBLE.cct_um, 'cct_um'),
    acd_mm: opt(f.acd_mm, PLAUSIBLE.acd_mm, 'acd_mm'),
    lt_mm: opt(f.lt_mm, PLAUSIBLE.lt_mm, 'lt_mm'),
    wtw_mm: opt(f.wtw_mm, PLAUSIBLE.wtw_mm, 'wtw_mm'),
    ata_mm: opt(f.ata_mm, PLAUSIBLE.ata_mm, 'ata_mm'),
    sts_mm: opt(f.sts_mm, PLAUSIBLE.sts_mm, 'sts_mm'),
    pupil_mm: opt(f.pupil_mm, PLAUSIBLE.pupil_mm, 'pupil_mm'),
    // geometría cristaliniana ampliada (CAPA A extendida)
    lens_eq_plane_mm: opt(f.lens_eq_plane_mm, PLAUSIBLE.lens_eq_plane_mm, 'lens_eq_plane_mm'),
    lens_eq_diameter_mm: opt(f.lens_eq_diameter_mm, PLAUSIBLE.lens_eq_diameter_mm, 'lens_eq_diameter_mm'),
    lens_tilt_deg: f.lens_tilt_deg ?? null,
    lens_decentration_mm: f.lens_decentration_mm ?? null,
    meta: { source: src, device: f.meta?.device ?? null, note: f.meta?.note ?? null },
  };
  eye.mean_k_d = (eye.k1_d + eye.k2_d) / 2;
  return Object.freeze(eye);
}

/**
 * Estado postoperatorio PREVISTO. `iol_position_mm` = distancia ápex corneal →
 * plano principal/central de la LIO (mm). Es una PREDICCIÓN, nunca un hecho:
 * `position_source` documenta de dónde sale (predictor usado).
 */
export function createPredictedPostopEye(preop, p) {
  if (preop?.kind !== 'preoperative_eye') throw new TypeError('se requiere preoperative_eye');
  const pos = assertInRange(p.iol_position_mm, 1.5, 8.5, 'iol_position_mm');
  if (pos >= preop.al_mm) throw new RangeError('posición de LIO por detrás de la retina');
  // Migración V1.3: los antiguos escalares no determinaban un sistema óptico (faltaba
  // la DIRECCIÓN) y se eliminan con error explícito, no con alias silencioso.
  for (const legado of ['iol_tilt_deg', 'iol_decentration_mm', 'toric_rotation_deg']) {
    if (legado in p) {
      throw new TypeError(`${legado} fue sustituido por \`iol_pose\` (V1.3): la pose `
        + 'necesita dirección explícita, no solo magnitud. Ver src/core/pose.mjs '
        + '(componentes o poseFromClinical con magnitud+azimut).');
    }
  }
  // TODA pose pasa por createIOLPose, también las que ya declaran kind:'iol_pose'
  // (caza adversarial V1.7: el atajo `kind === 'iol_pose' ? p.iol_pose : ...` aceptaba
  // cualquier objeto FALSIFICADO con ese kind, evadiendo assertFinite y los límites de
  // plausibilidad — un tilt de 45° > 30° se trazaba con residual plausible y sin fallo).
  // Re-crear una pose legítima es idempotente (createIOLPose destructura sus campos).
  const pose = p.iol_pose === null || p.iol_pose === undefined
    ? null
    : createIOLPose(p.iol_pose);
  return Object.freeze({
    kind: 'predicted_postoperative_eye',
    preop,
    iol_position_mm: pos,
    position_source: String(p.position_source ?? 'unspecified'),
    /** pose rígida PREVISTA de la LIO (V1.3); null = predicción por defecto: centrada */
    iol_pose: pose,
    capsule_state: p.capsule_state ?? null,
    simulation_flag: 'SIMULACION / NO GROUND TRUTH CLINICO',
  });
}
