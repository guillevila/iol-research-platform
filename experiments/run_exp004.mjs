/**
 * exp004 — Intervalos de refracción bajo incertidumbre declarada (Monte Carlo).
 *
 * SIMULACIÓN / NO GROUND TRUTH CLÍNICO · RESEARCH USE ONLY
 *
 * Pregunta (§24.1-2 en versión probabilística): con una incertidumbre DECLARADA en
 * la posición de la LIO (y pequeñas en AL/K), ¿qué intervalo de refracción resulta
 * y con qué probabilidad el escalón vecino de potencia habría sido mejor?
 * Las sigmas son parámetros de simulación explícitos (OPEN_QUESTIONS #6): el
 * experimento caracteriza CONSECUENCIAS de niveles de incertidumbre, no mide biología.
 */
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createPreopEye, createPredictedPostopEye } from '../src/core/eye.mjs';
import { searchBestPower } from '../src/optimize/power_search.mjs';
import { ConstantOffsetPredictor } from '../src/predictors/iol_position.mjs';
import { monteCarloRefraction, alternativeBetterProbability } from '../src/uncertainty/montecarlo.mjs';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), 'exp004_montecarlo');
fs.mkdirSync(OUT_DIR, { recursive: true });

const CONFIG = {
  id: 'exp004_montecarlo',
  etiqueta: 'SIMULACION / NO GROUND TRUTH CLINICO — sigmas declaradas, no medidas',
  n: 4000, seed: 20260810,
  sigmas_fijas: { al_mm: 0.03, mean_k_d: 0.10 },
  escenarios_sigma_pos_mm: [0.2, 0.4],
  ojos: [
    { id: 'corto', al_mm: 21.0, k_d: 44.0 },
    { id: 'normal', al_mm: 23.5, k_d: 43.5 },
    { id: 'largo', al_mm: 27.0, k_d: 42.5 },
  ],
  fijos: { acd_mm: 3.2, lt_mm: 4.5, cct_um: 550 },
  predictor: 'ConstantOffsetPredictor(1.7)',
};

const predictor = new ConstantOffsetPredictor(1.7);
const rows = [];
for (const o of CONFIG.ojos) {
  const pre = createPreopEye({
    al_mm: o.al_mm, k1_d: o.k_d, k1_axis_deg: 180, k2_d: o.k_d, k2_axis_deg: 90,
    ...CONFIG.fijos, meta: { source: 'synthetic' },
  });
  const pos = predictor.predict(pre).iol_position_mm;
  const s = searchBestPower({
    postop: createPredictedPostopEye(pre, { iol_position_mm: pos, position_source: predictor.id }),
    target_d: 0,
  });
  for (const sigmaPos of CONFIG.escenarios_sigma_pos_mm) {
    const sigmas = { iol_position_mm: sigmaPos, ...CONFIG.sigmas_fijas };
    const mc = monteCarloRefraction({
      preop: pre, iol_position_mm: pos, power_d: s.best.power_d,
      sigmas, n: CONFIG.n, seed: CONFIG.seed,
    });
    const alt = alternativeBetterProbability({
      preop: pre, iol_position_mm: pos, target_d: 0,
      powerA_d: s.best.power_d, powerB_d: s.second.power_d,
      sigmas, n: CONFIG.n, seed: CONFIG.seed + 1,
    });
    rows.push({
      ojo: o.id, al_mm: o.al_mm, potencia_d: s.best.power_d, sigma_pos_mm: sigmaPos,
      p5_d: +mc.percentiles_d.p5.toFixed(3), p50_d: +mc.percentiles_d.p50.toFixed(3),
      p95_d: +mc.percentiles_d.p95.toFixed(3),
      ancho90_d: +(mc.percentiles_d.p95 - mc.percentiles_d.p5).toFixed(3),
      sd_d: +mc.sd_d.toFixed(3),
      prob_alternativa_mejor: +alt.probability.toFixed(3),
      alternativa_d: s.second.power_d,
      rechazadas: mc.rejected,
    });
  }
}

const result = {
  config: CONFIG,
  timestamp: new Date().toISOString(),
  commit: execSync('git rev-parse HEAD').toString().trim(),
  rows,
};
fs.writeFileSync(join(OUT_DIR, 'results.json'), JSON.stringify(result, null, 1));

const md = [
  '# exp004 — Intervalos de refracción bajo incertidumbre declarada',
  '',
  '**SIMULACIÓN / NO GROUND TRUTH CLÍNICO** · commit `' + result.commit.slice(0, 10) + '` · ' + result.timestamp,
  '',
  `σ(AL)=${CONFIG.sigmas_fijas.al_mm} mm, σ(K)=${CONFIG.sigmas_fijas.mean_k_d} D fijas; n=${CONFIG.n}, semilla ${CONFIG.seed}.`,
  '',
  '| Ojo | P (D) | σ posición (mm) | p5 (D) | p50 (D) | p95 (D) | Ancho 90% (D) | P(alternativa mejor) |',
  '|---|---|---|---|---|---|---|---|',
  ...rows.map(r => `| ${r.ojo} | ${r.potencia_d} | ${r.sigma_pos_mm} | ${r.p5_d} | ${r.p50_d} | ${r.p95_d} | ${r.ancho90_d} | ${(100 * r.prob_alternativa_mejor).toFixed(1)}% (${r.alternativa_d} D) |`),
  '',
  'Lectura: el ancho del intervalo escala con la sensibilidad de exp001 (corto ≫ largo).',
  'Una P(alternativa) próxima al 50% señala empate real entre escalones: la elección de',
  'potencia está dominada por la incertidumbre de posición, no por la óptica.',
].join('\n');
fs.writeFileSync(join(OUT_DIR, 'README.md'), md + '\n');
console.log(md);
