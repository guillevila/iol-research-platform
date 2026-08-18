/**
 * exp015 — Pipeline EQ (V1.11): la hipótesis H_EQ atraviesa el pipeline físico real.
 *
 * SIMULACIÓN / NO GROUND TRUTH CLÍNICO · RESEARCH USE ONLY
 * H_EQ (posición de LIO = ecuador capsular ≈ ACD + LT/2 + ε_bio) sigue siendo una
 * HIPÓTESIS DECLARADA — nada de este experimento la valida biológicamente.
 *
 * Pregunta: ¿qué cambia en la matriz de capacidad informativa de exp006 cuando la
 * conversión posición→refracción deja de ser una linealización paraxial de lente
 * delgada (err_mm × D/mm) y pasa por el pipeline físico completo?
 *
 * DISCIPLINA DE CONVENCIONES (lección V1.8/exp013): la refracción paraxial (plano
 * declarado del modelo paraxial) y el desenfoque equivalente trazado (en retina) NO
 * se restan entre sí. Por eso:
 *  - dominio REFRACCIÓN: solo intra-paraxial (delgada ↔ gruesa, misma convención);
 *  - dominio POTENCIA CONTINUA de LIO: única magnitud comparable ENTRE motores
 *    (paraxial gruesa ↔ trazado, MISMA GenericIOLFactory — lección V1.8).
 *
 * Bloques (cada uno una vía de refutación):
 *  0. ANCLAS VIVAS de exp006: forma cerrada E|N(0,σ)| = σ·√(2/π) contra los err_pos
 *     publicados; inconsistencia de PROSA del README publicado registrada (no se
 *     regenera exp006).
 *  1. REPRODUCCIÓN BIT A BIT: la matriz completa de exp006 por la MISMA vía (paraxial
 *     delgada, mismas semillas por celda) con la única sustitución del cálculo inline
 *     ACD+LT/2 por EquatorialPlanePredictor — demuestra que promover H_EQ a CAPA B es
 *     numéricamente NEUTRO (solo cambia la procedencia).
 *  2. ESCALERA DE CAUSAS (un cambio por peldaño): linealización→re-evaluación y lente
 *     delgada→gruesa en dominio refracción; motor paraxial→trazado en dominio
 *     potencia. La descomposición es un CAMINO (telescópica): el orden inverso no es
 *     evaluable (no existe trazado de lente sin geometría) y se declara.
 *  3. MATRIZ DE BENEFICIO RE-EVALUADA: cuadratura determinista (Simpson partido en el
 *     cero, colas truncadas a 4σ DECLARADAS) con autotest contra forma cerrada,
 *     convergencia por bisección de paso y contraste Monte Carlo; ancla de refutación:
 *     beneficio ≡ 0 en la diagonal σ_m = σ_bio (misma integral por construcción).
 *  4. INTEGRACIÓN V1.12: ε_bio como canal position_prediction_mm (residual del
 *     predictor con medidas idénticas — anti-doble-conteo declarado) y σ_LT propagada
 *     POR el predictor; la inercia de lt_mm con un predictor que no lo consume se
 *     publica RECHAZADA, no silenciada.
 *
 * La estructura de los dos brazos es la MISMA de exp006 (respuesta alrededor de
 * posGeom; la potencia no se re-elige por extracción): modelar la elección por
 * extracción es OTRA pregunta y la responde raytraceChoiceStability (V1.12).
 * Toda diferencia con exp006 se llama DIVERGENCIA, jamás error/acierto.
 */
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createPreopEye, createPredictedPostopEye } from '../src/core/eye.mjs';
import { GenericIOLFactory } from '../src/core/iol_factory.mjs';
import { EquatorialPlanePredictor, FractionOfALPredictor } from '../src/predictors/iol_position.mjs';
import { searchBestPower } from '../src/optimize/power_search.mjs';
import { optimizePowerByRaytrace } from '../src/optimize/raytrace_power.mjs';
import { buildParaxialEye } from '../src/optics/eyebuilder.mjs';
import { gaussianSampler } from '../src/uncertainty/montecarlo.mjs';
import { makeRng } from '../src/synth/generator.mjs';
import { SamplingKind } from '../src/optics/raytrace/bundle.mjs';
import {
  raytraceOutcomeUncertainty, SigmaTipo,
} from '../src/uncertainty/raytrace_uncertainty.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(AQUI, 'exp015_pipeline_eq_trazado');
fs.mkdirSync(OUT_DIR, { recursive: true });

const CONFIG = {
  id: 'exp015_pipeline_eq_trazado',
  etiqueta: 'SIMULACION / NO GROUND TRUTH CLINICO — analisis condicional bajo H_EQ declarada',
  hipotesis: 'H_EQ: posicion de LIO = ecuador capsular; ecuador = ACD + LT/2 + eps_bio (DECLARADA, no hecho)',
  ojos: [
    { id: 'corto', al_mm: 21.0, k_d: 44.0, acd_mm: 2.9, lt_mm: 4.9 },
    { id: 'normal', al_mm: 23.5, k_d: 43.5, acd_mm: 3.2, lt_mm: 4.5 },
    { id: 'largo', al_mm: 27.0, k_d: 42.5, acd_mm: 3.6, lt_mm: 4.1 },
  ],
  fijos: { cct_um: 550 },
  sigma_bio_mm: [0.20, 0.30, 0.40],
  sigma_medida_mm: [0.05, 0.10, 0.20],
  procedencia_sigmas: 'rejilla de ESCENARIO DECLARADO reutilizada de exp006 (OQ #6) — no es repetibilidad real',
  pupil_mm: 3.0,
  n_anillos: 40,
  lente: 'GenericIOLFactory — SUSTITUTO DE SIMULACIÓN declarado (OQ #4); la MISMA factory en paraxial grueso y trazado (lección V1.8)',
  cuadratura: {
    intervalos_por_lado: 16,
    truncamiento_sigmas: 4,
    nota: 'Simpson compuesto partido en δ=0 (|f| tiene vértice ahí), por lado [0, 4σ]; '
      + 'la cola >4σ aporta P ≈ 6.3e-5 y sesga E|f| a la baja ~0.034 % (declarado)',
  },
  seeds: { mc_verificacion: 20260818, v112: 20260819 },
  sigmas_v112: {
    acd_mm: 0.10, lt_mm: 0.10, position_prediction_mm: 0.30,
    procedencia: {
      acd_mm: 'ESCENARIO DECLARADO nuevo de V1.11 (repetibilidad de biometría plausible, NO medida; OQ #6)',
      lt_mm: 'ESCENARIO DECLARADO nuevo de V1.11 (repetibilidad de biometría plausible, NO medida; OQ #6)',
      position_prediction_mm: 'sigma_bio = 0.30 de la rejilla de exp006: residual del predictor H_EQ con '
        + 'medidas idénticas — NO estimado de datos que también varíen en medidas (anti-doble-conteo, NOTA_POSICION V1.12)',
    },
  },
};

const ojoDe = o => createPreopEye({
  al_mm: o.al_mm, k1_d: o.k_d, k1_axis_deg: 180, k2_d: o.k_d, k2_axis_deg: 90,
  acd_mm: o.acd_mm, lt_mm: o.lt_mm, cct_um: CONFIG.fijos.cct_um, meta: { source: 'synthetic' },
});
const predictor = new EquatorialPlanePredictor();
const factory = new GenericIOLFactory();
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
const cerradaEabs = s => s * Math.sqrt(2 / Math.PI);   // E|N(0,σ)|

// ---------------------------------------------------------------------------------
// Cuadratura determinista: E|f(ε)| con ε ~ N(0,σ), Simpson por lado sobre [0, 4σ].
// f se evalúa en los nodos tal cual (sin interpolación); |f| es suave por lado si f
// es monótona con cero en δ=0 — por eso el partido en 0 es parte del método.
// ---------------------------------------------------------------------------------
function esperanzaAbs(f, sigma, intervalos = CONFIG.cuadratura.intervalos_por_lado) {
  const L = CONFIG.cuadratura.truncamiento_sigmas * sigma;
  const h = L / intervalos;
  const phi = x => Math.exp(-x * x / (2 * sigma * sigma)) / (sigma * Math.sqrt(2 * Math.PI));
  const lado = signo => {
    let s = 0;
    for (let i = 0; i <= intervalos; i++) {
      const x = i * h;
      const w = (i === 0 || i === intervalos) ? 1 : (i % 2 === 1 ? 4 : 2);
      s += w * Math.abs(f(signo * x)) * phi(x);
    }
    return s * h / 3;
  };
  return lado(+1) + lado(-1);
}

// Autotest del método contra la forma cerrada (f lineal): si esto no cuadra, ninguna
// cifra posterior vale nada — se publica, no se asume.
const autotest = (() => {
  const s = 1.7, sigma = 0.3;
  const q = esperanzaAbs(d => s * d, sigma);
  const exacta = s * cerradaEabs(sigma);
  return {
    funcion: 'f(δ) = 1.7·δ, σ = 0.3',
    cuadratura: q, forma_cerrada: exacta,
    desviacion_relativa: Math.abs(q - exacta) / exacta,
    nota: 'incluye el truncamiento declarado a 4σ (~0.034 % a la baja)',
  };
})();

// ---------------------------------------------------------------------------------
// BLOQUE 0 · anclas vivas de exp006 (se LEE lo publicado; jamás se escribe)
// ---------------------------------------------------------------------------------
const exp006 = JSON.parse(fs.readFileSync(join(AQUI, 'exp006_capacidad_eq', 'results.json'), 'utf8'));
const errPosPublicados = [];
for (const sBio of CONFIG.sigma_bio_mm) {
  const fila = exp006.rows.find(r => r.ojo === 'normal' && r.sigma_bio_mm === sBio && r.sigma_medida_mm === 0.10);
  errPosPublicados.push({
    sigma_mm: sBio, brazo: 'base', publicado_mm: fila.err_pos_base_mm,
    forma_cerrada_mm: +cerradaEabs(sBio).toFixed(4),
    desviacion_relativa: +(Math.abs(fila.err_pos_base_mm - cerradaEabs(sBio)) / cerradaEabs(sBio)).toFixed(4),
  });
}
for (const sMed of CONFIG.sigma_medida_mm) {
  const fila = exp006.rows.find(r => r.ojo === 'normal' && r.sigma_bio_mm === 0.30 && r.sigma_medida_mm === sMed);
  errPosPublicados.push({
    sigma_mm: sMed, brazo: 'eq', publicado_mm: fila.err_pos_eq_mm,
    forma_cerrada_mm: +cerradaEabs(sMed).toFixed(4),
    desviacion_relativa: +(Math.abs(fila.err_pos_eq_mm - cerradaEabs(sMed)) / cerradaEabs(sMed)).toFixed(4),
  });
}
const bloque0 = {
  commit_exp006: exp006.commit,
  sensibilidades_publicadas_d_mm: Object.fromEntries(CONFIG.ojos.map(o =>
    [o.id, exp006.rows.find(r => r.ojo === o.id).sensibilidad_d_mm])),
  err_pos_vs_forma_cerrada: errPosPublicados,
  nota_desviaciones: 'las desviaciones ~1-3 % son coherentes con el SE del MC de exp006 (n = 6000) '
    + 'MÁS el defecto medido del LCG de makeRng (infla la varianza de las normales 1.3-2.8 %, '
    + 'documentado en montecarlo.mjs en V1.12). Se registra; exp006 NO se regenera.',
  inconsistencia_prosa_exp006: {
    texto_publicado: 'Lectura 2 del README: «evita ~0.39 D en el corto frente a ~0.11 D en el largo» (hardcodeado en run_exp006.mjs)',
    celdas_publicadas: 'las celdas de esa misma tabla dan 0.363 D (corto) y 0.102 D (largo)',
    tratamiento: 'DIVERGENCIA DE TEXTO registrada aquí; el ancla válida es results.json. '
      + 'Corregir la prosa exigiría regenerar exp006 y el encargo lo prohíbe salvo defecto '
      + 'de CIFRAS demostrado — que no lo hay.',
  },
};

// ---------------------------------------------------------------------------------
// BLOQUE 1 · reproducción bit a bit del eje paraxial delgado de exp006, con la única
// sustitución del cálculo inline ACD+LT/2 por el predictor de CAPA B.
// ---------------------------------------------------------------------------------
const filasReproducidas = [];
const posiciones = {};
for (const o of CONFIG.ojos) {
  const pre = ojoDe(o);
  const prediccion = predictor.predict(pre);            // ÚNICA fuente de posición
  posiciones[o.id] = prediccion;
  const s = searchBestPower({
    postop: createPredictedPostopEye(pre, {
      iol_position_mm: prediccion.iol_position_mm, position_source: prediccion.source,
    }),
    target_d: 0,
  });
  const sens = Math.abs(s.sensitivity_ref_per_mm_d);
  for (const sBio of CONFIG.sigma_bio_mm) {
    for (const sMed of CONFIG.sigma_medida_mm) {
      const gauss = gaussianSampler(makeRng(exp006.config.seed + Math.round(sBio * 100) * 7 + Math.round(sMed * 100)));
      const errBase = [], errEQ = [];
      for (let i = 0; i < exp006.config.n_por_celda; i++) {
        const epsBio = gauss(0, sBio);
        const epsMed = gauss(0, sMed);
        errBase.push(Math.abs(epsBio));
        errEQ.push(Math.abs(epsMed));
      }
      const posBase = mean(errBase), posEQ = mean(errEQ);
      filasReproducidas.push({
        ojo: o.id, sensibilidad_d_mm: +sens.toFixed(3),
        sigma_bio_mm: sBio, sigma_medida_mm: sMed,
        err_pos_base_mm: +posBase.toFixed(3), err_pos_eq_mm: +posEQ.toFixed(3),
        err_ref_base_d: +(posBase * sens).toFixed(3), err_ref_eq_d: +(posEQ * sens).toFixed(3),
        beneficio_d: +((posBase - posEQ) * sens).toFixed(3),
      });
    }
  }
}
// La comparación se hace tras el MISMO viaje por JSON que hizo lo publicado: JSON no
// representa −0 (lo canoniza a 0), y en las celdas diagonales (σ_bio = σ_m) el
// beneficio calculado es ±0.000 → +(-0.000) = −0 en memoria pero 0 en el fichero.
// Sin el round-trip, tres celdas «divergen» por un artefacto de serialización, no
// por una cifra distinta — exactamente la clase de fantasma que este bloque caza.
const filasTrasJSON = JSON.parse(JSON.stringify(filasReproducidas));
let celdasIdenticas = 0;
let primeraDivergencia = null;
for (let i = 0; i < exp006.rows.length; i++) {
  const pub = exp006.rows[i], rep = filasTrasJSON[i];
  const claves = Object.keys(pub);
  const igual = claves.every(k => Object.is(pub[k], rep[k]));
  if (igual) celdasIdenticas++;
  else if (!primeraDivergencia) primeraDivergencia = { fila: i, publicada: pub, reproducida: rep };
}
const bloque1 = {
  celdas_identicas: `${celdasIdenticas}/${exp006.rows.length}`,
  primera_divergencia: primeraDivergencia,
  position_source_nuevo: posiciones.normal.source,
  inputs_used: posiciones.normal.inputs_used,
  lectura: 'la promoción de H_EQ a predictor de CAPA B es numéricamente NEUTRA: cambia '
    + 'la procedencia (position_source, inputs_used), no una sola cifra. Esto ES '
    + '«reproduce exp006» en su única lectura ejecutable.',
};

// ---------------------------------------------------------------------------------
// Respuestas posición→resultado por motor (la maquinaria de los bloques 2 y 3).
// Dominio refracción: SOLO paraxial (delgada/gruesa, misma convención).
// Dominio potencia continua: paraxial gruesa y trazado (misma factory).
// ---------------------------------------------------------------------------------
function paraxialEnPos(pre, pos) {
  return buildParaxialEye(createPredictedPostopEye(pre, {
    iol_position_mm: pos, position_source: 'exp015_respuesta',
  }));
}
/** Potencia continua paraxial GRUESA que anula la refracción en pos (bisección). */
function potenciaExactaGruesa(pre, pos) {
  const eye = paraxialEnPos(pre, pos);
  let lo = 0, hi = 40;
  const f = p => eye.refractionForIOL(factory.create({ power_d: p }));
  const fLo = f(lo), fHi = f(hi);
  if (Math.sign(fLo) === Math.sign(fHi)) throw new RangeError(`sin cambio de signo en [${lo},${hi}]`);
  for (let i = 0; i < 80 && hi - lo > 1e-9; i++) {
    const mid = (lo + hi) / 2;
    if (Math.sign(f(mid)) === Math.sign(fLo)) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}
/**
 * Potencia continua TRAZADA (sección áurea del optimizador real), con memoización.
 * La ventana de búsqueda se centra SIEMPRE en la potencia exacta paraxial gruesa de
 * ESA posición (misma factory): el óptimo trazado queda a < 1 D de ella en todos los
 * casos de esta rejilla, y ±2.5 D deja margen sobrado sin heurísticas de continuación.
 */
function trazadorDePotencia(pre) {
  const cache = new Map();
  return pos => {
    if (cache.has(pos)) return cache.get(pos);
    const centro = potenciaExactaGruesa(pre, pos);
    const r = optimizePowerByRaytrace({
      postop: createPredictedPostopEye(pre, { iol_position_mm: pos, position_source: 'exp015_respuesta' }),
      factory, pupil_mm: CONFIG.pupil_mm, n_anillos: CONFIG.n_anillos,
      sampling: SamplingKind.MERIDIONAL,
      search_d: [centro - 2.5, centro + 2.5],
    });
    cache.set(pos, r.exact_power_d);
    return r.exact_power_d;
  };
}

const MALLA_CURVATURA = [-0.8, -0.4, -0.2, -0.1, -0.05, 0.05, 0.1, 0.2, 0.4, 0.8];
const bloque2 = [];
const bloque3Refraccion = [];
const bloque3Potencia = [];
let supuestosTrazadoNominal = null;

for (const o of CONFIG.ojos) {
  const pre = ojoDe(o);
  const pos0 = posiciones[o.id].iol_position_mm;

  // --- dominio REFRACCIÓN (paraxial): potencias del escalón como en exp006 ---
  const sDelgada = searchBestPower({ postop: createPredictedPostopEye(pre, { iol_position_mm: pos0, position_source: posiciones[o.id].source }), target_d: 0 });
  const sGruesa = searchBestPower({ postop: createPredictedPostopEye(pre, { iol_position_mm: pos0, position_source: posiciones[o.id].source }), target_d: 0, iolFactory: factory });
  const refDelgada = pos => paraxialEnPos(pre, pos).refractionForThinPower(sDelgada.best.power_d);
  const refGruesa = pos => paraxialEnPos(pre, pos).refractionForIOL(factory.create({ power_d: sGruesa.best.power_d }));
  const fRefDelgada = d => refDelgada(pos0 + d) - refDelgada(pos0);
  const fRefGruesa = d => refGruesa(pos0 + d) - refGruesa(pos0);

  // --- dominio POTENCIA continua (cruce de motores, misma factory) ---
  const PstarGruesa = pos => potenciaExactaGruesa(pre, pos);
  const PstarTrazada = trazadorDePotencia(pre);
  const fPGruesa = d => PstarGruesa(pos0 + d) - PstarGruesa(pos0);
  const fPTrazada = d => PstarTrazada(pos0 + d) - PstarTrazada(pos0);
  // evaluación ordenada en δ para que la continuación (warm start) sea efectiva
  const nodos = new Set(MALLA_CURVATURA.map(d => pos0 + d));
  for (const sig of [...CONFIG.sigma_bio_mm, ...CONFIG.sigma_medida_mm]) {
    const L = CONFIG.cuadratura.truncamiento_sigmas * sig;
    const h = L / CONFIG.cuadratura.intervalos_por_lado;
    for (let i = 0; i <= CONFIG.cuadratura.intervalos_por_lado; i++) {
      nodos.add(pos0 + i * h); nodos.add(pos0 - i * h);
    }
  }
  for (const pos of [...nodos].sort((a, b) => a - b)) PstarTrazada(pos);

  const h = 0.25;
  const sensPGruesa = (PstarGruesa(pos0 + h) - PstarGruesa(pos0 - h)) / (2 * h);
  const sensPTrazada = (PstarTrazada(pos0 + h) - PstarTrazada(pos0 - h)) / (2 * h);
  const dRefdP = (paraxialEnPos(pre, pos0).refractionForThinPower(sDelgada.best.power_d + 0.5)
    - paraxialEnPos(pre, pos0).refractionForThinPower(sDelgada.best.power_d - 0.5));

  bloque2.push({
    ojo: o.id,
    posicion_heq_mm: pos0,
    potencias_de_sonda: {
      delgada_escalon_d: sDelgada.best.power_d,
      gruesa_escalon_d: sGruesa.best.power_d,
      trazada_continua_d: PstarTrazada(pos0),
      nota: 'cada peldaño sondea en el óptimo de SU propio motor (diseño autoconsistente, como exp006)',
    },
    dominio_refraccion: {
      sens_delgada_d_mm: sDelgada.sensitivity_ref_per_mm_d,
      sens_gruesa_d_mm: sGruesa.sensitivity_ref_per_mm_d,
      curvatura: MALLA_CURVATURA.map(d => ({
        delta_mm: d,
        f_delgada_d: fRefDelgada(d),
        lineal_delgada_d: sDelgada.sensitivity_ref_per_mm_d * d,
        f_gruesa_d: fRefGruesa(d),
        lineal_gruesa_d: sGruesa.sensitivity_ref_per_mm_d * d,
      })),
    },
    dominio_potencia: {
      sens_P_gruesa_d_mm: sensPGruesa,
      sens_P_trazada_d_mm: sensPTrazada,
      divergencia_motor_sens_d_mm: sensPTrazada - sensPGruesa,
      curvatura: MALLA_CURVATURA.map(d => ({
        delta_mm: d, f_P_gruesa_d: fPGruesa(d), f_P_trazada_d: fPTrazada(d),
      })),
    },
    puente_declarado: {
      dRef_dP_delgada: dRefdP,
      nota: 'relación refracción↔potencia del propio modelo delgado, publicada SOLO para '
        + 'que el lector relacione magnitudes de los dos dominios; NO se usa para convertir resultados',
    },
  });

  // --- matrices de beneficio (bloque 3) ---
  const EabsRefDelgada = {}, EabsRefGruesa = {}, EabsPGruesa = {}, EabsPTrazada = {};
  for (const sig of [...CONFIG.sigma_bio_mm, ...CONFIG.sigma_medida_mm]) {
    EabsRefDelgada[sig] = esperanzaAbs(fRefDelgada, sig);
    EabsRefGruesa[sig] = esperanzaAbs(fRefGruesa, sig);
    EabsPGruesa[sig] = esperanzaAbs(fPGruesa, sig);
    EabsPTrazada[sig] = esperanzaAbs(fPTrazada, sig);
  }
  for (const sBio of CONFIG.sigma_bio_mm) {
    for (const sMed of CONFIG.sigma_medida_mm) {
      const pub = exp006.rows.find(r => r.ojo === o.id && r.sigma_bio_mm === sBio && r.sigma_medida_mm === sMed);
      const benDelgada = EabsRefDelgada[sBio] - EabsRefDelgada[sMed];
      const benGruesa = EabsRefGruesa[sBio] - EabsRefGruesa[sMed];
      bloque3Refraccion.push({
        ojo: o.id, sigma_bio_mm: sBio, sigma_medida_mm: sMed,
        beneficio_publicado_exp006_d: pub.beneficio_d,
        beneficio_delgada_reevaluada_d: benDelgada,
        beneficio_gruesa_reevaluada_d: benGruesa,
        canal_linealizacion_d: benDelgada - pub.beneficio_d,
        canal_modelo_lente_d: benGruesa - benDelgada,
      });
      const benPG = EabsPGruesa[sBio] - EabsPGruesa[sMed];
      const benPT = EabsPTrazada[sBio] - EabsPTrazada[sMed];
      bloque3Potencia.push({
        ojo: o.id, sigma_bio_mm: sBio, sigma_medida_mm: sMed,
        beneficio_P_gruesa_d: benPG,
        beneficio_P_trazada_d: benPT,
        canal_motor_optico_d: benPT - benPG,
      });
    }
  }
}

// diagonal σ_m = σ_bio = 0.2: CERO POR CONSTRUCCIÓN en cuadratura (misma integral en
// ambos brazos) — se VERIFICA, no se asume; el 0 publicado de exp006 también era por
// construcción (extracciones emparejadas del mismo stream)
const diagonal = bloque3Refraccion.filter(c => c.sigma_bio_mm === 0.20 && c.sigma_medida_mm === 0.20);
const diagonalExacta = diagonal.every(c =>
  Object.is(c.beneficio_delgada_reevaluada_d, 0) && Object.is(c.beneficio_gruesa_reevaluada_d, 0))
  && bloque3Potencia.filter(c => c.sigma_bio_mm === 0.20 && c.sigma_medida_mm === 0.20)
    .every(c => Object.is(c.beneficio_P_gruesa_d, 0) && Object.is(c.beneficio_P_trazada_d, 0));

// convergencia de la cuadratura: paso doble (8 intervalos por lado) en una celda trazada
const preNormal = ojoDe(CONFIG.ojos[1]);
const Ptr = trazadorDePotencia(preNormal);
const pos0Normal = posiciones.normal.iol_position_mm;
const fPTrazadaNormal = d => Ptr(pos0Normal + d) - Ptr(pos0Normal);
const conv16 = esperanzaAbs(fPTrazadaNormal, 0.30, 16);
const conv8 = esperanzaAbs(fPTrazadaNormal, 0.30, 8);

// contraste Monte Carlo de la cuadratura (dominio refracción gruesa, celda normal σ 0.3):
// re-evaluación por extracción, sin linealizar — verifica el MÉTODO, no la física
const sGruesaNormal = searchBestPower({
  postop: createPredictedPostopEye(preNormal, { iol_position_mm: pos0Normal, position_source: posiciones.normal.source }),
  target_d: 0, iolFactory: factory,
});
const refGruesaNormal = pos => paraxialEnPos(preNormal, pos).refractionForIOL(factory.create({ power_d: sGruesaNormal.best.power_d }));
const fMC = d => refGruesaNormal(pos0Normal + d) - refGruesaNormal(pos0Normal);
const gaussMC = gaussianSampler(makeRng(CONFIG.seeds.mc_verificacion));
const absMC = [];
for (let i = 0; i < 20000; i++) absMC.push(Math.abs(fMC(gaussMC(0, 0.30))));
const mcEabs = mean(absMC);
const quadEabs = esperanzaAbs(fMC, 0.30);
const verificacionCuadratura = {
  celda: 'normal, dominio refracción gruesa, σ = 0.30 mm',
  cuadratura_d: quadEabs,
  montecarlo_n20000_d: mcEabs,
  desviacion_relativa: Math.abs(mcEabs - quadEabs) / quadEabs,
  nota: 'tolerancia esperable ~3 %: SE del MC (~0.6 %) + defecto del LCG de makeRng '
    + '(infla varianza 1.3-2.8 %, medido en V1.12) + truncamiento declarado de la cuadratura (0.034 %)',
};

// ---------------------------------------------------------------------------------
// BLOQUE 4 · integración V1.12: H_EQ con incertidumbre y causalidad auditable
// ---------------------------------------------------------------------------------
const sigmaDecl = (sd, provenance) => ({ sd, tipo: SigmaTipo.DECLARADA, provenance });
const v112 = raytraceOutcomeUncertainty({
  preop: preNormal, iol: factory.create({ power_d: 21 }),
  predictor,
  sigmas: {
    acd_mm: sigmaDecl(CONFIG.sigmas_v112.acd_mm, CONFIG.sigmas_v112.procedencia.acd_mm),
    lt_mm: sigmaDecl(CONFIG.sigmas_v112.lt_mm, CONFIG.sigmas_v112.procedencia.lt_mm),
    position_prediction_mm: sigmaDecl(CONFIG.sigmas_v112.position_prediction_mm, CONFIG.sigmas_v112.procedencia.position_prediction_mm),
  },
  n: 1000, seed: CONFIG.seeds.v112, pupil_mm: CONFIG.pupil_mm,
  sampling: { kind: SamplingKind.MERIDIONAL, n_anillos: CONFIG.n_anillos },
});
supuestosTrazadoNominal = v112.nominal.supuestos_trazado;
let inerciaLt;
try {
  raytraceOutcomeUncertainty({
    preop: preNormal, iol: factory.create({ power_d: 21 }),
    predictor: new FractionOfALPredictor(0.2),
    sigmas: { lt_mm: sigmaDecl(CONFIG.sigmas_v112.lt_mm, CONFIG.sigmas_v112.procedencia.lt_mm) },
    n: 100, seed: 1, pupil_mm: CONFIG.pupil_mm,
    sampling: { kind: SamplingKind.MERIDIONAL, n_anillos: CONFIG.n_anillos },
  });
  inerciaLt = { rechazada: false };
} catch (err) {
  inerciaLt = { rechazada: true, mensaje: String(err.message) };
}
const bloque4 = {
  outcome: {
    predictor: v112.parametros_declarados.predictor,
    predictor_inputs: v112.parametros_declarados.predictor_inputs,
    sd_d: v112.distribucion.sd_d,
    media_d: v112.distribucion.media_d,
    nominal_residual_d: v112.nominal.residual_d,
    ancla_nominal_exacta: v112.ancla_nominal_exacta,
    ratio_mc_sobre_lineal: v112.ancla_lineal.ratio_mc_sobre_lineal,
    derivadas_d_por_unidad: v112.ancla_lineal.derivadas_d_por_unidad,
    n: { intentados: v112.n_intentados, validos: v112.n_validos, rechazados: v112.n_rechazados },
    descomposicion_posicion: v112.descomposicion_posicion,
  },
  inercia_lt_publicada: inerciaLt,
  lectura: 'eps_bio de H_EQ viaja como residual del predictor (canal b, position_prediction_mm) '
    + 'y las medidas acd/lt como canal (a) POR el predictor — dos canales con procedencia '
    + 'distinta, sin doble conteo (descomposicion_posicion). La sonda de inercia demuestra '
    + 'POR EJECUCIÓN que lt_mm solo propaga si el predictor lo consume.',
};

// ---------------------------------------------------------------------------------
const redondea = (o, n = 6) => JSON.parse(JSON.stringify(o, (k, v) =>
  typeof v === 'number' && Number.isFinite(v) && !Number.isInteger(v) ? +v.toFixed(n) : v));

const result = redondea({
  config: CONFIG,
  timestamp: new Date().toISOString(),
  commit: execSync('git rev-parse HEAD').toString().trim(),
  procedencia_commit: 'último commit AL GENERAR: la reproducibilidad la garantiza '
    + 'scripts/check_experiments.mjs, no este campo (hallazgo V1.3)',
  autotest_cuadratura: autotest,
  bloque0_anclas_exp006: bloque0,
  bloque1_reproduccion: bloque1,
  bloque2_escalera: bloque2,
  bloque3_beneficio: {
    dominio_refraccion_paraxial: bloque3Refraccion,
    dominio_potencia_cruzado: bloque3Potencia,
    diagonal_cero_por_construccion: diagonalExacta,
    convergencia_cuadratura: {
      celda: 'normal, potencia trazada, σ = 0.30 mm',
      intervalos_16: conv16, intervalos_8: conv8,
      delta_relativo: Math.abs(conv16 - conv8) / conv16,
    },
    verificacion_montecarlo: verificacionCuadratura,
  },
  bloque4_v112: bloque4,
  supuestos_trazado: supuestosTrazadoNominal,
});
fs.writeFileSync(join(OUT_DIR, 'results.json'), JSON.stringify(result, null, 1));

// ---------------------------------------------------------------------------------
const R = result;
const fmt = v => (v === null || v === undefined ? '—' : (typeof v === 'number' ? v.toFixed(4) : String(v)));
const col = (grid, ojo, extra) => grid.filter(c => c.ojo === ojo && c.sigma_medida_mm === 0.10 && extra(c));
const md = [
  '# exp015 — Pipeline EQ (V1.11): H_EQ a través del pipeline físico real',
  '',
  `**${CONFIG.etiqueta}** · commit \`${R.commit.slice(0, 10)}\``,
  '',
  `**Hipótesis declarada:** ${CONFIG.hipotesis}. Nada de esto la valida biológicamente.`,
  'La conversión posición→resultado de exp006 (linealización paraxial de lente delgada) se',
  'sustituye por el pipeline físico y cada divergencia se atribuye a su causa. Convenciones:',
  'refracción SOLO intra-paraxial; entre motores, POTENCIA CONTINUA con la misma factory.',
  '',
  '## Autotest de la cuadratura',
  '',
  `- ${R.autotest_cuadratura.funcion}: cuadratura ${fmt(R.autotest_cuadratura.cuadratura)} vs forma cerrada `
    + `${fmt(R.autotest_cuadratura.forma_cerrada)} (desviación ${(100 * R.autotest_cuadratura.desviacion_relativa).toFixed(3)} %)`,
  '',
  '## 0 · Anclas vivas de exp006 (leídas de lo publicado; exp006 NO se regenera)',
  '',
  '| σ (mm) | brazo | E\\|ε\\| publicado | forma cerrada σ√(2/π) | desviación |',
  '|---|---|---|---|---|',
  ...R.bloque0_anclas_exp006.err_pos_vs_forma_cerrada.map(e =>
    `| ${e.sigma_mm} | ${e.brazo} | ${e.publicado_mm} | ${e.forma_cerrada_mm} | ${(100 * e.desviacion_relativa).toFixed(1)} % |`),
  '',
  `- ${R.bloque0_anclas_exp006.nota_desviaciones}`,
  `- **Divergencia de texto registrada:** ${R.bloque0_anclas_exp006.inconsistencia_prosa_exp006.texto_publicado} `
    + `↔ ${R.bloque0_anclas_exp006.inconsistencia_prosa_exp006.celdas_publicadas}. `
    + R.bloque0_anclas_exp006.inconsistencia_prosa_exp006.tratamiento,
  '',
  '## 1 · Reproducción bit a bit (posición vía predictor de CAPA B)',
  '',
  `- celdas idénticas a lo publicado: **${R.bloque1_reproduccion.celdas_identicas}**`
    + (R.bloque1_reproduccion.primera_divergencia ? ' · **HAY DIVERGENCIA** (ver results.json)' : ''),
  `- nueva procedencia: \`${R.bloque1_reproduccion.position_source_nuevo}\` (inputs: ${R.bloque1_reproduccion.inputs_used.join(', ')})`,
  `- ${R.bloque1_reproduccion.lectura}`,
  '',
  '## 2 · Escalera de causas (un cambio por peldaño)',
  '',
  '| Ojo | sens delgada (D/mm) | sens gruesa (D/mm) | dP*/dδ gruesa (D/mm) | dP*/dδ trazada (D/mm) | divergencia motor (D/mm) |',
  '|---|---|---|---|---|---|',
  ...R.bloque2_escalera.map(e =>
    `| ${e.ojo} | ${fmt(e.dominio_refraccion.sens_delgada_d_mm)} | ${fmt(e.dominio_refraccion.sens_gruesa_d_mm)} | `
    + `${fmt(e.dominio_potencia.sens_P_gruesa_d_mm)} | ${fmt(e.dominio_potencia.sens_P_trazada_d_mm)} | `
    + `${fmt(e.dominio_potencia.divergencia_motor_sens_d_mm)} |`),
  '',
  '- La descomposición es un CAMINO (telescópica): delgada→gruesa exige el paraxial y',
  '  gruesa→trazado exige geometría; el orden inverso no es evaluable (no existe trazado',
  '  de lente sin geometría) y por eso no hay bloque de aditividad entre órdenes.',
  '- Las columnas de refracción y de potencia son DOMINIOS distintos: no se restan entre sí.',
  `- Puente declarado (solo lectura): dRef/dP delgada ≈ ${fmt(R.bloque2_escalera[1].puente_declarado.dRef_dP_delgada)} D/D en el ojo normal.`,
  '',
  '## 3 · Matriz de beneficio re-evaluada (columna σ_medida = 0.10 mm)',
  '',
  '### Dominio refracción (paraxial): linealización y modelo de lente',
  '',
  '| Ojo | σ_bio | exp006 publicado (D) | delgada re-evaluada (D) | gruesa re-evaluada (D) | canal linealización (D) | canal lente (D) |',
  '|---|---|---|---|---|---|---|',
  ...['corto', 'normal', 'largo'].flatMap(ojo =>
    col(R.bloque3_beneficio.dominio_refraccion_paraxial, ojo, () => true).map(c =>
      `| ${c.ojo} | ${c.sigma_bio_mm} | ${fmt(c.beneficio_publicado_exp006_d)} | ${fmt(c.beneficio_delgada_reevaluada_d)} | `
      + `${fmt(c.beneficio_gruesa_reevaluada_d)} | ${fmt(c.canal_linealizacion_d)} | ${fmt(c.canal_modelo_lente_d)} |`)),
  '',
  '### Dominio potencia continua (cruce de motores, misma factory)',
  '',
  '| Ojo | σ_bio | beneficio P gruesa (D) | beneficio P trazada (D) | canal motor óptico (D) |',
  '|---|---|---|---|---|',
  ...['corto', 'normal', 'largo'].flatMap(ojo =>
    col(R.bloque3_beneficio.dominio_potencia_cruzado, ojo, () => true).map(c =>
      `| ${c.ojo} | ${c.sigma_bio_mm} | ${fmt(c.beneficio_P_gruesa_d)} | ${fmt(c.beneficio_P_trazada_d)} | ${fmt(c.canal_motor_optico_d)} |`)),
  '',
  `- **Ancla de refutación** — diagonal σ_m = σ_bio = 0.2: beneficio ≡ 0 por construcción `
    + `(misma integral en ambos brazos): **${R.bloque3_beneficio.diagonal_cero_por_construccion ? 'VERIFICADO' : 'FALLA'}** `
    + '(el 0 de exp006 también era por construcción: extracciones emparejadas).',
  `- Convergencia de la cuadratura (celda trazada, σ 0.3): 16 vs 8 intervalos → delta relativo `
    + `${(100 * R.bloque3_beneficio.convergencia_cuadratura.delta_relativo).toFixed(4)} %.`,
  `- Verificación Monte Carlo del método (${R.bloque3_beneficio.verificacion_montecarlo.celda}): `
    + `cuadratura ${fmt(R.bloque3_beneficio.verificacion_montecarlo.cuadratura_d)} vs MC `
    + `${fmt(R.bloque3_beneficio.verificacion_montecarlo.montecarlo_n20000_d)} `
    + `(desviación ${(100 * R.bloque3_beneficio.verificacion_montecarlo.desviacion_relativa).toFixed(2)} %). `
    + R.bloque3_beneficio.verificacion_montecarlo.nota,
  '',
  '## 4 · Integración V1.12: la hipótesis con incertidumbre auditable',
  '',
  `- outcome con ${R.bloque4_v112.outcome.predictor} (inputs ${R.bloque4_v112.outcome.predictor_inputs.join(', ')}): `
    + `sd ${fmt(R.bloque4_v112.outcome.sd_d)} D · ratio MC/lineal ${fmt(R.bloque4_v112.outcome.ratio_mc_sobre_lineal)} · `
    + `ancla nominal exacta: ${R.bloque4_v112.outcome.ancla_nominal_exacta}`,
  `- derivadas (D/unidad): ${Object.entries(R.bloque4_v112.outcome.derivadas_d_por_unidad).map(([k, v]) => `${k} ${fmt(v)}`).join(' · ')}`,
  `- σ_LT con un predictor que NO consume lt_mm: **${R.bloque4_v112.inercia_lt_publicada.rechazada ? 'RECHAZADA por inercia (correcto)' : 'FALLO: aceptada'}**`
    + (R.bloque4_v112.inercia_lt_publicada.mensaje ? ` — \`${R.bloque4_v112.inercia_lt_publicada.mensaje}\`` : ''),
  `- ${R.bloque4_v112.lectura}`,
  '',
  '## Lo que este experimento NO demuestra',
  '',
  '- **NO valida H_EQ**: sigue siendo hipótesis declarada; decidirla exige cohorte con EQ',
  '  preoperatorio (OCT) y posición de LIO medida postoperatoria (nivel 3).',
  '- **NO mide beneficio clínico real** de medir el ecuador: toda cifra es condicional a',
  '  H_EQ y a σ_bio/σ_m DECLARADAS (OQ #6), con lente sustituta (OQ #4) y ojos sintéticos.',
  '- **NO consume** lens_eq_plane_mm/ata_mm/sts_mm: siguen reservados (bloqueo externo,',
  '  OQ #2+#3); la cadena se cierra calculando el ecuador, no leyéndolo.',
  '- **NO re-elige la potencia por extracción**: mantiene la estructura de exp006 (respuesta',
  '  alrededor de posGeom); la inestabilidad de la elección es OTRA pregunta (V1.12,',
  '  raytraceChoiceStability).',
  '- **NO convierte entre convenciones**: la divergencia de motor vive solo en el dominio',
  '  de potencia; el puente dRef/dP es informativo, no un conversor de resultados.',
  '- **NO decide criterio de foco ni política corneal** (OQ #7/#8): el trazado usa el',
  '  objetivo C y los supuestos registrados viajan en `supuestos_trazado`.',
  '- Las magnitudes por canal dependen de la GenericIOLFactory (sustituto declarado):',
  '  con geometría real de fabricante pueden cambiar.',
].join('\n');
fs.writeFileSync(join(OUT_DIR, 'README.md'), md + '\n');
console.log(md);
