/**
 * interface.mjs — contrato común del framework de benchmarking (CAPA G — comparación entre motores).
 *
 * Todo motor comparable implementa:
 *    engine.id                        — identificador estable
 *    engine.predict(benchCase) -> PredictionResult   (src/core/result.mjs)
 *
 * `benchCase` (unidades clínicas, sin PII):
 *    { al_mm, k1_d, k1_axis_deg, k2_d, k2_axis_deg, acd_mm, lt_mm?, cct_um?,
 *      target_d, a_constant?, iol_model?, k_index?, sia_d?, sia_axis_deg?,
 *      pupil_mm?, pupil_source?, cornea?,
 *      meta: { source: 'measured'|'synthetic', ... } }
 *
 * pupil_mm (V1.8): pupila DE PRIMER NIVEL del escenario, con PROCEDENCIA obligatoria
 * (`pupil_source`: 'medida', 'escenario declarado', ...). V1.9 barre pupila por caso:
 * esos mapas no pueden depender en silencio del 3.0 mm por defecto de RESEARCH.
 * cornea (V1.8): radios/CCT/Q medidos opcionales (mismo formato que createPreopEye) —
 * la vía por la que un caso puede llegar a pasar STRICT en el trazado.
 *
 * El framework NO decide cuál motor "acierta": produce comparaciones y mapas de
 * divergencia. RESEARCH USE ONLY.
 */
export function assertBenchCase(c) {
  for (const k of ['al_mm', 'k1_d', 'k2_d']) {
    if (!Number.isFinite(c?.[k])) throw new TypeError('benchCase: falta ' + k);
  }
  if (c.meta?.source !== 'measured' && c.meta?.source !== 'synthetic') {
    throw new TypeError("benchCase.meta.source obligatorio: 'measured'|'synthetic'");
  }
  if (c.pupil_mm !== undefined && c.pupil_mm !== null) {
    if (!Number.isFinite(c.pupil_mm) || !(c.pupil_mm > 0)) {
      throw new TypeError('benchCase.pupil_mm debe ser un número > 0');
    }
    if (typeof c.pupil_source !== 'string' || c.pupil_source.length < 3) {
      throw new TypeError('benchCase.pupil_mm exige `pupil_source` (procedencia declarada: '
        + "'medida' / 'escenario declarado' / ...) — una pupila sin procedencia es un dato huérfano");
    }
  }
  return c;
}

/** Ejecuta varios motores sobre el mismo caso; los fallos se reportan, no se ocultan. */
export function compareEngines(engines, benchCase) {
  assertBenchCase(benchCase);
  const results = {};
  for (const e of engines) {
    try {
      results[e.id] = { ok: true, result: e.predict(benchCase) };
    } catch (err) {
      results[e.id] = { ok: false, error: String(err.message ?? err) };
    }
  }
  return { case: benchCase, results };
}
