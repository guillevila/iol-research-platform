/**
 * make_golden.mjs — genera la instantánea "golden" del motor congelado.
 * Se ejecuta UNA vez en la congelación; el test de regresión compara contra ella.
 * RESEARCH USE ONLY.
 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { run_evo_replica } from '../run_evo_replica.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');

// Casos golden: cubren dominio típico, miopía magna, astigmatismo alto, SIA,
// índices K alternativos, rejilla Zeiss y los dos casos clínicos anonimizados.
const GOLDEN_INPUTS = [
  { id: 'tipico_tecnis', al_mm: 23.5, k1_d: 43.0, k1_axis_deg: 180, k2_d: 45.0, k2_axis_deg: 90, acd_mm: 3.2, lt_mm: 4.5, cct_um: 550, target_d: 0, a_constant: 119.3, iol_model: 'Tecnis', k_index: 1.3375, sia_d: 0.1, sia_axis_deg: 100 },
  { id: 'generico_posterior', al_mm: 23.5, k1_d: 43.0, k1_axis_deg: 180, k2_d: 45.0, k2_axis_deg: 90, acd_mm: 3.2, lt_mm: 4.5, cct_um: 550, target_d: 0, a_constant: 119.3, iol_model: 'Posterior', k_index: 1.3375, sia_d: 0, sia_axis_deg: 0 },
  { id: 'miopia_magna_od', al_mm: 29.39, k1_d: 35.11, k1_axis_deg: 99, k2_d: 37.47, k2_axis_deg: 9, acd_mm: 4.15, lt_mm: 3.63, cct_um: 472, target_d: 0, a_constant: 119.10, iol_model: 'Aspire', k_index: 1.3375, sia_d: 0, sia_axis_deg: 0 },
  { id: 'miopia_magna_os', al_mm: 31.10, k1_d: 35.52, k1_axis_deg: 62, k2_d: 35.93, k2_axis_deg: 152, acd_mm: 4.14, lt_mm: 3.64, cct_um: 457, target_d: 0, a_constant: 119.28, iol_model: 'Envy', k_index: 1.3375, sia_d: 0, sia_axis_deg: 0 },
  { id: 'astig_alto_od_sia', al_mm: 22.53, k1_d: 42.03, k1_axis_deg: 176, k2_d: 45.55, k2_axis_deg: 86, acd_mm: 3.10, lt_mm: null, cct_um: null, target_d: 0, a_constant: 119.10, iol_model: 'Aspire', k_index: 1.3375, sia_d: 0.25, sia_axis_deg: 135 },
  { id: 'astig_alto_os_sia', al_mm: 22.57, k1_d: 43.10, k1_axis_deg: 3, k2_d: 45.24, k2_axis_deg: 93, acd_mm: 3.09, lt_mm: null, cct_um: null, target_d: 0, a_constant: 119.10, iol_model: 'Aspire', k_index: 1.3375, sia_d: 0.25, sia_axis_deg: 135 },
  { id: 'kindex_1_3315', al_mm: 24.1, k1_d: 42.5, k1_axis_deg: 10, k2_d: 43.8, k2_axis_deg: 100, acd_mm: 3.4, lt_mm: 4.2, cct_um: 530, target_d: -0.5, a_constant: 118.9, iol_model: 'SN6ATx', k_index: 1.3315, sia_d: 0, sia_axis_deg: 0 },
  { id: 'zeiss_709_rejilla', al_mm: 23.5, k1_d: 43.0, k1_axis_deg: 180, k2_d: 45.5, k2_axis_deg: 90, acd_mm: 3.2, lt_mm: 4.5, cct_um: 550, target_d: 0, a_constant: 119.3, iol_model: '709M/MP', k_index: 1.3375, sia_d: 0, sia_axis_deg: 0 },
  { id: 'ojo_corto_bl', al_mm: 21.2, k1_d: 44.6, k1_axis_deg: 75, k2_d: 46.1, k2_axis_deg: 165, acd_mm: 2.8, lt_mm: 4.9, cct_um: 505, target_d: -0.25, a_constant: 119.1, iol_model: 'MX60ET', k_index: 1.3375, sia_d: 0, sia_axis_deg: 0 },
  { id: 'jj_alta_potencia', al_mm: 21.0, k1_d: 41.5, k1_axis_deg: 20, k2_d: 42.4, k2_axis_deg: 110, acd_mm: 3.0, lt_mm: 4.7, cct_um: 560, target_d: 0, a_constant: 119.3, iol_model: 'ZCU', k_index: 1.3375, sia_d: 0, sia_axis_deg: 0 },
  { id: 'largo_k_plana', al_mm: 30.0, k1_d: 39.0, k1_axis_deg: 5, k2_d: 40.2, k2_axis_deg: 95, acd_mm: 3.8, lt_mm: 4.0, cct_um: 540, target_d: -0.75, a_constant: 119.4, iol_model: 'Vivity', k_index: 1.3375, sia_d: 0, sia_axis_deg: 0 },
  { id: 'sia_grande', al_mm: 24.8, k1_d: 43.2, k1_axis_deg: 140, k2_d: 44.9, k2_axis_deg: 50, acd_mm: 3.6, lt_mm: 4.4, cct_um: 590, target_d: 0.25, a_constant: 120.0, iol_model: 'Panoptix', k_index: 1.3375, sia_d: 0.5, sia_axis_deg: 45 },
];

const out = GOLDEN_INPUTS.map(inp => ({ input: inp, expected: run_evo_replica(inp) }));
const file = join(ROOT, 'baseline', 'golden_cases.json');
fs.writeFileSync(file, JSON.stringify(out, null, 1));
console.log('golden actualizado:', out.length, 'casos ->', file);
