/**
 * iol.mjs — modelo de LIO (CAPA D).
 *
 * Principio inviolable: NO se inventa geometría de lentes comerciales. Cuando el
 * fabricante no publica un parámetro, ese parámetro es UNKNOWN y el modelo pasa a
 * ser `generic:true` (un sustituto de simulación etiquetado, no la lente real).
 *
 * RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING.
 */
import { assertFinite, assertInRange } from './units.mjs';

/** Sentinela serializable para parámetros no documentados. */
export const UNKNOWN = 'UNKNOWN';
export const isUnknown = v => v === UNKNOWN || v === null || v === undefined;

/**
 * Crea la descripción de una LIO.
 *  - `se_power_d` (potencia etiquetada, equivalente esférico) es obligatoria.
 *  - `geometry` documenta lo que se sepa; lo demás queda UNKNOWN.
 *  - `generic` se calcula: true si falta cualquier parámetro físico esencial.
 */
export function createIOL(f) {
  assertFinite(f.se_power_d, 'se_power_d');
  assertInRange(f.se_power_d, -15, 60, 'se_power_d');
  const g = f.geometry ?? {};
  const geometry = {
    kind: g.kind ?? 'thick_lens',               // 'thin_lens' | 'thick_lens'
    refractive_index: g.refractive_index ?? UNKNOWN,
    central_thickness_mm: g.central_thickness_mm ?? UNKNOWN,
    r_anterior_mm: g.r_anterior_mm ?? UNKNOWN,   // convención: +r centro a la derecha (+z)
    r_posterior_mm: g.r_posterior_mm ?? UNKNOWN,
    asphericity_q: g.asphericity_q ?? UNKNOWN,
    toric_design: g.toric_design ?? UNKNOWN,     // 'anterior'|'posterior'|'bitoric'|UNKNOWN
    haptic_angulation_deg: g.haptic_angulation_deg ?? UNKNOWN,
  };
  const essentials = ['refractive_index', 'central_thickness_mm', 'r_anterior_mm', 'r_posterior_mm'];
  const unknowns = essentials.filter(k => isUnknown(geometry[k]));
  const iol = {
    kind: 'iol',
    manufacturer: f.manufacturer ?? UNKNOWN,
    model: f.model ?? UNKNOWN,
    se_power_d: f.se_power_d,
    cylinder_d: f.cylinder_d ?? 0,
    a_constant: f.a_constant ?? UNKNOWN,
    power_range_d: f.power_range_d ?? UNKNOWN,   // [min, max] si se conoce
    toric_catalog_d: f.toric_catalog_d ?? UNKNOWN,
    geometry,
    generic: unknowns.length > 0 || f.generic === true,
    unknown_parameters: unknowns,
    source: f.source ?? 'unspecified',           // de dónde salen los datos declarados
  };
  return Object.freeze(iol);
}

/**
 * LIO GENÉRICA de simulación: lente gruesa equibiconvexa cuyo único dato real es
 * la potencia. Índice y espesor son PARÁMETROS DE SIMULACIÓN DECLARADOS (no datos
 * de fabricante); los radios se derivan del fabricante de lentes (lensmaker) para
 * que la potencia en humor acuoso sea la etiquetada.
 *
 *   P = (n_iol - n_medio) * (1/R1 - 1/R2) + espesor·((n_iol-n_medio)^2/(n_iol·R1·R2))
 *   con R2 = -R1 (equibiconvexa) → resolver R1.
 *
 * Para P≈0 se degrada a plano (R→∞ representado como 1e9 mm).
 */
export function createGenericThickIOL({ se_power_d, cylinder_d = 0, n_iol = 1.49, thickness_mm = 0.8, n_medium = 1.336 }) {
  assertFinite(se_power_d, 'se_power_d');
  assertInRange(n_iol, 1.3, 1.8, 'n_iol');
  assertInRange(thickness_mm, 0.1, 2.5, 'thickness_mm');
  const P = se_power_d;
  let r1_mm;
  if (Math.abs(P) < 1e-6) {
    r1_mm = 1e9;
  } else {
    // P = D*(2/R1) + t*D^2/(n_iol*(-R1^2))  con D = (n_iol-n_medio), R en METROS
    // → (t·D²/n_iol)·x² − 2D·x + P = 0, x = 1/R1  (raíz de menor curvatura física)
    const D = n_iol - n_medium;
    const tM = thickness_mm / 1000;
    const a = tM * D * D / n_iol, b = -2 * D, c = P;
    const disc = b * b - 4 * a * c;
    if (disc <= 0) throw new RangeError('potencia irrealizable para la genérica declarada');
    const x = (-b - Math.sqrt(disc)) / (2 * a); // rama continua con la lente delgada
    r1_mm = 1000 / x;
  }
  return createIOL({
    manufacturer: 'GENERIC', model: `GENERIC_EQUICONVEX_${P}D`,
    se_power_d: P, cylinder_d,
    geometry: {
      kind: 'thick_lens', refractive_index: n_iol, central_thickness_mm: thickness_mm,
      r_anterior_mm: r1_mm, r_posterior_mm: -r1_mm, toric_design: UNKNOWN,
    },
    generic: true,
    source: 'SIMULACION: parámetros declarados, no datos de fabricante',
  });
}
