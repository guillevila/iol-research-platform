/**
 * exp002 — Primer mapa de divergencia: motor paraxial propio vs réplica EVO.
 *
 * SIMULACIÓN / NO GROUND TRUTH CLÍNICO · RESEARCH USE ONLY
 *
 * Pregunta (§24.5): ¿dónde diverge el modelo físico de EVO?
 * ADVERTENCIA DE LECTURA: el paraxial usa un predictor de posición NO calibrado
 * (offset declarado) y la lectura queratométrica como potencia corneal, así que la
 * divergencia ABSOLUTA es esperable y no informa de quién acierta. El valor del
 * experimento es la ESTRUCTURA del mapa (dónde crece y con qué variable).
 * Todo es offline: EVO sale del motor congelado, sin red.
 */
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { gridEyes } from '../src/synth/generator.mjs';
import { ParaxialEngine } from '../src/bench/engines/paraxial_engine.mjs';
import { EvoReplicaEngine } from '../src/bench/engines/evo_engine.mjs';
import { compareEngines } from '../src/bench/interface.mjs';
import { ConstantOffsetPredictor } from '../src/predictors/iol_position.mjs';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), 'exp002_divergencia_paraxial_vs_evo');
fs.mkdirSync(OUT_DIR, { recursive: true });

const CONFIG = {
  id: 'exp002_divergencia_paraxial_vs_evo',
  etiqueta: 'SIMULACION / NO GROUND TRUTH CLINICO',
  grid: { al_mm: [20, 30, 1], mean_k_d: [38, 48, 2] },
  fijos: { acd_mm: 3.2, lt_mm: 4.5, cct_um: 550, target_d: 0 },
  evo: { a_constant: 119.3, iol_model: 'Posterior' },
  paraxial: 'ParaxialEngine + ConstantOffsetPredictor(1.7) — no calibrado (declarado)',
};

const engines = [new ParaxialEngine(new ConstantOffsetPredictor(1.7)), new EvoReplicaEngine()];
const cases = gridEyes({ ...CONFIG.grid, fixed: CONFIG.fijos });
const cells = [];
for (const c of cases) {
  const out = compareEngines(engines, { ...c, ...CONFIG.evo });
  const par = out.results[engines[0].id], evo = out.results['evo_replica_frozen_v1'];
  cells.push({
    al_mm: c.al_mm, k_d: c.k1_d,
    paraxial_power_d: par.ok ? par.result.recommended_power : null,
    evo_power_d: evo.ok ? evo.result.recommended_power : null,
    divergencia_d: par.ok && evo.ok ? +(par.result.recommended_power - evo.result.recommended_power).toFixed(2) : null,
    evo_rechazo: evo.ok ? null : evo.error,
    paraxial_rechazo: par.ok ? null : par.error,
  });
}

const valid = cells.filter(c => c.divergencia_d !== null);
const divs = valid.map(c => c.divergencia_d);
const mean = divs.reduce((s, v) => s + v, 0) / divs.length;
const byAL = {};
for (const c of valid) (byAL[c.al_mm] ??= []).push(c.divergencia_d);

const result = {
  config: CONFIG,
  timestamp: new Date().toISOString(),
  commit: execSync('git rev-parse HEAD').toString().trim(),
  procedencia_commit: 'último commit AL GENERAR: el experimento puede incluir cambios aún '
    + 'sin committear (hallazgo adversarial V1.3: el commit estampado era sistemáticamente '
    + 'el PADRE del que publica). La reproducibilidad NO la garantiza este campo sino '
    + 'scripts/check_experiments.mjs, que re-ejecuta contra el árbol del commit que publica '
    + 'y en cada push de CI.',
  resumen: {
    celdas: cells.length, validas: valid.length,
    divergencia_media_d: +mean.toFixed(3),
    divergencia_min_d: Math.min(...divs), divergencia_max_d: Math.max(...divs),
  },
  cells,
};
fs.writeFileSync(join(OUT_DIR, 'results.json'), JSON.stringify(result, null, 1));

const ks = [...new Set(valid.map(c => c.k_d))].sort((a, b) => a - b);
const als = [...new Set(valid.map(c => c.al_mm))].sort((a, b) => a - b);
const md = [
  '# exp002 — Mapa de divergencia paraxial propio vs réplica EVO (potencia recomendada, D)',
  '',
  '**SIMULACIÓN / NO GROUND TRUTH CLÍNICO** · commit `' + result.commit.slice(0, 10) + '` · ' + result.timestamp,
  '',
  'Divergencia = potencia paraxial − potencia EVO. Predictor de posición NO calibrado:',
  'leer la ESTRUCTURA, no el valor absoluto. Celdas vacías = fuera del dominio de algún motor.',
  '',
  '| AL\\K | ' + ks.map(k => k + ' D').join(' | ') + ' |',
  '|---|' + ks.map(() => '---').join('|') + '|',
  ...als.map(al => '| ' + al + ' mm | ' + ks.map(k => {
    const c = valid.find(x => x.al_mm === al && x.k_d === k);
    return c ? c.divergencia_d.toFixed(1) : '—';
  }).join(' | ') + ' |'),
  '',
  `Resumen: ${valid.length}/${cells.length} celdas comparables · divergencia media ${result.resumen.divergencia_media_d} D · rango [${result.resumen.divergencia_min_d}, ${result.resumen.divergencia_max_d}] D.`,
  '',
  'Uso previsto: las regiones de mayor divergencia son candidatas prioritarias para la validación clínica futura (VALIDATION_STRATEGY.md).',
].join('\n');
fs.writeFileSync(join(OUT_DIR, 'README.md'), md + '\n');
console.log(md);
