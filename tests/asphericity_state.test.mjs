/**
 * Tests del estado explícito de asfericidad (revisión pre-V1.2).
 *
 * MOTIVO: hasta esta revisión, una LIO con asfericidad UNKNOWN se trazaba como esfera EN
 * SILENCIO — el mismo patrón de relleno tácito que V0.5 eliminó del índice queratométrico
 * (P0.1) y del radio plano. "No sé qué asfericidad tiene" y "decidí modelarla esférica"
 * son afirmaciones distintas y el modelo debe poder distinguirlas:
 *
 *   número            Q documentada  → el trazador la exige implementada o FALLA
 *   ASSUMED_SPHERICAL supuesto DECLARADO → esfera, sin nota (la decisión ya es visible)
 *   UNKNOWN           no documentada → esfera con el supuesto REGISTRADO en la salida
 *
 * RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPreopEye, createPredictedPostopEye } from '../src/core/eye.mjs';
import { createIOL, ASSUMED_SPHERICAL, UNKNOWN, GeometryStatus } from '../src/core/iol.mjs';
import { GenericIOLFactory, ManufacturerIOLFactory } from '../src/core/iol_factory.mjs';
import { buildRaytraceEye } from '../src/optics/eyebuilder.mjs';
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

test('asfericidad: una Q NUMÉRICA documentada hace FALLAR el trazado, no se ignora', () => {
  const post = postopOf();
  const conQ = new ManufacturerIOLFactory({
    manufacturer: 'ACME', model: 'M2', provenance: PROV,
    geometryByPower: { 20: { ...GEOM_SIN_Q, asphericity_q_anterior: -0.27 } },
  }).create({ power_d: 20 });
  assert.throws(() => buildRaytraceEye(post, conQ),
    /Q=-0\.27 documentada.*no implementa superficies cónicas/s,
    'trazar la esfera ignorando una Q documentada falsearía un dato de fabricante');
  // y el optimizador hereda el fallo en vez de degradar. Con una fábrica de fabricante
  // la búsqueda continua sondea potencias no tabuladas, así que puede saltar ANTES la
  // guarda de geometría no trazable — ambas son fallos correctos: lo prohibido es que
  // devuelva un número.
  const factoryConQ = new ManufacturerIOLFactory({
    manufacturer: 'ACME', model: 'M2', provenance: PROV,
    geometryByPower: Object.fromEntries(
      [18, 19, 20, 21, 22].map(p => [p, { ...GEOM_SIN_Q, asphericity_q_anterior: -0.27 }])),
  });
  assert.throws(
    () => optimizePowerByRaytrace({ postop: post, factory: factoryConQ, pupil_mm: 3, search_d: [15, 25] }),
    /no implementa superficies cónicas|no tiene geometría trazable/);
  // con una fábrica que SÍ cubre el continuo (espía que copia la Q sobre la genérica),
  // la guarda que dispara es exactamente la de la Q documentada
  const base = new GenericIOLFactory();
  const espiaConQ = {
    id: 'espia_q',
    create: ({ power_d }) => {
      const iol = base.create({ power_d });
      return createIOL({
        manufacturer: 'ACME', model: 'M2c', nominal_power_d: power_d,
        geometry: { ...iol.geometry, asphericity_q_anterior: -0.27 },
        geometry_status: GeometryStatus.MANUFACTURER, provenance: PROV,
      });
    },
  };
  assert.throws(
    () => optimizePowerByRaytrace({ postop: post, factory: espiaConQ, pupil_mm: 3, search_d: [15, 25] }),
    /no implementa superficies cónicas/);
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

test('asfericidad: Q=0 numérica NO es lo mismo que ASSUMED_SPHERICAL', () => {
  // Q=0 es una afirmación de fabricante ("la cara es exactamente esférica, documentado");
  // ASSUMED_SPHERICAL es una decisión de modelado. El trazador actual rechaza también la
  // Q=0 numérica: aceptarla exigiría distinguir "documentada como esfera" en la salida,
  // y eso llega con las superficies cónicas (que con k=0 deben reproducir la esfera).
  const post = postopOf();
  const q0 = new ManufacturerIOLFactory({
    manufacturer: 'ACME', model: 'M3', provenance: PROV,
    geometryByPower: { 20: { ...GEOM_SIN_Q, asphericity_q_anterior: 0, asphericity_q_posterior: 0 } },
  }).create({ power_d: 20 });
  assert.equal(q0.geometry.asphericity_q_anterior, 0);      // se almacena como dato
  assert.throws(() => buildRaytraceEye(post, q0), /Q=0 documentada/);
});
