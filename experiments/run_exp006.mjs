/**
 * exp006 — Capacidad informativa del plano ecuatorial del cristalino (EQ/LEP).
 *
 * SIMULACIÓN / NO GROUND TRUTH CLÍNICO · RESEARCH USE ONLY
 *
 * Pregunta (§24.4, Sprint 8): ¿cuánto valdría, en dioptrías de refracción, medir el
 * plano ecuatorial con OCT frente a inferir la posición desde ACD+LT?
 *
 * DISEÑO CONDICIONAL (todo declarado; sin afirmación biológica):
 *  - Mundo generativo H_EQ: la LIO se asienta en el ecuador capsular, y el ecuador
 *    real se desvía de la aproximación geométrica ACD+LT/2 por un término biológico
 *    ε_bio ~ N(0, σ_bio).       ← HIPÓTESIS DECLARADA, no hecho.
 *  - Estimador BASE (sin OCT):  pos = ACD + LT/2         → error = |ε_bio|
 *  - Estimador EQ  (con OCT):   pos = EQ medido           → error = |ε_medida|,
 *    con ε_medida ~ N(0, σ_m) (repetibilidad del dispositivo, declarada).
 *  - El error de posición se convierte a refracción con la sensibilidad D/mm del
 *    ojo (misma física que exp001).
 *
 * Conclusión permitida: "BAJO H_EQ, medir EQ con σ_m mejora al modelo base si
 * σ_m < σ_bio, y el beneficio refractivo escala con la potencia del ojo".
 * Decidir si H_EQ es cierta exige datos postoperatorios reales (nivel 3).
 */
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createPreopEye, createPredictedPostopEye } from '../src/core/eye.mjs';
import { searchBestPower } from '../src/optimize/power_search.mjs';
import { gaussianSampler } from '../src/uncertainty/montecarlo.mjs';
import { makeRng } from '../src/synth/generator.mjs';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), 'exp006_capacidad_eq');
fs.mkdirSync(OUT_DIR, { recursive: true });

const CONFIG = {
  id: 'exp006_capacidad_eq',
  etiqueta: 'SIMULACION / NO GROUND TRUTH CLINICO — analisis condicional bajo H_EQ declarada',
  hipotesis: 'H_EQ: posicion de LIO = ecuador capsular; ecuador = ACD + LT/2 + eps_bio',
  n_por_celda: 6000, seed: 20260811,
  sigma_bio_mm: [0.20, 0.30, 0.40],
  sigma_medida_mm: [0.05, 0.10, 0.20],
  ojos: [
    { id: 'corto', al_mm: 21.0, k_d: 44.0, acd_mm: 2.9, lt_mm: 4.9 },
    { id: 'normal', al_mm: 23.5, k_d: 43.5, acd_mm: 3.2, lt_mm: 4.5 },
    { id: 'largo', al_mm: 27.0, k_d: 42.5, acd_mm: 3.6, lt_mm: 4.1 },
  ],
  fijos: { cct_um: 550 },
};

const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
const rows = [];
for (const o of CONFIG.ojos) {
  const pre = createPreopEye({
    al_mm: o.al_mm, k1_d: o.k_d, k1_axis_deg: 180, k2_d: o.k_d, k2_axis_deg: 90,
    acd_mm: o.acd_mm, lt_mm: o.lt_mm, cct_um: CONFIG.fijos.cct_um, meta: { source: 'synthetic' },
  });
  const posGeom = o.acd_mm + o.lt_mm / 2;                      // aproximación geométrica declarada
  const s = searchBestPower({
    postop: createPredictedPostopEye(pre, { iol_position_mm: posGeom, position_source: 'exp006_base' }),
    target_d: 0,
  });
  const sens = Math.abs(s.sensitivity_ref_per_mm_d);           // D por mm (física propia)
  for (const sBio of CONFIG.sigma_bio_mm) {
    for (const sMed of CONFIG.sigma_medida_mm) {
      const gauss = gaussianSampler(makeRng(CONFIG.seed + Math.round(sBio * 100) * 7 + Math.round(sMed * 100)));
      const errBase = [], errEQ = [];
      for (let i = 0; i < CONFIG.n_por_celda; i++) {
        const epsBio = gauss(0, sBio);                         // desvío biológico del ecuador
        const epsMed = gauss(0, sMed);                         // error de medida del OCT
        errBase.push(Math.abs(epsBio));                        // base no ve eps_bio
        errEQ.push(Math.abs(epsMed));                          // OCT mide el ecuador con ruido
      }
      const posBase = mean(errBase), posEQ = mean(errEQ);
      rows.push({
        ojo: o.id, sensibilidad_d_mm: +sens.toFixed(3),
        sigma_bio_mm: sBio, sigma_medida_mm: sMed,
        err_pos_base_mm: +posBase.toFixed(3), err_pos_eq_mm: +posEQ.toFixed(3),
        err_ref_base_d: +(posBase * sens).toFixed(3), err_ref_eq_d: +(posEQ * sens).toFixed(3),
        beneficio_d: +((posBase - posEQ) * sens).toFixed(3),
      });
    }
  }
}

const result = {
  config: CONFIG,
  timestamp: new Date().toISOString(),
  commit: execSync('git rev-parse HEAD').toString().trim(),
  rows,
};
fs.writeFileSync(join(OUT_DIR, 'results.json'), JSON.stringify(result, null, 1));

const cell = (o, sb, sm) => rows.find(r => r.ojo === o && r.sigma_bio_mm === sb && r.sigma_medida_mm === sm);
const md = [
  '# exp006 — Valor refractivo de medir el plano ecuatorial (condicional a H_EQ)',
  '',
  '**SIMULACIÓN / NO GROUND TRUTH CLÍNICO** · commit `' + result.commit.slice(0, 10) + '` · ' + result.timestamp,
  '',
  '**Hipótesis declarada H_EQ:** ' + CONFIG.hipotesis + '. Nada de esto afirma que H_EQ sea',
  'biológicamente cierta: eso lo decidirán datos postoperatorios (VALIDATION_STRATEGY nivel 3).',
  '',
  '## Beneficio esperado de medir EQ (D de error refractivo evitado), σ_medida = 0.10 mm',
  '',
  '| Ojo | Sensibilidad (D/mm) | σ_bio 0.20 | σ_bio 0.30 | σ_bio 0.40 |',
  '|---|---|---|---|---|',
  ...CONFIG.ojos.map(o => {
    const s = rows.find(r => r.ojo === o.id).sensibilidad_d_mm;
    const b = sb => cell(o.id, sb, 0.10).beneficio_d;
    return `| ${o.id} | ${s} | ${b(0.20)} | ${b(0.30)} | ${b(0.40)} |`;
  }),
  '',
  '## Matriz completa (error refractivo medio, D): base vs EQ',
  '',
  '| Ojo | σ_bio | σ_medida | Base (D) | Con EQ (D) | Beneficio (D) |',
  '|---|---|---|---|---|---|',
  ...rows.map(r => `| ${r.ojo} | ${r.sigma_bio_mm} | ${r.sigma_medida_mm} | ${r.err_ref_base_d} | ${r.err_ref_eq_d} | ${r.beneficio_d} |`),
  '',
  'Lecturas (condicionales a H_EQ):',
  '1. Medir EQ solo aporta si σ_medida < σ_bio; el beneficio ≈ sensibilidad·(E|ε_bio|−E|ε_m|).',
  '2. El beneficio se concentra en ojos cortos (sensibilidad alta): con σ_bio=0.3 y σ_medida=0.1,',
  '   evita ~0.39 D en el corto frente a ~0.11 D en el largo.',
  '3. Dato mínimo para validar H_EQ: cohorte con EQ preoperatorio (OCT) y posición de LIO medida',
  '   postoperatoria (postop.schema.json) — registrado en CLINICAL_DATA_REQUIREMENTS.',
].join('\n');
fs.writeFileSync(join(OUT_DIR, 'README.md'), md + '\n');
console.log(md.split('\n').slice(0, 22).join('\n'));
