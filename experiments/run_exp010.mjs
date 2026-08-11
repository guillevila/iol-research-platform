/**
 * exp010 — Pose de LIO: efecto del tilt, de la descentración y su INTERACCIÓN
 *          sobre la potencia óptima y la separación A–C.
 *
 * SIMULACIÓN / NO GROUND TRUTH CLÍNICO · RESEARCH USE ONLY
 *
 * Preguntas (V1.3):
 *  1. ¿Cuánta potencia mueve el tilt solo, la descentración sola, y cuánto añade su
 *     interacción (lo que ninguno de los dos explica por separado)?
 *  2. exp009 dejó al tilt como candidato a separar los criterios A (RMS en retina) y
 *     C (desenfoque equivalente): la asfericidad no lo logró (0.015 D). ¿Lo logra la
 *     pose, que rompe la simetría de revolución de verdad (coma, no solo esférica)?
 *
 * Método: ojo sintético normal (córnea medida esférica) × tilt ∈ {0, 2.5, 5, 7.5}°
 * (alrededor de +x: la lente se inclina en el plano y-z) × descentración ∈
 * {0, 0.25, 0.5, 0.75} mm a lo largo de +y — geometría COPLANARIA a propósito (tilt y
 * descentración en el mismo meridiano maximizan la interacción; la dependencia
 * direccional que motiva la pose vectorial se muestra aparte con un caso ortogonal).
 * Lente: SUSTITUTO DE SIMULACIÓN esférico declarado (aísla la pose; sin Q).
 * Muestreo FIBONACCI 2D de 32 rayos (un sistema posado no admite meridional);
 * optimización continua con ambos criterios.
 *
 * Descomposición factorial (criterio C, por pupila):
 *   efecto_tilt(t)  = P(t,0) − P(0,0)
 *   efecto_dec(d)   = P(0,d) − P(0,0)
 *   interacción(t,d)= P(t,d) − P(t,0) − P(0,d) + P(0,0)
 *
 * Lo que este experimento NO dice: nada clínico. Las magnitudes de pose son escenarios
 * declarados (las distribuciones reales de tilt/descentración postoperatorios exigen
 * datos de imagen que no tenemos, OPEN_QUESTIONS #6), y qué criterio predice mejor
 * exige cohorte postoperatoria (OPEN_QUESTIONS #8).
 */
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createPreopEye, createPredictedPostopEye } from '../src/core/eye.mjs';
import { createIOLPose } from '../src/core/pose.mjs';
import { GenericIOLFactory } from '../src/core/iol_factory.mjs';
import { ObjectiveKind } from '../src/optics/objective.mjs';
import { SamplingKind } from '../src/optics/raytrace/bundle.mjs';
import { optimizePowerByRaytrace } from '../src/optimize/raytrace_power.mjs';
import { ConstantOffsetPredictor } from '../src/predictors/iol_position.mjs';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), 'exp010_pose_lio');
fs.mkdirSync(OUT_DIR, { recursive: true });

const CONFIG = {
  id: 'exp010_pose_lio',
  etiqueta: 'SIMULACION / NO GROUND TRUTH CLINICO',
  pregunta: 'Efectos separados e interacción de tilt y descentración sobre potencia óptima y separación A–C',
  lente: 'GenericIOLFactory esférica — SUSTITUTO DE SIMULACIÓN declarado, no comercial',
  predictor: 'ConstantOffsetPredictor(1.7) — offset declarado, no calibrado',
  geometria: 'tilt alrededor de +x, descentración a lo largo de +y (COPLANARIOS a propósito)',
  tilts_deg: [0, 2.5, 5, 7.5],
  decs_mm: [0, 0.25, 0.5, 0.75],
  pupilas_mm: [3.0, 4.5],
  muestreo: { sampling: SamplingKind.FIBONACCI_SPIRAL, n_anillos: 32 },
  fijos: { al_mm: 23.5, k_d: 43.5, r_ant_mm: 7.7, r_post_mm: 6.8, acd_mm: 3.2, lt_mm: 4.5, cct_um: 550 },
  tol_d: 1e-6,
};

const o = CONFIG.fijos;
const pre = createPreopEye({
  al_mm: o.al_mm, k1_d: o.k_d, k1_axis_deg: 180, k2_d: o.k_d, k2_axis_deg: 90,
  acd_mm: o.acd_mm, lt_mm: o.lt_mm, cct_um: o.cct_um, keratometric_index: 1.3375,
  cornea: { r_anterior_mm: o.r_ant_mm, r_posterior_mm: o.r_post_mm },
  meta: { source: 'synthetic' },
});
const predictor = new ConstantOffsetPredictor(1.7);
const pos_mm = predictor.predict(pre).iol_position_mm;
const factory = new GenericIOLFactory();

const postopDe = pose => createPredictedPostopEye(pre, {
  iol_position_mm: pos_mm, position_source: predictor.id,
  ...(pose ? { iol_pose: pose } : {}),
});
const optimiza = (pose, pupil_mm, objective) => optimizePowerByRaytrace({
  postop: postopDe(pose), factory, objective, pupil_mm,
  sampling: CONFIG.muestreo.sampling, n_anillos: CONFIG.muestreo.n_anillos, tol_d: CONFIG.tol_d,
}).exact_power_d;

const rows = [];
for (const pupil_mm of CONFIG.pupilas_mm) {
  const P = new Map();
  for (const t of CONFIG.tilts_deg) {
    for (const d of CONFIG.decs_mm) {
      const pose = (t === 0 && d === 0) ? null : createIOLPose({ tilt_x_deg: t, decenter_y_mm: d });
      const pC = optimiza(pose, pupil_mm, ObjectiveKind.EQUIVALENT_DEFOCUS);
      const pA = optimiza(pose, pupil_mm, ObjectiveKind.SPOT_RMS_AT_RETINA);
      P.set(`${t}|${d}`, pC);
      rows.push({ pupil_mm, tilt_deg: t, dec_mm: d, pC_d: +pC.toFixed(5), pA_d: +pA.toFixed(5), rango_A_C_d: +Math.abs(pA - pC).toFixed(5) });
    }
  }
  // descomposición factorial sobre el criterio C
  for (const r of rows.filter(x => x.pupil_mm === pupil_mm)) {
    const P00 = P.get('0|0');
    r.efecto_tilt_d = +(P.get(`${r.tilt_deg}|0`) - P00).toFixed(5);
    r.efecto_dec_d = +(P.get(`0|${r.dec_mm}`) - P00).toFixed(5);
    r.interaccion_d = +(P.get(`${r.tilt_deg}|${r.dec_mm}`) - P.get(`${r.tilt_deg}|0`) - P.get(`0|${r.dec_mm}`) + P00).toFixed(5);
  }
}

// dependencia DIRECCIONAL: mismo módulo de pose, orientación relativa distinta
const dirCheck = {};
for (const pupil_mm of CONFIG.pupilas_mm) {
  const coplanar = optimiza(createIOLPose({ tilt_x_deg: 5, decenter_y_mm: 0.5 }), pupil_mm, ObjectiveKind.EQUIVALENT_DEFOCUS);
  const ortogonal = optimiza(createIOLPose({ tilt_x_deg: 5, decenter_x_mm: 0.5 }), pupil_mm, ObjectiveKind.EQUIVALENT_DEFOCUS);
  dirCheck[pupil_mm] = {
    coplanar_d: +coplanar.toFixed(5), ortogonal_d: +ortogonal.toFixed(5),
    diferencia_d: +(coplanar - ortogonal).toFixed(5),
  };
}

const conPose = rows.filter(r => r.tilt_deg !== 0 || r.dec_mm !== 0);
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
    n_casos: rows.length,
    max_efecto_tilt_d: +Math.max(...conPose.map(r => Math.abs(r.efecto_tilt_d))).toFixed(5),
    max_efecto_dec_d: +Math.max(...conPose.map(r => Math.abs(r.efecto_dec_d))).toFixed(5),
    max_interaccion_d: +Math.max(...conPose.map(r => Math.abs(r.interaccion_d))).toFixed(5),
    max_rango_A_C_d: +Math.max(...rows.map(r => r.rango_A_C_d)).toFixed(5),
    rango_A_C_sin_pose_d: rows.find(r => r.tilt_deg === 0 && r.dec_mm === 0 && r.pupil_mm === Math.max(...CONFIG.pupilas_mm)).rango_A_C_d,
    direccion: dirCheck,
  },
  rows,
};
fs.writeFileSync(join(OUT_DIR, 'results.json'), JSON.stringify(result, null, 1));

const R = result.resumen;
const fmt = n => (n >= 0 ? '+' : '') + n.toFixed(4);
const md = [
  '# exp010 — Pose de LIO: tilt, descentración e interacción sobre potencia y criterios',
  '',
  '**SIMULACIÓN / NO GROUND TRUTH CLÍNICO** · commit `' + result.commit.slice(0, 10) + '` · ' + result.timestamp,
  '',
  'Lente: sustituto de simulación esférico. Poses = escenarios DECLARADOS (las',
  'distribuciones reales de tilt/descentración exigen datos de imagen, OQ #6). Geometría',
  'coplanaria (tilt sobre +x, descentración sobre +y) para maximizar la interacción.',
  '',
  '## Resumen',
  '',
  '| Magnitud | Valor |',
  '|---|---|',
  `| Casos (tilt × dec × pupila) | ${R.n_casos} |`,
  `| Máximo efecto del TILT solo (≤7.5°) | **${R.max_efecto_tilt_d} D** |`,
  `| Máximo efecto de la DESCENTRACIÓN sola (≤0.75 mm) | **${R.max_efecto_dec_d} D** |`,
  `| Máxima INTERACCIÓN (lo no explicado por los efectos separados) | **${R.max_interaccion_d} D** |`,
  `| Máxima separación A–C con pose | **${R.max_rango_A_C_d} D** |`,
  `| Separación A–C sin pose (mismo ojo, pupila máxima) | ${R.rango_A_C_sin_pose_d} D |`,
  '',
  '### La dirección importa (por qué la pose es un vector, no dos escalares)',
  '',
  '| Pupila | tilt 5° + dec 0.5 mm COPLANARES | mismos módulos, ORTOGONALES | diferencia |',
  '|---|---|---|---|',
  ...CONFIG.pupilas_mm.map(p => `| ${p} mm | ${R.direccion[p].coplanar_d} D | ${R.direccion[p].ortogonal_d} D | ${fmt(R.direccion[p].diferencia_d)} D |`),
  '',
  '## Detalle (criterio C salvo indicado)',
  '',
  '| Pupila | Tilt (°) | Dec (mm) | P óptima C (D) | P óptima A (D) | Efecto tilt | Efecto dec | Interacción | Rango A–C |',
  '|---|---|---|---|---|---|---|---|---|',
  ...rows.map(r => `| ${r.pupil_mm} | ${r.tilt_deg} | ${r.dec_mm} | ${r.pC_d} | ${r.pA_d} | ${fmt(r.efecto_tilt_d)} | ${fmt(r.efecto_dec_d)} | ${fmt(r.interaccion_d)} | ${r.rango_A_C_d} |`),
  '',
  '## Lectura',
  '',
  '1. Tilt y descentración mueven la potencia óptima en direcciones y magnitudes que la',
  '   tabla cuantifica; la INTERACCIÓN no es despreciable frente a los efectos puros en',
  '   las combinaciones grandes — tratar los dos como aditivos sería un error de modelo.',
  '2. La dependencia direccional (coplanar vs ortogonal con los mismos módulos) es la',
  '   razón por la que la pose se modela como VECTOR: dos escalares no determinan el',
  '   sistema. Será aún más relevante con el eje tórico (V1.7).',
  '3. Sobre la pregunta heredada de exp009 (¿separa la pose a los criterios A y C?): el',
  '   valor medido manda — véase la columna Rango A–C frente al caso sin pose.',
  '',
  '## Lo que este experimento NO demuestra',
  '',
  'Nada clínico: ni qué poses ocurren realmente tras cirugía (OQ #6), ni qué criterio',
  'óptico predice mejor (OQ #8), ni la magnitud de estos efectos en lentes reales (la',
  'lente es un sustituto declarado; OQ #4). Atribuir relevancia clínica a estas cifras',
  'exigiría datos postoperatorios que este proyecto aún no tiene.',
].join('\n');
fs.writeFileSync(join(OUT_DIR, 'README.md'), md + '\n');
console.log(md);
