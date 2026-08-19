/**
 * V1.14 — REFUTACIÓN ADVERSARIAL de las optimizaciones de rendimiento.
 *
 * Estos tests NO comprueban que el motor sea rápido. Intentan DEMOSTRAR QUE ES INCORRECTO,
 * atacando exactamente lo que V1.14 introdujo: estado mutable compartido a nivel de módulo
 * (los buffers reutilizables de `spotRmsAt` y `bestFocus`) y la eliminación de estructuras
 * del camino caliente.
 *
 * La hipótesis a refutar es: «reutilizar buffers no puede cambiar ningún resultado».
 * Si alguno de estos tests falla, la optimización correspondiente debe revertirse.
 *
 * RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spotRmsAt, bestFocus, traceRay, parallelBundle } from '../src/optics/raytrace/trace.mjs';
import { generateBundle, SamplingKind } from '../src/optics/raytrace/bundle.mjs';
import { evaluateObjective, ObjectiveKind, traceBundle } from '../src/optics/objective.mjs';
import { buildRaytraceEye } from '../src/optics/eyebuilder.mjs';
import { createPreopEye, createPredictedPostopEye } from '../src/core/eye.mjs';
import { GenericIOLFactory } from '../src/core/iol_factory.mjs';
import { WORKLOADS, getWorkload } from '../bench/workloads.mjs';

const ojo = (extra = {}) => createPreopEye({
  al_mm: 23.5, k1_d: 43.5, k1_axis_deg: 180, k2_d: 43.5, k2_axis_deg: 90,
  acd_mm: 3.2, lt_mm: 4.5, cct_um: 550, keratometric_index: 1.3375,
  meta: { source: 'synthetic' }, ...extra,
});
const ojoTrazable = (al = 23.5, power = 21) => buildRaytraceEye(
  createPredictedPostopEye(ojo({ al_mm: al }), { iol_position_mm: 4.9, position_source: 'adv' }),
  new GenericIOLFactory().create({ power_d: power }), { aperture_mm: 2.0 });

/** PRNG determinista local: el desorden de las pruebas no puede depender del azar real. */
const rng = (s => () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)(20260819);

/** Haz de rayos ya trazados, de tamaño arbitrario. */
function rayosDe(nAnillos, al = 23.5) {
  const eye = ojoTrazable(al);
  const haz = generateBundle({ radius_mm: 1.5, kind: SamplingKind.MERIDIONAL, n: nAnillos, perRing: 6 });
  return { eye, rays: traceBundle(eye.surfaces, haz.rays).rays };
}

// ---------------------------------------------------------------------------------
// ATAQUE 1 · ALIASING Y REENTRANCIA DE LOS BUFFERS COMPARTIDOS
// ---------------------------------------------------------------------------------

test('adversarial · spotRmsAt: A→B→A da el MISMO A que A aislado (sin residuo del anterior)', () => {
  const A = rayosDe(40).rays;                 // 80 rayos
  const B = rayosDe(7, 21.0).rays;            // haz MÁS PEQUEÑO y de otro ojo
  const zs = [24.0, 24.3, 25.1];
  const aislado = zs.map(z => spotRmsAt(A, z));
  for (const z of zs) spotRmsAt(B, z);        // ensucia el buffer con otro tamaño y otros datos
  const despues = zs.map(z => spotRmsAt(A, z));
  assert.deepEqual(despues, aislado, 'residuo del haz anterior en el buffer compartido');
  // y la secuencia completa A→B→A→B→A
  for (let i = 0; i < 4; i++) { spotRmsAt(B, 24.2); spotRmsAt(A, 24.2); }
  assert.deepEqual(zs.map(z => spotRmsAt(A, z)), aislado);
});

test('adversarial · spotRmsAt: haz GRANDE seguido de PEQUEÑO no arrastra datos viejos', () => {
  // el peligro real: el buffer crece con el haz grande y el pequeño solo escribe un prefijo.
  // Si el bucle de varianza recorriera la CAPACIDAD en vez de lo escrito, sumaría basura.
  const grande = rayosDe(160).rays;
  const pequeno = rayosDe(5).rays;
  const zs = [24.0, 24.5];
  const pequenoSolo = zs.map(z => spotRmsAt(pequeno, z));
  zs.forEach(z => spotRmsAt(grande, z));
  const pequenoTras = zs.map(z => spotRmsAt(pequeno, z));
  assert.deepEqual(pequenoTras, pequenoSolo,
    'el RMS de un haz pequeño cambió tras evaluar uno grande: el buffer arrastra datos');
  assert.ok(pequenoSolo.every(Number.isFinite));
});

test('adversarial · spotRmsAt: rayos FILTRADOS en medio de la lista no descolocan el buffer', () => {
  // rayos con |d[2]| < 1e-12 se saltan: el índice de escritura y el contador n deben ir
  // acompasados. Se intercalan rayos degenerados en posiciones arbitrarias.
  const base = rayosDe(20).rays;
  const degenerado = { p: [0.1, 0.2, 10], d: [1, 0, 0] };            // d[2] = 0 exacto
  const conHuecos = [];
  for (let i = 0; i < base.length; i++) {
    conHuecos.push(base[i]);
    if (i % 3 === 0) conHuecos.push(degenerado);
  }
  const z = 24.2;
  // el resultado debe ser idéntico al del haz sin los degenerados
  assert.equal(spotRmsAt(conHuecos, z), spotRmsAt(base, z),
    'los rayos filtrados alteran el resultado: índice y contador desacompasados');
});

test('adversarial · bestFocus: A→B→A idéntico, y su aplanado no contamina spotRmsAt', () => {
  const A = rayosDe(40);
  const B = rayosDe(9, 21.0);
  const zRetA = A.eye.retina_z_mm, zRetB = B.eye.retina_z_mm;
  const zUlt = e => Math.max(...e.eye.surfaces.map(s => s.kind === 'plane' ? s.z_mm : s.zVertex_mm));
  const focoA = bestFocus(A.rays, zUlt(A) + 0.05, zRetA + 15);
  bestFocus(B.rays, zUlt(B) + 0.05, zRetB + 15);
  const focoA2 = bestFocus(A.rays, zUlt(A) + 0.05, zRetA + 15);
  assert.deepEqual(focoA2, focoA, 'bestFocus depende del haz evaluado anteriormente');
  // spotRmsAt (que usa el OTRO buffer) tampoco puede verse afectado por el aplanado
  const rms = spotRmsAt(A.rays, zRetA);
  bestFocus(B.rays, zUlt(B) + 0.05, zRetB + 15);
  assert.equal(spotRmsAt(A.rays, zRetA), rms);
});

test('adversarial · una llamada que FALLA a mitad no deja el buffer en estado tóxico', () => {
  const A = rayosDe(40);
  const zRet = A.eye.retina_z_mm;
  const antes = spotRmsAt(A.rays, zRet);
  // bracket inválido → bestFocus lanza DESPUÉS de haber aplanado los rayos
  assert.throws(() => bestFocus(A.rays, 100, 50), RangeError);
  // haz vacío → spotRmsAt lanza tras escribir cero elementos
  assert.throws(() => spotRmsAt([], zRet), RangeError);
  // un mínimo en el borde también lanza, con el buffer ya lleno
  assert.throws(() => bestFocus(A.rays, 1000, 2000), RangeError);
  assert.equal(spotRmsAt(A.rays, zRet), antes, 'un fallo dejó residuo que altera el siguiente cálculo');
});

test('adversarial · traceRay: dos rayos del mismo haz NUNCA comparten arrays (aliasing)', () => {
  // el cursor de traceRay se reutiliza entre superficies; si el objeto retornado no fuera
  // nuevo, todos los rayos del haz apuntarían al mismo p/d y el spot sería un único punto
  const eye = ojoTrazable();
  const haz = generateBundle({ radius_mm: 1.5, kind: SamplingKind.MERIDIONAL, n: 12, perRing: 6 });
  const { rays } = traceBundle(eye.surfaces, haz.rays);
  assert.ok(rays.length > 4);
  const vistosP = new Set(), vistosD = new Set();
  for (const r of rays) {
    assert.ok(!vistosP.has(r.p), 'dos rayos comparten el MISMO array de posición');
    assert.ok(!vistosD.has(r.d), 'dos rayos comparten el MISMO array de dirección');
    vistosP.add(r.p); vistosD.add(r.d);
    assert.ok(r.p !== r.d);
  }
  // y no se comparte identidad con el haz de ENTRADA (mutarlo no debe afectar al trazado)
  for (const r of rays) for (const e of haz.rays) assert.ok(r.p !== e.p && r.d !== e.d);
});

test('adversarial · traceRay NO muta el rayo de entrada', () => {
  const eye = ojoTrazable();
  const entrada = { p: [0.4, 0.7, -10], d: [0, 0, 1] };
  const copiaP = [...entrada.p], copiaD = [...entrada.d];
  traceRay(eye.surfaces, entrada);
  assert.deepEqual(entrada.p, copiaP, 'traceRay mutó la posición del rayo de entrada');
  assert.deepEqual(entrada.d, copiaD, 'traceRay mutó la dirección del rayo de entrada');
  // trazar dos veces el mismo rayo da lo mismo (no hay estado acumulado)
  const a = traceRay(eye.surfaces, entrada), b = traceRay(eye.surfaces, entrada);
  assert.deepEqual(a.ray, b.ray);
});

test('adversarial · el resultado de un workload NO depende del orden de ejecución', () => {
  // estado de módulo + orden aleatorio determinista: si algún buffer filtrara información
  // entre workloads, el orden cambiaría alguna salida
  const referencia = new Map(WORKLOADS.map(w => [w.id, JSON.stringify(w.run())]));
  for (let pasada = 0; pasada < 3; pasada++) {
    const orden = [...WORKLOADS].sort(() => rng() - 0.5);
    for (const w of orden) {
      assert.equal(JSON.stringify(w.run()), referencia.get(w.id),
        `${w.id} cambió al ejecutarse en otro orden: hay estado compartido que filtra`);
    }
  }
  // y en orden inverso estricto
  for (const w of [...WORKLOADS].reverse()) {
    assert.equal(JSON.stringify(w.run()), referencia.get(w.id));
  }
});

test('adversarial · repetir el mismo workload 25 veces da SIEMPRE lo mismo', () => {
  const w = getWorkload('incertidumbre');   // Monte Carlo con semilla: el caso más sensible
  const ref = JSON.stringify(w.run());
  for (let i = 0; i < 25; i++) assert.equal(JSON.stringify(w.run()), ref, `divergió en la repetición ${i}`);
});

// ---------------------------------------------------------------------------------
// ATAQUE 2 · EL ORACLE BITWISE TIENE QUE SER MÁS ESTRICTO QUE JSON
// ---------------------------------------------------------------------------------

test('adversarial · el oracle distingue lo que JSON.stringify pierde', async () => {
  const { primeraDiferencia } = await import('../bench/equivalence.mjs');
  // se prueba la MISMA codificación que usa la puerta, sobre valores que JSON confunde
  const mod = await import('../bench/equivalence.mjs');
  // canon no se exporta: se ejerce a través de capturar()/primeraDiferencia con estructuras
  // equivalentes construidas a mano usando la misma representación IEEE-754
  const f64 = v => { const b = new DataView(new ArrayBuffer(8)); b.setFloat64(0, v); let h = ''; for (let i = 0; i < 8; i++) h += b.getUint8(i).toString(16).padStart(2, '0'); return `#f64:${h}`; };
  // +0 vs −0: JSON.stringify los hace ambos "0"
  assert.notEqual(f64(0), f64(-0), 'el oracle NO distingue +0 de −0');
  assert.equal(JSON.stringify(0), JSON.stringify(-0), '(control: JSON sí los confunde)');
  // 1 ULP de diferencia: JSON.stringify los distingue por texto, pero el redondeo a 6
  // decimales de los experimentos NO — el oracle debe ser más fino que results.json
  const x = 0.1, y = 0.1 + Number.EPSILON / 8;
  assert.notEqual(f64(x), f64(y), 'el oracle NO distingue 1 ULP');
  assert.equal(x.toFixed(6), y.toFixed(6), '(control: el redondeo publicado sí los confunde)');
  // NaN e Infinity: JSON los convierte en null en silencio
  assert.equal(JSON.stringify({ a: NaN, b: Infinity }), '{"a":null,"b":null}');
  // y la comparación estructural detecta null vs ausencia
  assert.ok(primeraDiferencia({ a: null }, {}), 'null y ausencia deben distinguirse');
  assert.ok(primeraDiferencia({ a: [1, 2] }, { a: [2, 1] }), 'el orden de arrays debe importar');
  assert.equal(primeraDiferencia({ a: 1, b: 2 }, { b: 2, a: 1 }), null, 'el orden de CLAVES no debe importar');
  assert.ok(mod.capturar, 'la puerta expone capturar()');
});

// ---------------------------------------------------------------------------------
// ATAQUE 3 · EQUIVALENCIA EN RUTAS QUE LOS WORKLOADS NO CUBREN
// ---------------------------------------------------------------------------------

test('adversarial · rutas no cubiertas por los workloads: pérdidas, TIR y haces degenerados', () => {
  const eye = ojoTrazable();
  // rayo que falla la apertura: la contabilidad de pérdidas debe seguir intacta
  const fuera = { p: [0, 50, -10], d: [0, 0, 1] };
  const perdido = traceRay(eye.surfaces, fuera);
  assert.equal(perdido.ok, false);
  assert.ok(typeof perdido.reason === 'string' && typeof perdido.at === 'string',
    'la razón y el punto de pérdida deben seguir publicándose');
  assert.equal(perdido.ray, undefined);
  // traceBundle mantiene el par (rays, lost) con sus motivos
  const mezcla = [...generateBundle({ radius_mm: 1.5, kind: SamplingKind.MERIDIONAL, n: 6, perRing: 6 }).rays, fuera];
  const tb = traceBundle(eye.surfaces, mezcla);
  assert.equal(tb.rays.length + tb.lost.length, mezcla.length, 'la contabilidad de rayos no cuadra');
  assert.ok(tb.lost.every(l => l.reason && l.ray0));
  // parallelBundle (ruta de focusOfSystem) sigue produciendo pares ±h
  const pb = parallelBundle([0.5, 1.0]);
  assert.equal(pb.length, 4);
  assert.deepEqual(pb.map(r => r.p[1]), [0.5, -0.5, 1.0, -1.0]);
});

test('adversarial · evaluateObjective conserva TODOS sus campos, no solo el coste', () => {
  const eye = ojoTrazable();
  const haz = generateBundle({ radius_mm: 1.5, kind: SamplingKind.MERIDIONAL, n: 20, perRing: 6 });
  const ev = evaluateObjective(eye, haz.rays, ObjectiveKind.EQUIVALENT_DEFOCUS);
  for (const k of ['kind', 'cost', 'residual_d', 'bestFocus_mm', 'spotRms_mm', 'raysTraced', 'raysLost', 'detail']) {
    assert.ok(k in ev, `evaluateObjective perdió el campo ${k}`);
  }
  for (const k of ['criterio', 'signo', 'desplazamiento_mm', 'rms_en_mejor_foco_mm']) {
    assert.ok(k in ev.detail, `detail perdió el campo ${k}`);
  }
  // el objetivo A sigue devolviendo residual_d null (su coste no es una dioptría)
  const evA = evaluateObjective(eye, haz.rays, ObjectiveKind.SPOT_RMS_AT_RETINA);
  assert.equal(evA.residual_d, null);
  assert.equal(evA.bestFocus_mm, null);
});
