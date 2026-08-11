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
 *  unsupported_dimensions— (V1.8) dimensiones que este motor NO calculó en esta
 *                          llamada (p. ej. 'toric'): un caso astigmático cuyo motor no
 *                          optimiza cilindro+eje NO devuelve 0 "físico" — declara la
 *                          dimensión y sus campos van a NULL. Distingue "no calculado"
 *                          de "calculado y vale cero". Compatible: por defecto [].
 *  warnings              — SIEMPRE incluye RUO_WARNING
 */
export function createPredictionResult(f) {
  assertFinite(f.predicted_refraction, 'predicted_refraction');
  assertFinite(f.recommended_power, 'recommended_power');
  const warnings = [RUO_WARNING, ...(f.warnings ?? [])];
  const unsupported = Object.freeze([...(f.unsupported_dimensions ?? [])]);
  // COHERENCIA de la dimensión tórica (V1.8): declarada UNSUPPORTED ⇒ sus campos son
  // null (nada de ceros que parezcan física); un null sin declaración es ambigüedad
  // prohibida. `undefined` conserva el defecto histórico 0 (compatibilidad).
  const toricFields = {
    predicted_cylinder: f.predicted_cylinder === undefined ? 0 : f.predicted_cylinder,
    predicted_axis: f.predicted_axis ?? null,
    recommended_toric: f.recommended_toric === undefined ? 0 : f.recommended_toric,
    recommended_axis: f.recommended_axis ?? null,
  };
  if (unsupported.includes('toric')) {
    for (const [k, v] of Object.entries(toricFields)) {
      if (v !== null) {
        throw new TypeError(`PredictionResult: la dimensión 'toric' se declara UNSUPPORTED pero `
          + `${k}=${v} — una dimensión no calculada no lleva valores que parezcan físicos`);
      }
    }
  } else if (toricFields.predicted_cylinder === null || toricFields.recommended_toric === null) {
    throw new TypeError('PredictionResult: predicted_cylinder/recommended_toric null SIN declarar '
      + "la dimensión 'toric' en unsupported_dimensions — null sin declaración es ambigüedad");
  }
  return Object.freeze({
    engine: String(f.engine ?? 'unspecified'),
    predicted_refraction: f.predicted_refraction,
    predicted_sphere: f.predicted_sphere ?? f.predicted_refraction,
    predicted_cylinder: toricFields.predicted_cylinder,
    predicted_axis: toricFields.predicted_axis,
    recommended_power: f.recommended_power,
    recommended_toric: toricFields.recommended_toric,
    recommended_axis: toricFields.recommended_axis,
    alternative: f.alternative ?? null,
    intermediate_values: f.intermediate_values ?? {},
    uncertainty: f.uncertainty ?? null,
    unsupported_dimensions: unsupported,
    warnings,
  });
}
