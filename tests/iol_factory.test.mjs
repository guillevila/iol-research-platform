/**
 * Tests del contrato LIO consciente de la potencia (V0.5 / P0.2-P0.3).
 *
 * Cierran el hallazgo H2 de la auditoría: antes `refractionFor(20)` y `refractionFor(25)`
 * podían trazar EXACTAMENTE la misma lente física, porque el argumento se ignoraba
 * cuando había una LIO gruesa inyectada en el constructor del ojo. Cada test de aquí
 * falla si esa ambigüedad reaparece.
 *
 * RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPreopEye, createPredictedPostopEye } from '../src/core/eye.mjs';
import { GeometryStatus, physicalPowerOfIOL, nominalVsPhysicalMismatch, hasTraceableGeometry } from '../src/core/iol.mjs';
import { GenericIOLFactory, ManufacturerIOLFactory, createGenericThickIOL } from '../src/core/iol_factory.mjs';
import { buildParaxialEye, buildRaytraceEye } from '../src/optics/eyebuilder.mjs';

function postopOf({ al = 23.5, k = 43.5, pos = 4.9 } = {}) {
  const pre = createPreopEye({
    al_mm: al, k1_d: k, k1_axis_deg: 180, k2_d: k, k2_axis_deg: 90,
    acd_mm: 3.2, lt_mm: 4.5, cct_um: 550, meta: { source: 'synthetic' },
  });
  return createPredictedPostopEye(pre, { iol_position_mm: pos, position_source: 'test' });
}

test('H2: la API ambigua `refractionFor` ya no existe ni es inyectable', () => {
  const eye = buildParaxialEye(postopOf());
  assert.equal(typeof eye.refractionFor, 'undefined', 'refractionFor debe estar eliminada');
  assert.equal(typeof eye.refractionForThinPower, 'function');
  assert.equal(typeof eye.refractionForIOL, 'function');
  // el constructor ya no acepta una LIO: un segundo argumento no puede cambiar la física
  const conBasura = buildParaxialEye(postopOf(), createGenericThickIOL({ power_d: 30 }));
  assert.equal(conBasura.refractionForThinPower(21), eye.refractionForThinPower(21));
});

test('H2: potencias distintas → lentes físicas distintas → refracciones distintas', () => {
  const eye = buildParaxialEye(postopOf());
  const f = new GenericIOLFactory();
  const potencias = [18, 21, 24];
  const refs = potencias.map(P => eye.refractionForIOL(f.create({ power_d: P })));
  // más potencia ⇒ más miope (monótona estricta). Con la API antigua las tres eran iguales.
  for (let i = 1; i < refs.length; i++) {
    assert.ok(refs[i] < refs[i - 1] - 1.0, `refracción no responde a la potencia: ${refs}`);
  }
  // y los radios son realmente distintos, no una geometría fija reetiquetada
  const radios = potencias.map(P => f.create({ power_d: P }).geometry.r_anterior_mm);
  assert.equal(new Set(radios).size, potencias.length);
});

test('genérica: la potencia FÍSICA de la geometría iguala la nominal en todo el catálogo', () => {
  for (const t_mm of [0.2, 0.8, 1.4]) {
    const f = new GenericIOLFactory({ thickness_mm: t_mm });
    for (let P = -5; P <= 40; P += 2.5) {
      const iol = f.create({ power_d: P });
      const mismatch = nominalVsPhysicalMismatch(iol);
      assert.ok(Math.abs(mismatch) < 1e-9,
        `t=${t_mm} P=${P}: física ${physicalPowerOfIOL(iol)} vs nominal ${P} (Δ=${mismatch})`);
    }
  }
});

test('genérica: el caso plano da radio infinito exacto, no un sentinela finito', () => {
  const iol = new GenericIOLFactory().create({ power_d: 0 });
  assert.equal(iol.geometry.r_anterior_mm, Infinity);
  assert.equal(iol.geometry.r_posterior_mm, -Infinity);
  assert.equal(physicalPowerOfIOL(iol), 0);      // exacto, sin residuo espurio
});

test('genérica: la rama elegida de la ecuación cuadrática es la continua con la lente delgada', () => {
  // con t→0, r1 → 2·(n−nm)/P  (equibiconvexa delgada: P = 2·(n−nm)/r1)
  const P = 21, n = 1.49, nm = 1.336;
  const fino = new GenericIOLFactory({ thickness_mm: 0.05 }).create({ power_d: P });
  const rDelgada = 2 * (n - nm) * 1000 / P;
  // la separación con la delgada es O(t): a t=0.05 mm son ~0.02 mm de radio sobre 14.7 mm
  assert.ok(Math.abs(fino.geometry.r_anterior_mm - rDelgada) < 0.05,
    `r=${fino.geometry.r_anterior_mm} vs delgada ${rDelgada}`);
  assert.ok(fino.geometry.r_anterior_mm > 0 && fino.geometry.r_posterior_mm < 0, 'debe ser biconvexa');
});

test('genérica: gruesa≈delgada a primer orden y se declara como sustituto de simulación', () => {
  const eye = buildParaxialEye(postopOf());
  const iol = createGenericThickIOL({ power_d: 21, thickness_mm: 0.1 });
  // 0.06 D es la cota del mismo efecto O(t) medido en paraxial.test.mjs para t=0.1 mm
  // (allí se demuestra que la diferencia es lineal en t con intercepto 0)
  assert.ok(Math.abs(eye.refractionForIOL(iol) - eye.refractionForThinPower(21)) < 0.06);
  assert.equal(iol.geometry_status, GeometryStatus.DERIVED_GENERIC);
  assert.equal(iol.is_simulation_surrogate, true);
  assert.equal(iol.manufacturer, 'GENERIC');
});

test('genérica: una potencia irrealizable con la geometría declarada se rechaza, no se aproxima', () => {
  const f = new GenericIOLFactory({ n_iol: 1.49, thickness_mm: 2.5 });
  assert.throws(() => f.create({ power_d: 500 }), RangeError);
  assert.throws(() => new GenericIOLFactory({ n_iol: 0.9 }), RangeError);
});

const GEOM_DEMO = {
  20: { refractive_index: 1.47, central_thickness_mm: 0.7, r_anterior_mm: 20.0, r_posterior_mm: -20.0 },
};
const PROV_DEMO = 'FICTICIA — fixture de test, no es una lente real ni una ficha técnica';

test('comercial: `provenance` es obligatoria para declarar geometría de fabricante', () => {
  assert.throws(() => new ManufacturerIOLFactory({
    manufacturer: 'ACME', model: 'M1', geometryByPower: GEOM_DEMO,
  }), TypeError);
  assert.throws(() => new ManufacturerIOLFactory({
    manufacturer: 'ACME', model: 'M1', geometryByPower: GEOM_DEMO, provenance: 'web',
  }), TypeError);
});

test('comercial: potencia no documentada → UNKNOWN, y el trazado FALLA en vez de inventar', () => {
  const f = new ManufacturerIOLFactory({
    manufacturer: 'ACME', model: 'M1', geometryByPower: GEOM_DEMO, provenance: PROV_DEMO,
  });
  const conocida = f.create({ power_d: 20 });
  assert.equal(conocida.geometry_status, GeometryStatus.MANUFACTURER);
  assert.equal(conocida.is_simulation_surrogate, false);
  assert.equal(conocida.provenance, PROV_DEMO);
  assert.ok(hasTraceableGeometry(conocida));

  const desconocida = f.create({ power_d: 22.5 });
  assert.equal(desconocida.geometry_status, GeometryStatus.UNKNOWN);
  assert.equal(hasTraceableGeometry(desconocida), false);
  assert.match(desconocida.source, /NO DOCUMENTADA/);
  // la barrera anti "ray tracing comercial falso"
  const post = postopOf();
  assert.throws(() => buildRaytraceEye(post, desconocida), /no tiene geometría trazable/);
  assert.throws(() => buildParaxialEye(post).refractionForIOL(desconocida), TypeError);
  assert.throws(() => physicalPowerOfIOL(desconocida), TypeError);
});

test('comercial: la etiqueta nominal NO se confunde con la potencia física medida', () => {
  const f = new ManufacturerIOLFactory({
    manufacturer: 'ACME', model: 'M1', provenance: PROV_DEMO,
    // geometría deliberadamente incoherente con la etiqueta: 20 D nominal, ~15 D físicas
    geometryByPower: GEOM_DEMO,
  });
  const iol = f.create({ power_d: 20 });
  assert.equal(iol.nominal_power_d, 20);
  const mismatch = nominalVsPhysicalMismatch(iol);
  assert.ok(Math.abs(mismatch) > 1,
    'el fixture debe evidenciar que nominal y física son magnitudes separables');
  // y el motor traza la FÍSICA, no la etiqueta
  const eye = buildParaxialEye(postopOf());
  const porGeometria = eye.refractionForIOL(iol);
  const porEtiqueta = eye.refractionForThinPower(20);
  assert.ok(Math.abs(porGeometria - porEtiqueta) > 1,
    'trazar la geometría debe diferir de trazar la etiqueta cuando no coinciden');
});
