/** Tests del ojo completo trazado (cierre del Sprint 4): validación cruzada paraxial↔trazado. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPreopEye, createPredictedPostopEye } from '../src/core/eye.mjs';
import { createGenericThickIOL } from '../src/core/iol_factory.mjs';
import { buildParaxialEye, buildRaytraceEye, paraxialFocusOfRaytraceEye, compareParaxialVsRaytrace } from '../src/optics/eyebuilder.mjs';

function eyeOf({ al = 23.5, k = 43.5, radios = false } = {}) {
  return createPreopEye({
    al_mm: al, k1_d: k, k1_axis_deg: 180, k2_d: k, k2_axis_deg: 90,
    acd_mm: 3.2, lt_mm: 4.5, cct_um: 550,
    ...(radios ? { cornea: { r_anterior_mm: 7.7, r_posterior_mm: 6.8 } } : {}),
    meta: { source: 'synthetic' },
  });
}

test('raytrace-eye: construcción con córnea equivalente y con córnea física', () => {
  const iol = createGenericThickIOL({ power_d: 21 });
  const postA = createPredictedPostopEye(eyeOf(), { iol_position_mm: 4.9, position_source: 'test' });
  const a = buildRaytraceEye(postA, iol);
  assert.equal(a.cornea_kind, 'equivalent_single_surface');
  assert.equal(a.surfaces.length, 3);
  const postB = createPredictedPostopEye(eyeOf({ radios: true }), { iol_position_mm: 4.9, position_source: 'test' });
  const b = buildRaytraceEye(postB, iol);
  assert.equal(b.cornea_kind, 'two_surface_physical');
  assert.equal(b.surfaces.length, 4);
  // radio equivalente reproduce la potencia de lectura: r = 336/K
  assert.ok(Math.abs(a.surfaces[0].radius_mm - 336 / 43.5) < 1e-9);
});

test('raytrace-eye: LIO sin geometría numérica se rechaza (nunca inventar)', () => {
  const post = createPredictedPostopEye(eyeOf(), { iol_position_mm: 4.9, position_source: 'test' });
  assert.throws(() => buildRaytraceEye(post, { geometry: { refractive_index: 'UNKNOWN' } }), TypeError);
});

test('raytrace-eye: el trazado converge al paraxial del MISMO sistema cuando h→0', () => {
  const iol = createGenericThickIOL({ power_d: 21 });
  for (const radios of [false, true]) {
    const post = createPredictedPostopEye(eyeOf({ radios }), { iol_position_mm: 4.9, position_source: 'test' });
    const eye = buildRaytraceEye(post, iol);
    const cmp = compareParaxialVsRaytrace(eye, { heights_mm: [0.02, 0.05, 0.08] });
    assert.ok(Math.abs(cmp.delta_mm) < 0.01, `Δ foco ${cmp.delta_mm} mm (radios=${radios})`);
    assert.ok(Math.abs(cmp.equivalentDefocus_d) < 0.03, `ΔD ${cmp.equivalentDefocus_d}`);
    assert.equal(cmp.raysLost, 0);
  }
});

test('raytrace-eye: con pupila clínica aparece aberración esférica (foco se acerca)', () => {
  const iol = createGenericThickIOL({ power_d: 21 });
  const post = createPredictedPostopEye(eyeOf(), { iol_position_mm: 4.9, position_source: 'test' });
  const eye = buildRaytraceEye(post, iol);
  const paraxial = compareParaxialVsRaytrace(eye, { heights_mm: [0.02, 0.05, 0.08] });
  const clinico = compareParaxialVsRaytrace(eye, { heights_mm: [0.3, 0.6, 0.9, 1.2, 1.5] });
  // superficies esféricas convergentes → rayos marginales cruzan antes: mejor foco < paraxial
  assert.ok(clinico.tracedFocus_mm < paraxial.tracedFocus_mm, 'el foco clínico debe adelantarse');
  assert.ok(Math.abs(clinico.equivalentDefocus_d) > Math.abs(paraxial.equivalentDefocus_d));
  assert.ok(clinico.spotRms_mm > paraxial.spotRms_mm);
});

/*
 * V0.5 / H10 — este test aceptaba |foco − retina| < 0.6 mm sin justificar el 0.6, y además
 * mezclaba dos efectos: usaba P = 21 D cuando la potencia delgada exacta de este ojo es
 * 20.07 D, de modo que el desplazamiento medido estaba dominado por un error de potencia
 * de 0.93 D, no por el espesor. Se separan los dos efectos y cada uno se afirma por su ley.
 */
test('raytrace-eye: con la potencia delgada EXACTA, el foco converge a la retina como O(t)', () => {
  const post = createPredictedPostopEye(eyeOf(), { iol_position_mm: 4.9, position_source: 'test' });
  const Pexacta = buildParaxialEye(post).exactPowerFor(0);
  const desvio = t_mm => {
    const eye = buildRaytraceEye(post, createGenericThickIOL({ power_d: Pexacta, thickness_mm: t_mm }));
    return paraxialFocusOfRaytraceEye(eye) - eye.retina_z_mm;
  };
  const espesores = [0.05, 0.10, 0.20, 0.40];
  const pendientes = espesores.map(t => desvio(t) / t);
  assert.ok(Math.max(...pendientes) - Math.min(...pendientes) < 0.002,
    `el desvío no es lineal en el espesor: ${pendientes}`);
  // extrapolación lineal a t→0: con la potencia exacta el foco cae EN la retina
  const intercepto = 2 * desvio(0.05) - desvio(0.10);
  assert.ok(Math.abs(intercepto) < 1e-4, `foco fuera de retina en t→0: ${intercepto} mm`);
  // a espesor clínico el desvío es de decenas de micras, no de décimas de mm
  assert.ok(Math.abs(desvio(0.8)) < 0.1, `desvío a t=0.8: ${desvio(0.8)} mm`);
});

test('raytrace-eye: un exceso de potencia adelanta el foco por delante de la retina', () => {
  const post = createPredictedPostopEye(eyeOf(), { iol_position_mm: 4.9, position_source: 'test' });
  const Pexacta = buildParaxialEye(post).exactPowerFor(0);
  const foco = P => {
    const eye = buildRaytraceEye(post, createGenericThickIOL({ power_d: P, thickness_mm: 0.8 }));
    return paraxialFocusOfRaytraceEye(eye) - eye.retina_z_mm;
  };
  // signo: más potencia ⇒ foco más cerca (miopización). Monótona estricta.
  const serie = [-2, -1, 0, 1, 2].map(d => foco(Pexacta + d));
  for (let i = 1; i < serie.length; i++) assert.ok(serie[i] < serie[i - 1], `no monótona: ${serie}`);
  assert.ok(foco(Pexacta + 1) < 0 && foco(Pexacta - 1) > 0);
});
