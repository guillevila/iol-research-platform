/**
 * Tests de la pose rígida de LIO (V1.3).
 *
 * LA PUERTA COAXIAL NO SE APLICA INGENUAMENTE: con tilt/descentración no existe el
 * límite paraxial coaxial (y `paraxialFocusOfRaytraceEye` lo dice con error, no con un
 * número equivocado). La validación de sistemas posados es la que exige el encargo:
 *
 *   0. pose CERO recupera V1.2 EXACTAMENTE (estructural: sin envoltorio);
 *   1. REVERSIBILIDAD de Snell sobre superficies transformadas;
 *   2. casos ANALÍTICOS independientes (esfera girada sobre su centro ≡ invariante;
 *      descentración ≡ traslación del problema; lámina plano-paralela inclinada:
 *      dirección conservada + desplazamiento lateral cerrado);
 *   3. SIMETRÍA ±pose (rotar el sistema 180° alrededor de z no cambia ningún escalar);
 *   4. CONTINUIDAD pose→0 (y paridad: los escalares son funciones PARES de la pose);
 *   5. SIN pérdidas de rayos artificiales en el rango declarado.
 *
 * RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sphericalSurface, conicSurface, planarSurface, transformedSurface, intersect, refractDirection } from '../src/optics/raytrace/surfaces.mjs';
import { traceRay, bestFocus } from '../src/optics/raytrace/trace.mjs';
import { createIOLPose, poseFromClinical, negatePose, isIdentityPose, rotationOfPose, PoseSource } from '../src/core/pose.mjs';
import { createPreopEye, createPredictedPostopEye } from '../src/core/eye.mjs';
import { GenericIOLFactory, ManufacturerIOLFactory } from '../src/core/iol_factory.mjs';
import { buildRaytraceEye, paraxialFocusOfRaytraceEye, compareParaxialVsRaytrace } from '../src/optics/eyebuilder.mjs';
import { ObjectiveKind, evaluateObjective } from '../src/optics/objective.mjs';
import { generateBundle, SamplingKind } from '../src/optics/raytrace/bundle.mjs';
import { optimizePowerByRaytrace } from '../src/optimize/raytrace_power.mjs';
import { recommendToric } from '../src/toric/toric_engine.mjs';
import { monteCarloRefraction } from '../src/uncertainty/montecarlo.mjs';
import { FidelityMode } from '../src/core/fidelity.mjs';

const norm = v => { const n = Math.hypot(...v); return v.map(x => x / n); };

function ojoMedido() {
  return createPreopEye({
    al_mm: 23.5, k1_d: 43.5, k1_axis_deg: 180, k2_d: 43.5, k2_axis_deg: 90,
    acd_mm: 3.2, lt_mm: 4.5, cct_um: 550, keratometric_index: 1.3375,
    cornea: { r_anterior_mm: 7.7, r_posterior_mm: 6.8 },
    meta: { source: 'synthetic' },
  });
}
const postopCon = pose => createPredictedPostopEye(ojoMedido(), {
  iol_position_mm: 4.9, position_source: 'test', ...(pose !== undefined ? { iol_pose: pose } : {}),
});
const factory = new GenericIOLFactory();
const haz2D = radio => generateBundle({ radius_mm: radio, kind: SamplingKind.FIBONACCI_SPIRAL, n: 32 }).rays;

// ---------------------------------------------------------------------------
// 0 · pose cero ≡ V1.2, estructuralmente
// ---------------------------------------------------------------------------

test('pose 0: cero explícito y null producen EXACTAMENTE las superficies de V1.2', () => {
  const sinPose = buildRaytraceEye(postopCon(undefined), factory.create({ power_d: 21 }));
  const poseCero = buildRaytraceEye(postopCon({ tilt_x_deg: 0, tilt_y_deg: 0, decenter_x_mm: 0, decenter_y_mm: 0, rotation_z_deg: 0 }), factory.create({ power_d: 21 }));
  assert.deepEqual(poseCero.surfaces, sinPose.surfaces, 'pose cero debe evitar el envoltorio: vía V1.2 exacta');
  assert.equal(poseCero.surfaces.filter(s => s.kind === 'transformed').length, 0);
  assert.equal(poseCero.iol_back_z_mm, sinPose.iol_back_z_mm);
  assert.ok(isIdentityPose(null) && isIdentityPose(poseCero.pose ?? null));
  // y el foco paraxial coaxial sigue disponible (el sistema ES coaxial)
  assert.equal(paraxialFocusOfRaytraceEye(poseCero), paraxialFocusOfRaytraceEye(sinPose));
});

test('pose ≠ 0: el límite paraxial COAXIAL se rechaza con guía, no se calcula mal', () => {
  const eye = buildRaytraceEye(postopCon({ tilt_x_deg: 4 }), factory.create({ power_d: 21 }));
  assert.throws(() => paraxialFocusOfRaytraceEye(eye), /COAXIAL no está definido/);
  assert.throws(() => compareParaxialVsRaytrace(eye), /coaxial/);
  // y el optimizador rechaza el muestreo meridional (un corte de un sistema asimétrico)
  assert.throws(() => optimizePowerByRaytrace({ postop: postopCon({ tilt_x_deg: 4 }), pupil_mm: 3 }),
    /muestreo MERIDIONAL con pose/);
});

// ---------------------------------------------------------------------------
// 1 · reversibilidad sobre superficie transformada
// ---------------------------------------------------------------------------

test('pose · reversibilidad: intersección+refracción invertidas recuperan el rayo original', () => {
  const R = rotationOfPose(createIOLPose({ tilt_x_deg: 6, tilt_y_deg: 3 }));
  const T = [0.4, -0.6, 8];
  const S12 = transformedSurface({ base: conicSurface({ id: 'r', zVertex_mm: 0, radius_mm: 9, k: -0.4, aperture_mm: 5, n_before: 1, n_after: 1.49 }), R, T });
  const S21 = transformedSurface({ base: conicSurface({ id: 'r2', zVertex_mm: 0, radius_mm: 9, k: -0.4, aperture_mm: 5, n_before: 1.49, n_after: 1 }), R, T });
  for (const r0 of [
    { p: [0.3, 1.1, -5], d: norm([0.02, -0.05, 1]) },
    { p: [-1.2, 0.4, -5], d: norm([-0.03, 0.01, 1]) },
  ]) {
    const h = intersect(S12, r0);
    assert.ok(h, 'ida perdida');
    const rf = refractDirection(r0.d, h.normal, 1, 1.49);
    const atras = intersect(S21, { p: h.point.map((v, i) => v + 2 * rf.d[i]), d: rf.d.map(v => -v) });
    assert.ok(atras, 'vuelta perdida');
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(atras.point[i] - h.point[i]) < 1e-12, `punto[${i}]`);
    const rb = refractDirection(rf.d.map(v => -v), atras.normal, 1.49, 1);
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(rb.d[i] - (-r0.d[i])) < 1e-12, `dirección[${i}]`);
  }
});

// ---------------------------------------------------------------------------
// 2 · casos analíticos independientes con pose ≠ 0
// ---------------------------------------------------------------------------

test('pose · analítico 1: girar una esfera alrededor de su CENTRO de curvatura la deja invariante', () => {
  // la rotación de una esfera sobre su centro es la misma esfera: cualquier diferencia
  // sería un error de la transformación rígida, no de la óptica
  const base = sphericalSurface({ id: 'b', zVertex_mm: -10, radius_mm: 10, aperture_mm: 6, n_before: 1, n_after: 1.5 });
  const T = [0, 0, 20];
  const s0 = transformedSurface({ base, R: rotationOfPose(createIOLPose({})), T });
  const st = transformedSurface({ base, R: rotationOfPose(createIOLPose({ tilt_x_deg: 4, tilt_y_deg: -2.5 })), T });
  for (const [x, y] of [[0.5, 1.2], [-2, 0.7], [1.5, -1.5]]) {
    const a = intersect(s0, { p: [x, y, -5], d: [0, 0, 1] });
    const b = intersect(st, { p: [x, y, -5], d: [0, 0, 1] });
    for (let i = 0; i < 3; i++) {
      assert.ok(Math.abs(a.point[i] - b.point[i]) < 1e-12, `punto[${i}]`);
      assert.ok(Math.abs(a.normal[i] - b.normal[i]) < 1e-12, `normal[${i}]`);
    }
  }
});

test('pose · analítico 2: descentrar la superficie ≡ trasladar el problema entero', () => {
  const base = conicSurface({ id: 'c', zVertex_mm: 0, radius_mm: 7.7, k: -0.3, aperture_mm: 4, n_before: 1, n_after: 1.336 });
  const I = rotationOfPose(createIOLPose({}));
  const dy = 0.8;
  const desc = transformedSurface({ base, R: I, T: [0, dy, 5] });
  const cent = transformedSurface({ base, R: I, T: [0, 0, 5] });
  for (const h of [0.4, 1.1, 2.0]) {
    const a = intersect(desc, { p: [0.2, h + dy, -5], d: [0, 0, 1] });
    const b = intersect(cent, { p: [0.2, h, -5], d: [0, 0, 1] });
    assert.ok(Math.abs(a.point[1] - dy - b.point[1]) < 1e-12);
    assert.ok(Math.abs(a.point[2] - b.point[2]) < 1e-12);
    const ra = refractDirection([0, 0, 1], a.normal, 1, 1.336);
    const rb = refractDirection([0, 0, 1], b.normal, 1, 1.336);
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(ra.d[i] - rb.d[i]) < 1e-12, `refracción[${i}]`);
  }
});

test('pose · analítico 3: lámina plano-paralela INCLINADA — dirección conservada y desplazamiento cerrado', () => {
  //   d_lateral = t·sin(θi−θt)/cos(θt),  sinθt = sinθi/n  (forma cerrada clásica)
  for (const [tilt, n, t] of [[12, 1.5, 3], [7, 1.336, 2], [20, 1.7, 1.5]]) {
    const R = rotationOfPose(createIOLPose({ tilt_x_deg: tilt }));
    const p1 = transformedSurface({ base: planarSurface({ id: 'a', z_mm: -t / 2, aperture_mm: 30, n_before: 1, n_after: n }), R, T: [0, 0, 10] });
    const p2 = transformedSurface({ base: planarSurface({ id: 'b', z_mm: +t / 2, aperture_mm: 30, n_before: n, n_after: 1 }), R, T: [0, 0, 10] });
    const tr = traceRay([p1, p2], { p: [0, 0, 0], d: [0, 0, 1] });
    assert.ok(tr.ok);
    for (let i = 0; i < 3; i++) {
      assert.ok(Math.abs(tr.ray.d[i] - [0, 0, 1][i]) < 1e-12,
        'una lámina plano-paralela conserva la dirección EXACTAMENTE, esté o no inclinada');
    }
    const thI = tilt * Math.PI / 180;
    const thT = Math.asin(Math.sin(thI) / n);
    const dCerrado = t * Math.sin(thI - thT) / Math.cos(thT);
    const dMedido = Math.hypot(tr.ray.p[0], tr.ray.p[1]);
    assert.ok(Math.abs(dMedido - dCerrado) < 1e-12,
      `tilt=${tilt}° n=${n}: desplazamiento ${dMedido} vs cerrado ${dCerrado}`);
  }
});

// ---------------------------------------------------------------------------
// 3 · simetría ±pose  ·  4 · continuidad y paridad pose→0  ·  5 · sin pérdidas
// ---------------------------------------------------------------------------

test('pose · simetría ±: rotar el sistema 180° alrededor de z no cambia ningún escalar', () => {
  const pose = createIOLPose({ tilt_x_deg: 5, tilt_y_deg: -2, decenter_x_mm: 0.3, decenter_y_mm: 0.4 });
  const lente = factory.create({ power_d: 21 });
  const eyeMas = buildRaytraceEye(postopCon(pose), lente);
  const eyeMenos = buildRaytraceEye(postopCon(negatePose(pose)), lente);
  // por rayo: (x,y) en +pose ↔ (−x,−y) en −pose, con salida rotada 180°
  for (const [x, y] of [[0.4, 1.0], [-0.9, 0.6], [1.2, -0.3]]) {
    const a = traceRay(eyeMas.surfaces, { p: [x, y, -5], d: [0, 0, 1] });
    const b = traceRay(eyeMenos.surfaces, { p: [-x, -y, -5], d: [0, 0, 1] });
    assert.ok(a.ok && b.ok);
    for (const [i, signo] of [[0, -1], [1, -1], [2, 1]]) {
      assert.ok(Math.abs(a.ray.p[i] - signo * b.ray.p[i]) < 1e-12, `p[${i}]`);
      assert.ok(Math.abs(a.ray.d[i] - signo * b.ray.d[i]) < 1e-12, `d[${i}]`);
    }
  }
  // y el escalar de decisión: misma potencia óptima. OJO: la afirmación de simetría es
  // sobre la FÍSICA, así que la cuadratura debe ser 180°-simétrica — los anillos con
  // perRing PAR lo son exactamente; la espiral de Fibonacci NO (sus azimuts áureos
  // rompen la simetría del muestreo y fabricarían un falso término impar)
  const opts = { pupil_mm: 4, sampling: SamplingKind.RINGS_EQUAL_AREA, n_anillos: 12, perRing: 8, tol_d: 1e-6 };
  const pMas = optimizePowerByRaytrace({ postop: postopCon(pose), factory, ...opts }).exact_power_d;
  const pMenos = optimizePowerByRaytrace({ postop: postopCon(negatePose(pose)), factory, ...opts }).exact_power_d;
  assert.ok(Math.abs(pMas - pMenos) < 2e-3,
    `±pose debe dar la misma potencia: ${pMas} vs ${pMenos}`);
});

test('pose · continuidad→0 y paridad: el efecto escalar es PAR y se apaga como O(s²)', () => {
  // Cuadratura 180°-simétrica obligatoria (la paridad es de la física; el muestreo no
  // debe fabricarle un término impar). Y la LECCIÓN del sondeo que diseñó este test:
  // la paridad garantiza que P*(s·pose) es función PAR de s, pero NO que el término s²
  // domine a cualquier escala — con 0.8 mm de descentración el efecto medido CAMBIA DE
  // SIGNO entre s=1 (+0.70 D) y s=0.5 (−0.13 D): los órdenes altos mandan lejos del
  // régimen asintótico. El O(s²) se exige donde es teorema (s→0), eje a eje.
  const opts = { pupil_mm: 4, sampling: SamplingKind.RINGS_EQUAL_AREA, n_anillos: 12, perRing: 8, tol_d: 1e-7 };
  const P0 = optimizePowerByRaytrace({ postop: postopCon(undefined), factory, ...opts }).exact_power_d;
  const PDe = pose => optimizePowerByRaytrace({ postop: postopCon(pose), factory, ...opts }).exact_power_d;

  // tilt puro: cuadrático limpio ya desde 8° (ratios medidos 4.00 / 4.00)
  const eTilt = [1, 0.5, 0.25].map(s => Math.abs(PDe(createIOLPose({ tilt_x_deg: 8 * s })) - P0));
  assert.ok(eTilt[0] > 5e-2, `el tilt de 8° debe tener efecto medible: ${eTilt[0]} D`);
  for (let i = 1; i < eTilt.length; i++) {
    const orden = eTilt[i - 1] / eTilt[i];
    assert.ok(orden > 3.4 && orden < 4.6, `tilt: orden ${orden.toFixed(2)} ≠ 4`);
  }

  // descentración pura: asintótica solo por debajo de ~0.2 mm (ratio medido 3.96)
  const eDec = [0.25, 0.125].map(s => Math.abs(PDe(createIOLPose({ decenter_y_mm: 0.8 * s })) - P0));
  const ordenDec = eDec[0] / eDec[1];
  assert.ok(ordenDec > 3.3 && ordenDec < 4.7, `descentración: orden ${ordenDec.toFixed(2)} ≠ 4`);

  // combinada: mismo teorema en el límite (ratio medido 3.96)
  const eComb = [0.25, 0.125].map(s => Math.abs(PDe(createIOLPose({ tilt_x_deg: 8 * s, decenter_y_mm: 0.8 * s })) - P0));
  const ordenComb = eComb[0] / eComb[1];
  assert.ok(ordenComb > 3.3 && ordenComb < 4.7, `combinada: orden ${ordenComb.toFixed(2)} ≠ 4`);

  // y continuidad: el efecto se apaga de verdad
  assert.ok(eComb[1] < 0.06, `a s=0.125 debería quedar poco efecto: ${eComb[1]} D`);
});

test('pose · sin pérdidas artificiales en el rango declarado (tilt ≤ 10°, descentración ≤ 1 mm)', () => {
  const lente = factory.create({ power_d: 21 });
  for (const tilt of [2.5, 5, 7.5, 10]) {
    for (const dec of [0, 0.5, 1.0]) {
      const eye = buildRaytraceEye(postopCon(createIOLPose({ tilt_x_deg: tilt, decenter_y_mm: dec })), lente, { aperture_mm: 3 });
      const ev = evaluateObjective(eye, haz2D(2), ObjectiveKind.EQUIVALENT_DEFOCUS);
      assert.equal(ev.raysLost, 0, `tilt=${tilt}° dec=${dec}mm: ${ev.raysLost} rayos perdidos`);
      assert.ok(Number.isFinite(ev.cost));
    }
  }
});

// ---------------------------------------------------------------------------
// convenciones: clínica↔componentes, rotation_z, plausibilidad
// ---------------------------------------------------------------------------

test('pose · poseFromClinical ≡ componentes (misma rotación exacta) y guardas de dominio', () => {
  const clinica = poseFromClinical({ tilt_deg: 5, tilt_axis_deg: 30, decenter_mm: 0.5, decenter_axis_deg: 120 });
  const directa = createIOLPose({
    tilt_x_deg: 5 * Math.cos(Math.PI / 6), tilt_y_deg: 5 * Math.sin(Math.PI / 6),
    decenter_x_mm: 0.5 * Math.cos(2 * Math.PI / 3), decenter_y_mm: 0.5 * Math.sin(2 * Math.PI / 3),
  });
  assert.ok(Math.abs(clinica.tilt_x_deg - directa.tilt_x_deg) < 1e-12);
  assert.ok(Math.abs(clinica.decenter_y_mm - directa.decenter_y_mm) < 1e-12);
  assert.ok(Math.abs(clinica.tilt_total_deg - 5) < 1e-12);
  const Ra = rotationOfPose(clinica), Rb = rotationOfPose(directa);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) assert.ok(Math.abs(Ra[i][j] - Rb[i][j]) < 1e-12);
  // plausibilidad: unidades equivocadas se rechazan
  assert.throws(() => createIOLPose({ tilt_x_deg: 45 }), /fuera de plausibilidad/);
  assert.throws(() => createIOLPose({ decenter_x_mm: 5 }), /fuera de plausibilidad/);
  assert.throws(() => poseFromClinical({ tilt_deg: -3 }), /no negativas/);
});

test('pose · rotation_z es exactamente inerte en superficies de revolución (convención V1.7 fijada)', () => {
  const lente = factory.create({ power_d: 21 });
  const conRot = buildRaytraceEye(postopCon(createIOLPose({ tilt_x_deg: 5, rotation_z_deg: 137 })), lente);
  const sinRot = buildRaytraceEye(postopCon(createIOLPose({ tilt_x_deg: 5, rotation_z_deg: 0 })), lente);
  for (const [x, y] of [[0.5, 1.0], [-1.1, 0.2]]) {
    const a = traceRay(conRot.surfaces, { p: [x, y, -5], d: [0, 0, 1] });
    const b = traceRay(sinRot.surfaces, { p: [x, y, -5], d: [0, 0, 1] });
    for (let i = 0; i < 3; i++) {
      assert.ok(Math.abs(a.ray.p[i] - b.ray.p[i]) < 1e-12, `p[${i}]: rotation_z alteró una superficie simétrica`);
      assert.ok(Math.abs(a.ray.d[i] - b.ray.d[i]) < 1e-12, `d[${i}]`);
    }
  }
});

// ---------------------------------------------------------------------------
// Regresiones de la revisión adversarial de V1.3
// ---------------------------------------------------------------------------

test('pose · regresión: recommendToric RECHAZA la pose en vez de ignorarla (bypass reeditado, cerrado)', () => {
  const posado = postopCon(createIOLPose({ tilt_x_deg: 5 }));
  assert.throws(() => recommendToric({ postop: posado, sePower_d: 20, catalog_d: [1.5, 2.25] }),
    /motor tórico paraxial\s+por meridianos no puede representarla/s);
});

test('pose · regresión: Monte Carlo no puede tragarse una pose ni una sigma de K sin efecto', () => {
  const pre = ojoMedido();
  // V1.6: la guarda dejó de ser enumerativa — CUALQUIER clave desconocida se rechaza
  // NOMBRÁNDOLA (antes solo iol_pose/postop; iol:/cylinder_d: se tragaban en silencio)
  assert.throws(() => monteCarloRefraction({
    preop: pre, iol_position_mm: 4.9, power_d: 21, seed: 7, n: 50, iol_pose: { tilt_x_deg: 5 },
  }), /parámetros no soportados: iol_pose/);
  assert.throws(() => monteCarloRefraction({
    preop: pre, iol_position_mm: 4.9, power_d: 21, seed: 7, n: 50, cylinder_d: 3,
  }), /parámetros no soportados: cylinder_d/);
  // córnea de radios MEDIDOS + sigma de K: la perturbación no tendría efecto → rechazo
  assert.throws(() => monteCarloRefraction({
    preop: pre, iol_position_mm: 4.9, power_d: 21, seed: 7, n: 50, sigmas: { mean_k_d: 0.1 },
  }), /sigma de K con córnea de radios MEDIDOS/);
  // y la córnea medida del llamador YA NO se descarta: la política del MC es la medida
  const r = monteCarloRefraction({ preop: pre, iol_position_mm: 4.9, power_d: 21, seed: 7, n: 50 });
  assert.deepEqual(r.supuestos_modelo, [], 'con córnea medida el MC no debe asumir nada');
});

test('pose · regresión: evaluateObjective rechaza haz MERIDIONAL sobre ojo posado (guarda replicada)', () => {
  const eye = buildRaytraceEye(postopCon(createIOLPose({ tilt_x_deg: 5 })), factory.create({ power_d: 21 }));
  const meridional = generateBundle({ radius_mm: 1.5, kind: SamplingKind.MERIDIONAL, n: 6 }).rays;
  assert.throws(() => evaluateObjective(eye, meridional, ObjectiveKind.EQUIVALENT_DEFOCUS),
    /haz meridional.*sobre un ojo\s+con pose/s);
  // el mismo ojo con haz 2D evalúa sin problema
  const ev = evaluateObjective(eye, haz2D(1.5), ObjectiveKind.EQUIVALENT_DEFOCUS);
  assert.ok(Number.isFinite(ev.cost));
});

test('pose · regresión: un ojo POSADO con todo documentado pasa STRICT (estado previsto ≠ imputación)', () => {
  const pre = createPreopEye({
    al_mm: 23.5, k1_d: 43.5, k1_axis_deg: 180, k2_d: 43.5, k2_axis_deg: 90,
    acd_mm: 3.2, lt_mm: 4.5, cct_um: 550, keratometric_index: 1.3375,
    cornea: { r_anterior_mm: 7.7, r_posterior_mm: 6.8, asphericity_q_anterior: -0.18, asphericity_q_posterior: -0.30 },
    meta: { source: 'synthetic' },
  });
  const posado = createPredictedPostopEye(pre, {
    iol_position_mm: 4.9, position_source: 'test', iol_pose: { tilt_x_deg: 5, decenter_y_mm: 0.3 },
  });
  const lenteQ = new ManufacturerIOLFactory({
    manufacturer: 'ACME', model: 'MQ', provenance: 'FICTICIA — fixture de test, no es una ficha real',
    geometryByPower: { 20: { refractive_index: 1.47, central_thickness_mm: 0.7, r_anterior_mm: 20, r_posterior_mm: -20, asphericity_q_anterior: -0.1, asphericity_q_posterior: -0.1 } },
  }).create({ power_d: 20 });
  const eye = buildRaytraceEye(posado, lenteQ, { fidelity: FidelityMode.STRICT });
  assert.deepEqual(eye.assumptions, [], 'la pose declarada no es imputación: STRICT pasa');
  assert.equal(eye.surfaces.filter(s => s.kind === 'transformed').length, 2);
});

test('pose · regresión: el optimizador deja rastro de la pose honrada, y bestFocus no clava bordes', () => {
  const pose = createIOLPose({ tilt_x_deg: 5, decenter_y_mm: 0.4 });
  const r = optimizePowerByRaytrace({
    postop: postopCon(pose), factory, pupil_mm: 4,
    sampling: SamplingKind.FIBONACCI_SPIRAL, n_anillos: 32,
  });
  assert.equal(r.parametros_declarados.pose.tilt_total_deg, 5);
  assert.equal(r.parametros_declarados.pose.decenter_total_mm, 0.4);
  const sinPose = optimizePowerByRaytrace({ postop: postopCon(undefined), factory, pupil_mm: 4 });
  assert.equal(sinPose.parametros_declarados.pose, null);
  // bestFocus: un bracket que excluye el foco falla en vez de devolver el borde
  const eye = buildRaytraceEye(postopCon(undefined), factory.create({ power_d: 21 }));
  const rays = haz2D(1.5).map(r0 => traceRay(eye.surfaces, r0)).filter(t => t.ok).map(t => t.ray);
  assert.throws(() => bestFocus(rays, eye.retina_z_mm + 5, eye.retina_z_mm + 20),
    /borde del\s+bracket/s);
});

test('pose · procedencia (V1.5): PoseSource viaja, se valida y no cambia ninguna física', () => {
  // la validación futura distinguirá pose OBSERVADA de PREDICHA: hoy es trazabilidad pura
  const declarada = createIOLPose({ tilt_x_deg: 5 });
  assert.equal(declarada.source, PoseSource.DECLARED_SCENARIO);
  const medida = createIOLPose({ tilt_x_deg: 5, source: PoseSource.MEASURED });
  assert.equal(medida.source, PoseSource.MEASURED);
  assert.equal(poseFromClinical({ tilt_deg: 5, tilt_axis_deg: 0, source: PoseSource.PREDICTED }).source,
    PoseSource.PREDICTED);
  assert.equal(negatePose(medida).source, PoseSource.MEASURED);
  assert.throws(() => createIOLPose({ tilt_x_deg: 5, source: 'ADIVINADA' }), /pose source desconocido/);
  // misma física con distinta procedencia: la rotación es idéntica
  const Ra = rotationOfPose(declarada), Rb = rotationOfPose(medida);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) assert.equal(Ra[i][j], Rb[i][j]);
  // y viaja hasta la salida del optimizador
  const r = optimizePowerByRaytrace({
    postop: postopCon(medida), factory, pupil_mm: 4,
    sampling: SamplingKind.FIBONACCI_SPIRAL, n_anillos: 32,
  });
  assert.equal(r.parametros_declarados.pose.source, PoseSource.MEASURED);
});
