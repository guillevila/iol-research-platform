/**
 * V1.12 — incertidumbre sobre trazado: las condiciones no negociables, una a una.
 *
 *  - ninguna sigma sin procedencia explícita (sd + tipo + provenance);
 *  - variables INERTES prohibidas POR EJECUCIÓN (sonda determinista);
 *  - causalidad: las medidas fluyen POR el predictor de posición;
 *  - resultado-con-LIO-fija ≠ inestabilidad-de-la-elección (dos preguntas);
 *  - tórico no soportado jamás como cero físico;
 *  - independencia/correlación declaradas (Cholesky, no-PSD rechazada);
 *  - seed + intentados/válidos/rechazados + motivos viajan al resultado;
 *  - convergencia numérica + ancla nominal exacta + ancla lineal;
 *  - todo etiquetado SIMULACIÓN mientras las sigmas sean declaradas (OQ #6).
 *
 * RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  raytraceOutcomeUncertainty, raytraceChoiceStability, SigmaTipo,
} from '../src/uncertainty/raytrace_uncertainty.mjs';
import { createPreopEye } from '../src/core/eye.mjs';
import { GenericIOLFactory, SyntheticToricIOLFactory } from '../src/core/iol_factory.mjs';
import { ConstantOffsetPredictor, FractionOfALPredictor } from '../src/predictors/iol_position.mjs';
import { SamplingKind } from '../src/optics/raytrace/bundle.mjs';
import { ObjectiveKind } from '../src/optics/objective.mjs';

const ojo = (extra = {}) => createPreopEye({
  al_mm: 23.5, k1_d: 43.5, k1_axis_deg: 180, k2_d: 43.5, k2_axis_deg: 90,
  acd_mm: 3.2, lt_mm: 4.5, cct_um: 550, keratometric_index: 1.3375,
  meta: { source: 'synthetic' }, ...extra,
});
const PROV = 'escenario declarado de test (OQ #6): no es repetibilidad real';
const sigma = (sd, tipo = SigmaTipo.DECLARADA) => ({ sd, tipo, provenance: PROV });
const base = (extra = {}) => ({
  preop: ojo(),
  iol: new GenericIOLFactory().create({ power_d: 21 }),
  predictor: new ConstantOffsetPredictor(1.7),
  sigmas: { al_mm: sigma(0.03), position_prediction_mm: sigma(0.3) },
  n: 60, seed: 7, pupil_mm: 3.0,
  sampling: { kind: SamplingKind.MERIDIONAL, n_anillos: 4 },
  ...extra,
});

test('incertidumbre · ninguna sigma sin procedencia: sd suelto, sin tipo o sin provenance = rechazo', () => {
  assert.throws(() => raytraceOutcomeUncertainty(base({ sigmas: { al_mm: 0.03 } })), /sd ≥ 0, tipo, provenance/);
  assert.throws(() => raytraceOutcomeUncertainty(base({
    sigmas: { al_mm: { sd: 0.03, provenance: PROV } },
  })), /tipo obligatorio/);
  assert.throws(() => raytraceOutcomeUncertainty(base({
    sigmas: { al_mm: { sd: 0.03, tipo: SigmaTipo.DECLARADA, provenance: 'corta' } },
  })), /provenance obligatoria/);
  assert.throws(() => raytraceOutcomeUncertainty(base({ sigmas: {} })), /obligatorio y no vacío/);
  assert.throws(() => raytraceOutcomeUncertainty(base({
    sigmas: { al_mm: sigma(0), position_prediction_mm: sigma(0) },
  })), /todas las sigmas son 0/);
  assert.throws(() => raytraceOutcomeUncertainty(base({
    sigmas: { lt_mm: sigma(0.1) },
  })), /variables desconocidas: lt_mm/);
});

test('incertidumbre · variable INERTE rechazada POR EJECUCIÓN (no por tabla)', () => {
  // K con radios medidos (triple completo → política MEASURED): perturbar K no cambia nada
  const conRadios = ojo({ cornea: { r_anterior_mm: 7.7, r_posterior_mm: 6.8 } });
  assert.throws(() => raytraceOutcomeUncertainty(base({
    preop: conRadios, sigmas: { k_d: sigma(0.1) },
  })), /VARIABLE INERTE/);
  // CCT con córnea de lectura (solo-K): la superficie equivalente no la consume
  assert.throws(() => raytraceOutcomeUncertainty(base({
    sigmas: { cct_um: sigma(10) },
  })), /VARIABLE INERTE/);
  // ACD con un predictor que NO la consume (FractionOfAL) y óptica que tampoco
  assert.throws(() => raytraceOutcomeUncertainty(base({
    predictor: new FractionOfALPredictor(0.2),
    sigmas: { acd_mm: sigma(0.2) },
  })), /VARIABLE INERTE/);
  // las mismas sigmas en configuraciones que SÍ las consumen: pasan
  const ok = raytraceOutcomeUncertainty(base({ sigmas: { k_d: sigma(0.1) } }));
  assert.ok(ok.distribucion.sd_d > 0);
});

test('incertidumbre · CAUSALIDAD: la ACD fluye POR el predictor y mueve el resultado', () => {
  // ConstantOffset consume acd_mm: perturbarla mueve la posición y por tanto el residual
  const r = raytraceOutcomeUncertainty(base({ sigmas: { acd_mm: sigma(0.15) } }));
  assert.ok(r.distribucion.sd_d > 0.05, `la ACD debía propagar dispersión: sd=${r.distribucion.sd_d}`);
  assert.deepEqual(r.parametros_declarados.predictor_inputs, ['acd_mm']);
  // y la descomposición contra el doble conteo viaja en la salida
  assert.match(r.descomposicion_posicion, /doble conteo/);
  assert.match(r.descomposicion_posicion, /position_prediction_mm/);
});

test('incertidumbre · anclas: la extracción cero reproduce el nominal EXACTAMENTE y la sd ≈ lineal', () => {
  const r = raytraceOutcomeUncertainty(base({
    sigmas: { al_mm: sigma(0.02), position_prediction_mm: sigma(0.1) },
    n: 400, seed: 11,
  }));
  assert.equal(r.ancla_nominal_exacta, true);
  // con sigmas pequeñas el MC debe aproximar la propagación lineal gᵀΣg
  assert.ok(r.ancla_lineal.sd_lineal_d > 0);
  assert.ok(Math.abs(r.ancla_lineal.ratio_mc_sobre_lineal - 1) < 0.15,
    `ratio MC/lineal ${r.ancla_lineal.ratio_mc_sobre_lineal}: fuera del régimen lineal esperado`);
  // las derivadas del ancla llevan las MISMAS claves que las sigmas
  assert.deepEqual(Object.keys(r.ancla_lineal.derivadas_d_por_unidad).sort(),
    ['al_mm', 'position_prediction_mm']);
});

test('incertidumbre · convergencia y contabilidad: cortes, seed y denominadores en la salida', () => {
  const r = raytraceOutcomeUncertainty(base({ n: 200, seed: 42 }));
  assert.equal(r.seed, 42);
  assert.equal(r.n_intentados, 200);
  assert.equal(r.n_validos + r.n_rechazados, r.n_intentados);
  assert.ok(r.convergencia.cortes.length >= 2);
  assert.ok(r.convergencia.cortes.at(-1).n === r.n_validos);
  assert.ok(Number.isFinite(r.convergencia.delta_sd_ultimo_corte_d));
  // determinismo: misma seed → salida idéntica
  const r2 = raytraceOutcomeUncertainty(base({ n: 200, seed: 42 }));
  assert.equal(r2.distribucion.sd_d, r.distribucion.sd_d);
  assert.equal(r2.distribucion.media_d, r.distribucion.media_d);
  // etiqueta de simulación siempre presente
  assert.match(r.etiqueta, /SIMULACION/);
  assert.equal(r.sigmas_declaradas.every(s => s.tipo === SigmaTipo.DECLARADA), true);
});

test('incertidumbre · correlaciones: independencia DECLARADA por defecto; matriz no-PSD rechazada; correlación con efecto', () => {
  const indep = raytraceOutcomeUncertainty(base({ n: 300, seed: 5 }));
  assert.match(indep.correlaciones, /INDEPENDENCIA asumida/);
  // matriz imposible (|rho| > 1 primero; luego no-PSD real con 3 variables)
  assert.throws(() => raytraceOutcomeUncertainty(base({
    correlacion: { matrix: { al_mm: { position_prediction_mm: 1.5 } }, provenance: PROV },
  })), /fuera de \[−1, 1\]/);
  assert.throws(() => raytraceOutcomeUncertainty(base({
    sigmas: { al_mm: sigma(0.03), acd_mm: sigma(0.1), position_prediction_mm: sigma(0.2) },
    correlacion: {
      matrix: {
        al_mm: { acd_mm: 0.9, position_prediction_mm: -0.9 },
        acd_mm: { position_prediction_mm: 0.9 },
      },
      provenance: PROV,
    },
  })), /no definida positiva/);
  // correlación legítima: cambia la varianza respecto de independencia, en la
  // dirección que las derivadas predicen (misma seed para comparar)
  const correl = raytraceOutcomeUncertainty(base({
    n: 300, seed: 5,
    correlacion: { matrix: { al_mm: { position_prediction_mm: 0.8 } }, provenance: PROV },
  }));
  assert.notEqual(correl.distribucion.sd_d, indep.distribucion.sd_d);
  const g = indep.ancla_lineal.derivadas_d_por_unidad;
  const mismoSigno = Math.sign(g.al_mm) === Math.sign(g.position_prediction_mm);
  // rho>0 con derivadas del mismo signo amplifica; con signos opuestos, cancela
  assert.equal(correl.distribucion.sd_d > indep.distribucion.sd_d, mismoSigno);
  // sin provenance, ninguna correlación existe
  assert.throws(() => raytraceOutcomeUncertainty(base({
    correlacion: { matrix: { al_mm: { position_prediction_mm: 0.5 } } },
  })), /correlacion.provenance obligatoria/);
});

test('incertidumbre · tórico: astigmático = UNSUPPORTED declarado; LIO tórica = rechazo', () => {
  const r = raytraceOutcomeUncertainty(base({
    preop: ojo({ k1_d: 42, k2_d: 45 }),
  }));
  assert.deepEqual([...r.unsupported_dimensions], ['toric']);
  assert.match(r.nota_toric, /no es un cero físico/);
  // caso esférico: sin dimensión no soportada
  const esf = raytraceOutcomeUncertainty(base({ n: 30, seed: 3 }));
  assert.deepEqual([...esf.unsupported_dimensions], []);
  // LIO con geometría tórica: los objetivos escalares no la representan
  assert.throws(() => raytraceOutcomeUncertainty(base({
    iol: new SyntheticToricIOLFactory().create({ power_d: 21, cylinder_d: 3 }),
  })), /TÓRICA/);
});

test('incertidumbre · guardas de contrato: kwargs desconocidos, pupila sin declarar, objetivo A', () => {
  assert.throws(() => raytraceOutcomeUncertainty(base({ iol_position_mm: 4.9 })), /no soportados: iol_position_mm/);
  assert.throws(() => raytraceOutcomeUncertainty({ ...base(), pupil_mm: undefined }), /pupil_mm/);
  assert.throws(() => raytraceOutcomeUncertainty(base({ objective: ObjectiveKind.SPOT_RMS_AT_RETINA })),
    /unidades mezcladas|mm de spot/);
  assert.throws(() => raytraceOutcomeUncertainty(base({ seed: 1.5 })), /seed entera/);
});

test('elección · dos preguntas distintas: la estabilidad del escalón es discreta y viaja completa', () => {
  const r = raytraceChoiceStability({
    preop: ojo(),
    factory: new GenericIOLFactory(),
    predictor: new ConstantOffsetPredictor(1.7),
    sigmas: { al_mm: sigma(0.03), position_prediction_mm: sigma(0.25) },
    n: 120, seed: 9, pupil_mm: 3.0,
    sampling: { kind: SamplingKind.MERIDIONAL, n_anillos: 4 },
    catalog_d: Array.from({ length: 41 }, (_, i) => 11 + i * 0.5),
    window_d: 2.0, search_d: [5, 40],
  });
  assert.equal(r.n_intentados, 120);
  assert.equal(r.n_decididos + r.n_rechazados, 120);
  assert.ok(Number.isFinite(r.eleccion_nominal_d));
  // la distribución es DISCRETA sobre escalones y, con la categoría censurada
  // fuera_de_ventana, las fracciones suman 1 sobre el MISMO denominador
  const sumaFracciones = r.por_escalon.reduce((s, e) => s + e.fraccion, 0) + r.fuera_de_ventana.fraccion;
  assert.ok(Math.abs(sumaFracciones - 1) < 1e-12);
  assert.ok(r.fraccion_eleccion_nominal > 0.3, `elección nominal inestable de más: ${r.fraccion_eleccion_nominal}`);
  assert.match(r.nota, /DISCRETA/);
  assert.match(r.etiqueta, /SIMULACION/);
  // determinismo
  const r2 = raytraceChoiceStability({
    preop: ojo(), factory: new GenericIOLFactory(), predictor: new ConstantOffsetPredictor(1.7),
    sigmas: { al_mm: sigma(0.03), position_prediction_mm: sigma(0.25) },
    n: 120, seed: 9, pupil_mm: 3.0,
    sampling: { kind: SamplingKind.MERIDIONAL, n_anillos: 4 },
    catalog_d: Array.from({ length: 41 }, (_, i) => 11 + i * 0.5),
    window_d: 2.0, search_d: [5, 40],
  });
  assert.equal(r2.fraccion_eleccion_nominal, r.fraccion_eleccion_nominal);
});

test('elección · el borde de la ventana es CENSURA CONOCIDA: categoría visible, no rechazo que sesga', () => {
  // corrección conceptual de V1.12: descartar los draws que eligen el borde truncaría
  // precisamente las extracciones EXTREMAS y sesgaría las fracciones — el resultado
  // "salió de la ventana" es conocido y viaja como categoría en el MISMO denominador
  const r = raytraceChoiceStability({
    preop: ojo(),
    factory: new GenericIOLFactory(),
    predictor: new ConstantOffsetPredictor(1.7),
    sigmas: { position_prediction_mm: sigma(0.8) },
    n: 150, seed: 21, pupil_mm: 3.0,
    sampling: { kind: SamplingKind.MERIDIONAL, n_anillos: 4 },
    catalog_d: Array.from({ length: 41 }, (_, i) => 11 + i * 0.5),
    window_d: 1.0, search_d: [5, 40],
  });
  assert.ok(r.fuera_de_ventana.n > 0, 'esperaba elecciones censuradas fuera de la ventana');
  assert.match(r.fuera_de_ventana.nota, /CENSURADAS|truncaría/);
  // la censura NO desaparece del denominador: escalones + fuera = decididas
  const enEscalones = r.por_escalon.reduce((s, e) => s + e.veces, 0);
  assert.equal(enEscalones + r.fuera_de_ventana.n, r.n_decididos);
  // y ningún escalón PUBLICADO es un borde de la ventana (el borde no es un óptimo)
  const bordes = [r.ventana_evaluada_d[0], r.ventana_evaluada_d.at(-1)];
  assert.ok(r.por_escalon.every(e => !bordes.includes(e.power_d)));
});
