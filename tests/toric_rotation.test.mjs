/**
 * V1.7 — rotación tórica por FÍSICA: criterios de aceptación del encargo.
 *
 *  - orientación 0 reproduce V1.6 (mismos números: el módulo DELEGA, no reimplementa);
 *  - +180° reproduce exactamente la misma óptica; +90° intercambia los meridianos;
 *  - ±θ cumplen las simetrías de un sistema centrado con ejes en 0/90;
 *  - pupila→0 converge a la RESTA VECTORIAL completa (ancla general); a pupila finita
 *    la salida reporta DIVERGENCIA frente al vectorial, nunca "error";
 *  - 2C·|sen θ| es ancla SOLO para cilindros IGUALES en el límite paraxial (se
 *    construye el caso igualando los módulos EFECTIVOS medidos);
 *  - la combinación rotación + tilt + descentración usa el orden ya fijado R_tilt·Rz
 *    (el módulo delega en buildRaytraceEye: ninguna rotación nueva);
 *  - el error de rotación es DERIVADO (físico − planificado, mod 180, firmado),
 *    jamás una entrada geométrica.
 *
 * RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPreopEye, createPredictedPostopEye } from '../src/core/eye.mjs';
import { GenericIOLFactory, SyntheticToricIOLFactory } from '../src/core/iol_factory.mjs';
import { createIOLPose, PoseSource } from '../src/core/pose.mjs';
import { FidelityMode, StrictModeViolation } from '../src/core/fidelity.mjs';
import { buildRaytraceEye } from '../src/optics/eyebuilder.mjs';
import { ToricCorneaPolicy } from '../src/optics/toric_cornea.mjs';
import { generateBundle, SamplingKind } from '../src/optics/raytrace/bundle.mjs';
import { traceRay } from '../src/optics/raytrace/trace.mjs';
import { analyzeAstigmaticBundle, clinicalFromAstigmaticAnalysis, normDeg180 } from '../src/optics/raytrace/astigmatism.mjs';
import { evaluateToricRotationScenario, signedAxisDiff_deg, vectorResidual } from '../src/toric/toric_rotation.mjs';

const ojo = ({ k1 = 43.5, k2 = 43.5 } = {}) => createPreopEye({
  al_mm: 23.5, k1_d: k1, k1_axis_deg: 180, k2_d: k2, k2_axis_deg: 90,
  acd_mm: 3.2, lt_mm: 4.5, cct_um: 550, keratometric_index: 1.3375,
  meta: { source: 'synthetic' },
});
const postopDe = (pre, rot = null, extraPose = {}) => createPredictedPostopEye(pre, {
  iol_position_mm: 4.9, position_source: 'test',
  ...(rot !== null || Object.keys(extraPose).length
    ? { iol_pose: createIOLPose({ rotation_z_deg: rot ?? 0, ...extraPose }) } : {}),
});
const LIO_T = new SyntheticToricIOLFactory().create({ power_d: 21, cylinder_d: 3 });
const CORNEA_T = { policy: ToricCorneaPolicy.TORIC_ANTERIOR_FROM_K };
const PRE_AST = () => ojo({ k1: 42, k2: 45 });   // córnea empinada a 90°

/** el mismo pipeline V1.6 a mano, para verificar que el módulo V1.7 DELEGA */
function residualManual(postop, iol, opts = {}, pupil = 0.35) {
  const eye = buildRaytraceEye(postop, iol, opts);
  const bundle = generateBundle({ radius_mm: pupil, kind: SamplingKind.RINGS_EQUAL_AREA, n: 4, perRing: 8 });
  const rays = bundle.rays.map(r0 => traceRay(eye.surfaces, r0)).filter(t => t.ok).map(t => t.ray);
  const a = analyzeAstigmaticBundle(rays, { axis_tol_mm: 1e-5 });
  const c = clinicalFromAstigmaticAnalysis(a, { zRetina_mm: eye.retina_z_mm, zReference_mm: eye.iol_back_z_mm });
  return { cyl: Math.abs(c.cylinder_d), eje: c.steep?.meridian_deg ?? null };
}

// ---------------------------------------------------------------------------------

test('rotación · el error es DERIVADO, firmado, mod 180, con envoltura correcta', () => {
  assert.equal(signedAxisDiff_deg(100, 90), 10);
  assert.equal(signedAxisDiff_deg(80, 90), -10);
  assert.equal(signedAxisDiff_deg(5, 170), 15);     // envuelve: 5 − 170 = −165 → +15
  assert.equal(signedAxisDiff_deg(170, 10), -20);   // 160 → −20
  assert.equal(signedAxisDiff_deg(90, 90), 0);
  assert.equal(signedAxisDiff_deg(0, 90), 90);      // el borde va a +90, no −90
  // y viaja en la salida: físico = 90 + rotation_z
  const r = evaluateToricRotationScenario({
    postop: postopDe(ojo(), 25), iol: LIO_T, planned_steep_axis_deg: 90,
  });
  assert.equal(r.physical_steep_axis_deg, 115);
  assert.equal(r.rotation_error_deg, 25);
  // no existe NINGUNA entrada de "error": la única geometría es la pose
  assert.throws(() => evaluateToricRotationScenario({
    postop: postopDe(ojo(), 0), iol: LIO_T, planned_steep_axis_deg: 90, rotation_error_deg: 10,
  }), /planned|rotation_error/i, 'una entrada de error no debe existir ni aceptarse');
});

test('rotación · orientación 0 reproduce V1.6: el módulo DELEGA (mismos números que el pipeline manual)', () => {
  const post = postopDe(PRE_AST(), 90);   // corrección alineada del test V1.6
  const r = evaluateToricRotationScenario({
    postop: post, iol: LIO_T, cornea_toric: CORNEA_T, planned_steep_axis_deg: 0,
  });
  const manual = residualManual(post, LIO_T, { cornea_toric: CORNEA_T });
  assert.equal(r.residual.cyl_d, manual.cyl);           // igualdad EXACTA: mismo código
  assert.equal(r.residual.steep_meridian_deg, manual.eje);
  assert.equal(r.rotation_error_deg, 0);                // físico 90+90=180≡0 = planificado
});

test('rotación · +180° reproduce EXACTAMENTE la misma óptica', () => {
  for (const rot of [0, 35, 90]) {
    const a = evaluateToricRotationScenario({
      postop: postopDe(PRE_AST(), rot), iol: LIO_T, cornea_toric: CORNEA_T, planned_steep_axis_deg: 0,
    });
    const b = evaluateToricRotationScenario({
      postop: postopDe(PRE_AST(), rot + 180), iol: LIO_T, cornea_toric: CORNEA_T, planned_steep_axis_deg: 0,
    });
    assert.ok(Math.abs(a.residual.cyl_d - b.residual.cyl_d) < 1e-9,
      `rot=${rot}: cilindro ${a.residual.cyl_d} vs +180° ${b.residual.cyl_d}`);
    assert.equal(a.physical_steep_axis_deg, b.physical_steep_axis_deg, 'eje físico mod 180');
    assert.equal(a.rotation_error_deg, b.rotation_error_deg);
    if (a.residual.steep_meridian_deg !== null) {
      const d = Math.abs(a.residual.steep_meridian_deg - b.residual.steep_meridian_deg);
      assert.ok(Math.min(d, 180 - d) < 1e-5, 'meridiano residual mod 180');
    }
  }
});

test('rotación · +90° intercambia los meridianos como corresponde', () => {
  // LIO tórica sola sobre ojo esférico: a rotación 0 el meridiano potente está en 90;
  // a +90 debe estar en 0 — y los papeles empinado/plano del residual se intercambian
  const en0 = evaluateToricRotationScenario({ postop: postopDe(ojo(), 0), iol: LIO_T, planned_steep_axis_deg: 90 });
  const en90 = evaluateToricRotationScenario({ postop: postopDe(ojo(), 90), iol: LIO_T, planned_steep_axis_deg: 90 });
  assert.ok(Math.abs(en0.residual.steep_meridian_deg - 90) < 1e-3);
  assert.ok(en90.residual.steep_meridian_deg < 1e-3 || Math.abs(en90.residual.steep_meridian_deg - 180) < 1e-3);
  assert.ok(Math.abs(en0.residual.cyl_d - en90.residual.cyl_d) < 1e-6, 'mismo módulo, meridianos intercambiados');
  // sobre córnea tórica: alineado (rot 90) corrige; a +90 del alineado (rot 0) SUMA
  const corrige = evaluateToricRotationScenario({
    postop: postopDe(PRE_AST(), 90), iol: LIO_T, cornea_toric: CORNEA_T, planned_steep_axis_deg: 0 });
  const suma = evaluateToricRotationScenario({
    postop: postopDe(PRE_AST(), 0), iol: LIO_T, cornea_toric: CORNEA_T, planned_steep_axis_deg: 0 });
  assert.ok(suma.residual.cyl_d > corrige.residual.cyl_d + 5, `${corrige.residual.cyl_d} → ${suma.residual.cyl_d}`);
  assert.equal(suma.rotation_error_deg, 90);
});

test('rotación · ±θ cumplen las simetrías de un sistema centrado (ejes en 0/90)', () => {
  // reflexión respecto del plano y-z: mapea rotación +θ → −θ y meridianos m → −m
  for (const theta of [5, 15, 30]) {
    const mas = evaluateToricRotationScenario({
      postop: postopDe(PRE_AST(), 90 + theta), iol: LIO_T, cornea_toric: CORNEA_T, planned_steep_axis_deg: 0 });
    const menos = evaluateToricRotationScenario({
      postop: postopDe(PRE_AST(), 90 - theta), iol: LIO_T, cornea_toric: CORNEA_T, planned_steep_axis_deg: 0 });
    assert.ok(Math.abs(mas.residual.cyl_d - menos.residual.cyl_d) < 1e-6,
      `θ=${theta}: |cyl(+θ)−cyl(−θ)| = ${Math.abs(mas.residual.cyl_d - menos.residual.cyl_d)}`);
    assert.equal(mas.rotation_error_deg, theta);
    assert.equal(menos.rotation_error_deg, -theta);
    // meridianos espejados: m(+θ) ≡ −m(−θ) (mod 180)
    const espejo = normDeg180(-menos.residual.steep_meridian_deg);
    const d = Math.abs(mas.residual.steep_meridian_deg - espejo);
    assert.ok(Math.min(d, 180 - d) < 1e-4, `meridiano ${mas.residual.steep_meridian_deg} vs espejo ${espejo}`);
  }
});

test('rotación · pupila→0 converge a la RESTA VECTORIAL; a pupila finita reporta DIVERGENCIA (no "error")', () => {
  // componentes medidos con el MISMO análisis a pupila pequeña
  const pupil = 0.08;
  const soloCornea = residualManual(postopDe(PRE_AST()), new GenericIOLFactory().create({ power_d: 21 }),
    { cornea_toric: CORNEA_T }, pupil);
  const soloLIO = residualManual(postopDe(ojo(), 0), LIO_T, {}, pupil);
  for (const rot of [15, 45, 90]) {
    const vect = vectorResidual([
      { cyl_d: soloCornea.cyl, steep_axis_deg: soloCornea.eje },
      { cyl_d: soloLIO.cyl, steep_axis_deg: normDeg180(90 + rot) },
    ]);
    const r = evaluateToricRotationScenario({
      postop: postopDe(PRE_AST(), rot), iol: LIO_T, cornea_toric: CORNEA_T,
      planned_steep_axis_deg: 0, pupil_radius_mm: pupil,
      referencia_vectorial_d: vect.cyl_d,
    });
    assert.ok(Math.abs(r.divergencia_vs_vectorial_d) < 0.01,
      `rot=${rot}: pupila→0 debía converger al vectorial (divergencia ${r.divergencia_vs_vectorial_d})`);
    // el campo se llama DIVERGENCIA — y no existe ningún campo *error* de magnitud
    assert.ok('divergencia_vs_vectorial_d' in r);
    assert.ok(!Object.keys(r).some(k => /error/.test(k) && k !== 'rotation_error_deg'),
      'ningún campo de magnitud debe llamarse error');
  }
  // pupila finita: la divergencia existe y se reporta (mayor que a pupila pequeña)
  const vect45 = vectorResidual([
    { cyl_d: soloCornea.cyl, steep_axis_deg: soloCornea.eje },
    { cyl_d: soloLIO.cyl, steep_axis_deg: normDeg180(90 + 45) },
  ]);
  const grande = evaluateToricRotationScenario({
    postop: postopDe(PRE_AST(), 45), iol: LIO_T, cornea_toric: CORNEA_T,
    planned_steep_axis_deg: 0, pupil_radius_mm: 1.5, referencia_vectorial_d: vect45.cyl_d,
  });
  assert.ok(Number.isFinite(grande.divergencia_vs_vectorial_d));
});

test('rotación · ancla 2C|sinθ| SOLO para cilindros IGUALES en el límite paraxial (módulos igualados midiendo)', () => {
  const pupil = 0.08;
  // medir el cilindro EFECTIVO de córnea y de la LIO con etiqueta 3, y reetiquetar la
  // LIO para IGUALAR módulos efectivos (la efectividad de vergencia hace que etiqueta
  // y efecto difieran — igualar por medición, no por fórmula)
  const cCornea = residualManual(postopDe(PRE_AST()), new GenericIOLFactory().create({ power_d: 21 }),
    { cornea_toric: CORNEA_T }, pupil).cyl;
  const cLio3 = residualManual(postopDe(ojo(), 0), LIO_T, {}, pupil).cyl;
  const etiquetaIgualada = 3 * (cCornea / cLio3);
  const lioIgualada = new SyntheticToricIOLFactory().create({ power_d: 21, cylinder_d: etiquetaIgualada });
  const cLioIgualada = residualManual(postopDe(ojo(), 0), lioIgualada, {}, pupil).cyl;
  assert.ok(Math.abs(cLioIgualada - cCornea) < 0.03, `módulos no igualados: ${cLioIgualada} vs ${cCornea}`);
  for (const theta of [10, 30, 45, 90]) {
    const r = evaluateToricRotationScenario({
      postop: postopDe(PRE_AST(), 90 + theta), iol: lioIgualada, cornea_toric: CORNEA_T,
      planned_steep_axis_deg: 0, pupil_radius_mm: pupil,
    });
    const ancla = 2 * cCornea * Math.abs(Math.sin(theta * Math.PI / 180));
    assert.ok(Math.abs(r.residual.cyl_d - ancla) < 0.08,
      `θ=${theta}: trazado ${r.residual.cyl_d.toFixed(4)} vs 2C|sinθ| ${ancla.toFixed(4)}`);
  }
  // a 30° con módulos iguales el residual ≈ C entero (lo que la fórmula errónea negaba)
  const en30 = evaluateToricRotationScenario({
    postop: postopDe(PRE_AST(), 120), iol: lioIgualada, cornea_toric: CORNEA_T,
    planned_steep_axis_deg: 0, pupil_radius_mm: pupil,
  });
  assert.ok(Math.abs(en30.residual.cyl_d - cCornea) < 0.08);
});

test('rotación · combinación rotación + tilt + descentración: orden fijado, NINGUNA rotación nueva', () => {
  // el módulo delega en buildRaytraceEye (R_tilt · Rz de pose.mjs): con pose completa
  // debe producir EXACTAMENTE los mismos números que el pipeline manual
  const pose = { tilt_x_deg: 3, decenter_y_mm: 0.4 };
  const post = postopDe(PRE_AST(), 20, pose);
  const r = evaluateToricRotationScenario({
    postop: post, iol: LIO_T, cornea_toric: CORNEA_T, planned_steep_axis_deg: 0,
  });
  const manual = residualManual(post, LIO_T, { cornea_toric: CORNEA_T });
  assert.equal(r.residual.cyl_d, manual.cyl);
  assert.equal(r.residual.steep_meridian_deg, manual.eje);
  // el error derivado usa SOLO rotation_z: el tilt no es rotación de eje tórico
  assert.equal(r.rotation_error_deg, signedAxisDiff_deg(normDeg180(90 + 20), 0));
  // y la pose viaja entera en parametros_declarados
  assert.equal(r.parametros_declarados.pose.tilt_x_deg, 3);
});

test('rotación · guardas: LIO sin geometría tórica se rechaza; STRICT bloquea el sustituto sintético', () => {
  assert.throws(() => evaluateToricRotationScenario({
    postop: postopDe(ojo(), 10), iol: new GenericIOLFactory().create({ power_d: 21 }),
    planned_steep_axis_deg: 90,
  }), /no tiene geometría tórica|no hay eje/);
  assert.throws(() => evaluateToricRotationScenario({
    postop: postopDe(PRE_AST(), 90), iol: LIO_T, cornea_toric: CORNEA_T,
    planned_steep_axis_deg: 0, fidelity: FidelityMode.STRICT,
  }), err => err instanceof StrictModeViolation);
});

test('rotación · vectorResidual es utilidad/ancla: álgebra exacta y caso degenerado explícito', () => {
  // dos iguales opuestos se anulan: módulo 0 y eje null EXPLÍCITO (no un eje arbitrario)
  const nulo = vectorResidual([
    { cyl_d: 2, steep_axis_deg: 90 }, { cyl_d: 2, steep_axis_deg: 0 },
  ]);
  assert.ok(nulo.cyl_d < 1e-12);
  assert.equal(nulo.steep_axis_deg, null);
  // 2C|sinθ| emerge del álgebra para iguales
  const r = vectorResidual([{ cyl_d: 3, steep_axis_deg: 0 }, { cyl_d: 3, steep_axis_deg: 90 + 30 }]);
  // componente a 120 = igual y opuesto girado 30 respecto del corrector perfecto (90)
  assert.ok(Math.abs(r.cyl_d - 2 * 3 * Math.sin(30 * Math.PI / 180)) < 1e-12);
  assert.throws(() => vectorResidual([{ cyl_d: -1, steep_axis_deg: 0 }]), /≥ 0/);
});
