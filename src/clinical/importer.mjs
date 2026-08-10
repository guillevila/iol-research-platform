/**
 * importer.mjs — importación y validación de datos clínicos futuros (Sprint 12).
 *
 * Valida lotes de registros contra los esquemas de data/clinical_schema/ (fuente
 * única de verdad), aplica guardas heurísticas de PII y enlaza los tres niveles
 * (preop ↔ cirugía ↔ postop) por (patient_case_id, eye) reportando huérfanos.
 *
 * Los registros rechazados NUNCA se corrigen en silencio: se devuelven con sus
 * errores para que el centro corrija el export.
 *
 * RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING.
 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { validateAgainstSchema } from './schema_validator.mjs';

const SCHEMA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data', 'clinical_schema');
const KINDS = { preop: 'preop.schema.json', surgery: 'surgery.schema.json', postop: 'postop.schema.json' };
const schemaCache = {};

export function loadSchema(kind) {
  if (!KINDS[kind]) throw new TypeError(`kind desconocido: ${kind} (usa preop|surgery|postop)`);
  schemaCache[kind] ??= JSON.parse(fs.readFileSync(join(SCHEMA_DIR, KINDS[kind]), 'utf8'));
  return schemaCache[kind];
}

/**
 * Guarda heurística de PII sobre valores de texto. Complementa (no sustituye) el
 * `additionalProperties:false` de los esquemas. Detecta:
 *  - fechas completas DD/MM/AAAA o similares (posible fecha de nacimiento/cirugía exacta);
 *  - textos con pinta de nombre propio (≥2 palabras capitalizadas seguidas).
 * Límite documentado: es heurística; la anonimización responsable es del centro.
 */
export function piiFindings(record, path = '$') {
  const out = [];
  const DATE_LIKE = /\b\d{1,2}[\/\-.]\d{1,2}[\/\-.](19|20)\d{2}\b/;
  const NAME_LIKE = /\b[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,}\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,}\b/;
  for (const [k, v] of Object.entries(record ?? {})) {
    const p = `${path}.${k}`;
    if (typeof v === 'string') {
      if (DATE_LIKE.test(v)) out.push(`${p}: contiene fecha completa ("${v}") — generaliza a AAAA-Qn`);
      if (NAME_LIKE.test(v)) out.push(`${p}: texto con apariencia de nombre propio — prohibido`);
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      out.push(...piiFindings(v, p));
    }
  }
  return out;
}

/**
 * Valida un lote. Devuelve { accepted, rejected } donde cada rechazado lleva
 * su índice, el registro y la lista completa de errores (schema + PII).
 */
export function importBatch(kind, records) {
  if (!Array.isArray(records)) throw new TypeError('records debe ser un array');
  const schema = loadSchema(kind);
  const accepted = [], rejected = [];
  records.forEach((r, i) => {
    const errors = [
      ...validateAgainstSchema(schema, r),
      ...piiFindings(r),
    ];
    if (errors.length) rejected.push({ index: i, record: r, errors });
    else accepted.push(r);
  });
  return { kind, accepted, rejected, n: records.length };
}

/** Enlaza los tres niveles por (patient_case_id, eye); reporta huérfanos. */
export function linkCases({ preop = [], surgery = [], postop = [] }) {
  const key = r => `${r.patient_case_id}|${r.eye}`;
  const sIdx = new Map(surgery.map(r => [key(r), r]));
  const pIdx = new Map(postop.map(r => [key(r), r]));
  const complete = [], partial = [];
  for (const pre of preop) {
    const k = key(pre);
    const s = sIdx.get(k) ?? null, po = pIdx.get(k) ?? null;
    (s && po ? complete : partial).push({ key: k, preop: pre, surgery: s, postop: po });
    sIdx.delete(k); pIdx.delete(k);
  }
  const orphans = {
    surgery_sin_preop: [...sIdx.keys()],
    postop_sin_preop: [...pIdx.keys()],
    preop_incompletos: partial.map(p => p.key),
  };
  return { complete, partial, orphans };
}
