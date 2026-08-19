/**
 * vec3.mjs — álgebra vectorial 3D mínima para el ray tracer.
 * Vectores como arrays [x, y, z]. Sin dependencias. RESEARCH USE ONLY.
 */
export const v3 = (x, y, z) => [x, y, z];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const norm = a => Math.hypot(a[0], a[1], a[2]);
export function normalize(a) {
  const n = norm(a);
  if (!(n > 0) || !Number.isFinite(n)) throw new RangeError('normalize: vector nulo o no finito');
  return scale(a, 1 / n);
}
/**
 * RENDIMIENTO (V1.14): bucle explícito en lugar de `a.every(Number.isFinite)`. El perfilado
 * lo situó en el 12 % del tiempo de exp013 — no por las comprobaciones, sino por la llamada
 * al callback por componente (se ejecuta por rayo Y por superficie, dentro de intersect y
 * de traceRay). Semánticamente IDÉNTICO para cualquier longitud, incluido el cortocircuito
 * al primer no-finito, así que no cambia ningún resultado.
 */
export const isFiniteVec = a => {
  for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) return false;
  return true;
};
