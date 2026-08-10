/**
 * Tests del ray tracer (Sprint 3): unit, property-based y numéricos.
 * Los valores esperados salen de formas cerradas derivadas en el propio test.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, dot, norm } from '../src/optics/raytrace/vec3.mjs';
import { sphericalSurface, planarSurface, intersect, refractDirection } from '../src/optics/raytrace/surfaces.mjs';
import { traceRay, parallelBundle, focusOfSystem, spotRmsAt, bestFocus } from '../src/optics/raytrace/trace.mjs';

test('snell: incidencia normal no cambia la dirección', () => {
  const r = refractDirection([0, 0, 1], [0, 0, -1], 1.0, 1.5);
  assert.ok(!r.tir);
  assert.ok(Math.abs(r.d[0]) < 1e-15 && Math.abs(r.d[1]) < 1e-15 && Math.abs(r.d[2] - 1) < 1e-15);
});

test('snell: índices iguales no refractan (property, barrido de ángulos)', () => {
  for (let a = 0; a < 1.5; a += 0.1) {
    const d = normalize([0, Math.sin(a), Math.cos(a)]);
    const r = refractDirection(d, [0, 0, -1], 1.336, 1.336);
    assert.ok(!r.tir);
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(r.d[i] - d[i]) < 1e-12);
  }
});

test('snell: el ángulo refractado cumple n1·sinθi = n2·sinθt (forma cerrada 2D)', () => {
  const n1 = 1.0, n2 = 1.5, thetaI = 0.5;               // rad
  const d = [0, Math.sin(thetaI), Math.cos(thetaI)];
  const r = refractDirection(d, [0, 0, -1], n1, n2);
  const sinT = Math.abs(r.d[1]);                        // plano y-z
  assert.ok(Math.abs(n1 * Math.sin(thetaI) - n2 * sinT) < 1e-12);
  assert.ok(Math.abs(norm(r.d) - 1) < 1e-12, 'dirección unitaria');
});

test('snell: TIR detectada más allá del ángulo crítico', () => {
  const n1 = 1.5, n2 = 1.0;
  const critico = Math.asin(n2 / n1);
  const dIn = a => normalize([0, Math.sin(a), Math.cos(a)]);
  assert.ok(!refractDirection(dIn(critico - 0.01), [0, 0, -1], n1, n2).tir);
  assert.ok(refractDirection(dIn(critico + 0.01), [0, 0, -1], n1, n2).tir);
});

test('intersección esfera: punto y normal correctos en el eje', () => {
  const s = sphericalSurface({ zVertex_mm: 5, radius_mm: 10, aperture_mm: 4, n_before: 1, n_after: 1.5 });
  const hit = intersect(s, { p: [0, 0, -10], d: [0, 0, 1] });
  assert.ok(hit);
  assert.ok(Math.abs(hit.point[2] - 5) < 1e-12, 'vértice en z=5');
  assert.ok(dot(hit.normal, [0, 0, 1]) < 0, 'normal contra el rayo');
});

test('intersección: apertura y rayos que no llegan', () => {
  const s = sphericalSurface({ zVertex_mm: 5, radius_mm: 10, aperture_mm: 1, n_before: 1, n_after: 1.5 });
  assert.equal(intersect(s, { p: [0, 3, -10], d: [0, 0, 1] }), null);   // fuera de apertura
  assert.equal(intersect(s, { p: [0, 0, 10], d: [0, 0, 1] }), null);    // superficie detrás
});

test('plano: incidencia normal atraviesa sin desviarse; simetría del sistema', () => {
  const sys = [planarSurface({ z_mm: 0, aperture_mm: 5, n_before: 1, n_after: 1.336 })];
  const tr = traceRay(sys, { p: [0, 1, -5], d: [0, 0, 1] });
  assert.ok(tr.ok);
  assert.deepEqual(tr.ray.d, [0, 0, 1]);
  // simetría: alturas ±h cruzan el eje en el mismo z (superficie esférica)
  const lens = [sphericalSurface({ zVertex_mm: 0, radius_mm: 10, aperture_mm: 3, n_before: 1, n_after: 1.5 })];
  const up = traceRay(lens, { p: [0, 1, -5], d: [0, 0, 1] }).ray;
  const dn = traceRay(lens, { p: [0, -1, -5], d: [0, 0, 1] }).ray;
  const zx = r => r.p[2] - r.p[1] * (r.d[2] / r.d[1]);
  assert.ok(Math.abs(zx(up) - zx(dn)) < 1e-9, 'cruces simétricos');
});

test('rayo axial: invariante a través de cualquier sistema centrado', () => {
  const sys = [
    sphericalSurface({ zVertex_mm: 0, radius_mm: 7.7, aperture_mm: 4, n_before: 1, n_after: 1.376 }),
    sphericalSurface({ zVertex_mm: 0.55, radius_mm: 6.8, aperture_mm: 4, n_before: 1.376, n_after: 1.336 }),
    sphericalSurface({ zVertex_mm: 5, radius_mm: 12, aperture_mm: 3, n_before: 1.336, n_after: 1.49 }),
  ];
  const tr = traceRay(sys, { p: [0, 0, -10], d: [0, 0, 1] });
  assert.ok(tr.ok);
  assert.ok(Math.abs(tr.ray.p[0]) < 1e-12 && Math.abs(tr.ray.p[1]) < 1e-12);
  assert.ok(Math.abs(tr.ray.d[2] - 1) < 1e-12);
});

test('dioptrio esférico único: el foco trazado converge al paraxial n2·R/(n2−n1) cuando h→0', () => {
  // forma cerrada del dioptrio: f' medido desde el vértice
  const R = 10, n1 = 1, n2 = 1.5;
  const fPrime = n2 * R / (n2 - n1);                    // 30 mm
  const s = [sphericalSurface({ zVertex_mm: 0, radius_mm: R, aperture_mm: 5, n_before: n1, n_after: n2 })];
  const focoConAltura = h => {
    const tr = traceRay(s, { p: [0, h, -10], d: [0, 0, 1] });
    assert.ok(tr.ok);
    const r = tr.ray;
    return r.p[2] - r.p[1] * (r.d[2] / r.d[1]);
  };
  const err = h => Math.abs(focoConAltura(h) - fPrime);
  assert.ok(err(0.01) < 1e-3, `h→0: ${err(0.01)}`);
  assert.ok(err(2) > err(0.5) && err(0.5) > err(0.05), 'aberración esférica creciente con h');
});

test('focusOfSystem: mejor foco ≈ paraxial con haz bajo y spot pequeño', () => {
  const R = 10, n2 = 1.5, fPrime = n2 * R / (n2 - 1);
  const s = [sphericalSurface({ zVertex_mm: 0, radius_mm: R, aperture_mm: 5, n_before: 1, n_after: n2 })];
  const f = focusOfSystem(s, { heights_mm: [0.05, 0.1, 0.15, 0.2], zSearchTo_mm: 50 });
  // 0.01 mm cubre la suma de dos residuos conocidos: la tolerancia de la búsqueda de
  // mejor foco (1e-6 mm) y la aberración esférica O(h²) del haz usado
  assert.ok(Math.abs(f.bestFocus_mm - fPrime) < 0.01, `foco ${f.bestFocus_mm} vs ${fPrime}`);
  assert.ok(f.spotRms_mm < 1e-4);
  assert.ok(Math.abs(f.paraxialNumeric_mm - fPrime) < 1e-3);
});

test('numérico: sin NaN en barrido de curvaturas y alturas; pérdidas reportadas', () => {
  for (const R of [5, 8, 12, 20, -8, -15]) {
    const s = [sphericalSurface({ zVertex_mm: 0, radius_mm: R, aperture_mm: 3, n_before: 1, n_after: 1.44 })];
    for (const h of [0, 0.5, 1, 2, 2.9]) {
      const tr = traceRay(s, { p: [0, h, -5], d: [0, 0, 1] });
      if (tr.ok) {
        assert.ok(tr.ray.p.every(Number.isFinite) && tr.ray.d.every(Number.isFinite));
      } else {
        assert.ok(['miss_or_aperture', 'tir', 'nan'].includes(tr.reason));
      }
    }
  }
  // rayo fuera de apertura en haz mixto: focusOfSystem lo reporta en raysLost
  const s = [sphericalSurface({ zVertex_mm: 0, radius_mm: 10, aperture_mm: 1, n_before: 1, n_after: 1.5 })];
  const f = focusOfSystem(s, { heights_mm: [0.05, 0.2, 0.5, 2.5], zSearchTo_mm: 50 });
  assert.equal(f.raysLost.length, 1);
  assert.equal(f.raysLost[0].h, 2.5);
});

test('bestFocus/spotRms: guardas', () => {
  assert.throws(() => spotRmsAt([], 10), RangeError);
  assert.throws(() => bestFocus([{ p: [0, 0, 0], d: [0, 0, 1] }], 5, 5), RangeError);
});
