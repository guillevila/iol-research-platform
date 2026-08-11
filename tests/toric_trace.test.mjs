/**
 * V1.6 — trazado tórico integrado: criterios de aceptación del encargo.
 *
 *  - LIO tórica sola, córnea tórica sola y ambas combinadas se validan POR SEPARADO;
 *  - pupila→0: los focos del análisis 2D coinciden con el paraxial COAXIAL de los
 *    sistemas meridionales equivalentes (construidos con lentes de revolución y
 *    verificados por la maquinaria ya existente de V1.2);
 *  - composición vectorial de doble ángulo con cantidades MEDIDAS del propio trazador;
 *  - candado del criterio V1.7: el residual de dos cilindros iguales separados θ es
 *    2·C·|sen θ| (resta vectorial completa), NO C·|sen 2θ|;
 *  - STRICT bloquea toda geometría tórica inventada; la única vía STRICT es geometría
 *    de fabricante DOCUMENTADA sobre córnea medida.
 *
 * RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPreopEye, createPredictedPostopEye } from '../src/core/eye.mjs';
import { createIOL, GeometryStatus, physicalPowersOfToricIOL, hasToricGeometry, PER_MERIDIAN } from '../src/core/iol.mjs';
import { SyntheticToricIOLFactory, GenericIOLFactory, ManufacturerIOLFactory } from '../src/core/iol_factory.mjs';
import { buildRaytraceEye, buildParaxialEye, paraxialFocusOfRaytraceEye } from '../src/optics/eyebuilder.mjs';
import { ToricCorneaPolicy, buildToricCorneaModel } from '../src/optics/toric_cornea.mjs';
import { CorneaPolicy } from '../src/optics/cornea.mjs';
import { FidelityMode, StrictModeViolation } from '../src/core/fidelity.mjs';
import { createIOLPose, PoseSource } from '../src/core/pose.mjs';
import { generateBundle, SamplingKind } from '../src/optics/raytrace/bundle.mjs';
import { traceRay } from '../src/optics/raytrace/trace.mjs';
import { analyzeAstigmaticBundle, clinicalFromAstigmaticAnalysis, normDeg180 } from '../src/optics/raytrace/astigmatism.mjs';
import { evaluateObjective, ObjectiveKind, equivalentDefocus_d } from '../src/optics/objective.mjs';

const PROV = 'FICTICIA — fixture de test, no es una ficha real de fabricante';

function ojo({ k1 = 43.5, k2 = 43.5, ejeK1 = 180, ejeK2 = 90, radios = false, qs = false } = {}) {
  return createPreopEye({
    al_mm: 23.5, k1_d: k1, k1_axis_deg: ejeK1, k2_d: k2, k2_axis_deg: ejeK2,
    acd_mm: 3.2, lt_mm: 4.5, cct_um: 550, keratometric_index: 1.3375,
    ...(radios ? {
      cornea: {
        r_anterior_mm: 7.7, r_posterior_mm: 6.8,
        ...(qs ? { asphericity_q_anterior: -0.18, asphericity_q_posterior: -0.30 } : {}),
      },
    } : {}),
    meta: { source: 'synthetic' },
  });
}
const postopDe = (pre, extra = {}) =>
  createPredictedPostopEye(pre, { iol_position_mm: 4.9, position_source: 'test', ...extra });

/** traza un haz 2D por el ojo y devuelve los rayos emergentes (sin pérdidas admisibles) */
function emergentes(eye, pupilRadius = 0.08) {
  const bundle = generateBundle({ radius_mm: pupilRadius, kind: SamplingKind.RINGS_EQUAL_AREA, n: 3, perRing: 8 });
  const out = [];
  for (const r0 of bundle.rays) {
    const tr = traceRay(eye.surfaces, r0);
    if (tr.ok) out.push(tr.ray);
  }
  assert.equal(out.length, bundle.rays.length, 'pérdidas en haz de pupila pequeña');
  return out;
}

/** LIO de REVOLUCIÓN equivalente a un meridiano de la tórica (para el ancla paraxial) */
function lenteMeridiano(iolToric, radioAnterior) {
  const g = iolToric.geometry;
  return createIOL({
    manufacturer: 'TEST', model: `meridiano_${radioAnterior}`,
    nominal_power_d: iolToric.nominal_power_d,
    geometry: {
      refractive_index: g.refractive_index, central_thickness_mm: g.central_thickness_mm,
      r_anterior_mm: radioAnterior, r_posterior_mm: g.r_posterior_mm,
      asphericity_q_anterior: 0, asphericity_q_posterior: 0,
    },
    geometry_status: GeometryStatus.MANUFACTURER, provenance: PROV, source: 'fixture',
  });
}

// ---------------------------------------------------------------------------------

test('toric · SyntheticToricIOLFactory: la geometría REALIZA la etiqueta a precisión de máquina', () => {
  const f = new SyntheticToricIOLFactory();
  const iol = f.create({ power_d: 21, cylinder_d: 3 });
  assert.equal(iol.is_simulation_surrogate, true, 'sustituto declarado SIEMPRE');
  assert.match(iol.source, /SINTÉTICA/);
  assert.equal(hasToricGeometry(iol), true);
  assert.equal(iol.geometry.toric_design, 'anterior');
  assert.equal(iol.geometry.asphericity_q_anterior, PER_MERIDIAN);
  const p = physicalPowersOfToricIOL(iol);
  assert.ok(Math.abs(p.cylinder_d - 3) < 1e-12, `cilindro físico ${p.cylinder_d} vs etiqueta 3`);
  assert.ok(Math.abs(p.mean_d - 21) < 1e-12, `EE físico ${p.mean_d} vs etiqueta 21`);
  assert.ok(p.power_y_d > p.power_x_d, 'convención: meridiano potente en y local');
  // cilindro negativo nominal: prohibido (la orientación la da rotation_z)
  assert.throws(() => f.create({ power_d: 21, cylinder_d: -2 }), /≥ 0/);
});

test('toric · createIOL: bloques tóricos validados; contradicciones rechazadas; etiqueta jamás fabrica radios', () => {
  // r escalar + cara tórica a la vez = dos verdades → rechazo
  assert.throws(() => createIOL({
    nominal_power_d: 20,
    geometry: { refractive_index: 1.49, central_thickness_mm: 0.8, r_anterior_mm: 20, toric_anterior: { r_x_mm: 21, r_y_mm: 19 }, r_posterior_mm: -20 },
  }), /contradictoria/);
  // q escalar + cara tórica → rechazo
  assert.throws(() => createIOL({
    nominal_power_d: 20,
    geometry: { refractive_index: 1.49, central_thickness_mm: 0.8, asphericity_q_anterior: -0.1, toric_anterior: { r_x_mm: 21, r_y_mm: 19 }, r_posterior_mm: -20 },
  }), /contradictoria/);
  // cylinder_d declarado SIN cara tórica: el trazador rechaza (la etiqueta no es geometría)
  const soloEtiqueta = new GenericIOLFactory().create({ power_d: 21, cylinder_d: 2.25 });
  assert.throws(() => buildRaytraceEye(postopDe(ojo()), soloEtiqueta),
    /cylinder_d=2.25 D declarado SIN cara tórica/);
});

test('toric · LIO tórica SOLA (pupila→0): focos del análisis 2D == paraxial de los sistemas meridionales', () => {
  const iol = new SyntheticToricIOLFactory().create({ power_d: 21, cylinder_d: 3 });
  const post = postopDe(ojo());
  const eye = buildRaytraceEye(post, iol);
  assert.equal(eye.toric, true);
  const a = analyzeAstigmaticBundle(emergentes(eye));
  assert.equal(a.astigmatic, true);
  // anclas: ojos de REVOLUCIÓN con la lente meridiano-x / meridiano-y (paraxial V1.2)
  const tb = iol.geometry.toric_anterior;
  const zX = paraxialFocusOfRaytraceEye(buildRaytraceEye(post, lenteMeridiano(iol, tb.r_x_mm)));
  const zY = paraxialFocusOfRaytraceEye(buildRaytraceEye(post, lenteMeridiano(iol, tb.r_y_mm)));
  // meridiano potente = y local (foco próximo); plano = x (foco lejano)
  assert.ok(Math.abs(a.foci[0].z_mm - zY) < 5e-3, `foco próximo ${a.foci[0].z_mm} vs paraxial y ${zY}`);
  assert.ok(Math.abs(a.foci[1].z_mm - zX) < 5e-3, `foco lejano ${a.foci[1].z_mm} vs paraxial x ${zX}`);
  assert.ok(Math.abs(a.foci[0].power_meridian_deg - 90) < 1e-3, 'meridiano potente en 90° (y del datum, pose identidad)');
  // cilindro clínico == diferencia de desenfoques de los MISMOS anclas paraxiales
  const clin = clinicalFromAstigmaticAnalysis(a, { zRetina_mm: eye.retina_z_mm, zReference_mm: eye.iol_back_z_mm });
  const esperado = equivalentDefocus_d(zY, eye.retina_z_mm, eye.iol_back_z_mm)
    - equivalentDefocus_d(zX, eye.retina_z_mm, eye.iol_back_z_mm);
  assert.ok(Math.abs(clin.cylinder_d - esperado) < 0.02, `cilindro ${clin.cylinder_d} vs paraxial ${esperado}`);
});

test('toric · CÓRNEA tórica SOLA (FROM_K): meridianos = ejes K; cilindro anclado al paraxial meridional', () => {
  // córnea empinada a 90° (K2=45 en eje 90 > K1=42 en eje 180)
  const pre = ojo({ k1: 42, k2: 45 });
  const post = postopDe(pre);
  const modelo = buildToricCorneaModel(pre, { policy: ToricCorneaPolicy.TORIC_ANTERIOR_FROM_K });
  assert.equal(modelo.steep_axis_deg, 90);
  assert.equal(modelo.rotationally_symmetric, false);
  const iol = new GenericIOLFactory().create({ power_d: 21 });
  const eye = buildRaytraceEye(post, iol, { cornea_toric: { policy: ToricCorneaPolicy.TORIC_ANTERIOR_FROM_K } });
  assert.equal(eye.toric, true);
  assert.equal(eye.cornea.rotationally_symmetric, false);
  const a = analyzeAstigmaticBundle(emergentes(eye));
  assert.equal(a.astigmatic, true);
  assert.ok(Math.abs(a.foci[0].power_meridian_deg - 90) < 1e-3,
    `meridiano empinado ${a.foci[0].power_meridian_deg} vs eje K 90`);
  // anclas meridionales: MISMA LIO sobre córnea ESFÉRICA equivalente de cada meridiano
  // (superficie única de radio r_steep / r_flat), construidas por el propio builder EE
  const anclas = [modelo.r_steep_mm, modelo.r_flat_mm].map(r => {
    const preM = createPreopEye({
      al_mm: 23.5, k1_d: 43.5, k1_axis_deg: 180, k2_d: 43.5, k2_axis_deg: 90,
      acd_mm: 3.2, lt_mm: 4.5, cct_um: 550,
      // K sintética que RECUPERA exactamente ese radio bajo la misma convención
      keratometric_index: 1.3375, meta: { source: 'synthetic' },
    });
    // sustituimos la K por la equivalente al radio: K = (n_k−1)·1000/r
    const preExact = createPreopEye({
      al_mm: 23.5, k1_d: (1.3375 - 1) * 1000 / r, k1_axis_deg: 180,
      k2_d: (1.3375 - 1) * 1000 / r, k2_axis_deg: 90,
      acd_mm: 3.2, lt_mm: 4.5, cct_um: 550, keratometric_index: 1.3375, meta: { source: 'synthetic' },
    });
    void preM;
    const eyeM = buildRaytraceEye(postopDe(preExact), iol, { cornea: { policy: CorneaPolicy.SINGLE_SURFACE_FROM_RADIUS } });
    return paraxialFocusOfRaytraceEye(eyeM);
  });
  assert.ok(Math.abs(a.foci[0].z_mm - anclas[0]) < 5e-3, `foco empinado ${a.foci[0].z_mm} vs ${anclas[0]}`);
  assert.ok(Math.abs(a.foci[1].z_mm - anclas[1]) < 5e-3, `foco plano ${a.foci[1].z_mm} vs ${anclas[1]}`);
});

test('toric · córnea a eje ARBITRARIO: el análisis recupera el eje K declarado (no solo 0/90)', () => {
  for (const eje of [35, 63.4, 121]) {
    const pre = ojo({ k1: 45, k2: 42, ejeK1: eje, ejeK2: normDeg180(eje + 90) });
    const eye = buildRaytraceEye(postopDe(pre), new GenericIOLFactory().create({ power_d: 21 }),
      { cornea_toric: { policy: ToricCorneaPolicy.TORIC_ANTERIOR_FROM_K } });
    const a = analyzeAstigmaticBundle(emergentes(eye));
    const dif = Math.min(Math.abs(a.foci[0].power_meridian_deg - eje),
      180 - Math.abs(a.foci[0].power_meridian_deg - eje));
    assert.ok(dif < 0.01, `eje ${eje}: recuperado ${a.foci[0].power_meridian_deg}`);
    // y el eje clínico minus-cyl = meridiano PLANO = eje empinado + 90 (trampa de 90°)
    const clin = clinicalFromAstigmaticAnalysis(a, { zRetina_mm: eye.retina_z_mm, zReference_mm: eye.iol_back_z_mm });
    const flatEsperado = normDeg180(eje + 90);
    const difFlat = Math.min(Math.abs(clin.minus_cyl_axis_deg - flatEsperado),
      180 - Math.abs(clin.minus_cyl_axis_deg - flatEsperado));
    assert.ok(difFlat < 0.01, `minus-cyl axis ${clin.minus_cyl_axis_deg} vs plano ${flatEsperado}`);
  }
});

test('toric · COMBINADAS con ejes alineados: la LIO tórica orientada al eje corneal REDUCE el cilindro', () => {
  // córnea empinada a 90 (cilindro corneal físico ~2.9 D de superficie única); LIO
  // tórica sintética con el meridiano potente alineado al eje PLANO corneal — es decir,
  // rotation_z = 90: el meridiano potente de la LIO (y local) gira al eje 0 (plano corneal)
  const pre = ojo({ k1: 42, k2: 45 });
  const iolT = new SyntheticToricIOLFactory().create({ power_d: 21, cylinder_d: 3 });
  const sinCorregir = buildRaytraceEye(postopDe(pre), new GenericIOLFactory().create({ power_d: 21 }),
    { cornea_toric: { policy: ToricCorneaPolicy.TORIC_ANTERIOR_FROM_K } });
  const corregido = buildRaytraceEye(
    postopDe(pre, { iol_pose: createIOLPose({ rotation_z_deg: 90, source: PoseSource.DECLARED_SCENARIO }) }),
    iolT, { cornea_toric: { policy: ToricCorneaPolicy.TORIC_ANTERIOR_FROM_K } });
  const cylDe = eye => {
    const a = analyzeAstigmaticBundle(emergentes(eye), { axis_tol_mm: 1e-5 });
    if (!a.astigmatic) return 0;
    const clin = clinicalFromAstigmaticAnalysis(a, { zRetina_mm: eye.retina_z_mm, zReference_mm: eye.iol_back_z_mm });
    return Math.abs(clin.cylinder_d);
  };
  const antes = cylDe(sinCorregir), despues = cylDe(corregido);
  // la LIO tórica sola sobre ojo esférico mide su cilindro EFECTIVO en la misma
  // referencia de vergencia (el corneal se amplifica al referirlo al plano de LIO:
  // 2.99 D corneales ≈ 4.4 D equivalentes — efectividad, no error)
  const soloIOL = cylDe(buildRaytraceEye(postopDe(ojo()), iolT));
  assert.ok(antes > 2, `cilindro corneal esperado > 2 D: ${antes}`);
  assert.ok(despues < antes * 0.5, `la corrección alineada debía reducir el cilindro: ${antes} → ${despues}`);
  // ejes opuestos alineados ⇒ resta escalar de los módulos medidos (composición vectorial)
  assert.ok(Math.abs(despues - Math.abs(antes - soloIOL)) < 0.12,
    `residual ${despues.toFixed(3)} vs |${antes.toFixed(3)} − ${soloIOL.toFixed(3)}| = ${Math.abs(antes - soloIOL).toFixed(3)}`);
});

test('toric · rotación de la LIO: el residual TRAZADO sigue la composición vectorial de doble ángulo', () => {
  // cantidades MEDIDAS por el propio análisis (no fórmulas nominales): córnea sola y
  // LIO sola definen los vectores; la combinación a cada θ debe seguir la resta
  // vectorial completa dentro de la tolerancia de interacción de segundo orden
  const pre = ojo({ k1: 42, k2: 45 });
  const iolT = new SyntheticToricIOLFactory().create({ power_d: 21, cylinder_d: 3 });
  const medir = eye => {
    const a = analyzeAstigmaticBundle(emergentes(eye), { axis_tol_mm: 1e-5 });
    if (!a.astigmatic) return { cyl: 0, eje: null };
    const clin = clinicalFromAstigmaticAnalysis(a, { zRetina_mm: eye.retina_z_mm, zReference_mm: eye.iol_back_z_mm });
    return { cyl: Math.abs(clin.cylinder_d), eje: clin.steep.meridian_deg };
  };
  const soloCornea = medir(buildRaytraceEye(postopDe(pre), new GenericIOLFactory().create({ power_d: 21 }),
    { cornea_toric: { policy: ToricCorneaPolicy.TORIC_ANTERIOR_FROM_K } }));
  const soloIOL = medir(buildRaytraceEye(postopDe(ojo(), {
    iol_pose: createIOLPose({ rotation_z_deg: 0 }),
  }), iolT));
  // vector de doble ángulo (empinado): v = C·(cos 2θs, sin 2θs)
  const vec = (cyl, ejeSteep) => [cyl * Math.cos(2 * ejeSteep * Math.PI / 180), cyl * Math.sin(2 * ejeSteep * Math.PI / 180)];
  const vCornea = vec(soloCornea.cyl, soloCornea.eje);
  for (const rot of [30, 60, 90]) {
    const combinado = medir(buildRaytraceEye(
      postopDe(pre, { iol_pose: createIOLPose({ rotation_z_deg: rot }) }), iolT,
      { cornea_toric: { policy: ToricCorneaPolicy.TORIC_ANTERIOR_FROM_K } }));
    // meridiano potente de la LIO a rotation_z=rot: 90+rot
    const vIOL = vec(soloIOL.cyl, normDeg180(90 + rot));
    const esperado = Math.hypot(vCornea[0] + vIOL[0], vCornea[1] + vIOL[1]);
    assert.ok(Math.abs(combinado.cyl - esperado) < 0.12,
      `rot=${rot}: residual trazado ${combinado.cyl.toFixed(3)} vs vectorial ${esperado.toFixed(3)}`);
  }
});

test('toric · CANDADO del criterio V1.7: dos cilindros IGUALES separados θ restan 2·C·|sen θ|, no C·|sen 2θ|', () => {
  // resta vectorial completa en doble ángulo — el álgebra que V1.7 usará como criterio
  const residual = (C, theta) => {
    const v1 = [C, 0];
    const v2 = [C * Math.cos(2 * theta * Math.PI / 180), C * Math.sin(2 * theta * Math.PI / 180)];
    return Math.hypot(v1[0] - v2[0], v1[1] - v2[1]);
  };
  for (const C of [1, 2.25, 3]) {
    for (const theta of [0, 5, 15, 30, 45, 60, 90]) {
      const correcto = 2 * C * Math.abs(Math.sin(theta * Math.PI / 180));
      assert.ok(Math.abs(residual(C, theta) - correcto) < 1e-12,
        `θ=${theta}: |v1−v2|=${residual(C, theta)} vs 2C|sinθ|=${correcto}`);
    }
    // y la fórmula ERRÓNEA que estaba en el plan diverge donde importa
    assert.ok(Math.abs(residual(C, 30) - C * Math.abs(Math.sin(2 * 30 * Math.PI / 180))) > 0.1 * C);
    assert.ok(Math.abs(residual(C, 90) - 0) > 1.9 * C, 'a 90° el residual es 2C, la errónea daría 0');
  }
});

test('toric · STRICT bloquea TODA geometría tórica inventada; la vía de fabricante documentada PASA', () => {
  const preMedida = ojo({ radios: true, qs: true });
  // (a) LIO tórica SINTÉTICA → sustituto → bloquea
  assert.throws(() => buildRaytraceEye(postopDe(preMedida),
    new SyntheticToricIOLFactory().create({ power_d: 21, cylinder_d: 3 }),
    { cornea: { policy: CorneaPolicy.TWO_SURFACE_MEASURED }, fidelity: FidelityMode.STRICT }),
  err => err instanceof StrictModeViolation);
  // (b) córnea FROM_K → derivada, posterior sin modelar → bloquea
  const mfrEsferica = new ManufacturerIOLFactory({
    manufacturer: 'ACME', model: 'ESF', provenance: PROV,
    geometryByPower: { 21: { refractive_index: 1.47, central_thickness_mm: 0.7, r_anterior_mm: 20, r_posterior_mm: -20, asphericity_q_anterior: -0.1, asphericity_q_posterior: -0.1 } },
  }).create({ power_d: 21 });
  assert.throws(() => buildRaytraceEye(postopDe(ojo({ k1: 42, k2: 45 })), mfrEsferica,
    { cornea_toric: { policy: ToricCorneaPolicy.TORIC_ANTERIOR_FROM_K }, fidelity: FidelityMode.STRICT }),
  err => err instanceof StrictModeViolation && /toricidad posterior NO medida/.test(err.message));
  // (c) córnea DECLARADA (escenario) → bloquea
  assert.throws(() => buildRaytraceEye(postopDe(preMedida), mfrEsferica, {
    cornea_toric: {
      policy: ToricCorneaPolicy.TORIC_DECLARED_RADII, provenance: 'escenario de test para STRICT',
      anterior: { r_steep_mm: 7.5, r_flat_mm: 7.9 }, steep_axis_deg: 90,
    },
    fidelity: FidelityMode.STRICT,
  }), err => err instanceof StrictModeViolation && /DECLARADA/.test(err.message));
  // (d) LIO tórica de FABRICANTE documentada (Q por meridiano numéricas) sobre córnea
  //     MEDIDA con Q medida: registro vacío → PASA STRICT
  const mfrTorica = new ManufacturerIOLFactory({
    manufacturer: 'ACME', model: 'TOR', provenance: PROV,
    geometryByPower: {
      21: {
        refractive_index: 1.47, central_thickness_mm: 0.7,
        // curvatura MEDIA anterior = 1/20 exacta (1/22 + 12/220 = 1/10, /2 = 1/20):
        // la lente queda simétrica en media (c1̄ = −c2) y no dispara la nota de
        // centrado OQ#3 — el test aísla la vía tórica STRICT, no el centrado
        toric_anterior: { r_x_mm: 22, r_y_mm: 220 / 12, q_x: -0.1, q_y: -0.12 },
        r_posterior_mm: -20, asphericity_q_posterior: -0.1,
      },
    },
  }).create({ power_d: 21, cylinder_d: 1.5 });
  const eyeStrict = buildRaytraceEye(postopDe(preMedida), mfrTorica, {
    cornea: { policy: CorneaPolicy.TWO_SURFACE_MEASURED }, fidelity: FidelityMode.STRICT,
  });
  assert.deepEqual(eyeStrict.assumptions, []);
  assert.equal(eyeStrict.toric, true);
});

test('toric · guardas: paraxial, foco coaxial y objetivos escalares rechazan el sistema tórico', () => {
  const iolT = new SyntheticToricIOLFactory().create({ power_d: 21, cylinder_d: 3 });
  const post = postopDe(ojo());
  // EE paraxial: rechaza la cara tórica (no colapsa el cilindro declarado)
  assert.throws(() => buildParaxialEye(post).refractionForIOL(iolT), /TÓRICA/);
  const eye = buildRaytraceEye(post, iolT);
  // no existe UN foco coaxial
  assert.throws(() => paraxialFocusOfRaytraceEye(eye), /TÓRICO/);
  // los objetivos escalares A y C destruyen el eje: prohibido y GUARDADO
  const bundle = generateBundle({ radius_mm: 1.5, kind: SamplingKind.RINGS_EQUAL_AREA, n: 4, perRing: 8 }).rays;
  for (const kind of [ObjectiveKind.SPOT_RMS_AT_RETINA, ObjectiveKind.EQUIVALENT_DEFOCUS]) {
    assert.throws(() => evaluateObjective(eye, bundle, kind), /TÓRICO|escalares/);
  }
  // cornea y cornea_toric a la vez: contradicción explícita
  assert.throws(() => buildRaytraceEye(post, iolT, {
    cornea: { policy: CorneaPolicy.KERATOMETRIC_READING },
    cornea_toric: { policy: ToricCorneaPolicy.TORIC_ANTERIOR_FROM_K },
  }), /excluyentes/);
});

test('toric · FROM_K: perpendicularidad K obligatoria; medidas disponibles no usadas se registran', () => {
  // meridianos no perpendiculares → astigmatismo irregular → rechazo explícito
  const irregular = ojo({ k1: 42, k2: 45, ejeK1: 180, ejeK2: 70 });
  assert.throws(() => buildToricCorneaModel(irregular, { policy: ToricCorneaPolicy.TORIC_ANTERIOR_FROM_K }),
    /no perpendiculares/);
  // radios medios medidos disponibles → registrados como no usados (patrón V1.5)
  const conRadios = ojo({ k1: 42, k2: 45, radios: true });
  const m = buildToricCorneaModel(conRadios, { policy: ToricCorneaPolicy.TORIC_ANTERIOR_FROM_K });
  assert.ok(m.assumptions.some(a => /r_anterior MEDIO medido disponible y NO usado/.test(a)));
  assert.match(m.provenance, /NO es una córnea astigmática medida/);
});
