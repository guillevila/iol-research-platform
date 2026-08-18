/**
 * exp014 — Incertidumbre sobre trazado (V1.12): validación por REFUTACIÓN.
 *
 * SIMULACIÓN / NO GROUND TRUTH CLÍNICO · RESEARCH USE ONLY
 * Todas las sigmas son ESCENARIO DECLARADO (los valores de exp004; OQ #6): nada aquí
 * es repetibilidad real de dispositivo ni biología.
 *
 * Este experimento NO busca cifras llamativas: somete el sistema nuevo a las pruebas
 * que podrían romperlo —
 *  1. ANCLAS: la extracción cero reproduce el nominal EXACTAMENTE; con sigmas
 *     pequeñas la sd Monte Carlo debe coincidir con la propagación lineal gᵀΣg
 *     (ratio ≈ 1); con sigmas grandes la desviación se REPORTA como no-linealidad.
 *  2. CONVERGENCIA: sd y media a n crecientes, con su error estándar.
 *  3. ADITIVIDAD: cada sigma sola vs todas juntas — si sd_total² ≉ Σ sd_i², hay
 *     interacción y se publica (la cuadratura NO se asume).
 *  4. CAUSALIDAD MEDIBLE: la misma sigma de AL con dos predictores distintos produce
 *     dispersión distinta, porque con FractionOfAL la AL fluye por DOS caminos
 *     (óptica + predictor). La diferencia ES la causalidad funcionando.
 *  5. INERCIA COMO RESULTADO: sigma de ACD con un predictor que no la consume se
 *     RECHAZA (no desaparece en silencio) — el rechazo se publica.
 *  6. ELECCIÓN vs RESULTADO: el mismo escenario produce las dos respuestas por
 *     separado, incluida la censura fuera-de-ventana visible.
 *  7. CORRELACIÓN DECLARADA: rho(AL, ACD) = 0.5 como escenario — efecto medido
 *     frente a independencia, con el signo previsto por las derivadas.
 */
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createPreopEye } from '../src/core/eye.mjs';
import { GenericIOLFactory } from '../src/core/iol_factory.mjs';
import { ConstantOffsetPredictor, FractionOfALPredictor } from '../src/predictors/iol_position.mjs';
import { SamplingKind } from '../src/optics/raytrace/bundle.mjs';
import {
  raytraceOutcomeUncertainty, raytraceChoiceStability, SigmaTipo,
} from '../src/uncertainty/raytrace_uncertainty.mjs';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), 'exp014_incertidumbre_trazado');
fs.mkdirSync(OUT_DIR, { recursive: true });

const PROV = 'ESCENARIO DECLARADO (valores de exp004; OQ #6) — no es repetibilidad real';
const sig = sd => ({ sd, tipo: SigmaTipo.DECLARADA, provenance: PROV });

const CONFIG = {
  id: 'exp014_incertidumbre_trazado',
  etiqueta: 'SIMULACION / NO GROUND TRUTH CLINICO',
  proposito: 'validar por refutación el sistema de incertidumbre sobre trazado (V1.12): '
    + 'anclas, convergencia, aditividad, causalidad, inercia, elección vs resultado, correlación',
  ojo: { al_mm: 23.5, k_d: 43.5, acd_mm: 3.2, lt_mm: 4.5, cct_um: 550, n_k: 1.3375 },
  lente: 'GenericIOLFactory 21 D — SUSTITUTO DE SIMULACIÓN declarado (OQ #4)',
  sigmas_escenario: { al_mm: 0.03, acd_mm: 0.15, k_d: 0.10, position_prediction_mm: 0.30 },
  procedencia_sigmas: PROV,
  pupil_mm: 3.0,
  muestreo: { kind: SamplingKind.MERIDIONAL, n_anillos: 5 },
  n_outcome: 2000,
  n_choice: 600,
  seeds: { outcome: 20260818, choice: 20260819, convergencia: 20260820 },
};

const ojo = () => createPreopEye({
  al_mm: CONFIG.ojo.al_mm, k1_d: CONFIG.ojo.k_d, k1_axis_deg: 180,
  k2_d: CONFIG.ojo.k_d, k2_axis_deg: 90,
  acd_mm: CONFIG.ojo.acd_mm, lt_mm: CONFIG.ojo.lt_mm, cct_um: CONFIG.ojo.cct_um,
  keratometric_index: CONFIG.ojo.n_k, meta: { source: 'synthetic' },
});
const lente = new GenericIOLFactory().create({ power_d: 21 });
const predictorACD = new ConstantOffsetPredictor(1.7);
const predictorAL = new FractionOfALPredictor(0.2085);   // ≈ misma posición nominal (4.9 mm)
const baseArgs = {
  preop: ojo(), iol: lente, pupil_mm: CONFIG.pupil_mm,
  sampling: CONFIG.muestreo,
};

const S_TODAS = {
  al_mm: sig(CONFIG.sigmas_escenario.al_mm),
  acd_mm: sig(CONFIG.sigmas_escenario.acd_mm),
  k_d: sig(CONFIG.sigmas_escenario.k_d),
  position_prediction_mm: sig(CONFIG.sigmas_escenario.position_prediction_mm),
};

// ---------- 1 · resultado completo (todas las sigmas, predictor por ACD) ----------
const completo = raytraceOutcomeUncertainty({
  ...baseArgs, predictor: predictorACD, sigmas: S_TODAS,
  n: CONFIG.n_outcome, seed: CONFIG.seeds.outcome,
});

// ---------- 2 · convergencia a n crecientes (semillas fijas, independientes) ----------
const convergencia = [250, 500, 1000, 2000].map(n => {
  const r = raytraceOutcomeUncertainty({
    ...baseArgs, predictor: predictorACD, sigmas: S_TODAS, n, seed: CONFIG.seeds.convergencia,
  });
  return {
    n_intentados: n, n_validos: r.n_validos,
    sd_d: r.distribucion.sd_d, media_d: r.distribucion.media_d,
    se_media_d: r.distribucion.se_media_d,
  };
});

// ---------- 3 · aditividad: cada sigma sola vs todas juntas ----------
const porSigma = Object.fromEntries(Object.entries(S_TODAS).map(([k, v]) => {
  const r = raytraceOutcomeUncertainty({
    ...baseArgs, predictor: predictorACD, sigmas: { [k]: v },
    n: 1000, seed: CONFIG.seeds.outcome,
  });
  return [k, { sd_d: r.distribucion.sd_d, derivada: r.ancla_lineal.derivadas_d_por_unidad[k] }];
}));
const sdCuadratura = Math.sqrt(Object.values(porSigma).reduce((s, v) => s + v.sd_d ** 2, 0));

// ---------- 4 · causalidad: la MISMA sigma de AL con dos predictores ----------
const alSoloOptica = raytraceOutcomeUncertainty({
  ...baseArgs, predictor: predictorACD,                    // AL solo afecta a la óptica
  sigmas: { al_mm: sig(CONFIG.sigmas_escenario.al_mm) },
  n: 1000, seed: CONFIG.seeds.outcome,
});
const alDosCaminos = raytraceOutcomeUncertainty({
  ...baseArgs, predictor: predictorAL,                     // AL afecta óptica Y posición
  sigmas: { al_mm: sig(CONFIG.sigmas_escenario.al_mm) },
  n: 1000, seed: CONFIG.seeds.outcome,
});

// ---------- 5 · inercia como resultado publicado ----------
let inercia;
try {
  raytraceOutcomeUncertainty({
    ...baseArgs, predictor: predictorAL,                   // FractionOfAL NO consume ACD
    sigmas: { acd_mm: sig(CONFIG.sigmas_escenario.acd_mm) },
    n: 100, seed: 1,
  });
  inercia = { rechazada: false };
} catch (err) {
  inercia = { rechazada: true, mensaje: String(err.message).slice(0, 220) };
}

// ---------- 6 · elección vs resultado (mismo escenario) ----------
const eleccion = raytraceChoiceStability({
  preop: ojo(), factory: new GenericIOLFactory(), predictor: predictorACD,
  sigmas: S_TODAS, n: CONFIG.n_choice, seed: CONFIG.seeds.choice,
  pupil_mm: CONFIG.pupil_mm, sampling: CONFIG.muestreo,
  catalog_d: Array.from({ length: 61 }, (_, i) => 6 + i * 0.5),
  window_d: 2.5, search_d: [1, 44],
});

// ---------- 7 · correlación declarada como escenario ----------
const correlacionado = raytraceOutcomeUncertainty({
  ...baseArgs, predictor: predictorACD,
  sigmas: { al_mm: sig(CONFIG.sigmas_escenario.al_mm), acd_mm: sig(CONFIG.sigmas_escenario.acd_mm) },
  correlacion: {
    matrix: { al_mm: { acd_mm: 0.5 } },
    provenance: 'ESCENARIO DECLARADO: correlación biométrica plausible NO medida (OQ #6)',
  },
  n: 1000, seed: CONFIG.seeds.outcome,
});
const sinCorrelacion = raytraceOutcomeUncertainty({
  ...baseArgs, predictor: predictorACD,
  sigmas: { al_mm: sig(CONFIG.sigmas_escenario.al_mm), acd_mm: sig(CONFIG.sigmas_escenario.acd_mm) },
  n: 1000, seed: CONFIG.seeds.outcome,
});

const redondea = (o, n = 6) => JSON.parse(JSON.stringify(o, (k, v) =>
  typeof v === 'number' && Number.isFinite(v) && !Number.isInteger(v) ? +v.toFixed(n) : v));

const result = redondea({
  config: CONFIG,
  timestamp: new Date().toISOString(),
  commit: execSync('git rev-parse HEAD').toString().trim(),
  procedencia_commit: 'último commit AL GENERAR: la reproducibilidad la garantiza '
    + 'scripts/check_experiments.mjs, no este campo (hallazgo V1.3)',

  resultado_completo: {
    nominal_residual_d: completo.nominal.residual_d,
    ancla_nominal_exacta: completo.ancla_nominal_exacta,
    distribucion: completo.distribucion,
    n: { intentados: completo.n_intentados, validos: completo.n_validos, rechazados: completo.n_rechazados },
    motivos_rechazo: completo.motivos_rechazo,
    ancla_lineal: {
      sd_lineal_d: completo.ancla_lineal.sd_lineal_d,
      ratio_mc_sobre_lineal: completo.ancla_lineal.ratio_mc_sobre_lineal,
      derivadas: completo.ancla_lineal.derivadas_d_por_unidad,
    },
    sigmas: completo.sigmas_declaradas,
    correlaciones: completo.correlaciones,
    supuestos_trazado: completo.nominal.supuestos_trazado,
  },

  convergencia,

  aditividad: {
    por_sigma_sola: porSigma,
    sd_cuadratura_d: sdCuadratura,
    sd_conjunta_d: completo.distribucion.sd_d,
    ratio_conjunta_sobre_cuadratura: completo.distribucion.sd_d / sdCuadratura,
    lectura: 'ratio ≈ 1 ⇒ las contribuciones se combinan en cuadratura (interacciones '
      + 'despreciables en este escenario); un ratio ≠ 1 documentaría interacción, no un error',
  },

  causalidad: {
    al_solo_optica_sd_d: alSoloOptica.distribucion.sd_d,
    al_dos_caminos_sd_d: alDosCaminos.distribucion.sd_d,
    derivada_solo_optica: alSoloOptica.ancla_lineal.derivadas_d_por_unidad.al_mm,
    derivada_dos_caminos: alDosCaminos.ancla_lineal.derivadas_d_por_unidad.al_mm,
    lectura: 'la MISMA sigma de AL produce dispersión distinta según el predictor: con '
      + 'FractionOfAL la AL mueve TAMBIÉN la posición predicha (dos caminos causales). La '
      + 'diferencia es la causalidad medida→predictor→posición funcionando, no un artefacto.',
  },

  inercia_publicada: inercia,

  eleccion: {
    nominal_d: eleccion.eleccion_nominal_d,
    fraccion_eleccion_nominal: eleccion.fraccion_eleccion_nominal,
    escalon_modal_d: eleccion.escalon_modal_d,
    por_escalon: eleccion.por_escalon,
    fuera_de_ventana: eleccion.fuera_de_ventana,
    n: { intentados: eleccion.n_intentados, decididos: eleccion.n_decididos, rechazados: eleccion.n_rechazados },
    ventana_d: eleccion.ventana_evaluada_d,
    nota: eleccion.nota,
  },

  correlacion_declarada: {
    sd_independencia_d: sinCorrelacion.distribucion.sd_d,
    sd_con_rho_05_d: correlacionado.distribucion.sd_d,
    derivadas: sinCorrelacion.ancla_lineal.derivadas_d_por_unidad,
    lectura: 'con derivadas del mismo signo, rho > 0 amplifica la dispersión; el efecto '
      + 'observado debe seguir ese signo — y la correlación es un ESCENARIO DECLARADO, no un dato',
  },
});
fs.writeFileSync(join(OUT_DIR, 'results.json'), JSON.stringify(result, null, 2) + '\n');

const R = result;
const fmt = v => (v === null || v === undefined ? '—' : (typeof v === 'number' ? v.toFixed(4) : String(v)));
const md = [
  '# exp014 — Incertidumbre sobre trazado (V1.12): validación por refutación',
  '',
  `**${CONFIG.etiqueta}** · commit \`${R.commit.slice(0, 10)}\``,
  '',
  'Sigmas de **escenario declarado** (valores de exp004; OQ #6): nada es repetibilidad real.',
  'El experimento intenta ROMPER el sistema nuevo; cada bloque es una vía de refutación.',
  '',
  '## 1 · Anclas',
  '',
  `- extracción de perturbación cero ≡ nominal: **${R.resultado_completo.ancla_nominal_exacta ? 'EXACTA' : 'FALLA'}**`,
  `- sd Monte Carlo ${fmt(R.resultado_completo.distribucion.sd_d)} D vs lineal gᵀΣg `
    + `${fmt(R.resultado_completo.ancla_lineal.sd_lineal_d)} D → ratio `
    + `**${fmt(R.resultado_completo.ancla_lineal.ratio_mc_sobre_lineal)}**`,
  `- nominal: ${fmt(R.resultado_completo.nominal_residual_d)} D de desenfoque residual (LIO fija 21 D)`,
  '',
  '## 2 · Convergencia (misma semilla, n crecientes)',
  '',
  '| n intentados | n válidos | media (D) | sd (D) | SE media (D) |',
  '|---|---|---|---|---|',
  ...R.convergencia.map(c => `| ${c.n_intentados} | ${c.n_validos} | ${fmt(c.media_d)} | ${fmt(c.sd_d)} | ${fmt(c.se_media_d)} |`),
  '',
  '## 3 · Aditividad (¿cuadratura o interacción?)',
  '',
  '| Sigma sola | sd (D) | derivada (D/unidad) |',
  '|---|---|---|',
  ...Object.entries(R.aditividad.por_sigma_sola).map(([k, v]) => `| ${k} | ${fmt(v.sd_d)} | ${fmt(v.derivada)} |`),
  '',
  `- suma en cuadratura: ${fmt(R.aditividad.sd_cuadratura_d)} D · conjunta: `
    + `${fmt(R.aditividad.sd_conjunta_d)} D · ratio **${fmt(R.aditividad.ratio_conjunta_sobre_cuadratura)}**`,
  `- ${R.aditividad.lectura}`,
  '',
  '## 4 · Causalidad medida→predictor→posición',
  '',
  `| Escenario | sd (D) | dR/dAL (D/mm) |`,
  '|---|---|---|',
  `| σ_AL, predictor por ACD (AL solo afecta óptica) | ${fmt(R.causalidad.al_solo_optica_sd_d)} | ${fmt(R.causalidad.derivada_solo_optica)} |`,
  `| σ_AL, predictor por AL (dos caminos causales) | ${fmt(R.causalidad.al_dos_caminos_sd_d)} | ${fmt(R.causalidad.derivada_dos_caminos)} |`,
  '',
  R.causalidad.lectura,
  '',
  '## 5 · Inercia publicada (no silenciada)',
  '',
  R.inercia_publicada.rechazada
    ? `σ_ACD con FractionOfAL fue **RECHAZADA por inercia** (correcto): \`${R.inercia_publicada.mensaje}\``
    : '**FALLO**: una sigma inerte fue aceptada.',
  '',
  '## 6 · Elección vs resultado (mismo escenario, preguntas distintas)',
  '',
  `- elección nominal: ${R.eleccion.nominal_d} D · fracción que conserva la elección: `
    + `**${fmt(R.eleccion.fraccion_eleccion_nominal)}**`,
  `- distribución: ${R.eleccion.por_escalon.map(e => `${e.power_d} D → ${(100 * e.fraccion).toFixed(1)} %`).join(' · ')}`
    + ` · fuera de ventana: ${(100 * R.eleccion.fuera_de_ventana.fraccion).toFixed(1)} % (censura VISIBLE)`,
  `- denominadores: ${R.eleccion.n.decididos} decididas + ${R.eleccion.n.rechazados} rechazadas = `
    + `${R.eleccion.n.intentados} intentadas`,
  '',
  R.eleccion.nota,
  '',
  '## 7 · Correlación declarada (escenario, no dato)',
  '',
  `- independencia: sd ${fmt(R.correlacion_declarada.sd_independencia_d)} D · con ρ(AL, ACD) = 0.5: `
    + `sd ${fmt(R.correlacion_declarada.sd_con_rho_05_d)} D`,
  `- ${R.correlacion_declarada.lectura}`,
  '',
  '## Lo que este experimento NO demuestra',
  '',
  '- **Nada clínico**: las sigmas son escenario declarado (OQ #6), la lente un sustituto (OQ #4)',
  '  y el ojo sintético. Ningún intervalo de aquí es un intervalo real de paciente.',
  '- La dimensión tórica no está calculada (caso esférico a propósito); un caso astigmático',
  '  llevaría `unsupported_dimensions: [toric]`, jamás un cero físico.',
  '- La correlación del bloque 7 es un escenario para VERIFICAR la maquinaria, no una',
  '  afirmación sobre biometría real.',
].join('\n');
fs.writeFileSync(join(OUT_DIR, 'README.md'), md + '\n');
console.log(md);
