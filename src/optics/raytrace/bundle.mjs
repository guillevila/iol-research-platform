/**
 * bundle.mjs — generación de haces de rayos sobre la pupila (V1.4).
 *
 * POR QUÉ HACE FALTA ANTES QUE ASFERICIDAD, TILT Y TÓRICO
 * ------------------------------------------------------
 * El haz que V1.1 usa por defecto es **meridional**: rayos a distintas alturas sobre un
 * único plano (y-z). Eso es exacto mientras el sistema tenga **simetría de revolución** —
 * todos los meridianos son idénticos, así que basta muestrear uno.
 *
 * En cuanto entren tilt, descentración o superficies tóricas esa simetría desaparece y un
 * haz meridional deja de representar la pupila: mediría un solo corte de un sistema que ya
 * no es igual en todas direcciones, y lo haría **en silencio**, devolviendo números
 * plausibles. Por eso el muestreo 2D se construye antes que esos sprints, no después.
 *
 * MUESTREOS DISPONIBLES
 * ---------------------
 *   MERIDIONAL          rayos sobre un radio (1D). Válido SOLO con simetría de revolución.
 *   RINGS_EQUAL_AREA    anillos concéntricos con igual ÁREA por anillo, con rayos
 *                       repartidos en cada anillo (2D). El reparto por área es el correcto
 *                       para una métrica promediada sobre la pupila: muestrear alturas
 *                       equiespaciadas sobresampla el centro, que ocupa menos superficie.
 *   FIBONACCI_SPIRAL    espiral de Fibonacci (2D). Cobertura muy uniforme sin privilegiar
 *                       ninguna dirección; útil cuando el sistema no tiene simetría alguna.
 *   SQUARE_GRID         malla cuadrada recortada al círculo (2D). El recorte hace que el
 *                       número real de rayos no coincida con el pedido: se reporta.
 *                       **NO RECOMENDADO** para métricas sensibles al borde de la pupila
 *                       (ver aviso abajo).
 *
 * AVISO MEDIDO SOBRE `SQUARE_GRID`
 * --------------------------------
 * Su recorte circular es dentado: qué rayos del borde entran depende de la resolución de
 * la malla. Como la aberración esférica crece con la cuarta potencia de la altura, la
 * métrica está dominada por los rayos exteriores, y esa frontera irregular hace que el
 * resultado **oscile en lugar de converger**. Medido sobre un ojo normal a pupila 4 mm,
 * la potencia óptima fluctúa ~10⁻² D entre 52 y 812 rayos, mientras que los tres muestreos
 * equiárea convergen monótonamente a 10⁻³ D. Se conserva porque es un muestreo de
 * referencia útil para comparar, pero no debe usarse para decidir.
 *
 * Todos devuelven rayos PARALELOS al eje (objeto en infinito). El número real de rayos
 * SIEMPRE viaja con el haz: una métrica promediada sobre 8 rayos y otra sobre 200 no son
 * comparables, y ocultar el dato invita a compararlas.
 *
 * RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING.
 */
import { assertFinite } from '../../core/units.mjs';

export const SamplingKind = Object.freeze({
  MERIDIONAL: 'MERIDIONAL',
  RINGS_EQUAL_AREA: 'RINGS_EQUAL_AREA',
  FIBONACCI_SPIRAL: 'FIBONACCI_SPIRAL',
  SQUARE_GRID: 'SQUARE_GRID',
});

/** ¿Este muestreo cubre la pupila en 2D, o solo un meridiano? */
export function isTwoDimensional(kind) {
  return kind !== SamplingKind.MERIDIONAL;
}

function validar(radius_mm, n) {
  assertFinite(radius_mm, 'radius_mm');
  if (!(radius_mm > 0)) throw new RangeError(`radio de pupila debe ser > 0; recibido ${radius_mm}`);
  if (!Number.isInteger(n) || n < 2) throw new RangeError(`n debe ser entero ≥ 2; recibido ${n}`);
}

const rayo = (x, y, zStart_mm) => ({ p: [x, y, zStart_mm], d: [0, 0, 1] });

/**
 * Genera un haz sobre la pupila.
 *
 * @param radius_mm   radio de pupila (mm) — PARÁMETRO DECLARADO, no medido
 * @param kind        SamplingKind
 * @param n           número de rayos pedido (anillos, si RINGS_EQUAL_AREA)
 * @param perRing     rayos por anillo en RINGS_EQUAL_AREA
 * @param zStart_mm   z de partida, por delante de la primera superficie
 * @returns {{ rays: Array, kind: string, requested: number, actual: number,
 *             radius_mm: number, twoDimensional: boolean, declared: object }}
 */
export function generateBundle({
  radius_mm,
  kind = SamplingKind.RINGS_EQUAL_AREA,
  n = 6,
  perRing = 6,
  zStart_mm = -10,
} = {}) {
  validar(radius_mm, n);
  if (!Object.values(SamplingKind).includes(kind)) {
    throw new TypeError(`muestreo desconocido: ${kind}. Válidos: ${Object.values(SamplingKind).join(', ')}`);
  }
  const rays = [];

  if (kind === SamplingKind.MERIDIONAL) {
    // alturas equiespaciadas en área sobre un solo radio (plano y-z)
    for (let i = 1; i <= n; i++) rays.push(rayo(0, radius_mm * Math.sqrt(i / n), zStart_mm));

  } else if (kind === SamplingKind.RINGS_EQUAL_AREA) {
    if (!Number.isInteger(perRing) || perRing < 1) throw new RangeError('perRing debe ser entero ≥ 1');
    for (let i = 1; i <= n; i++) {
      const r = radius_mm * Math.sqrt(i / n);
      // desfase por anillo para no alinear todos los rayos en los mismos meridianos
      const off = (Math.PI / perRing) * (i % 2);
      for (let j = 0; j < perRing; j++) {
        const th = off + 2 * Math.PI * j / perRing;
        rays.push(rayo(r * Math.cos(th), r * Math.sin(th), zStart_mm));
      }
    }

  } else if (kind === SamplingKind.FIBONACCI_SPIRAL) {
    const phi = Math.PI * (3 - Math.sqrt(5));          // ángulo áureo
    for (let i = 0; i < n; i++) {
      const r = radius_mm * Math.sqrt((i + 0.5) / n);   // +0.5: sin rayo exactamente axial
      const th = i * phi;
      rays.push(rayo(r * Math.cos(th), r * Math.sin(th), zStart_mm));
    }

  } else {
    // SQUARE_GRID: malla de lado ⌈√(4n/π)⌉ recortada al círculo. El recorte hace que el
    // número real difiera del pedido; se reporta en `actual` en vez de disimularlo.
    const lado = Math.max(2, Math.ceil(Math.sqrt(4 * n / Math.PI)));
    for (let a = 0; a < lado; a++) {
      for (let b = 0; b < lado; b++) {
        const x = radius_mm * (2 * (a + 0.5) / lado - 1);
        const y = radius_mm * (2 * (b + 0.5) / lado - 1);
        if (x * x + y * y <= radius_mm * radius_mm) rays.push(rayo(x, y, zStart_mm));
      }
    }
  }

  if (rays.length < 2) throw new RangeError(`haz degenerado: ${rays.length} rayos`);
  return {
    rays,
    kind,
    requested: n,
    actual: rays.length,
    radius_mm,
    twoDimensional: isTwoDimensional(kind),
    declared: {
      nota: 'radio de pupila y densidad de muestreo son PARÁMETROS DECLARADOS de simulación',
      ...(kind === SamplingKind.RINGS_EQUAL_AREA ? { anillos: n, porAnillo: perRing } : {}),
      ...(kind === SamplingKind.MERIDIONAL
        ? { aviso: 'muestreo 1D: SOLO válido con simetría de revolución' } : {}),
    },
  };
}

/**
 * Fracción de área de pupila que representa cada rayo, si el muestreo fuera perfecto.
 * Sirve para detectar muestreos sesgados: en un muestreo equiárea el histograma radial de
 * los rayos debe ser aproximadamente plano en r².
 */
export function radialUniformity(bundle) {
  const r2 = bundle.rays.map(r => (r.p[0] ** 2 + r.p[1] ** 2) / bundle.radius_mm ** 2);
  r2.sort((a, b) => a - b);
  // en un muestreo equiárea, el k-ésimo r² ordenado ≈ k/n → se mide la desviación máxima
  let maxDesv = 0;
  for (let k = 0; k < r2.length; k++) {
    maxDesv = Math.max(maxDesv, Math.abs(r2[k] - (k + 0.5) / r2.length));
  }
  return { maxDeviation: maxDesv, n: r2.length };
}
