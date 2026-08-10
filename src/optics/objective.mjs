/**
 * objective.mjs — qué significa "la mejor potencia" cuando la pupila no es un punto
 * (V1.1, CAPA E; revisado antes de V1.2).
 *
 * EL PROBLEMA QUE ESTE MÓDULO HACE EXPLÍCITO
 * ------------------------------------------
 * En óptica paraxial todos los rayos cortan el eje en el MISMO punto, así que "el foco"
 * existe y "enfocar en la retina" no necesita definición. Con pupila real eso es falso:
 * la aberración esférica hace que cada zona de la pupila corte en un sitio distinto. No
 * hay un foco, hay una distribución. Elegir potencia exige entonces decir **qué se
 * optimiza**.
 *
 * DOS objetivos, no tres — y por qué (revisión pre-V1.2)
 * ------------------------------------------------------
 * La versión inicial ofrecía tres criterios: A (mínimo RMS en retina), B (mejor foco
 * sobre la retina) y C (desenfoque equivalente nulo). La revisión demostró que **B y C
 * no son criterios independientes**: son el mismo criterio en unidades distintas, y
 * mantenerlos como objetivos separados era una redundancia heredada de la especificación,
 * no una decisión óptica. B se eliminó como objetivo y su magnitud (desplazamiento del
 * mejor foco, en mm) quedó como métrica REPORTADA dentro de C.
 *
 * DEMOSTRACIÓN de la equivalencia B ≡ C como criterios de optimización
 * --------------------------------------------------------------------
 * Sea z*(P) el plano de mejor foco (mínimo RMS axial) del haz trazado con potencia P —
 * ambos criterios lo calculan con LA MISMA llamada a `bestFocus`. Sea z_ret la retina y
 * z_ref la referencia (cara posterior de la LIO). Definiendo, para z > z_ref,
 *
 *     φ(z) = n/L_ret − n/L(z),   con  L(z) = (z − z_ref)/1000  y  L_ret = L(z_ret),
 *
 * se tiene   coste_B(P) = |z*(P) − z_ret|   y   coste_C(P) = |φ(z*(P))|.
 *
 * φ es estrictamente creciente (dφ/dz = n·1000/(z−z_ref)² > 0) y φ(z_ret) = 0. Por tanto:
 *
 *   1. φ(z) = 0  ⇔  z = z_ret  ⇒  coste_B y coste_C se anulan EXACTAMENTE en el mismo P.
 *   2. sign(φ(z)) = sign(z − z_ret)  ⇒  a cada lado del óptimo ambos costes crecen
 *      monótonamente con |z* − z_ret|: para P1, P2 del mismo lado,
 *      coste_B(P1) < coste_B(P2) ⇔ coste_C(P1) < coste_C(P2).
 *   3. De (1)+(2): ambos costes son unimodales con EL MISMO argmin. Cualquier buscador
 *      de mínimo (sección áurea incluida) devuelve la misma potencia. ∎
 *
 * Donde NO son idénticos: la forma del coste lejos del óptimo. φ es convexa (la escala
 * dióptrica es asimétrica: 1 mm por delante de la retina son más dioptrías que 1 mm por
 * detrás), así que al elegir entre DOS escalones discretos de catálogo que caen a lados
 * OPUESTOS del óptimo, B (mm) y C (D) podrían desempatar distinto. La asimetría relativa
 * es ≈ 2·|Δz|/L_ret (~2 % para ±0.17 mm, el semiescalón de 0.5 D): solo afecta a empates
 * al filo de la navaja. C se conserva como objetivo porque su coste está en dioptrías —
 * la unidad comparable entre ojos y con los umbrales clínicos; el desplazamiento en mm
 * (la métrica de B) se reporta en `detail.desplazamiento_mm`.
 *
 * `tests/objective_equivalence.test.mjs` verifica ambas mitades: la equivalencia del
 * argmin (empírica, sobre barridos) y la estructura de signos/monotonía (la demostración).
 *
 * A sí es independiente: minimiza el RMS EN el plano retiniano, y con aberración su
 * óptimo NO coincide con llevar el mejor foco a la retina (exp008 lo cuantifica:
 * ~0.0004–0.04 D según pupila, con superficies esféricas). Un tercer criterio
 * genuinamente independiente (p. ej. métrica robusta integrada en profundidad de foco)
 * queda registrado como candidato en OPEN_QUESTIONS #8 para cuando la asfericidad y el
 * tilt rompan la simetría que hoy mantiene pequeñas estas diferencias.
 *
 * Con pupila → 0 TODOS los criterios convergen entre sí y al paraxial del mismo sistema:
 * sin aberración no hay diferencia posible. Hay tests que lo vigilan (V1.13).
 *
 * Convenio de signo del residuo: **positivo = la luz enfoca por DETRÁS de la retina**
 * (ojo hipermétrope), que es el signo de la refracción de gafa necesaria para corregirlo.
 *
 * RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING.
 */
import { assertFinite } from '../core/units.mjs';
import { N_VITREOUS } from './constants.mjs';
import { traceRay, spotRmsAt, bestFocus } from './raytrace/trace.mjs';

export const ObjectiveKind = Object.freeze({
  SPOT_RMS_AT_RETINA: 'SPOT_RMS_AT_RETINA',
  EQUIVALENT_DEFOCUS: 'EQUIVALENT_DEFOCUS',
});

/**
 * Traza un haz por el sistema y devuelve los rayos emergentes, contabilizando pérdidas.
 * Las pérdidas NO se ocultan: un objetivo evaluado con la mitad del haz perdido no es
 * comparable con otro evaluado entero.
 */
export function traceBundle(surfaces, bundle) {
  const out = [], lost = [];
  for (const r0 of bundle) {
    const tr = traceRay(surfaces, r0);
    if (tr.ok) out.push(tr.ray); else lost.push({ ray0: r0, reason: tr.reason, at: tr.at });
  }
  return { rays: out, lost };
}

/**
 * Desenfoque equivalente (D) de un plano de foco respecto a la retina.
 *
 *   ΔD = n_vítreo · (1/L_retina − 1/L_foco),  distancias desde la cara posterior de la
 *   LIO, en metros.
 *
 * Es la forma estándar de convertir un desplazamiento axial en dioptrías: la vergencia
 * que habría que añadir para llevar el foco de un plano al otro. Signo positivo cuando el
 * foco cae por detrás de la retina. Es la φ de la demostración de cabecera: estrictamente
 * creciente en z_foco y nula exactamente en la retina.
 */
export function equivalentDefocus_d(zFoco_mm, zRetina_mm, zReferencia_mm, n = N_VITREOUS) {
  assertFinite(zFoco_mm, 'zFoco_mm');
  assertFinite(zRetina_mm, 'zRetina_mm');
  assertFinite(zReferencia_mm, 'zReferencia_mm');
  const Lf = (zFoco_mm - zReferencia_mm) / 1000;
  const Lr = (zRetina_mm - zReferencia_mm) / 1000;
  if (!(Lf > 0) || !(Lr > 0)) {
    throw new RangeError('equivalentDefocus: foco o retina no están por detrás de la referencia');
  }
  return n / Lr - n / Lf;
}

/**
 * Evalúa un objetivo sobre un ojo trazado.
 *
 * @param eye      salida de `buildRaytraceEye` (superficies + retina_z_mm + iol_back_z_mm)
 * @param bundle   rayos de entrada (ver bundle.mjs / defaultBundle)
 * @param kind     ObjectiveKind
 * @returns {{
 *   kind: string, cost: number, residual_d: number|null,
 *   spotRms_mm: number, bestFocus_mm: number|null, raysTraced: number, raysLost: number,
 *   detail: object
 * }}
 *   `cost` es lo que el optimizador MINIMIZA (siempre ≥ 0).
 *   `residual_d` es la magnitud FIRMADA e interpretable en dioptrías (+ = hipermétrope);
 *   es null para el objetivo A, cuyo coste no es una dioptría.
 */
export function evaluateObjective(eye, bundle, kind = ObjectiveKind.EQUIVALENT_DEFOCUS) {
  if (!Object.values(ObjectiveKind).includes(kind)) {
    throw new TypeError(`objetivo desconocido: ${kind}. Válidos: ${Object.values(ObjectiveKind).join(', ')}`
      + (kind === 'BEST_FOCUS_ON_RETINA'
        ? '. BEST_FOCUS_ON_RETINA se eliminó como objetivo: es equivalente a '
          + 'EQUIVALENT_DEFOCUS para optimización (mismo argmin; ver demostración en la '
          + 'cabecera de objective.mjs). Su métrica se reporta en detail.desplazamiento_mm.'
        : ''));
  }
  const { rays, lost } = traceBundle(eye.surfaces, bundle);
  if (rays.length < 2) {
    throw new RangeError(`objetivo ${kind}: haz insuficiente (${rays.length} rayos, `
      + `${lost.length} perdidos: ${JSON.stringify(lost.slice(0, 3).map(l => l.reason))})`);
  }
  const zRet = eye.retina_z_mm;
  const rmsRetina = spotRmsAt(rays, zRet);
  const base = { raysTraced: rays.length, raysLost: lost.length, spotRms_mm: rmsRetina };

  if (kind === ObjectiveKind.SPOT_RMS_AT_RETINA) {
    // el coste ES el tamaño del spot en retina; no hay conversión a dioptrías porque un
    // RMS no es un desenfoque (dos desenfoques opuestos dan el mismo RMS)
    return {
      kind, cost: rmsRetina, residual_d: null, bestFocus_mm: null, ...base,
      detail: { criterio: 'radio RMS del spot en el plano retiniano (mm)' },
    };
  }

  // EQUIVALENT_DEFOCUS: localizar el plano de mejor foco y convertir a dioptrías
  const zUltima = Math.max(...eye.surfaces.map(s => s.kind === 'plane' ? s.z_mm : s.zVertex_mm));
  const foco = bestFocus(rays, zUltima + 0.05, zRet + 15);
  const dD = equivalentDefocus_d(foco.z_mm, zRet, eye.iol_back_z_mm);
  return {
    kind, cost: Math.abs(dD), residual_d: dD,
    bestFocus_mm: foco.z_mm, ...base,
    detail: {
      criterio: 'desenfoque equivalente del mejor foco respecto a la retina (D)',
      signo: '+ = enfoca por detrás de la retina (hipermétrope)',
      // métrica del antiguo objetivo B, ahora reportada: mismo cero, misma monotonía
      desplazamiento_mm: foco.z_mm - zRet,
      rms_en_mejor_foco_mm: foco.rms_mm,
    },
  };
}

/** Etiqueta legible de un objetivo, para incluir en resultados y avisos. */
export function describeObjective(kind) {
  switch (kind) {
    case ObjectiveKind.SPOT_RMS_AT_RETINA:
      return 'A · mínimo RMS del spot en retina (privilegia nitidez en el plano de la imagen)';
    case ObjectiveKind.EQUIVALENT_DEFOCUS:
      return 'C · desenfoque equivalente nulo (mejor foco sobre la retina, medido en dioptrías; '
        + 'el desplazamiento en mm se reporta como métrica)';
    default:
      throw new TypeError(`objetivo desconocido: ${kind}`);
  }
}
