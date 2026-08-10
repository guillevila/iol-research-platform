/**
 * exp007 — ¿Depende la potencia recomendada de la MARCA del biómetro?
 *
 * SIMULACIÓN / NO GROUND TRUTH CLÍNICO · RESEARCH USE ONLY
 *
 * Pregunta (auditoría V0, hallazgo H1): el motor tomaba la lectura K del dispositivo
 * como si fuera la potencia corneal física. Como cada fabricante convierte radio→K con
 * un índice ficticio distinto (1.3375 / 1.3315 / 1.332), dos aparatos midiendo LA MISMA
 * córnea entregan K distintas. ¿Cuánta potencia de LIO se mueve por ese motivo?
 *
 * Método: se fija el RADIO corneal físico (la magnitud real), se simula qué leería cada
 * aparato, y se calcula la potencia recomendada bajo dos políticas:
 *   A) KERATOMETRIC_READING       (la de V0: P_córnea = K)
 *   B) SINGLE_SURFACE_FROM_RADIUS (recupera r con el índice del aparato: P = 336/r)
 * B es invariante al aparato POR CONSTRUCCIÓN; el experimento mide cuánto NO lo es A,
 * y cuánto separan entre sí las dos políticas.
 *
 * Lo que este experimento NO dice: cuál de las dos políticas predice mejor la refracción
 * postoperatoria real. Eso exige datos postoperatorios que el proyecto no tiene
 * (OPEN_QUESTIONS #2). Aquí solo se cuantifica una INCOHERENCIA INTERNA del modelo.
 */
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createPreopEye, createPredictedPostopEye } from '../src/core/eye.mjs';
import { searchBestPower } from '../src/optimize/power_search.mjs';
import { ConstantOffsetPredictor } from '../src/predictors/iol_position.mjs';
import { CorneaPolicy, KERATOMETRIC_INDICES, keratometryFromRadiusMm } from '../src/optics/cornea.mjs';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), 'exp007_politica_corneal');
fs.mkdirSync(OUT_DIR, { recursive: true });

const INDICES = [
  { n_k: KERATOMETRIC_INDICES.n_1_3375, etiqueta: '1.3375 (IOLMaster/Lenstar)' },
  { n_k: KERATOMETRIC_INDICES.n_1_3315, etiqueta: '1.3315 (índice corneal neto)' },
  { n_k: KERATOMETRIC_INDICES.n_1_332, etiqueta: '1.332  (algunos topógrafos)' },
];

const CONFIG = {
  id: 'exp007_politica_corneal',
  etiqueta: 'SIMULACION / NO GROUND TRUTH CLINICO',
  pregunta: 'Divergencia de potencia recomendada por convención queratométrica y por política corneal',
  predictor: 'ConstantOffsetPredictor(1.7) — offset declarado, no calibrado',
  politicas: [CorneaPolicy.KERATOMETRIC_READING, CorneaPolicy.SINGLE_SURFACE_FROM_RADIUS],
  indices: INDICES,
  // se barre el RADIO físico (magnitud real), no la lectura
  radios_mm: [7.00, 7.35, 7.70, 8.05, 8.40],
  al_mm: [21.0, 22.5, 23.5, 25.0, 27.0, 30.0],
  fijos: { acd_mm: 3.2, lt_mm: 4.5, cct_um: 550, target_d: 0 },
  rejilla_d: 0.5,
};

const predictor = new ConstantOffsetPredictor(1.7);

function potenciaPara(r_mm, n_k, al_mm, policy) {
  const K = keratometryFromRadiusMm(r_mm, n_k);
  const pre = createPreopEye({
    al_mm, k1_d: K, k1_axis_deg: 180, k2_d: K, k2_axis_deg: 90,
    ...CONFIG.fijos, target_d: undefined, keratometric_index: n_k,
    meta: { source: 'synthetic' },
  });
  const pos = predictor.predict(pre).iol_position_mm;
  const post = createPredictedPostopEye(pre, { iol_position_mm: pos, position_source: predictor.id });
  const s = searchBestPower({ postop: post, target_d: CONFIG.fijos.target_d, cornea: { policy } });
  return { K, rejilla_d: s.best.power_d, exacta_d: s.exact_power_d };
}

const rows = [];
for (const r_mm of CONFIG.radios_mm) {
  for (const al_mm of CONFIG.al_mm) {
    const porIndice = {};
    for (const { n_k } of INDICES) {
      porIndice[n_k] = {
        lectura: potenciaPara(r_mm, n_k, al_mm, CorneaPolicy.KERATOMETRIC_READING),
        radio: potenciaPara(r_mm, n_k, al_mm, CorneaPolicy.SINGLE_SURFACE_FROM_RADIUS),
      };
    }
    const exactasLectura = INDICES.map(i => porIndice[i.n_k].lectura.exacta_d);
    const exactasRadio = INDICES.map(i => porIndice[i.n_k].radio.exacta_d);
    const rejillaLectura = INDICES.map(i => porIndice[i.n_k].lectura.rejilla_d);
    const rango = a => Math.max(...a) - Math.min(...a);
    rows.push({
      r_mm, al_mm,
      k_por_indice: Object.fromEntries(INDICES.map(i => [i.n_k, +porIndice[i.n_k].lectura.K.toFixed(3)])),
      // dispersión ENTRE APARATOS dentro de cada política
      rango_entre_aparatos_lectura_d: +rango(exactasLectura).toFixed(4),
      rango_entre_aparatos_radio_d: +rango(exactasRadio).toFixed(12),
      escalones_distintos_en_rejilla: new Set(rejillaLectura).size,
      // separación ENTRE POLÍTICAS con la convención dominante (1.3375)
      delta_politicas_d: +(porIndice[1.3375].radio.exacta_d - porIndice[1.3375].lectura.exacta_d).toFixed(4),
    });
  }
}

const maxRangoLectura = Math.max(...rows.map(r => r.rango_entre_aparatos_lectura_d));
const maxRangoRadio = Math.max(...rows.map(r => r.rango_entre_aparatos_radio_d));
const casosQueCambianEscalon = rows.filter(r => r.escalones_distintos_en_rejilla > 1).length;
const deltas = rows.map(r => r.delta_politicas_d);

const result = {
  config: CONFIG,
  timestamp: new Date().toISOString(),
  commit: execSync('git rev-parse HEAD').toString().trim(),
  resumen: {
    n_casos: rows.length,
    max_rango_entre_aparatos_lectura_d: maxRangoLectura,
    max_rango_entre_aparatos_radio_d: maxRangoRadio,
    casos_con_recomendacion_distinta_por_marca: casosQueCambianEscalon,
    fraccion_casos_que_cambian: +(casosQueCambianEscalon / rows.length).toFixed(3),
    delta_politicas_min_d: +Math.min(...deltas).toFixed(4),
    delta_politicas_max_d: +Math.max(...deltas).toFixed(4),
    delta_politicas_medio_d: +(deltas.reduce((a, b) => a + b, 0) / deltas.length).toFixed(4),
  },
  rows,
};
fs.writeFileSync(join(OUT_DIR, 'results.json'), JSON.stringify(result, null, 1));

const R = result.resumen;
const md = [
  '# exp007 — Política corneal: ¿depende la recomendación de la marca del biómetro?',
  '',
  '**SIMULACIÓN / NO GROUND TRUTH CLÍNICO** · commit `' + result.commit.slice(0, 10) + '` · ' + result.timestamp,
  '',
  '## Pregunta',
  '',
  'Un biómetro no mide dioptrías: mide un radio y lo convierte con un índice ficticio propio',
  '(1.3375, 1.3315, 1.332). Si el motor usa la lectura K **como** potencia corneal, hereda la',
  'marca del aparato. Este experimento fija el radio corneal **físico**, simula qué leería cada',
  'aparato, y mide cuánta potencia de LIO se mueve por ese único motivo.',
  '',
  '## Resultado',
  '',
  '| Magnitud | Valor |',
  '|---|---|',
  `| Casos simulados (radio × AL) | ${R.n_casos} |`,
  `| Dispersión máxima entre aparatos — política \`KERATOMETRIC_READING\` | **${R.max_rango_entre_aparatos_lectura_d} D** |`,
  `| Dispersión máxima entre aparatos — política \`SINGLE_SURFACE_FROM_RADIUS\` | ${R.max_rango_entre_aparatos_radio_d} D |`,
  `| Casos en los que la marca cambia el escalón recomendado (rejilla 0.5 D) | ${R.casos_con_recomendacion_distinta_por_marca}/${R.n_casos} (${(R.fraccion_casos_que_cambian * 100).toFixed(1)}%) |`,
  `| Separación entre políticas (n_k=1.3375) | ${R.delta_politicas_min_d} … ${R.delta_politicas_max_d} D (media ${R.delta_politicas_medio_d} D) |`,
  '',
  'La segunda fila es 0 **por construcción**: recuperar el radio deshace exactamente la conversión',
  'del fabricante. No es un resultado empírico, es la comprobación de que la implementación cumple',
  'la invariancia que promete (y el test `P0.1: tres convenciones...` lo fija).',
  '',
  '## Detalle por caso',
  '',
  '| r (mm) | AL (mm) | K@1.3375 | K@1.3315 | K@1.332 | Rango entre aparatos (D) | ¿Cambia escalón? | Δ políticas (D) |',
  '|---|---|---|---|---|---|---|---|',
  ...rows.map(r => `| ${r.r_mm.toFixed(2)} | ${r.al_mm} | ${r.k_por_indice['1.3375']} | ${r.k_por_indice['1.3315']} | ${r.k_por_indice['1.332']} | ${r.rango_entre_aparatos_lectura_d} | ${r.escalones_distintos_en_rejilla > 1 ? 'SÍ' : 'no'} | ${r.delta_politicas_d} |`),
  '',
  '## Lectura',
  '',
  '1. Bajo la política de V0, la potencia recomendada depende de qué aparato tomó la medida,',
  '   aunque la córnea sea idéntica. El efecto es sistemático, no ruido.',
  '2. La política de radio recuperado elimina esa dependencia por completo.',
  '3. Las dos políticas no coinciden entre sí: la de lectura sobreestima la potencia corneal en',
  '   el factor (n_ac−1)/(n_k−1) = 0.9956 para 1.3375, lo que empuja la LIO en sentido contrario.',
  '',
  '## Lo que este experimento NO demuestra',
  '',
  'Que la política de radio prediga mejor la refracción postoperatoria real. Las fórmulas clásicas',
  'están calibradas **sobre** la convención del dispositivo, de modo que cambiar la política sin',
  'recalibrar el predictor de posición desplaza la predicción en bloque. Decidir cuál es preferible',
  'exige datos postoperatorios reales: registrado en OPEN_QUESTIONS #2. Por eso la política por',
  'defecto sigue siendo `KERATOMETRIC_READING` — ahora declarada y registrada en cada salida, no',
  'heredada por accidente.',
].join('\n');
fs.writeFileSync(join(OUT_DIR, 'README.md'), md + '\n');
console.log(md);
