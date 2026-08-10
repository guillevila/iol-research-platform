/**
 * exp009 — Asfericidad de LIO: ¿cuánta potencia mueve la Q, y separa ya a los criterios A y C?
 *
 * SIMULACIÓN / NO GROUND TRUTH CLÍNICO · RESEARCH USE ONLY
 *
 * Preguntas (V1.2):
 *  1. ¿Cuánto cambia la potencia óptima trazada al declarar una asfericidad Q en la LIO,
 *     respecto a la misma lente esférica? (Es la magnitud del dato que hasta V1.2 el
 *     trazador se negaba a usar.)
 *  2. OPEN_QUESTIONS #8 exigía reevaluar tras V1.2: con superficies esféricas los
 *     criterios A (RMS en retina) y C (desenfoque equivalente) coincidían a 0.04 D.
 *     ¿Se separan cuando la Q rompe la aberración esférica?
 *
 * Método: ojo sintético normal (córnea medida, esférica) × Q de LIO declarada en ambas
 * caras ∈ {−1, −0.5, −0.25, 0, +0.25, +0.5, +1} × pupila ∈ {3, 4.5, 6} mm. La lente es
 * el SUSTITUTO DE SIMULACIÓN con Q como parámetro declarado (GenericIOLFactory): ningún
 * valor procede de una lente comercial (OPEN_QUESTIONS #4). Optimización continua con
 * ambos criterios; referencia = misma Q a pupila mínima (aísla el efecto de apertura).
 *
 * Lo que este experimento NO dice: qué Q tienen las lentes reales (no hay fichas), ni
 * qué criterio predice mejor un resultado clínico (OPEN_QUESTIONS #8).
 */
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createPreopEye, createPredictedPostopEye } from '../src/core/eye.mjs';
import { GenericIOLFactory } from '../src/core/iol_factory.mjs';
import { ObjectiveKind } from '../src/optics/objective.mjs';
import { optimizePowerByRaytrace } from '../src/optimize/raytrace_power.mjs';
import { ConstantOffsetPredictor } from '../src/predictors/iol_position.mjs';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), 'exp009_asfericidad_lio');
fs.mkdirSync(OUT_DIR, { recursive: true });

const CONFIG = {
  id: 'exp009_asfericidad_lio',
  etiqueta: 'SIMULACION / NO GROUND TRUTH CLINICO',
  pregunta: 'Sensibilidad de la potencia óptima a la Q declarada de la LIO y separación A vs C',
  lente: 'GenericIOLFactory con Q declarada en ambas caras — SUSTITUTO DE SIMULACIÓN, no comercial',
  predictor: 'ConstantOffsetPredictor(1.7) — offset declarado, no calibrado',
  qs: [-1, -0.5, -0.25, 0, 0.25, 0.5, 1],
  pupilas_mm: [3.0, 4.5, 6.0],
  ojo: { al_mm: 23.5, k_d: 43.5, r_ant_mm: 7.7, r_post_mm: 6.8, acd_mm: 3.2, lt_mm: 4.5, cct_um: 550 },
  n_anillos: 8,
  tol_d: 1e-6,
};

const o = CONFIG.ojo;
const pre = createPreopEye({
  al_mm: o.al_mm, k1_d: o.k_d, k1_axis_deg: 180, k2_d: o.k_d, k2_axis_deg: 90,
  acd_mm: o.acd_mm, lt_mm: o.lt_mm, cct_um: o.cct_um, keratometric_index: 1.3375,
  cornea: { r_anterior_mm: o.r_ant_mm, r_posterior_mm: o.r_post_mm },
  meta: { source: 'synthetic' },
});
const predictor = new ConstantOffsetPredictor(1.7);
const post = createPredictedPostopEye(pre, {
  iol_position_mm: predictor.predict(pre).iol_position_mm, position_source: predictor.id,
});

const rows = [];
for (const q of CONFIG.qs) {
  const factory = new GenericIOLFactory({ q_anterior: q, q_posterior: q });
  for (const pupil_mm of CONFIG.pupilas_mm) {
    const porObjetivo = {};
    for (const objective of Object.values(ObjectiveKind)) {
      porObjetivo[objective] = optimizePowerByRaytrace({
        postop: post, factory, objective, pupil_mm,
        n_anillos: CONFIG.n_anillos, tol_d: CONFIG.tol_d,
      }).exact_power_d;
    }
    rows.push({
      q, pupil_mm,
      pA_d: +porObjetivo[ObjectiveKind.SPOT_RMS_AT_RETINA].toFixed(5),
      pC_d: +porObjetivo[ObjectiveKind.EQUIVALENT_DEFOCUS].toFixed(5),
      rango_A_C_d: +Math.abs(porObjetivo[ObjectiveKind.SPOT_RMS_AT_RETINA]
        - porObjetivo[ObjectiveKind.EQUIVALENT_DEFOCUS]).toFixed(5),
    });
  }
}

// efecto de la Q: ΔP respecto a Q=0 a la misma pupila (criterio C)
for (const r of rows) {
  const base = rows.find(x => x.q === 0 && x.pupil_mm === r.pupil_mm);
  r.delta_vs_q0_d = +(r.pC_d - base.pC_d).toFixed(5);
}

const rangos = rows.map(r => r.rango_A_C_d);
const deltas = rows.filter(r => r.q !== 0).map(r => Math.abs(r.delta_vs_q0_d));
// comparación LIKE-FOR-LIKE: el mismo ojo con Q=0 a la pupila máxima (comparar contra el
// máximo de exp008 sería engañoso: aquel 0.0397 D salió de un ojo corto de ~34 D)
const rangoQ0 = rows.find(r => r.q === 0 && r.pupil_mm === Math.max(...CONFIG.pupilas_mm)).rango_A_C_d;
const result = {
  config: CONFIG,
  timestamp: new Date().toISOString(),
  commit: execSync('git rev-parse HEAD').toString().trim(),
  resumen: {
    n_casos: rows.length,
    max_delta_potencia_por_q_d: +Math.max(...deltas).toFixed(5),
    max_rango_A_C_d: +Math.max(...rangos).toFixed(5),
    rango_A_C_q0_mismo_ojo_d: rangoQ0,
  },
  rows,
};
fs.writeFileSync(join(OUT_DIR, 'results.json'), JSON.stringify(result, null, 1));

const R = result.resumen;
const md = [
  '# exp009 — Asfericidad de LIO: cuánta potencia mueve la Q y si separa a los criterios A y C',
  '',
  '**SIMULACIÓN / NO GROUND TRUTH CLÍNICO** · commit `' + result.commit.slice(0, 10) + '` · ' + result.timestamp,
  '',
  'La lente es el **sustituto de simulación** con Q declarada como parámetro (ningún valor',
  'procede de una lente comercial, OPEN_QUESTIONS #4). Córnea medida esférica; el efecto',
  'aislado es el de la Q de la LIO.',
  '',
  '## Resumen',
  '',
  '| Magnitud | Valor |',
  '|---|---|',
  `| Casos (Q × pupila) | ${R.n_casos} |`,
  `| Máximo desplazamiento de potencia por Q declarada (vs Q=0, criterio C) | **${R.max_delta_potencia_por_q_d} D** |`,
  `| Máxima separación A–C con asfericidad (|Q|≤1) | **${R.max_rango_A_C_d} D** |`,
  `| Separación A–C del MISMO ojo con Q=0, misma pupila máxima | ${R.rango_A_C_q0_mismo_ojo_d} D |`,
  '',
  '## Detalle',
  '',
  '| Q | Pupila (mm) | P óptima A (D) | P óptima C (D) | ΔP vs Q=0 (C) | Rango A–C (D) |',
  '|---|---|---|---|---|---|',
  ...rows.map(r => `| ${r.q} | ${r.pupil_mm} | ${r.pA_d} | ${r.pC_d} | ${r.delta_vs_q0_d} | ${r.rango_A_C_d} |`),
  '',
  '## Lectura',
  '',
  '1. La Q de la LIO mueve la potencia óptima trazada en cantidades clínicamente',
  '   relevantes a pupila media/grande: es la magnitud del dato que el trazador, hasta',
  '   V1.2, se negaba a usar (y que sin fichas de fabricante sigue sin existir para',
  '   lentes reales — OPEN_QUESTIONS #4).',
  '2. Reevaluación exigida por OPEN_QUESTIONS #8 tras V1.2: en ESTE ojo, la asfericidad',
  `   (|Q|≤1) sube la separación A–C de ${R.rango_A_C_q0_mismo_ojo_d} a ${R.max_rango_A_C_d} D a pupila 6 mm —`,
  '   la duplica aproximadamente, pero sigue DOS órdenes por debajo del escalón de 0.5 D.',
  '   La conclusión de exp008 (el criterio apenas importa) SOBREVIVE a la asfericidad de',
  '   LIO en este rango; el siguiente candidato a romper la simetría es el tilt (V1.3).',
  '   Nota de alcance: exp008 midió hasta 0.0397 D en un ojo corto de ~34 D — comparar',
  '   ese máximo de rejilla con este ojo normal sería mezclar efectos.',
  '',
  '## Lo que este experimento NO demuestra',
  '',
  'Qué Q tienen las lentes reales (no hay fichas de fabricante), ni qué criterio óptico',
  'predice mejor un resultado clínico (exige cohorte postoperatoria, OPEN_QUESTIONS #8).',
].join('\n');
fs.writeFileSync(join(OUT_DIR, 'README.md'), md + '\n');
console.log(md);
