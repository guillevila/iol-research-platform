/**
 * Tests del optimizador de potencia por trazado y de los objetivos ópticos (V1.1).
 *
 * LA REFERENCIA CORRECTA, Y POR QUÉ IMPORTA
 * -----------------------------------------
 * Al cerrar la pupila, el trazado debe converger al PARAXIAL DEL MISMO SISTEMA FÍSICO —
 * no al paraxial de lente delgada. Confundirlos hace aparecer una divergencia de ~0.24 D
 * que no es un defecto: es la diferencia lente delgada ↔ gruesa (planos principales
 * separados), y escala con el espesor, no con la pupila.
 *
 * Con la referencia correcta, la convergencia observada es O(pupila²) exacta, que es el
 * orden de la aberración esférica. Ese es el criterio de aceptación real de V1.1/V1.13:
 * no "la diferencia es pequeña", sino "la diferencia es aberración y desaparece como debe".
 *
 * RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPreopEye, createPredictedPostopEye } from '../src/core/eye.mjs';
import { GenericIOLFactory, ManufacturerIOLFactory } from '../src/core/iol_factory.mjs';
import { buildParaxialEye, buildRaytraceEye, paraxialFocusOfRaytraceEye } from '../src/optics/eyebuilder.mjs';
import { ObjectiveKind, evaluateObjective, equivalentDefocus_d, describeObjective } from '../src/optics/objective.mjs';
import { optimizePowerByRaytrace, compareObjectives, defaultBundle } from '../src/optimize/raytrace_power.mjs';

function ojo({ al = 23.5, k = 43.5, pos = 4.9 } = {}) {
  const pre = createPreopEye({
    al_mm: al, k1_d: k, k1_axis_deg: 180, k2_d: k, k2_axis_deg: 90,
    acd_mm: 3.2, lt_mm: 4.5, cct_um: 550, meta: { source: 'synthetic' },
  });
  return createPredictedPostopEye(pre, { iol_position_mm: pos, position_source: 'test' });
}

/** Potencia que sitúa el foco PARAXIAL del sistema trazado exactamente en la retina. */
function paraxialDelSistemaTrazado(postop, factory = new GenericIOLFactory()) {
  const desvio = P => {
    const eye = buildRaytraceEye(postop, factory.create({ power_d: P }));
    return paraxialFocusOfRaytraceEye(eye) - eye.retina_z_mm;
  };
  let lo = 5, hi = 45;
  for (let i = 0; i < 100; i++) { const m = (lo + hi) / 2; if (desvio(m) > 0) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

test('V1.1: los objetivos convergen ENTRE SÍ al cerrar la pupila', () => {
  const post = ojo();
  for (const pupil_mm of [0.5, 0.2, 0.05]) {
    const potencias = Object.values(ObjectiveKind).map(objective =>
      optimizePowerByRaytrace({ postop: post, objective, pupil_mm, tol_d: 1e-6 }).exact_power_d);
    const rango = Math.max(...potencias) - Math.min(...potencias);
    assert.ok(rango < 1e-3,
      `pupila ${pupil_mm} mm: los objetivos discrepan ${rango} D. Sin aberración no pueden diferir.`);
  }
});

test('V1.1: el trazado converge al paraxial DEL MISMO SISTEMA como O(pupila²)', () => {
  const post = ojo();
  const referencia = paraxialDelSistemaTrazado(post);
  const pupilas = [0.4, 0.2, 0.1, 0.05];
  const errores = pupilas.map(pupil_mm => Math.abs(
    optimizePowerByRaytrace({ postop: post, pupil_mm, tol_d: 1e-7 }).exact_power_d - referencia));
  // al halvar la pupila el error se divide por 4: es aberración esférica, no un sesgo
  for (let i = 1; i < errores.length; i++) {
    const orden = errores[i - 1] / errores[i];
    assert.ok(Math.abs(orden - 4) < 0.15,
      `orden ${orden.toFixed(3)} ≠ 4 entre pupila ${pupilas[i - 1]} y ${pupilas[i]} mm`);
  }
  assert.ok(errores[errores.length - 1] < 1e-3,
    `a pupila 0.05 mm quedan ${errores[errores.length - 1]} D sin explicar`);
});

test('V1.1: NO converge al paraxial de lente DELGADA — y esa diferencia es del espesor', () => {
  const post = ojo();
  const delgada = buildParaxialEye(post).exactPowerFor(0);
  // A pupila fija y muy pequeña (aberración despreciable), la separación respecto al
  // paraxial delgado debe ser proporcional al ESPESOR y extrapolar a 0 cuando t→0.
  const espesores = [0.05, 0.10, 0.20, 0.40];
  const sep = espesores.map(t_mm => optimizePowerByRaytrace({
    postop: post, factory: new GenericIOLFactory({ thickness_mm: t_mm }),
    pupil_mm: 0.05, tol_d: 1e-7,
  }).exact_power_d - delgada);
  for (let i = 1; i < sep.length; i++) {
    assert.ok(sep[i] > sep[i - 1], `la separación no crece con el espesor: ${sep}`);
  }
  const pendientes = espesores.map((t, i) => sep[i] / t);
  assert.ok(Math.max(...pendientes) - Math.min(...pendientes) < 0.02,
    `la separación no es lineal en el espesor: pendientes ${pendientes}`);
  // extrapolación lineal a t→0: sin espesor, trazado y paraxial delgado coinciden
  const intercepto = (espesores[1] * sep[0] - espesores[0] * sep[1]) / (espesores[1] - espesores[0]);
  assert.ok(Math.abs(intercepto) < 5e-4, `intercepto en t→0: ${intercepto} D`);
});

test('V1.1: cada potencia candidata construye SU PROPIA geometría (invariante de P0.2)', () => {
  const post = ojo();
  const vistas = [];
  const base = new GenericIOLFactory();
  const espia = {
    id: 'espia',
    create({ power_d, cylinder_d = 0 }) {
      const iol = base.create({ power_d, cylinder_d });
      vistas.push({ power_d, r: iol.geometry.r_anterior_mm });
      return iol;
    },
  };
  optimizePowerByRaytrace({ postop: post, factory: espia, pupil_mm: 3, catalog_d: [18, 19, 20, 21, 22] });
  assert.ok(vistas.length >= 5, `solo ${vistas.length} lentes construidas`);
  // ninguna geometría se reutiliza entre potencias distintas
  const porPotencia = new Map();
  for (const v of vistas) {
    if (porPotencia.has(v.power_d)) {
      assert.equal(porPotencia.get(v.power_d), v.r, 'misma potencia debe dar misma geometría');
    } else porPotencia.set(v.power_d, v.r);
  }
  const radios = [...porPotencia.values()];
  assert.equal(new Set(radios).size, radios.length,
    'dos potencias distintas comparten geometría: el invariante de P0.2 está roto');
});

test('V1.1: una LIO comercial sin geometría hace FALLAR el optimizador, no lo degrada', () => {
  const post = ojo();
  const comercial = new ManufacturerIOLFactory({
    manufacturer: 'ACME', model: 'M1',
    geometryByPower: { 20: { refractive_index: 1.47, central_thickness_mm: 0.7, r_anterior_mm: 20, r_posterior_mm: -20 } },
    provenance: 'FICTICIA — fixture de test, no es una ficha técnica real',
  });
  assert.throws(
    () => optimizePowerByRaytrace({ postop: post, factory: comercial, pupil_mm: 3, search_d: [15, 25] }),
    /no tiene geometría trazable|Prohibido sustituir/,
    'debe negarse a trazar potencias no documentadas');
});

test('V1.1: el objetivo A no finge ser dioptrías; B y C sí devuelven residual firmado', () => {
  const post = ojo();
  const iol = new GenericIOLFactory().create({ power_d: 20 });
  const eye = buildRaytraceEye(post, iol, { aperture_mm: 1.5 });
  const bundle = defaultBundle(1.5);

  const a = evaluateObjective(eye, bundle, ObjectiveKind.SPOT_RMS_AT_RETINA);
  assert.equal(a.residual_d, null, 'un RMS no es un desenfoque: dos signos opuestos dan el mismo RMS');
  assert.ok(a.cost > 0 && a.cost === a.spotRms_mm);

  const c = evaluateObjective(eye, bundle, ObjectiveKind.EQUIVALENT_DEFOCUS);
  assert.equal(typeof c.residual_d, 'number');
  assert.ok(Math.abs(c.cost - Math.abs(c.residual_d)) < 1e-15, 'el coste es |residual|');
  // el signo se prueba en AMBOS sentidos alrededor del óptimo, sin suponer de qué lado
  // cae una potencia concreta: potencia de menos ⇒ hipermétrope (+), de más ⇒ miope (−)
  const optimo = optimizePowerByRaytrace({ postop: post, pupil_mm: 3 }).exact_power_d;
  const resid = P => evaluateObjective(
    buildRaytraceEye(post, new GenericIOLFactory().create({ power_d: P }), { aperture_mm: 1.5 }),
    bundle, ObjectiveKind.EQUIVALENT_DEFOCUS).residual_d;
  assert.ok(resid(optimo - 2) > 0, 'potencia insuficiente debe dar residual hipermétrope (+)');
  assert.ok(resid(optimo + 2) < 0, 'potencia excesiva debe dar residual miope (−)');
  assert.ok(Math.abs(resid(optimo)) < 1e-3, 'en el óptimo el residual debe anularse');

  assert.throws(() => evaluateObjective(eye, bundle, 'INVENTADO'), /objetivo desconocido/);
  assert.throws(() => describeObjective('INVENTADO'), /objetivo desconocido/);
});

test('V1.1: el signo del desenfoque equivalente es + cuando el foco cae tras la retina', () => {
  // forma cerrada: ΔD = n/L_retina − n/L_foco, ambas desde la referencia
  const n = 1.336, zRef = 5, zRet = 23.5;
  const detras = equivalentDefocus_d(zRet + 0.5, zRet, zRef, n);
  const delante = equivalentDefocus_d(zRet - 0.5, zRet, zRef, n);
  assert.ok(detras > 0 && delante < 0, `signos: detrás=${detras}, delante=${delante}`);
  const esperado = n / ((zRet - zRef) / 1000) - n / ((zRet + 0.5 - zRef) / 1000);
  assert.ok(Math.abs(detras - esperado) < 1e-12);
  // foco o retina por delante de la referencia: no tiene sentido, debe fallar
  assert.throws(() => equivalentDefocus_d(zRef - 1, zRet, zRef, n), RangeError);
});

test('V1.1: la selección de catálogo devuelve mejor y segunda, ordenadas por coste', () => {
  const post = ojo();
  const r = optimizePowerByRaytrace({
    postop: post, pupil_mm: 3, catalog_d: [18, 18.5, 19, 19.5, 20, 20.5, 21],
  });
  assert.ok(r.best && r.second);
  assert.ok(r.best.cost <= r.second.cost);
  assert.equal(r.catalog_evaluations.length, 7);
  for (let i = 1; i < r.catalog_evaluations.length; i++) {
    assert.ok(r.catalog_evaluations[i].cost >= r.catalog_evaluations[i - 1].cost);
  }
  // la mejor del catálogo es la más próxima al óptimo continuo
  const masCercana = [18, 18.5, 19, 19.5, 20, 20.5, 21]
    .reduce((a, b) => Math.abs(b - r.exact_power_d) < Math.abs(a - r.exact_power_d) ? b : a);
  assert.equal(r.best.power_d, masCercana);
});

test('V1.1: toda salida declara sus parámetros de simulación y su etiqueta', () => {
  const post = ojo();
  const r = optimizePowerByRaytrace({ postop: post, pupil_mm: 3.5, n_anillos: 7 });
  assert.match(r.etiqueta, /SIMULACION/);
  assert.equal(r.parametros_declarados.pupil_mm, 3.5);
  assert.equal(r.parametros_declarados.rayos, 7);
  assert.equal(r.parametros_declarados.is_simulation_surrogate, true);
  assert.ok(r.parametros_declarados.cornea_policy);
  assert.ok(r.objective_label.length > 20);
  assert.equal(r.at_exact.raysLost, 0, 'no debería perderse ningún rayo con pupila 3.5 mm');
});

test('V1.1: comparar objetivos no declara ninguno preferible', () => {
  const c = compareObjectives({ postop: ojo(), pupil_mm: 4 });
  // dos objetivos tras la revisión pre-V1.2: B≡C demostrado (objective_equivalence.test.mjs)
  assert.equal(Object.keys(c.por_objetivo).length, 2);
  assert.ok(c.rango_potencia_d >= 0);
  assert.match(c.nota, /No se declara ninguno preferible/);
  // la pregunta abierta del CRITERIO óptico es la #8 (la #7 es la política corneal)
  assert.match(c.nota, /OPEN_QUESTIONS #8/);
});

test('V1.1: un óptimo pegado al borde del intervalo se rechaza, no se devuelve', () => {
  // Un ojo de 30 mm con K 43.5 necesita ~1.5 D. Con el intervalo por defecto [0, 40] el
  // óptimo cae contra el 0 y devolverlo produciría un número plausible y FALSO. Este fallo
  // apareció en la primera ejecución de exp008.
  const largo = ojo({ al: 30, k: 43.5 });
  assert.throws(
    () => optimizePowerByRaytrace({ postop: largo, pupil_mm: 6, search_d: [0, 40] }),
    /cae en el borde del intervalo/,
    'el borde del intervalo no es un óptimo');
  // con un intervalo que sí contiene la solución, funciona
  const r = optimizePowerByRaytrace({ postop: largo, pupil_mm: 6, search_d: [-15, 55] });
  assert.ok(r.exact_power_d > -15 && r.exact_power_d < 55);
  assert.ok(r.exact_power_d < 5, `un ojo de 30 mm necesita poca potencia: ${r.exact_power_d}`);
});

test('V1.1: guardas de dominio del optimizador', () => {
  const post = ojo();
  assert.throws(() => optimizePowerByRaytrace({ postop: post, pupil_mm: 0 }), RangeError);
  assert.throws(() => optimizePowerByRaytrace({ postop: post, search_d: [30, 10] }), RangeError);
  assert.throws(() => optimizePowerByRaytrace({ postop: post, catalog_d: [] }), TypeError);
  assert.throws(() => defaultBundle(-1), RangeError);
});
