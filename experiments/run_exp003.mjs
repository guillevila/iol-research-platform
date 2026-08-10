/**
 * exp003 — ¿Cuánto cambia el resultado al pasar de óptica paraxial a ray tracing?
 *
 * SIMULACIÓN / NO GROUND TRUTH CLÍNICO · RESEARCH USE ONLY
 *
 * Método: para ojos sintéticos cortos/normales/largos con la LIO GENÉRICA declarada
 * (geometría equibiconvexa; la real de cada lente comercial es UNKNOWN), se compara
 * el foco paraxial del sistema exacto con el mejor foco trazado a dos aperturas:
 *  - haz bajo (h ≤ 0.08 mm): validación cruzada de los dos motores;
 *  - pupila clínica de 3 mm (h ≤ 1.5 mm): magnitud de la aberración esférica.
 * ADVERTENCIA: la aberración esférica depende fuertemente de la geometría real de la
 * lente (asfericidad incluida): estos valores caracterizan la GENÉRICA, no un modelo
 * comercial (OPEN_QUESTIONS #4).
 */
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createPreopEye, createPredictedPostopEye } from '../src/core/eye.mjs';
import { createGenericThickIOL } from '../src/core/iol.mjs';
import { buildRaytraceEye, compareParaxialVsRaytrace, buildParaxialEye } from '../src/optics/eyebuilder.mjs';
import { searchBestPower } from '../src/optimize/power_search.mjs';
import { ConstantOffsetPredictor } from '../src/predictors/iol_position.mjs';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), 'exp003_paraxial_vs_raytrace');
fs.mkdirSync(OUT_DIR, { recursive: true });

const CONFIG = {
  id: 'exp003_paraxial_vs_raytrace',
  etiqueta: 'SIMULACION / NO GROUND TRUTH CLINICO',
  iol: 'GENERICA equibiconvexa (n=1.49, t=0.8 mm) — geometría comercial UNKNOWN',
  predictor: 'ConstantOffsetPredictor(1.7)',
  haces: { validacion_mm: [0.02, 0.05, 0.08], clinico_mm: [0.3, 0.6, 0.9, 1.2, 1.5] },
  ojos: [
    { id: 'corto', al_mm: 21.0, k_d: 44.0 },
    { id: 'normal', al_mm: 23.5, k_d: 43.5 },
    { id: 'largo', al_mm: 27.0, k_d: 42.5 },
    { id: 'muy_largo', al_mm: 30.0, k_d: 42.0 },
  ],
  fijos: { acd_mm: 3.2, lt_mm: 4.5, cct_um: 550 },
};

const predictor = new ConstantOffsetPredictor(1.7);
const rows = [];
for (const o of CONFIG.ojos) {
  const pre = createPreopEye({
    al_mm: o.al_mm, k1_d: o.k_d, k1_axis_deg: 180, k2_d: o.k_d, k2_axis_deg: 90,
    ...CONFIG.fijos, meta: { source: 'synthetic' },
  });
  const pos = predictor.predict(pre).iol_position_mm;
  const post = createPredictedPostopEye(pre, { iol_position_mm: pos, position_source: predictor.id });
  const P = searchBestPower({ postop: post, target_d: 0 }).best.power_d;
  const eye = buildRaytraceEye(post, createGenericThickIOL({ se_power_d: P }));
  const val = compareParaxialVsRaytrace(eye, { heights_mm: CONFIG.haces.validacion_mm });
  const cli = compareParaxialVsRaytrace(eye, { heights_mm: CONFIG.haces.clinico_mm });
  rows.push({
    ...o, potencia_d: P, posicion_mm: pos,
    validacion: { delta_mm: +val.delta_mm.toFixed(4), delta_d: +val.equivalentDefocus_d.toFixed(4) },
    clinico_3mm: {
      delta_mm: +cli.delta_mm.toFixed(3), delta_d: +cli.equivalentDefocus_d.toFixed(3),
      spot_rms_mm: +cli.spotRms_mm.toFixed(4),
    },
  });
}

const result = {
  config: CONFIG,
  timestamp: new Date().toISOString(),
  commit: execSync('git rev-parse HEAD').toString().trim(),
  rows,
};
fs.writeFileSync(join(OUT_DIR, 'results.json'), JSON.stringify(result, null, 1));

const md = [
  '# exp003 — Paraxial vs ray tracing (ojo completo, LIO genérica)',
  '',
  '**SIMULACIÓN / NO GROUND TRUTH CLÍNICO** · commit `' + result.commit.slice(0, 10) + '` · ' + result.timestamp,
  '',
  '| Ojo | AL | P (D) | Validación h→0: Δfoco (mm) / ΔD | Pupila 3 mm: Δfoco (mm) / ΔD | Spot RMS (mm) |',
  '|---|---|---|---|---|---|',
  ...rows.map(r => `| ${r.id} | ${r.al_mm} | ${r.potencia_d} | ${r.validacion.delta_mm} / ${r.validacion.delta_d} | ${r.clinico_3mm.delta_mm} / ${r.clinico_3mm.delta_d} | ${r.clinico_3mm.spot_rms_mm} |`),
  '',
  'Lectura: con haz bajo ambos motores coinciden (validación cruzada); con pupila clínica la aberración',
  'esférica de la GENÉRICA adelanta el mejor foco — el efecto crece con la potencia (ojos cortos).',
  'Estos ΔD caracterizan la lente genérica declarada, no una LIO comercial (asfericidad real UNKNOWN).',
].join('\n');
fs.writeFileSync(join(OUT_DIR, 'README.md'), md + '\n');
console.log(md);
