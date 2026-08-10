/**
 * vectors.mjs — álgebra de astigmatismo en espacio de doble ángulo (CAPA D — astigmatismo).
 *
 * Reescritura limpia y testada por propiedades; NO importa nada del legacy.
 * Fundamento (óptica estándar): un cilindro de magnitud m con meridiano curvo θ
 * se representa como vector [m·cos 2θ, m·sin 2θ]; la composición de astigmatismos
 * es la suma vectorial en ese espacio (los meridianos son mod 180°).
 *
 * Convención de signo del proyecto: la MAGNITUD es ≥ 0 y `axis_deg` señala el
 * meridiano MÁS CURVO (mayor potencia). Un vector con magnitud m y eje θ es
 * idéntico a magnitud m y eje θ+180, y opuesto a magnitud m y eje θ±90.
 *
 * RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING.
 */
import { assertFinite, normMeridianDeg, degToRad, radToDeg } from '../core/units.mjs';

/** Cilindro (magnitud, meridiano curvo) → vector de doble ángulo [x, y]. */
export function toVec(magnitude_d, steepAxis_deg) {
  assertFinite(magnitude_d, 'magnitude');
  if (magnitude_d < 0) throw new RangeError('magnitud negativa: usa el eje perpendicular');
  const a2 = 2 * degToRad(normMeridianDeg(steepAxis_deg));
  return [magnitude_d * Math.cos(a2), magnitude_d * Math.sin(a2)];
}

/** Vector → {magnitude_d, steepAxis_deg} con eje en [0, 180). */
export function fromVec([x, y]) {
  assertFinite(x, 'x'); assertFinite(y, 'y');
  const magnitude_d = Math.hypot(x, y);
  if (magnitude_d < 1e-12) return { magnitude_d: 0, steepAxis_deg: 0 };
  return { magnitude_d, steepAxis_deg: normMeridianDeg(radToDeg(Math.atan2(y, x)) / 2) };
}

export const addVec = (a, b) => [a[0] + b[0], a[1] + b[1]];
export const scaleVec = (a, s) => [a[0] * s, a[1] * s];

/**
 * Astigmatismo de una superficie/queratometría dada por dos potencias en meridianos
 * perpendiculares: (kA @ axisA, kB @ axisB). Funciona con potencias negativas
 * (córnea posterior): el meridiano "curvo" es el de MAYOR potencia con signo.
 */
export function cylFromMeridians(kA_d, axisA_deg, kB_d, axisB_deg) {
  assertFinite(kA_d, 'kA'); assertFinite(kB_d, 'kB');
  const dAx = Math.abs(normMeridianDeg(axisA_deg) - normMeridianDeg(axisB_deg));
  if (Math.min(dAx, 180 - dAx) < 85 || Math.min(dAx, 180 - dAx) > 95) {
    throw new RangeError('meridianos no perpendiculares (±5°): ' + axisA_deg + '/' + axisB_deg);
  }
  return kB_d >= kA_d ? toVec(kB_d - kA_d, axisB_deg) : toVec(kA_d - kB_d, axisA_deg);
}

/**
 * Vector del astigmatismo quirúrgico inducido (SIA): la incisión APLANA su
 * meridiano, lo que equivale a añadir un cilindro con meridiano curvo
 * perpendicular a la incisión (método vectorial estándar).
 */
export function siaVec(sia_d, incisionAxis_deg) {
  assertFinite(sia_d, 'sia');
  if (sia_d < 0) throw new RangeError('SIA negativo no definido');
  return toVec(sia_d, normMeridianDeg(incisionAxis_deg + 90));
}
