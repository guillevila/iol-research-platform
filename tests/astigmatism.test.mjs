/**
 * V1.6 — análisis astigmático 2D del haz (astigmatism.mjs).
 *
 * Anclas independientes:
 *  - foco cilíndrico por meridiano en FORMA CERRADA (f' = n2·R/(n2−n1));
 *  - √tr(M(z)) debe COINCIDIR con spotRmsAt (dos implementaciones independientes del
 *    mismo momento de segundo orden) a 1e-12;
 *  - la trampa de los 90°: el eje clínico (minus-cyl) es el meridiano PLANO, no el
 *    empinado — verificado sobre un caso construido con respuesta conocida.
 *
 * RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { biconicSurface, sphericalSurface, transformedSurface } from '../src/optics/raytrace/surfaces.mjs';
import { traceRay, spotRmsAt } from '../src/optics/raytrace/trace.mjs';
import { generateBundle, SamplingKind } from '../src/optics/raytrace/bundle.mjs';
import { analyzeAstigmaticBundle, clinicalFromAstigmaticAnalysis, spotSecondMomentAt, transverseMoments, normDeg180 } from '../src/optics/raytrace/astigmatism.mjs';
import { createIOLPose, rotationOfPose } from '../src/core/pose.mjs';

const N2 = 1.336;
const Rz = deg => rotationOfPose(createIOLPose({ rotation_z_deg: deg }));

/** traza un haz 2D de anillos por las superficies y devuelve los rayos emergentes */
function emergentes(surfaces, pupilRadius = 0.5, n = 4, perRing = 8) {
  const bundle = generateBundle({ radius_mm: pupilRadius, kind: SamplingKind.RINGS_EQUAL_AREA, n, perRing });
  const out = [];
  for (const r0 of bundle.rays) {
    const tr = traceRay(surfaces, r0);
    if (tr.ok) out.push(tr.ray);
  }
  assert.ok(out.length >= bundle.rays.length * 0.9, `pérdidas excesivas: ${out.length}/${bundle.rays.length}`);
  return out;
}

/** superficie tórica única aire→acuoso con radios por meridiano local x/y */
const torica = (rx, ry, extra = {}) => biconicSurface({
  zVertex_mm: 0, radius_x_mm: rx, radius_y_mm: ry, aperture_mm: 3, n_before: 1, n_after: N2, ...extra,
});

test('astigmatism · una superficie tórica: dos focos en forma cerrada por meridiano, meridianos correctos', () => {
  // Rx = 8.0 (plano), Ry = 7.0 (empinado): el meridiano y enfoca ANTES
  const rx = 8.0, ry = 7.0;
  const fx = N2 * rx / (N2 - 1), fy = N2 * ry / (N2 - 1);
  const rays = emergentes([torica(rx, ry)], 0.15);
  const a = analyzeAstigmaticBundle(rays);
  assert.equal(a.astigmatic, true);
  const [near, far] = a.foci;
  // foco próximo = meridiano empinado (y, 90°); foco lejano = plano (x, 0°)
  assert.ok(Math.abs(near.z_mm - fy) < 5e-3, `foco próximo ${near.z_mm} vs cerrado ${fy}`);
  assert.ok(Math.abs(far.z_mm - fx) < 5e-3, `foco lejano ${far.z_mm} vs cerrado ${fx}`);
  assert.ok(Math.abs(near.power_meridian_deg - 90) < 1e-6);
  assert.ok(Math.abs(far.power_meridian_deg - 0) < 1e-6 || Math.abs(far.power_meridian_deg - 180) < 1e-6);
  // línea focal ⊥ meridiano de potencia (convención explícita)
  assert.equal(normDeg180(near.focal_line_deg), normDeg180(near.power_meridian_deg + 90));
  // en cada foco: comprimido en el meridiano de potencia, extendido en la línea
  assert.ok(near.rms_power_meridian_mm < near.rms_focal_line_mm / 50);
  assert.ok(a.orthogonality_residual_deg < 1e-6);
});

test('astigmatism · convergencia pupila→0 hacia la forma cerrada (el error cae con h²)', () => {
  const rx = 8.0, ry = 7.0;
  const fy = N2 * ry / (N2 - 1);
  const errs = [0.6, 0.2].map(h => {
    const a = analyzeAstigmaticBundle(emergentes([torica(rx, ry)], h));
    return Math.abs(a.foci[0].z_mm - fy);
  });
  assert.ok(errs[1] < errs[0] / 4, `no converge O(h²): ${errs}`);
});

test('astigmatism · ejes ARBITRARIOS: la superficie rotada θ recupera meridianos θ y θ+90 (mod 180)', () => {
  for (const theta of [17, 63.4, 121, 90]) {
    const base = torica(8.0, 7.0);
    const rotada = transformedSurface({ base, R: Rz(theta), T: [0, 0, 0] });
    const a = analyzeAstigmaticBundle(emergentes([rotada], 0.2));
    assert.equal(a.astigmatic, true);
    // empinado local = y (90°); rotado θ → meridiano empinado en 90+θ (mod 180)
    const esperado = normDeg180(90 + theta);
    const dif = Math.min(
      Math.abs(a.foci[0].power_meridian_deg - esperado),
      180 - Math.abs(a.foci[0].power_meridian_deg - esperado));
    assert.ok(dif < 1e-4, `θ=${theta}: meridiano ${a.foci[0].power_meridian_deg} vs esperado ${esperado}`);
  }
});

test('astigmatism · √tr(M(z)) COINCIDE con spotRmsAt a 1e-12 (implementaciones independientes)', () => {
  const rays = emergentes([torica(7.9, 7.2)], 0.8);
  for (const z of [20, 25, 28.7, 33]) {
    const viaMomentos = spotSecondMomentAt(rays, z).rms_mm;
    const viaTraza = spotRmsAt(rays, z);
    assert.ok(Math.abs(viaMomentos - viaTraza) < 1e-12, `z=${z}: ${viaMomentos} vs ${viaTraza}`);
  }
});

test('astigmatism · caso DEGENERADO: haz esférico devuelve astigmatic:false con razón, jamás un eje arbitrario', () => {
  const esfera = sphericalSurface({ zVertex_mm: 0, radius_mm: 7.5, aperture_mm: 3, n_before: 1, n_after: N2 });
  const a = analyzeAstigmaticBundle(emergentes([esfera], 0.4));
  assert.equal(a.astigmatic, false);
  assert.equal(a.foci, null);
  assert.match(a.degenerate_reason, /eje indefinido|esférico/);
  // y la reducción clínica degenerada: cilindro 0 con eje null EXPLÍCITO
  const clin = clinicalFromAstigmaticAnalysis(a, { zRetina_mm: a.mean_focus_z_mm, zReference_mm: 0.9 });
  assert.equal(clin.cylinder_d, 0);
  assert.equal(clin.minus_cyl_axis_deg, null);
});

test('astigmatism · un haz MERIDIONAL (1D) se rechaza explícitamente: no define la métrica 2D', () => {
  const s = torica(8.0, 7.0);
  const bundle = generateBundle({ radius_mm: 0.5, kind: SamplingKind.MERIDIONAL, n: 6 });
  const rays = bundle.rays.map(r0 => traceRay([s], r0)).filter(t => t.ok).map(t => t.ray);
  assert.throws(() => analyzeAstigmaticBundle(rays), /no es 2D|meridional/);
});

test('astigmatism · TRAMPA DE LOS 90°: el eje clínico minus-cyl es el meridiano PLANO, no el empinado', () => {
  // córnea-juguete empinada a 90° (Ry < Rx → meridiano y más potente). El caso clásico
  // "a favor de la regla": corrección con cilindro negativo a eje 180 (≡ 0 mod 180).
  const rays = emergentes([torica(8.0, 7.0)], 0.15);
  const a = analyzeAstigmaticBundle(rays);
  const zRetina = (a.foci[0].z_mm + a.foci[1].z_mm) / 2;
  const clin = clinicalFromAstigmaticAnalysis(a, { zRetina_mm: zRetina, zReference_mm: 1.0 });
  // eje = meridiano PLANO (0°/180°), NUNCA el empinado (90°)
  assert.ok(Math.abs(normDeg180(clin.minus_cyl_axis_deg)) < 1e-6
    || Math.abs(normDeg180(clin.minus_cyl_axis_deg) - 180) < 1e-6,
  `eje minus-cyl ${clin.minus_cyl_axis_deg}: debía ser el meridiano plano (0/180)`);
  assert.ok(clin.cylinder_d < 0, 'convención de cilindro negativo');
  assert.equal(clin.steep.meridian_deg, 90);
  // esfera = desenfoque del meridiano plano; SE = media
  assert.ok(Math.abs(clin.se_d - (clin.steep.defocus_d + clin.flat.defocus_d) / 2) < 1e-12);
  assert.ok(Math.abs(clin.sphere_d - clin.flat.defocus_d) < 1e-12);
});

test('astigmatism · M(z) es EXACTAMENTE cuadrática: los momentos con z_ref distintos son consistentes', () => {
  const rays = emergentes([torica(7.8, 7.3)], 0.6);
  // la misma física descrita desde dos referencias: los focos absolutos coinciden
  const a1 = analyzeAstigmaticBundle(rays, { z_ref_mm: 0 });
  const a2 = analyzeAstigmaticBundle(rays, { z_ref_mm: 17.3 });
  assert.ok(Math.abs(a1.foci[0].z_mm - a2.foci[0].z_mm) < 1e-9);
  assert.ok(Math.abs(a1.foci[1].z_mm - a2.foci[1].z_mm) < 1e-9);
  assert.ok(Math.abs(a1.foci[0].power_meridian_deg - a2.foci[0].power_meridian_deg) < 1e-9);
  // y los momentos evaluados en un plano dan la misma matriz desde ambas referencias
  const m1 = spotSecondMomentAt(rays, 26, { z_ref_mm: 0 });
  const m2 = spotSecondMomentAt(rays, 26, { z_ref_mm: 17.3 });
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(m1.matrix[i] - m2.matrix[i]) < 1e-12);
});

test('astigmatism · momentos: exige haz mínimo y rayos no perpendiculares', () => {
  assert.throws(() => transverseMoments([{ p: [0, 0, 0], d: [0, 0, 1] }]), /insuficiente/);
  assert.throws(() => transverseMoments([
    { p: [0, 0, 0], d: [0, 0, 1] }, { p: [1, 0, 0], d: [0, 0, 1] }, { p: [0, 1, 0], d: [1, 0, 0] },
  ]), /perpendicular/);
});
