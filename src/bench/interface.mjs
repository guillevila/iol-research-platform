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
    // rango PLAUSIBLE (el mismo que el modelo de ojo impone a su pupila medida): la
    // pupila del escenario no pasa por createPreopEye y se colaba fuera de rango
    if (!Number.isFinite(c.pupil_mm) || c.pupil_mm < 1 || c.pupil_mm > 10) {
      throw new TypeError(`benchCase.pupil_mm fuera de plausibilidad: ${c.pupil_mm} (esperado 1–10 mm)`);
    }
    // procedencia con CONTENIDO: 3 espacios en blanco satisfacían la comprobación
    if (typeof c.pupil_source !== 'string' || c.pupil_source.trim().length < 3) {
      throw new TypeError('benchCase.pupil_mm exige `pupil_source` (procedencia declarada: '
        + "'medida' / 'escenario declarado' / ...) — una pupila sin procedencia es un dato huérfano");
    }
  }
  return c;
}

/**
 * Ejecuta varios motores sobre el mismo caso; los fallos se reportan, no se ocultan.
 *
 * Los resultados se indexan por `engine.id`: dos motores con el MISMO id se
 * sobrescribirían y uno desaparecería del objeto sin aviso (hallazgo adversarial
 * V1.8 — el id de los motores no incluye toda su configuración). Los ids duplicados
 * se rechazan; distinguirlos es responsabilidad de quien los construye.
 */
export function compareEngines(engines, benchCase) {
  assertBenchCase(benchCase);
  const ids = engines.map(e => e.id);
  const repetidos = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (repetidos.length > 0) {
    throw new TypeError(`compareEngines: ids de motor DUPLICADOS (${[...new Set(repetidos)].join(', ')}). `
      + 'Los resultados se indexan por id y uno desaparecería en silencio: dos motores con '
      + 'configuraciones distintas deben tener ids distintos.');
  }
  const results = {};
  for (const e of engines) {
    try {
      results[e.id] = { ok: true, result: e.predict(benchCase) };
    } catch (err) {
      // `fallo` (no "error"): es una excepción de EJECUCIÓN de un motor, no una
      // comparación — la terminología de divergencia se reserva a las comparaciones
      results[e.id] = { ok: false, fallo: String(err.message ?? err) };
    }
  }
  return { case: benchCase, results };
}
