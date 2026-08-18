/**
 * check_experiments.mjs — verifica que los experimentos publicados siguen reproduciéndose.
 *
 * MOTIVO: un experimento con semilla y commit registrados no vale nada si nadie comprueba
 * que sigue dando lo mismo. Este script re-ejecuta los experimentos DETERMINISTAS y compara
 * su salida con el `results.json` publicado, ignorando los campos que cambian por
 * construcción (`timestamp`, `commit`).
 *
 * Si algo diverge, NO se regenera el fichero: se falla, y el cambio debe explicarse. Un
 * resultado publicado que cambia en silencio es un resultado que nunca fue reproducible.
 *
 * Uso:  node scripts/check_experiments.mjs [--verbose]
 * Salida: código 0 si todo reproduce; 1 y el detalle de la divergencia si no.
 *
 * RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERBOSE = process.argv.includes('--verbose');

/**
 * Solo experimentos deterministas y de coste acotado. exp002/exp005 consultan el
 * benchmark congelado (caché completa, pero decenas de segundos) y exp004 es un
 * Monte Carlo largo: se excluyen aquí y los cubre la batería de tests.
 * CORRECCIÓN (V1.11): exp006 estaba excluido con la justificación «lo cubre la
 * batería de tests», que era FALSA (ningún test lo referenciaba) — y es determinista
 * (seed fija) y barato (gaussianas escalares + 3 searchBestPower). Entra en la lista;
 * su results.json publicado NO se regenera: solo se vigila.
 */
const EXPERIMENTOS = [
  { id: 'exp001_sensibilidad_elp', script: 'experiments/run_exp001.mjs' },
  { id: 'exp006_capacidad_eq', script: 'experiments/run_exp006.mjs' },
  { id: 'exp003_paraxial_vs_raytrace', script: 'experiments/run_exp003.mjs' },
  { id: 'exp007_politica_corneal', script: 'experiments/run_exp007.mjs' },
  { id: 'exp008_objetivo_optico', script: 'experiments/run_exp008.mjs' },
  { id: 'exp009_asfericidad_lio', script: 'experiments/run_exp009.mjs' },
  { id: 'exp010_pose_lio', script: 'experiments/run_exp010.mjs' },
  { id: 'exp011_torico_trazado', script: 'experiments/run_exp011.mjs' },
  { id: 'exp012_rotacion_torica', script: 'experiments/run_exp012.mjs' },
  { id: 'exp013_atlas_divergencia', script: 'experiments/run_exp013.mjs' },
  { id: 'exp014_incertidumbre_trazado', script: 'experiments/run_exp014.mjs' },
];

/** Campos que cambian por construcción en cada ejecución y no son parte del resultado. */
const VOLATILES = new Set(['timestamp', 'commit']);

function limpiar(v) {
  if (Array.isArray(v)) return v.map(limpiar);
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v).filter(([k]) => !VOLATILES.has(k)).map(([k, x]) => [k, limpiar(x)])
    );
  }
  return v;
}

/** Primera diferencia entre dos estructuras, con su ruta. Devuelve null si son iguales. */
function primeraDiferencia(a, b, ruta = '') {
  if (a === b) return null;
  if (typeof a !== typeof b || a === null || b === null) {
    return { ruta: ruta || '(raíz)', publicado: a, obtenido: b };
  }
  if (typeof a === 'number' && typeof b === 'number') {
    return Object.is(a, b) ? null : { ruta, publicado: a, obtenido: b };
  }
  if (typeof a !== 'object') return { ruta, publicado: a, obtenido: b };
  const claves = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of claves) {
    const d = primeraDiferencia(a[k], b[k], ruta ? `${ruta}.${k}` : k);
    if (d) return d;
  }
  return null;
}

let fallos = 0;
for (const exp of EXPERIMENTOS) {
  const destino = path.join(ROOT, 'experiments', exp.id, 'results.json');
  if (!fs.existsSync(destino)) {
    console.error(`✖ ${exp.id}: no hay results.json publicado en ${path.relative(ROOT, destino)}`);
    fallos++;
    continue;
  }
  const publicado = JSON.parse(fs.readFileSync(destino, 'utf8'));

  // el script reescribe results.json: se preserva el original y se restaura después,
  // de modo que verificar NUNCA modifique lo publicado
  const respaldo = fs.readFileSync(destino);
  const readmePath = path.join(ROOT, 'experiments', exp.id, 'README.md');
  const respaldoReadme = fs.existsSync(readmePath) ? fs.readFileSync(readmePath) : null;
  let obtenido;
  try {
    execFileSync(process.execPath, [path.join(ROOT, exp.script)], { cwd: ROOT, stdio: 'pipe' });
    obtenido = JSON.parse(fs.readFileSync(destino, 'utf8'));
  } catch (e) {
    console.error(`✖ ${exp.id}: la re-ejecución falló\n${e.stderr?.toString() ?? e.message}`);
    fallos++;
    continue;
  } finally {
    fs.writeFileSync(destino, respaldo);
    if (respaldoReadme) fs.writeFileSync(readmePath, respaldoReadme);
  }

  const d = primeraDiferencia(limpiar(publicado), limpiar(obtenido));
  if (d) {
    console.error(`✖ ${exp.id}: el resultado publicado NO se reproduce`);
    console.error(`   ruta      : ${d.ruta}`);
    console.error(`   publicado : ${JSON.stringify(d.publicado)}`);
    console.error(`   obtenido  : ${JSON.stringify(d.obtenido)}`);
    console.error('   Si el cambio es intencionado, regenera el experimento en un commit');
    console.error('   propio y explica en su README por qué cambió el resultado.');
    fallos++;
  } else {
    console.log(`✔ ${exp.id}: reproduce exactamente lo publicado`);
    if (VERBOSE) console.log(`   commit publicado: ${publicado.commit?.slice(0, 10) ?? '—'}`);
  }
}

if (fallos) {
  console.error(`\n${fallos} experimento(s) no reproducen.`);
  process.exit(1);
}
console.log(`\n${EXPERIMENTOS.length} experimentos reproducen su resultado publicado.`);
