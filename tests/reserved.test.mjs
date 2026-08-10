/**
 * Tests del registro de campos reservados (V0.5 / P0.5) — hallazgo H9.
 *
 * El registro solo sirve si no puede quedarse desactualizado. Estos tests lo comparan
 * con el código REAL en las dos direcciones:
 *
 *   a) todo campo declarado reservado debe seguir sin consumirse en `src/`;
 *   b) todo campo de los modelos debe estar o consumido, o declarado reservado —
 *      añadir uno nuevo sin decidir cuál de las dos cosas es hace fallar el test.
 *
 * RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPreopEye, createPredictedPostopEye } from '../src/core/eye.mjs';
import { createIOL } from '../src/core/iol.mjs';
import { RESERVED_FIELDS, RESERVED_NAMES, isReserved } from '../src/core/reserved.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');

const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => {
  const p = path.join(d, e.name);
  return e.isDirectory() ? walk(p) : (p.endsWith('.mjs') ? [p] : []);
});
const FUENTES = walk(SRC);

/** Módulos donde un campo puede APARECER sin estar consumido: su definición y este registro. */
const DEFINICIONES = new Set(['eye.mjs', 'iol.mjs', 'reserved.mjs']);

/** ¿Algún módulo de src/ LEE `obj.campo`, fuera de donde se define? */
function consumidoresDe(campo) {
  const re = new RegExp('\\.' + campo + '(?![A-Za-z0-9_])');
  return FUENTES
    .filter(f => !DEFINICIONES.has(path.basename(f)))
    .filter(f => re.test(fs.readFileSync(f, 'utf8')))
    .map(f => path.relative(ROOT, f).replace(/\\/g, '/'));
}

/** Campos que un modelo expone realmente, construyéndolo con todo relleno. */
const PREOP_COMPLETO = createPreopEye({
  al_mm: 23.5, k1_d: 43, k1_axis_deg: 0, k2_d: 44, k2_axis_deg: 90,
  acd_mm: 3.2, lt_mm: 4.5, cct_um: 550, wtw_mm: 11.8, ata_mm: 12.0, sts_mm: 12.4,
  pupil_mm: 3.5, lens_eq_plane_mm: 4.5, lens_eq_diameter_mm: 9.2,
  lens_tilt_deg: 4, lens_decentration_mm: 0.2, keratometric_index: 1.3375,
  cornea: { r_anterior_mm: 7.7, r_posterior_mm: 6.4, posterior_k1_d: -6, posterior_k2_d: -6.4, posterior_axis_deg: 90 },
  meta: { source: 'synthetic' },
});
const POSTOP_COMPLETO = createPredictedPostopEye(PREOP_COMPLETO, {
  iol_position_mm: 4.9, position_source: 'test',
  iol_tilt_deg: 3, iol_decentration_mm: 0.15, toric_rotation_deg: 5, capsule_state: 'intact',
});
const IOL_COMPLETA = createIOL({
  manufacturer: 'X', model: 'Y', nominal_power_d: 21, a_constant: 119.3,
  geometry: { refractive_index: 1.49, central_thickness_mm: 0.8, r_anterior_mm: 14, r_posterior_mm: -14 },
});

test('reservados: ninguno se consume todavía en src/ (si empiezas a usarlo, quítalo del registro)', () => {
  const incoherentes = [];
  for (const [modelo, campos] of Object.entries(RESERVED_FIELDS)) {
    for (const campo of Object.keys(campos)) {
      const c = consumidoresDe(campo);
      if (c.length) incoherentes.push(`${modelo}.${campo} SÍ se consume en: ${c.join(', ')}`);
    }
  }
  assert.deepEqual(incoherentes, [],
    'campos declarados reservados que ya se usan — actualiza src/core/reserved.mjs:\n' + incoherentes.join('\n'));
});

test('reservados: todo campo del modelo está consumido o declarado — nada queda en el limbo', () => {
  // campos estructurales que no son parámetros del ojo (metadatos y contrato del objeto)
  const ESTRUCTURALES = new Set([
    'kind', 'meta', 'cornea', 'preop', 'geometry', 'simulation_flag', 'source', 'provenance',
    'unknown_parameters', 'geometry_status', 'is_simulation_surrogate', 'position_source',
    'mean_k_d', 'model', 'manufacturer',
    // consumidos DENTRO de su propio módulo de definición (que el escáner excluye):
    // `nominal_power_d` lo lee `nominalVsPhysicalMismatch` en iol.mjs.
    'nominal_power_d',
  ]);
  const sinDecidir = [];
  const revisar = (obj, modelo) => {
    for (const campo of Object.keys(obj)) {
      if (ESTRUCTURALES.has(campo)) continue;
      if (isReserved(campo)) continue;
      if (consumidoresDe(campo).length === 0) sinDecidir.push(`${modelo}.${campo}`);
    }
  };
  revisar(PREOP_COMPLETO, 'preoperative_eye');
  revisar(PREOP_COMPLETO.cornea, 'preoperative_eye.cornea');
  revisar(POSTOP_COMPLETO, 'predicted_postoperative_eye');
  revisar(IOL_COMPLETA, 'iol');
  revisar(IOL_COMPLETA.geometry, 'iol.geometry');
  assert.deepEqual(sinDecidir, [],
    'campos almacenados que ni se consumen ni están declarados reservados:\n' + sinDecidir.join('\n')
    + '\nDecide: úsalo, decláralo en src/core/reserved.mjs, o quítalo del modelo.');
});

test('reservados: cada entrada documenta qué es, quién lo usará y qué lo bloquea', () => {
  for (const [modelo, campos] of Object.entries(RESERVED_FIELDS)) {
    for (const [campo, meta] of Object.entries(campos)) {
      for (const clave of ['que_es', 'consumidor_previsto', 'blocked_by']) {
        assert.ok(typeof meta[clave] === 'string' && meta[clave].length > 10,
          `${modelo}.${campo}: falta \`${clave}\` documentado`);
      }
    }
  }
  // el registro debe cubrir los tres modelos y no estar vacío
  assert.deepEqual(Object.keys(RESERVED_FIELDS).sort(),
    ['iol', 'predicted_postoperative_eye', 'preoperative_eye']);
  assert.equal(RESERVED_NAMES.length, 14);
  assert.equal(new Set(RESERVED_NAMES).size, RESERVED_NAMES.length, 'nombres duplicados');
});

test('reservados: los campos que SÍ influyen no están marcados como reservados', () => {
  // guarda contra el error opuesto: silenciar un parámetro que sí afecta al resultado
  for (const campo of ['al_mm', 'k1_d', 'k2_d', 'acd_mm', 'cct_um', 'iol_position_mm',
    'nominal_power_d', 'keratometric_index', 'posterior_k1_d']) {
    assert.equal(isReserved(campo), false, `${campo} influye en el cálculo: no puede ser reservado`);
  }
});
