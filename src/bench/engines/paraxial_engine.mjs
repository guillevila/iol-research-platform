/**
 * paraxial_engine.mjs — adaptador del motor físico paraxial al contrato de benchmark.
 *
 * La posición de LIO se obtiene del predictor inyectado (CAPA B): el motor óptico y
 * la predicción biológica quedan separados y comparables. Esférico puro por ahora
 * (el tórico independiente es Sprint 9). RESEARCH USE ONLY.
 */
import { createPreopEye, createPredictedPostopEye } from '../../core/eye.mjs';
import { createPredictionResult } from '../../core/result.mjs';
import { searchBestPower, powerGrid } from '../../optimize/power_search.mjs';

export class ParaxialEngine {
  /** @param positionPredictor implementa predict(preopEye) (src/predictors) */
  constructor(positionPredictor, { grid = powerGrid(-5, 40, 0.5) } = {}) {
    if (!positionPredictor?.predict) throw new TypeError('ParaxialEngine requiere positionPredictor');
    this.predictor = positionPredictor;
    this.grid = grid;
    this.id = `paraxial_v1+${positionPredictor.id}`;
  }

  predict(c) {
    const preop = createPreopEye({
      al_mm: c.al_mm, k1_d: c.k1_d, k1_axis_deg: c.k1_axis_deg ?? 0,
      k2_d: c.k2_d, k2_axis_deg: c.k2_axis_deg ?? 90,
      acd_mm: c.acd_mm ?? null, lt_mm: c.lt_mm ?? null, cct_um: c.cct_um ?? null,
      keratometric_index: c.k_index ?? 1.3375,
      meta: { source: c.meta?.source ?? 'synthetic' },
    });
    const pos = this.predictor.predict(preop);
    const postop = createPredictedPostopEye(preop, {
      iol_position_mm: pos.iol_position_mm, position_source: pos.source,
    });
    const target = c.target_d ?? 0;
    const s = searchBestPower({ postop, target_d: target, grid: this.grid });
    return createPredictionResult({
      engine: this.id,
      predicted_refraction: s.best.predicted_refraction_d,
      recommended_power: s.best.power_d,
      alternative: s.second && {
        power: s.second.power_d,
        predicted_refraction: s.second.predicted_refraction_d,
        delta_d: s.delta_between_top2_d,
      },
      intermediate_values: {
        exact_power_d: s.exact_power_d,
        cornea_kind: s.cornea_kind,
        iol_position_mm: postop.iol_position_mm,
        position_source: pos.source,
      },
      uncertainty: {
        sensitivities: { iol_position_mm: s.sensitivity_ref_per_mm_d },
        tie_region: s.tie,
        notes: 'sensibilidad = D de refracción por mm de posición de LIO (dif. central ±0.25 mm)',
      },
      warnings: ['Motor esférico paraxial; tórico pendiente (Sprint 9).'],
    });
  }
}
