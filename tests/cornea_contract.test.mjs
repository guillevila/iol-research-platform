/**
 * V1.5 — Contrato formal CorneaPolicy ↔ ray tracer.
 *
 * El trazador ya consumía las políticas (V1.2/V1.3): este fichero NO añade física —
 * VERIFICA el contrato, política a política:
 *
 *   1. paraxial y trazado consumen EXACTAMENTE la misma interpretación (el mismo modelo
 *      corneal, y las superficies construidas reproducen su potencia en forma cerrada);
 *   2. la política y su procedencia viajan en la salida de AMBAS vías;
 *   3. ninguna posterior se fabrica en silencio: READING/SINGLE no construyen posterior,
 *      RATIO la construye SOLO con ratio+procedencia citada y el supuesto registrado,
 *      MEASURED con medidas y registro vacío;
 *   4. STRICT es diferencial por política también en la vía de trazado;
 *   5. toda córnea física actual es ROTACIONALMENTE SIMÉTRICA — la córnea física
 *      astigmática NO existe hasta el tórico (plan V1.6) y el colapso a EE de un
 *      astigmatismo medido queda registrado en ambas vías.
 *
 * RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPreopEye, createPredictedPostopEye } from '../src/core/eye.mjs';
import { GenericIOLFactory, ManufacturerIOLFactory } from '../src/core/iol_factory.mjs';
import { CorneaPolicy, buildCorneaModel, singleSurfacePowerFromRadiusMm } from '../src/optics/cornea.mjs';
import { createIOLPose, PoseSource } from '../src/core/pose.mjs';
import { recommendToric } from '../src/toric/toric_engine.mjs';
import { corneaPowerTwoSurfaces } from '../src/optics/paraxial.mjs';
import { N_AIR, N_AQUEOUS } from '../src/optics/constants.mjs';
import { buildParaxialEye, buildRaytraceEye } from '../src/optics/eyebuilder.mjs';
import { FidelityMode, StrictModeViolation } from '../src/core/fidelity.mjs';
import { mmToM } from '../src/core/units.mjs';

function ojo({ radios = true, qCornea = false, astigmatico = false } = {}) {
  const k1 = astigmatico ? 42.0 : 43.5, k2 = astigmatico ? 45.0 : 43.5;
  return createPreopEye({
    al_mm: 23.5, k1_d: k1, k1_axis_deg: 180, k2_d: k2, k2_axis_deg: 90,
    acd_mm: 3.2, lt_mm: 4.5, cct_um: 550, keratometric_index: 1.3375,
    ...(radios ? {
      cornea: {
        r_anterior_mm: 7.7, r_posterior_mm: 6.8,
        ...(qCornea ? { asphericity_q_anterior: -0.18, asphericity_q_posterior: -0.30 } : {}),
      },
    } : {}),
    meta: { source: 'synthetic' },
  });
}
const postopDe = pre => createPredictedPostopEye(pre, { iol_position_mm: 4.9, position_source: 'test' });
const LENTE = new GenericIOLFactory().create({ power_d: 21 });
const RATIO_OPTS = {
  policy: CorneaPolicy.TWO_SURFACE_RATIO, posterior_ratio: 0.883,
  provenance: 'ratio de ojo esquemático clásico — pendiente de cita formal (OQ #1)',
};

/** Las cuatro políticas con las opciones mínimas para construirse sobre el ojo dado. */
const POLITICAS = [
  { policy: CorneaPolicy.KERATOMETRIC_READING, opts: { policy: CorneaPolicy.KERATOMETRIC_READING }, dosSuperficies: false },
  { policy: CorneaPolicy.SINGLE_SURFACE_FROM_RADIUS, opts: { policy: CorneaPolicy.SINGLE_SURFACE_FROM_RADIUS }, dosSuperficies: false },
  { policy: CorneaPolicy.TWO_SURFACE_RATIO, opts: RATIO_OPTS, dosSuperficies: true },
  { policy: CorneaPolicy.TWO_SURFACE_MEASURED, opts: { policy: CorneaPolicy.TWO_SURFACE_MEASURED }, dosSuperficies: true },
];

test('V1.5 · contrato 1: paraxial y trazado consumen EXACTAMENTE la misma interpretación', () => {
  for (const { policy, opts } of POLITICAS) {
    const post = postopDe(ojo());
    const par = buildParaxialEye(post, { cornea: opts });
    const rt = buildRaytraceEye(post, LENTE, { cornea: opts });
    // el MISMO modelo corneal, campo a campo. VALOR HONESTO de este assert (revisión
    // adversarial V1.5): ambas vías llaman hoy a corneaModelOf con los mismos
    // argumentos, así que esto NO verifica la física (eso lo hace el contrato 2, en
    // forma cerrada) — es un guard ANTI-DIVERGENCIA: falla si una vía deja de delegar
    // en corneaModelOf, pasa opciones distintas o muta el modelo tras construirlo.
    assert.deepEqual(rt.cornea, par.cornea, `${policy}: interpretaciones distintas entre vías`);
    assert.equal(par.cornea_policy, policy);
    assert.equal(rt.cornea_policy, policy);
  }
});

test('V1.5 · contrato 2: las superficies trazadas REPRODUCEN la potencia del modelo, en forma cerrada', () => {
  for (const { policy, opts, dosSuperficies } of POLITICAS) {
    const post = postopDe(ojo());
    const modelo = buildParaxialEye(post, { cornea: opts }).cornea;
    const rt = buildRaytraceEye(post, LENTE, { cornea: opts });
    const corneales = rt.surfaces.filter(s => /^cornea/.test(s.id));
    if (!dosSuperficies) {
      // UNA superficie equivalente cuyo radio realiza exactamente la potencia del modelo
      assert.equal(corneales.length, 1, `${policy}: debía haber una única superficie`);
      const p = (N_AQUEOUS - N_AIR) * 1000 / corneales[0].radius_mm;
      assert.ok(Math.abs(p - modelo.power_d) < 1e-12, `${policy}: ${p} vs modelo ${modelo.power_d}`);
    } else {
      // DOS superficies con los radios DEL MODELO y la potencia de lente gruesa cerrada
      assert.equal(corneales.length, 2, `${policy}: debía haber dos superficies`);
      const [ant, post_] = corneales;
      assert.equal(ant.radius_mm, modelo.r_anterior_mm);
      assert.equal(post_.radius_mm, modelo.r_posterior_mm);
      assert.equal(post_.zVertex_mm, 0.55, 'la posterior debe estar a CCT del ápex');
      const { power_d } = corneaPowerTwoSurfaces({
        r_anterior_m: mmToM(ant.radius_mm), r_posterior_m: mmToM(post_.radius_mm), cct_m: 550 / 1e6,
      });
      assert.ok(Math.abs(power_d - modelo.power_d) < 1e-12,
        `${policy}: potencia trazada ${power_d} vs modelo ${modelo.power_d}`);
    }
  }
});

test('V1.5 · contrato 3: política y PROCEDENCIA viajan en la salida de ambas vías', () => {
  for (const { policy, opts } of POLITICAS) {
    const post = postopDe(ojo());
    for (const eye of [buildParaxialEye(post, { cornea: opts }), buildRaytraceEye(post, LENTE, { cornea: opts })]) {
      assert.equal(eye.cornea.policy, policy);
      assert.equal(typeof eye.cornea.provenance, 'string', `${policy}: sin procedencia`);
      assert.ok(eye.cornea.provenance.length > 5);
      assert.equal(typeof eye.cornea.invariant_to_device_index, 'boolean');
      assert.equal(eye.cornea.rotationally_symmetric, true,
        `${policy}: toda córnea física actual es rotacionalmente simétrica`);
    }
  }
  // la procedencia del RATIO es la citada por el llamante, literal
  const conRatio = buildRaytraceEye(postopDe(ojo()), LENTE, { cornea: RATIO_OPTS });
  assert.equal(conRatio.cornea.provenance, RATIO_OPTS.provenance);
});

test('V1.5 · contrato 4: ninguna posterior se fabrica en silencio', () => {
  const post = postopDe(ojo());
  // READING y SINGLE: cero superficies posteriores, aunque el ojo TENGA radios medidos
  for (const policy of [CorneaPolicy.KERATOMETRIC_READING, CorneaPolicy.SINGLE_SURFACE_FROM_RADIUS]) {
    const rt = buildRaytraceEye(post, LENTE, { cornea: { policy } });
    assert.equal(rt.surfaces.filter(s => s.id === 'cornea_post').length, 0,
      `${policy}: fabricó una posterior`);
  }
  // RATIO: la posterior existe pero SOLO con ratio+procedencia, y el supuesto registrado
  const conRatio = buildRaytraceEye(post, LENTE, { cornea: RATIO_OPTS });
  assert.equal(conRatio.surfaces.filter(s => s.id === 'cornea_post').length, 1);
  assert.ok(conRatio.assumptions.some(a => /cornea_policy:.*SUPUESTO declarado/.test(a)),
    'la posterior asumida debe llevar su supuesto registrado');
  // MEASURED: posterior de MEDIDA, sin supuestos de política
  const medida = buildRaytraceEye(post, LENTE, { cornea: { policy: CorneaPolicy.TWO_SURFACE_MEASURED } });
  assert.equal(medida.surfaces.filter(s => s.id === 'cornea_post').length, 1);
  assert.equal(medida.assumptions.filter(a => /^cornea_policy:/.test(a)).length, 0);
  // y elegir READING EXPLÍCITAMENTE con radios medidos deja registrado el dato no usado
  const lecturaConRadios = buildParaxialEye(post, { cornea: { policy: CorneaPolicy.KERATOMETRIC_READING } });
  assert.ok(lecturaConRadios.assumptions.some(a => /radios corneales MEDIDOS no usados/.test(a)));
});

test('V1.5 · contrato 5: STRICT diferencial por política EN LA VÍA DE TRAZADO', () => {
  const preQ = ojo({ qCornea: true });
  const post = postopDe(preQ);
  const lenteQ = new ManufacturerIOLFactory({
    manufacturer: 'ACME', model: 'MQ', provenance: 'FICTICIA — fixture de test, no es una ficha real',
    geometryByPower: { 20: { refractive_index: 1.47, central_thickness_mm: 0.7, r_anterior_mm: 20, r_posterior_mm: -20, asphericity_q_anterior: -0.1, asphericity_q_posterior: -0.1 } },
  }).create({ power_d: 20 });
  // MEASURED con todo documentado: PASA
  const ok = buildRaytraceEye(post, lenteQ, {
    cornea: { policy: CorneaPolicy.TWO_SURFACE_MEASURED }, fidelity: FidelityMode.STRICT,
  });
  assert.deepEqual(ok.assumptions, []);
  // cada política con supuestos BLOQUEA nombrando el suyo
  const casos = [
    [{ policy: CorneaPolicy.KERATOMETRIC_READING }, /lectura del dispositivo COMO potencia/],
    [{ policy: CorneaPolicy.SINGLE_SURFACE_FROM_RADIUS }, /posterior no se modela/],
    [RATIO_OPTS, /SUPUESTO declarado/],
  ];
  for (const [opts, re] of casos) {
    assert.throws(() => buildRaytraceEye(post, lenteQ, { cornea: opts, fidelity: FidelityMode.STRICT }),
      err => err instanceof StrictModeViolation && re.test(err.message),
      `${opts.policy} debía bloquear STRICT en el trazador`);
  }
});

test('V1.5 · simetría rotacional: el astigmatismo medido se colapsa CON registro en ambas vías', () => {
  // la córnea física ASTIGMÁTICA (radios por meridiano, eje) no existe hasta el tórico:
  // ninguna política produce superficies por meridiano, y el colapso queda registrado
  const post = postopDe(ojo({ astigmatico: true }));
  const par = buildParaxialEye(post, { cornea: { policy: CorneaPolicy.TWO_SURFACE_MEASURED } });
  const rt = buildRaytraceEye(post, LENTE, { cornea: { policy: CorneaPolicy.TWO_SURFACE_MEASURED } });
  for (const eye of [par, rt]) {
    assert.ok(eye.assumptions.some(a => /astigmatismo queratométrico medido \(3\.00 D\)/.test(a)),
      'el colapso a EE de un cilindro medido debe registrarse');
    assert.equal(eye.cornea.rotationally_symmetric, true);
  }
  // exactamente dos superficies corneales (media), jamás cuatro (por meridiano)
  assert.equal(rt.surfaces.filter(s => /^cornea/.test(s.id)).length, 2);
  // y en STRICT ese colapso bloquea: no se valida un EE que ignora un cilindro medido
  assert.throws(() => buildRaytraceEye(post, LENTE, {
    cornea: { policy: CorneaPolicy.TWO_SURFACE_MEASURED }, fidelity: FidelityMode.STRICT,
  }), /astigmatismo queratométrico medido/);
});

// ---------------------------------------------------------------------------------
// Regresiones de la REVISIÓN ADVERSARIAL V1.5: medidas corneales PARCIALES.
// La detección todo-o-nada sobre el triple (r_ant + r_post + CCT) dejaba las medidas
// parciales fuera del uso Y del registro — el patrón que el proyecto prohíbe.
// ---------------------------------------------------------------------------------

function ojoParcial({ r_ant = null, r_post = null, cct = null, qs = false } = {}) {
  return createPreopEye({
    al_mm: 23.5, k1_d: 43.5, k1_axis_deg: 180, k2_d: 43.5, k2_axis_deg: 90,
    acd_mm: 3.2, lt_mm: 4.5, keratometric_index: 1.3375,
    ...(cct !== null ? { cct_um: cct } : {}),
    cornea: {
      ...(r_ant !== null ? { r_anterior_mm: r_ant } : {}),
      ...(r_post !== null ? { r_posterior_mm: r_post } : {}),
      ...(qs ? { asphericity_q_anterior: -0.18, asphericity_q_posterior: -0.30 } : {}),
    },
    meta: { source: 'synthetic' },
  });
}

test('V1.5 · adversarial: radios medidos SIN CCT — el descarte se REGISTRA, no se calla', () => {
  // antes: caída silenciosa a LECTURA con r_anterior re-fabricado desde K (7.7586 pisando 7.7)
  const par = buildParaxialEye(postopDe(ojoParcial({ r_ant: 7.7, r_post: 6.8 })));
  assert.equal(par.cornea_policy, CorneaPolicy.KERATOMETRIC_READING);
  assert.ok(par.assumptions.some(a => /radios corneales MEDIDOS no usados/.test(a)),
    'radios medidos descartados sin registro');
});

test('V1.5 · adversarial: FROM_RADIUS usa el radio anterior MEDIDO aunque el triple esté incompleto', () => {
  // antes: con solo r_anterior medido, la política llamada FROM_RADIUS lo re-fabricaba
  // desde K sin nota (Δ = 0.33 D en este mismo caso)
  const m = buildCorneaModel(ojoParcial({ r_ant: 7.4 }), { policy: CorneaPolicy.SINGLE_SURFACE_FROM_RADIUS });
  assert.equal(m.r_anterior_mm, 7.4);
  assert.equal(m.power_d, singleSurfacePowerFromRadiusMm(7.4));
  assert.match(m.provenance, /MEDIDO/);
  // y si además hay un r_posterior medido que la superficie única no puede modelar, se registra
  const conPost = buildCorneaModel(ojoParcial({ r_ant: 7.4, r_post: 6.8 }), { policy: CorneaPolicy.SINGLE_SURFACE_FROM_RADIUS });
  assert.ok(conPost.assumptions.some(a => /r_posterior MEDIDO disponible y NO usado/.test(a)));
});

test('V1.5 · adversarial: RATIO usa el r_anterior MEDIDO y registra el r_posterior medido que sustituye', () => {
  const opts = { policy: CorneaPolicy.TWO_SURFACE_RATIO, posterior_ratio: 0.883, provenance: RATIO_OPTS.provenance };
  // r_anterior medido + cct (sin posterior): el medido se usa — la política solo asume la posterior
  const m = buildCorneaModel(ojoParcial({ r_ant: 7.4, cct: 550 }), opts);
  assert.equal(m.r_anterior_mm, 7.4);
  assert.ok(Math.abs(m.r_posterior_mm - 0.883 * 7.4) < 1e-12);
  // triple completo + RATIO explícita: pisar una medida disponible queda registrado
  const pisada = buildCorneaModel(ojoParcial({ r_ant: 7.7, r_post: 6.8, cct: 550 }), opts);
  assert.ok(pisada.assumptions.some(a => /r_posterior MEDIDO disponible y NO usado/.test(a)));
});

test('V1.5 · adversarial: Q MEDIDA sobre radio NO medido (RATIO) — el injerto se registra en el trazador', () => {
  // antes: quimera silenciosa — Q de topografía aplicada a radios asumidos/recuperados sin nota
  const post = postopDe(ojoParcial({ cct: 550, qs: true }));
  const rt = buildRaytraceEye(post, LENTE, { cornea: RATIO_OPTS });
  assert.ok(rt.assumptions.some(a => /cornea_ant: asfericidad MEDIDA aplicada a un radio RECUPERADO/.test(a)));
  assert.ok(rt.assumptions.some(a => /cornea_post: asfericidad MEDIDA aplicada a un radio ASUMIDO por ratio/.test(a)));
  // las superficies siguen siendo cónicas con la Q medida: el injerto se usa Y se declara
  const conicas = rt.surfaces.filter(s => /^cornea/.test(s.id) && s.kind === 'conic');
  assert.equal(conicas.length, 2);
});

test('V1.5 · adversarial: la nota de LECTURA no afirma explicitud que no puede conocer', () => {
  // buildCorneaModel DIRECTO sin opciones (API pública, política por DEFECTO) sobre ojo
  // totalmente medido: antes la nota decía "se pidió EXPLÍCITAMENTE" — falso por esa vía
  const m = buildCorneaModel(ojoParcial({ r_ant: 7.7, r_post: 6.8, cct: 550 }));
  const nota = m.assumptions.find(a => /radios corneales MEDIDOS no usados/.test(a));
  assert.ok(nota, 'el descarte debe registrarse también con política por defecto');
  assert.ok(!/EXPL/i.test(nota), 'la nota no puede afirmar cómo llegó la política');
});

test('V1.5 · adversarial: rotationally_symmetric viaja a los consumidores que RESUMEN', () => {
  // el flag existía en los builders pero los consumidores lo dejaban caer — incluido el
  // tórico, que es exactamente donde "two_surface_physical" podría leerse como córnea
  // astigmática física (no existe hasta el tórico trazado)
  const pre = createPreopEye({
    al_mm: 23.5, k1_d: 42.0, k1_axis_deg: 180, k2_d: 45.0, k2_axis_deg: 90,
    acd_mm: 3.2, lt_mm: 4.5, keratometric_index: 1.3375, meta: { source: 'synthetic' },
  });
  const post = createPredictedPostopEye(pre, { iol_position_mm: 4.9, position_source: 'test' });
  const toric = recommendToric({ postop: post, sePower_d: 20, catalog_d: [1.5, 2.25, 3.0] });
  assert.equal(toric.cornea_rotationally_symmetric, true);
});

test('V1.5 · adversarial: la procedencia de pose sobrevive a la vía paraxial (rotation_z pura)', () => {
  // antes: el paraxial aceptaba rotation_z pura (inerte) pero su salida no llevaba pose
  // — una pose MEASURED perdía su procedencia por elegir la vía paraxial
  const post = createPredictedPostopEye(ojo(), {
    iol_position_mm: 4.9, position_source: 'test',
    iol_pose: createIOLPose({ rotation_z_deg: 30, source: PoseSource.MEASURED }),
  });
  const par = buildParaxialEye(post);
  assert.equal(par.pose.source, PoseSource.MEASURED);
  // y el mensaje de rechazo (tilt/descentración) nombra la procedencia real
  const conTilt = createPredictedPostopEye(ojo(), {
    iol_position_mm: 4.9, position_source: 'test',
    iol_pose: createIOLPose({ tilt_x_deg: 3, source: PoseSource.MEASURED }),
  });
  assert.throws(() => buildParaxialEye(conTilt), /source: MEASURED/);
});
