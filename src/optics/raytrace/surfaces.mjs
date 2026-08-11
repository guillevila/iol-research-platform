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
 * Superficie BICÓNICA (V1.6) — la familia matemática EXPLÍCITA del tórico trazado.
 * NO es "dos radios principales" a secas: es la sagita bicónica estándar
 *
 *     z(x,y) = (cx·x² + cy·y²) / (1 + √(1 − (1+kx)·cx²·x² − (1+ky)·cy²·y²))
 *
 * con curvaturas principales cx = 1/Rx, cy = 1/Ry a lo largo de los ejes LOCALES x/y
 * y constante cónica POR MERIDIANO (kx, ky). Casos contenidos EXACTAMENTE:
 *   - Rx = Ry y kx = ky  →  la cónica de revolución (misma fórmula, término a término);
 *     con kx = ky = 0, la esfera. La recuperación se verifica numéricamente a 1e-12
 *     contra el algoritmo CERRADO de conicSurface (dos algoritmos independientes).
 *   - cx = 0 (o cy = 0)  →  cilindro cónico: potencia solo en un meridiano (la línea
 *     focal pura, ancla analítica del análisis astigmático).
 *
 * La ORIENTACIÓN del eje tórico NO vive aquí: los meridianos principales son los ejes
 * locales x/y por definición, y un eje a θ° se obtiene envolviendo con
 * `transformedSurface` y una rotación Rz(θ) — la misma convención rotation_z de la
 * pose (V1.3), sin matemática duplicada.
 *
 * INTERSECCIÓN: la bicónica NO es una cuádrica en general (lo es solo si
 * (1+kx)·cx = (1+ky)·cy), así que no existe la forma cerrada de la cónica. Se usa
 * Newton SALVAGUARDADO sobre F(t) = z'(t) − sagita(x(t), y(t)):
 *   1) horquilla inicial = ventana de t donde el rayo cruza la LOSA que contiene la
 *      superficie (|sagita| ≤ SB, cota calculada al construir);
 *   2) barrido de la ventana buscando cambio de signo (el PRIMER cruce = rama próxima);
 *   3) Newton con derivada analítica, degradando a bisección si el paso sale de la
 *      horquilla o del dominio de la sagita — convergencia a |F| < 1e-11 mm.
 * La semilla del caso degenerado (Rx=Ry) coincide con la raíz cerrada de la cónica y
 * los tests exigen igualdad a 1e-12. Limitación documentada: incidencias RASANTES con
 * doble cruce dentro de un paso del barrido podrían perderse; en el ojo los haces
 * llegan a las superficies lejos de la tangencia y los tests de pérdidas lo vigilan.
 *
 * NO representa geometría de LIO comercial real salvo procedencia de fabricante: la
 * geometría tórica sintética derivada de una etiqueta es SIEMPRE sustituto declarado.
 *
 * Validación de apertura: la sagita existe donde (1+kx)cx²x² + (1+ky)cy²y² ≤ 1; el
 * peor meridiano manda: r_max = 1/√(max(gx, gy)) con g = (1+k)c². Se rechaza al
 * CONSTRUIR, como en conicSurface.
 */
export function biconicSurface({ zVertex_mm, radius_x_mm, radius_y_mm, kx = 0, ky = 0,
  aperture_mm = 4, n_before, n_after, id = '' }) {
  for (const [v, name] of [[zVertex_mm, 'zVertex'], [kx, 'kx'], [ky, 'ky'],
    [aperture_mm, 'aperture'], [n_before, 'n_before'], [n_after, 'n_after']]) {
    if (!Number.isFinite(v)) throw new TypeError(`biconicSurface: ${name} no finito`);
  }
  // ±Infinity = meridiano PLANO (curvatura 0, el cilindro puro) — misma convención que
  // curvatureFromRadiusMm; NaN y 0 se rechazan
  for (const [v, name] of [[radius_x_mm, 'radius_x'], [radius_y_mm, 'radius_y']]) {
    if (Number.isNaN(v) || v === undefined || v === null) throw new TypeError(`biconicSurface: ${name} no finito`);
    if (v === 0) throw new RangeError('radio 0 no es una superficie');
  }
  const cx = 1 / radius_x_mm, cy = 1 / radius_y_mm;
  const gx = (1 + kx) * cx * cx, gy = (1 + ky) * cy * cy;
  const gMax = Math.max(gx, gy);
  if (gMax > 0) {
    const rMax = 1 / Math.sqrt(gMax);
    if (aperture_mm >= rMax) {
      throw new RangeError(`biconicSurface ${id}: apertura ${aperture_mm} mm fuera del dominio de la `
        + `sagita (r_max = ${rMax.toFixed(4)} mm para Rx=${radius_x_mm}, Ry=${radius_y_mm}, kx=${kx}, ky=${ky})`);
    }
  }
  // cota de losa: |N| ≤ max(|cx|,|cy|)·a² y el denominador de la sagita es ≥ 1
  const slabHalf_mm = Math.max(Math.abs(cx), Math.abs(cy)) * aperture_mm * aperture_mm;
  return { kind: 'biconic', zVertex_mm, radius_x_mm, radius_y_mm, kx, ky, aperture_mm, n_before, n_after, id, slabHalf_mm };
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

/**
 * Superficie TRANSFORMADA (V1.3): una superficie base (esfera/cónica/plano, definida en
 * el marco LOCAL) colocada en el mundo mediante una transformación RÍGIDA
 *     p_global = R · p_local + T.
 * La intersección NO duplica la matemática de la base: mapea el rayo al marco local
 * (Rᵀ es la inversa de una rotación pura), reutiliza `intersect(base, ...)` y devuelve
 * punto y normal al marco global. El parámetro t es invariante bajo transformaciones
 * rígidas (|d| se conserva), así que la selección de rama, la sagita, la apertura (que
 * vive en el marco local: se mueve CON la lente) y las guardas de la base aplican
 * intactas.
 */
export function transformedSurface({ base, R, T, id = '' }) {
  if (!base || !['sphere', 'conic', 'plane', 'biconic'].includes(base.kind)) {
    throw new TypeError('transformedSurface: base debe ser esfera, cónica, bicónica o plano');
  }
  if (!Array.isArray(R) || R.length !== 3 || !Array.isArray(T) || T.length !== 3) {
    throw new TypeError('transformedSurface: R (3×3) y T (3) requeridos');
  }
  return {
    kind: 'transformed', base, R, T, id: id || base.id,
    n_before: base.n_before, n_after: base.n_after, aperture_mm: base.aperture_mm,
    // z del vértice de la base llevado al marco global: referencia para el bracket de
    // foco (zUltima). Con tilt, puntos de la superficie pueden superar este z: el
    // bracket de bestFocus opera sobre RECTAS emergentes, así que sigue siendo válido.
    zVertex_mm: (base.kind === 'plane')
      ? R[2][0] * 0 + R[2][1] * 0 + R[2][2] * base.z_mm + T[2]
      : R[2][2] * base.zVertex_mm + T[2],
  };
}

const matTvec = (R, v) => [
  R[0][0] * v[0] + R[1][0] * v[1] + R[2][0] * v[2],
  R[0][1] * v[0] + R[1][1] * v[1] + R[2][1] * v[2],
  R[0][2] * v[0] + R[1][2] * v[1] + R[2][2] * v[2],
];
const matVec = (R, v) => [
  R[0][0] * v[0] + R[0][1] * v[1] + R[0][2] * v[2],
  R[1][0] * v[0] + R[1][1] * v[1] + R[1][2] * v[2],
  R[2][0] * v[0] + R[2][1] * v[1] + R[2][2] * v[2],
];

export function intersect(surface, ray) {
  const EPS = 1e-9;
  if (!isFiniteVec(ray.p) || !isFiniteVec(ray.d)) return null;
  if (surface.kind === 'transformed') {
    const { base, R, T } = surface;
    const local = { p: matTvec(R, sub(ray.p, T)), d: matTvec(R, ray.d) };
    const hit = intersect(base, local);
    if (!hit) return null;
    return {
      point: add(matVec(R, hit.point), T),
      normal: matVec(R, hit.normal),
      t: hit.t,
    };
  }
  if (surface.kind === 'plane') {
    if (Math.abs(ray.d[2]) < EPS) return null;
    const t = (surface.z_mm - ray.p[2]) / ray.d[2];
    if (t <= EPS) return null;
    const point = add(ray.p, scale(ray.d, t));
    if (Math.hypot(point[0], point[1]) > surface.aperture_mm + APERTURE_TOL_MM) return null;
    const normal = ray.d[2] > 0 ? [0, 0, -1] : [0, 0, 1];
    return { point, normal, t };
  }
  if (surface.kind === 'biconic') {
    // Newton salvaguardado sobre F(t) = z'(t) − sagita(x(t), y(t)) — ver docstring de
    // biconicSurface: no hay forma cerrada porque la bicónica no es cuádrica en general.
    const cx = 1 / surface.radius_x_mm, cy = 1 / surface.radius_y_mm;
    const gx = (1 + surface.kx) * cx * cx, gy = (1 + surface.ky) * cy * cy;
    const [dx, dy, dz] = ray.d;
    const px = ray.p[0], py = ray.p[1], pz = ray.p[2] - surface.zVertex_mm;
    /** sagita y su gradiente; null fuera del dominio (1 − A < 0) */
    const sag = (x, y) => {
      const u = 1 - gx * x * x - gy * y * y;
      if (u < 0) return null;
      const s = Math.sqrt(u);
      const N = cx * x * x + cy * y * y;
      return { z: N / (1 + s), s, N };
    };
    const F = t => {
      const x = px + dx * t, y = py + dy * t;
      const sg = sag(x, y);
      return sg === null ? null : (pz + dz * t) - sg.z;
    };
    // ventana de t donde el rayo atraviesa la losa |z'| ≤ SB (más margen)
    const SB = surface.slabHalf_mm + 1e-6;
    let tA, tB;
    if (Math.abs(dz) > 1e-9) {
      const t1 = (-SB - pz) / dz, t2 = (SB - pz) / dz;
      tA = Math.min(t1, t2); tB = Math.max(t1, t2);
    } else {
      // rayo casi perpendicular al eje: ventana desde el cruce de apertura transversal
      const win = (p0, d0) => {
        if (Math.abs(d0) < 1e-12) return Math.abs(p0) <= surface.aperture_mm ? [-1e6, 1e6] : null;
        const u1 = (-surface.aperture_mm - p0) / d0, u2 = (surface.aperture_mm - p0) / d0;
        return [Math.min(u1, u2), Math.max(u1, u2)];
      };
      const wx = win(px, dx), wy = win(py, dy);
      if (!wx || !wy) return null;
      tA = Math.max(wx[0], wy[0]); tB = Math.min(wx[1], wy[1]);
      if (!(tB > tA)) return null;
    }
    tA = Math.max(tA, EPS);
    if (!(tB > tA)) return null;
    // barrido: PRIMER cambio de signo = rama próxima (t creciente); muestras fuera del
    // dominio de la sagita se saltan (huecos), nunca se interpretan como cruce
    const K = 25;
    let bracket = null, prevT = null, prevF = null;
    for (let i = 0; i <= K; i++) {
      const t = tA + (tB - tA) * (i / K);
      const f = F(t);
      if (f === null) { prevT = null; prevF = null; continue; }
      if (Math.abs(f) < 1e-13) { bracket = [t, t]; break; }
      if (prevF !== null && Math.sign(f) !== Math.sign(prevF)) { bracket = [prevT, t]; break; }
      prevT = t; prevF = f;
    }
    if (!bracket) return null;
    // Newton con salvaguarda de bisección dentro de la horquilla
    let [lo, hi] = bracket;
    let t = 0.5 * (lo + hi);
    if (lo !== hi) {
      let fLo = F(lo);
      for (let iter = 0; iter < 60; iter++) {
        const x = px + dx * t, y = py + dy * t;
        const sg = sag(x, y);
        let tNext = null;
        if (sg !== null) {
          const f = (pz + dz * t) - sg.z;
          if (Math.abs(f) < 1e-13) break;
          if (Math.sign(f) === Math.sign(fLo)) lo = t; else hi = t;
          // derivada analítica: F' = dz − (∂sag/∂x·dx + ∂sag/∂y·dy)
          const den = (1 + sg.s) * (1 + sg.s);
          const fx = sg.s > 1e-12 ? x * (2 * cx * (1 + sg.s) + sg.N * gx / sg.s) / den : null;
          const fy = sg.s > 1e-12 ? y * (2 * cy * (1 + sg.s) + sg.N * gy / sg.s) / den : null;
          if (fx !== null && fy !== null) {
            const fp = dz - (fx * dx + fy * dy);
            if (fp !== 0) tNext = t - f / fp;
          }
        } else {
          hi = t; // fuera de dominio: encoger hacia lo (el lado definido)
        }
        t = (tNext !== null && tNext > lo && tNext < hi) ? tNext : 0.5 * (lo + hi);
        if (hi - lo < 1e-15) break;
      }
      // pulido final: dos pasos de Newton puros (sin horquilla) — a esta distancia el
      // paso es ~cuadrático y lleva el residuo a precisión de máquina
      for (let extra = 0; extra < 2; extra++) {
        const x = px + dx * t, y = py + dy * t;
        const sg = sag(x, y);
        if (sg === null || sg.s < 1e-12) break;
        const f = (pz + dz * t) - sg.z;
        const den = (1 + sg.s) * (1 + sg.s);
        const fx = x * (2 * cx * (1 + sg.s) + sg.N * gx / sg.s) / den;
        const fy = y * (2 * cy * (1 + sg.s) + sg.N * gy / sg.s) / den;
        const fp = dz - (fx * dx + fy * dy);
        if (fp === 0) break;
        t = t - f / fp;
      }
    }
    if (t <= EPS) return null;
    const x = t * dx + px, y = t * dy + py;
    if (Math.hypot(x, y) > surface.aperture_mm + APERTURE_TOL_MM) return null;
    const sg = sag(x, y);
    if (sg === null || Math.abs((pz + dz * t) - sg.z) > 1e-9 * Math.max(1, Math.abs(sg.z))) return null;
    // normal ∝ (−∂sag/∂x, −∂sag/∂y, 1)
    const den = (1 + sg.s) * (1 + sg.s);
    const fx = x * (2 * cx * (1 + sg.s) + sg.N * gx / sg.s) / den;
    const fy = y * (2 * cy * (1 + sg.s) + sg.N * gy / sg.s) / den;
    let normal = normalize([-fx, -fy, 1]);
    if (dot(normal, ray.d) > 0) normal = scale(normal, -1);
    const point = add(ray.p, scale(ray.d, t));
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
