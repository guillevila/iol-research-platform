/**
 * Tests de la superficie CÓNICA (V1.2) contra soluciones analíticas INDEPENDIENTES.
 *
 * Misma disciplina que physics_analytic.test.mjs: el valor esperado NO sale del motor.
 * Cada test deriva su forma cerrada en el propio test. Las cuatro validaciones:
 *
 *   1. k = 0 ES la esfera: intersección, normal y foco coinciden con la superficie
 *      esférica del motor Y con la forma cerrada trigonométrica, a precisión de máquina.
 *   2. k = −1 (paraboloide, z = r²/2R exacta): el cruce de cada rayo coincide con la
 *      forma cerrada  z = z₀ + h/tan(α−θt),  tan α = h/R,  sin θt = (n1/n2)·sin α.
 *   3. k = −(n1/n2)² (cónica CARTESIANA): foco PERFECTO — la aberración esférica es
 *      exactamente cero y todos los rayos cruzan en el foco paraxial n2·R/(n2−n1).
 *      Es el test más duro: cualquier error en sagita o normales rompe la perfección.
 *   4. La aberración esférica es monótona en k y cruza cero en el k cartesiano: el
 *      parámetro hace física, no decoración.
 *
 * Y las dos convergencias del criterio de salida de V1.2:
 *   - pupila→0 → paraxial para TODO k (la potencia paraxial de una cónica es la de su
 *     esfera osculatriz: el foco límite no depende de k);
 *   - Q=0 documentada ≡ esfera también a nivel de ojo completo.
 *
 * RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sphericalSurface, conicSurface, intersect } from '../src/optics/raytrace/surfaces.mjs';
import { traceRay } from '../src/optics/raytrace/trace.mjs';
import { createPreopEye, createPredictedPostopEye } from '../src/core/eye.mjs';
import { GenericIOLFactory } from '../src/core/iol_factory.mjs';
import { buildRaytraceEye, paraxialFocusOfRaytraceEye } from '../src/optics/eyebuilder.mjs';
import { optimizePowerByRaytrace } from '../src/optimize/raytrace_power.mjs';

/** Cruce con el eje del rayo paralelo a altura h refractado en UNA superficie. */
function cruceDe(surface, h, zStart = -10) {
  const t = traceRay([surface], { p: [0, h, zStart], d: [0, 0, 1] });
  assert.ok(t.ok, `rayo perdido a h=${h}`);
  const r = t.ray;
  return r.p[2] - r.p[1] * (r.d[2] / r.d[1]);
}

test('cónica 1: k=0 ES la esfera — intersección, normal y cruce a precisión de máquina', () => {
  const R = 7.7, n2 = 1.336;
  const esfera = sphericalSurface({ id: 's', zVertex_mm: 0, radius_mm: R, aperture_mm: 4, n_before: 1, n_after: n2 });
  const conica = conicSurface({ id: 'c', zVertex_mm: 0, radius_mm: R, k: 0, aperture_mm: 4, n_before: 1, n_after: n2 });
  for (const h of [0.2, 0.9, 1.8, 2.9]) {
    const rayo = { p: [0.1, h, -10], d: [0, 0, 1] };   // ligeramente fuera de meridiano
    const a = intersect(esfera, rayo), b = intersect(conica, rayo);
    for (let i = 0; i < 3; i++) {
      assert.ok(Math.abs(a.point[i] - b.point[i]) < 1e-12, `punto[${i}] difiere: ${a.point[i]} vs ${b.point[i]}`);
      assert.ok(Math.abs(a.normal[i] - b.normal[i]) < 1e-12, `normal[${i}] difiere`);
    }
    // y ambas coinciden con la forma cerrada del dioptrio esférico:
    //   z₀ = R − √(R²−h²);  sin α = h/R;  sin θt = (n1/n2) sin α;  z = z₀ + h/tan(α−θt)
    const z0 = R - Math.sqrt(R * R - h * h);
    const alpha = Math.asin(h / R);
    const thetaT = Math.asin((1 / n2) * Math.sin(alpha));
    const zCerrada = z0 + h / Math.tan(alpha - thetaT);
    assert.ok(Math.abs(cruceDe(conica, h) - zCerrada) < 1e-10,
      `h=${h}: cónica k=0 ${cruceDe(conica, h)} vs cerrada ${zCerrada}`);
  }
});

test('cónica 2: paraboloide k=−1 — cruce igual a la forma cerrada tan α = h/R', () => {
  // Con k=−1 la sagita es EXACTAMENTE z = r²/(2R) (el discriminante de la sagita vale 1),
  // y la pendiente dz/dr = h/R sin aproximación. De ahí la forma cerrada del cruce.
  const R = 7.7;
  for (const [n1, n2] of [[1, 1.336], [1, 1.5], [1.336, 1.49]]) {
    const p = conicSurface({ id: 'p', zVertex_mm: 0, radius_mm: R, k: -1, aperture_mm: 4, n_before: n1, n_after: n2 });
    for (const h of [0.5, 1.5, 2.5, 3.5]) {
      const z0 = h * h / (2 * R);
      const alpha = Math.atan(h / R);
      const thetaT = Math.asin((n1 / n2) * Math.sin(alpha));
      const zCerrada = z0 + h / Math.tan(alpha - thetaT);
      assert.ok(Math.abs(cruceDe(p, h) - zCerrada) < 1e-10,
        `n1=${n1} n2=${n2} h=${h}: ${cruceDe(p, h)} vs ${zCerrada}`);
    }
  }
});

test('cónica 3: la CARTESIANA k=−(n1/n2)² enfoca PERFECTO en n2·R/(n2−n1) — aberración cero', () => {
  // Resultado clásico de la óptica geométrica: la superficie refractante estigmática
  // para objeto en infinito es la elipse prolata de excentricidad e = n1/n2 (k = −e²).
  // Cualquier error de sagita o de normal rompe la perfección: es el test más sensible.
  for (const [n1, n2, R] of [[1, 1.5, 10], [1, 1.336, 7.7], [1.336, 1.49, 12]]) {
    const kCart = -Math.pow(n1 / n2, 2);
    const surf = conicSurface({ id: 'cart', zVertex_mm: 0, radius_mm: R, k: kCart, aperture_mm: R * 0.45, n_before: n1, n_after: n2 });
    const fParaxial = n2 * R / (n2 - n1);
    for (const h of [0.1, R * 0.1, R * 0.25, R * 0.4]) {
      const z = cruceDe(surf, h);
      assert.ok(Math.abs(z - fParaxial) < 1e-9,
        `n1=${n1}→n2=${n2}, h=${h}: cruce ${z} ≠ foco paraxial ${fParaxial} (la perfección se rompió)`);
    }
  }
});

test('cónica 4: la aberración esférica es monótona en k y cruza cero en el k cartesiano', () => {
  const R = 7.7, n2 = 1.336, h = 2.5;
  const saDe = k => {
    const s = conicSurface({ id: 'k', zVertex_mm: 0, radius_mm: R, k, aperture_mm: 4, n_before: 1, n_after: n2 });
    return cruceDe(s, h) - cruceDe(s, 0.01);      // marginal − paraxial
  };
  const ks = [-1.2, -1, -0.8, -0.56, -0.3, 0, 0.5];
  const sas = ks.map(saDe);
  for (let i = 1; i < sas.length; i++) {
    assert.ok(sas[i] < sas[i - 1], `SA no monótona en k: ${ks[i - 1]}→${ks[i]}: ${sas[i - 1]}→${sas[i]}`);
  }
  const kCart = -Math.pow(1 / n2, 2);              // ≈ −0.5603
  assert.ok(Math.abs(saDe(kCart)) < 1e-9, `en k cartesiano la SA debe anularse: ${saDe(kCart)}`);
  assert.ok(saDe(0) < 0, 'la esfera (k=0) debe tener SA negativa (foco marginal por delante)');
  assert.ok(saDe(-1) > 0, 'el paraboloide sobrecorrige en este medio: SA positiva');
});

test('cónica: guardas de dominio — apertura fuera de la sagita y parámetros no finitos', () => {
  // para (1+k)c² > 0 la sagita existe solo hasta r_max = R/√(1+k): una apertura mayor
  // pediría puntos fuera de la superficie y debe rechazarse al CONSTRUIR
  assert.throws(() => conicSurface({ zVertex_mm: 0, radius_mm: 5, k: 0, aperture_mm: 5.5, n_before: 1, n_after: 1.5 }),
    /fuera del dominio de la\s+sagita/s);
  assert.throws(() => conicSurface({ zVertex_mm: 0, radius_mm: 5, k: 3, aperture_mm: 3, n_before: 1, n_after: 1.5 }),
    /fuera del dominio/);
  // k ≤ −1: dominio ilimitado, la misma apertura es válida
  const ok = conicSurface({ zVertex_mm: 0, radius_mm: 5, k: -1, aperture_mm: 8, n_before: 1, n_after: 1.5 });
  assert.equal(ok.kind, 'conic');
  assert.throws(() => conicSurface({ zVertex_mm: 0, radius_mm: 0, k: 0, n_before: 1, n_after: 1.5 }), RangeError);
  assert.throws(() => conicSurface({ zVertex_mm: 0, radius_mm: 5, k: NaN, n_before: 1, n_after: 1.5 }), TypeError);
});

// ---------------------------------------------------------------------------
// Las dos convergencias del criterio de salida de V1.2, a nivel de ojo completo
// ---------------------------------------------------------------------------

function postopConQ({ qc = null, ql = null } = {}) {
  const pre = createPreopEye({
    al_mm: 23.5, k1_d: 43.5, k1_axis_deg: 180, k2_d: 43.5, k2_axis_deg: 90,
    acd_mm: 3.2, lt_mm: 4.5, cct_um: 550, keratometric_index: 1.3375,
    cornea: {
      r_anterior_mm: 7.7, r_posterior_mm: 6.8,
      ...(qc !== null ? { asphericity_q_anterior: qc, asphericity_q_posterior: qc } : {}),
    },
    meta: { source: 'synthetic' },
  });
  return createPredictedPostopEye(pre, { iol_position_mm: 4.9, position_source: 'test' });
}

test('V1.2 · convergencia 1: Q=0 documentada ≡ esfera también en el OJO COMPLETO', () => {
  const iolQ0 = new GenericIOLFactory({ q_anterior: 0, q_posterior: 0 }).create({ power_d: 21 });
  const iolEsf = new GenericIOLFactory().create({ power_d: 21 });
  const eyeQ0 = buildRaytraceEye(postopConQ({ qc: 0 }), iolQ0);
  const eyeEsf = buildRaytraceEye(postopConQ(), iolEsf);
  assert.equal(eyeQ0.surfaces.filter(s => s.kind === 'conic').length, 4);
  assert.equal(eyeEsf.surfaces.filter(s => s.kind === 'sphere').length, 4);
  // mismo foco paraxial exacto y mismo foco trazado a precisión de máquina
  assert.ok(Math.abs(paraxialFocusOfRaytraceEye(eyeQ0) - paraxialFocusOfRaytraceEye(eyeEsf)) < 1e-12);
  const zQ0 = (h) => { const t = traceRay(eyeQ0.surfaces, { p: [0, h, -5], d: [0, 0, 1] }); return t.ray.p[2] - t.ray.p[1] * (t.ray.d[2] / t.ray.d[1]); };
  const zEsf = (h) => { const t = traceRay(eyeEsf.surfaces, { p: [0, h, -5], d: [0, 0, 1] }); return t.ray.p[2] - t.ray.p[1] * (t.ray.d[2] / t.ray.d[1]); };
  for (const h of [0.3, 0.9, 1.4]) {
    assert.ok(Math.abs(zQ0(h) - zEsf(h)) < 1e-10, `h=${h}: cónico-Q0 ${zQ0(h)} vs esférico ${zEsf(h)}`);
  }
});

test('V1.2 · convergencia 2: pupila→0 → paraxial para TODO k (O(pupila²) se conserva)', () => {
  // la potencia paraxial de una cónica es la de su esfera osculatriz: el óptimo límite
  // no puede depender de k, y la convergencia debe seguir siendo O(pupila²)
  const post = postopConQ({ qc: -0.25 });
  for (const q of [-0.6, -0.25, 0.3]) {
    const factory = new GenericIOLFactory({ q_anterior: q, q_posterior: q });
    const referencia = (() => {   // paraxial del MISMO sistema, por bisección
      const desvio = P => {
        const eye = buildRaytraceEye(post, factory.create({ power_d: P }));
        return paraxialFocusOfRaytraceEye(eye) - eye.retina_z_mm;
      };
      let lo = 5, hi = 45;
      for (let i = 0; i < 100; i++) { const m = (lo + hi) / 2; if (desvio(m) > 0) lo = m; else hi = m; }
      return (lo + hi) / 2;
    })();
    const errores = [0.4, 0.2, 0.1].map(pupil_mm => Math.abs(optimizePowerByRaytrace({
      postop: post, factory, pupil_mm, tol_d: 1e-7,
    }).exact_power_d - referencia));
    for (let i = 1; i < errores.length; i++) {
      const orden = errores[i - 1] / errores[i];
      assert.ok(Math.abs(orden - 4) < 0.3,
        `q=${q}: orden de convergencia ${orden.toFixed(2)} ≠ 4 — la cónica rompió el límite paraxial`);
    }
    assert.ok(errores[2] < 1e-3, `q=${q}: residuo ${errores[2]} D a pupila 0.1 mm`);
  }
});
