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

/**
 * Valida el cilindro de la LIO: número finito, UNKNOWN o ausente (→ UNKNOWN).
 * Antes era `?? 0`: el único parámetro óptico de la LIO que convertía "no documentado"
 * en "esférica declarada" sin dejar rastro (hallazgo de la caza adversarial de
 * fidelidad). 0 sigue siendo válido: significa ESFÉRICA DECLARADA, no desconocida.
 */
function normCylinder(v) {
  if (v === null || v === undefined || v === UNKNOWN) return UNKNOWN;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  throw new TypeError(`cylinder_d debe ser un número finito o UNKNOWN; recibido: ${String(v)}`);
}

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

/**
 * Sentinela para el campo escalar de asfericidad de una cara TÓRICA (V1.6): la Q vive
 * POR MERIDIANO dentro del bloque tórico (q_x/q_y) y el campo escalar deja de tener
 * sentido. Cualquier consumidor que lo lea como número fallará ruidosamente en vez de
 * asumir una esfera.
 */
export const PER_MERIDIAN = 'PER_MERIDIAN';

/**
 * Valida un bloque tórico de cara (V1.6): radios principales por meridiano LOCAL x/y
 * (±Infinity = meridiano plano, como en biconicSurface) y Q por meridiano.
 * La ORIENTACIÓN no vive aquí: los meridianos son los ejes locales de la lente por
 * convención, y el eje tórico se orienta EXCLUSIVAMENTE con pose.rotation_z (V1.3/V1.7).
 * Convención de fábrica de este proyecto: meridiano MÁS potente en y local.
 */
function normToricFace(tf, name) {
  if (tf === null || tf === undefined) return null;
  if (typeof tf !== 'object') throw new TypeError(`${name} debe ser un objeto { r_x_mm, r_y_mm, q_x, q_y }`);
  for (const k of ['r_x_mm', 'r_y_mm']) {
    const v = tf[k];
    if (typeof v !== 'number' || Number.isNaN(v)) throw new TypeError(`${name}.${k} debe ser número (±Infinity = plano)`);
    if (v === 0) throw new RangeError(`${name}.${k} = 0 no es una superficie`);
  }
  return Object.freeze({
    r_x_mm: tf.r_x_mm, r_y_mm: tf.r_y_mm,
    q_x: normAsphericity(tf.q_x, `${name}.q_x`),
    q_y: normAsphericity(tf.q_y, `${name}.q_y`),
  });
}

/** Radio de curvatura MEDIA de una cara tórica (bookkeeping EE): c̄ = (cx+cy)/2. */
function meanRadiusOfToricFace(tf) {
  const cMean = (1 / tf.r_x_mm + 1 / tf.r_y_mm) / 2;
  return cMean === 0 ? Infinity : 1 / cMean;
}

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
  // caras tóricas (V1.6): geometría bicónica explícita por meridiano LOCAL. La etiqueta
  // nominal (cylinder_d) NUNCA se convierte en radios en silencio: o la cara tórica
  // viene DECLARADA aquí (fabricante con procedencia / sintética etiquetada), o no hay
  // geometría tórica que trazar.
  const toricAnt = normToricFace(g.toric_anterior, 'toric_anterior');
  const toricPost = normToricFace(g.toric_posterior, 'toric_posterior');
  for (const [tf, rKey, qKey] of [
    [toricAnt, 'r_anterior_mm', 'asphericity_q_anterior'],
    [toricPost, 'r_posterior_mm', 'asphericity_q_posterior'],
  ]) {
    if (tf && g[rKey] !== undefined) {
      throw new TypeError(`geometría contradictoria: ${rKey} y su cara tórica a la vez — `
        + 'el radio EE de una cara tórica se DERIVA de la curvatura media, no se declara aparte');
    }
    if (tf && g[qKey] !== undefined) {
      throw new TypeError(`geometría contradictoria: ${qKey} escalar y cara tórica a la vez — `
        + 'la Q de una cara tórica vive POR MERIDIANO (q_x/q_y) dentro del bloque tórico');
    }
  }
  const geometry = {
    kind: g.kind ?? 'thick_lens',               // 'thin_lens' | 'thick_lens'
    refractive_index: g.refractive_index ?? UNKNOWN,
    central_thickness_mm: g.central_thickness_mm ?? UNKNOWN,
    // convención: +r centro a la derecha (+z); para cara tórica, radio de curvatura MEDIA
    r_anterior_mm: toricAnt ? meanRadiusOfToricFace(toricAnt) : (g.r_anterior_mm ?? UNKNOWN),
    r_posterior_mm: toricPost ? meanRadiusOfToricFace(toricPost) : (g.r_posterior_mm ?? UNKNOWN),
    asphericity_q_anterior: toricAnt ? PER_MERIDIAN : normAsphericity(g.asphericity_q_anterior, 'asphericity_q_anterior'),
    asphericity_q_posterior: toricPost ? PER_MERIDIAN : normAsphericity(g.asphericity_q_posterior, 'asphericity_q_posterior'),
    toric_anterior: toricAnt,
    toric_posterior: toricPost,
    toric_design: (toricAnt || toricPost)
      ? (toricAnt && toricPost ? 'bitoric' : (toricAnt ? 'anterior' : 'posterior'))
      : (g.toric_design ?? UNKNOWN),
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
    cylinder_d: normCylinder(f.cylinder_d),
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

/** ¿Tiene la LIO geometría tórica declarada (alguna cara bicónica)? (V1.6) */
export function hasToricGeometry(iol) {
  return Boolean(iol?.geometry?.toric_anterior || iol?.geometry?.toric_posterior);
}

/**
 * Potencias FÍSICAS por meridiano LOCAL (x/y) de una LIO con geometría tórica (V1.6):
 * la misma lente gruesa que physicalPowerOfIOL, aplicada meridiano a meridiano. Es
 * EXACTA para los meridianos principales de un sistema alineado con los ejes locales
 * (el paraxial por meridiano de un sistema tórico ortogonal es separable).
 *
 * `cylinder_d = power_y − power_x`: con la convención de fábrica de este proyecto
 * (meridiano MÁS potente en y local), una LIO tórica de etiqueta positiva da
 * cylinder_d > 0. Sirve para VERIFICAR que la etiqueta corresponde a la geometría —
 * nunca al revés (la etiqueta jamás fabrica radios).
 */
export function physicalPowersOfToricIOL(iol, { n_before = 1.336, n_after = 1.336 } = {}) {
  assertTraceableGeometry(iol, 'physicalPowersOfToricIOL');
  if (!hasToricGeometry(iol)) {
    throw new TypeError('physicalPowersOfToricIOL: la LIO no tiene geometría tórica declarada — '
      + 'usa physicalPowerOfIOL para lentes de revolución');
  }
  const g = iol.geometry;
  const n = g.refractive_index;
  const t = mmToM(g.central_thickness_mm);
  const cara = (tf, rEE, axis) => tf
    ? 1 / mmToM(axis === 'x' ? tf.r_x_mm : tf.r_y_mm)
    : curvatureFromRadiusMm(rEE, 'radio');
  const powerAlong = axis => {
    const c1 = cara(g.toric_anterior, g.r_anterior_mm, axis);
    const c2 = cara(g.toric_posterior, g.r_posterior_mm, axis);
    const P1 = (n - n_before) * c1;
    const P2 = (n_after - n) * c2;
    return P1 + P2 - (t / n) * P1 * P2;
  };
  const power_x_d = powerAlong('x'), power_y_d = powerAlong('y');
  return {
    power_x_d, power_y_d,
    cylinder_d: power_y_d - power_x_d,
    mean_d: (power_x_d + power_y_d) / 2,
  };
}
