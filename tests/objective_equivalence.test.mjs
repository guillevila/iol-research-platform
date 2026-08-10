/**
 * Demostración ejecutable de que BEST_FOCUS_ON_RETINA ≡ EQUIVALENT_DEFOCUS como criterios
 * de optimización (revisión pre-V1.2).
 *
 * La demostración formal está en la cabecera de `objective.mjs`:
 *   coste_B(P) = |z*(P) − z_ret|  y  coste_C(P) = |φ(z*(P))|  con φ estrictamente
 *   creciente y φ(z_ret) = 0  ⇒  mismos ceros, misma monotonía a cada lado, mismo argmin.
 *
 * Estos tests verifican cada eslabón por separado sobre el motor real, y además
 * reconstruyen el objetivo B eliminado para comprobar empíricamente que su óptimo
 * coincide con el de C. Si alguien reintroduce B como objetivo, o cambia `bestFocus` de
 * forma que rompa la equivalencia, esto falla.
 *
 * RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPreopEye, createPredictedPostopEye } from '../src/core/eye.mjs';
import { GenericIOLFactory } from '../src/core/iol_factory.mjs';
import { buildRaytraceEye } from '../src/optics/eyebuilder.mjs';
import { ObjectiveKind, evaluateObjective, traceBundle } from '../src/optics/objective.mjs';
import { bestFocus } from '../src/optics/raytrace/trace.mjs';
import { optimizePowerByRaytrace, defaultBundle } from '../src/optimize/raytrace_power.mjs';

function ojo({ al = 23.5, k = 43.5 } = {}) {
  const pre = createPreopEye({
    al_mm: al, k1_d: k, k1_axis_deg: 180, k2_d: k, k2_axis_deg: 90,
    acd_mm: 3.2, lt_mm: 4.5, cct_um: 550, meta: { source: 'synthetic' },
  });
  return createPredictedPostopEye(pre, { iol_position_mm: 4.9, position_source: 'test' });
}

const factory = new GenericIOLFactory();

/** z del mejor foco para una potencia dada — la MISMA computación que usan B y C. */
function mejorFocoDe(postop, P, aperture_mm, bundle) {
  const eye = buildRaytraceEye(postop, factory.create({ power_d: P }), { aperture_mm });
  const { rays } = traceBundle(eye.surfaces, bundle);
  const zUltima = Math.max(...eye.surfaces.map(s => s.kind === 'plane' ? s.z_mm : s.zVertex_mm));
  return { z: bestFocus(rays, zUltima + 0.05, eye.retina_z_mm + 15).z_mm, zRet: eye.retina_z_mm };
}

/** Reconstrucción del objetivo B eliminado: coste = |mejor foco − retina| en mm. */
function optimizarConB(postop, { pupil_mm, lo = 10, hi = 30, tol = 1e-7 }) {
  const aperture_mm = pupil_mm / 2;
  const bundle = defaultBundle(aperture_mm);
  const coste = P => { const { z, zRet } = mejorFocoDe(postop, P, aperture_mm, bundle); return Math.abs(z - zRet); };
  const phi = (Math.sqrt(5) - 1) / 2;
  let a = lo, b = hi;
  let c = b - phi * (b - a), d = a + phi * (b - a);
  let fc = coste(c), fd = coste(d);
  let guard = 0;
  while (b - a > tol && guard++ < 200) {
    if (fc < fd) { b = d; d = c; fd = fc; c = b - phi * (b - a); fc = coste(c); }
    else { a = c; c = d; fc = fd; d = a + phi * (b - a); fd = coste(d); }
  }
  return (a + b) / 2;
}

test('equivalencia: sign(residual_d) = sign(z* − z_ret) y cero común — el eslabón φ', () => {
  // φ estrictamente creciente con φ(z_ret)=0 implica que el residuo dióptrico y el
  // desplazamiento en mm comparten signo y cero. Se verifica sobre el motor real
  // barriendo potencias a ambos lados del óptimo, en tres ojos distintos.
  for (const geom of [{ al: 22.0, k: 45.0 }, { al: 23.5, k: 43.5 }, { al: 26.0, k: 42.0 }]) {
    const postop = ojo(geom);
    const aperture_mm = 1.5;
    const bundle = defaultBundle(aperture_mm);
    let cruces = 0, signoPrevio = null;
    for (let P = 12; P <= 32; P += 0.5) {
      const eye = buildRaytraceEye(postop, factory.create({ power_d: P }), { aperture_mm });
      const c = evaluateObjective(eye, bundle, ObjectiveKind.EQUIVALENT_DEFOCUS);
      const despl = c.detail.desplazamiento_mm;
      if (Math.abs(despl) > 1e-9) {
        assert.equal(Math.sign(c.residual_d), Math.sign(despl),
          `AL=${geom.al} P=${P}: residual ${c.residual_d} y desplazamiento ${despl} discrepan en signo`);
      }
      const s = Math.sign(despl);
      if (signoPrevio !== null && s !== signoPrevio) cruces++;
      signoPrevio = s;
    }
    assert.equal(cruces, 1, `AL=${geom.al}: el cero debe ser único en el barrido (cruces=${cruces})`);
  }
});

test('equivalencia: z*(P) es estrictamente decreciente — el cero común es único', () => {
  const postop = ojo();
  const aperture_mm = 1.5;
  const bundle = defaultBundle(aperture_mm);
  let zPrevio = null;
  for (let P = 12; P <= 32; P += 1) {
    const { z } = mejorFocoDe(postop, P, aperture_mm, bundle);
    if (zPrevio !== null) assert.ok(z < zPrevio, `z*(${P}) = ${z} no decrece (previo ${zPrevio})`);
    zPrevio = z;
  }
});

test('equivalencia: mismo ORDEN de costes a cada lado del óptimo (lo que usa el buscador)', () => {
  // la sección áurea solo consulta comparaciones coste(P1) < coste(P2); si B y C ordenan
  // igual a cada lado del óptimo, no pueden separarse. Se verifica la implicación
  // coste_B(P1) < coste_B(P2) ⇔ coste_C(P1) < coste_C(P2) para pares del mismo lado.
  const postop = ojo();
  const aperture_mm = 2.0;
  const bundle = defaultBundle(aperture_mm);
  const evalC = P => evaluateObjective(
    buildRaytraceEye(postop, factory.create({ power_d: P }), { aperture_mm }),
    bundle, ObjectiveKind.EQUIVALENT_DEFOCUS);
  const optimo = optimizePowerByRaytrace({ postop, factory, pupil_mm: 4.0, tol_d: 1e-7 }).exact_power_d;
  const lados = [[-4, -2.5, -1.2, -0.4], [0.4, 1.2, 2.5, 4]];
  for (const deltas of lados) {
    const evaluaciones = deltas.map(d => {
      const e = evalC(optimo + d);
      return { costeB: Math.abs(e.detail.desplazamiento_mm), costeC: e.cost };
    });
    for (let i = 0; i < evaluaciones.length; i++) {
      for (let j = i + 1; j < evaluaciones.length; j++) {
        assert.equal(
          evaluaciones[i].costeB < evaluaciones[j].costeB,
          evaluaciones[i].costeC < evaluaciones[j].costeC,
          `orden distinto entre B y C dentro del mismo lado: ${JSON.stringify([evaluaciones[i], evaluaciones[j]])}`);
      }
    }
  }
});

test('equivalencia: el argmin del B reconstruido coincide con el de C en varios ojos y pupilas', () => {
  for (const [geom, pupil_mm] of [
    [{ al: 22.0, k: 45.0 }, 3.0],
    [{ al: 23.5, k: 43.5 }, 5.0],
    [{ al: 26.0, k: 42.0 }, 4.0],
  ]) {
    const postop = ojo(geom);
    const pC = optimizePowerByRaytrace({
      postop, factory, pupil_mm, tol_d: 1e-7, objective: ObjectiveKind.EQUIVALENT_DEFOCUS,
    }).exact_power_d;
    const pB = optimizarConB(postop, { pupil_mm, lo: pC - 8, hi: pC + 8 });
    assert.ok(Math.abs(pB - pC) < 1e-4,
      `AL=${geom.al} pupila=${pupil_mm}: B reconstruido ${pB} vs C ${pC} (Δ=${Math.abs(pB - pC)})`);
  }
});

test('equivalencia: A NO comparte argmin con C — es el criterio genuinamente independiente', () => {
  // con aberración, minimizar el RMS EN la retina no equivale a llevar el mejor foco A la
  // retina. Si esta diferencia desapareciera, A también sería redundante y habría que
  // revisar el conjunto de objetivos otra vez.
  const postop = ojo();
  const pA = optimizePowerByRaytrace({
    postop, factory, pupil_mm: 6.0, tol_d: 1e-7, objective: ObjectiveKind.SPOT_RMS_AT_RETINA,
  }).exact_power_d;
  const pC = optimizePowerByRaytrace({
    postop, factory, pupil_mm: 6.0, tol_d: 1e-7, objective: ObjectiveKind.EQUIVALENT_DEFOCUS,
  }).exact_power_d;
  const dif = Math.abs(pA - pC);
  assert.ok(dif > 1e-3, `A y C coinciden a ${dif} D con pupila 6 mm: A habría dejado de ser independiente`);
  assert.ok(dif < 0.5, `A y C difieren ${dif} D: demasiado para superficies esféricas, algo va mal`);
});

test('equivalencia: BEST_FOCUS_ON_RETINA ya no es expresable, y el error explica por qué', () => {
  assert.equal(ObjectiveKind.BEST_FOCUS_ON_RETINA, undefined);
  assert.equal(Object.values(ObjectiveKind).length, 2);
  const postop = ojo();
  const eye = buildRaytraceEye(postop, factory.create({ power_d: 20 }), { aperture_mm: 1.5 });
  assert.throws(
    () => evaluateObjective(eye, defaultBundle(1.5), 'BEST_FOCUS_ON_RETINA'),
    /equivalente a\s+EQUIVALENT_DEFOCUS/s,
    'el mensaje debe explicar la eliminación, no solo rechazar');
  // y su métrica sigue disponible como reporte
  const c = evaluateObjective(eye, defaultBundle(1.5), ObjectiveKind.EQUIVALENT_DEFOCUS);
  assert.equal(typeof c.detail.desplazamiento_mm, 'number');
  assert.ok(Math.abs(c.detail.desplazamiento_mm - (c.bestFocus_mm - eye.retina_z_mm)) < 1e-12);
});
