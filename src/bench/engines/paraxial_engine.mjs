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
import { recommendToric } from '../../toric/toric_engine.mjs';

export class ParaxialEngine {
  /**
   * @param positionPredictor implementa predict(preopEye) (src/predictors)
   * @param toricCatalog_d    cilindros disponibles en plano de LIO (dato de
   *                          fabricante, inyectado); si se omite, motor esférico.
   */
  constructor(positionPredictor, { grid = powerGrid(-5, 40, 0.5), toricCatalog_d = null } = {}) {
    if (!positionPredictor?.predict) throw new TypeError('ParaxialEngine requiere positionPredictor');
    this.predictor = positionPredictor;
    this.grid = grid;
    this.toricCatalog_d = toricCatalog_d;
    this.id = `paraxial_v1+${positionPredictor.id}${toricCatalog_d ? '+toric' : ''}`;
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
    // tórico opcional: solo si hay catálogo inyectado y el ojo tiene astigmatismo
    let toric = null;
    if (this.toricCatalog_d && Math.abs(preop.k2_d - preop.k1_d) > 1e-9) {
      toric = recommendToric({
        postop, sePower_d: s.best.power_d, catalog_d: this.toricCatalog_d,
        target_d: target, sia_d: c.sia_d ?? 0, sia_axis_deg: c.sia_axis_deg ?? 0,
      });
    }
    return createPredictionResult({
      engine: this.id,
      predicted_refraction: toric ? toric.recommended.predicted_se_d : s.best.predicted_refraction_d,
      predicted_cylinder: toric ? toric.recommended.residual_cyl_d : 0,
      predicted_axis: toric ? (toric.recommended.residual_steep_axis_deg + 90) % 180 : null,
      recommended_toric: toric ? toric.recommended.cylinder_d : 0,
      recommended_axis: toric ? toric.implantation_axis_deg : null,
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
