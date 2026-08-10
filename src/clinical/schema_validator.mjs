/**
 * schema_validator.mjs — intérprete del subconjunto de JSON Schema 2020-12 usado
 * por los esquemas clínicos del proyecto (CAPA H — entrada de datos reales).
 *
 * Soporta exactamente lo que los .schema.json emplean: type (incl. uniones y
 * integer), required, properties, additionalProperties:false, enum,
 * minimum/maximum, pattern y objetos anidados. Fuente única de verdad = los
 * ficheros de data/clinical_schema/ (este módulo no duplica reglas).
 *
 * RESEARCH USE ONLY.
 */

function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number';
  return typeof v;
}

function typeMatches(declared, v) {
  const t = typeOf(v);
  const list = Array.isArray(declared) ? declared : [declared];
  return list.some(d => d === t || (d === 'number' && t === 'integer'));
}

/** Valida `value` contra `schema`; devuelve lista de errores legibles (vacía = OK). */
export function validateAgainstSchema(schema, value, path = '$') {
  const errors = [];
  if (schema.type !== undefined && !typeMatches(schema.type, value)) {
    errors.push(`${path}: tipo ${typeOf(value)} no permitido (esperado ${JSON.stringify(schema.type)})`);
    return errors; // sin tipo correcto, el resto de comprobaciones no aplica
  }
  if (value === null) return errors;

  if (schema.enum !== undefined && !schema.enum.includes(value)) {
    errors.push(`${path}: valor ${JSON.stringify(value)} fuera de enum ${JSON.stringify(schema.enum)}`);
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push(`${path}: ${value} < mínimo ${schema.minimum}`);
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      errors.push(`${path}: ${value} > máximo ${schema.maximum}`);
    }
  }
  if (typeof value === 'string' && schema.pattern !== undefined) {
    if (!new RegExp(schema.pattern).test(value)) {
      errors.push(`${path}: "${value}" no cumple el patrón ${schema.pattern}`);
    }
  }
  if (typeOf(value) === 'object' && schema.properties !== undefined) {
    for (const req of schema.required ?? []) {
      if (!(req in value)) errors.push(`${path}: falta el campo obligatorio "${req}"`);
    }
    for (const [k, v] of Object.entries(value)) {
      const sub = schema.properties[k];
      if (sub === undefined) {
        if (schema.additionalProperties === false) {
          errors.push(`${path}: campo no permitido "${k}" (additionalProperties:false — posible PII o error de export)`);
        }
        continue;
      }
      errors.push(...validateAgainstSchema(sub, v, `${path}.${k}`));
    }
  }
  return errors;
}
