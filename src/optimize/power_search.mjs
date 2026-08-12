/**
 * power_search.mjs — optimizador de potencia (CAPA E).
 *
 * objective(IOL) = |refracción prevista − diana|  sobre el catálogo/rejilla dado.
 * Devuelve además la segunda mejor opción, la diferencia óptica entre ambas,
 * la sensibilidad local a la posición de la LIO y si hay región de empate.
 *
 * RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING.
 */
import { assertFinite } from '../core/units.mjs';
import { DEFAULT_FIDELITY_MODE } from '../core/fidelity.mjs';
import { buildParaxialEye } from '../optics/eyebuilder.mjs';
import { createPredictedPostopEye } from '../core/eye.mjs';

/** Rejilla de potencias [min, max] con paso (por defecto la comercial de 0.5 D). */
export function powerGrid(min_d = 0, max_d = 35, step_d = 0.5) {
  const out = [];
  for (let p = min_d; p <= max_d + 1e-9; p += step_d) out.push(Math.round(p * 100) / 100);
  return out;
}

/**
 * Busca la potencia óptima para un ojo postoperatorio previsto.
 * `tieThreshold_d` define "empate": diferencia de error < umbral (por defecto 0.05 D,
 * la mitad del redondeo clínico habitual de 0.1 D en refracción subjetiva escrita).
 */
export function searchBestPower({ postop, target_d = 0, grid = powerGrid(), tieThreshold_d = 0.05, cornea = {}, fidelity = DEFAULT_FIDELITY_MODE, iolFactory = null }) {
  assertFinite(target_d, 'target_d');
  const eye = buildParaxialEye(postop, { cornea, fidelity });
  // MODELO DE LENTE (V1.8, hallazgo adversarial): sin factory se evalúa una lente
  // DELGADA (la potencia ES el dato, sin geometría); con `iolFactory` inyectada se
  // evalúa la lente GRUESA que esa factory produce para cada potencia — la MISMA
  // geometría que traza el ray tracer. Sin esto, comparar paraxial↔trazado mezcla dos
  // cosas distintas (modelo óptico y modelo de lente) y la diferencia de geometría
  // DOMINA: la comparación controlada de V1.8 exige la factory en ambos motores.
  const refDe = iolFactory
    ? p => eye.refractionForIOL(iolFactory.create({ power_d: p }))
    : p => eye.refractionForThinPower(p);
  const lens_model = iolFactory ? 'thick_lens_from_factory' : 'thin_lens';
  const evals = grid.map(p => {
    const ref = refDe(p);
    return { power_d: p, predicted_refraction_d: ref, error_d: Math.abs(ref - target_d) };
  }).sort((a, b) => a.error_d - b.error_d);
  const best = evals[0], second = evals[1] ?? null;
  // sensibilidad local: D de refracción por mm de posición de LIO (diferencia central)
  const h = 0.25;
  const at = dPos => {
    const e = buildParaxialEye(createPredictedPostopEye(postop.preop, {
      iol_position_mm: postop.iol_position_mm + dPos, position_source: 'sensitivity_probe',
    }), { cornea, fidelity });
    return iolFactory
      ? e.refractionForIOL(iolFactory.create({ power_d: best.power_d }))
      : e.refractionForThinPower(best.power_d);
  };
  const sens = (at(+h) - at(-h)) / (2 * h);
  return {
    best,
    second,
    delta_between_top2_d: second ? Math.abs(second.error_d - best.error_d) : null,
    tie: second ? Math.abs(second.error_d - best.error_d) < tieThreshold_d : false,
    sensitivity_ref_per_mm_d: sens,
    // continuo: forma cerrada con lente delgada; con lente gruesa NO hay forma cerrada
    // (la potencia entra en la geometría), así que se resuelve por bisección sobre la
    // MISMA función que evalúa la rejilla — misma clase de búsqueda que el trazador
    exact_power_d: iolFactory
      ? exactPowerForThickLens(refDe, target_d, grid)
      : eye.exactPowerFor(target_d),
    lens_model,
    iol_factory: iolFactory ? iolFactory.id : null,
    cornea_kind: eye.cornea_kind,
    cornea_policy: eye.cornea_policy,
    cornea_rotationally_symmetric: eye.cornea.rotationally_symmetric,
    fidelity,
    supuestos_modelo: eye.assumptions,
  };
}

/**
 * Potencia continua que lleva la refracción prevista a la diana con lente GRUESA.
 * Bisección sobre [min(grid), max(grid)]: la refracción es estrictamente decreciente
 * en la potencia, así que el cero es único. Un intervalo sin cambio de signo NO se
 * resuelve devolviendo un borde: se declara con el mismo criterio que el trazador.
 */
function exactPowerForThickLens(refDe, target_d, grid) {
  let lo = Math.min(...grid), hi = Math.max(...grid);
  const fLo = refDe(lo) - target_d, fHi = refDe(hi) - target_d;
  if (fLo === 0) return lo;
  if (fHi === 0) return hi;
  if (Math.sign(fLo) === Math.sign(fHi)) {
    throw new RangeError(`searchBestPower: la diana ${target_d} D no está contenida en el rango `
      + `de la rejilla [${lo}, ${hi}] D con lente gruesa (refracción ${refDe(lo).toFixed(3)} → `
      + `${refDe(hi).toFixed(3)}). No se devuelve un borde como potencia exacta.`);
  }
  for (let i = 0; i < 200 && hi - lo > 1e-9; i++) {
    const mid = (lo + hi) / 2;
    if (Math.sign(refDe(mid) - target_d) === Math.sign(fLo)) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}
