/**
 * exp008 — ¿Cuánto depende la potencia recomendada del CRITERIO óptico elegido?
 *
 * SIMULACIÓN / NO GROUND TRUTH CLÍNICO · RESEARCH USE ONLY
 *
 * Pregunta (V1.1): con pupila real los rayos no cortan todos en el mismo punto, así que
 * "enfocar en la retina" deja de estar definido y hay que declarar qué se optimiza.
 *
 * REVISIÓN (pre-V1.2). La primera versión comparaba TRES criterios (A: mínimo RMS en
 * retina; B: mejor foco sobre la retina; C: desenfoque equivalente nulo). La revisión
 * demostró que B y C son EQUIVALENTES como criterios de optimización — mismo argmin,
 * ambos derivados de la misma llamada a bestFocus, solo cambia la unidad del coste
 * (demostración en objective.mjs; tests en objective_equivalence.test.mjs). La tabla de
 * la primera versión ya lo delataba: las columnas B y C eran idénticas fila a fila, y su
 * "acuerdo" era estructural, no un hallazgo. B quedó como métrica reportada; la
 * comparación real siempre fue A frente a (B≡C), y así se presenta ahora. Los valores de
 * A y C no cambian con la revisión; el rango A–C es numéricamente el mismo que el antiguo
 * rango "A–B–C" precisamente porque B≡C.
 *
 * Método: rejilla de ojos sintéticos declarada × pupilas de 2 a 6 mm. Para cada
 * combinación se optimiza con ambos criterios (potencia continua, sin catálogo, para
 * no mezclar el efecto del escalón) y se compara además con dos referencias paraxiales:
 *   - el paraxial de LENTE DELGADA (lo que hace V0);
 *   - el paraxial DEL MISMO SISTEMA GRUESO (la referencia correcta para aislar aberración).
 *
 * Lo que este experimento NO dice: cuál de los criterios predice mejor la refracción
 * postoperatoria real. Eso exige datos que el proyecto no tiene (OPEN_QUESTIONS #7).
 */
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createPreopEye, createPredictedPostopEye } from '../src/core/eye.mjs';
import { buildParaxialEye, buildRaytraceEye, paraxialFocusOfRaytraceEye } from '../src/optics/eyebuilder.mjs';
import { GenericIOLFactory } from '../src/core/iol_factory.mjs';
import { ObjectiveKind } from '../src/optics/objective.mjs';
import { optimizePowerByRaytrace } from '../src/optimize/raytrace_power.mjs';
import { ConstantOffsetPredictor } from '../src/predictors/iol_position.mjs';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), 'exp008_objetivo_optico');
fs.mkdirSync(OUT_DIR, { recursive: true });

const CONFIG = {
  id: 'exp008_objetivo_optico',
  etiqueta: 'SIMULACION / NO GROUND TRUTH CLINICO',
  pregunta: 'Divergencia de potencia entre criterios ópticos y frente al paraxial',
  predictor: 'ConstantOffsetPredictor(1.7) — offset declarado, no calibrado',
  lente: 'GenericIOLFactory (n=1.49, t=0.8 mm) — SUSTITUTO DE SIMULACIÓN, no comercial',
  objetivos: Object.values(ObjectiveKind),
  pupilas_mm: [2.0, 3.0, 4.0, 5.0, 6.0],
  ojos: [
    { id: 'corto_K_plana', al_mm: 21.0, k_d: 41.0 },
    { id: 'corto_K_curva', al_mm: 21.0, k_d: 46.0 },
    { id: 'normal', al_mm: 23.5, k_d: 43.5 },
    { id: 'largo_K_plana', al_mm: 27.0, k_d: 41.0 },
    { id: 'muy_largo', al_mm: 30.0, k_d: 43.5 },
  ],
  fijos: { acd_mm: 3.2, lt_mm: 4.5, cct_um: 550, target_d: 0 },
  n_anillos: 8,
  tol_d: 1e-6,
  // amplio a propósito: un ojo de 30 mm con K 43.5 necesita ~1.5 D, y a pupila grande el
  // óptimo trazado baja aún más. Un intervalo estrecho saturaría en su borde.
  rango_busqueda_d: [-15, 55],
};

const predictor = new ConstantOffsetPredictor(1.7);
const factory = new GenericIOLFactory();

/**
 * Potencia que sitúa el foco PARAXIAL del sistema trazado en la retina (referencia
 * correcta para aislar la aberración). La bisección VALIDA el cambio de signo: sin él,
 * devolvería un extremo del intervalo como si fuera la solución — que es exactamente el
 * fallo que este experimento encontró en su primera ejecución con el ojo de 30 mm.
 */
function paraxialDelSistema(postop, [lo, hi] = CONFIG.rango_busqueda_d) {
  const desvio = P => {
    const eye = buildRaytraceEye(postop, factory.create({ power_d: P }));
    return paraxialFocusOfRaytraceEye(eye) - eye.retina_z_mm;
  };
  const dLo = desvio(lo), dHi = desvio(hi);
  if (!(dLo > 0 && dHi < 0)) {
    throw new RangeError(`paraxialDelSistema: sin cambio de signo en [${lo}, ${hi}] D `
      + `(desvío ${dLo.toFixed(3)} … ${dHi.toFixed(3)} mm). La solución está fuera del intervalo.`);
  }
  let a = lo, b = hi;
  for (let i = 0; i < 100; i++) { const m = (a + b) / 2; if (desvio(m) > 0) a = m; else b = m; }
  return (a + b) / 2;
}

const rows = [];
for (const o of CONFIG.ojos) {
  const pre = createPreopEye({
    al_mm: o.al_mm, k1_d: o.k_d, k1_axis_deg: 180, k2_d: o.k_d, k2_axis_deg: 90,
    ...CONFIG.fijos, target_d: undefined, meta: { source: 'synthetic' },
  });
  const pos = predictor.predict(pre).iol_position_mm;
  const post = createPredictedPostopEye(pre, { iol_position_mm: pos, position_source: predictor.id });
  const par_delgada = buildParaxialEye(post).exactPowerFor(CONFIG.fijos.target_d);
  const par_sistema = paraxialDelSistema(post);

  for (const pupil_mm of CONFIG.pupilas_mm) {
    const porObjetivo = {};
    for (const objective of CONFIG.objetivos) {
      porObjetivo[objective] = optimizePowerByRaytrace({
        postop: post, factory, objective, pupil_mm,
        n_anillos: CONFIG.n_anillos, tol_d: CONFIG.tol_d, search_d: CONFIG.rango_busqueda_d,
      }).exact_power_d;
    }
    const v = Object.values(porObjetivo);
    rows.push({
      ojo: o.id, al_mm: o.al_mm, k_d: o.k_d, pupil_mm,
      paraxial_delgada_d: +par_delgada.toFixed(5),
      paraxial_sistema_d: +par_sistema.toFixed(5),
      por_objetivo_d: Object.fromEntries(Object.entries(porObjetivo).map(([k, x]) => [k, +x.toFixed(5)])),
      rango_entre_objetivos_d: +(Math.max(...v) - Math.min(...v)).toFixed(5),
      // aberración pura: separación del trazado respecto al paraxial del MISMO sistema
      aberracion_d: +(porObjetivo[ObjectiveKind.EQUIVALENT_DEFOCUS] - par_sistema).toFixed(5),
      // efecto del espesor: paraxial del sistema vs paraxial de lente delgada
      espesor_d: +(par_sistema - par_delgada).toFixed(5),
    });
  }
}

const rangos = rows.map(r => r.rango_entre_objetivos_d);
const aberr = rows.map(r => r.aberracion_d);
const espes = rows.map(r => r.espesor_d);
const result = {
  config: CONFIG,
  timestamp: new Date().toISOString(),
  commit: execSync('git rev-parse HEAD').toString().trim(),
  resumen: {
    n_casos: rows.length,
    rango_entre_objetivos_max_d: +Math.max(...rangos).toFixed(5),
    rango_entre_objetivos_medio_d: +(rangos.reduce((a, b) => a + b, 0) / rangos.length).toFixed(5),
    aberracion_min_d: +Math.min(...aberr).toFixed(5),
    aberracion_max_d: +Math.max(...aberr).toFixed(5),
    espesor_min_d: +Math.min(...espes).toFixed(5),
    espesor_max_d: +Math.max(...espes).toFixed(5),
  },
  rows,
};
fs.writeFileSync(join(OUT_DIR, 'results.json'), JSON.stringify(result, null, 1));

const R = result.resumen;
const fmt = n => (n >= 0 ? '+' : '') + n.toFixed(4);
const md = [
  '# exp008 — ¿Cuánto importa el criterio óptico elegido?',
  '',
  '**SIMULACIÓN / NO GROUND TRUTH CLÍNICO** · commit `' + result.commit.slice(0, 10) + '` · ' + result.timestamp,
  '',
  '## Pregunta',
  '',
  'Con pupila real los rayos no cortan todos en el mismo punto: no existe "el foco", y',
  '"enfocar en la retina" deja de estar definido. V1.1 implementa dos criterios',
  'independientes: **A** (mínimo RMS del spot en retina) y **C** (desenfoque equivalente',
  'nulo, es decir, mejor foco sobre la retina medido en dioptrías). Este experimento mide',
  'cuánta potencia los separa, y cuánto separan al trazado del paraxial.',
  '',
  '> **Revisión pre-V1.2.** La primera versión presentaba TRES criterios; B (mejor foco',
  '> sobre retina, en mm) y C se demostraron equivalentes como criterios de optimización:',
  '> mismo argmin, misma computación de mejor foco, distinta unidad. Sus columnas eran',
  '> idénticas fila a fila — acuerdo estructural, no hallazgo. B es ahora una métrica',
  '> reportada (`detail.desplazamiento_mm`) y la comparación se presenta como lo que',
  '> siempre fue: A frente a C. Demostración: `objective.mjs` /',
  '> `tests/objective_equivalence.test.mjs`. Los valores de A y C no cambiaron.',
  '',
  '## Resultado',
  '',
  '| Fuente de divergencia | Magnitud |',
  '|---|---|',
  `| **Entre los dos criterios independientes (A vs C)** | ${R.rango_entre_objetivos_medio_d.toFixed(4)} D de media, **${R.rango_entre_objetivos_max_d.toFixed(4)} D como máximo** |`,
  `| Aberración esférica (trazado − paraxial del mismo sistema) | ${fmt(R.aberracion_min_d)} … ${fmt(R.aberracion_max_d)} D |`,
  `| Espesor de la lente (paraxial del sistema − paraxial delgado) | ${fmt(R.espesor_min_d)} … ${fmt(R.espesor_max_d)} D |`,
  '',
  '### Lectura, en orden de importancia',
  '',
  '1. **El criterio elegido casi no importa** con superficies esféricas: A y C coinciden',
  `   dentro de ${R.rango_entre_objetivos_max_d.toFixed(4)} D en el peor caso, muy por debajo del escalón`,
  '   comercial de 0.5 D. Es un resultado **negativo y útil**: con la geometría actual, la',
  '   angustia sobre "qué optimizar" no está justificada. Debería reevaluarse al introducir',
  '   asfericidad (V1.2) y tilt/descentración (V1.3), que rompen la simetría que hoy los iguala.',
  '2. **La aberración esférica sí importa**, y crece rápido con la pupila: es la diferencia',
  '   real entre trazar y no trazar.',
  '3. **El espesor de la lente importa tanto o más que la aberración** a pupilas medias, y es',
  '   un efecto que el paraxial de lente delgada de V0 ignora por completo.',
  '',
  '## Detalle',
  '',
  '| Ojo | AL | K | Pupila | Paraxial delgada | Paraxial sistema | A (RMS) | C (desenf.) | Rango A-C | Aberración | Espesor |',
  '|---|---|---|---|---|---|---|---|---|---|---|',
  ...rows.map(r => `| ${r.ojo} | ${r.al_mm} | ${r.k_d} | ${r.pupil_mm} | ${r.paraxial_delgada_d} | ${r.paraxial_sistema_d} | ${r.por_objetivo_d.SPOT_RMS_AT_RETINA} | ${r.por_objetivo_d.EQUIVALENT_DEFOCUS} | ${r.rango_entre_objetivos_d} | ${fmt(r.aberracion_d)} | ${fmt(r.espesor_d)} |`),
  '',
  '## Lo que este experimento NO demuestra',
  '',
  'Cuál de los criterios predice mejor la refracción postoperatoria real, ni que el',
  'trazado prediga mejor que el paraxial. Ambas cosas exigen una cohorte postoperatoria',
  '(OPEN_QUESTIONS #7). Lo que se mide aquí es **estructura del modelo**, no acierto.',
  '',
  'La lente usada es un SUSTITUTO DE SIMULACIÓN (`GenericIOLFactory`, geometría derivada de',
  'la potencia). Ningún número de esta tabla es atribuible a una lente comercial: sin ficha',
  'de fabricante la geometría es `UNKNOWN` y el trazado falla en vez de sustituirla',
  '(OPEN_QUESTIONS #4).',
].join('\n');
fs.writeFileSync(join(OUT_DIR, 'README.md'), md + '\n');
console.log(md);
