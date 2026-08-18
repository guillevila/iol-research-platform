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
  // lt_mm dejó de ser desconocida en V1.11 (predictor H_EQ la consume): la clave
  // fuera de vocabulario de este test pasa a ser wtw_mm
  assert.throws(() => raytraceOutcomeUncertainty(base({
    sigmas: { wtw_mm: sigma(0.1) },
  })), /variables desconocidas: wtw_mm/);
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

// ---------------------------------------------------------------------------------
// Regresiones de la REVISIÓN ADVERSARIAL V1.12.
// ---------------------------------------------------------------------------------

test('incertidumbre · adversarial: el ojo perturbado conserva TODOS los campos medidos', () => {
  // antes: preopPerturbado perdía 11 campos con delta CERO — un predictor legítimo
  // que consumiera wtw_mm reventaba y los supuestos publicados omitían la nota de
  // toricidad posterior medida (supuestos FALSOS del caso)
  const rico = ojo({
    wtw_mm: 11.8, pupil_mm: 4.0,
    cornea: { posterior_k1_d: -6.2, posterior_k2_d: -6.0, posterior_axis_deg: 90 },
  });
  const espia = {
    id: 'espia_wtw',
    predict(pre) {
      if (typeof pre.wtw_mm !== 'number') throw new RangeError('espia_wtw: falta wtw_mm');
      return { iol_position_mm: 3.0 + pre.wtw_mm * 0.16, source: 'espía', inputs_used: ['wtw_mm'] };
    },
  };
  const r = raytraceOutcomeUncertainty(base({ preop: rico, predictor: espia, n: 30, seed: 2 }));
  assert.ok(r.n_validos >= 15, 'el predictor por wtw debía funcionar: el campo viaja');
  // y los supuestos del nominal incluyen la nota de toricidad posterior medida
  assert.ok(r.nominal.supuestos_trazado.some(a => /toricidad posterior MEDIDA/.test(a)),
    `supuestos incompletos: ${JSON.stringify(r.nominal.supuestos_trazado)}`);
});

test('incertidumbre · adversarial: SUB-RESOLUCIÓN ≠ INERCIA, y la sonda nombra a la sonda', () => {
  // una sd diminuta sobre una variable CONSUMIDA ya no se acusa de inerte
  const dosSuperficies = ojo({ cornea: { r_anterior_mm: 7.7, r_posterior_mm: 6.4 } });
  assert.throws(() => raytraceOutcomeUncertainty(base({
    preop: dosSuperficies, sigmas: { cct_um: sigma(1e-6) },
  })), /SUB-RESOLUCIÓN/);
  // la variable genuinamente inerte sigue diciéndolo (K con radios medidos)
  assert.throws(() => raytraceOutcomeUncertainty(base({
    preop: dosSuperficies, sigmas: { k_d: sigma(0.1) },
  })), /VARIABLE INERTE/);
  // una sd que saca la SONDA de plausibilidad produce un error que NOMBRA la sonda y
  // la sigma, no un RangeError crudo sobre un valor que el usuario nunca introdujo
  assert.throws(() => raytraceOutcomeUncertainty(base({
    sigmas: { acd_mm: sigma(5) },
  })), /sonda de inercia de la sigma acd_mm/);
});

test('incertidumbre · adversarial: pupil_mm es perturbable DE VERDAD (ya no es un canal fantasma)', () => {
  const r = raytraceOutcomeUncertainty(base({
    sigmas: { pupil_mm: sigma(0.5) }, n: 200, seed: 13,
  }));
  assert.ok(r.distribucion.sd_d > 0, 'la variabilidad pupilar debía propagar dispersión');
  assert.ok(Number.isFinite(r.ancla_lineal.derivadas_d_por_unidad.pupil_mm));
});

test('incertidumbre · adversarial: la censura por plausibilidad se ADVIERTE, no se calla', () => {
  // sigma de AL enorme → algunos draws caen fuera del rango plausible del modelo
  const r = raytraceOutcomeUncertainty(base({
    sigmas: { al_mm: sigma(6) }, n: 400, seed: 3,
  }));
  assert.ok(r.n_rechazados > 0, 'esperaba rechazos por plausibilidad');
  assert.match(r.advertencia_censura, /CONDICIONADA.*sesgada A LA BAJA/s);
  assert.match(r.ancla_lineal.nota, /CENSURA/);
  // sin rechazos, la advertencia es null (no ruido)
  const limpio = raytraceOutcomeUncertainty(base({ n: 50, seed: 4 }));
  assert.equal(limpio.n_rechazados, 0);
  assert.equal(limpio.advertencia_censura, null);
  assert.ok(!/CENSURA/.test(limpio.ancla_lineal.nota));
});

test('incertidumbre · adversarial: pareo por semilla estable ante el ORDEN de declaración', () => {
  // las claves se ordenan canónicamente: declarar {al, pos} o {pos, al} da lo MISMO
  const a = raytraceOutcomeUncertainty(base({
    sigmas: { al_mm: sigma(0.03), position_prediction_mm: sigma(0.3) }, n: 80, seed: 6,
  }));
  const b = raytraceOutcomeUncertainty(base({
    sigmas: { position_prediction_mm: sigma(0.3), al_mm: sigma(0.03) }, n: 80, seed: 6,
  }));
  assert.equal(a.distribucion.media_d, b.distribucion.media_d);
  assert.equal(a.distribucion.sd_d, b.distribucion.sd_d);
});

test('incertidumbre · adversarial: el RNG local tiene varianza sana (el LCG del proyecto la inflaba 1-3%)', async () => {
  // verificación estadística del generador que usa ESTE módulo, vía su salida pública:
  // con una sola sigma y pipeline ~lineal, sd_MC/sd_lineal ≈ 1 con error ~1/sqrt(2n);
  // el LCG habría añadido +1.3–2.8 % sistemático encima
  const r = raytraceOutcomeUncertainty(base({
    sigmas: { position_prediction_mm: sigma(0.2) }, n: 4000, seed: 12345,
  }));
  const ratio = r.ancla_lineal.ratio_mc_sobre_lineal;
  assert.ok(Math.abs(ratio - 1) < 0.04, `ratio MC/lineal ${ratio}: fuera de lo esperable para un RNG sano`);
});

test('incertidumbre · adversarial: fuentes reales exigen cita sustancial, no etiqueta', () => {
  assert.throws(() => raytraceOutcomeUncertainty(base({
    sigmas: { al_mm: { sd: 0.03, tipo: SigmaTipo.FICHA_TECNICA, provenance: 'ficha IOLMaster' } },
  })), /cita sustancial/);
  // la convergencia declara su límite (cortes anidados, no réplicas)
  const r = raytraceOutcomeUncertainty(base({ n: 60, seed: 8 }));
  assert.match(r.convergencia.nota, /PREFIJOS ANIDADOS|no la\s+varianza entre réplicas/s);
});

test('incertidumbre · adversarial: la pupila MEDIDA del ojo se registra como no consumida', () => {
  // el trazado usa la pupila del ESCENARIO; si el ojo trae pupil_mm medida, la salida
  // lo dice (dato medido registrado, nunca callado — registro de reservados)
  const conMedida = raytraceOutcomeUncertainty(base({ preop: ojo({ pupil_mm: 4.5 }), n: 30, seed: 9 }));
  assert.equal(conMedida.pupila.escenario_mm, 3.0);
  assert.equal(conMedida.pupila.medida_preop_mm, 4.5);
  assert.match(conMedida.pupila.nota, /MEDIDA.*no.*consumid/s);
  const sinMedida = raytraceOutcomeUncertainty(base({ n: 30, seed: 9 }));
  assert.equal(sinMedida.pupila.medida_preop_mm, null);
});

test('incertidumbre · adversarial: sigma de pupila TAMBIÉN perturba el bucle de ELECCIÓN', () => {
  // la sonda de inercia corre sobre el pipeline de residual (que consume delta.pupil_mm);
  // si el bucle de elección la ignorase, la sigma pasaría la sonda y moriría en silencio
  const r = raytraceChoiceStability({
    preop: ojo(), factory: new GenericIOLFactory(), predictor: new ConstantOffsetPredictor(1.7),
    sigmas: { pupil_mm: sigma(0.5), position_prediction_mm: sigma(0.3) },
    n: 40, seed: 21, pupil_mm: 3.0,
    sampling: { kind: SamplingKind.MERIDIONAL, n_anillos: 4 },
    catalog_d: Array.from({ length: 21 }, (_, i) => 16 + i * 0.5),
    window_d: 2.0, search_d: [1, 44],
  });
  assert.ok(r.n_decididos + r.fuera_de_ventana.n + r.n_rechazados === r.n_intentados);
  assert.ok(r.n_decididos > 0);
  assert.equal(r.pupila.medida_preop_mm, null);
});
