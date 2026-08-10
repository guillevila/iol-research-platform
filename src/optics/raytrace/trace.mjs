/**
 * trace.mjs — propagación de rayos a través de un sistema de superficies y
 * búsqueda del mejor foco (mínimo RMS del spot transversal).
 *
 * Unidades internas: milímetros. Sistema = superficies ordenadas por z creciente.
 * RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING.
 */
import { add, scale, isFiniteVec } from './vec3.mjs';
import { intersect, refractDirection } from './surfaces.mjs';

/**
 * Traza un rayo por todas las superficies. Devuelve
 *  { ok:true, ray, hits:[{surfaceId, point}] }  con el rayo de salida, o
 *  { ok:false, reason, at }  si se pierde (sin intersección, apertura, TIR).
 */
export function traceRay(surfaces, ray0) {
  let ray = { p: [...ray0.p], d: [...ray0.d] };
  const hits = [];
  for (const s of surfaces) {
    const hit = intersect(s, ray);
    if (!hit) return { ok: false, reason: 'miss_or_aperture', at: s.id || s.kind };
    const r = refractDirection(ray.d, hit.normal, s.n_before, s.n_after);
    if (r.tir) return { ok: false, reason: 'tir', at: s.id || s.kind };
    ray = { p: hit.point, d: r.d };
    if (!isFiniteVec(ray.p) || !isFiniteVec(ray.d)) return { ok: false, reason: 'nan', at: s.id || s.kind };
    hits.push({ surfaceId: s.id || s.kind, point: hit.point });
  }
  return { ok: true, ray, hits };
}

/** Haz de rayos paralelos al eje (objeto en infinito) a alturas dadas (mm). */
export function parallelBundle(heights_mm, zStart_mm = -10) {
  return heights_mm.map(h => ({ p: [0, h, zStart_mm], d: [0, 0, 1] }));
}

/** Radio RMS del spot del haz en el plano z (mm). */
export function spotRmsAt(rays, z_mm) {
  let s = 0, n = 0;
  for (const r of rays) {
    if (Math.abs(r.d[2]) < 1e-12) continue;
    const t = (z_mm - r.p[2]) / r.d[2];
    const x = r.p[0] + r.d[0] * t, y = r.p[1] + r.d[1] * t;
    s += x * x + y * y; n++;
  }
  if (!n) throw new RangeError('spotRmsAt: sin rayos válidos');
  return Math.sqrt(s / n);
}

/**
 * Mejor foco: z que minimiza el RMS del spot, por búsqueda de sección áurea.
 * El RMS(z) de un haz de rectas es unimodal en el entorno del foco.
 */
export function bestFocus(rays, zLo_mm, zHi_mm, tol_mm = 1e-6) {
  if (!(zHi_mm > zLo_mm)) throw new RangeError('bestFocus: rango inválido');
  const phi = (Math.sqrt(5) - 1) / 2;
  let a = zLo_mm, b = zHi_mm;
  let c = b - phi * (b - a), d = a + phi * (b - a);
  let fc = spotRmsAt(rays, c), fd = spotRmsAt(rays, d);
  let guard = 0;
  while (b - a > tol_mm && guard++ < 200) {
    if (fc < fd) { b = d; d = c; fd = fc; c = b - phi * (b - a); fc = spotRmsAt(rays, c); }
    else { a = c; c = d; fc = fd; d = a + phi * (b - a); fd = spotRmsAt(rays, d); }
  }
  const z = (a + b) / 2;
  return { z_mm: z, rms_mm: spotRmsAt(rays, z) };
}

/**
 * Foco de un sistema para objeto en infinito: traza el haz, filtra pérdidas y
 * localiza el mejor foco tras la última superficie. Reporta también el foco del
 * rayo marginal más bajo (paraxial numérico) para comparación.
 */
export function focusOfSystem(surfaces, { heights_mm = [0.05, 0.5, 1, 1.5, 2], zSearchTo_mm = 60 } = {}) {
  const rays0 = parallelBundle(heights_mm);
  const out = [], lost = [];
  for (const r0 of rays0) {
    const tr = traceRay(surfaces, r0);
    if (tr.ok) out.push(tr.ray); else lost.push({ h: r0.p[1], ...tr });
  }
  if (out.length < 2) throw new RangeError('focusOfSystem: haz insuficiente (' + JSON.stringify(lost) + ')');
  const zLast = Math.max(...surfaces.map(s => s.kind === 'plane' ? s.z_mm : s.zVertex_mm));
  const best = bestFocus(out, zLast + 0.05, zSearchTo_mm);
  // cruce con el eje del rayo de menor altura no axial → estimador paraxial numérico
  const lowest = out.reduce((m, r) => Math.abs(r.p[1]) < Math.abs(m.p[1]) && Math.abs(r.d[1]) > 1e-15 ? r : m, out[out.length - 1]);
  const zParaxialNum = lowest.p[2] - lowest.p[1] * (lowest.d[2] / lowest.d[1]);
  return { bestFocus_mm: best.z_mm, spotRms_mm: best.rms_mm, paraxialNumeric_mm: zParaxialNum, raysTraced: out.length, raysLost: lost };
}
