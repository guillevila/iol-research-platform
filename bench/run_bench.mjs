/**
 * run_bench.mjs — medición de TIEMPO de los workloads de V1 (V1.14).
 *
 * POR QUÉ NO VIVE EN experiments/. Los `experiments/` de este proyecto son artefactos
 * CIENTÍFICOS deterministas: `scripts/check_experiments.mjs` exige que su results.json se
 * reproduzca número a número en cada push. Un tiempo de pared no puede cumplir eso — depende
 * de la máquina, del runner y del JIT — y meterlo ahí haría imposible la reproducción exacta
 * de un results.json. Los timings viven aquí y NO fingen ser ciencia determinista.
 *
 * DISCIPLINA DE MEDICIÓN (contra el benchmark engañoso):
 *  - WARMUP idéntico para todos los workloads antes de medir (V8 necesita ver el código
 *    caliente; medir la primera pasada mide al compilador, no al motor);
 *  - N RÉPLICAS con mediana y dispersión (min/max/IQR): una sola ejecución no es un dato;
 *  - el MISMO workload y los MISMOS parámetros en baseline y final (vienen del mismo módulo
 *    compartido con la puerta de equivalencia: no se puede medir uno y verificar otro);
 *  - los contadores de trabajo están APAGADOS durante la medición de tiempo;
 *  - se publica el coste de INICIALIZACIÓN (import del árbol de módulos) aparte;
 *  - se publica trabajo determinista en una pasada separada, para poder atribuir un cambio
 *    de tiempo a un cambio de trabajo (o descartar que lo haya).
 *
 * Uso:
 *   node bench/run_bench.mjs                    todos los workloads, 7 réplicas
 *   node bench/run_bench.mjs --reps 15          más réplicas
 *   node bench/run_bench.mjs --only fija,pose   subconjunto
 *   node bench/run_bench.mjs --json <fichero>   además escribe el informe crudo
 *
 * RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING.
 */
import fs from 'node:fs';
import os from 'node:os';
import { WORKLOADS } from './workloads.mjs';
import { measureWork } from '../src/perf/counters.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const REPS = Number(opt('reps', '7'));
const SOLO = opt('only', null)?.split(',').map(s => s.trim());
const JSON_OUT = opt('json', null);
const WARMUP = Number(opt('warmup', '3'));

const elegidos = SOLO ? WORKLOADS.filter(w => SOLO.includes(w.id)) : WORKLOADS;
if (!elegidos.length) throw new RangeError(`ningún workload coincide con --only ${SOLO}`);

const mediana = a => {
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const cuartil = (a, q) => {
  const s = [...a].sort((x, y) => x - y);
  const i = Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))));
  return s[i];
};

const entorno = {
  node: process.version,
  plataforma: `${os.platform()} ${os.release()}`,
  cpu: os.cpus()[0]?.model ?? 'desconocida',
  nucleos: os.cpus().length,
  memoria_gb: +(os.totalmem() / 2 ** 30).toFixed(1),
  nota: 'el TIEMPO depende de esta máquina; el TRABAJO DETERMINISTA no. Compara tiempos '
    + 'solo entre corridas del mismo entorno; compara trabajo entre cualquier par.',
};

const informe = { entorno, reps: REPS, warmup: WARMUP, workloads: [] };
console.log(`entorno: node ${entorno.node} · ${entorno.plataforma} · ${entorno.cpu} (${entorno.nucleos} núcleos)`);
console.log(`réplicas: ${REPS} (warmup ${WARMUP}) · contadores APAGADOS durante la medición\n`);
console.log('workload         mediana    min    max     IQR   trabajo dominante');
console.log('─'.repeat(96));

for (const w of elegidos) {
  // WARMUP: mismo número de pasadas para todos, resultados descartados
  for (let i = 0; i < WARMUP; i++) w.run();
  const muestras = [];
  for (let i = 0; i < REPS; i++) {
    const t0 = process.hrtime.bigint();
    w.run();
    muestras.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  // pasada SEPARADA para el trabajo determinista: no contamina la medición de tiempo
  const { trabajo } = measureWork(() => w.run());
  const med = mediana(muestras);
  const iqr = cuartil(muestras, 0.75) - cuartil(muestras, 0.25);
  const dominante = Object.entries(trabajo).sort((a, b) => b[1] - a[1]).slice(0, 2)
    .map(([k, v]) => `${k}=${v}`).join(' ');
  informe.workloads.push({
    id: w.id, descripcion: w.descripcion, parametros_cientificos: w.parametros,
    ms_mediana: med, ms_min: Math.min(...muestras), ms_max: Math.max(...muestras),
    ms_iqr: iqr, muestras_ms: muestras, trabajo_determinista: trabajo,
  });
  console.log(`${w.id.padEnd(15)} ${med.toFixed(1).padStart(8)} ${Math.min(...muestras).toFixed(1).padStart(6)} `
    + `${Math.max(...muestras).toFixed(1).padStart(6)} ${iqr.toFixed(1).padStart(7)}   ${dominante}`);
}

const total = informe.workloads.reduce((a, w) => a + w.ms_mediana, 0);
console.log('─'.repeat(96));
console.log(`suma de medianas: ${total.toFixed(1)} ms`);
if (JSON_OUT && JSON_OUT !== "-") {
  fs.writeFileSync(JSON_OUT, JSON.stringify(informe, null, 1) + '\n');
  console.log(`informe crudo en ${JSON_OUT}`);
}
