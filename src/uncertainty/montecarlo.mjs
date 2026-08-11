/**
 * montecarlo.mjs — incertidumbre por simulación Monte Carlo (CAPA F — incertidumbre).
 *
 * Propaga incertidumbres DECLARADAS de entrada (desviaciones típicas que el usuario
 * del experimento fija explícitamente) hasta la refracción prevista, y cuantifica la
 * probabilidad de que la alternativa de potencia hubiera sido mejor elección.
 *
 * IMPORTANTE: las sigmas son PARÁMETROS DE SIMULACIÓN declarados; las varianzas
 * reales (biológicas y de dispositivo) requieren datos o fuente citable
 * (OPEN_QUESTIONS #6). Nada de esto es verdad clínica.
 *
 * Reproducibilidad: PRNG con semilla fija (mismo LCG del proyecto) + Box-Muller.
 * RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING.
 */
import { assertFinite } from '../core/units.mjs';
import { makeRng } from '../synth/generator.mjs';
import { createPreopEye, createPredictedPostopEye } from '../core/eye.mjs';
import { buildParaxialEye } from '../optics/eyebuilder.mjs';
import { DEFAULT_FIDELITY_MODE } from '../core/fidelity.mjs';

/** Muestreador normal (Box-Muller) sobre un PRNG uniforme con semilla. */
export function gaussianSampler(rng) {
  let spare = null;
  return (mu = 0, sigma = 1) => {
    assertFinite(mu, 'mu'); assertFinite(sigma, 'sigma');
    if (sigma === 0) return mu;
    if (sigma < 0) throw new RangeError('sigma negativa');
    if (spare !== null) { const v = spare; spare = null; return mu + sigma * v; }
    let u1 = 0;
    do { u1 = rng(); } while (u1 <= 1e-12);
    const u2 = rng();
    const r = Math.sqrt(-2 * Math.log(u1));
    spare = r * Math.sin(2 * Math.PI * u2);
    return mu + sigma * r * Math.cos(2 * Math.PI * u2);
  };
}

function percentile(sorted, p) {
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
  return sorted[idx];
}

/**
 * Distribución de la refracción prevista para una potencia fija, bajo sigmas
 * declaradas en { iol_position_mm, al_mm, mean_k_d }.
 * Cada extracción perturba el ojo y la posición; las extracciones físicamente
 * inválidas (rechazadas por los validadores) se cuentan, no se ocultan.
 */
export function monteCarloRefraction({ preop, iol_position_mm, power_d, sigmas = {}, n = 2000, seed, fidelity = DEFAULT_FIDELITY_MODE, ...resto }) {
  // Rechazo TOTAL de claves desconocidas (caza adversarial V1.6): la guarda anterior
  // era enumerativa (solo iol_pose/postop) y tragaba en silencio `iol:` (una LIO
  // tórica) o `cylinder_d:` — el llamante creía simular algo que la función ignoraba.
  // Un parámetro que esta función no consume NO se acepta: se nombra y se rechaza.
  const desconocidas = Object.keys(resto);
  if (desconocidas.length > 0) {
    throw new TypeError(`monteCarloRefraction: parámetros no soportados: ${desconocidas.join(', ')}. `
      + 'Esta función perturba {preop, iol_position_mm, power_d} con sigmas declaradas; '
      + 'aceptar y callar un parámetro (pose, LIO tórica, cilindro) sería el patrón prohibido.');
  }
  if (!Number.isInteger(seed)) throw new TypeError('seed entera obligatoria (reproducibilidad)');
  // Con córnea de radios MEDIDOS la política usa los radios: perturbar K no cambiaría
  // nada y la dispersión reportada EXCLUIRÍA en silencio esa sigma — se rechaza.
  const radiosMedidos = typeof preop.cornea?.r_anterior_mm === 'number'
    && typeof preop.cornea?.r_posterior_mm === 'number' && typeof preop.cct_um === 'number';
  if (radiosMedidos && (sigmas.mean_k_d ?? 0) > 0) {
    throw new RangeError('monteCarloRefraction: sigma de K con córnea de radios MEDIDOS — '
      + 'la política corneal usa los radios y la perturbación de K no tendría efecto. '
      + 'Perturba radios (no soportado aún) o elimina esa sigma.');
  }
  assertFinite(power_d, 'power_d'); assertFinite(iol_position_mm, 'iol_position_mm');
  // Ojo base sin perturbar: fija los supuestos del modelo y aplica la puerta de
  // fidelidad UNA vez, ANTES de las extracciones (antes esta función tragaba los
  // supuestos del ojo — mismo defecto que se corrigió en el optimizador de trazado).
  const baseEye = buildParaxialEye(createPredictedPostopEye(createPreopEye({
    al_mm: preop.al_mm, k1_d: preop.k1_d, k1_axis_deg: preop.k1_axis_deg,
    k2_d: preop.k2_d, k2_axis_deg: preop.k2_axis_deg,
    acd_mm: preop.acd_mm, lt_mm: preop.lt_mm, cct_um: preop.cct_um,
    keratometric_index: preop.keratometric_index,
    cornea: preop.cornea,                   // córnea MEDIDA del llamador: no se descarta
    meta: { source: 'synthetic', note: 'base MC' },
  }), { iol_position_mm, position_source: 'montecarlo_base' }), { fidelity });
  const s = { iol_position_mm: 0, al_mm: 0, mean_k_d: 0, ...sigmas };
  const gauss = gaussianSampler(makeRng(seed));
  const refs = [];
  let rejected = 0;
  for (let i = 0; i < n; i++) {
    const dPos = gauss(0, s.iol_position_mm);
    const dAl = gauss(0, s.al_mm);
    const dK = gauss(0, s.mean_k_d);
    try {
      const pre = createPreopEye({
        al_mm: preop.al_mm + dAl,
        k1_d: preop.k1_d + dK, k1_axis_deg: preop.k1_axis_deg,
        k2_d: preop.k2_d + dK, k2_axis_deg: preop.k2_axis_deg,
        acd_mm: preop.acd_mm, lt_mm: preop.lt_mm, cct_um: preop.cct_um,
        keratometric_index: preop.keratometric_index,
        cornea: preop.cornea,               // córnea MEDIDA del llamador: no se descarta
        meta: { source: 'synthetic', note: 'draw MC' },
      });
      const post = createPredictedPostopEye(pre, {
        iol_position_mm: iol_position_mm + dPos, position_source: 'montecarlo_draw',
      });
      refs.push(buildParaxialEye(post, { fidelity }).refractionForThinPower(power_d));
    } catch { rejected++; }
  }
  if (refs.length < Math.max(10, n * 0.5)) {
    throw new RangeError(`Monte Carlo degenerado: ${refs.length}/${n} extracciones válidas`);
  }
  refs.sort((a, b) => a - b);
  const mean = refs.reduce((a, b) => a + b, 0) / refs.length;
  const sd = Math.sqrt(refs.reduce((a, b) => a + (b - mean) ** 2, 0) / refs.length);
  return {
    n_valid: refs.length, rejected,
    fidelity, supuestos_modelo: baseEye.assumptions,
    mean_d: mean, sd_d: sd,
    percentiles_d: {
      p5: percentile(refs, 0.05), p25: percentile(refs, 0.25), p50: percentile(refs, 0.50),
      p75: percentile(refs, 0.75), p95: percentile(refs, 0.95),
    },
    etiqueta: 'SIMULACION / NO GROUND TRUTH CLINICO — sigmas declaradas',
  };
}

/**
 * Probabilidad (bajo las mismas sigmas y semilla) de que la potencia B deje la
 * refracción más cerca de la diana que la potencia A. Sirve para cuantificar
 * regiones de empate entre escalones del catálogo.
 */
export function alternativeBetterProbability({ preop, iol_position_mm, powerA_d, powerB_d, target_d = 0, sigmas = {}, n = 2000, seed, fidelity = DEFAULT_FIDELITY_MODE }) {
  if (!Number.isInteger(seed)) throw new TypeError('seed entera obligatoria');
  const s = { iol_position_mm: 0, al_mm: 0, mean_k_d: 0, ...sigmas };
  const gauss = gaussianSampler(makeRng(seed));
  let better = 0, valid = 0, rejected = 0;
  for (let i = 0; i < n; i++) {
    const dPos = gauss(0, s.iol_position_mm);
    const dAl = gauss(0, s.al_mm);
    const dK = gauss(0, s.mean_k_d);
    try {
      const pre = createPreopEye({
        al_mm: preop.al_mm + dAl,
        k1_d: preop.k1_d + dK, k1_axis_deg: preop.k1_axis_deg,
        k2_d: preop.k2_d + dK, k2_axis_deg: preop.k2_axis_deg,
        acd_mm: preop.acd_mm, lt_mm: preop.lt_mm, cct_um: preop.cct_um,
        keratometric_index: preop.keratometric_index,
        cornea: preop.cornea,               // córnea MEDIDA del llamador: no se descarta
        meta: { source: 'synthetic', note: 'draw MC' },
      });
      const post = createPredictedPostopEye(pre, {
        iol_position_mm: iol_position_mm + dPos, position_source: 'montecarlo_draw',
      });
      const eye = buildParaxialEye(post, { fidelity });
      const errA = Math.abs(eye.refractionForThinPower(powerA_d) - target_d);
      const errB = Math.abs(eye.refractionForThinPower(powerB_d) - target_d);
      if (errB < errA) better++;
      valid++;
    } catch { rejected++; }
  }
  if (valid < Math.max(10, n * 0.5)) throw new RangeError('Monte Carlo degenerado');
  return { probability: better / valid, n_valid: valid, rejected, fidelity };
}
