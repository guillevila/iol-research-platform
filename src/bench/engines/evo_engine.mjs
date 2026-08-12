/**
 * evo_engine.mjs — adaptador del benchmark congelado al contrato común.
 * Único punto donde el nuevo proyecto toca el legacy, y solo vía su API pública.
 * RESEARCH USE ONLY.
 */
import { createRequire } from 'node:module';
import { run_evo_replica, modelNames } from '../../../legacy/evo_replica/run_evo_replica.mjs';
import { createPredictionResult } from '../../core/result.mjs';

export class EvoReplicaEngine {
  constructor() { this.id = 'evo_replica_frozen_v1'; }
  predict(c) {
    // El legado (CONGELADO, no se toca) acepta un `iol_model` inexistente y cae a un
    // comportamiento por defecto no declarado: publicar una divergencia calculada
    // sobre un modelo que no existe sería un número plausible y falso. La validación
    // vive AQUÍ, en el adaptador (revisión adversarial V1.8).
    if (c.iol_model !== undefined && c.iol_model !== null) {
      const validos = modelNames();
      if (!validos.includes(c.iol_model)) {
        throw new TypeError(`EvoReplicaEngine: iol_model '${c.iol_model}' no existe en el benchmark `
          + `congelado (${validos.length} modelos). El legado caería a un comportamiento por `
          + 'defecto no declarado y la divergencia publicada sería falsa.');
      }
    }
    const r = run_evo_replica({
      al_mm: c.al_mm, k1_d: c.k1_d, k1_axis_deg: c.k1_axis_deg ?? 180,
      k2_d: c.k2_d, k2_axis_deg: c.k2_axis_deg ?? 90,
      acd_mm: c.acd_mm, lt_mm: c.lt_mm ?? null, cct_um: c.cct_um ?? null,
      target_d: c.target_d ?? 0, a_constant: c.a_constant ?? 119.3,
      iol_model: c.iol_model ?? 'Posterior', k_index: c.k_index ?? 1.3375,
      sia_d: c.sia_d ?? 0, sia_axis_deg: c.sia_axis_deg ?? 0,
    });
    return createPredictionResult({
      engine: this.id,
      predicted_refraction: r.predicted_refraction,
      predicted_sphere: r.predicted_sphere,
      predicted_cylinder: r.predicted_cylinder,
      predicted_axis: r.predicted_axis,
      recommended_power: r.recommended_power,
      recommended_toric: r.recommended_toric,
      recommended_axis: r.recommended_axis,
      intermediate_values: r.intermediate_values,
      uncertainty: null,
      warnings: r.warnings,
    });
  }
}
