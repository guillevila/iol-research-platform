/**
 * constants.mjs — constantes ópticas del modelo físico.
 *
 * Cada constante documenta su naturaleza. Los índices oculares son los valores
 * CONVENCIONALES de los ojos esquemáticos clásicos, de uso universal en biometría;
 * la cita bibliográfica formal está pendiente y registrada en OPEN_QUESTIONS #1.
 * Ninguna constante de este archivo procede de ajustar EVO.
 *
 * RESEARCH USE ONLY.
 */

/** Índice del aire. Exacto por definición a efectos de este proyecto. */
export const N_AIR = 1.0;

/** Índice convencional del humor acuoso (ojo esquemático clásico). OPEN_QUESTIONS #1. */
export const N_AQUEOUS = 1.336;

/** Índice convencional del humor vítreo (ojo esquemático clásico). OPEN_QUESTIONS #1. */
export const N_VITREOUS = 1.336;

/** Índice convencional del estroma corneal (ojo esquemático clásico). OPEN_QUESTIONS #1. */
export const N_CORNEA = 1.376;

/**
 * Distancia de vértice por defecto gafa→córnea, en metros. Convención clínica
 * habitual (12 mm); es un PARÁMETRO configurable de cada cálculo, no una verdad.
 */
export const DEFAULT_VERTEX_M = 0.012;

/**
 * Convención queratométrica: los biómetros convierten radio→"potencia" con un índice
 * ficticio (1.3375, 1.3315 o 1.332 según marca). Es una CONVENCIÓN DE LECTURA del
 * dato de entrada, no un índice físico: el modelo físico trabaja con radios reales
 * cuando existen y solo usa esto para deshacer la conversión del dispositivo.
 *   radio_mm = (n_ker − 1) · 1000 / K_lectura
 */
export function corneaRadiusFromKeratometry(k_d, keratometricIndex = 1.3375) {
  if (!(k_d > 0)) throw new RangeError('K debe ser > 0');
  return (keratometricIndex - 1) * 1000 / k_d;
}
