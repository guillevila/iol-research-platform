/**
 * compare.mjs — comparación A/B DISCIPLINADA de rendimiento (V1.14).
 *
 * EL PROBLEMA QUE RESUELVE. Medir los workloads seguidos en un mismo proceso da cifras que
 * no se sostienen: en esta máquina, tres lanzamientos del MISMO código dieron medianas que
 * variaban hasta el 130 % en los workloads pequeños (contaminación de JIT entre workloads,
 * orden de ejecución y ruido del sistema). Publicar «x2.4 más rápido» desde una de esas
 * corridas sería inventarse el resultado.
 *
 * CÓMO MIDE:
 *  1. UN PROCESO POR WORKLOAD (`--only`), así ningún workload calienta ni ensucia a otro;
 *  2. varios LANZAMIENTOS por workload; el estadístico publicado es la MEDIANA DE LAS
 *     MEDIANAS por lanzamiento, y se publica también el mínimo (robusto al ruido aditivo)
 *     y la dispersión entre lanzamientos;
 *  3. SUELO DE MEDICIÓN declarado: si la dispersión entre lanzamientos idénticos supera el
 *     umbral, el workload se marca `RUIDO` y su tiempo NO se usa para afirmar speedup —
 *     para esos casos la evidencia es el TRABAJO DETERMINISTA, que no depende de la máquina.
 *
 * Uso:
 *   node bench/compare.mjs --out <fichero.json> [--reps 15] [--launches 3]
 *   node bench/compare.mjs --diff <antes.json> <despues.json>
 *
 * RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING.
 */
import fs from 'node:fs';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { WORKLOAD_IDS } from './workloads.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] ? args[i + 1] : d; };

/** Por encima de esta dispersión entre lanzamientos idénticos, el tiempo no es evidencia. */
export const UMBRAL_RUIDO = 0.25;

const mediana = a => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

function medir({ reps, launches }) {
  const salida = { entorno: { node: process.version, plataforma: `${os.platform()} ${os.release()}`, cpu: os.cpus()[0]?.model ?? '?', nucleos: os.cpus().length }, reps, launches, workloads: {} };
  for (const id of WORKLOAD_IDS) {
    const medianas = [], minimos = [];
    let trabajo = null, params = null;
    for (let l = 0; l < launches; l++) {
      const out = execFileSync(process.execPath,
        [join(AQUI, 'run_bench.mjs'), '--only', id, '--reps', String(reps), '--warmup', '8', '--json', '-'],
        { cwd: join(AQUI, '..'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      const m = out.match(/^([a-z_]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/m);
      if (!m) throw new Error(`no se pudo leer la salida de ${id}:\n${out}`);
      medianas.push(Number(m[2])); minimos.push(Number(m[3]));
      const tm = out.match(/^([a-z_]+)\s+[\d.]+\s+[\d.]+\s+[\d.]+\s+[\d.]+\s+(.+)$/m);
      if (tm) trabajo = tm[2].trim();
    }
    const disp = (Math.max(...medianas) - Math.min(...medianas)) / Math.min(...medianas);
    salida.workloads[id] = {
      ms_mediana_de_medianas: mediana(medianas), ms_min_global: Math.min(...minimos),
      medianas_por_lanzamiento: medianas, dispersion_entre_lanzamientos: disp,
      fiable: disp <= UMBRAL_RUIDO, trabajo_dominante: trabajo, parametros: params,
    };
    console.log(`${id.padEnd(15)} mediana ${mediana(medianas).toFixed(2).padStart(7)} ms · min `
      + `${Math.min(...minimos).toFixed(2).padStart(7)} ms · dispersión ${(100 * disp).toFixed(0).padStart(3)} %`
      + (disp <= UMBRAL_RUIDO ? '' : '  ← RUIDO: el tiempo no es evidencia aquí'));
  }
  return salida;
}

function diff(antesF, despuesF) {
  const a = JSON.parse(fs.readFileSync(antesF, 'utf8'));
  const b = JSON.parse(fs.readFileSync(despuesF, 'utf8'));
  console.log('workload         antes(ms)  después(ms)  speedup   antes.min  después.min  disp.a  disp.d  evidencia');
  console.log('─'.repeat(108));
  let sa = 0, sb = 0, saF = 0, sbF = 0;
  for (const id of Object.keys(a.workloads)) {
    const x = a.workloads[id], y = b.workloads[id];
    if (!y) continue;
    const sp = x.ms_mediana_de_medianas / y.ms_mediana_de_medianas;
    const fiable = x.fiable && y.fiable;
    sa += x.ms_mediana_de_medianas; sb += y.ms_mediana_de_medianas;
    if (fiable) { saF += x.ms_mediana_de_medianas; sbF += y.ms_mediana_de_medianas; }
    console.log(`${id.padEnd(15)} ${x.ms_mediana_de_medianas.toFixed(2).padStart(9)} ${y.ms_mediana_de_medianas.toFixed(2).padStart(12)} `
      + `${('x' + sp.toFixed(2)).padStart(8)} ${x.ms_min_global.toFixed(2).padStart(11)} ${y.ms_min_global.toFixed(2).padStart(12)} `
      + `${(100 * x.dispersion_entre_lanzamientos).toFixed(0).padStart(5)}% ${(100 * y.dispersion_entre_lanzamientos).toFixed(0).padStart(6)}%  `
      + (fiable ? 'tiempo' : 'SOLO TRABAJO (tiempo bajo el suelo de medición)'));
  }
  console.log('─'.repeat(108));
  console.log(`suma total          ${sa.toFixed(2).padStart(9)} ${sb.toFixed(2).padStart(12)} ${('x' + (sa / sb).toFixed(2)).padStart(8)}`);
  console.log(`suma solo fiables   ${saF.toFixed(2).padStart(9)} ${sbF.toFixed(2).padStart(12)} ${('x' + (saF / sbF).toFixed(2)).padStart(8)}   ← el speedup DEFENDIBLE`);
}

if (args[0] === '--diff') {
  if (!args[1] || !args[2]) throw new TypeError('--diff <antes.json> <despues.json>');
  diff(args[1], args[2]);
} else {
  const out = opt('out', null);
  const r = medir({ reps: Number(opt('reps', '15')), launches: Number(opt('launches', '3')) });
  if (out) { fs.writeFileSync(out, JSON.stringify(r, null, 1) + '\n'); console.log(`\ninforme en ${out}`); }
}
