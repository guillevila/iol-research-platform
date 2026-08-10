/**
 * generator.mjs — generador de ojos sintéticos (CAPA F — datos sintéticos declarados).
 *
 * Dos modos, siempre etiquetados `meta.source='synthetic'` y reproducibles:
 *  - gridEyes(spec)          — experimento de rejilla (determinista por construcción)
 *  - randomEyes(n, seed)     — muestreo con PRNG de semilla fija (LCG documentado)
 *
 * Distribuciones: RANGOS UNIFORMES DECLARADOS (no distribuciones poblacionales;
 * la falta de fuente citable está registrada en OPEN_QUESTIONS #5, y los resúmenes
 * agregados de experimentos aleatorios deben leerse condicionalmente).
 *
 * RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING.
 */

/** Rangos por defecto, explícitos y versionados con el código. */
export const DEFAULT_RANGES = Object.freeze({
  al_mm: [21.0, 27.0],
  mean_k_d: [40.0, 47.0],
  cyl_d: [0.0, 4.0],
  acd_mm: [2.6, 4.2],
  lt_mm: [3.6, 5.4],
  cct_um: [480, 620],
  target_d: [-1.5, 0.5],
});

/** LCG idéntico al usado en las campañas del baseline (documentado y testado). */
export function makeRng(seed0) {
  let seed = seed0 >>> 0;
  return () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
}

const round2 = x => Math.round(x * 100) / 100;

/** Rejilla determinista AL × K (esférica) con el resto de parámetros fijados. */
export function gridEyes({ al_mm = [20, 30, 1], mean_k_d = [38, 48, 2], fixed = {} } = {}) {
  const out = [];
  const [a0, a1, da] = al_mm, [k0, k1, dk] = mean_k_d;
  for (let al = a0; al <= a1 + 1e-9; al += da) {
    for (let k = k0; k <= k1 + 1e-9; k += dk) {
      out.push({
        al_mm: round2(al), k1_d: round2(k), k1_axis_deg: 180, k2_d: round2(k), k2_axis_deg: 90,
        acd_mm: fixed.acd_mm ?? 3.2, lt_mm: fixed.lt_mm ?? 4.5, cct_um: fixed.cct_um ?? 550,
        target_d: fixed.target_d ?? 0,
        meta: { source: 'synthetic', kind: 'grid', distribution: 'grid_declared' },
      });
    }
  }
  return out;
}

/** Muestreo aleatorio reproducible dentro de rangos declarados. */
export function randomEyes(n, seed, ranges = DEFAULT_RANGES) {
  const rnd = makeRng(seed);
  const U = ([lo, hi]) => lo + (hi - lo) * rnd();
  const out = [];
  for (let i = 0; i < n; i++) {
    const meanK = U(ranges.mean_k_d), cyl = U(ranges.cyl_d);
    const ax = Math.floor(U([0, 180])); const k1a = ax === 0 ? 180 : ax;
    out.push({
      al_mm: round2(U(ranges.al_mm)),
      k1_d: round2(meanK - cyl / 2), k1_axis_deg: k1a,
      k2_d: round2(meanK + cyl / 2), k2_axis_deg: ((k1a + 90) % 180) === 0 ? 180 : (k1a + 90) % 180,
      acd_mm: round2(U(ranges.acd_mm)), lt_mm: round2(U(ranges.lt_mm)),
      cct_um: Math.round(U(ranges.cct_um)),
      target_d: round2(U(ranges.target_d)),
      meta: { source: 'synthetic', kind: 'random', seed, distribution: 'uniform_declared' },
    });
  }
  return out;
}
