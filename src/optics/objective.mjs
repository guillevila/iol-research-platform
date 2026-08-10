/**
 * objective.mjs — qué significa "la mejor potencia" cuando la pupila no es un punto
 * (V1.1, CAPA E).
 *
 * EL PROBLEMA QUE ESTE MÓDULO HACE EXPLÍCITO
 * ------------------------------------------
 * En óptica paraxial todos los rayos cortan el eje en el MISMO punto, así que "el foco"
 * existe y "enfocar en la retina" no necesita definición. Con pupila real eso es falso:
 * la aberración esférica hace que cada zona de la pupila corte en un sitio distinto. No
 * hay un foco, hay una distribución. Elegir potencia exige entonces decir **qué se
 * optimiza**, y respuestas razonables distintas dan potencias distintas.
 *
 * Este módulo no resuelve esa elección: la saca a la superficie. Implementa tres
 * criterios defendibles y deja que quien calcula declare cuál usa. Ninguno se declara
 * preferible, porque decidirlo exige datos postoperatorios que el proyecto no tiene
 * (OPEN_QUESTIONS #7 y #2).
 *
 *   A · SPOT_RMS_AT_RETINA   minimiza el radio RMS del spot EN el plano retiniano.
 *                            Privilegia la nitidez donde de verdad está la imagen; una
 *                            lente que enfoca "detrás pero apretado" no le gusta.
 *   B · BEST_FOCUS_ON_RETINA lleva el plano de mejor foco A la retina. Ignora cuánto
 *                            vale ese mejor foco: solo le importa que caiga donde debe.
 *   C · EQUIVALENT_DEFOCUS   anula el desenfoque equivalente en dioptrías respecto a la
 *                            retina. Traduce el resultado a la magnitud que se usa en
 *                            clínica y hace comparables trazado y paraxial.
 *
 * Con pupila → 0 los tres CONVERGEN al mismo valor y al paraxial: sin aberración no hay
 * diferencia posible. Que no converjan sería un defecto, y hay un test que lo vigila.
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
  BEST_FOCUS_ON_RETINA: 'BEST_FOCUS_ON_RETINA',
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
 *   ΔD = n_vítreo · (1/L_foco − 1/L_retina),  distancias desde la cara posterior de la
 *   LIO, en metros.
 *
 * Es la forma estándar de convertir un desplazamiento axial en dioptrías: la vergencia
 * que habría que añadir para llevar el foco de un plano al otro. Signo positivo cuando el
 * foco cae por detrás de la retina.
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
 * @param bundle   rayos de entrada (ver RayBundleGenerator / parallelBundle)
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
    throw new TypeError(`objetivo desconocido: ${kind}. Válidos: ${Object.values(ObjectiveKind).join(', ')}`);
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

  // B y C necesitan localizar el plano de mejor foco
  const zUltima = Math.max(...eye.surfaces.map(s => s.kind === 'plane' ? s.z_mm : s.zVertex_mm));
  const foco = bestFocus(rays, zUltima + 0.05, zRet + 15);

  if (kind === ObjectiveKind.BEST_FOCUS_ON_RETINA) {
    return {
      kind, cost: Math.abs(foco.z_mm - zRet), residual_d: null,
      bestFocus_mm: foco.z_mm, ...base,
      detail: {
        criterio: 'distancia axial |mejor foco − retina| (mm)',
        desplazamiento_mm: foco.z_mm - zRet,
        rms_en_mejor_foco_mm: foco.rms_mm,
      },
    };
  }

  // C · desenfoque equivalente respecto a la retina
  const dD = equivalentDefocus_d(foco.z_mm, zRet, eye.iol_back_z_mm);
  return {
    kind, cost: Math.abs(dD), residual_d: dD,
    bestFocus_mm: foco.z_mm, ...base,
    detail: {
      criterio: 'desenfoque equivalente del mejor foco respecto a la retina (D)',
      signo: '+ = enfoca por detrás de la retina (hipermétrope)',
      rms_en_mejor_foco_mm: foco.rms_mm,
    },
  };
}

/** Etiqueta legible de un objetivo, para incluir en resultados y avisos. */
export function describeObjective(kind) {
  switch (kind) {
    case ObjectiveKind.SPOT_RMS_AT_RETINA:
      return 'A · mínimo RMS del spot en retina (privilegia nitidez en el plano de la imagen)';
    case ObjectiveKind.BEST_FOCUS_ON_RETINA:
      return 'B · mejor foco sobre la retina (privilegia coincidencia foco↔retina)';
    case ObjectiveKind.EQUIVALENT_DEFOCUS:
      return 'C · desenfoque equivalente nulo (comparable con el paraxial y con la clínica)';
    default:
      throw new TypeError(`objetivo desconocido: ${kind}`);
  }
}
