/**
 * Tests del modo de fidelidad (introducido con V1.2).
 *
 * LA ESTRATEGIA DE ESTOS TESTS ES DIFERENCIAL, y es lo que sostiene la garantía:
 * la puerta STRICT solo ve supuestos REGISTRADOS, así que su valor depende de que todo
 * supuesto lo esté. Aquí se construye un caso COMPLETO (que debe pasar STRICT) y se
 * degrada eje a eje — cada degradación conocida debe BLOQUEAR con el supuesto nombrado.
 * Si alguien introduce una sustitución nueva sin registrarla, no hay test genérico que
 * la cace: la disciplina es registrar, y la revisión adversarial la vigila.
 *
 * RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPreopEye, createPredictedPostopEye } from '../src/core/eye.mjs';
import { FidelityMode, DEFAULT_FIDELITY_MODE, StrictModeViolation, enforceStrictness } from '../src/core/fidelity.mjs';
import { GenericIOLFactory, ManufacturerIOLFactory } from '../src/core/iol_factory.mjs';
import { CorneaPolicy } from '../src/optics/cornea.mjs';
import { buildParaxialEye, buildRaytraceEye } from '../src/optics/eyebuilder.mjs';
import { searchBestPower } from '../src/optimize/power_search.mjs';
import { optimizePowerByRaytrace } from '../src/optimize/raytrace_power.mjs';
import { recommendToric } from '../src/toric/toric_engine.mjs';
import { monteCarloRefraction } from '../src/uncertainty/montecarlo.mjs';
import { createIOL, GeometryStatus, UNKNOWN, ASSUMED_SPHERICAL } from '../src/core/iol.mjs';

/** Ojo COMPLETO: radios corneales y CCT medidos → la política corneal no asume nada. */
function ojoCompleto() {
  return createPreopEye({
    al_mm: 23.5, k1_d: 43.5, k1_axis_deg: 180, k2_d: 43.5, k2_axis_deg: 90,
    acd_mm: 3.2, lt_mm: 4.5, cct_um: 550, keratometric_index: 1.3375,
    cornea: { r_anterior_mm: 7.7, r_posterior_mm: 6.8 },
    meta: { source: 'synthetic' },
  });
}
/** El mismo ojo SIN radios medidos: la córnea necesita una política con supuestos. */
function ojoSoloK() {
  return createPreopEye({
    al_mm: 23.5, k1_d: 43.5, k1_axis_deg: 180, k2_d: 43.5, k2_axis_deg: 90,
    acd_mm: 3.2, lt_mm: 4.5, cct_um: 550, keratometric_index: 1.3375,
    meta: { source: 'synthetic' },
  });
}
const postopDe = pre => createPredictedPostopEye(pre, { iol_position_mm: 4.9, position_source: 'test' });

const PROV = 'FICTICIA — fixture de test, no es una lente real ni una ficha técnica';
const MFR = new ManufacturerIOLFactory({
  manufacturer: 'ACME', model: 'M1', provenance: PROV,
  geometryByPower: { 20: { refractive_index: 1.47, central_thickness_mm: 0.7, r_anterior_mm: 20.0, r_posterior_mm: -20.0 } },
});

test('fidelity: el defecto es RESEARCH y no cambia ningún resultado existente', () => {
  assert.equal(DEFAULT_FIDELITY_MODE, FidelityMode.RESEARCH);
  const post = postopDe(ojoSoloK());
  const sinModo = searchBestPower({ postop: post, target_d: 0 });
  const explicito = searchBestPower({ postop: post, target_d: 0, fidelity: FidelityMode.RESEARCH });
  assert.equal(sinModo.best.power_d, explicito.best.power_d);
  assert.equal(sinModo.exact_power_d, explicito.exact_power_d);
  assert.equal(sinModo.fidelity, FidelityMode.RESEARCH);
});

test('fidelity: un modo inválido se rechaza en todas las entradas', () => {
  const post = postopDe(ojoCompleto());
  assert.throws(() => buildParaxialEye(post, { fidelity: 'MEDIO' }), /modo de fidelidad desconocido/);
  assert.throws(() => buildRaytraceEye(post, MFR.create({ power_d: 20 }), { fidelity: 'MEDIO' }),
    /modo de fidelidad desconocido/);
  assert.throws(() => searchBestPower({ postop: post, fidelity: 'MEDIO' }), /modo de fidelidad desconocido/);
  assert.throws(() => optimizePowerByRaytrace({ postop: post, pupil_mm: 3, fidelity: 'MEDIO' }),
    /modo de fidelidad desconocido/);
});

test('STRICT: un cálculo paraxial completamente medido PASA — y da lo mismo que RESEARCH', () => {
  // córnea física de dos superficies MEDIDA + lente de FABRICANTE: cero supuestos.
  // (La Q es UNKNOWN pero la potencia paraxial es exacta con la curvatura del vértice:
  //  no se sustituye ningún dato ópticamente relevante para ESTE cálculo.)
  const post = postopDe(ojoCompleto());
  const strict = buildParaxialEye(post, { fidelity: FidelityMode.STRICT });
  assert.equal(strict.fidelity, FidelityMode.STRICT);
  assert.deepEqual(strict.assumptions, []);
  assert.equal(strict.cornea_policy, CorneaPolicy.TWO_SURFACE_MEASURED);

  const research = buildParaxialEye(post);
  const lente = MFR.create({ power_d: 20 });
  assert.equal(strict.refractionForIOL(lente), research.refractionForIOL(lente),
    'STRICT no cambia la física: cambia qué cálculos son admisibles');
  assert.equal(strict.refractionForThinPower(20), research.refractionForThinPower(20));

  // y el optimizador paraxial entero pasa STRICT con este ojo
  const s = searchBestPower({ postop: post, target_d: 0, fidelity: FidelityMode.STRICT });
  assert.equal(s.fidelity, FidelityMode.STRICT);
  assert.deepEqual(s.supuestos_modelo, []);
  assert.equal(s.best.power_d, searchBestPower({ postop: post, target_d: 0 }).best.power_d);
});

test('STRICT degradación eje a eje: cada supuesto conocido BLOQUEA con su nombre', () => {
  const soloK = postopDe(ojoSoloK());
  const completo = postopDe(ojoCompleto());

  // 1) sin radios medidos, la política por defecto (lectura K) es un supuesto
  assert.throws(() => buildParaxialEye(soloK, { fidelity: FidelityMode.STRICT }),
    err => err instanceof StrictModeViolation
      && /cornea_policy:.*lectura del dispositivo COMO potencia/s.test(err.message));

  // 2) la política de radio recuperado también asume (posterior no modelada)
  assert.throws(() => buildParaxialEye(soloK, {
    fidelity: FidelityMode.STRICT, cornea: { policy: CorneaPolicy.SINGLE_SURFACE_FROM_RADIUS },
  }), /cornea_policy:.*posterior no se modela/s);

  // 3) el ratio posterior citado es un supuesto DECLARADO — admisible en RESEARCH,
  //    bloqueado en STRICT (es población aplicada a un individuo, no una medida)
  assert.throws(() => buildParaxialEye(soloK, {
    fidelity: FidelityMode.STRICT,
    cornea: { policy: CorneaPolicy.TWO_SURFACE_RATIO, posterior_ratio: 0.883, provenance: 'ratio de ojo esquemático clásico — pendiente de cita formal' },
  }), /cornea_policy:.*SUPUESTO declarado/s);

  // 4) una lente genérica es EN SÍ un supuesto: no representa la lente implantada
  const strictEye = buildParaxialEye(completo, { fidelity: FidelityMode.STRICT });
  assert.throws(() => strictEye.refractionForIOL(new GenericIOLFactory().create({ power_d: 20 })),
    err => err instanceof StrictModeViolation && /SUSTITUTO DE SIMULACIÓN/.test(err.message));
  // ...pero la misma llamada con lente de fabricante pasa
  assert.equal(typeof strictEye.refractionForIOL(MFR.create({ power_d: 20 })), 'number');
});

test('STRICT: hoy NINGÚN trazado de rayos pasa — y que lo diga es la funcionalidad', () => {
  // Incluso con córnea medida y lente de fabricante, quedan dos supuestos del trazador:
  // la asfericidad corneal no modelada y la Q de la LIO no documentada. Cuando existan
  // superficies cónicas (V1.2) y datos de Q, este test debe REVISARSE — su fallo será
  // la señal de que el primer trazado STRICT es posible.
  const post = postopDe(ojoCompleto());
  try {
    buildRaytraceEye(post, MFR.create({ power_d: 20 }), { fidelity: FidelityMode.STRICT });
    assert.fail('el trazado STRICT no debería ser posible todavía');
  } catch (err) {
    assert.ok(err instanceof StrictModeViolation);
    // el error enumera TODOS los supuestos, no solo el primero
    assert.ok(err.assumptions.some(a => /^cornea: superficies trazadas como esféricas/.test(a)));
    assert.ok(err.assumptions.some(a => /^iol_ant: asfericidad no documentada/.test(a)));
    assert.ok(err.assumptions.some(a => /^iol_post: asfericidad no documentada/.test(a)));
    assert.ok(err.message.includes('conseguir el dato'));
  }
  // en RESEARCH el mismo trazado se entrega, con los supuestos registrados
  const eye = buildRaytraceEye(post, MFR.create({ power_d: 20 }));
  assert.ok(eye.assumptions.length >= 3);
  assert.equal(eye.fidelity, FidelityMode.RESEARCH);
});

test('STRICT: el optimizador de trazado exige pupila explícita y hereda la puerta', () => {
  const post = postopDe(ojoCompleto());
  // sin pupila: en RESEARCH se usa el 3.0 declarado; en STRICT no hay defecto que valga
  const r = optimizePowerByRaytrace({ postop: post });
  assert.equal(r.parametros_declarados.pupil_mm, 3.0);
  assert.equal(r.parametros_declarados.fidelity, FidelityMode.RESEARCH);
  assert.throws(() => optimizePowerByRaytrace({ postop: post, fidelity: FidelityMode.STRICT }),
    err => err instanceof StrictModeViolation && /pupil_mm: pupila sin especificar/.test(err.message));
  // con pupila explícita, la puerta del trazador sigue bloqueando (supuestos del trazado):
  // con la fábrica genérica, la primera sonda de la búsqueda ya construye un ojo con
  // supuestos registrados (sustituto + córnea) y la puerta lo detiene
  assert.throws(() => optimizePowerByRaytrace({
    postop: post, pupil_mm: 3, fidelity: FidelityMode.STRICT,
  }), err => err instanceof StrictModeViolation && /SUSTITUTO DE SIMULACIÓN/.test(err.message));
});

test('fidelity: StrictModeViolation transporta contexto y supuestos, para clasificar exclusiones', () => {
  // una capa de validación futura debe poder responder "cuántos casos quedaron fuera y
  // POR QUÉ" sin parsear mensajes: el error lleva los supuestos como datos
  try {
    buildParaxialEye(postopDe(ojoSoloK()), { fidelity: FidelityMode.STRICT });
    assert.fail('debía bloquear');
  } catch (err) {
    assert.ok(err instanceof StrictModeViolation);
    assert.equal(err.name, 'StrictModeViolation');
    assert.equal(err.context, 'buildParaxialEye');
    assert.ok(Array.isArray(err.assumptions) && err.assumptions.length === 2);
    assert.ok(Object.isFrozen(err.assumptions));
  }
  // y la puerta es utilizable directamente por capas nuevas
  assert.deepEqual(enforceStrictness(FidelityMode.RESEARCH, ['x'], 'ctx'), ['x']);
  assert.deepEqual(enforceStrictness(FidelityMode.STRICT, [], 'ctx'), []);
  assert.throws(() => enforceStrictness(FidelityMode.STRICT, ['x'], 'ctx'), StrictModeViolation);
});

test('fidelity: RESEARCH no es licencia para callar — los supuestos siguen registrados', () => {
  // el modo por defecto sustituye, pero deja rastro en cada salida
  const post = postopDe(ojoSoloK());
  const eye = buildParaxialEye(post);
  assert.ok(eye.assumptions.length > 0, 'la política de lectura debe registrar sus supuestos');
  assert.ok(eye.assumptions.every(a => a.startsWith('cornea_policy: ')));
  const s = searchBestPower({ postop: post, target_d: 0 });
  assert.deepEqual(s.supuestos_modelo, eye.assumptions);
  const rt = optimizePowerByRaytrace({ postop: post, pupil_mm: 3 });
  assert.ok(rt.supuestos_trazado.some(a => /^cornea_policy:/.test(a)));
  assert.ok(rt.supuestos_trazado.some(a => /SUSTITUTO DE SIMULACIÓN/.test(a)));
});

// ---------------------------------------------------------------------------
// Ejes añadidos tras la caza adversarial de supuestos sin registrar
// ---------------------------------------------------------------------------

function ojoAstigmatico() {
  return createPreopEye({
    al_mm: 23.5, k1_d: 42.0, k1_axis_deg: 180, k2_d: 45.0, k2_axis_deg: 90,
    acd_mm: 3.2, lt_mm: 4.5, cct_um: 550, keratometric_index: 1.3375,
    cornea: { r_anterior_mm: 7.7, r_posterior_mm: 6.8 },
    meta: { source: 'synthetic' },
  });
}

test('STRICT: el astigmatismo queratométrico MEDIDO bloquea el cálculo de EE (caza adversarial)', () => {
  // el hallazgo original: un ojo con 3 D de cilindro medido pasaba STRICT con
  // supuestos_modelo=[] y recibía el mismo EE que uno esférico. Ahora el colapso a
  // equivalente esférico de un dato medido se registra — y en STRICT bloquea.
  const post = postopDe(ojoAstigmatico());
  assert.throws(() => buildParaxialEye(post, { fidelity: FidelityMode.STRICT }),
    err => err instanceof StrictModeViolation
      && /astigmatismo queratométrico medido \(3\.00 D\)/.test(err.message));
  // en RESEARCH se registra, no se calla
  const eye = buildParaxialEye(post);
  assert.ok(eye.assumptions.some(a => /astigmatismo queratométrico medido/.test(a)));
});

test('STRICT: la toricidad posterior MEDIDA pero no usada en el EE también bloquea', () => {
  const pre = createPreopEye({
    al_mm: 23.5, k1_d: 43.5, k1_axis_deg: 180, k2_d: 43.5, k2_axis_deg: 90,
    acd_mm: 3.2, lt_mm: 4.5, cct_um: 550, keratometric_index: 1.3375,
    cornea: { r_anterior_mm: 7.7, r_posterior_mm: 6.8, posterior_k1_d: -5.9, posterior_k2_d: -6.4, posterior_axis_deg: 90 },
    meta: { source: 'synthetic' },
  });
  assert.throws(() => buildParaxialEye(postopDe(pre), { fidelity: FidelityMode.STRICT }),
    /toricidad posterior MEDIDA no usada/);
});

test('fidelity: tilt/descentración/rotación DECLARADOS se rechazan, no se ignoran', () => {
  // el modelo aún no los representa; ignorar un valor declarado sería callar un dato
  // (mismo patrón que la Q documentada). null = no declarado: frontera documentada
  // (estado postoperatorio previsto), no bloquea.
  const pre = ojoCompleto();
  for (const campo of ['iol_tilt_deg', 'iol_decentration_mm', 'toric_rotation_deg']) {
    const post = createPredictedPostopEye(pre, {
      iol_position_mm: 4.9, position_source: 'test', [campo]: 3,
    });
    assert.throws(() => buildParaxialEye(post), new RegExp(campo));
    assert.throws(() => buildRaytraceEye(post, MFR.create({ power_d: 20 })), new RegExp(campo));
  }
  // 0 declarado = centrado declarado: pasa incluso en STRICT
  const centrado = createPredictedPostopEye(pre, {
    iol_position_mm: 4.9, position_source: 'test', iol_tilt_deg: 0, iol_decentration_mm: 0,
  });
  assert.deepEqual(buildParaxialEye(centrado, { fidelity: FidelityMode.STRICT }).assumptions, []);
});

test('STRICT: una lente ASIMÉTRICA posicionada por su centro geométrico bloquea (datum OQ #3)', () => {
  // medido por la revisión: para una asimétrica plausible el sesgo centro↔planos
  // principales es ~0.3 mm ≈ 0.4 D. La simétrica (planos ≡ centro) pasa.
  const asimetrica = new ManufacturerIOLFactory({
    manufacturer: 'ACME', model: 'ASIM', provenance: PROV,
    geometryByPower: { 20: { refractive_index: 1.47, central_thickness_mm: 0.9, r_anterior_mm: 11.0, r_posterior_mm: -80.0 } },
  }).create({ power_d: 20 });
  const eyeStrict = buildParaxialEye(postopDe(ojoCompleto()), { fidelity: FidelityMode.STRICT });
  assert.throws(() => eyeStrict.refractionForIOL(asimetrica),
    err => err instanceof StrictModeViolation && /CENTRO geométrico/.test(err.message));
  // en RESEARCH se registra PEREZOSAMENTE al evaluar, sin duplicar
  const eyeResearch = buildParaxialEye(postopDe(ojoCompleto()));
  eyeResearch.refractionForIOL(asimetrica);
  eyeResearch.refractionForIOL(asimetrica);
  assert.equal(eyeResearch.assumptions.filter(a => /CENTRO geométrico/.test(a)).length, 1);
  // y la evaluación de un sustituto también queda registrada en RESEARCH (asimetría
  // corregida respecto al trazador, que ya lo registraba)
  eyeResearch.refractionForIOL(new GenericIOLFactory().create({ power_d: 20 }));
  assert.ok(eyeResearch.assumptions.some(a => /SUSTITUTO DE SIMULACIÓN/.test(a)));
});

test('fidelity: cilindro de LIO — declarado ≠ 0 se rechaza en el trazador; UNKNOWN se registra', () => {
  const geom = { refractive_index: 1.47, central_thickness_mm: 0.7, r_anterior_mm: 20.0, r_posterior_mm: -20.0 };
  const post = postopDe(ojoCompleto());
  // declarado ≠ 0: no hay superficies tóricas → rechazar, no trazar la esfera callando
  const torica = createIOL({
    manufacturer: 'ACME', model: 'T1', nominal_power_d: 20, cylinder_d: 2.25,
    geometry: geom, geometry_status: GeometryStatus.MANUFACTURER, provenance: PROV,
  });
  assert.throws(() => buildRaytraceEye(post, torica), /cylinder_d=2\.25 D declarado/);
  // no documentado: UNKNOWN (ya no 0 en silencio) → trazada como esférica CON registro
  const sinCilindro = createIOL({
    manufacturer: 'ACME', model: 'T2', nominal_power_d: 20,
    geometry: geom, geometry_status: GeometryStatus.MANUFACTURER, provenance: PROV,
  });
  assert.equal(sinCilindro.cylinder_d, UNKNOWN);
  const eye = buildRaytraceEye(post, sinCilindro);
  assert.ok(eye.assumptions.some(a => /cilindro no documentado/.test(a)));
});

test('fidelity: ASSUMED_SPHERICAL sobre lente de FABRICANTE se registra (no atraviesa STRICT)', () => {
  // sin esto, cuando existan cónicas una lente real declarada "asumida esférica"
  // atravesaría STRICT llevando un supuesto declarado (hallazgo del revisor de docs)
  const conSupuesto = createIOL({
    manufacturer: 'ACME', model: 'S1', nominal_power_d: 20, cylinder_d: 0,
    geometry: {
      refractive_index: 1.47, central_thickness_mm: 0.7, r_anterior_mm: 20.0, r_posterior_mm: -20.0,
      asphericity_q_anterior: ASSUMED_SPHERICAL, asphericity_q_posterior: ASSUMED_SPHERICAL,
    },
    geometry_status: GeometryStatus.MANUFACTURER, provenance: PROV,
  });
  const eye = buildRaytraceEye(postopDe(ojoCompleto()), conSupuesto);
  assert.equal(eye.assumptions.filter(a => /esfericidad ASUMIDA por el modelador/.test(a)).length, 2);
});

test('fidelity: la vía tórica entra en la puerta (el bypass encontrado, cerrado)', () => {
  // ojo con TODO medido, incluida la córnea posterior tórica → la vía tórica no asume
  // nada y PASA STRICT
  const completoTorico = createPreopEye({
    al_mm: 23.5, k1_d: 42.0, k1_axis_deg: 180, k2_d: 45.0, k2_axis_deg: 90,
    acd_mm: 3.2, lt_mm: 4.5, cct_um: 550, keratometric_index: 1.3375,
    cornea: { r_anterior_mm: 7.7, r_posterior_mm: 6.8, posterior_k1_d: -5.9, posterior_k2_d: -6.4, posterior_axis_deg: 90 },
    meta: { source: 'synthetic' },
  });
  const rOk = recommendToric({
    postop: postopDe(completoTorico), sePower_d: 20, catalog_d: [1.5, 2.25, 3.0, 3.75],
    fidelity: FidelityMode.STRICT,
  });
  assert.equal(rOk.fidelity, FidelityMode.STRICT);
  assert.deepEqual(rOk.supuestos_modelo, []);
  assert.ok(rOk.tca.posterior_included);
  // sin posterior medida, o con política de lectura, bloquea con el supuesto nombrado
  assert.throws(() => recommendToric({
    postop: postopDe(ojoAstigmatico()), sePower_d: 20, catalog_d: [1.5, 2.25],
    fidelity: FidelityMode.STRICT,
  }), /córnea posterior NO medida/);
  assert.throws(() => recommendToric({
    postop: postopDe(ojoSoloK()), sePower_d: 20, catalog_d: [1.5, 2.25],
    fidelity: FidelityMode.STRICT,
  }), /cornea_policy/);
});

test('fidelity: Monte Carlo entra en la puerta y expone sus supuestos', () => {
  const pre = ojoSoloK();
  assert.throws(() => monteCarloRefraction({
    preop: pre, iol_position_mm: 4.9, power_d: 21, seed: 7, n: 50, fidelity: FidelityMode.STRICT,
  }), StrictModeViolation);
  const r = monteCarloRefraction({ preop: pre, iol_position_mm: 4.9, power_d: 21, seed: 7, n: 50 });
  assert.equal(r.fidelity, FidelityMode.RESEARCH);
  assert.ok(r.supuestos_modelo.length >= 2, 'la política de lectura debe aparecer en la salida MC');
});
