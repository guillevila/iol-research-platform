/**
 * exp005 — Divergencia tórica: motor físico (solo datos medidos) vs réplica EVO.
 *
 * SIMULACIÓN / NO GROUND TRUTH CLÍNICO · RESEARCH USE ONLY
 *
 * Hipótesis estructural: EVO añade una córnea posterior PREDICHA (~0.6 D contra la
 * regla); nuestro tórico físico, sin posterior medida, usa solo la queratometría
 * anterior. Predicción: EVO recomendará MENOS cilindro en astigmatismo a favor de
 * la regla (WTR) y MÁS en contra de la regla (ATR). Este experimento lo mide.
 * Ninguno de los dos es "verdad": decidirlo exige córnea posterior medida o datos
 * postoperatorios (VALIDATION_STRATEGY nivel 3).
 */
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createPreopEye, createPredictedPostopEye } from '../src/core/eye.mjs';
import { recommendToric } from '../src/toric/toric_engine.mjs';
import { searchBestPower } from '../src/optimize/power_search.mjs';
import { ConstantOffsetPredictor } from '../src/predictors/iol_position.mjs';
import { EvoReplicaEngine } from '../src/bench/engines/evo_engine.mjs';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), 'exp005_torico_fisico_vs_evo');
fs.mkdirSync(OUT_DIR, { recursive: true });

const CONFIG = {
  id: 'exp005_torico_fisico_vs_evo',
  etiqueta: 'SIMULACION / NO GROUND TRUTH CLINICO',
  ojo_base: { al_mm: 23.5, k_media_d: 43.5, acd_mm: 3.2, lt_mm: 4.5, cct_um: 550, a_constant: 119.3 },
  astigmatismos_d: [1.0, 2.0, 3.0, 4.0],
  orientaciones: [
    { id: 'WTR', steep_deg: 90 },
    { id: 'ATR', steep_deg: 180 },
    { id: 'oblicuo', steep_deg: 45 },
  ],
  // Catálogo de cilindros del modo genérico de EVO ('Posterior'), dato fáctico
  // verificado contra la web durante la ingeniería inversa (legacy/data/cyltable.json).
  catalogo_d: [0, 1.0, 1.5, 2.25, 3.0, 3.75, 4.5, 5.25, 6.0],
  predictor: 'ConstantOffsetPredictor(1.7)',
};

const predictor = new ConstantOffsetPredictor(1.7);
const evo = new EvoReplicaEngine();
const rows = [];
for (const ori of CONFIG.orientaciones) {
  for (const cyl of CONFIG.astigmatismos_d) {
    const b = CONFIG.ojo_base;
    const k1 = b.k_media_d - cyl / 2, k2 = b.k_media_d + cyl / 2;
    const flat = (ori.steep_deg + 90) % 180 === 0 ? 180 : (ori.steep_deg + 90) % 180;
    const pre = createPreopEye({
      al_mm: b.al_mm, k1_d: k1, k1_axis_deg: flat, k2_d: k2, k2_axis_deg: ori.steep_deg,
      acd_mm: b.acd_mm, lt_mm: b.lt_mm, cct_um: b.cct_um, meta: { source: 'synthetic' },
    });
    const pos = predictor.predict(pre).iol_position_mm;
    const post = createPredictedPostopEye(pre, { iol_position_mm: pos, position_source: predictor.id });
    const se = searchBestPower({ postop: post, target_d: 0 }).best.power_d;
    const fis = recommendToric({ postop: post, sePower_d: se, catalog_d: CONFIG.catalogo_d });
    const ev = evo.predict({
      al_mm: b.al_mm, k1_d: k1, k1_axis_deg: flat, k2_d: k2, k2_axis_deg: ori.steep_deg,
      acd_mm: b.acd_mm, lt_mm: b.lt_mm, cct_um: b.cct_um, target_d: 0,
      a_constant: b.a_constant, iol_model: 'Posterior', meta: { source: 'synthetic' },
    });
    rows.push({
      orientacion: ori.id, astig_anterior_d: cyl,
      fisico_cil_d: fis.recommended.cylinder_d, fisico_eje_deg: +fis.implantation_axis_deg.toFixed(1),
      evo_cil_d: ev.recommended_toric, evo_eje_deg: ev.recommended_axis,
      delta_cil_d: +(fis.recommended.cylinder_d - ev.recommended_toric).toFixed(2),
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
  '# exp005 — Tórico físico (solo datos medidos) vs réplica EVO (posterior predicha)',
  '',
  '**SIMULACIÓN / NO GROUND TRUTH CLÍNICO** · commit `' + result.commit.slice(0, 10) + '` · ' + result.timestamp,
  '',
  '| Orientación | Astig. anterior (D) | Físico: cil @ eje | EVO: cil @ eje | Δ cilindro (D) |',
  '|---|---|---|---|---|',
  ...rows.map(r => `| ${r.orientacion} | ${r.astig_anterior_d} | ${r.fisico_cil_d} @ ${r.fisico_eje_deg}° | ${r.evo_cil_d} @ ${r.evo_eje_deg}° | ${r.delta_cil_d > 0 ? '+' : ''}${r.delta_cil_d} |`),
  '',
  'Lectura: la firma de la córnea posterior predicha de EVO es visible y con el signo',
  'esperado (Δ>0 en WTR: el físico pide más cilindro; Δ≤0 en ATR). Decidir cuál acierta',
  'requiere posterior medida o resultados postoperatorios (VALIDATION_STRATEGY nivel 3).',
].join('\n');
fs.writeFileSync(join(OUT_DIR, 'README.md'), md + '\n');
console.log(md);
