/**
 * iol_position.mjs — predictores modulares de posición postoperatoria de LIO (CAPA B).
 *
 * Interfaz común:  predictor.predict(preopEye, iol?) -> { iol_position_mm, source, inputs_used }
 *
 * Implementaciones actuales:
 *  - ConstantOffsetPredictor : posición = acd_mm + offset declarado (parámetro de
 *    SIMULACIÓN explícito; útil para análisis de sensibilidad, NO calibrado).
 *  - FractionOfALPredictor   : posición = fracción declarada de AL (ídem).
 *
 * DELIBERADAMENTE AUSENTES (registrado en docs/scientific/OPEN_QUESTIONS.md):
 *  - Modelos de literatura (Olsen C-constant, etc.): requieren cita verificable
 *    con coeficientes delante — prohibido escribirlos de memoria.
 *  - Predictor ML: requiere datos postoperatorios reales; entrenar contra
 *    sintético como verdad clínica está prohibido por diseño del proyecto.
 *
 * RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING.
 */
import { assertFinite, assertInRange } from '../core/units.mjs';

export class ConstantOffsetPredictor {
  /** @param offset_mm desplazamiento declarado desde la ACD preoperatoria. */
  constructor(offset_mm) {
    this.offset_mm = assertInRange(offset_mm, -1.0, 3.5, 'offset_mm');
    this.id = `constant_offset_${offset_mm}mm`;
  }
  predict(preop) {
    if (preop.acd_mm === null) throw new RangeError(`${this.id}: requiere acd_mm medido`);
    return {
      iol_position_mm: preop.acd_mm + this.offset_mm,
      source: `${this.id} (SIMULACION: offset declarado, no calibrado clinicamente)`,
      inputs_used: ['acd_mm'],
    };
  }
}

export class FractionOfALPredictor {
  constructor(fraction) {
    this.fraction = assertInRange(fraction, 0.1, 0.35, 'fraction');
    this.id = `fraction_of_al_${fraction}`;
  }
  predict(preop) {
    assertFinite(preop.al_mm, 'al_mm');
    return {
      iol_position_mm: preop.al_mm * this.fraction,
      source: `${this.id} (SIMULACION: fraccion declarada, no calibrada clinicamente)`,
      inputs_used: ['al_mm'],
    };
  }
}

/**
 * Punto de extensión para regresiones ajustadas sobre DATOS REALES futuros.
 * Falla en construcción si no se aportan coeficientes con procedencia.
 */
export class LinearRegressionPredictor {
  constructor({ intercept_mm, coef, provenance }) {
    if (!provenance || typeof provenance !== 'string' || provenance.length < 10) {
      throw new TypeError('LinearRegressionPredictor exige `provenance` documentada (dataset/fuente)');
    }
    assertFinite(intercept_mm, 'intercept_mm');
    if (!coef || typeof coef !== 'object') throw new TypeError('coef requerido: {campo: D_mm_por_unidad}');
    this.intercept_mm = intercept_mm;
    this.coef = coef;
    this.provenance = provenance;
    this.id = 'linear_regression';
  }
  predict(preop) {
    let pos = this.intercept_mm;
    const used = [];
    for (const [k, c] of Object.entries(this.coef)) {
      const v = preop[k];
      if (v === null || v === undefined) throw new RangeError(`${this.id}: falta ${k}`);
      pos += c * v; used.push(k);
    }
    return { iol_position_mm: pos, source: `${this.id} [${this.provenance}]`, inputs_used: used };
  }
}
