/**
 * fidelity.mjs — modo de fidelidad del cálculo (introducido con V1.2).
 *
 * EL PROBLEMA QUE RESUELVE
 * ------------------------
 * En investigación es legítimo sustituir un parámetro desconocido por un supuesto
 * EXPLÍCITO (una lente genérica declarada, una córnea trazada como esfera con nota
 * registrada). En validación clínica no lo es: un resultado que se va a comparar contra
 * refracciones reales no puede llevar dentro NINGÚN supuesto, ni siquiera declarado —
 * porque entonces se estaría validando el supuesto, no el motor.
 *
 *   RESEARCH (defecto)  un UNKNOWN ópticamente relevante puede sustituirse por un
 *                       supuesto EXPLÍCITO, que queda registrado en la salida
 *                       (`assumptions` / `supuestos_trazado`). Se sustituye, pero
 *                       jamás en silencio.
 *   STRICT              cualquier supuesto registrado IMPIDE el cálculo con un error
 *                       que enumera exactamente qué faltó. Es el modo en el que deberá
 *                       ejecutarse la validación clínica futura (VALIDATION_STRATEGY,
 *                       nivel 3). NO es aún el defecto: decisión explícita del encargo.
 *
 * ARQUITECTURA — por qué la puerta es el registro de supuestos
 * ------------------------------------------------------------
 * Los puntos de sustitución YA registran sus supuestos (disciplina construida en
 * V0.5 y en la revisión pre-V1.2: política corneal, asfericidad, lente genérica). La
 * puerta STRICT no duplica esa lógica sitio a sitio, lo que crearía dos fuentes de
 * verdad: exige que el registro esté VACÍO. De ahí se sigue la garantía estructural:
 *
 *     ningún supuesto REGISTRADO puede atravesar STRICT.
 *
 * Y su límite honesto: que TODO supuesto esté registrado es una disciplina — vigilada
 * por los tests diferenciales de `tests/fidelity.test.mjs` (un caso completo se degrada
 * eje a eje y cada degradación debe bloquear) y por revisión adversarial — no un
 * teorema. Un supuesto no registrado seguiría pasando; cuando se descubra uno, la
 * corrección es registrarlo, nunca añadir un caso especial a la puerta.
 *
 * FUERA DEL ALCANCE de STRICT (frontera documentada, no silenciosa)
 * -----------------------------------------------------------------
 *  - Constantes universales del modelo (índices oculares convencionales, OQ #1): son
 *    del modelo, no del caso; bloquear por ellas impediría calcular siempre.
 *  - La elección explícita de método (p. ej. lente delgada paraxial): no sustituye
 *    ningún dato — la potencia ES el dato y no se finge geometría.
 *  - La predicción de posición de LIO: es el objeto del cálculo, no un dato faltante;
 *    su procedencia viaja etiquetada aparte (`position_source`, OQ #2).
 *  - La distancia de vértice convencional (12 mm): parámetro declarado del cálculo.
 *
 * RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING.
 */

export const FidelityMode = Object.freeze({
  RESEARCH: 'RESEARCH',
  STRICT: 'STRICT',
});

/** STRICT aún no es el defecto: decisión explícita del encargo, no un descuido. */
export const DEFAULT_FIDELITY_MODE = FidelityMode.RESEARCH;

/**
 * Error tipado del modo STRICT: transporta el contexto y la lista EXACTA de supuestos
 * que bloquearon, para que una capa de validación pueda clasificar los casos excluidos
 * por motivo en lugar de descartarlos como fallos opacos.
 */
export class StrictModeViolation extends Error {
  constructor(context, assumptions) {
    super(
      `STRICT · ${context}: el cálculo requiere ${assumptions.length} supuesto(s) que este modo prohíbe:\n`
      + assumptions.map(a => `  - ${a}`).join('\n')
      + '\nEn modo RESEARCH estos supuestos se registran en la salida y el cálculo continúa. '
      + 'En STRICT la alternativa no es aflojar la puerta: es conseguir el dato.');
    this.name = 'StrictModeViolation';
    this.context = context;
    this.assumptions = Object.freeze([...assumptions]);
  }
}

export function assertFidelityMode(mode) {
  if (!Object.values(FidelityMode).includes(mode)) {
    throw new TypeError(`modo de fidelidad desconocido: ${String(mode)}. `
      + `Válidos: ${Object.values(FidelityMode).join(', ')}`);
  }
  return mode;
}

/**
 * La puerta. En STRICT, un registro de supuestos no vacío detiene el cálculo; en
 * RESEARCH lo deja pasar (ya está registrado, que es lo que RESEARCH exige).
 * Devuelve el registro para poder encadenarla.
 */
export function enforceStrictness(mode, assumptions, context) {
  assertFidelityMode(mode);
  if (mode === FidelityMode.STRICT && assumptions.length > 0) {
    throw new StrictModeViolation(context, assumptions);
  }
  return assumptions;
}
