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
 *      meta: { source: 'measured'|'synthetic', ... } }
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
