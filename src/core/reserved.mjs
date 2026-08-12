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
    que_es: 'diámetro pupilar MEDIDO del ojo (mm)',
    consumidor_previsto: 'apertura del trazado por paciente, tomada del ojo',
    // CORRECCIÓN (revisión adversarial V1.8): este campo salió del registro por error
    // y vuelve. Lo que V1.8 creó es OTRO campo — `benchCase.pupil_mm`, parámetro de
    // ESCENARIO declarado con procedencia — y ninguna ruta mapea `preop.pupil_mm` a la
    // apertura: la pupila del OJO sigue almacenada y sin consumir. Homónimos, no el
    // mismo dato. (Reincidencia: la misma afirmación se corrigió ya en V1.7.)
    blocked_by: 'V1 — el trazador usa la pupila del ESCENARIO (benchCase.pupil_mm), no la '
      + 'del ojo; falta decidir la ruta preop.pupil_mm → apertura y su procedencia',
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
    consumidor_previsto: 'inicialización de la POSE prevista de la LIO desde el cristalino',
    blocked_by: 'el trazador ya admite pose (V1.3); falta el MAPEO cristalino→pose de LIO, '
      + 'que es una hipótesis biológica: exige datos postoperatorios (OPEN_QUESTIONS #6) — '
      + 'y estos campos son escalares sin dirección: al consumirse deberán ganar eje',
  },
  lens_decentration_mm: {
    que_es: 'descentración del cristalino (mm)',
    consumidor_previsto: 'inicialización de la POSE prevista de la LIO desde el cristalino',
    blocked_by: 'ídem lens_tilt_deg: el mapeo cristalino→pose exige datos (OQ #6) y dirección',
  },
});

/**
 * Campos del modelo `predicted_postoperative_eye` almacenados y no consumidos.
 *
 * NOTA histórica: los escalares `iol_tilt_deg`/`iol_decentration_mm`/`toric_rotation_deg`
 * salieron de este registro al convertirse en guardas, y en V1.3 fueron ELIMINADOS del
 * modelo (error de migración explícito): la pose vive en `iol_pose` (vectorial,
 * src/core/pose.mjs) y el trazador la representa de verdad. La distribución REAL de
 * poses postoperatorias sigue exigiendo datos (OPEN_QUESTIONS #6).
 */
export const RESERVED_POSTOP = Object.freeze({
  capsule_state: {
    que_es: 'estado capsular previsto (íntegro, rotura, etc.)',
    consumidor_previsto: 'selección de posición/plano de implante',
    blocked_by: 'fuera del alcance actual',
  },
});

/**
 * Campos del modelo `iol` almacenados y no consumidos.
 *
 * NOTA: `asphericity_q_anterior/_posterior` SALIERON de este registro cuando el trazador
 * empezó a consumirlos para distinguir número documentado / ASSUMED_SPHERICAL / UNKNOWN
 * (una Q numérica se rechaza hasta que existan superficies cónicas; una UNKNOWN se traza
 * como esfera con el supuesto registrado). El dato de fabricante sigue bloqueado por
 * OPEN_QUESTIONS #4.
 */
export const RESERVED_IOL = Object.freeze({
  a_constant: {
    que_es: 'constante A de la lente (input de fórmulas de regresión clásicas)',
    // (V1.8, a petición del encargo y confirmado por el escáner endurecido): el motor
    // FÍSICO no la consume — su única lectura viva está en el adaptador del benchmark
    // congelado, que se la pasa a EVO. Queda identificada como INPUT ESPECÍFICO DE
    // EVO, no fingida como consumida: el RaytraceEngine la reporta como ignorada con
    // nombre y la geometría sale SIEMPRE de la IOLFactory inyectada.
    consumidor_previsto: 'ninguno en el motor físico: es entrada de EVO/regresiones',
    blocked_by: 'por diseño — una constante de regresión no entra en un trazado de rayos',
  },
  haptic_angulation_deg: {
    que_es: 'angulación de los hápticos (grados)',
    consumidor_previsto: 'modelo mecánico de posición final en el saco',
    blocked_by: 'requiere datos postoperatorios de posición real',
  },
  // toric_design SALIÓ del registro en V1.6: ya se CONSUME — createIOL valida su
  // vocabulario y lo deriva de los bloques tóricos (contradicción = rechazo), y
  // buildRaytraceEye registra un diseño declarado sin geometría documentada.
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
