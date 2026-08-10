/**
 * exp001 — Sensibilidad de la refracción a la posición axial de la LIO.
 *
 * SIMULACIÓN / NO GROUND TRUTH CLÍNICO · RESEARCH USE ONLY
 *
 * Pregunta (§24.1-2): ¿cuánto error refractivo produce un error de posición de LIO,
 * y en qué ojos importa más?
 * Método: 6 ojos sintéticos de rejilla (cortos/normales/largos × córnea plana/curva),
 * posición base = ACD + offset declarado (predictor de simulación), potencia óptima
 * en rejilla de 0.5 D para diana 0; se desplaza SOLO la posición ±0.25/±0.50 mm y se
 * mide la refracción prevista con la misma potencia.
 */
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createPreopEye, createPredictedPostopEye } from '../src/core/eye.mjs';
import { buildParaxialEye } from '../src/optics/eyebuilder.mjs';
import { searchBestPower } from '../src/optimize/power_search.mjs';
import { ConstantOffsetPredictor } from '../src/predictors/iol_position.mjs';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), 'exp001_sensibilidad_elp');
fs.mkdirSync(OUT_DIR, { recursive: true });

const CONFIG = {
  id: 'exp001_sensibilidad_elp',
  etiqueta: 'SIMULACION / NO GROUND TRUTH CLINICO',
  predictor: 'ConstantOffsetPredictor(1.7) — offset declarado, no calibrado',
  deltas_mm: [-0.50, -0.25, 0, 0.25, 0.50],
  ojos: [
    { id: 'corto_K_plana', al_mm: 21.0, k_d: 41.0 },
    { id: 'corto_K_curva', al_mm: 21.0, k_d: 46.0 },
    { id: 'normal', al_mm: 23.5, k_d: 43.5 },
    { id: 'largo_K_plana', al_mm: 27.0, k_d: 41.0 },
    { id: 'largo_K_curva', al_mm: 27.0, k_d: 46.0 },
    { id: 'muy_largo', al_mm: 30.0, k_d: 43.5 },
  ],
  fijos: { acd_mm: 3.2, lt_mm: 4.5, cct_um: 550, target_d: 0 },
};

const predictor = new ConstantOffsetPredictor(1.7);
const rows = [];
for (const o of CONFIG.ojos) {
  const pre = createPreopEye({
    al_mm: o.al_mm, k1_d: o.k_d, k1_axis_deg: 180, k2_d: o.k_d, k2_axis_deg: 90,
    ...CONFIG.fijos, target_d: undefined, meta: { source: 'synthetic' },
  });
  const basePos = predictor.predict(pre).iol_position_mm;
  const postBase = createPredictedPostopEye(pre, { iol_position_mm: basePos, position_source: predictor.id });
  const s = searchBestPower({ postop: postBase, target_d: CONFIG.fijos.target_d });
  const P = s.best.power_d;
  const refAt = pos => buildParaxialEye(
    createPredictedPostopEye(pre, { iol_position_mm: pos, position_source: 'sweep' })
  ).refractionForThinPower(P);
  const ref0 = refAt(basePos);
  const deltas = {};
  for (const d of CONFIG.deltas_mm) deltas[d.toFixed(2)] = +(refAt(basePos + d) - ref0).toFixed(4);
  // pendiente local (D/mm) por diferencia central de ±0.25
  const slope = +(((refAt(basePos + 0.25) - refAt(basePos - 0.25)) / 0.5).toFixed(4));
  rows.push({ ...o, potencia_optima_d: P, posicion_base_mm: basePos, delta_ref_d: deltas, sensibilidad_d_por_mm: slope });
}

const result = {
  config: CONFIG,
  timestamp: new Date().toISOString(),
  commit: execSync('git rev-parse HEAD').toString().trim(),
  rows,
};
fs.writeFileSync(join(OUT_DIR, 'results.json'), JSON.stringify(result, null, 1));

const md = [
  '# exp001 — Sensibilidad a la posición de la LIO',
  '',
  '**SIMULACIÓN / NO GROUND TRUTH CLÍNICO** · commit `' + result.commit.slice(0, 10) + '` · ' + result.timestamp,
  '',
  'Δ refracción prevista (D) al desplazar SOLO la posición de la LIO, manteniendo la potencia óptima del ojo base:',
  '',
  '| Ojo | AL (mm) | K (D) | P óptima (D) | −0.50 mm | −0.25 mm | +0.25 mm | +0.50 mm | Sensibilidad (D/mm) |',
  '|---|---|---|---|---|---|---|---|---|',
  ...rows.map(r => `| ${r.id} | ${r.al_mm} | ${r.k_d} | ${r.potencia_optima_d} | ${r.delta_ref_d['-0.50']} | ${r.delta_ref_d['-0.25']} | ${r.delta_ref_d['0.25']} | ${r.delta_ref_d['0.50']} | ${r.sensibilidad_d_por_mm} |`),
  '',
  'Lectura: la sensibilidad crece con la potencia de LIO (ojos cortos). El umbral clínico de referencia es 0.25 D:',
  'la precisión de posición requerida para no superarlo es ≈ 0.25/|sensibilidad| mm por tipo de ojo.',
].join('\n');
fs.writeFileSync(join(OUT_DIR, 'README.md'), md + '\n');
console.log(md);
