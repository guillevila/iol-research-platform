/**
 * trace.mjs — propagación de rayos a través de un sistema de superficies y
 * búsqueda del mejor foco (mínimo RMS del spot transversal).
 *
 * Unidades internas: milímetros. Sistema = superficies ordenadas por z creciente.
 * RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING.
 */
import { add, scale, isFiniteVec } from './vec3.mjs';
import { intersect, refractDirection } from './surfaces.mjs';
import { bump, WorkUnit } from '../../perf/counters.mjs';

/**
 * Traza un rayo por todas las superficies. Devuelve
 *  { ok:true, ray }  con el rayo de salida, o
 *  { ok:false, reason, at }  si se pierde (sin intersección, apertura, TIR).
 *
 * RENDIMIENTO (V1.14), sin cambio de resultados:
 *  - se eliminó el array `hits` del valor de retorno. Verificado por barrido del repositorio
 *    completo: NINGÚN consumidor lo leía (cero apariciones de `.hits` en src/, tests/ y
 *    experiments/). Construía un objeto por superficie y por rayo — decenas de miles de
 *    objetos efímeros por evaluación — para nada. Si un consumidor futuro necesita la
 *    trayectoria, se añade como opción explícita, no como coste permanente de todos.
 *  - se reutiliza un único objeto cursor en lugar de crear uno por superficie, y se elimina
 *    la copia inicial de ray0: `intersect` y `refractDirection` NO mutan sus entradas
 *    (verificado: operan con add/scale/sub, que devuelven arrays nuevos). El objeto que se
 *    RETORNA sí es nuevo, para que dos rayos del mismo haz jamás compartan identidad.
 * La secuencia de operaciones en coma flotante es la misma, así que la salida es idéntica.
 */
export function traceRay(surfaces, ray0) {
  bump(WorkUnit.RAY_TRACED);
  const cursor = { p: ray0.p, d: ray0.d };
  for (const s of surfaces) {
    const hit = intersect(s, cursor);
    if (!hit) return { ok: false, reason: 'miss_or_aperture', at: s.id || s.kind };
    const r = refractDirection(cursor.d, hit.normal, s.n_before, s.n_after);
    if (r.tir) return { ok: false, reason: 'tir', at: s.id || s.kind };
    cursor.p = hit.point; cursor.d = r.d;
    if (!isFiniteVec(cursor.p) || !isFiniteVec(cursor.d)) return { ok: false, reason: 'nan', at: s.id || s.kind };
  }
  return { ok: true, ray: { p: cursor.p, d: cursor.d } };
}

/**
 * Haz de rayos paralelos al eje (objeto en infinito) a alturas dadas (mm), en pares ±h:
 * 180°-simétrico para que el centroide caiga exactamente en el eje en sistemas
 * coaxiales (ver spotRmsAt) y la métrica por centroide reproduzca la antigua sobre el
 * eje sin cambiar ningún resultado publicado.
 */
export function parallelBundle(heights_mm, zStart_mm = -10) {
  return heights_mm.flatMap(h => [
    { p: [0, h, zStart_mm], d: [0, 0, 1] },
    { p: [0, -h, zStart_mm], d: [0, 0, 1] },
  ]);
}

/**
 * Radio RMS del spot del haz en el plano z (mm), alrededor del CENTROIDE del haz —
 * la definición estándar de tamaño de mancha.
 *
 * CORRECCIÓN V1.3 (defecto latente destapado por exp010): la versión anterior medía
 * alrededor del ORIGEN (el eje z). En sistemas coaxiales con haz simétrico el centroide
 * cae en el eje y ambas definiciones coinciden; con una LIO posada el haz ENTERO está
 * desplazado lateralmente (prisma) y el RMS sobre el eje mezcla ese desplazamiento con
 * el desenfoque: el "mejor foco" resultante era el punto de máximo acercamiento al eje,
 * no un foco — producía separaciones A–C absurdas (~10 D). El desplazamiento del
 * centroide es apuntamiento (el ojo fija moviéndose), no borrosidad.
 */
/**
 * Buffer REUTILIZABLE para las proyecciones de spotRmsAt (V1.14).
 *
 * POR QUÉ. spotRmsAt es el hotspot número uno del motor (22.6 % del tiempo de exp013 en el
 * perfilado, más buena parte del 10 % de recolección de basura): bestFocus la llama ~40 veces
 * por búsqueda, y cada llamada creaba un array nuevo de 2N elementos que moría de inmediato.
 *
 * POR QUÉ NO CAMBIA NINGÚN RESULTADO. El algoritmo sigue siendo de DOS PASADAS con la MISMA
 * aritmética y el MISMO orden de acumulación: primero centroide, después varianza alrededor de
 * él. NO se sustituye por la forma «E[x²] − E[x]²» de una pasada, que sería más rápida pero
 * daría otros bits. Un Float64Array almacena exactamente el mismo double que un array normal.
 */
let scratch = new Float64Array(1024);
function asegurarScratch(n) {
  if (scratch.length < n) {
    let cap = scratch.length;
    while (cap < n) cap *= 2;
    scratch = new Float64Array(cap);
  }
  return scratch;
}

export function spotRmsAt(rays, z_mm) {
  bump(WorkUnit.SPOT_RMS);
  let sx = 0, sy = 0, n = 0;
  const pts = asegurarScratch(2 * rays.length);
  let k = 0;
  for (const r of rays) {
    if (Math.abs(r.d[2]) < 1e-12) continue;
    const t = (z_mm - r.p[2]) / r.d[2];
    const x = r.p[0] + r.d[0] * t, y = r.p[1] + r.d[1] * t;
    pts[k++] = x; pts[k++] = y; sx += x; sy += y; n++;
  }
  if (!n) throw new RangeError('spotRmsAt: sin rayos válidos');
  const cx = sx / n, cy = sy / n;
  let s = 0;
  for (let i = 0; i < k; i += 2) {
    s += (pts[i] - cx) * (pts[i] - cx) + (pts[i + 1] - cy) * (pts[i + 1] - cy);
  }
  return Math.sqrt(s / n);
}

/**
 * Mejor foco: z que minimiza el RMS del spot, por búsqueda de sección áurea.
 * El RMS(z) de un haz de rectas es unimodal en el entorno del foco.
 */
/**
 * Buffer aplanado de rayos para las ~40 evaluaciones que hace una búsqueda de foco (V1.14).
 * Seis dobles por rayo: px, py, pz, dx, dy, dz.
 */
let planos = new Float64Array(6 * 512);
/**
 * Aplana UNA vez los rayos que pasan el filtro de dirección, para que las decenas de
 * evaluaciones de la sección áurea no repitan ni la indirección de propiedades
 * (rayo → array → componente) ni el propio filtro, que no depende de z.
 * Devuelve el número de rayos válidos.
 */
function aplanar(rays) {
  if (planos.length < 6 * rays.length) {
    let cap = planos.length;
    while (cap < 6 * rays.length) cap *= 2;
    planos = new Float64Array(cap);
  }
  let n = 0;
  for (const r of rays) {
    if (Math.abs(r.d[2]) < 1e-12) continue;
    const o = 6 * n;
    planos[o] = r.p[0]; planos[o + 1] = r.p[1]; planos[o + 2] = r.p[2];
    planos[o + 3] = r.d[0]; planos[o + 4] = r.d[1]; planos[o + 5] = r.d[2];
    n++;
  }
  return n;
}
/**
 * RMS del spot alrededor del centroide, sobre el buffer aplanado. Reproduce EXACTAMENTE la
 * aritmética de spotRmsAt: mismas operaciones, mismo orden de acumulación, dos pasadas
 * (centroide y después varianza). No es una fórmula distinta: es la misma con los datos
 * colocados de otro modo, así que devuelve los mismos bits.
 */
function spotRmsPlano(n, z_mm) {
  bump(WorkUnit.SPOT_RMS);
  const pts = asegurarScratch(2 * n);
  let sx = 0, sy = 0, k = 0;
  for (let i = 0; i < n; i++) {
    const o = 6 * i;
    const t = (z_mm - planos[o + 2]) / planos[o + 5];
    const x = planos[o] + planos[o + 3] * t, y = planos[o + 1] + planos[o + 4] * t;
    pts[k++] = x; pts[k++] = y; sx += x; sy += y;
  }
  if (!n) throw new RangeError('spotRmsAt: sin rayos válidos');
  const cx = sx / n, cy = sy / n;
  let s = 0;
  for (let i = 0; i < k; i += 2) {
    s += (pts[i] - cx) * (pts[i] - cx) + (pts[i + 1] - cy) * (pts[i + 1] - cy);
  }
  return Math.sqrt(s / n);
}

export function bestFocus(rays, zLo_mm, zHi_mm, tol_mm = 1e-6) {
  bump(WorkUnit.BEST_FOCUS);
  if (!(zHi_mm > zLo_mm)) throw new RangeError('bestFocus: rango inválido');
  const nv = aplanar(rays);
  if (!nv) throw new RangeError('spotRmsAt: sin rayos válidos');
  const rms = z => spotRmsPlano(nv, z);
  const phi = (Math.sqrt(5) - 1) / 2;
  let a = zLo_mm, b = zHi_mm;
  let c = b - phi * (b - a), d = a + phi * (b - a);
  let fc = rms(c), fd = rms(d);
  let guard = 0;
  while (b - a > tol_mm && guard++ < 200) {
    if (fc < fd) { b = d; d = c; fd = fc; c = b - phi * (b - a); fc = rms(c); }
    else { a = c; c = d; fc = fd; d = a + phi * (b - a); fd = rms(d); }
  }
  const z = (a + b) / 2;
  // Un "mínimo" pegado al borde del bracket no es un mínimo: o el bracket no contiene
  // el foco, o el haz es degenerado (paralelo: RMS constante, la búsqueda deriva hasta
  // un extremo). Devolverlo en silencio produciría un número plausible y falso — mismo
  // patrón que el borde del intervalo del optimizador de potencia.
  const margen = Math.max(2 * tol_mm, (zHi_mm - zLo_mm) * 1e-6);
  if (z - zLo_mm < margen || zHi_mm - z < margen) {
    throw new RangeError(`bestFocus: el mínimo (${z.toFixed(4)} mm) cae en el borde del `
      + `bracket [${zLo_mm.toFixed(3)}, ${zHi_mm.toFixed(3)}] — bracket sin el foco o haz `
      + 'degenerado (¿paralelo?). No se devuelve el borde como foco.');
  }
  return { z_mm: z, rms_mm: spotRmsPlano(nv, z) };
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
