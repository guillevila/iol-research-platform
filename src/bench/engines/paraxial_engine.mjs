/**
 * paraxial_engine.mjs — adaptador del motor físico paraxial al contrato de benchmark.
 *
 * La posición de LIO se obtiene del predictor inyectado (CAPA B): el motor óptico y
 * la predicción biológica quedan separados y comparables.
 *
 * Calcula tórico cuando se le inyecta un catálogo de cilindros Y el ojo tiene
 * astigmatismo; en otro caso devuelve solo el equivalente esférico. Los avisos de cada
 * predicción reflejan lo que REALMENTE se ha calculado en esa llamada, no un estado
 * general del proyecto. RESEARCH USE ONLY.
 */
import { createPreopEye, createPredictedPostopEye } from '../../core/eye.mjs';
import { createPredictionResult } from '../../core/result.mjs';
import { assertBenchCase } from '../interface.mjs';
import { searchBestPower, powerGrid } from '../../optimize/power_search.mjs';
import { recommendToric } from '../../toric/toric_engine.mjs';

export class ParaxialEngine {
  /**
   * @param positionPredictor implementa predict(preopEye) (src/predictors)
   * @param toricCatalog_d    cilindros disponibles en plano de LIO (dato de
   *                          fabricante, inyectado); si se omite, motor esférico.
   */
  /**
   * @param iolFactory (V1.8, opcional) si se inyecta, el motor evalúa la LENTE GRUESA
   *   que produce esa factory en lugar de una lente delgada. Es lo que permite una
   *   comparación CONTROLADA con el trazado: sin ella, la divergencia paraxial↔trazado
   *   está dominada por el modelo de LENTE (delgada vs gruesa), no por el modelo óptico.
   */
  constructor(positionPredictor, { grid = powerGrid(-5, 40, 0.5), toricCatalog_d = null, iolFactory = null } = {}) {
    if (!positionPredictor?.predict) throw new TypeError('ParaxialEngine requiere positionPredictor');
    if (iolFactory !== null && !iolFactory?.create) {
      throw new TypeError('ParaxialEngine: iolFactory debe implementar create({power_d})');
    }
    this.predictor = positionPredictor;
    this.grid = grid;
    this.toricCatalog_d = toricCatalog_d;
    this.iolFactory = iolFactory;
    this.id = `paraxial_v1+${positionPredictor.id}${toricCatalog_d ? '+toric' : ''}`
      + (iolFactory ? `+${iolFactory.id}` : '+thin');
  }

  // fidelity: ESTE motor corre en RESEARCH por diseño (compara estructura entre
  // motores, no valida contra datos reales); el RaytraceEngine (V1.8) sí recibe
  // fidelity por inyección explícita y STRICT atraviesa la capa de benchmark.
  predict(c) {
    assertBenchCase(c);   // la capa de benchmark valida IGUAL en los dos motores (V1.8)
    const preop = createPreopEye({
      al_mm: c.al_mm, k1_d: c.k1_d, k1_axis_deg: c.k1_axis_deg ?? 0,
      k2_d: c.k2_d, k2_axis_deg: c.k2_axis_deg ?? 90,
      acd_mm: c.acd_mm ?? null, lt_mm: c.lt_mm ?? null, cct_um: c.cct_um ?? null,
      // se propaga el índice del caso si lo trae; NO se inventa uno (P0.1/H1). El motor
      // corre bajo la política del dispositivo, que no lo necesita.
      keratometric_index: c.k_index ?? null,
      // córnea MEDIDA del caso: se propaga (antes se descartaba en silencio y hacía
      // imposible la comparación controlada con el trazado — hallazgo adversarial V1.8)
      ...(c.cornea ? { cornea: c.cornea } : {}),
      meta: { ...(c.meta ?? {}), source: c.meta?.source ?? 'synthetic' },
    });
    const pos = this.predictor.predict(preop);
    const postop = createPredictedPostopEye(preop, {
      iol_position_mm: pos.iol_position_mm, position_source: pos.source,
    });
    const target = c.target_d ?? 0;
    const s = searchBestPower({ postop, target_d: target, grid: this.grid, iolFactory: this.iolFactory });
    // tórico opcional: solo si hay catálogo inyectado y el ojo tiene astigmatismo
    let toric = null;
    if (this.toricCatalog_d && Math.abs(preop.k2_d - preop.k1_d) > 1e-9) {
      toric = recommendToric({
        postop, sePower_d: s.best.power_d, catalog_d: this.toricCatalog_d,
        target_d: target, sia_d: c.sia_d ?? 0, sia_axis_deg: c.sia_axis_deg ?? 0,
      });
    }
    // dimensión tórica (contrato V1.8): con catálogo y astigmatismo se CALCULA (motor
    // vectorial); sin astigmatismo, cilindro 0 es física del modelo; ASTIGMÁTICO sin
    // catálogo inyectado = dimensión UNSUPPORTED con campos null — jamás un 0 que
    // parezca resultado físico
    const astigmatico = Math.abs(preop.k2_d - preop.k1_d) > 1e-9;
    const toricUnsupported = astigmatico && !toric;
    return createPredictionResult({
      engine: this.id,
      predicted_refraction: toric ? toric.recommended.predicted_se_d : s.best.predicted_refraction_d,
      ...(toricUnsupported ? {
        unsupported_dimensions: ['toric'],
        predicted_cylinder: null, predicted_axis: null,
        recommended_toric: null, recommended_axis: null,
      } : {
        predicted_cylinder: toric ? toric.recommended.residual_cyl_d : 0,
        predicted_axis: toric ? (toric.recommended.residual_steep_axis_deg + 90) % 180 : null,
        recommended_toric: toric ? toric.recommended.cylinder_d : 0,
        recommended_axis: toric ? toric.implantation_axis_deg : null,
      }),
      recommended_power: s.best.power_d,
      alternative: s.second && {
        power: s.second.power_d,
        predicted_refraction: s.second.predicted_refraction_d,
        delta_d: s.delta_between_top2_d,
      },
      intermediate_values: {
        exact_power_d: s.exact_power_d,
        cornea_kind: s.cornea_kind,
        cornea_policy: s.cornea_policy,
        cornea_rotationally_symmetric: s.cornea_rotationally_symmetric,
        iol_position_mm: postop.iol_position_mm,
        position_source: pos.source,
        // los registros de supuestos VIAJAN al resultado del benchmark (caza
        // adversarial V1.6: se descartaban — el relleno tácito no debe volver por la
        // puerta de atrás de la capa que resume)
        supuestos_modelo: s.supuestos_modelo,
        // modelo de LENTE explícito: delgada (la potencia es el dato) o gruesa de una
        // factory inyectada — la comparación controlada con el trazado lo EXIGE igual
        lens_model: s.lens_model,
        iol_factory: s.iol_factory,
        grid_step_d: this.grid.length > 1 ? +(this.grid[1] - this.grid[0]).toFixed(6) : null,
        target_d: target,
        ...(toric ? { supuestos_toric: toric.supuestos_modelo } : {}),
      },
      uncertainty: {
        sensitivities: { iol_position_mm: s.sensitivity_ref_per_mm_d },
        tie_region: s.tie,
        notes: 'sensibilidad = D de refracción por mm de posición de LIO (dif. central ±0.25 mm)',
      },
      warnings: [
        toric
          ? 'Motor paraxial: equivalente esférico + recomendación tórica sobre el catálogo inyectado.'
          : (toricUnsupported
              ? 'Motor paraxial: caso ASTIGMÁTICO sin catálogo tórico inyectado — la dimensión '
                + 'tórica queda declarada UNSUPPORTED, no es un cero físico.'
              : 'Motor paraxial: solo equivalente esférico (ojo sin astigmatismo queratométrico).'),
        `Política corneal: ${s.cornea_policy}.`,
      ],
    });
  }
}
