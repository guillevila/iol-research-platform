/**
 * iol.mjs — modelo de LIO (CAPA D).
 *
 * SEPARACIÓN FUNDAMENTAL (V0.5 / P0.3):
 *   - `nominal_power_d`  : la ETIQUETA comercial. Identifica el modelo; NO es lo que
 *                          traza el motor físico.
 *   - `geometry`         : la geometría FÍSICA (radios, espesor, índice). Es lo único
 *                          que el ray tracer puede trazar.
 *   - `geometry_status`  : de dónde viene esa geometría —
 *        DERIVED_GENERIC : derivada matemáticamente de la potencia (lente de
 *                          simulación declarada; NO representa una lente comercial);
 *        MANUFACTURER    : documentada por el fabricante, con procedencia citada;
 *        UNKNOWN         : no se conoce → el trazado debe FALLAR, nunca sustituir.
 *
 * Principio inviolable: NO se inventa geometría de lentes comerciales.
 *
 * RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING.
 */
import { assertFinite, assertInRange, mmToM, curvatureFromRadiusMm } from './units.mjs';

/** Sentinela serializable para parámetros no documentados. */
export const UNKNOWN = 'UNKNOWN';
export const isUnknown = v => v === UNKNOWN || v === null || v === undefined;

/**
 * Sentinela para asfericidad: la superficie se modela como ESFERA por SUPUESTO DECLARADO
 * de quien construyó el modelo (típicamente la lente genérica de simulación, cuya
 * geometría entera es declarada). Es distinto de UNKNOWN, y la diferencia importa:
 *
 *   ASSUMED_SPHERICAL  "decidí modelar esta superficie como esfera"  → se traza sin más
 *   UNKNOWN            "no sé qué asfericidad tiene"                 → si se traza como
 *                       esfera, el supuesto queda REGISTRADO en la salida, nunca tácito
 *   número             asfericidad Q documentada                     → exige un trazador
 *                       que la implemente; ignorarla sería falsear un dato documentado
 *
 * Antes UNKNOWN se convertía en esfera en silencio: el mismo patrón de relleno tácito
 * que V0.5 eliminó del índice queratométrico y del radio plano.
 */
export const ASSUMED_SPHERICAL = 'ASSUMED_SPHERICAL';

/** Valida un valor de asfericidad: número finito, sentinela, o ausente (→ UNKNOWN). */
function normAsphericity(v, name) {
  if (v === null || v === undefined || v === UNKNOWN) return UNKNOWN;
  if (v === ASSUMED_SPHERICAL) return ASSUMED_SPHERICAL;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  throw new TypeError(`${name} debe ser un número finito, ASSUMED_SPHERICAL o UNKNOWN; `
    + `recibido: ${String(v)}`);
}

export const GeometryStatus = Object.freeze({
  DERIVED_GENERIC: 'DERIVED_GENERIC',
  MANUFACTURER: 'MANUFACTURER',
  UNKNOWN: 'UNKNOWN',
});

/** Parámetros sin los cuales no se puede trazar una lente gruesa. */
export const ESSENTIAL_GEOMETRY = Object.freeze([
  'refractive_index', 'central_thickness_mm', 'r_anterior_mm', 'r_posterior_mm',
]);

/**
 * Crea la descripción de una LIO.
 *  - `nominal_power_d` (potencia etiquetada, equivalente esférico) obligatoria.
 *  - `geometry` documenta lo que se sepa; lo demás queda UNKNOWN.
 *  - `geometry_status` se DEDUCE: si falta algún esencial → UNKNOWN, se ignora lo
 *    que declare el llamante (no se puede afirmar procedencia de lo que no existe).
 */
export function createIOL(f) {
  assertFinite(f.nominal_power_d, 'nominal_power_d');
  assertInRange(f.nominal_power_d, -15, 60, 'nominal_power_d');
  const g = f.geometry ?? {};
  const geometry = {
    kind: g.kind ?? 'thick_lens',               // 'thin_lens' | 'thick_lens'
    refractive_index: g.refractive_index ?? UNKNOWN,
    central_thickness_mm: g.central_thickness_mm ?? UNKNOWN,
    r_anterior_mm: g.r_anterior_mm ?? UNKNOWN,   // convención: +r centro a la derecha (+z)
    r_posterior_mm: g.r_posterior_mm ?? UNKNOWN,
    asphericity_q_anterior: normAsphericity(g.asphericity_q_anterior, 'asphericity_q_anterior'),
    asphericity_q_posterior: normAsphericity(g.asphericity_q_posterior, 'asphericity_q_posterior'),
    toric_design: g.toric_design ?? UNKNOWN,     // 'anterior'|'posterior'|'bitoric'|UNKNOWN
    haptic_angulation_deg: g.haptic_angulation_deg ?? UNKNOWN,
  };
  const unknowns = ESSENTIAL_GEOMETRY.filter(k => isUnknown(geometry[k]));
  const declared = f.geometry_status;
  if (declared === GeometryStatus.MANUFACTURER && !f.provenance) {
    throw new TypeError('geometry_status MANUFACTURER exige `provenance` documentada (ficha/patente)');
  }
  const geometry_status = unknowns.length > 0
    ? GeometryStatus.UNKNOWN
    : (declared ?? GeometryStatus.UNKNOWN);

  return Object.freeze({
    kind: 'iol',
    manufacturer: f.manufacturer ?? UNKNOWN,
    model: f.model ?? UNKNOWN,
    nominal_power_d: f.nominal_power_d,
    cylinder_d: f.cylinder_d ?? 0,
    a_constant: f.a_constant ?? UNKNOWN,
    power_range_d: f.power_range_d ?? UNKNOWN,   // [min, max] si se conoce
    toric_catalog_d: f.toric_catalog_d ?? UNKNOWN,
    geometry,
    geometry_status,
    unknown_parameters: unknowns,
    /** true solo si la geometría NO representa una lente comercial real */
    is_simulation_surrogate: geometry_status === GeometryStatus.DERIVED_GENERIC,
    provenance: f.provenance ?? null,
    source: f.source ?? 'unspecified',
  });
}

/** ¿Puede el ray tracer trabajar con esta lente? */
export function hasTraceableGeometry(iol) {
  return iol?.geometry_status !== undefined
    && iol.geometry_status !== GeometryStatus.UNKNOWN
    && ESSENTIAL_GEOMETRY.every(k => typeof iol.geometry?.[k] === 'number');
}

/**
 * Guarda dura: falla con mensaje accionable en lugar de sustituir en silencio por
 * una genérica. Es la barrera que impide "ray tracing comercial falso".
 */
export function assertTraceableGeometry(iol, context = 'trazado') {
  if (hasTraceableGeometry(iol)) return iol;
  const faltan = iol?.unknown_parameters?.length ? iol.unknown_parameters.join(', ') : 'geometría';
  throw new TypeError(
    `${context}: la LIO ${iol?.manufacturer ?? '?'}/${iol?.model ?? '?'} no tiene geometría trazable `
    + `(geometry_status=${iol?.geometry_status ?? 'AUSENTE'}; faltan: ${faltan}). `
    + 'Prohibido sustituir por una genérica sin declararlo: usa una GenericIOLFactory explícitamente.'
  );
}

/**
 * Potencia FÍSICA que realmente tiene la geometría (lente gruesa en un medio):
 *   P = P1 + P2 − (t/n_iol)·P1·P2,  P1=(n_iol−n_before)/r1,  P2=(n_after−n_iol)/r2
 * Sirve para verificar que la etiqueta nominal se corresponde con la geometría.
 * La asfericidad no interviene y es correcto: la potencia paraxial depende solo de la
 * curvatura en el vértice (Q entra en la sagita a orden r⁴).
 */
export function physicalPowerOfIOL(iol, { n_before = 1.336, n_after = 1.336 } = {}) {
  assertTraceableGeometry(iol, 'physicalPowerOfIOL');
  const g = iol.geometry;
  const n = g.refractive_index;
  const c1 = curvatureFromRadiusMm(g.r_anterior_mm, 'r_anterior_mm');
  const c2 = curvatureFromRadiusMm(g.r_posterior_mm, 'r_posterior_mm');
  const t = mmToM(g.central_thickness_mm);
  const P1 = (n - n_before) * c1;
  const P2 = (n_after - n) * c2;
  return P1 + P2 - (t / n) * P1 * P2;
}

/**
 * Discrepancia entre la etiqueta y la física, en dioptrías. Un valor grande indica
 * que la geometría NO corresponde a la potencia declarada (error de datos).
 */
export function nominalVsPhysicalMismatch(iol, medium) {
  return physicalPowerOfIOL(iol, medium) - iol.nominal_power_d;
}
