/**
 * counters.mjs — contadores DETERMINISTAS de trabajo computacional (V1.14).
 *
 * POR QUÉ EXISTEN. El wall-clock depende de la máquina, del runner de CI y del JIT: no
 * sirve como invariante. El número de rayos trazados, de intersecciones evaluadas o de
 * llamadas a bestFocus, en cambio, es una propiedad DETERMINISTA del workload: si cambia,
 * ha cambiado el trabajo que hace el motor, y eso sí se puede fijar en un test.
 *
 * CONTRATO DE COSTE CERO CUANDO ESTÁN APAGADOS. Los contadores viven detrás de un flag
 * que arranca DESACTIVADO. Con el flag apagado, `bump()` hace una sola comparación booleana
 * y retorna. Ninguna ruta científica cambia de comportamiento por esto — y jamás pueden
 * cambiarlo: los contadores no se leen desde ninguna decisión del motor.
 *
 * SEPARACIÓN QUE ESTE MÓDULO HACE CUMPLIR:
 *   - COSTE COMPUTACIONAL  → lo que se cuenta aquí (rayos, intersecciones, focos…).
 *   - PARÁMETRO CIENTÍFICO → n_anillos, tolerancias, pupila, rejillas… NO viven aquí y
 *     V1.14 no los toca. Reducir uno de ellos no es optimizar: es cambiar el experimento.
 *
 * RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING.
 */

/** Unidades de trabajo que el perfilado de V1.14 demostró relevantes. */
export const WorkUnit = Object.freeze({
  RAY_TRACED: 'rayos_trazados',            // rayos que entran en traceRay
  SURFACE_INTERSECT: 'intersecciones',     // llamadas a intersect (incluye recursión de transformed)
  SPOT_RMS: 'spot_rms',                    // evaluaciones del RMS del spot en un plano
  BEST_FOCUS: 'best_focus',                // búsquedas de mejor foco (cada una hace N spot_rms)
  OBJECTIVE_EVAL: 'evaluaciones_objetivo', // llamadas a evaluateObjective
  IOL_BUILT: 'geometrias_lio',             // geometrías de LIO construidas por una factory
  EYE_BUILT: 'ojos_trazables',             // ojos de trazado construidos
  BUNDLE_BUILT: 'haces_generados',         // haces de rayos generados
  PARAXIAL_EYE_BUILT: 'ojos_paraxiales',   // ojos paraxiales construidos
});

const cuenta = Object.create(null);
let activo = false;

/** Activa la contabilidad y pone todo a cero. Devuelve la función que la desactiva. */
export function startCounting() {
  for (const k of Object.keys(cuenta)) delete cuenta[k];
  activo = true;
  return stopCounting;
}

export function stopCounting() { activo = false; }

/** Instantánea ordenada de los contadores (claves ausentes = cero trabajo de ese tipo). */
export function snapshot() {
  const claves = Object.keys(cuenta).sort();
  const out = {};
  for (const k of claves) out[k] = cuenta[k];
  return out;
}

/**
 * Suma trabajo. Con la contabilidad apagada es una comparación booleana y nada más:
 * el coste en la ruta caliente es despreciable y NO altera ningún resultado.
 */
export function bump(unit, n = 1) {
  if (!activo) return;
  cuenta[unit] = (cuenta[unit] ?? 0) + n;
}

/** Ejecuta `fn` contando y devuelve { valor, trabajo }. No anida: úsalo en el nivel alto. */
export function measureWork(fn) {
  startCounting();
  try {
    const valor = fn();
    return { valor, trabajo: snapshot() };
  } finally {
    stopCounting();
  }
}
