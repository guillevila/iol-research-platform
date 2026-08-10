/**
 * make_hashes.mjs — registra los SHA-256 de los artefactos congelados del baseline.
 * Se ejecuta una vez en la congelación; el test de regresión verifica los críticos.
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}
const lines = [];
for (const dir of ['engine.js', 'data', 'cache', 'harness'].map(d => join(ROOT, d))) {
  const files = fs.statSync(dir).isDirectory() ? [...walk(dir)] : [dir];
  for (const f of files.sort()) {
    if (f.endsWith('HASHES.sha256')) continue;
    const h = crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
    lines.push(h + '  ' + relative(ROOT, f).replace(/\\/g, '/'));
  }
}
fs.writeFileSync(join(ROOT, 'baseline', 'HASHES.sha256'), lines.join('\n') + '\n');
console.log('hashes registrados:', lines.length, 'archivos');
