/**
 * Tests del generador de haces sobre la pupila (V1.4).
 *
 * Dos cosas que verificar, y la segunda es la que importa para los sprints siguientes:
 *   1. cada muestreo cubre la pupila como promete (equiárea de verdad, no de nombre);
 *   2. con simetría de revolución TODOS los muestreos dan el mismo resultado — y por tanto
 *      cualquier diferencia que aparezca al añadir tilt, descentración o tórico será
 *      atribuible a la asimetría, no al muestreo.
 *
 * RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPreopEye, createPredictedPostopEye } from '../src/core/eye.mjs';
import { GenericIOLFactory } from '../src/core/iol_factory.mjs';
import { generateBundle, SamplingKind, isTwoDimensional, radialUniformity } from '../src/optics/raytrace/bundle.mjs';
import { optimizePowerByRaytrace } from '../src/optimize/raytrace_power.mjs';

function ojo({ al = 23.5, k = 43.5 } = {}) {
  const pre = createPreopEye({
    al_mm: al, k1_d: k, k1_axis_deg: 180, k2_d: k, k2_axis_deg: 90,
    acd_mm: 3.2, lt_mm: 4.5, cct_um: 550, meta: { source: 'synthetic' },
  });
  return createPredictedPostopEye(pre, { iol_position_mm: 4.9, position_source: 'test' });
}

test('V1.4: todo rayo cae dentro de la pupila y viaja paralelo al eje', () => {
  for (const kind of Object.values(SamplingKind)) {
    const b = generateBundle({ radius_mm: 2.0, kind, n: 12, perRing: 8 });
    assert.ok(b.actual >= 2, `${kind}: solo ${b.actual} rayos`);
    for (const r of b.rays) {
      const rad = Math.hypot(r.p[0], r.p[1]);
      assert.ok(rad <= 2.0 + 1e-12, `${kind}: rayo a ${rad} mm, fuera de la pupila`);
      assert.deepEqual(r.d, [0, 0, 1], `${kind}: los rayos deben venir del infinito`);
    }
  }
});

test('V1.4: los muestreos equiárea lo son de verdad, no solo de nombre', () => {
  // en un muestreo equiárea el k-ésimo r²/R² ordenado debe caer cerca de (k+0.5)/n
  for (const kind of [SamplingKind.MERIDIONAL, SamplingKind.FIBONACCI_SPIRAL]) {
    const u = radialUniformity(generateBundle({ radius_mm: 2.0, kind, n: 64 }));
    assert.ok(u.maxDeviation < 0.02,
      `${kind}: desviación radial máxima ${u.maxDeviation.toFixed(4)} — el muestreo está sesgado`);
  }
  // en anillos, cada anillo aporta `perRing` rayos a igual área: la desviación es del
  // orden de 1/(2·anillos), y se comprueba que MEJORA al añadir anillos
  const pocos = radialUniformity(generateBundle({ radius_mm: 2, kind: SamplingKind.RINGS_EQUAL_AREA, n: 4, perRing: 8 }));
  const muchos = radialUniformity(generateBundle({ radius_mm: 2, kind: SamplingKind.RINGS_EQUAL_AREA, n: 32, perRing: 8 }));
  assert.ok(muchos.maxDeviation < pocos.maxDeviation / 2,
    `la uniformidad no mejora con más anillos: ${pocos.maxDeviation} → ${muchos.maxDeviation}`);
});

test('V1.4: la malla cuadrada declara cuántos rayos sobreviven al recorte circular', () => {
  const b = generateBundle({ radius_mm: 2.0, kind: SamplingKind.SQUARE_GRID, n: 100 });
  assert.notEqual(b.actual, b.requested, 'el recorte circular DEBE cambiar el número de rayos');
  assert.ok(b.actual > 0.7 * b.requested && b.actual < 1.6 * b.requested,
    `recuento fuera de lo razonable: pedidos ${b.requested}, reales ${b.actual}`);
  // el número real es el que viaja: una métrica sobre 78 rayos no es una sobre 100
  assert.equal(b.rays.length, b.actual);
});

test('V1.4: el muestreo meridional se declara 1D y avisa de su limitación', () => {
  const m = generateBundle({ radius_mm: 2, kind: SamplingKind.MERIDIONAL, n: 8 });
  assert.equal(m.twoDimensional, false);
  assert.equal(isTwoDimensional(SamplingKind.MERIDIONAL), false);
  assert.match(m.declared.aviso, /SOLO válido con simetría de revolución/);
  // todos sus rayos están en el plano x = 0
  for (const r of m.rays) assert.equal(r.p[0], 0);
  for (const kind of [SamplingKind.RINGS_EQUAL_AREA, SamplingKind.FIBONACCI_SPIRAL, SamplingKind.SQUARE_GRID]) {
    assert.equal(generateBundle({ radius_mm: 2, kind, n: 12 }).twoDimensional, true);
    assert.equal(isTwoDimensional(kind), true);
  }
});

/** Los tres muestreos equiárea. La malla cuadrada se trata aparte, por lo que se ve abajo. */
const EQUIAREA = [SamplingKind.MERIDIONAL, SamplingKind.RINGS_EQUAL_AREA, SamplingKind.FIBONACCI_SPIRAL];

test('V1.4: con simetría de revolución los muestreos equiárea CONVERGEN al mismo valor', () => {
  // Propiedad que hace interpretables V1.2/V1.3/V1.6: si el muestreo no introduce
  // diferencias con un sistema simétrico, cualquier diferencia futura vendrá de la
  // asimetría, no de la elección de haz.
  const post = ojo();
  const rangoCon = n => {
    const v = EQUIAREA.map(sampling => optimizePowerByRaytrace({
      postop: post, pupil_mm: 4, sampling, n_anillos: n, perRing: 12, tol_d: 1e-7,
    }).exact_power_d);
    return Math.max(...v) - Math.min(...v);
  };
  const grueso = rangoCon(24);
  const fino = rangoCon(384);
  assert.ok(fino < grueso, `el desacuerdo entre muestreos no baja al densificar: ${grueso} → ${fino}`);
  assert.ok(fino < 2e-3,
    `con 384 rayos los muestreos equiárea aún discrepan ${fino.toExponential(3)} D`);
});

test('V1.4: la malla cuadrada oscila en vez de converger — limitación medida, no oculta', () => {
  // Su recorte circular es dentado: qué rayos del borde entran depende de la resolución.
  // Como la aberración crece con h⁴, la métrica la dominan los rayos exteriores, y esa
  // frontera irregular impide converger. Se documenta con evidencia para que nadie la
  // elija por descuido en V1.2/V1.3.
  const post = ojo();
  const P = (sampling, n) => optimizePowerByRaytrace({
    postop: post, pupil_mm: 4, sampling, n_anillos: n, perRing: 12, tol_d: 1e-7,
  }).exact_power_d;
  const densidades = [48, 96, 192, 384, 768];
  const fibo = densidades.map(n => P(SamplingKind.FIBONACCI_SPIRAL, n));
  const grid = densidades.map(n => P(SamplingKind.SQUARE_GRID, n));
  const dispersion = a => Math.max(...a) - Math.min(...a);
  assert.ok(dispersion(fibo) < 1e-3,
    `el muestreo equiárea debería estar ya convergido: dispersión ${dispersion(fibo)}`);
  assert.ok(dispersion(grid) > 5 * dispersion(fibo),
    'si la malla cuadrada ya converge, actualiza el aviso de bundle.mjs y este test');
});

test('V1.4: el resultado converge al aumentar los rayos, y la convergencia se MIDE', () => {
  const post = ojo();
  const P = n => optimizePowerByRaytrace({
    postop: post, pupil_mm: 5, sampling: SamplingKind.FIBONACCI_SPIRAL, n_anillos: n, tol_d: 1e-7,
  }).exact_power_d;
  const denso = P(512);
  const errores = [8, 16, 32, 64].map(n => Math.abs(P(n) - denso));
  // el error decrece monótonamente al densificar: si no, el muestreo introduce ruido
  for (let i = 1; i < errores.length; i++) {
    assert.ok(errores[i] <= errores[i - 1],
      `el error no decrece al densificar: ${errores.map(e => e.toExponential(2))}`);
  }
  // y con 64 rayos ya está muy por debajo del escalón comercial de 0.5 D
  assert.ok(errores[errores.length - 1] < 0.01,
    `con 64 rayos quedan ${errores[errores.length - 1]} D de ruido de muestreo`);
});

test('V1.4: el optimizador declara qué muestreo usó y si era 2D', () => {
  const r = optimizePowerByRaytrace({
    postop: ojo(), pupil_mm: 3, sampling: SamplingKind.RINGS_EQUAL_AREA, n_anillos: 6, perRing: 8,
  });
  assert.equal(r.parametros_declarados.sampling, SamplingKind.RINGS_EQUAL_AREA);
  assert.equal(r.parametros_declarados.rayos, 48);
  assert.equal(r.parametros_declarados.muestreo_2d, true);
});

test('V1.4: guardas de dominio del generador', () => {
  assert.throws(() => generateBundle({ radius_mm: 0, n: 8 }), RangeError);
  assert.throws(() => generateBundle({ radius_mm: -1, n: 8 }), RangeError);
  assert.throws(() => generateBundle({ radius_mm: 2, n: 1 }), RangeError);
  assert.throws(() => generateBundle({ radius_mm: 2, n: 3.5 }), RangeError);
  assert.throws(() => generateBundle({ radius_mm: 2, n: 8, kind: 'INVENTADO' }), TypeError);
  assert.throws(() => generateBundle({
    radius_mm: 2, n: 8, kind: SamplingKind.RINGS_EQUAL_AREA, perRing: 0,
  }), RangeError);
});
