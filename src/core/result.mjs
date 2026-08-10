/**
 * result.mjs — contrato común de salida de todos los motores (CAPA E/F y §8).
 *
 * Todo motor del benchmark implementa `predict(case, iol) -> PredictionResult`.
 * El resultado nunca es solo un número: lleva incertidumbre, alternativas y avisos.
 * RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING.
 */
import { assertFinite } from './units.mjs';

export const RUO_WARNING = 'RESEARCH USE ONLY - NOT FOR CLINICAL DECISION MAKING';

/**
 * Campos:
 *  engine                — id del motor ('paraxial_v1', 'evo_replica_frozen_v1', ...)
 *  predicted_refraction  — EE previsto (D) para la lente recomendada
 *  predicted_sphere / predicted_cylinder / predicted_axis — descomposición
 *  recommended_power / recommended_toric / recommended_axis
 *  alternative           — segunda mejor opción {power, predicted_refraction, delta_d}
 *  intermediate_values   — objeto libre de trazabilidad (vergencias, focos, tablas)
 *  uncertainty           — { sensitivities: {param: d_ref_per_unit}, tie_region: bool,
 *                            notes } | null si el motor no la modela
 *  warnings              — SIEMPRE incluye RUO_WARNING
 */
export function createPredictionResult(f) {
  assertFinite(f.predicted_refraction, 'predicted_refraction');
  assertFinite(f.recommended_power, 'recommended_power');
  const warnings = [RUO_WARNING, ...(f.warnings ?? [])];
  return Object.freeze({
    engine: String(f.engine ?? 'unspecified'),
    predicted_refraction: f.predicted_refraction,
    predicted_sphere: f.predicted_sphere ?? f.predicted_refraction,
    predicted_cylinder: f.predicted_cylinder ?? 0,
    predicted_axis: f.predicted_axis ?? null,
    recommended_power: f.recommended_power,
    recommended_toric: f.recommended_toric ?? 0,
    recommended_axis: f.recommended_axis ?? null,
    alternative: f.alternative ?? null,
    intermediate_values: f.intermediate_values ?? {},
    uncertainty: f.uncertainty ?? null,
    warnings,
  });
}
