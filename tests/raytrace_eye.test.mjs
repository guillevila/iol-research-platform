/** Tests del ojo completo trazado (cierre del Sprint 4): validación cruzada paraxial↔trazado. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPreopEye, createPredictedPostopEye } from '../src/core/eye.mjs';
import { createGenericThickIOL } from '../src/core/iol.mjs';
import { buildRaytraceEye, paraxialFocusOfRaytraceEye, compareParaxialVsRaytrace } from '../src/optics/eyebuilder.mjs';

function eyeOf({ al = 23.5, k = 43.5, radios = false } = {}) {
  return createPreopEye({
    al_mm: al, k1_d: k, k1_axis_deg: 180, k2_d: k, k2_axis_deg: 90,
    acd_mm: 3.2, lt_mm: 4.5, cct_um: 550,
    ...(radios ? { cornea: { r_anterior_mm: 7.7, r_posterior_mm: 6.8 } } : {}),
    meta: { source: 'synthetic' },
  });
}

test('raytrace-eye: construcción con córnea equivalente y con córnea física', () => {
  const iol = createGenericThickIOL({ se_power_d: 21 });
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
  const iol = createGenericThickIOL({ se_power_d: 21 });
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
  const iol = createGenericThickIOL({ se_power_d: 21 });
  const post = createPredictedPostopEye(eyeOf(), { iol_position_mm: 4.9, position_source: 'test' });
  const eye = buildRaytraceEye(post, iol);
  const paraxial = compareParaxialVsRaytrace(eye, { heights_mm: [0.02, 0.05, 0.08] });
  const clinico = compareParaxialVsRaytrace(eye, { heights_mm: [0.3, 0.6, 0.9, 1.2, 1.5] });
  // superficies esféricas convergentes → rayos marginales cruzan antes: mejor foco < paraxial
  assert.ok(clinico.tracedFocus_mm < paraxial.tracedFocus_mm, 'el foco clínico debe adelantarse');
  assert.ok(Math.abs(clinico.equivalentDefocus_d) > Math.abs(paraxial.equivalentDefocus_d));
  assert.ok(clinico.spotRms_mm > paraxial.spotRms_mm);
});

test('raytrace-eye: foco paraxial cerca de retina cuando la potencia es la óptima delgada', () => {
  // la potencia óptima se calculó con LIO delgada: la gruesa genérica desplaza el foco
  // de forma acotada (mismo orden que el test paraxial thin↔thick)
  const iol = createGenericThickIOL({ se_power_d: 21 });
  const post = createPredictedPostopEye(eyeOf(), { iol_position_mm: 4.9, position_source: 'test' });
  const eye = buildRaytraceEye(post, iol);
  const zPar = paraxialFocusOfRaytraceEye(eye);
  assert.ok(Math.abs(zPar - eye.retina_z_mm) < 0.6, `foco ${zPar} vs retina ${eye.retina_z_mm}`);
});
