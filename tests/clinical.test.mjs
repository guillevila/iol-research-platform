/** Tests del importador clínico (Sprint 12): schemas como fuente única, guardas PII, enlace. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importBatch, linkCases, piiFindings } from '../src/clinical/importer.mjs';
import { validateAgainstSchema } from '../src/clinical/schema_validator.mjs';

// FIXTURES SINTÉTICAS — no proceden de ningún paciente real
const PRE_OK = {
  patient_case_id: 'C2026-0001', eye: 'OD',
  al_mm: 23.52, k1_d: 43.1, k1_axis_deg: 176, k2_d: 44.6, k2_axis_deg: 86,
  keratometric_index: 1.3375, acd_mm: 3.15, lt_mm: 4.6, cct_um: 545,
  wtw_mm: null, ata_mm: null, sts_mm: null, posterior_cornea: null,
  oct_features: { lens_eq_plane_mm: 5.4, lens_eq_diameter_mm: 9.2, lens_tilt_deg: null, lens_decentration_mm: null },
  device: 'IOLMaster 700', device_software_version: null,
};
const SURG_OK = {
  patient_case_id: 'C2026-0001', eye: 'OD',
  iol_manufacturer: 'GENERIC', iol_model: 'TEST-1', iol_power_d: 21.5,
  toric_cylinder_d: 2.25, intended_axis_deg: 86, incision_axis_deg: 135,
  incision_width_mm: 2.2, sia_assumed_d: 0.25, surgeon_id: 'S-01', surgery_period: '2026-Q3',
  complications: null,
};
const POST_OK = {
  patient_case_id: 'C2026-0001', eye: 'OD',
  followup_days: 42, manifest_sphere_d: 0.25, manifest_cylinder_d: -0.5, manifest_axis_deg: 170,
  se_d: 0.0, cdva: 0.9, cdva_scale: 'decimal',
  iol_axial_position_mm: 4.87, iol_tilt_deg: null, iol_decentration_mm: null,
  toric_axis_observed_deg: 88, toric_rotation_deg: 2, measurement_device: 'OCT-X',
};

test('importer: lotes válidos pasan en los tres niveles', () => {
  for (const [kind, rec] of [['preop', PRE_OK], ['surgery', SURG_OK], ['postop', POST_OK]]) {
    const r = importBatch(kind, [rec]);
    assert.equal(r.rejected.length, 0, kind + ': ' + JSON.stringify(r.rejected[0]?.errors));
    assert.equal(r.accepted.length, 1);
  }
});

test('importer: rechaza fuera de rango y tipos erróneos con mensajes útiles', () => {
  const r = importBatch('preop', [{ ...PRE_OK, al_mm: 300 }]);
  assert.equal(r.rejected.length, 1);
  assert.ok(r.rejected[0].errors.some(e => e.includes('al_mm') && e.includes('máximo')));
  const r2 = importBatch('postop', [{ ...POST_OK, followup_days: 12.5 }]);
  assert.ok(r2.rejected[0].errors.some(e => e.includes('followup_days') && e.includes('tipo')));
  const r3 = importBatch('preop', [{ ...PRE_OK, eye: 'AMBOS' }]);
  assert.ok(r3.rejected[0].errors.some(e => e.includes('enum')));
});

test('importer: campo extra rechazado (additionalProperties:false, anti-PII estructural)', () => {
  const r = importBatch('preop', [{ ...PRE_OK, nombre: 'dato indebido' }]);
  assert.equal(r.rejected.length, 1);
  assert.ok(r.rejected[0].errors.some(e => e.includes('"nombre"') && e.includes('posible PII')));
});

test('importer: heurística PII detecta fechas completas y nombres propios', () => {
  const conFecha = { ...SURG_OK, complications: 'revisado el 12/07/1951 sin incidencias' };
  const r = importBatch('surgery', [conFecha]);
  assert.ok(r.rejected[0].errors.some(e => e.includes('fecha completa')));
  const conNombre = { ...SURG_OK, complications: 'paciente Remedios Millan estable' };
  assert.ok(piiFindings(conNombre).some(e => e.includes('nombre propio')));
  // el periodo generalizado 2026-Q3 NO dispara la heurística
  assert.equal(piiFindings(SURG_OK).length, 0);
});

test('importer: patrones del schema (case_id y periodo) aplicados', () => {
  const r = importBatch('surgery', [{ ...SURG_OK, surgery_period: '12/07/2026' }]);
  assert.ok(r.rejected[0].errors.some(e => e.includes('patrón') || e.includes('fecha completa')));
  const r2 = importBatch('preop', [{ ...PRE_OK, patient_case_id: 'id con espacios' }]);
  assert.ok(r2.rejected[0].errors.some(e => e.includes('patrón')));
});

test('linkCases: enlaza por (case_id, eye) y reporta huérfanos', () => {
  const otroOjo = { ...POST_OK, eye: 'OS' };
  const suelto = { ...SURG_OK, patient_case_id: 'C2026-0999' };
  const out = linkCases({ preop: [PRE_OK], surgery: [SURG_OK, suelto], postop: [POST_OK, otroOjo] });
  assert.equal(out.complete.length, 1);
  assert.equal(out.complete[0].key, 'C2026-0001|OD');
  assert.deepEqual(out.orphans.surgery_sin_preop, ['C2026-0999|OD']);
  assert.deepEqual(out.orphans.postop_sin_preop, ['C2026-0001|OS']);
});

test('validator genérico: uniones de tipo y anidados', () => {
  assert.equal(validateAgainstSchema({ type: ['number', 'null'] }, null).length, 0);
  assert.equal(validateAgainstSchema({ type: ['number', 'null'] }, 3.2).length, 0);
  assert.equal(validateAgainstSchema({ type: ['number', 'null'] }, 'x').length, 1);
  const nested = {
    type: 'object', required: ['a'], additionalProperties: false,
    properties: { a: { type: 'object', properties: { b: { type: 'number', minimum: 0 } }, additionalProperties: false } },
  };
  assert.equal(validateAgainstSchema(nested, { a: { b: 1 } }).length, 0);
  assert.ok(validateAgainstSchema(nested, { a: { b: -1 } })[0].includes('$.a.b'));
});
