/**
 * Tests de regresión del baseline congelado (Sprint 0).
 * Garantizan: (1) el motor no cambia (hash + copia .cjs idéntica), (2) su
 * comportamiento no cambia (golden), (3) las métricas publicadas se reproducen
 * offline desde la caché congelada.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { run_evo_replica, modelNames } from '../legacy/evo_replica/run_evo_replica.mjs';
import { computeMetrics } from '../legacy/evo_replica/harness/replay_metrics.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'legacy', 'evo_replica');
const sha256 = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const HASHES = Object.fromEntries(
  fs.readFileSync(join(ROOT, 'baseline', 'HASHES.sha256'), 'utf8')
    .trim().split('\n').map(l => { const [h, ...p] = l.split('  '); return [p.join('  '), h]; })
);

test('baseline: engine.js congelado coincide con el hash registrado', () => {
  assert.equal(sha256(join(ROOT, 'engine.js')), HASHES['engine.js']);
});

test('baseline: engine.cjs es copia byte-idéntica de engine.js', () => {
  assert.equal(sha256(join(ROOT, 'engine.cjs')), sha256(join(ROOT, 'engine.js')));
});

test('baseline: artefactos de datos críticos intactos', () => {
  for (const f of ['data/tables4.json', 'data/toricmodel6.json', 'data/offsets.json',
    'data/channels.json', 'data/cyltable.json', 'data/models.json', 'cache/cache2.json']) {
    assert.equal(sha256(join(ROOT, f)), HASHES[f], f + ' ha cambiado');
  }
});

test('baseline: golden cases — el motor congelado reproduce su instantánea', () => {
  const golden = JSON.parse(fs.readFileSync(join(ROOT, 'baseline', 'golden_cases.json'), 'utf8'));
  assert.equal(golden.length, 12);
  for (const g of golden) {
    const got = run_evo_replica(g.input);
    assert.deepEqual(got, g.expected, 'divergencia en golden ' + g.input.id);
  }
});

test('baseline: API run_evo_replica cumple el contrato de benchmark', () => {
  const r = run_evo_replica({
    al_mm: 23.5, k1_d: 43, k1_axis_deg: 180, k2_d: 45, k2_axis_deg: 90,
    acd_mm: 3.2, lt_mm: 4.5, cct_um: 550, target_d: 0, a_constant: 119.3,
    iol_model: 'Tecnis', k_index: 1.3375, sia_d: 0.1, sia_axis_deg: 100,
  });
  for (const k of ['predicted_refraction', 'predicted_sphere', 'predicted_cylinder',
    'predicted_axis', 'recommended_power', 'recommended_toric', 'recommended_axis',
    'intermediate_values', 'uncertainty', 'warnings']) {
    assert.ok(k in r, 'falta ' + k);
  }
  assert.ok(r.warnings[0].includes('RESEARCH USE ONLY'));
  assert.equal(modelNames().length, 29);
});

test('baseline: las métricas publicadas se reproducen offline (replay determinista)', () => {
  const m = computeMetrics();
  const base = JSON.parse(fs.readFileSync(join(ROOT, 'baseline', 'baseline_metrics.json'), 'utf8'));
  assert.deepEqual(m.global, base.global);
  assert.equal(m.global.n, 1206);
  assert.ok(Math.abs(m.global.iol_pct - 95.439) < 0.01);
  assert.ok(Math.abs(m.global.decision_pct - 72.637) < 0.01);
});
