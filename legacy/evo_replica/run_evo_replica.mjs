/**
 * run_evo_replica(case) — API congelada del motor benchmark (réplica de EVO Toric v2.0).
 *
 * RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING.
 *
 * Esta capa NO contiene lógica de cálculo: adapta el motor legacy congelado
 * (`legacy/evo_replica/engine.js`, hash registrado en baseline/HASHES.sha256)
 * al contrato común de benchmarking `predict(case) -> PredictionResult`.
 * El motor legacy no debe modificarse; cualquier evolución ocurre en `src/`.
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
// engine.cjs es copia byte-idéntica de engine.js (hash verificado por test): con
// package "type":"module" un .js se interpretaría como ESM y el motor es CommonJS.
const ENGINE = require(join(here, 'engine.cjs'));

export const ENGINE_ID = 'evo_replica_frozen_v1';

/**
 * Caso de entrada (unidades del dominio clínico habitual):
 *  { al_mm, k1_d, k1_axis_deg, k2_d, k2_axis_deg, acd_mm, lt_mm|null, cct_um|null,
 *    target_d, a_constant, iol_model, k_index, sia_d, sia_axis_deg }
 * `iol_model` debe ser uno de ENGINE.modelNames() (29 modelos EVO).
 */
export function run_evo_replica(c) {
  const r = ENGINE.calculate({
    al: c.al_mm, k1: c.k1_d, k1a: c.k1_axis_deg, k2: c.k2_d, k2a: c.k2_axis_deg,
    acd: c.acd_mm, lt: c.lt_mm ?? null, cct: c.cct_um ?? null,
    target: c.target_d ?? 0, aconst: c.a_constant,
    model: c.iol_model ?? 'Posterior', kindex: c.k_index ?? 1.3375,
    sia: c.sia_d ?? 0, siaax: c.sia_axis_deg ?? 0,
  });
  return {
    engine: ENGINE_ID,
    predicted_refraction: r.rec.ref,
    predicted_sphere: r.rec.ref - r.rec.resiCyl / 2,
    predicted_cylinder: r.rec.resiCyl,
    predicted_axis: r.rec.resiAxis,
    recommended_power: r.baseIOL,
    recommended_toric: r.rec.cyl,
    recommended_axis: r.rec.axis,
    intermediate_values: {
      sphere_table: r.sphere.map(s => ({ iol: s.iol, ref: s.ref })),
      toric_table: r.toric.map(t => ({ cyl: t.cyl, ref: t.ref, resiCyl: t.resiCyl, resiAxis: t.resiAxis })),
      tca_d: r.tcaMag, tca_axis_deg: r.tcaAxis,
      defocus_equivalent: r.rec.defocus,
    },
    uncertainty: null, // el motor legacy no modela incertidumbre
    warnings: [
      'RESEARCH USE ONLY - NOT FOR CLINICAL DECISION MAKING',
      'Motor benchmark congelado: réplica empírica de EVO Toric v2.0, no física independiente.',
    ],
  };
}

export function modelNames() { return ENGINE.modelNames(); }
export default run_evo_replica;
