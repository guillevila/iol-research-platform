/**
 * Tests de ARQUITECTURA (V0.5 / P0.6).
 *
 * La restricción fundacional del proyecto — *el motor físico nuevo no depende de EVO* —
 * estaba escrita únicamente en comentarios y en el prompt. Un comentario no impide que
 * alguien importe el legado desde el núcleo dentro de seis meses. Aquí se vuelve
 * ejecutable, y la CI la comprueba en cada push.
 *
 * EVO es benchmark, control y legado congelado. Puede compararse con él; no puede
 * construirse sobre él.
 *
 * RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const rel = f => path.relative(ROOT, f).replace(/\\/g, '/');
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => {
  const p = path.join(d, e.name);
  return e.isDirectory() ? walk(p) : (p.endsWith('.mjs') ? [p] : []);
});
const FUENTES = walk(path.join(ROOT, 'src'));

/**
 * ÚNICO módulo autorizado a tocar el legado, y solo a través de su API pública.
 * Vive en la capa de benchmark, no en la de física.
 */
const PUENTE_AUTORIZADO = 'src/bench/engines/evo_engine.mjs';
const API_LEGACY = 'legacy/evo_replica/run_evo_replica.mjs';

test('arquitectura: solo el adaptador de benchmark importa el legado', () => {
  const infractores = [];
  for (const f of FUENTES) {
    const contenido = fs.readFileSync(f, 'utf8');
    for (const m of contenido.matchAll(/(?:import|require)\s*(?:[^'"]*from\s*)?['"]([^'"]+)['"]/g)) {
      if (!/legacy/.test(m[1])) continue;
      const modulo = rel(f);
      if (modulo !== PUENTE_AUTORIZADO) {
        infractores.push(`${modulo} importa ${m[1]}`);
      } else if (!m[1].endsWith('run_evo_replica.mjs')) {
        infractores.push(`${modulo} entra al legado por una puerta no pública: ${m[1]}`);
      }
    }
  }
  assert.deepEqual(infractores, [],
    'El motor físico no puede depender de EVO. Único puente permitido: '
    + `${PUENTE_AUTORIZADO} → ${API_LEGACY}\n` + infractores.join('\n'));
});

test('arquitectura: el puente autorizado existe y usa la API pública del legado', () => {
  const f = path.join(ROOT, PUENTE_AUTORIZADO);
  assert.ok(fs.existsSync(f), `falta ${PUENTE_AUTORIZADO}`);
  const s = fs.readFileSync(f, 'utf8');
  assert.match(s, /run_evo_replica/, 'el puente debe usar run_evo_replica, no el motor interno');
  assert.ok(!/engine\.(js|cjs)/.test(s), 'el puente no puede saltarse la API y cargar el motor directo');
  assert.ok(fs.existsSync(path.join(ROOT, API_LEGACY)), `falta ${API_LEGACY}`);
});

test('arquitectura: ninguna capa física importa nada de src/bench', () => {
  // la dependencia va en un solo sentido: bench → física. Nunca al revés, o el motor
  // acabaría heredando decisiones tomadas para comparar con EVO.
  const FISICA = ['src/core', 'src/optics', 'src/toric', 'src/optimize', 'src/predictors', 'src/uncertainty'];
  const infractores = [];
  for (const f of FUENTES) {
    const modulo = rel(f);
    if (!FISICA.some(p => modulo.startsWith(p + '/'))) continue;
    const s = fs.readFileSync(f, 'utf8');
    for (const m of s.matchAll(/from\s*['"]([^'"]+)['"]/g)) {
      const destino = path.posix.normalize(path.posix.join(path.posix.dirname(modulo), m[1]));
      if (destino.startsWith('src/bench')) infractores.push(`${modulo} → ${destino}`);
    }
  }
  assert.deepEqual(infractores, [], 'dependencia invertida bench→física:\n' + infractores.join('\n'));
});

test('arquitectura: no hay constantes con pinta de ajuste a EVO en la física', () => {
  // Guarda contra el modo de fallo que el proyecto prohíbe explícitamente: introducir en
  // el motor físico un coeficiente obtenido ajustando contra el benchmark. No detecta
  // toda forma posible de hacerlo, pero sí la evidente: nombrarlo.
  const SOSPECHOSOS = /\b(evo[_A-Za-z]*(fit|coef|const|offset|adjust)|fit(ted)?_to_evo|evo_calibrat\w*)\b/i;
  const infractores = [];
  for (const f of FUENTES) {
    const modulo = rel(f);
    if (modulo.startsWith('src/bench/')) continue;      // la capa de comparación sí puede nombrar a EVO
    const s = fs.readFileSync(f, 'utf8');
    s.split('\n').forEach((linea, i) => {
      if (SOSPECHOSOS.test(linea)) infractores.push(`${modulo}:${i + 1}: ${linea.trim()}`);
    });
  }
  assert.deepEqual(infractores, [],
    'posible parámetro calibrado contra EVO en el motor físico:\n' + infractores.join('\n'));
});

test('arquitectura: el legado no importa nada del proyecto nuevo (está congelado)', () => {
  const LEGACY = path.join(ROOT, 'legacy');
  const infractores = [];
  const ficheros = walk(LEGACY).concat(
    fs.readdirSync(LEGACY, { recursive: true, withFileTypes: true })
      .filter(e => e.isFile() && e.name.endsWith('.mjs'))
      .map(e => path.join(e.parentPath ?? e.path, e.name))
  );
  for (const f of new Set(ficheros)) {
    const s = fs.readFileSync(f, 'utf8');
    for (const m of s.matchAll(/from\s*['"]([^'"]+)['"]/g)) {
      if (/(^|\/)src\//.test(m[1]) || m[1].includes('../../src')) {
        infractores.push(`${rel(f)} importa ${m[1]}`);
      }
    }
  }
  assert.deepEqual(infractores, [],
    'el legado congelado no puede depender del proyecto nuevo:\n' + infractores.join('\n'));
});

test('arquitectura: todo módulo de src/ lleva la etiqueta RESEARCH USE ONLY', () => {
  const sinEtiqueta = FUENTES
    .filter(f => !/RESEARCH USE ONLY/.test(fs.readFileSync(f, 'utf8')))
    .map(rel);
  assert.deepEqual(sinEtiqueta, [], 'módulos sin la etiqueta obligatoria:\n' + sinEtiqueta.join('\n'));
});
