/**
 * power_search.mjs — optimizador de potencia (CAPA E, Sprint 5).
 *
 * objective(IOL) = |refracción prevista − diana|  sobre el catálogo/rejilla dado.
 * Devuelve además la segunda mejor opción, la diferencia óptica entre ambas,
 * la sensibilidad local a la posición de la LIO y si hay región de empate.
 *
 * RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING.
 */
import { assertFinite } from '../core/units.mjs';
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
export function searchBestPower({ postop, target_d = 0, grid = powerGrid(), tieThreshold_d = 0.05 }) {
  assertFinite(target_d, 'target_d');
  const eye = buildParaxialEye(postop);
  const evals = grid.map(p => {
    const ref = eye.refractionFor(p);
    return { power_d: p, predicted_refraction_d: ref, error_d: Math.abs(ref - target_d) };
  }).sort((a, b) => a.error_d - b.error_d);
  const best = evals[0], second = evals[1] ?? null;
  // sensibilidad local: D de refracción por mm de posición de LIO (diferencia central)
  const h = 0.25;
  const at = dPos => buildParaxialEye(createPredictedPostopEye(postop.preop, {
    iol_position_mm: postop.iol_position_mm + dPos, position_source: 'sensitivity_probe',
  })).refractionFor(best.power_d);
  const sens = (at(+h) - at(-h)) / (2 * h);
  return {
    best,
    second,
    delta_between_top2_d: second ? Math.abs(second.error_d - best.error_d) : null,
    tie: second ? Math.abs(second.error_d - best.error_d) < tieThreshold_d : false,
    sensitivity_ref_per_mm_d: sens,
    exact_power_d: eye.exactPowerFor(target_d),
    cornea_kind: eye.cornea_kind,
  };
}
