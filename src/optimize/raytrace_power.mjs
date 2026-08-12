/**
 * raytrace_power.mjs — elección de potencia de LIO por TRAZADO DE RAYOS (V1.1, CAPA E).
 *
 * Diferencia esencial con `power_search.mjs` (paraxial): aquí **cada potencia candidata
 * construye su propia geometría** a través de una `IOLFactory` y se traza de verdad. Es
 * el invariante que P0.2 hizo inexpresable de violar: no existe forma de evaluar N
 * potencias sobre una misma lente física.
 *
 * El criterio de "mejor" NO está cableado: llega como `OpticalObjective`. Con pupila real
 * no hay un único foco, así que optimizar sin declarar el criterio sería esconder una
 * decisión (ver `objective.mjs`).
 *
 * Método: la función coste es unimodal y suave en la potencia (el desenfoque es monótono
 * en la potencia; el RMS tiene un mínimo único), así que se localiza el óptimo continuo
 * por sección áurea sobre un intervalo acotado y después se evalúan los escalones reales
 * del catálogo. Se reportan AMBOS: el continuo dice dónde está el óptimo físico, el de
 * catálogo dice qué se puede implantar.
 *
 * RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING.
 */
import { assertFinite } from '../core/units.mjs';
import { buildRaytraceEye } from '../optics/eyebuilder.mjs';
import { ObjectiveKind, evaluateObjective, describeObjective } from '../optics/objective.mjs';
import { generateBundle, SamplingKind, isTwoDimensional } from '../optics/raytrace/bundle.mjs';
import { GenericIOLFactory } from '../core/iol_factory.mjs';
import { hasTraceableGeometry } from '../core/iol.mjs';
import { FidelityMode, DEFAULT_FIDELITY_MODE, assertFidelityMode, StrictModeViolation } from '../core/fidelity.mjs';
import { isIdentityPose } from '../core/pose.mjs';

/**
 * Haz por defecto: MERIDIONAL con alturas equiespaciadas en área.
 *
 * Es exacto mientras el sistema tenga simetría de revolución Y esté centrado. El tilt
 * y la descentración EXISTEN desde V1.3: con pose no nula este optimizador RECHAZA el
 * haz meridional (guarda más abajo) y exige un muestreo 2D (`RINGS_EQUAL_AREA` o
 * `FIBONACCI_SPIRAL`), porque un haz meridional mediría un solo corte de un sistema
 * que ya no es igual en todas las direcciones — y lo haría en silencio. El tórico
 * (V1.6) exigirá además una métrica 2D del spot (ver objective.mjs). Ver `bundle.mjs`.
 */
export function defaultBundle(pupil_radius_mm, n_anillos = 5) {
  return generateBundle({
    radius_mm: pupil_radius_mm, kind: SamplingKind.MERIDIONAL, n: n_anillos,
  }).rays;
}

/**
 * Coste del objetivo para una potencia dada. Construye la lente, monta el ojo trazado y
 * evalúa. Si la geometría resultante no es trazable, FALLA — no se degrada a nada.
 */
function costeDe({ postop, factory, objective, bundle, aperture_mm, cornea, fidelity }) {
  return power_d => {
    const iol = factory.create({ power_d });
    if (!hasTraceableGeometry(iol)) {
      throw new TypeError(
        `RaytracePowerOptimizer: la potencia ${power_d} D no tiene geometría trazable en `
        + `${iol.manufacturer}/${iol.model} (geometry_status=${iol.geometry_status}). `
        + 'Sin ficha de fabricante no se traza: prohibido sustituir por una genérica.');
    }
    const eye = buildRaytraceEye(postop, iol, { aperture_mm, cornea, fidelity });
    const ev = evaluateObjective(eye, bundle, objective);
    return { power_d, iol, eye, ...ev };
  };
}

/** Mínimo de una función unimodal por sección áurea sobre [lo, hi]. */
function seccionAurea(f, lo, hi, tol, maxIter = 200) {
  const phi = (Math.sqrt(5) - 1) / 2;
  let a = lo, b = hi;
  let c = b - phi * (b - a), d = a + phi * (b - a);
  let fc = f(c).cost, fd = f(d).cost;
  let iter = 0;
  while (b - a > tol && iter++ < maxIter) {
    if (fc < fd) { b = d; d = c; fd = fc; c = b - phi * (b - a); fc = f(c).cost; }
    else { a = c; c = d; fc = fd; d = a + phi * (b - a); fd = f(d).cost; }
  }
  return { x: (a + b) / 2, iteraciones: iter };
}

/**
 * Optimiza la potencia por trazado.
 *
 * @param postop       ojo postoperatorio previsto
 * @param factory      IOLFactory (genérica declarada o de fabricante con procedencia)
 * @param objective    ObjectiveKind
 * @param catalog_d    escalones implantables; si se omite, solo se devuelve el continuo
 * @param pupil_mm     diámetro de pupila para el haz (parámetro DECLARADO)
 * @param search_d     [min, max] de potencia donde buscar
 * @param cornea       opciones de política corneal (se propagan al ojo trazado)
 */
export function optimizePowerByRaytrace({
  postop,
  factory = new GenericIOLFactory(),
  objective = ObjectiveKind.EQUIVALENT_DEFOCUS,
  catalog_d = null,
  // sin valor por defecto REAL: se resuelve abajo según el modo. El 3.0 mm de RESEARCH
  // es un parámetro de simulación declarado; en STRICT no hay defecto que valga.
  pupil_mm = null,
  n_anillos = 5,
  sampling = SamplingKind.MERIDIONAL,
  perRing = 6,
  search_d = [0, 40],
  tol_d = 1e-4,
  cornea = {},
  fidelity = DEFAULT_FIDELITY_MODE,
}) {
  assertFidelityMode(fidelity);
  // Un sistema con pose NO tiene simetría de revolución: el muestreo MERIDIONAL mediría
  // un solo corte y lo haría en silencio — la trampa que bundle.mjs documenta desde
  // V1.4. Con pose declarada, el muestreo 2D es obligatorio.
  if (!isIdentityPose(postop.iol_pose) && sampling === SamplingKind.MERIDIONAL) {
    throw new TypeError('optimizePowerByRaytrace: muestreo MERIDIONAL con pose de LIO '
      + 'declarada — un sistema sin simetría de revolución exige muestreo 2D '
      + '(sampling: RINGS_EQUAL_AREA o FIBONACCI_SPIRAL).');
  }
  if (pupil_mm === null || pupil_mm === undefined) {
    if (fidelity === FidelityMode.STRICT) {
      throw new StrictModeViolation('optimizePowerByRaytrace', [
        'pupil_mm: pupila sin especificar — el 3.0 mm por defecto de RESEARCH es un '
        + 'parámetro declarado de simulación, no un dato del ojo; en STRICT debe venir '
        + 'una pupila explícita, idealmente la MEDIDA del preoperatorio',
      ]);
    }
    pupil_mm = 3.0;
  }
  assertFinite(pupil_mm, 'pupil_mm');
  if (!(pupil_mm > 0)) throw new RangeError('pupil_mm debe ser > 0');
  const [lo, hi] = search_d;
  if (!(hi > lo)) throw new RangeError(`rango de búsqueda inválido: [${lo}, ${hi}]`);

  const aperture_mm = pupil_mm / 2;
  const haz = generateBundle({ radius_mm: aperture_mm, kind: sampling, n: n_anillos, perRing });
  const bundle = haz.rays;
  const f = costeDe({ postop, factory, objective, bundle, aperture_mm, cornea, fidelity });

  const { x: exact_power_d } = seccionAurea(f, lo, hi, tol_d);

  // Un óptimo pegado a un extremo del intervalo NO es un óptimo: es el intervalo mal
  // elegido. Devolverlo como si lo fuera produce un número plausible y falso — por
  // ejemplo, un ojo muy largo que necesita 1.5 D "recomendaría" el límite inferior.
  const margen = Math.max(10 * tol_d, (hi - lo) * 1e-3);
  if (exact_power_d - lo < margen || hi - exact_power_d < margen) {
    throw new RangeError(
      `RaytracePowerOptimizer: el óptimo (${exact_power_d.toFixed(4)} D) cae en el borde del `
      + `intervalo de búsqueda [${lo}, ${hi}] D. El óptimo real está fuera: amplía search_d. `
      + 'No se devuelve el borde como recomendación.');
  }

  const enOptimo = f(exact_power_d);

  let best = null, second = null, evaluaciones = null;
  if (catalog_d) {
    if (!Array.isArray(catalog_d) || catalog_d.length === 0) {
      throw new TypeError('catalog_d debe ser un array de potencias implantables');
    }
    // El catálogo debe CONTENER el óptimo: si el óptimo continuo cae fuera de
    // [min, max], el "mejor del catálogo" es un borde, no un óptimo — la misma
    // disciplina que ya se aplicaba a search_d, que faltaba aquí (hallazgo adversarial
    // V1.8: un catálogo lejano recomendaba 3 D con el óptimo en 19.65 D, en silencio).
    const cMin = Math.min(...catalog_d), cMax = Math.max(...catalog_d);
    if (exact_power_d < cMin || exact_power_d > cMax) {
      throw new RangeError(
        `RaytracePowerOptimizer: el óptimo continuo (${exact_power_d.toFixed(4)} D) cae FUERA del `
        + `catálogo [${cMin}, ${cMax}] D: el mejor escalón sería un BORDE, no un óptimo. `
        + 'No se devuelve el borde del catálogo como recomendación.');
    }
    evaluaciones = catalog_d.map(p => {
      const e = f(p);
      return {
        power_d: p, cost: e.cost, residual_d: e.residual_d,
        spotRms_mm: e.spotRms_mm, bestFocus_mm: e.bestFocus_mm,
      };
    }).sort((a, b) => a.cost - b.cost);
    best = evaluaciones[0];
    second = evaluaciones[1] ?? null;
  }

  return {
    engine: 'raytrace',
    objective,
    objective_label: describeObjective(objective),
    exact_power_d,
    at_exact: {
      cost: enOptimo.cost, residual_d: enOptimo.residual_d,
      spotRms_mm: enOptimo.spotRms_mm, bestFocus_mm: enOptimo.bestFocus_mm,
      raysTraced: enOptimo.raysTraced, raysLost: enOptimo.raysLost,
    },
    best,
    second,
    delta_between_top2: second ? second.cost - best.cost : null,
    catalog_evaluations: evaluaciones,
    parametros_declarados: {
      pupil_mm, n_anillos, sampling, rayos: haz.actual,
      muestreo_2d: haz.twoDimensional, search_d, tol_d,
      iol_factory: factory.id,
      is_simulation_surrogate: factory instanceof GenericIOLFactory,
      cornea_policy: enOptimo.eye.cornea_policy,
      cornea_rotationally_symmetric: enOptimo.eye.cornea.rotationally_symmetric,
      fidelity,
      // la pose HONRADA deja rastro: un results.json posado no puede ser indistinguible
      // de uno centrado (no es supuesto — es estado declarado — pero sí trazabilidad);
      // null ≡ PoseSource.DEFAULT_CENTERED (pose no declarada: centrada por defecto)
      pose: postop.iol_pose ?? null,
    },
    // Supuestos de modelado ACTIVOS en el trazado del óptimo (p. ej. asfericidad no
    // documentada trazada como esfera). Sin esto, una recomendación podría salir de un
    // trazado con supuestos registrados que ninguna capa superior llegaría a ver — el
    // relleno tácito volvería por la puerta de atrás.
    supuestos_trazado: enOptimo.eye.assumptions,
    etiqueta: 'SIMULACION / NO GROUND TRUTH CLINICO',
  };
}

/**
 * Compara los objetivos disponibles (A y C) sobre el mismo ojo y la misma pupila. Sirve para cuantificar
 * cuánto depende la recomendación del criterio elegido — que es la pregunta que V1.1 pone
 * sobre la mesa. No decide cuál es mejor.
 */
export function compareObjectives(opciones) {
  const salidas = {};
  for (const kind of Object.values(ObjectiveKind)) {
    salidas[kind] = optimizePowerByRaytrace({ ...opciones, objective: kind });
  }
  const potencias = Object.values(salidas).map(s => s.exact_power_d);
  return {
    por_objetivo: salidas,
    rango_potencia_d: Math.max(...potencias) - Math.min(...potencias),
    etiqueta: 'SIMULACION / NO GROUND TRUTH CLINICO',
    nota: 'Ambos criterios son defendibles; cuál predice mejor exige datos '
      + 'postoperatorios (OPEN_QUESTIONS #8). No se declara ninguno preferible.',
  };
}
