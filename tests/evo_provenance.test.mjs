/**
 * Tests de procedencia del corpus EVO (V0.5 / P0.4) — hallazgo H5 de la auditoría.
 *
 * La auditoría encontró tres cifras distintas circulando (8.311 / 8.318 / 8.319) sin que
 * nadie dijera qué contaba cada una. `docs/scientific/EVO_QUERY_PROVENANCE.md` las
 * reconcilia; estos tests impiden que la documentación y los ficheros vuelvan a divergir.
 *
 * Si un test de aquí falla, NO se ajusta el número esperado: se investiga qué cambió en el
 * corpus y se actualiza el documento con la explicación.
 *
 * RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = p => JSON.parse(fs.readFileSync(join(ROOT, p), 'utf8'));

const V1 = load('legacy/evo_replica/cache/cache.json');
const V2 = load('legacy/evo_replica/cache/cache2.json');
const DOC = fs.readFileSync(join(ROOT, 'docs/scientific/EVO_QUERY_PROVENANCE.md'), 'utf8');

/** Cifras publicadas. Cambiarlas exige explicar el cambio en el documento. */
const DECLARADO = {
  v1_entradas: 1572,
  v2_unicas: 8319,
  v2_ok: 8318,
  v2_rechazadas: 1,
  instantanea_dashboard: 8311,
  ojos_distintos: 2416,
  consultas_con_sia: 718,
};

test('procedencia: los recuentos de los ficheros son los publicados', () => {
  assert.equal(Object.keys(V1).length, DECLARADO.v1_entradas);
  assert.equal(Object.keys(V2).length, DECLARADO.v2_unicas);
  const ok = Object.values(V2).filter(v => v.ok === true).length;
  const ko = Object.values(V2).filter(v => v.ok !== true).length;
  assert.equal(ok, DECLARADO.v2_ok);
  assert.equal(ko, DECLARADO.v2_rechazadas);
  assert.equal(ok + ko, DECLARADO.v2_unicas, '8318 + 1 = 8319 debe cuadrar');
});

test('procedencia: cache.json es subconjunto ESTRICTO y byte-idéntico de cache2.json', () => {
  const claves2 = new Set(Object.keys(V2));
  const ausentes = Object.keys(V1).filter(k => !claves2.has(k));
  assert.deepEqual(ausentes, [], 'v1 debe estar íntegramente contenido en v2');
  let divergentes = 0;
  for (const k of Object.keys(V1)) {
    if (JSON.stringify(V1[k]) !== JSON.stringify(V2[k])) divergentes++;
  }
  assert.equal(divergentes, 0,
    'dos campañas separadas devolvieron lo mismo: es la evidencia de estabilidad del benchmark');
});

test('procedencia: la única consulta no-ok es un rechazo de DOMINIO del servidor', () => {
  const rechazadas = Object.entries(V2).filter(([, v]) => v.ok !== true);
  assert.equal(rechazadas.length, 1);
  const [clave, valor] = rechazadas[0];
  const q = JSON.parse(clave);
  // el motivo es el rango de refracción diana de EVO, no un fallo de red ni del harness
  assert.match(valor.errs.join(' '), /Range -5 to 5 D/);
  assert.equal(parseFloat(q.txtRefraction), -6);
  assert.ok(!('timeout' in valor) && !('httpStatus' in valor),
    'un rechazo de dominio no debe confundirse con un fallo de transporte');
});

test('procedencia: la instantánea del dashboard (8311) + 8 posteriores = 8319', () => {
  const total = Object.keys(V2).length;
  const dash = load('legacy/evo_replica/data/dashboard-data.json');
  assert.equal(dash.totalQueries, DECLARADO.instantanea_dashboard);
  assert.equal(total - dash.totalQueries, 8);
  // las 8 posteriores son DOS ojos x CUATRO configuraciones de lente, no sondas sueltas
  const ultimas = Object.keys(V2).slice(-8).map(k => JSON.parse(k));
  const ojos = new Set(ultimas.map(q => `${q.txtAL}|${q.txtK1}|${q.txtK2}|${q.txtACD}`));
  assert.equal(ojos.size, 2, `se esperaban 2 ojos, hay ${ojos.size}`);
  for (const ojo of ojos) {
    assert.equal(ultimas.filter(q => `${q.txtAL}|${q.txtK1}|${q.txtK2}|${q.txtACD}` === ojo).length, 4);
  }
});

test('procedencia: el corpus completo comparte la configuración declarada', () => {
  const qs = Object.keys(V2).map(k => JSON.parse(k));
  // el corpus NO dice nada sobre Argos ni sobre ojos post-refractivos
  assert.ok(qs.every(q => q.DropDownListPK === 'IOLMaster 700'), 'un solo biómetro');
  assert.ok(qs.every(q => q.DropDownArgos === '0'), 'sin Argos: el corpus no lo cubre');
  assert.ok(qs.every(q => q.DropDownLASIK === '0'), 'sin post-refractiva: el corpus no lo cubre');
  assert.equal(qs.filter(q => q.TxtSIA && q.TxtSIA !== '0').length, DECLARADO.consultas_con_sia);
  const ojos = new Set(qs.map(q => [q.txtAL, q.txtK1, q.txtK2, q.txtACD, q.txtLT, q.txtCCT].join('|')));
  assert.equal(ojos.size, DECLARADO.ojos_distintos);
});

test('procedencia: los rangos muestreados no exceden lo declarado (prohibido extrapolar)', () => {
  const qs = Object.keys(V2).map(k => JSON.parse(k));
  const rango = campo => {
    const a = qs.map(q => parseFloat(q[campo])).filter(Number.isFinite);
    return [Math.min(...a), Math.max(...a)];
  };
  assert.deepEqual(rango('txtAL'), [19, 32]);
  assert.deepEqual(rango('txtK1'), [34, 50]);
  assert.deepEqual(rango('txtK2'), [34, 52.5]);
  assert.deepEqual(rango('txtACD'), [2.4, 4.4]);
  assert.deepEqual(rango('txtAConstant'), [110.3, 125]);
  assert.deepEqual(rango('txtRefraction'), [-6, 4]);
});

test('procedencia: el documento publica las mismas cifras que los ficheros', () => {
  // el documento es la interfaz humana del corpus: si miente, el test falla
  for (const n of ['8.319', '8.318', '8.311', '1.572', '2.416']) {
    assert.ok(DOC.includes(n), `EVO_QUERY_PROVENANCE.md debe declarar ${n}`);
  }
  assert.match(DOC, /Range -5 to 5 D/);
  assert.match(DOC, /RESEARCH USE ONLY/);
  // y debe recordar la restricción que hace legítimo tener este corpus
  assert.match(DOC, /calibrar cualquier parámetro del motor físico nuevo/);
  assert.match(DOC, /divergencia\*\*, nunca \*error\*/);
});
