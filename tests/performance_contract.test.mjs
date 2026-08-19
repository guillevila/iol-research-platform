/**
 * V1.14 — CONTRATO DE RENDIMIENTO del motor.
 *
 * POR QUÉ ESTE CONTRATO NO MIDE MILISEGUNDOS. El plan pedía «presupuesto de tiempo declarado
 * por experimento». Un umbral absoluto en milisegundos sobre un runner de CI compartido es
 * una prueba frágil: falla por vecinos ruidosos, no por regresiones. Medí la variabilidad
 * antes de decidir — tres lanzamientos del MISMO código dieron medianas con hasta 130 % de
 * dispersión en los workloads pequeños. Un test así no protegería nada y erosionaría la
 * confianza en la suite.
 *
 * LA ALTERNATIVA, en tres niveles con estatus explícito:
 *
 *   HARD  · INVARIANTES DE TRABAJO DETERMINISTA (este fichero). El número de rayos trazados,
 *           de intersecciones, de búsquedas de foco, de geometrías de LIO y de haces que hace
 *           cada workload es una propiedad EXACTA y reproducible en cualquier máquina. Si
 *           alguien añade trabajo redundante o cambia un parámetro científico, estos números
 *           cambian y el test falla con la cifra concreta. Es el contrato que de verdad
 *           protege, y es lo que la CI vigila.
 *
 *   HARD  · EQUIVALENCIA NUMÉRICA (bench/equivalence.mjs contra bench/baseline_v114.json,
 *           verificado también aquí). Ninguna optimización puede cambiar un bit de la salida
 *           científica.
 *
 *   SOFT  · PRESUPUESTO RELATIVO CALIBRADO (abajo). En lugar de milisegundos absolutos, se
 *           mide un bucle de calibración en el MISMO proceso y se expresa el coste del
 *           workload como un múltiplo de esa calibración. El cociente absorbe la mayor parte
 *           de la diferencia de velocidad entre máquinas. Se declara con cotas GENEROSAS y su
 *           incumplimiento es informativo: avisa por consola y no rompe la suite, porque una
 *           medición temporal en CI no merece bloquear un merge.
 *
 *   CARACTERIZACIÓN · los tiempos de pared viven en bench/ (run_bench.mjs, compare.mjs) y NO
 *           en experiments/, para no hacer irreproducible ningún results.json.
 *
 * RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WORKLOADS, getWorkload } from '../bench/workloads.mjs';
import { capturar, primeraDiferencia } from '../bench/equivalence.mjs';
import { measureWork, snapshot, startCounting, stopCounting, WorkUnit } from '../src/perf/counters.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * TRABAJO DETERMINISTA ESPERADO por workload (contrato HARD).
 *
 * Estas cifras se MIDIERON, no se eligieron. Cambiar cualquiera exige explicar por qué el
 * motor hace ahora más o menos trabajo — y si la causa es haber tocado un parámetro
 * científico (n_anillos, catálogo, n de extracciones, tolerancia), entonces no era una
 * optimización: era otro experimento.
 */
const TRABAJO_ESPERADO = {
  fija: { rayos_trazados: 80, intersecciones: 240, best_focus: 1, spot_rms: 40, evaluaciones_objetivo: 1, geometrias_lio: 1, ojos_trazables: 1, haces_generados: 1 },
  continua: { rayos_trazados: 2240, intersecciones: 6720, best_focus: 28, spot_rms: 1120, evaluaciones_objetivo: 28, geometrias_lio: 28, ojos_trazables: 28, haces_generados: 1 },
  catalogo: { rayos_trazados: 5520, intersecciones: 16560, best_focus: 69, spot_rms: 2760, evaluaciones_objetivo: 69, geometrias_lio: 69, ojos_trazables: 69, haces_generados: 1 },
  conica: { rayos_trazados: 80, intersecciones: 320, best_focus: 1, spot_rms: 40, evaluaciones_objetivo: 1, geometrias_lio: 1, ojos_trazables: 1, haces_generados: 1 },
  pose: { rayos_trazados: 48, intersecciones: 240, best_focus: 1, spot_rms: 40, evaluaciones_objetivo: 1, geometrias_lio: 1, ojos_trazables: 1, haces_generados: 1 },
  torico: { rayos_trazados: 48, intersecciones: 144, geometrias_lio: 1, ojos_trazables: 1, haces_generados: 1 },
  barrido: { rayos_trazados: 14400, intersecciones: 43200, best_focus: 180, spot_rms: 7290, evaluaciones_objetivo: 180, geometrias_lio: 846, ojos_trazables: 180, ojos_paraxiales: 18, haces_generados: 6 },
  incertidumbre: { rayos_trazados: 3936, intersecciones: 11808, best_focus: 164, spot_rms: 6561, evaluaciones_objetivo: 164, geometrias_lio: 1, ojos_trazables: 164, haces_generados: 164 },
  eleccion: { rayos_trazados: 14304, intersecciones: 42912, best_focus: 596, spot_rms: 23976, evaluaciones_objetivo: 596, geometrias_lio: 62, ojos_trazables: 596, haces_generados: 7 },
  pipeline_eq: { rayos_trazados: 6960, intersecciones: 20880, best_focus: 87, spot_rms: 3509, evaluaciones_objetivo: 87, geometrias_lio: 87, ojos_trazables: 87, haces_generados: 3 },
};

test('rendimiento · HARD: el trabajo determinista de cada workload es EXACTAMENTE el declarado', () => {
  for (const w of WORKLOADS) {
    const esperado = TRABAJO_ESPERADO[w.id];
    assert.ok(esperado, `workload ${w.id} sin contrato de trabajo declarado: añádelo`);
    const { trabajo } = measureWork(() => w.run());
    assert.deepEqual(trabajo, Object.fromEntries(Object.keys(esperado).sort().map(k => [k, esperado[k]])),
      `${w.id}: el trabajo computacional cambió.\n  esperado: ${JSON.stringify(esperado)}\n  medido:   ${JSON.stringify(trabajo)}\n`
      + '  Si el cambio viene de un PARÁMETRO CIENTÍFICO (n_anillos, catálogo, n, tolerancia), '
      + 'no es una optimización: es otro experimento. Si viene de eliminar trabajo redundante, '
      + 'actualiza esta tabla en el mismo commit y explica qué trabajo desapareció.');
  }
});

test('rendimiento · HARD: la salida científica es IDÉNTICA bit a bit al baseline de V1.14', () => {
  const ref = JSON.parse(fs.readFileSync(path.join(ROOT, 'bench', 'baseline_v114.json'), 'utf8'));
  const ahora = capturar();
  for (const id of Object.keys(ref.workloads)) {
    const d = primeraDiferencia(ref.workloads[id].salida_cientifica, ahora.workloads[id]?.salida_cientifica);
    assert.equal(d, null, `${id}: la salida científica cambió en ${d?.ruta}: `
      + `${JSON.stringify(d?.antes)} → ${JSON.stringify(d?.despues)}. `
      + 'Una optimización que cambia un resultado no es una optimización: es un cambio de modelo.');
    // los parámetros científicos tampoco: reducirlos daría velocidad cambiando la pregunta
    const dp = primeraDiferencia(ref.workloads[id].parametros_cientificos, ahora.workloads[id]?.parametros_cientificos);
    assert.equal(dp, null, `${id}: PARÁMETRO CIENTÍFICO cambiado en ${dp?.ruta}: `
      + `${JSON.stringify(dp?.antes)} → ${JSON.stringify(dp?.despues)}`);
  }
});

test('rendimiento · los contadores no pueden alterar ningún resultado (encendidos vs apagados)', () => {
  // si los contadores influyeran en la física, todo el andamiaje de V1.14 sería inválido
  const w = getWorkload('fija');
  const apagado = w.run();
  startCounting();
  const encendido = w.run();
  const conUnaPasada = snapshot();
  stopCounting();
  const despues = w.run();
  // la salida física es la misma con contabilidad encendida, apagada y después de apagarla
  assert.deepEqual(encendido, apagado);
  assert.deepEqual(despues, apagado);
  // y con la contabilidad APAGADA no se acumula más trabajo: la instantánea no crece
  assert.deepEqual(snapshot(), conUnaPasada,
    'con los contadores apagados, ejecutar el workload no debe sumar trabajo');
  // startCounting pone a cero: dos pasadas contadas no arrastran las anteriores
  startCounting();
  w.run();
  stopCounting();
  assert.deepEqual(snapshot(), conUnaPasada, 'startCounting debe reiniciar la cuenta');
});

test('rendimiento · SOFT: presupuesto RELATIVO calibrado (informativo, no bloquea)', () => {
  // Calibración: un bucle aritmético del mismo orden en el MISMO proceso. Expresar el coste
  // del workload como múltiplo de esta referencia absorbe buena parte de la diferencia de
  // velocidad entre máquinas — mucho mejor que un umbral en milisegundos absolutos.
  const calibrar = () => {
    const t0 = process.hrtime.bigint();
    let s = 0;
    for (let i = 1; i <= 3e6; i++) s += Math.sqrt(i) / i;
    const dt = Number(process.hrtime.bigint() - t0) / 1e6;
    return { dt, s };
  };
  calibrar();                                  // warmup de la calibración
  const cal = Math.min(calibrar().dt, calibrar().dt);
  /** Cotas GENEROSAS (≈3× el valor observado en la máquina de desarrollo). */
  const PRESUPUESTO_RELATIVO = { barrido: 3.0, eleccion: 3.0, pipeline_eq: 1.5, incertidumbre: 1.5, catalogo: 1.5 };
  const excedidos = [];
  for (const [id, cota] of Object.entries(PRESUPUESTO_RELATIVO)) {
    const w = getWorkload(id);
    for (let i = 0; i < 5; i++) w.run();       // warmup
    const muestras = [];
    for (let i = 0; i < 7; i++) {
      const t0 = process.hrtime.bigint();
      w.run();
      muestras.push(Number(process.hrtime.bigint() - t0) / 1e6);
    }
    const ratio = Math.min(...muestras) / cal;
    if (ratio > cota) excedidos.push(`${id}: ${ratio.toFixed(2)} × calibración (cota SOFT ${cota})`);
  }
  if (excedidos.length) {
    console.error('⚠ presupuesto relativo SOFT excedido (aviso, NO fallo):\n  ' + excedidos.join('\n  ')
      + '\n  Si es sistemático y reproducible en bench/compare.mjs, hay una regresión de '
      + 'rendimiento que investigar; si es esporádico, es ruido del runner.');
  }
  // el test NO falla por tiempo: solo comprueba que la instrumentación de presupuesto funciona
  assert.ok(cal > 0, 'la calibración debe medir un tiempo positivo');
  assert.ok(Object.keys(PRESUPUESTO_RELATIVO).every(id => TRABAJO_ESPERADO[id]),
    'todo workload con presupuesto SOFT debe tener también contrato HARD de trabajo');
});

test('rendimiento · el vocabulario de unidades de trabajo está completo y sin duplicados', () => {
  const usadas = new Set(Object.values(TRABAJO_ESPERADO).flatMap(Object.keys));
  const declaradas = new Set(Object.values(WorkUnit));
  for (const u of usadas) assert.ok(declaradas.has(u), `unidad de trabajo no declarada en WorkUnit: ${u}`);
  assert.equal(new Set(Object.values(WorkUnit)).size, Object.values(WorkUnit).length, 'unidades duplicadas');
});
