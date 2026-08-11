/**
 * toric_cornea.mjs — córnea física ASTIGMÁTICA por superficie (V1.6).
 *
 * Hasta V1.5 toda córnea física trazada era rotacionalmente simétrica (el astigmatismo
 * medido se colapsaba a equivalente esférico CON registro). Este módulo introduce la
 * córnea tórica trazable: superficie(s) BICÓNICA(s) con dos radios principales + eje +
 * PROCEDENCIA. Reglas de honestidad (encargo V1.6):
 *
 *  - Una geometría derivada de K1/K2 NO se llama "córnea física astigmática MEDIDA":
 *    es una RECUPERACIÓN por meridiano bajo la convención declarada (n_k), con la
 *    toricidad posterior sin modelar — y así viaja etiquetada.
 *  - Ninguna política tórica actual pasa STRICT: todas llevan supuestos registrados
 *    (posterior no modelada / escenario declarado). El modelo de datos del ojo no
 *    tiene radios per-meridiano MEDIDOS de ambas caras (OPEN_QUESTIONS #10): hasta
 *    entonces, "córnea tórica en STRICT" es imposible POR CONSTRUCCIÓN, no por olvido.
 *
 * CONVENCIÓN DE EJES: `steep_axis_deg` = meridiano MÁS potente, en el datum x/y del
 * proyecto, módulo 180 (pose.mjs / astigmatism.mjs). El constructor de superficies
 * coloca el meridiano potente en el eje y LOCAL de la bicónica y rota con
 * Rz(steep_axis − 90) — misma convención de fábrica que la LIO tórica sintética.
 *
 * PROHIBIDO (restricción del proyecto): ajustar ratios/índices de aquí contra EVO.
 * RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING.
 */
import { assertFinite, mmToM } from '../core/units.mjs';
import { radiusMmFromKeratometry, singleSurfacePowerFromRadiusMm } from './cornea.mjs';
import { corneaPowerTwoSurfaces } from './paraxial.mjs';

export const ToricCorneaPolicy = Object.freeze({
  /** radios POR MERIDIANO recuperados de K1/K2 con n_k declarado; superficie ÚNICA */
  TORIC_ANTERIOR_FROM_K: 'TORIC_ANTERIOR_FROM_K',
  /** geometría tórica DECLARADA por el llamante (escenario) con procedencia citada */
  TORIC_DECLARED_RADII: 'TORIC_DECLARED_RADII',
});

const norm180 = deg => ((deg % 180) + 180) % 180;

/**
 * Construye el modelo corneal TÓRICO bajo una política declarada.
 *
 * @returns {{
 *   policy, kind, rotationally_symmetric: false,
 *   steep_axis_deg, r_steep_mm, r_flat_mm, power_steep_d, power_flat_d, cylinder_d,
 *   posterior: null|{r_steep_mm, r_flat_mm, steep_axis_deg}, cct_um: number|null,
 *   keratometric_index, invariant_to_device_index, assumptions: string[], provenance
 * }}
 */
export function buildToricCorneaModel(preop, opts = {}) {
  const { policy } = opts;
  if (!Object.values(ToricCorneaPolicy).includes(policy)) {
    throw new TypeError(`política de córnea tórica desconocida: ${policy}. `
      + `Válidas: ${Object.values(ToricCorneaPolicy).join(', ')}`);
  }

  if (policy === ToricCorneaPolicy.TORIC_ANTERIOR_FROM_K) {
    const n_k = preop.keratometric_index ?? null;
    if (n_k === null) {
      throw new TypeError('TORIC_ANTERIOR_FROM_K exige keratometric_index: sin la convención '
        + 'declarada, los radios por meridiano no son recuperables de K1/K2.');
    }
    for (const [v, name] of [[preop.k1_d, 'k1_d'], [preop.k2_d, 'k2_d'],
      [preop.k1_axis_deg, 'k1_axis_deg'], [preop.k2_axis_deg, 'k2_axis_deg']]) {
      assertFinite(v, name);
    }
    // los dos meridianos queratométricos deben ser perpendiculares (astigmatismo
    // regular): la queratometría estándar solo reporta eso; si no lo son, el dato es
    // irregular y NO se fuerza a un modelo bicónico ortogonal
    const sep = Math.abs(norm180(preop.k1_axis_deg - preop.k2_axis_deg));
    const desviacion = Math.abs(sep - 90);
    if (desviacion > 1.0) {
      // el mensaje reporta la DESVIACIÓN canónica de 90° (caza adversarial V1.6: la
      // separación cruda mod 180 confundía — ejes a 10°/30° decían "160°" cuando la
      // separación real de meridianos es 20°, es decir, 70° de desviación)
      throw new RangeError(`TORIC_ANTERIOR_FROM_K: meridianos K no perpendiculares (desviación `
        + `${desviacion.toFixed(1)}° respecto de 90°) — astigmatismo irregular no representable `
        + 'por una bicónica ortogonal');
    }
    const steepEsK1 = preop.k1_d >= preop.k2_d;
    const kSteep = steepEsK1 ? preop.k1_d : preop.k2_d;
    const kFlat = steepEsK1 ? preop.k2_d : preop.k1_d;
    const steepAxis = norm180(steepEsK1 ? preop.k1_axis_deg : preop.k2_axis_deg);
    const rSteep = radiusMmFromKeratometry(kSteep, n_k);
    const rFlat = radiusMmFromKeratometry(kFlat, n_k);
    const pSteep = singleSurfacePowerFromRadiusMm(rSteep);
    const pFlat = singleSurfacePowerFromRadiusMm(rFlat);
    const c = preop.cornea ?? {};
    const postToricaMedida = typeof c.posterior_k1_d === 'number' && typeof c.posterior_k2_d === 'number';
    return {
      policy, kind: 'toric_single_surface_from_k', rotationally_symmetric: false,
      steep_axis_deg: steepAxis,
      r_steep_mm: rSteep, r_flat_mm: rFlat,
      power_steep_d: pSteep, power_flat_d: pFlat,
      cylinder_d: pSteep - pFlat,
      posterior: null, cct_um: null,
      keratometric_index: n_k, invariant_to_device_index: true,
      assumptions: [
        'la superficie posterior no se modela (su potencia queda absorbida en n_ac)',
        'toricidad posterior NO medida ni modelada: el cilindro trazado procede SOLO de '
          + 'la queratometría anterior (recuperada por meridiano con n_k declarado)',
        'el cilindro físico de superficie única difiere del queratométrico por el factor '
          + '(n_ac−1)/(n_k−1): recuperar radios NO preserva la lectura del dispositivo',
        // dato MEDIDO disponible y no usado: se registra, no se calla (patrón V1.5)
        ...(postToricaMedida
          ? ['toricidad posterior MEDIDA disponible y NO usada por esta política']
          : []),
        // cilindro 0 exacto: el "eje empinado" es un desempate sin significado físico
        // (caza adversarial V1.6) — la superficie resultante es de revolución
        ...(pSteep - pFlat === 0
          ? ['cilindro queratométrico 0: el eje tórico es INDEFINIDO — steep_axis_deg '
            + 'reproduce el eje de K1 por desempate, sin significado físico']
          : []),
        ...(typeof c.r_anterior_mm === 'number'
          ? ['r_anterior MEDIO medido disponible y NO usado: esta política recupera radios '
            + 'POR MERIDIANO de K1/K2 (el dato medido no trae meridianos)']
          : []),
      ],
      provenance: 'radios por meridiano RECUPERADOS de K1/K2 bajo la convención n_k declarada '
        + '— NO es una córnea astigmática medida',
    };
  }

  // TORIC_DECLARED_RADII: escenario declarado por el llamante, con procedencia citada
  const { provenance, anterior, posterior = null, steep_axis_deg, cct_um = null } = opts;
  if (!provenance || typeof provenance !== 'string' || provenance.length < 10) {
    throw new TypeError('TORIC_DECLARED_RADII exige `provenance` citada (escenario, estudio, '
      + 'ojo esquemático). Sin fuente no se declara geometría corneal tórica.');
  }
  assertFinite(steep_axis_deg, 'steep_axis_deg');
  const validar = (s, name) => {
    if (!s || typeof s !== 'object') throw new TypeError(`${name} requerido: { r_steep_mm, r_flat_mm }`);
    assertFinite(s.r_steep_mm, `${name}.r_steep_mm`);
    assertFinite(s.r_flat_mm, `${name}.r_flat_mm`);
    if (!(s.r_steep_mm !== 0 && s.r_flat_mm !== 0)) throw new RangeError(`${name}: radio 0`);
    return { r_steep_mm: s.r_steep_mm, r_flat_mm: s.r_flat_mm };
  };
  const ant = validar(anterior, 'anterior');
  const post = posterior === null ? null : validar(posterior, 'posterior');
  if (post !== null && typeof cct_um !== 'number') {
    throw new TypeError('TORIC_DECLARED_RADII con posterior exige cct_um para colocarla');
  }
  const postAxis = post === null ? null : norm180(opts.posterior_steep_axis_deg ?? steep_axis_deg);
  const antAxis = norm180(steep_axis_deg);
  // potencias por meridiano del MODELO COMPLETO: superficie única (exacta) sin
  // posterior; lente gruesa por meridiano si la posterior comparte eje (separable);
  // con ejes DISTINTOS los meridianos principales del sistema no son los de ninguna
  // superficie: las potencias escalares por meridiano NO existen — se declara null y
  // el análisis 2D del trazado es la única descripción válida.
  let pSteep, pFlat, notaEjes = [];
  if (post === null) {
    pSteep = singleSurfacePowerFromRadiusMm(ant.r_steep_mm);
    pFlat = singleSurfacePowerFromRadiusMm(ant.r_flat_mm);
  } else if (postAxis === antAxis) {
    pSteep = corneaPowerTwoSurfaces({
      r_anterior_m: mmToM(ant.r_steep_mm), r_posterior_m: mmToM(post.r_steep_mm), cct_m: cct_um / 1e6,
    }).power_d;
    pFlat = corneaPowerTwoSurfaces({
      r_anterior_m: mmToM(ant.r_flat_mm), r_posterior_m: mmToM(post.r_flat_mm), cct_m: cct_um / 1e6,
    }).power_d;
  } else {
    pSteep = null; pFlat = null;
    notaEjes = ['ejes tóricos anterior/posterior DISTINTOS: no existen potencias escalares '
      + 'por meridiano del sistema — solo el análisis 2D del trazado lo describe'];
  }
  return {
    policy, kind: 'toric_declared', rotationally_symmetric: false,
    steep_axis_deg: antAxis,
    r_steep_mm: ant.r_steep_mm, r_flat_mm: ant.r_flat_mm,
    power_steep_d: pSteep, power_flat_d: pFlat,
    cylinder_d: pSteep === null ? null : pSteep - pFlat,
    posterior: post === null ? null : { ...post, steep_axis_deg: postAxis },
    cct_um,
    keratometric_index: preop.keratometric_index ?? null,
    invariant_to_device_index: true,
    assumptions: [
      'geometría corneal tórica DECLARADA por el llamante (escenario de simulación), '
        + 'no procedente del modelo de datos del ojo',
      ...notaEjes,
    ],
    provenance,
  };
}
