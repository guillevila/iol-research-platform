/**
 * units.mjs — sistema explícito de unidades y guardas numéricas.
 *
 * CONVENCIONES DEL PROYECTO (obligatorias en todo `src/`):
 *  - Longitudes anatómicas: milímetros (mm). Sufijo `_mm` en nombres de campo.
 *  - Distancias en fórmulas de vergencia: metros (m). Conversión SIEMPRE explícita.
 *  - Potencias y vergencias: dioptrías (D = 1/m).
 *  - Ángulos en la capa de dominio clínico: grados [0, 180) para meridianos.
 *    Ángulos en la capa óptica/geométrica: radianes. Conversión SIEMPRE explícita.
 *  - Datum axial: ápex corneal anterior = z = 0; eje óptico = +z hacia retina.
 *
 * Sin números mágicos: toda constante vive aquí o en optics/constants.mjs con doc.
 *
 * RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING.
 */

export const MM_PER_M = 1000;

export function assertFinite(x, name = 'valor') {
  if (typeof x !== 'number' || !Number.isFinite(x)) {
    throw new TypeError(`${name} debe ser un número finito; recibido: ${String(x)}`);
  }
  return x;
}

export function assertInRange(x, lo, hi, name = 'valor') {
  assertFinite(x, name);
  if (x < lo || x > hi) throw new RangeError(`${name}=${x} fuera de [${lo}, ${hi}]`);
  return x;
}

// ---- longitud ----
export const mmToM = mm => assertFinite(mm, 'mm') / MM_PER_M;
export const mToMm = m => assertFinite(m, 'm') * MM_PER_M;

/**
 * Curvatura (1/m) a partir de un radio en mm. Es la ÚNICA magnitud del proyecto en
 * la que el infinito es físicamente significativo: r = ±Infinity ⇔ superficie plana
 * ⇔ curvatura 0 exacta. Usar esto en vez de `1/mmToM(r)` evita tanto el rechazo del
 * plano legítimo como los sentinelas finitos ("r muy grande") que dejan potencia
 * residual espuria.
 */
export function curvatureFromRadiusMm(r_mm, name = 'radio') {
  if (typeof r_mm !== 'number' || Number.isNaN(r_mm)) {
    throw new TypeError(`${name} debe ser un número (o ±Infinity para plano); recibido: ${String(r_mm)}`);
  }
  if (r_mm === 0) throw new RangeError(`${name}=0: radio nulo sin significado físico`);
  if (!Number.isFinite(r_mm)) return 0;
  return MM_PER_M / r_mm;
}

// ---- ángulos ----
export const degToRad = deg => assertFinite(deg, 'deg') * Math.PI / 180;
export const radToDeg = rad => assertFinite(rad, 'rad') * 180 / Math.PI;

/** Normaliza un meridiano a [0, 180). Los meridianos oculares son mod 180°. */
export function normMeridianDeg(deg) {
  assertFinite(deg, 'meridiano');
  const m = ((deg % 180) + 180) % 180;
  return m;
}

// ---- potencia / focal ----
/** Focal en metros de una potencia en dioptrías (índice imagen n). f' = n / P. */
export function focalMFromDiopters(P, n = 1) {
  assertFinite(P, 'P');
  if (P === 0) throw new RangeError('potencia 0 D no tiene focal finita');
  return assertFinite(n, 'n') / P;
}
export function dioptersFromFocalM(fM, n = 1) {
  assertFinite(fM, 'f');
  if (fM === 0) throw new RangeError('focal 0 no tiene potencia finita');
  return assertFinite(n, 'n') / fM;
}

/** Vergencia reducida (D) de un punto a distancia dM (m) en medio de índice n. */
export function vergenceAtDistance(n, dM) {
  assertFinite(n, 'n'); assertFinite(dM, 'd');
  if (dM === 0) throw new RangeError('distancia 0: vergencia infinita');
  return n / dM;
}
