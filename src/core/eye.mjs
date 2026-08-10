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
    // Convención de lectura del biómetro (1.3375 / 1.3315 / 1.332...). NO se rellena
    // por defecto: asumir 1.3375 sobre un dato de otra marca falsea el radio corneal
    // recuperado. Si no se declara queda `null` y las políticas que lo necesitan fallan
    // explícitamente en vez de adivinar (V0.5 / P0.1, hallazgo H1).
    keratometric_index: f.keratometric_index ?? null,
    // córnea física (opcional; si hay radios, la óptica puede usar 2 superficies)
    cornea: {
      r_anterior_mm: opt(f.cornea?.r_anterior_mm, PLAUSIBLE.r_mm, 'r_anterior_mm'),
      r_posterior_mm: opt(f.cornea?.r_posterior_mm, PLAUSIBLE.r_mm, 'r_posterior_mm'),
      posterior_k1_d: f.cornea?.posterior_k1_d ?? null,
      posterior_k2_d: f.cornea?.posterior_k2_d ?? null,
      posterior_axis_deg: optAxis(f.cornea?.posterior_axis_deg, 'posterior_axis_deg'),
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
  return Object.freeze({
    kind: 'predicted_postoperative_eye',
    preop,
    iol_position_mm: pos,
    position_source: String(p.position_source ?? 'unspecified'),
    // soporte de diseño para el futuro (hoy pueden ser null):
    iol_tilt_deg: p.iol_tilt_deg ?? null,
    iol_decentration_mm: p.iol_decentration_mm ?? null,
    toric_rotation_deg: p.toric_rotation_deg ?? null,
    capsule_state: p.capsule_state ?? null,
    simulation_flag: 'SIMULACION / NO GROUND TRUTH CLINICO',
  });
}
