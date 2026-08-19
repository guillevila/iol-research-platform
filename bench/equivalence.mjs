/**
 * equivalence.mjs — PUERTA DE EQUIVALENCIA NUMÉRICA de V1.14.
 *
 * EL PRINCIPIO QUE HACE CUMPLIR:
 *   UNA OPTIMIZACIÓN QUE CAMBIA UN RESULTADO NO ES UNA OPTIMIZACIÓN.
 *   ES UN CAMBIO DE MODELO.
 *
 * Ejecuta todos los workloads y serializa sus salidas CIENTÍFICAS COMPLETAS con una
 * codificación que distingue bit a bit: los números se emiten con `toString(16)` sobre su
 * representación IEEE-754, de modo que 0.1 y 0.1+1e-17 NO colisionan y −0 ≠ +0. Comparar
 * los JSON con `JSON.stringify` habría tolerado diferencias en el último bit; aquí no.
 *
 * Uso:
 *   node bench/equivalence.mjs --save <fichero>    captura la instantánea (baseline)
 *   node bench/equivalence.mjs --check <fichero>   compara contra ella y falla si difiere
 *   node bench/equivalence.mjs --work              publica solo el trabajo determinista
 *
 * Lo que NO hace: medir tiempo. El tiempo vive en run_bench.mjs porque depende de la
 * máquina y no puede ser un invariante.
 *
 * RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING.
 */
import fs from 'node:fs';
import { WORKLOADS } from './workloads.mjs';
import { measureWork } from '../src/perf/counters.mjs';

/**
 * Codificación canónica que distingue bit a bit y es estable entre corridas:
 *  - números finitos → hex de sus 8 bytes IEEE-754 (distingue −0 de +0 y ULPs);
 *  - NaN/Infinity → etiqueta explícita (JSON los convertiría en null en silencio);
 *  - objetos → claves ORDENADAS (el orden de inserción no es una propiedad científica).
 */
const buf = new DataView(new ArrayBuffer(8));
function canon(v) {
  if (typeof v === 'number') {
    if (Number.isNaN(v)) return '#NaN';
    if (v === Infinity) return '#+Inf';
    if (v === -Infinity) return '#-Inf';
    buf.setFloat64(0, v);
    let h = '';
    for (let i = 0; i < 8; i++) h += buf.getUint8(i).toString(16).padStart(2, '0');
    return `#f64:${h}`;
  }
  if (Array.isArray(v)) return v.map(canon);
  if (v instanceof Map) return { '#Map': [...v.entries()].map(([k, x]) => [canon(k), canon(x)]) };
  if (v instanceof Set) return { '#Set': [...v.values()].map(canon) };
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = canon(v[k]);
    return out;
  }
  return v;   // string | boolean | null | undefined
}

/** Ejecuta todos los workloads capturando salida científica Y trabajo determinista. */
export function capturar() {
  const out = { workloads: {} };
  for (const w of WORKLOADS) {
    const { valor, trabajo } = measureWork(() => w.run());
    out.workloads[w.id] = {
      descripcion: w.descripcion,
      parametros_cientificos: w.parametros,
      trabajo_determinista: trabajo,
      salida_cientifica: canon(valor),
    };
  }
  return out;
}

/** Primera diferencia entre dos instantáneas, con su ruta. null si son idénticas. */
export function primeraDiferencia(a, b, ruta = '') {
  if (a === b) return null;
  const ta = a === null ? 'null' : typeof a, tb = b === null ? 'null' : typeof b;
  if (ta !== tb) return { ruta: ruta || '(raíz)', antes: a, despues: b };
  if (ta !== 'object') return { ruta, antes: a, despues: b };
  if (Array.isArray(a) !== Array.isArray(b)) return { ruta, antes: `array:${Array.isArray(a)}`, despues: `array:${Array.isArray(b)}` };
  if (Array.isArray(a)) {
    if (a.length !== b.length) return { ruta: `${ruta}.length`, antes: a.length, despues: b.length };
    for (let i = 0; i < a.length; i++) {
      const d = primeraDiferencia(a[i], b[i], `${ruta}[${i}]`);
      if (d) return d;
    }
    return null;
  }
  const claves = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  for (const k of claves) {
    const d = primeraDiferencia(a[k], b[k], ruta ? `${ruta}.${k}` : k);
    if (d) return d;
  }
  return null;
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`
  || import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  const args = process.argv.slice(2);
  const modo = args[0];
  const fichero = args[1];
  if (modo === '--save') {
    if (!fichero) throw new TypeError('--save requiere un fichero de destino');
    fs.writeFileSync(fichero, JSON.stringify(capturar(), null, 1) + '\n');
    console.log(`instantánea de equivalencia guardada en ${fichero}`);
  } else if (modo === '--check') {
    if (!fichero) throw new TypeError('--check requiere el fichero de referencia');
    const antes = JSON.parse(fs.readFileSync(fichero, 'utf8'));
    const ahora = capturar();
    let fallos = 0;
    for (const id of Object.keys(antes.workloads)) {
      const a = antes.workloads[id], b = ahora.workloads[id];
      if (!b) { console.error(`✖ ${id}: el workload ha DESAPARECIDO`); fallos++; continue; }
      // 1. los parámetros CIENTÍFICOS no pueden haber cambiado: eso sería otro experimento
      const dp = primeraDiferencia(a.parametros_cientificos, b.parametros_cientificos);
      if (dp) {
        console.error(`✖ ${id}: PARÁMETRO CIENTÍFICO cambiado en ${dp.ruta}: `
          + `${JSON.stringify(dp.antes)} → ${JSON.stringify(dp.despues)}`);
        console.error('   Reducir un parámetro científico NO es optimizar: es cambiar la pregunta.');
        fallos++;
      }
      // 2. la salida científica debe ser IDÉNTICA bit a bit
      const ds = primeraDiferencia(a.salida_cientifica, b.salida_cientifica);
      if (ds) {
        console.error(`✖ ${id}: SALIDA CIENTÍFICA cambiada en ${ds.ruta}`);
        console.error(`   antes   : ${JSON.stringify(ds.antes)}`);
        console.error(`   después : ${JSON.stringify(ds.despues)}`);
        fallos++;
      } else if (!dp) {
        // 3. el TRABAJO sí puede (y debe) bajar: se informa, no se exige
        const t = (o) => Object.entries(o.trabajo_determinista).map(([k, v]) => `${k}=${v}`).join(' ');
        const igual = JSON.stringify(a.trabajo_determinista) === JSON.stringify(b.trabajo_determinista);
        console.log(`✔ ${id}: salida IDÉNTICA bit a bit`
          + (igual ? ' · trabajo sin cambios' : `\n    trabajo antes  : ${t(a)}\n    trabajo después: ${t(b)}`));
      }
    }
    const nuevos = Object.keys(ahora.workloads).filter(id => !antes.workloads[id]);
    if (nuevos.length) console.log(`ℹ workloads NUEVOS (sin referencia): ${nuevos.join(', ')}`);
    if (fallos) {
      console.error(`\n${fallos} workload(s) NO son equivalentes. Una optimización que cambia un `
        + 'resultado no es una optimización: es un cambio de modelo.');
      process.exit(1);
    }
    console.log(`\n${Object.keys(antes.workloads).length} workloads: salida científica IDÉNTICA bit a bit.`);
  } else if (modo === '--work') {
    const s = capturar();
    for (const [id, w] of Object.entries(s.workloads)) {
      console.log(`${id.padEnd(14)} ${Object.entries(w.trabajo_determinista).map(([k, v]) => `${k}=${v}`).join('  ')}`);
    }
  } else {
    console.error('uso: node bench/equivalence.mjs --save|--check <fichero> | --work');
    process.exit(2);
  }
}
