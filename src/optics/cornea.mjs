/**
 * cornea.mjs — política corneal EXPLÍCITA (V0.5 / P0.1).
 *
 * MOTIVO (auditoría V0, hallazgo H1): `keratometric_index` se almacenaba en el ojo
 * pero la física nunca lo consultaba, y `corneaRadiusFromKeratometry` no se invocaba
 * desde ningún sitio. El motor tomaba la lectura K del biómetro COMO SI fuera la
 * potencia corneal física. Eso no es un redondeo: es confundir la convención de un
 * dispositivo con una magnitud óptica.
 *
 * EL PROBLEMA, EN UNA LÍNEA
 * ------------------------
 * Un biómetro no mide dioptrías: mide un radio y lo convierte con un índice FICTICIO
 * elegido por el fabricante (1.3375, 1.3315, 1.332...):
 *
 *     K_lectura = (n_k − 1)·1000 / r_mm         [D, r en mm]
 *
 * Dos aparatos midiendo LA MISMA córnea física devuelven K DISTINTAS. Si el motor
 * trata K como potencia, hereda la marca del aparato. Si el motor recupera primero
 * el radio, la física deja de depender del fabricante:
 *
 *     r_mm = (n_k − 1)·1000 / K_lectura         (invariante: recupera SIEMPRE el mismo r)
 *
 * POLÍTICAS DISPONIBLES (ninguna se aplica en silencio; toda salida lleva su etiqueta)
 * -----------------------------------------------------------------------------------
 *  KERATOMETRIC_READING       P = K. Compatible con lo publicado en V0 y con la
 *                             mayoría de fórmulas clásicas, que están calibradas sobre
 *                             esta misma confusión. NO es invariante al dispositivo.
 *  SINGLE_SURFACE_FROM_RADIUS Recupera r con n_k y refracta aire→acuoso en UNA
 *                             superficie:  P = (n_ac − 1)·1000/r.
 *                             SÍ es invariante al dispositivo. No modela la posterior.
 *  TWO_SURFACE_MEASURED       Exige r_anterior, r_posterior y CCT MEDIDOS. Es la única
 *                             políticamente completa; no inventa nada.
 *  TWO_SURFACE_RATIO          Recupera r_anterior y asume r_posterior = ratio·r_anterior.
 *                             El ratio es un SUPUESTO: exige `posterior_ratio` y
 *                             `provenance` citada. Sin fuente, no se construye.
 *
 * PROHIBIDO (restricción del proyecto): ajustar el ratio posterior, el índice o
 * cualquier constante de aquí para acercar la salida a EVO. Nada en este archivo
 * procede de ajustar EVO.
 *
 * RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING.
 */
import { assertFinite, mmToM } from '../core/units.mjs';
import { N_AIR, N_AQUEOUS, N_CORNEA } from './constants.mjs';
import { corneaPowerTwoSurfaces } from './paraxial.mjs';

export const CorneaPolicy = Object.freeze({
  KERATOMETRIC_READING: 'KERATOMETRIC_READING',
  SINGLE_SURFACE_FROM_RADIUS: 'SINGLE_SURFACE_FROM_RADIUS',
  TWO_SURFACE_MEASURED: 'TWO_SURFACE_MEASURED',
  TWO_SURFACE_RATIO: 'TWO_SURFACE_RATIO',
});

/**
 * Política por defecto. Se mantiene KERATOMETRIC_READING DELIBERADAMENTE para no
 * alterar de forma retroactiva los resultados ya publicados en experiments/ (que se
 * generaron con ella) — pero ahora es una elección declarada y registrada en cada
 * salida, no un accidente. La divergencia entre políticas se cuantifica en exp007.
 */
export const DEFAULT_CORNEA_POLICY = CorneaPolicy.KERATOMETRIC_READING;

/** Índices queratométricos de biómetros reales (convención de lectura del fabricante). */
export const KERATOMETRIC_INDICES = Object.freeze({
  n_1_3375: 1.3375,   // IOLMaster, Lenstar y la mayoría de queratómetros
  n_1_3315: 1.3315,   // convención "índice corneal neto"
  n_1_332: 1.332,     // usada por algunos topógrafos
});

/** r_mm → K [D] con el índice ficticio declarado del dispositivo. */
export function keratometryFromRadiusMm(r_mm, keratometricIndex = 1.3375) {
  assertFinite(r_mm, 'r_mm'); assertFinite(keratometricIndex, 'keratometricIndex');
  if (!(r_mm > 0)) throw new RangeError(`radio corneal debe ser > 0; recibido ${r_mm}`);
  if (!(keratometricIndex > 1)) throw new RangeError('índice queratométrico debe ser > 1');
  return (keratometricIndex - 1) * 1000 / r_mm;
}

/**
 * K [D] → r_mm. Inversa EXACTA de la anterior: es la operación que devuelve la
 * física al terreno del radio, donde la marca del biómetro deja de importar.
 */
export function radiusMmFromKeratometry(k_d, keratometricIndex = 1.3375) {
  assertFinite(k_d, 'k_d'); assertFinite(keratometricIndex, 'keratometricIndex');
  if (!(k_d > 0)) throw new RangeError(`K debe ser > 0; recibido ${k_d}`);
  if (!(keratometricIndex > 1)) throw new RangeError('índice queratométrico debe ser > 1');
  return (keratometricIndex - 1) * 1000 / k_d;
}

/**
 * Potencia de UNA superficie refractante aire→acuoso de radio r_mm.
 *   P = (n_ac − n_aire)·1000 / r_mm
 */
export function singleSurfacePowerFromRadiusMm(r_mm, { n_before = N_AIR, n_after = N_AQUEOUS } = {}) {
  assertFinite(r_mm, 'r_mm');
  if (!(r_mm > 0)) throw new RangeError('radio corneal debe ser > 0');
  return (n_after - n_before) * 1000 / r_mm;
}

/**
 * Factor por el que una lectura K sobreestima la potencia física de superficie única:
 *   P / K = (n_ac − 1) / (n_k − 1)
 * Con n_k = 1.3375 vale 0.9956 → ~ −0.19 D sobre una K de 43.5.
 */
export function keratometricBiasFactor(keratometricIndex = 1.3375, n_after = N_AQUEOUS) {
  return (n_after - N_AIR) / (keratometricIndex - 1);
}

function requireMeasuredSurfaces(preop) {
  const c = preop.cornea ?? {};
  const ok = typeof c.r_anterior_mm === 'number'
    && typeof c.r_posterior_mm === 'number'
    && typeof preop.cct_um === 'number';
  return ok ? c : null;
}

/**
 * Construye el modelo corneal bajo una política declarada.
 *
 * @returns {{
 *   power_d: number, policy: string, kind: string,
 *   r_anterior_mm: number|null, r_posterior_mm: number|null,
 *   keratometric_index: number|null, invariant_to_device_index: boolean,
 *   assumptions: string[], provenance: string|null
 * }}
 */
export function buildCorneaModel(preop, {
  policy = DEFAULT_CORNEA_POLICY,
  posterior_ratio = null,
  provenance = null,
  n_cornea = N_CORNEA,
  n_aqueous = N_AQUEOUS,
} = {}) {
  if (!Object.values(CorneaPolicy).includes(policy)) {
    throw new TypeError(`política corneal desconocida: ${policy}. `
      + `Válidas: ${Object.values(CorneaPolicy).join(', ')}`);
  }
  const n_k = preop.keratometric_index ?? null;
  const K = preop.mean_k_d;

  // La medida real siempre puede satisfacer la política más completa.
  const measured = requireMeasuredSurfaces(preop);

  if (policy === CorneaPolicy.TWO_SURFACE_MEASURED) {
    if (!measured) {
      throw new TypeError('TWO_SURFACE_MEASURED exige r_anterior_mm, r_posterior_mm y cct_um '
        + 'MEDIDOS. Este ojo no los tiene: NO se sustituyen por supuestos. '
        + 'Usa SINGLE_SURFACE_FROM_RADIUS o declara TWO_SURFACE_RATIO con procedencia.');
    }
    const { power_d } = corneaPowerTwoSurfaces({
      r_anterior_m: mmToM(measured.r_anterior_mm),
      r_posterior_m: mmToM(measured.r_posterior_mm),
      cct_m: preop.cct_um / 1e6,
      nCornea: n_cornea, nAfter: n_aqueous,
    });
    return {
      power_d, policy, kind: 'two_surface_physical',
      r_anterior_mm: measured.r_anterior_mm, r_posterior_mm: measured.r_posterior_mm,
      keratometric_index: n_k, invariant_to_device_index: true,
      assumptions: [], provenance: 'radios y CCT medidos',
    };
  }

  if (policy === CorneaPolicy.TWO_SURFACE_RATIO) {
    if (!(posterior_ratio > 0)) {
      throw new TypeError('TWO_SURFACE_RATIO exige `posterior_ratio` > 0 explícito. '
        + 'No existe un ratio por defecto: sería un coeficiente inventado.');
    }
    if (!provenance || typeof provenance !== 'string' || provenance.length < 10) {
      throw new TypeError('TWO_SURFACE_RATIO exige `provenance` citada para el ratio '
        + '(estudio, ojo esquemático, DOI). Prohibido ajustarlo contra EVO.');
    }
    if (n_k === null) throw new TypeError('se requiere keratometric_index para recuperar el radio');
    if (typeof preop.cct_um !== 'number') {
      throw new TypeError('TWO_SURFACE_RATIO requiere cct_um (medido) para la lente gruesa corneal');
    }
    const r1 = measured?.r_anterior_mm ?? radiusMmFromKeratometry(K, n_k);
    const r2 = posterior_ratio * r1;
    const { power_d } = corneaPowerTwoSurfaces({
      r_anterior_m: mmToM(r1), r_posterior_m: mmToM(r2), cct_m: preop.cct_um / 1e6,
      nCornea: n_cornea, nAfter: n_aqueous,
    });
    return {
      power_d, policy, kind: 'two_surface_assumed_ratio',
      r_anterior_mm: r1, r_posterior_mm: r2,
      keratometric_index: n_k, invariant_to_device_index: true,
      assumptions: [`r_posterior = ${posterior_ratio} · r_anterior (SUPUESTO declarado)`],
      provenance,
    };
  }

  if (policy === CorneaPolicy.SINGLE_SURFACE_FROM_RADIUS) {
    if (n_k === null) {
      throw new TypeError('SINGLE_SURFACE_FROM_RADIUS exige keratometric_index: sin saber con '
        + 'qué convención se generó la lectura K, el radio no es recuperable.');
    }
    const r1 = measured?.r_anterior_mm ?? radiusMmFromKeratometry(K, n_k);
    return {
      power_d: singleSurfacePowerFromRadiusMm(r1, { n_after: n_aqueous }),
      policy, kind: 'single_surface_from_radius',
      r_anterior_mm: r1, r_posterior_mm: null,
      keratometric_index: n_k, invariant_to_device_index: true,
      assumptions: ['la superficie posterior no se modela (su potencia queda absorbida en n_ac)'],
      provenance: 'radio recuperado de la lectura del dispositivo',
    };
  }

  // KERATOMETRIC_READING
  return {
    power_d: K,
    policy, kind: 'keratometric_reading',
    r_anterior_mm: n_k === null ? null : radiusMmFromKeratometry(K, n_k),
    r_posterior_mm: null,
    keratometric_index: n_k,
    invariant_to_device_index: false,
    assumptions: [
      'P = K: se usa la lectura del dispositivo COMO potencia física',
      `depende del índice ficticio del fabricante (n_k=${n_k}); otro biómetro daría otra P`,
    ],
    provenance: 'convención del dispositivo, no magnitud física',
  };
}
