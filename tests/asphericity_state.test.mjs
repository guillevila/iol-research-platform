/**
 * Tests del estado explícito de asfericidad (revisión pre-V1.2).
 *
 * MOTIVO: hasta esta revisión, una LIO con asfericidad UNKNOWN se trazaba como esfera EN
 * SILENCIO — el mismo patrón de relleno tácito que V0.5 eliminó del índice queratométrico
 * (P0.1) y del radio plano. "No sé qué asfericidad tiene" y "decidí modelarla esférica"
 * son afirmaciones distintas y el modelo debe poder distinguirlas:
 *
 *   número            Q documentada/declarada → se TRAZA como superficie cónica (V1.2)
 *   ASSUMED_SPHERICAL supuesto DECLARADO → esfera (sin nota en el sustituto; con nota
 *                     registrada en una lente real)
 *   UNKNOWN           no documentada → esfera con el supuesto REGISTRADO en la salida
 *
 * RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPreopEye, createPredictedPostopEye } from '../src/core/eye.mjs';
import { createIOL, ASSUMED_SPHERICAL, UNKNOWN, GeometryStatus } from '../src/core/iol.mjs';
import { GenericIOLFactory, ManufacturerIOLFactory } from '../src/core/iol_factory.mjs';
import { buildRaytraceEye, paraxialFocusOfRaytraceEye } from '../src/optics/eyebuilder.mjs';
import { optimizePowerByRaytrace } from '../src/optimize/raytrace_power.mjs';

function postopOf() {
  const pre = createPreopEye({
    al_mm: 23.5, k1_d: 43.5, k1_axis_deg: 180, k2_d: 43.5, k2_axis_deg: 90,
    acd_mm: 3.2, lt_mm: 4.5, cct_um: 550, meta: { source: 'synthetic' },
  });
  return createPredictedPostopEye(pre, { iol_position_mm: 4.9, position_source: 'test' });
}

const GEOM_SIN_Q = {
  refractive_index: 1.47, central_thickness_mm: 0.7, r_anterior_mm: 20.0, r_posterior_mm: -20.0,
};
const PROV = 'FICTICIA — fixture de test, no es una lente real ni una ficha técnica';

test('asfericidad: la genérica DECLARA sus esferas; una comercial sin Q queda UNKNOWN', () => {
  const generica = new GenericIOLFactory().create({ power_d: 21 });
  assert.equal(generica.geometry.asphericity_q_anterior, ASSUMED_SPHERICAL);
  assert.equal(generica.geometry.asphericity_q_posterior, ASSUMED_SPHERICAL);

  // la fábrica de fabricante NO añade ASSUMED_SPHERICAL por su cuenta: eso sería
  // declarar en nombre del fabricante un supuesto que nadie tomó
  const comercial = new ManufacturerIOLFactory({
    manufacturer: 'ACME', model: 'M1', geometryByPower: { 20: GEOM_SIN_Q }, provenance: PROV,
  }).create({ power_d: 20 });
  assert.equal(comercial.geometry_status, GeometryStatus.MANUFACTURER);
  assert.equal(comercial.geometry.asphericity_q_anterior, UNKNOWN);
  assert.equal(comercial.geometry.asphericity_q_posterior, UNKNOWN);
});

test('asfericidad: UNKNOWN se traza como esfera CON el supuesto registrado, nunca tácito', () => {
  const post = postopOf();
  const comercial = new ManufacturerIOLFactory({
    manufacturer: 'ACME', model: 'M1', geometryByPower: { 20: GEOM_SIN_Q }, provenance: PROV,
  }).create({ power_d: 20 });
  const eye = buildRaytraceEye(post, comercial);
  const deIol = eye.assumptions.filter(a => /^iol_(ant|post):/.test(a));
  assert.equal(deIol.length, 2, `esperaba supuestos para ambas caras: ${JSON.stringify(eye.assumptions)}`);
  for (const a of deIol) {
    assert.match(a, /asfericidad no documentada/);
    assert.match(a, /SUPUESTO registrado, no verificado/);
  }
});

test('asfericidad: ASSUMED_SPHERICAL no genera nota — el supuesto ya es visible en el modelo', () => {
  const post = postopOf();
  const eye = buildRaytraceEye(post, new GenericIOLFactory().create({ power_d: 21 }));
  assert.equal(eye.assumptions.filter(a => /^iol_/.test(a)).length, 0,
    `la genérica declara sus esferas; no debe haber notas de LIO: ${JSON.stringify(eye.assumptions)}`);
  // la córnea sigue llevando su supuesto declarado (no se modela asfericidad corneal)
  assert.equal(eye.assumptions.filter(a => /^cornea:/.test(a)).length, 1);
});

test('asfericidad: una Q NUMÉRICA documentada se TRAZA como cónica, sin nota (V1.2)', () => {
  // hasta V1.2 el contrato era FALLAR (ignorar un dato documentado falsearía la lente);
  // desde V1.2 el dato documentado se honra: la superficie es una cónica con k = Q.
  const post = postopOf();
  const conQ = new ManufacturerIOLFactory({
    manufacturer: 'ACME', model: 'M2', provenance: PROV,
    geometryByPower: { 20: { ...GEOM_SIN_Q, asphericity_q_anterior: -0.27 } },
  }).create({ power_d: 20 });
  const eye = buildRaytraceEye(post, conQ);
  const ant = eye.surfaces.find(s => s.id === 'iol_ant');
  const post_ = eye.surfaces.find(s => s.id === 'iol_post');
  assert.equal(ant.kind, 'conic');
  assert.equal(ant.k, -0.27);
  assert.equal(post_.kind, 'sphere', 'la cara sin Q sigue siendo esfera (con nota)');
  // la cara documentada no genera nota; la no documentada sí
  assert.equal(eye.assumptions.filter(a => /^iol_ant:/.test(a)).length, 0);
  assert.equal(eye.assumptions.filter(a => /^iol_post:/.test(a)).length, 1);
  // y el optimizador con una fábrica que cubre el continuo con Q declarada FUNCIONA
  const conQdeclarada = new GenericIOLFactory({ q_anterior: -0.27, q_posterior: -0.15 });
  const r = optimizePowerByRaytrace({ postop: post, factory: conQdeclarada, pupil_mm: 3 });
  assert.ok(Number.isFinite(r.exact_power_d));
});

test('asfericidad: valores basura se rechazan al construir la LIO', () => {
  for (const basura of ['esferica', true, NaN, Infinity, {}]) {
    assert.throws(() => createIOL({
      manufacturer: 'X', model: 'Y', nominal_power_d: 21,
      geometry: { ...GEOM_SIN_Q, asphericity_q_anterior: basura },
    }), TypeError, `debería rechazar ${String(basura)}`);
  }
  // los tres estados válidos construyen sin error
  for (const valido of [-0.5, 0, ASSUMED_SPHERICAL, UNKNOWN, undefined]) {
    const iol = createIOL({
      manufacturer: 'X', model: 'Y', nominal_power_d: 21,
      geometry: { ...GEOM_SIN_Q, asphericity_q_anterior: valido },
    });
    assert.ok(iol.geometry.asphericity_q_anterior !== null);
  }
});

test('asfericidad: Q=0 numérica NO es lo mismo que ASSUMED_SPHERICAL — pero traza idéntico', () => {
  // Q=0 es una afirmación documentada ("la cara ES esférica"); ASSUMED_SPHERICAL es una
  // decisión de modelado. Semántica distinta (documentada no genera nota en una lente
  // real; asumida sí), física idéntica: la cónica k=0 ES la esfera.
  const post = postopOf();
  const q0 = new ManufacturerIOLFactory({
    manufacturer: 'ACME', model: 'M3', provenance: PROV,
    geometryByPower: { 20: { ...GEOM_SIN_Q, asphericity_q_anterior: 0, asphericity_q_posterior: 0 } },
  }).create({ power_d: 20 });
  assert.equal(q0.geometry.asphericity_q_anterior, 0);
  const eyeQ0 = buildRaytraceEye(post, q0);
  assert.equal(eyeQ0.surfaces.find(s => s.id === 'iol_ant').kind, 'conic');
  assert.equal(eyeQ0.assumptions.filter(a => /^iol_/.test(a)).length, 0,
    'Q=0 documentada no es un supuesto: no genera nota');
  // misma lente declarada ASSUMED_SPHERICAL: trazado esférico + nota registrada
  const asumida = new ManufacturerIOLFactory({
    manufacturer: 'ACME', model: 'M3b', provenance: PROV,
    geometryByPower: { 20: { ...GEOM_SIN_Q, asphericity_q_anterior: 'ASSUMED_SPHERICAL', asphericity_q_posterior: 'ASSUMED_SPHERICAL' } },
  }).create({ power_d: 20 });
  const eyeAsumida = buildRaytraceEye(post, asumida);
  assert.equal(eyeAsumida.surfaces.find(s => s.id === 'iol_ant').kind, 'sphere');
  assert.equal(eyeAsumida.assumptions.filter(a => /esfericidad ASUMIDA por el modelador/.test(a)).length, 2);
  // física idéntica: mismo foco paraxial a precisión de máquina
  assert.ok(Math.abs(paraxialFocusOfRaytraceEye(eyeQ0) - paraxialFocusOfRaytraceEye(eyeAsumida)) < 1e-12);
});

test('asfericidad: una Q solo en la cara POSTERIOR se traza en ESA cara (cobertura por cara)', () => {
  // Herencia del hallazgo adversarial (los fixtures solo ponían Q en la anterior): la
  // cara posterior debe tener su propio despacho, no heredar el de la anterior.
  const post = postopOf();
  const soloPosterior = new ManufacturerIOLFactory({
    manufacturer: 'ACME', model: 'M5', provenance: PROV,
    geometryByPower: { 20: { ...GEOM_SIN_Q, asphericity_q_posterior: -0.15 } },
  }).create({ power_d: 20 });
  const eye = buildRaytraceEye(post, soloPosterior);
  assert.equal(eye.surfaces.find(s => s.id === 'iol_ant').kind, 'sphere');
  const sp = eye.surfaces.find(s => s.id === 'iol_post');
  assert.equal(sp.kind, 'conic');
  assert.equal(sp.k, -0.15);
  assert.equal(eye.assumptions.filter(a => /^iol_ant:/.test(a)).length, 1);
  assert.equal(eye.assumptions.filter(a => /^iol_post:/.test(a)).length, 0);
});

test('asfericidad: el OPTIMIZADOR expone los supuestos del trazado — la trazabilidad no se pierde', () => {
  // Hallazgo de la revisión adversarial: optimizePowerByRaytrace construía el ojo,
  // tenía eye.assumptions a mano y lo descartaba — una LIO con Q UNKNOWN producía una
  // recomendación sin rastro del supuesto de esfera. Este test fija la propagación.
  const post = postopOf();

  // con la genérica (esferas DECLARADAS): solo el supuesto corneal
  const rGen = optimizePowerByRaytrace({ postop: post, pupil_mm: 3 });
  assert.ok(Array.isArray(rGen.supuestos_trazado));
  assert.equal(rGen.supuestos_trazado.filter(a => /^iol_/.test(a)).length, 0);
  assert.equal(rGen.supuestos_trazado.filter(a => /^cornea:/.test(a)).length, 1);

  // con una lente de fabricante SIN Q documentada (espía que cubre el continuo):
  // los supuestos de ambas caras deben llegar a la salida del optimizador
  const base = new GenericIOLFactory();
  const espiaSinQ = {
    id: 'espia_sin_q',
    create: ({ power_d }) => {
      const { asphericity_q_anterior, asphericity_q_posterior, ...resto } = base.create({ power_d }).geometry;
      return createIOL({
        manufacturer: 'ACME', model: 'M6', nominal_power_d: power_d,
        geometry: resto, geometry_status: GeometryStatus.MANUFACTURER, provenance: PROV,
      });
    },
  };
  const rMfr = optimizePowerByRaytrace({ postop: post, factory: espiaSinQ, pupil_mm: 3 });
  assert.ok(rMfr.supuestos_trazado.some(a => /^iol_ant: asfericidad no documentada/.test(a)));
  assert.ok(rMfr.supuestos_trazado.some(a => /^iol_post: asfericidad no documentada/.test(a)));
});
