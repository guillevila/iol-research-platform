/**
 * surfaces.mjs — superficies ópticas del ray tracer (esféricas y planas, con apertura).
 *
 * Convenciones (coherentes con paraxial y units.mjs):
 *  - eje óptico = +z; unidades internas del trazador = MILÍMETROS (geometría);
 *  - superficie esférica definida por su vértice z_v y radio firmado R (mm):
 *      R > 0 → centro de curvatura a la derecha del vértice (córnea anterior típica);
 *  - `n_before` / `n_after` = índices a izquierda/derecha (luz viaja +z);
 *  - `aperture_mm` = semidiámetro útil alrededor del eje.
 *
 * RESEARCH USE ONLY.
 */
import { add, scale, sub, dot, normalize, isFiniteVec } from './vec3.mjs';

export function sphericalSurface({ zVertex_mm, radius_mm, aperture_mm = 4, n_before, n_after, id = '' }) {
  for (const [v, name] of [[zVertex_mm, 'zVertex'], [radius_mm, 'radius'], [n_before, 'n_before'], [n_after, 'n_after']]) {
    if (!Number.isFinite(v)) throw new TypeError(`sphericalSurface: ${name} no finito`);
  }
  if (radius_mm === 0) throw new RangeError('radio 0 no es una superficie');
  return { kind: 'sphere', zVertex_mm, radius_mm, aperture_mm, n_before, n_after, id };
}

export function planarSurface({ z_mm, aperture_mm = 4, n_before, n_after, id = '' }) {
  if (!Number.isFinite(z_mm)) throw new TypeError('planarSurface: z no finito');
  return { kind: 'plane', z_mm, aperture_mm, n_before, n_after, id };
}

/**
 * Intersección rayo–superficie. Rayo: { p:[x,y,z] mm, d:[dx,dy,dz] unitario }.
 * Devuelve { point, normal, t } con `normal` unitaria orientada CONTRA el rayo
 * (dot(normal, d) < 0), o null si no hay intersección válida (t<=eps o fuera de apertura).
 */
export function intersect(surface, ray) {
  const EPS = 1e-9;
  if (!isFiniteVec(ray.p) || !isFiniteVec(ray.d)) return null;
  if (surface.kind === 'plane') {
    if (Math.abs(ray.d[2]) < EPS) return null;
    const t = (surface.z_mm - ray.p[2]) / ray.d[2];
    if (t <= EPS) return null;
    const point = add(ray.p, scale(ray.d, t));
    if (Math.hypot(point[0], point[1]) > surface.aperture_mm) return null;
    const normal = ray.d[2] > 0 ? [0, 0, -1] : [0, 0, 1];
    return { point, normal, t };
  }
  // esfera: centro en el eje, a R del vértice
  const c = [0, 0, surface.zVertex_mm + surface.radius_mm];
  const oc = sub(ray.p, c);
  const b = dot(oc, ray.d);                       // |d|=1 → a=1
  const cc = dot(oc, oc) - surface.radius_mm * surface.radius_mm;
  const disc = b * b - cc;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  // candidatos ordenados; elegir el primer t>eps cuyo punto caiga en el casquete útil
  for (const t of [-b - s, -b + s]) {
    if (t <= EPS) continue;
    const point = add(ray.p, scale(ray.d, t));
    if (Math.hypot(point[0], point[1]) > surface.aperture_mm) continue;
    // casquete correcto: cerca del vértice (mismo lado que el vértice respecto al centro)
    const zRel = point[2] - c[2];
    if (surface.radius_mm > 0 ? zRel > 0 : zRel < 0) continue; // hemisferio lejano
    let normal = scale(sub(point, c), 1 / Math.abs(surface.radius_mm));
    normal = normalize(normal);
    if (dot(normal, ray.d) > 0) normal = scale(normal, -1);
    return { point, normal, t };
  }
  return null;
}

/**
 * Refracción vectorial (ley de Snell en 3D). `d` unitario, `n̂` unitaria contra el rayo.
 *   η = n1/n2 ; cosθi = −d·n̂ ; sin²θt = η²(1−cos²θi)
 *   t = η·d + (η·cosθi − cosθt)·n̂
 * Devuelve { d } refractado o { tir:true } si hay reflexión total interna.
 */
export function refractDirection(d, normal, n1, n2) {
  const eta = n1 / n2;
  const cosi = -dot(d, normal);
  if (cosi < 0) throw new RangeError('refractDirection: la normal debe apuntar contra el rayo');
  const sin2t = eta * eta * (1 - cosi * cosi);
  if (sin2t > 1) return { tir: true };
  const cost = Math.sqrt(1 - sin2t);
  const out = add(scale(d, eta), scale(normal, eta * cosi - cost));
  return { d: normalize(out) };
}
