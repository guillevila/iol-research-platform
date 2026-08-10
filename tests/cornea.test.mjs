/**
 * Tests de la política corneal explícita (V0.5 / P0.1) — hallazgo H1 de la auditoría.
 *
 * La pregunta que cierran: ¿la física del motor depende de la CONVENCIÓN de índice
 * queratométrico bajo la que se expresó el dato? Con la política de lectura, sí (y se
 * cuantifica aquí). Con la política de radio recuperado, no: tres convenciones distintas
 * (1.3375 / 1.3315 / 1.332) aplicadas a la MISMA córnea devuelven el MISMO radio y la
 * MISMA potencia. Nada de esto compara dispositivos reales: es sensibilidad sintética a
 * la convención declarada.
 *
 * RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPreopEye, createPredictedPostopEye } from '../src/core/eye.mjs';
import { createGenericThickIOL } from '../src/core/iol_factory.mjs';
import { buildParaxialEye, buildRaytraceEye, corneaModelOf } from '../src/optics/eyebuilder.mjs';
import {
  CorneaPolicy, KERATOMETRIC_INDICES, buildCorneaModel,
  keratometryFromRadiusMm, radiusMmFromKeratometry,
  singleSurfacePowerFromRadiusMm, keratometricBiasFactor,
} from '../src/optics/cornea.mjs';
import { N_AIR, N_AQUEOUS } from '../src/optics/constants.mjs';

const INDICES = [KERATOMETRIC_INDICES.n_1_3375, KERATOMETRIC_INDICES.n_1_3315, KERATOMETRIC_INDICES.n_1_332];

/** Ojo cuya córnea física tiene radio `r_mm`, expresado como K bajo la convención n_k. */
function eyeAsReadBy(r_mm, n_k, extra = {}) {
  const K = keratometryFromRadiusMm(r_mm, n_k);
  return createPreopEye({
    al_mm: 23.5, k1_d: K, k1_axis_deg: 180, k2_d: K, k2_axis_deg: 90,
    acd_mm: 3.2, lt_mm: 4.5, cct_um: 550,
    keratometric_index: n_k, meta: { source: 'synthetic' }, ...extra,
  });
}

test('keratometría: r→K→r es una identidad exacta para cada convención', () => {
  for (const n_k of INDICES) {
    for (const r of [7.0, 7.7, 8.4, 6.5, 9.0]) {
      const K = keratometryFromRadiusMm(r, n_k);
      assert.ok(Math.abs(radiusMmFromKeratometry(K, n_k) - r) < 1e-12,
        `n_k=${n_k} r=${r}: round-trip no exacto`);
    }
  }
});

test('P0.1: tres convenciones sobre la MISMA córnea → mismo radio y misma potencia física', () => {
  const R = 7.7;
  const lecturas = INDICES.map(n_k => keratometryFromRadiusMm(R, n_k));
  // premisa del test: las convenciones NO coinciden en la lectura
  assert.ok(Math.max(...lecturas) - Math.min(...lecturas) > 0.5,
    `las lecturas deben diferir entre convenciones: ${lecturas}`);

  const radios = [], potencias = [];
  for (const n_k of INDICES) {
    const m = buildCorneaModel(eyeAsReadBy(R, n_k), { policy: CorneaPolicy.SINGLE_SURFACE_FROM_RADIUS });
    radios.push(m.r_anterior_mm);
    potencias.push(m.power_d);
    assert.equal(m.invariant_to_device_index, true);
  }
  for (const r of radios) assert.ok(Math.abs(r - R) < 1e-12, `radio recuperado ${r} ≠ ${R}`);
  for (const p of potencias) {
    assert.ok(Math.abs(p - potencias[0]) < 1e-12, `potencia dependiente de la convención: ${potencias}`);
  }
  // y coincide con la forma cerrada del dioptrio único aire→acuoso
  assert.ok(Math.abs(potencias[0] - (N_AQUEOUS - N_AIR) * 1000 / R) < 1e-12);
});

test('P0.1: con la política de lectura la física SÍ depende de la convención (defecto documentado)', () => {
  const R = 7.7;
  const potencias = INDICES.map(n_k =>
    buildCorneaModel(eyeAsReadBy(R, n_k), { policy: CorneaPolicy.KERATOMETRIC_READING }));
  const rango = Math.max(...potencias.map(p => p.power_d)) - Math.min(...potencias.map(p => p.power_d));
  assert.ok(rango > 0.5, `se esperaba divergencia entre convenciones; obtenido ${rango} D`);
  for (const p of potencias) {
    assert.equal(p.invariant_to_device_index, false);
    assert.ok(p.assumptions.some(a => /lectura del dispositivo COMO potencia/.test(a)));
  }
});

test('P0.1: el sesgo queratométrico tiene la forma cerrada (n_ac−1)/(n_k−1)', () => {
  for (const n_k of INDICES) {
    const esperado = (N_AQUEOUS - 1) / (n_k - 1);
    assert.ok(Math.abs(keratometricBiasFactor(n_k) - esperado) < 1e-15);
    // comprobación cruzada: leer y recuperar debe reproducir el factor sobre K
    const R = 7.7, K = keratometryFromRadiusMm(R, n_k);
    const fisica = singleSurfacePowerFromRadiusMm(radiusMmFromKeratometry(K, n_k));
    assert.ok(Math.abs(fisica / K - esperado) < 1e-12);
  }
  // magnitud del sesgo con la convención dominante: la K sobreestima ~0.19 D sobre 43.5
  const sesgo = 43.5 * (1 - keratometricBiasFactor(1.3375));
  assert.ok(sesgo > 0.15 && sesgo < 0.25, `sesgo ${sesgo} D fuera del orden esperado`);
});

test('P0.1: sin índice declarado, la política de radio se niega a adivinar', () => {
  const pre = createPreopEye({
    al_mm: 23.5, k1_d: 43.5, k1_axis_deg: 180, k2_d: 43.5, k2_axis_deg: 90,
    acd_mm: 3.2, lt_mm: 4.5, cct_um: 550, keratometric_index: null,
    meta: { source: 'synthetic' },
  });
  assert.throws(() => buildCorneaModel(pre, { policy: CorneaPolicy.SINGLE_SURFACE_FROM_RADIUS }),
    /exige keratometric_index/);
});

test('P0.1: la córnea de dos superficies no se fabrica con supuestos no citados', () => {
  const pre = eyeAsReadBy(7.7, 1.3375);
  // medida: no hay radios medidos → prohibido sustituir
  assert.throws(() => buildCorneaModel(pre, { policy: CorneaPolicy.TWO_SURFACE_MEASURED }),
    /NO se sustituyen por supuestos/);
  // ratio: sin ratio explícito, y sin procedencia, no se construye
  assert.throws(() => buildCorneaModel(pre, { policy: CorneaPolicy.TWO_SURFACE_RATIO }),
    /posterior_ratio/);
  assert.throws(() => buildCorneaModel(pre, { policy: CorneaPolicy.TWO_SURFACE_RATIO, posterior_ratio: 0.883 }),
    /provenance/);
  // con ambos declarados sí se construye, y el supuesto queda registrado en la salida
  const m = buildCorneaModel(pre, {
    policy: CorneaPolicy.TWO_SURFACE_RATIO, posterior_ratio: 0.883,
    provenance: 'ratio de ojo esquemático clásico — pendiente de cita formal (OPEN_QUESTIONS #1)',
  });
  assert.match(m.assumptions[0], /SUPUESTO declarado/);
  assert.ok(m.power_d < 43.5, 'la posterior es divergente: debe restar potencia');
  assert.equal(m.r_posterior_mm, 0.883 * 7.7);
});

test('P0.1: una política inexistente falla en vez de caer en un defecto silencioso', () => {
  assert.throws(() => buildCorneaModel(eyeAsReadBy(7.7, 1.3375), { policy: 'LA_QUE_SEA' }),
    /política corneal desconocida/);
});

test('P0.1: radios medidos ganan a cualquier convención de lectura', () => {
  const pre = eyeAsReadBy(7.7, 1.3375, { cornea: { r_anterior_mm: 7.7, r_posterior_mm: 6.8 } });
  const m = corneaModelOf(pre);                    // sin política explícita
  assert.equal(m.policy, CorneaPolicy.TWO_SURFACE_MEASURED);
  assert.equal(m.invariant_to_device_index, true);
  assert.deepEqual(m.assumptions, []);
});

test('P0.1: la política viaja en la salida de ambos motores y ambos usan la MISMA córnea', () => {
  const iol = createGenericThickIOL({ power_d: 21 });
  for (const policy of [CorneaPolicy.KERATOMETRIC_READING, CorneaPolicy.SINGLE_SURFACE_FROM_RADIUS]) {
    const pre = eyeAsReadBy(7.7, 1.3375);
    const post = createPredictedPostopEye(pre, { iol_position_mm: 4.9, position_source: 'test' });
    const par = buildParaxialEye(post, { cornea: { policy } });
    const rt = buildRaytraceEye(post, iol, { cornea: { policy } });
    assert.equal(par.cornea_policy, policy);
    assert.equal(rt.cornea_policy, policy);
    // el dioptrio equivalente del trazador reproduce EXACTAMENTE la potencia del paraxial
    const pSup = (N_AQUEOUS - N_AIR) * 1000 / rt.surfaces[0].radius_mm;
    assert.ok(Math.abs(pSup - par.corneaPower_d) < 1e-12,
      `${policy}: trazador ${pSup} vs paraxial ${par.corneaPower_d}`);
  }
});

test('P0.1: cambiar de política mueve la refracción de forma acotada y del signo correcto', () => {
  const pre = eyeAsReadBy(7.7, 1.3375);
  const post = createPredictedPostopEye(pre, { iol_position_mm: 4.9, position_source: 'test' });
  const P = 21;
  const rLectura = buildParaxialEye(post, { cornea: { policy: CorneaPolicy.KERATOMETRIC_READING } })
    .refractionForThinPower(P);
  const rRadio = buildParaxialEye(post, { cornea: { policy: CorneaPolicy.SINGLE_SURFACE_FROM_RADIUS } })
    .refractionForThinPower(P);
  // menos potencia corneal ⇒ el ojo enfoca por detrás ⇒ refracción más hipermétrope
  assert.ok(rRadio > rLectura, `radio ${rRadio} debería ser más hipermétrope que lectura ${rLectura}`);
  const delta = rRadio - rLectura;
  assert.ok(delta > 0.05 && delta < 0.35, `Δ refracción entre políticas = ${delta} D, fuera de orden`);
});
