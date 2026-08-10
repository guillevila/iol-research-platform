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
export const isFiniteVec = a => a.every(Number.isFinite);
