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
 * H_EQ como ciudadano de CAPA B (V1.11): la LIO se asienta en el ecuador capsular,
 * aproximado geométricamente por ACD + LT/2. HIPÓTESIS DECLARADA, no hecho — su
 * validación exige cohorte con posición postoperatoria medida (nivel 3).
 *
 * SIN parámetros libres: cero offsets ajustables (un offset lo convertiría en
 * calibración encubierta). Determinista: la dispersión biológica ε_bio del ecuador
 * NO vive aquí — viaja por el canal `position_prediction_mm` de V1.12 (residual del
 * predictor con medidas idénticas, descomposición anti-doble-conteo).
 *
 * Datum coherente por construcción: acd_mm se mide de epitelio → cristalino anterior
 * (eye.mjs) y el datum axial del modelo es el ápex corneal anterior z=0 (units.mjs),
 * así que ACD + LT/2 ES directamente un iol_position_mm válido, sin corrección por
 * CCT. Un ACD medido desde ENDOTELIO por otro dispositivo NO es válido aquí sin
 * conversión explícita (OPEN_QUESTIONS #3).
 *
 * Este predictor CALCULA el ecuador; NO lee el campo reservado del ecuador MEDIDO
 * por OCT, que sigue bloqueado por convenciones de datum entre dispositivos
 * (registro de reservados, OQ #2 + #3). Un futuro predictor de ecuador medido es
 * OTRA clase, condicionada a resolver ese bloqueo con fuente citable.
 */
export class EquatorialPlanePredictor {
  constructor() {
    this.id = 'equatorial_plane_geometric';
  }
  predict(preop) {
    if (preop.acd_mm === null || preop.acd_mm === undefined) {
      throw new RangeError(`${this.id}: requiere acd_mm medido (H_EQ aproxima el ecuador con ACD + LT/2)`);
    }
    if (preop.lt_mm === null || preop.lt_mm === undefined) {
      throw new RangeError(`${this.id}: requiere lt_mm medido (H_EQ aproxima el ecuador con ACD + LT/2)`);
    }
    return {
      iol_position_mm: preop.acd_mm + preop.lt_mm / 2,
      source: `${this.id} (H_EQ DECLARADA: LIO en el ecuador capsular ≈ ACD + LT/2 — `
        + 'hipótesis, no hecho; SIMULACION, validación exige datos postoperatorios nivel 3)',
      inputs_used: ['acd_mm', 'lt_mm'],
      hypothesis: 'H_EQ',
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
