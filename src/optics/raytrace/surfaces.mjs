/**
 * surfaces.mjs — superficies ópticas del ray tracer (esféricas, planas y cónicas, con apertura).
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
 * Superficie CÓNICA de revolución (V1.2). Sagita estándar de la óptica oftálmica:
 *
 *     z(r) = c·r² / (1 + √(1 − (1+k)·c²·r²)),   c = 1/R,  r² = x²+y²
 *
 * donde k es la constante cónica (la "asfericidad Q" oftálmica ES esta k):
 *     k = 0 esfera · −1<k<0 elipse prolata (córnea típica, Q≈−0.2) · k = −1 parábola
 *     k < −1 hipérbola · k > 0 elipse oblata.
 *
 * Forma implícita equivalente (la que usa la intersección):
 *     F(x,y,z') = c·(x² + y² + (1+k)·z'²) − 2·z' = 0,   z' = z − z_vértice
 * Con k = 0 es EXACTAMENTE la esfera de radio R centrada en z_vértice + R.
 *
 * La curvatura en el vértice es c independientemente de k: la óptica PARAXIAL de una
 * cónica es exactamente la de su esfera osculatriz (por eso el paraxial puede ignorar
 * Q sin imputar nada, y por eso pupila→0 debe converger al mismo límite para todo k).
 *
 * Validación de apertura: para (1+k)·c² > 0 la sagita solo existe hasta
 * r_max = 1/(c·√(1+k)); una apertura mayor pediría puntos fuera de la superficie y se
 * rechaza al CONSTRUIR, no silenciosamente rayo a rayo.
 */
export function conicSurface({ zVertex_mm, radius_mm, k, aperture_mm = 4, n_before, n_after, id = '' }) {
  for (const [v, name] of [[zVertex_mm, 'zVertex'], [radius_mm, 'radius'], [k, 'k'],
    [aperture_mm, 'aperture'], [n_before, 'n_before'], [n_after, 'n_after']]) {
    if (!Number.isFinite(v)) throw new TypeError(`conicSurface: ${name} no finito`);
  }
  if (radius_mm === 0) throw new RangeError('radio 0 no es una superficie');
  const c = 1 / radius_mm;
  if ((1 + k) * c * c > 0) {
    const rMax = 1 / (Math.abs(c) * Math.sqrt(1 + k));
    if (aperture_mm >= rMax) {
      throw new RangeError(`conicSurface ${id}: apertura ${aperture_mm} mm fuera del dominio de la `
        + `sagita (r_max = ${rMax.toFixed(4)} mm para R=${radius_mm}, k=${k})`);
    }
  }
  return { kind: 'conic', zVertex_mm, radius_mm, k, aperture_mm, n_before, n_after, id };
}

/**
 * Intersección rayo–superficie. Rayo: { p:[x,y,z] mm, d:[dx,dy,dz] unitario }.
 * Devuelve { point, normal, t } con `normal` unitaria orientada CONTRA el rayo
 * (dot(normal, d) < 0), o null si no hay intersección válida (t<=eps o fuera de apertura).
 */
/**
 * Holgura absoluta del chequeo de apertura (1e-9 mm, sub-nanométrica): un haz cuyo
 * anillo exterior coincide EXACTAMENTE con la apertura perdía rayos del borde por coma
 * flotante (hypot = r·(1+ulp) > r). Los perdidos eran precisamente los más aberrantes:
 * sesgo pequeño pero sistemático (hallazgo adversarial de V1.2). No cambia ningún
 * resultado publicado: solo admite rayos del borde antes rechazados por redondeo.
 */
const APERTURE_TOL_MM = 1e-9;

export function intersect(surface, ray) {
  const EPS = 1e-9;
  if (!isFiniteVec(ray.p) || !isFiniteVec(ray.d)) return null;
  if (surface.kind === 'plane') {
    if (Math.abs(ray.d[2]) < EPS) return null;
    const t = (surface.z_mm - ray.p[2]) / ray.d[2];
    if (t <= EPS) return null;
    const point = add(ray.p, scale(ray.d, t));
    if (Math.hypot(point[0], point[1]) > surface.aperture_mm + APERTURE_TOL_MM) return null;
    const normal = ray.d[2] > 0 ? [0, 0, -1] : [0, 0, 1];
    return { point, normal, t };
  }
  if (surface.kind === 'conic') {
    // F(x,y,z') = c·(x²+y²+(1+k)z'²) − 2z' = 0 a lo largo del rayo → cuadrática en t.
    // Con d axial y k = −1 (paraboloide) el término cuadrático se anula: caso lineal.
    const cv = 1 / surface.radius_mm, k = surface.k;
    const px = ray.p[0], py = ray.p[1], pz = ray.p[2] - surface.zVertex_mm;
    const [dx, dy, dz] = ray.d;
    const A = cv * (dx * dx + dy * dy + (1 + k) * dz * dz);
    const B = 2 * (cv * (px * dx + py * dy + (1 + k) * pz * dz) - dz);
    const C = cv * (px * px + py * py + (1 + k) * pz * pz) - 2 * pz;
    let ts;
    if (A === 0) {
      // exacto solo para rayos axiales sobre paraboloide (k=−1): caso lineal
      if (Math.abs(B) < 1e-14) return null;
      ts = [-C / B];
    } else {
      const disc = B * B - 4 * A * C;
      if (disc < 0) return null;
      const s = Math.sqrt(disc);
      // CITARDAUQ, no la fórmula clásica: (−B−s)/(2A) sufre cancelación catastrófica
      // cuando A→0 (k≈−1 con tilts pequeños, |R| grande) y el filtro de sagita convertía
      // esa imprecisión en rechazo de intersecciones GENUINAS — rayos perdidos en
      // silencio (hallazgo de la revisión adversarial de V1.2, con ventanas de pérdida
      // medidas de [2.8e-7, 7.8e-4] rad en el propio paraboloide del test). La raíz
      // pequeña C/q es estable y continua con el caso lineal cuando A→0.
      const q = -0.5 * (B + Math.sign(B || 1) * s);
      ts = q === 0 ? [0] : [C / q, q / A].sort((a, b) => a - b);
    }
    // la cuádrica implícita contiene AMBAS ramas; solo es superficie real la que
    // satisface la sagita (rama "−"): se verifica punto a punto en vez de adivinar
    const sag = r2 => {
      const u = 1 - (1 + k) * cv * cv * r2;
      return u < 0 ? null : cv * r2 / (1 + Math.sqrt(u));
    };
    for (const t of ts) {
      if (t <= EPS) continue;
      const point = add(ray.p, scale(ray.d, t));
      const x = point[0], y = point[1], z = point[2] - surface.zVertex_mm;
      if (Math.hypot(x, y) > surface.aperture_mm + APERTURE_TOL_MM) continue;
      const sg = sag(x * x + y * y);
      if (sg === null || Math.abs(z - sg) > 1e-9 * Math.max(1, Math.abs(z))) continue;
      // normal ∝ ∇F = (2c·x, 2c·y, 2c(1+k)z' − 2)
      let normal = normalize([cv * x, cv * y, cv * (1 + k) * z - 1]);
      if (dot(normal, ray.d) > 0) normal = scale(normal, -1);
      return { point, normal, t };
    }
    return null;
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
    if (Math.hypot(point[0], point[1]) > surface.aperture_mm + APERTURE_TOL_MM) continue;
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
