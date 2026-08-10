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
 *                       (`assumptions` / `supuestos_trazado` /
 *                       `supuestos_modelo`). Se sustituye, pero jamás en silencio.
 *   STRICT              cualquier supuesto registrado IMPIDE el cálculo con un error
 *                       que enumera exactamente qué faltó. Es el modo en el que deberá
 *                       ejecutarse la validación clínica futura (VALIDATION_STRATEGY,
 *                       nivel 3). NO es aún el defecto: decisión explícita del encargo.
 *
 * QUÉ SIGNIFICA STRICT — y qué NO significa
 * ------------------------------------------
 * STRICT = "sin sustituciones/imputaciones registradas DEL CASO". Tres conceptos que
 * este módulo mantiene separados y que no deben confundirse:
 *
 *   PROCEDENCIA DEL DATO    de dónde sale cada dato del caso (medido, convención
 *                           declarada del dispositivo, ficha de fabricante). Viaja en
 *                           `provenance`, `geometry_status`, `keratometric_index`,
 *                           `meta.source`. STRICT no la mejora: la exige completa.
 *   PREDICCIÓN DEL MODELO   lo que el cálculo PRODUCE (posición prevista, refracción
 *                           prevista). No es un dato faltante y STRICT nunca la
 *                           bloquea; su procedencia viaja aparte (`position_source`).
 *   SUPUESTO / IMPUTACIÓN   rellenar un parámetro DEL CASO desconocido (o ignorar uno
 *                           medido) con un valor asumido. Esto es lo ÚNICO que STRICT
 *                           prohíbe, y a través de su registro.
 *
 * En consecuencia, STRICT NO significa "sin supuestos de modelo" — los índices oculares
 * convencionales, la elección de método o el vértice declarado siguen ahí, documentados
 * como frontera — ni "máxima fidelidad física": un cálculo paraxial de lente delgada
 * puede pasar STRICT siendo físicamente más reducido que un trazado RESEARCH con
 * asfericidad asumida. STRICT responde a una sola pregunta: ¿este resultado depende de
 * algún dato del caso que no tenemos (o que tenemos y no honramos) y se ha imputado?
 * Si sí, no se entrega.
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
 *  - El estado postoperatorio PREVISTO (posición; y mientras el modelo no represente
 *    tilt/descentración/rotación, ese estado es "centrado y sin rotación"): es el
 *    objeto de la predicción, no un dato faltante. Un valor DECLARADO ≠ 0 en esos
 *    campos se RECHAZA (no se ignora): mismo patrón que la asfericidad Q documentada.
 *  - Las primitivas de bajo nivel (paraxial.mjs, raytrace/) NO llevan puerta: operan
 *    sobre números sin procedencia y son capa legítima de física pura. La fidelidad
 *    gobierna la capa de CONSTRUCCIÓN (builders, optimizadores, motor tórico, MC):
 *    toda vía de producto debe pasar por ella, y un consumidor nuevo que llame a las
 *    primitivas directamente debe integrarse en la puerta (como se hizo con
 *    recommendToric al descubrirse el bypass).
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
