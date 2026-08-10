/**
 * reserved.mjs — registro de campos ALMACENADOS pero aún NO CONSUMIDOS (V0.5 / P0.5).
 *
 * MOTIVO (auditoría V0, hallazgo H9): los modelos guardan parámetros que ninguna parte
 * de la física lee. Guardarlos no es un error — el esquema de datos se diseñó para
 * admitirlos desde el principio, y descartarlos obligaría a re-importar los datos
 * después. El error sería que un lector del código no pueda distinguir entre
 *
 *     "este dato influye en el resultado"      y      "este dato está ahí, esperando".
 *
 * Este registro elimina esa ambigüedad, y `tests/reserved.test.mjs` lo mantiene honesto
 * en las dos direcciones:
 *   - si alguien EMPIEZA a consumir un campo reservado, el test exige quitarlo de aquí;
 *   - si alguien AÑADE un campo al modelo sin consumirlo ni registrarlo, el test falla.
 *
 * `blocked_by` no es decorativo: es el motivo científico por el que el campo todavía no
 * se usa. Ninguno de ellos se desbloquea escribiendo código — todos esperan datos,
 * geometría real o una fuente citable.
 *
 * RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING.
 */

/** Campos del modelo `preoperative_eye` almacenados y no consumidos. */
export const RESERVED_PREOP = Object.freeze({
  wtw_mm: {
    que_es: 'blanco-blanco horizontal (mm)',
    consumidor_previsto: 'predictores de posición de LIO que usan diámetro corneal',
    blocked_by: 'OPEN_QUESTIONS #2 — sin publicación con coeficientes no se implementa',
  },
  ata_mm: {
    que_es: 'angle-to-angle (mm), medido por OCT de segmento anterior',
    consumidor_previsto: 'predictores de posición basados en dimensiones de cámara',
    blocked_by: 'OPEN_QUESTIONS #2',
  },
  sts_mm: {
    que_es: 'sulcus-to-sulcus (mm)',
    consumidor_previsto: 'dimensionado de lentes de sulcus / fáquicas',
    blocked_by: 'fuera del alcance actual (LIO en saco capsular)',
  },
  pupil_mm: {
    que_es: 'diámetro pupilar (mm)',
    consumidor_previsto: 'apertura del trazado de rayos por paciente, en vez de fija',
    blocked_by: 'V1 — el trazador aún usa apertura declarada, no la pupila del ojo',
  },
  lens_eq_plane_mm: {
    que_es: 'posición axial del plano ecuatorial del cristalino (mm)',
    consumidor_previsto: 'predictores de posición de tipo geométrico',
    blocked_by: 'OPEN_QUESTIONS #2 + #3 (convenciones de datum entre dispositivos)',
  },
  lens_eq_diameter_mm: {
    que_es: 'diámetro ecuatorial del cristalino (mm)',
    consumidor_previsto: 'modelo de contracción capsular',
    blocked_by: 'requiere datos postoperatorios de posición real',
  },
  lens_tilt_deg: {
    que_es: 'inclinación del cristalino respecto al eje óptico (grados)',
    consumidor_previsto: 'inicialización del tilt de la LIO en el trazado',
    blocked_by: 'V1.3 — el trazador aún no admite superficies inclinadas',
  },
  lens_decentration_mm: {
    que_es: 'descentración del cristalino (mm)',
    consumidor_previsto: 'inicialización de la descentración de la LIO',
    blocked_by: 'V1.3 — el trazador aún no admite superficies descentradas',
  },
});

/** Campos del modelo `predicted_postoperative_eye` almacenados y no consumidos. */
export const RESERVED_POSTOP = Object.freeze({
  iol_tilt_deg: {
    que_es: 'inclinación prevista de la LIO (grados)',
    consumidor_previsto: 'trazado con superficies inclinadas',
    blocked_by: 'V1.3 — el trazador aún no admite superficies inclinadas',
  },
  iol_decentration_mm: {
    que_es: 'descentración prevista de la LIO (mm)',
    consumidor_previsto: 'trazado con superficies descentradas',
    blocked_by: 'V1.3 — el trazador aún no admite superficies descentradas',
  },
  toric_rotation_deg: {
    que_es: 'rotación prevista de una LIO tórica respecto a su eje diana (grados)',
    consumidor_previsto: 'penalización de residual por rotación en el motor tórico',
    blocked_by: 'V1.7 — y la distribución real de rotaciones exige datos postoperatorios',
  },
  capsule_state: {
    que_es: 'estado capsular previsto (íntegro, rotura, etc.)',
    consumidor_previsto: 'selección de posición/plano de implante',
    blocked_by: 'fuera del alcance actual',
  },
});

/** Campos del modelo `iol` almacenados y no consumidos. */
export const RESERVED_IOL = Object.freeze({
  asphericity_q_anterior: {
    que_es: 'asfericidad (Q) de la cara anterior',
    consumidor_previsto: 'superficies cónicas en el trazador',
    blocked_by: 'V1.2 + OPEN_QUESTIONS #4 (no hay Q de fabricante para ninguna lente)',
  },
  asphericity_q_posterior: {
    que_es: 'asfericidad (Q) de la cara posterior',
    consumidor_previsto: 'superficies cónicas en el trazador',
    blocked_by: 'V1.2 (superficies cónicas) + OPEN_QUESTIONS #4 (no hay Q publicada)',
  },
  haptic_angulation_deg: {
    que_es: 'angulación de los hápticos (grados)',
    consumidor_previsto: 'modelo mecánico de posición final en el saco',
    blocked_by: 'requiere datos postoperatorios de posición real',
  },
  toric_design: {
    que_es: "cara donde reside el cilindro: 'anterior' | 'posterior' | 'bitoric'",
    consumidor_previsto: 'trazado tórico con la superficie correcta',
    blocked_by: 'V1.6 + OPEN_QUESTIONS #4',
  },
});

export const RESERVED_FIELDS = Object.freeze({
  preoperative_eye: RESERVED_PREOP,
  predicted_postoperative_eye: RESERVED_POSTOP,
  iol: RESERVED_IOL,
});

/** Lista plana de nombres reservados (para escaneos y avisos). */
export const RESERVED_NAMES = Object.freeze(
  Object.values(RESERVED_FIELDS).flatMap(g => Object.keys(g))
);

/**
 * ¿Este campo está almacenado pero sin efecto en el resultado? Útil para que las capas
 * de presentación no muestren un dato como si hubiera influido en el cálculo.
 */
export function isReserved(field) {
  return RESERVED_NAMES.includes(field);
}
