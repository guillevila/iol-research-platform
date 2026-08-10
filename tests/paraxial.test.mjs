/**
 * Tests del motor paraxial (Sprint 2). Los valores esperados se derivan
 * ALGEBRAICAMENTE dentro del propio test (formas cerradas), nunca de memoria.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  refract, transfer, propagate, corneaPowerTwoSurfaces,
  iolPowerForTarget, predictedRefraction, predictedRefractionThickIOL,
} from '../src/optics/paraxial.mjs';
import { createGenericThickIOL } from '../src/core/iol.mjs';

test('paraxial: lente delgada en aire — objeto en infinito enfoca en f=1/P', () => {
  const P = 20;                       // D
  const f = 1 / P;                    // m
  // vergencia tras la lente, propagada casi hasta el foco → diverge
  let V = refract(0, P);
  const Vjusto = transfer(V, f * 0.999999, 1);
  assert.ok(Vjusto > 1e6, 'cerca del foco la vergencia debe crecer sin límite');
  // y en un plano anterior cualquiera, V = 1/(f−d)
  const d = 0.02;
  const esperado = 1 / (f - d);
  assert.ok(Math.abs(transfer(V, d, 1) - esperado) < 1e-9);
});

test('paraxial: transfer con n — vergencia reducida', () => {
  // V=+10 D en medio n=1.336, propagando d=0.010 m: V' = V/(1−(d/n)V), forma cerrada
  const V = 10, d = 0.010, n = 1.336;
  const esperado = V / (1 - (d / n) * V);
  assert.equal(transfer(V, d, n), esperado);
  // propagación nula = identidad; ida y vuelta = identidad
  assert.equal(transfer(V, 0, n), V);
  assert.ok(Math.abs(transfer(transfer(V, d, n), -d, n) - V) < 1e-12);
});

test('paraxial: propagate compone refract/gap en orden', () => {
  const sys = [
    { type: 'refract', power_d: 43 },
    { type: 'gap', distance_m: 0.0045, n: 1.336 },
    { type: 'refract', power_d: 21 },
  ];
  const manual = refract(transfer(refract(0, 43), 0.0045, 1.336), 21);
  assert.equal(propagate(sys, 0), manual);
});

test('paraxial: córnea de dos superficies — forma cerrada de lente gruesa', () => {
  const r1 = 0.0077, r2 = 0.0068, t = 0.00055;
  const P1 = (1.376 - 1) / r1, P2 = (1.336 - 1.376) / r2;
  const esperado = P1 + P2 - (t / 1.376) * P1 * P2;
  const got = corneaPowerTwoSurfaces({ r_anterior_m: r1, r_posterior_m: r2, cct_m: t });
  assert.ok(Math.abs(got.power_d - esperado) < 1e-12);
  assert.ok(got.P1 > 0 && got.P2 < 0, 'anterior convergente, posterior divergente');
});

test('paraxial: round-trip exacto potencia↔refracción', () => {
  const eye = { corneaPower_d: 43.5, al_m: 0.0235, iolPlane_m: 0.0049 };
  for (const target of [-2.5, -1, -0.25, 0, 0.5, 1.5]) {
    const P = iolPowerForTarget({ ...eye, target_d: target });
    const back = predictedRefraction({ ...eye, iolPower_d: P });
    assert.ok(Math.abs(back - target) < 1e-9, `target ${target} → ${back}`);
  }
});

test('paraxial: física cualitativa correcta', () => {
  const eye = { corneaPower_d: 43.5, al_m: 0.0235, iolPlane_m: 0.0049 };
  const P0 = iolPowerForTarget({ ...eye, target_d: 0 });
  // ojo más largo → menos potencia; córnea más curva → menos potencia
  assert.ok(iolPowerForTarget({ ...eye, al_m: 0.0260, target_d: 0 }) < P0);
  assert.ok(iolPowerForTarget({ ...eye, corneaPower_d: 46, target_d: 0 }) < P0);
  // LIO más posterior (mismo resto) → más potencia necesaria
  assert.ok(iolPowerForTarget({ ...eye, iolPlane_m: 0.0056, target_d: 0 }) > P0);
  // más potencia de LIO → refracción más miópica (pendiente negativa)
  const r1 = predictedRefraction({ ...eye, iolPower_d: P0 + 0.5 });
  const r2 = predictedRefraction({ ...eye, iolPower_d: P0 - 0.5 });
  assert.ok(r1 < 0 && r2 > 0);
});

test('paraxial: LIO gruesa genérica converge a la delgada cuando t→0', () => {
  const eye = { corneaPower_d: 43.5, al_m: 0.0235 };
  const plane = 0.0049;
  const P = 21;
  const thin = predictedRefraction({ ...eye, iolPlane_m: plane, iolPower_d: P });
  const thick = createGenericThickIOL({ se_power_d: P, thickness_mm: 0.1 });
  // situar la gruesa con su CENTRO en el plano de la delgada
  const t_m = thick.geometry.central_thickness_mm / 1000;
  const rThick = predictedRefractionThickIOL({ ...eye, iolAnterior_m: plane - t_m / 2, iol: thick });
  assert.ok(Math.abs(rThick - thin) < 0.06, `thin ${thin} vs thick ${rThick}`);
  // y con espesor clínico la diferencia sigue acotada (documenta el orden de magnitud)
  const thick08 = createGenericThickIOL({ se_power_d: P, thickness_mm: 0.8 });
  const t08 = thick08.geometry.central_thickness_mm / 1000;
  const r08 = predictedRefractionThickIOL({ ...eye, iolAnterior_m: plane - t08 / 2, iol: thick08 });
  assert.ok(Math.abs(r08 - thin) < 0.5, `divergencia gruesa excesiva: ${r08} vs ${thin}`);
});

test('paraxial: guardas de dominio y singularidades', () => {
  assert.throws(() => transfer(10, 0.1, 1), RangeError);          // foco en el plano
  assert.throws(() => iolPowerForTarget({ corneaPower_d: 43, al_m: 0.023, iolPlane_m: 0.03 }), RangeError);
  assert.throws(() => predictedRefractionThickIOL({
    corneaPower_d: 43, al_m: 0.023, iolAnterior_m: 0.0225,
    iol: createGenericThickIOL({ se_power_d: 21 }),
  }), RangeError);
});
