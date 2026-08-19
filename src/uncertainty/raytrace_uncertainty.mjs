/**
 * raytrace_uncertainty.mjs — propagación de incertidumbre a través del TRAZADO (V1.12).
 *
 * NO es un port del Monte Carlo paraxial: es otra arquitectura, elegida para
 * preservar las invariantes del proyecto donde aquel no podía.
 *
 * DIFERENCIAS DE DISEÑO frente a montecarlo.mjs (paraxial, que se conserva como
 * escenario declarado de posición fija):
 *
 *  1. CAUSALIDAD REAL. Aquí la posición de la LIO NO es una entrada perturbada a
 *     mano: cada extracción perturba las MEDIDAS del ojo, re-ejecuta el PREDICTOR de
 *     posición sobre el ojo perturbado, y solo entonces añade el residual PROPIO del
 *     predictor. Si la ACD afecta al predictor, su sigma fluye por el predictor —
 *     nunca se rompe esa dependencia en silencio.
 *  2. SIN DOBLE CONTEO, DECLARADO. La incertidumbre de posición queda DESCOMPUESTA en
 *     dos canales con procedencias distintas: (a) la de las medidas, propagada POR el
 *     predictor; (b) `position_prediction_mm`, el residual del predictor MISMO
 *     (dispersión de ojos con medidas idénticas). La salida declara la descomposición
 *     y advierte: (b) NO debe incluir efectos de medida, o se contaría dos veces.
 *  3. VARIABLES INERTES: PROHIBIDAS POR EJECUCIÓN, no por tabla. Antes de extraer, se
 *     SONDEA cada variable con sigma: se perturba de forma determinista y se comprueba
 *     que el resultado del pipeline CAMBIA. Una sigma sobre una variable que la
 *     configuración actual no consume (K con radios medidos, CCT con córnea de
 *     lectura, ACD con un predictor que no la usa) se RECHAZA nombrándola — su
 *     dispersión habría desaparecido en silencio del resultado.
 *  4. DOS PREGUNTAS, DOS SALIDAS. La incertidumbre del RESULTADO con una LIO FIJA
 *     (distribución del desenfoque residual — continua) y la INESTABILIDAD DE LA
 *     ELECCIÓN de potencia (distribución sobre escalones de catálogo — discreta) son
 *     preguntas distintas y no se mezclan en una cifra.
 *
 * SIGMAS: cada una exige { sd, tipo, provenance } — tipo ∈ {declarada, ficha_tecnica,
 * medida} (plan V1.12) y procedencia ≥ 10 caracteres. Sin fuente real (OQ #6), todo
 * es 'declarada' y el resultado lo dice.
 *
 * CORRELACIONES: por defecto INDEPENDENCIA, declarada como supuesto en la salida. Se
 * acepta una matriz de correlación explícita con procedencia (Cholesky); una matriz
 * no PSD se rechaza.
 *
 * ANCLAS: (a) la extracción de perturbación CERO debe reproducir el caso nominal
 * EXACTAMENTE; (b) para sigmas pequeñas, la sd Monte Carlo debe aproximar la
 * propagación LINEAL gᵀΣg con derivadas por diferencias centradas a través del
 * pipeline COMPLETO (predictor incluido). La desviación entre ambas es un dato
 * (no-linealidad), no un error.
 *
 * LÍMITES DECLARADOS (adversarial V1.12):
 *  - el NOMINAL, la MEDIA y los percentiles absolutos heredan el sesgo de cuadratura
 *    del muestreo de rayos (~O(1/n_anillos), como la media en V1.9); la SD es robusta
 *    a ese sesgo por ser de modo común (verificado: 0.16 % entre n_anillos 4 y 40).
 *    Para valores absolutos convergidos, usa n_anillos alto.
 *  - PAREO DE SEMILLAS: con el mismo seed y el MISMO CONJUNTO de sigmas, dos corridas
 *    reutilizan exactamente los mismos z (comparaciones pareadas); las claves se
 *    ordenan canónicamente, así que el orden de declaración no importa — pero añadir
 *    o quitar una sigma SÍ rompe el pareo.
 *  - con rechazos por plausibilidad, la distribución publicada está CONDICIONADA
 *    (colas truncadas): la salida lo advierte en `advertencia_censura`.
 *
 * RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING.
 * Mientras las distribuciones no procedan de fuentes reales (OQ #6), TODO resultado
 * es SIMULACIÓN de un escenario declarado.
 */
import { assertFinite } from '../core/units.mjs';
import { gaussianSampler } from './montecarlo.mjs';

/**
 * PRNG mulberry32 (LOCAL de este módulo, corrección adversarial V1.12): el LCG de
 * makeRng (synth/generator) infla la varianza de las normales Box-Muller un 1.3–2.8 %
 * según semilla (9–20σ con N=1e6) y tiene correlación serial lag-1 ≈ −0.012 — un sesgo
 * SISTEMÁTICO que se disfrazaría de "no-linealidad" en ratio_mc_sobre_lineal.
 * makeRng NO se toca (los experimentos publicados que lo usan deben seguir
 * reproduciéndose); este módulo usa mulberry32, cuya varianza es sana (test).
 */
function mulberry32(seed0) {
  let a = seed0 >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
import { createPreopEye, createPredictedPostopEye } from '../core/eye.mjs';
import { buildRaytraceEye } from '../optics/eyebuilder.mjs';
import { evaluateObjective, ObjectiveKind } from '../optics/objective.mjs';
import { generateBundle, SamplingKind } from '../optics/raytrace/bundle.mjs';
import { optimizePowerByRaytrace } from '../optimize/raytrace_power.mjs';
import { assertTraceableGeometry, hasToricGeometry } from '../core/iol.mjs';
import { DEFAULT_FIDELITY_MODE, assertFidelityMode } from '../core/fidelity.mjs';

export const ETIQUETA = 'SIMULACION / NO GROUND TRUTH CLINICO — sigmas de escenario declarado (OQ #6)';

export const SigmaTipo = Object.freeze({
  DECLARADA: 'declarada',           // parámetro de simulación elegido por el analista
  FICHA_TECNICA: 'ficha_tecnica',   // repetibilidad citada de un dispositivo
  MEDIDA: 'medida',                 // estimada de datos propios (exige dataset citable)
});

/**
 * Procedencia de la pupila del ESCENARIO frente a la pupila MEDIDA del ojo (homónimos,
 * no el mismo dato — registro de reservados, reincidencia V1.7/V1.8): si el ojo trae
 * pupil_mm medida, se REGISTRA que el trazado no la usa; jamás se calla.
 */
function procedenciaDePupila(preop, escenario_mm) {
  const medida = typeof preop.pupil_mm === 'number' ? preop.pupil_mm : null;
  return {
    escenario_mm,
    medida_preop_mm: medida,
    nota: medida !== null
      ? 'el ojo trae pupil_mm MEDIDA, pero la apertura del trazado es la del ESCENARIO '
        + 'declarado (parametros_declarados.pupil_mm) — dato medido REGISTRADO y no '
        + 'consumido (la ruta preop.pupil_mm → apertura sigue sin decidirse; registro de reservados)'
      : 'pupila de ESCENARIO declarado; el ojo no trae pupil_mm medida',
  };
}

/**
 * Procedencia de la POSICIÓN, transportada hasta la salida (V1.11, hallazgo adversarial):
 * antes solo viajaba `predictor.id`, así que un resultado que dependía de una HIPÓTESIS no
 * validada (p. ej. H_EQ) era indistinguible de uno que no — y la puerta de fidelidad deja
 * la posición fuera de STRICT justamente porque «su procedencia viaja aparte». Si viaja
 * aparte, tiene que viajar de verdad: `hypothesis` no nulo es una marca LEGIBLE POR MÁQUINA
 * de que el número publicado es condicional a una hipótesis biológica sin validar.
 */
function procedenciaDePosicion(prediccion, predictor) {
  const hipotesis = prediccion.hypothesis ?? null;
  return {
    predictor: predictor.id,
    position_source: prediccion.source,
    inputs_used: prediccion.inputs_used,
    hypothesis: hipotesis,
    condicional_a_hipotesis: hipotesis !== null,
    nota: hipotesis !== null
      ? `TODO resultado de esta salida es CONDICIONAL a la hipótesis ${hipotesis}, que NO está `
        + 'validada: la posición postoperatoria no está medida, es PREDICHA bajo esa hipótesis. '
        + 'Validarla exige posición de LIO medida en cohorte postoperatoria (nivel 3).'
      : 'el predictor no declara hipótesis biológica (su procedencia está en position_source); '
        + 'la posición sigue siendo PREDICHA, nunca medida',
  };
}

/** Campos del ojo perturbables (más el canal especial position_prediction_mm). */
export const PERTURBABLES = Object.freeze([
  'al_mm', 'k_d', 'acd_mm', 'lt_mm', 'cct_um', 'r_anterior_mm', 'r_posterior_mm', 'pupil_mm',
  'position_prediction_mm',
]);

export const DrawRejection = Object.freeze({
  PLAUSIBILITY: 'plausibility',       // la extracción cae fuera de rangos del modelo de ojo
  PREDICTOR: 'predictor',             // el predictor no pudo predecir el ojo perturbado
  TRACE: 'trace',                     // el trazado falló (bracket, pérdidas, borde)
  OTHER: 'other',
});
// NOTA de diseño (corrección durante V1.12): una elección que cae en el borde de la
// ventana NO es una extracción inválida — es un resultado CENSURADO Y CONOCIDO ("el
// óptimo salió de la ventana"). Tratarlo como rechazo sesgaría las fracciones al
// truncar precisamente las extracciones extremas: viaja como categoría VISIBLE
// (`fuera_de_ventana`) dentro del mismo denominador.

function clasificaRechazo(err) {
  const m = String(err?.message ?? err);
  if (/fuera de \[|debe ser|plausib|no finito/i.test(m)) return DrawRejection.PLAUSIBILITY;
  if (/predictor|requiere acd_mm|falta /i.test(m)) return DrawRejection.PREDICTOR;
  if (/bestFocus|bracket|haz insuficiente|rayos perdidos|borde del intervalo|FUERA del catálogo/i.test(m)) return DrawRejection.TRACE;
  return DrawRejection.OTHER;
}

/** Valida el juego de sigmas: cada entrada con sd/tipo/procedencia; claves conocidas. */
function validarSigmas(sigmas) {
  if (!sigmas || typeof sigmas !== 'object' || Object.keys(sigmas).length === 0) {
    throw new TypeError('raytrace_uncertainty: `sigmas` obligatorio y no vacío — sin sigmas '
      + 'declaradas no hay incertidumbre que propagar');
  }
  const desconocidas = Object.keys(sigmas).filter(k => !PERTURBABLES.includes(k));
  if (desconocidas.length > 0) {
    throw new TypeError(`raytrace_uncertainty: sigmas sobre variables desconocidas: `
      + `${desconocidas.join(', ')}. Perturbables: ${PERTURBABLES.join(', ')}`);
  }
  const out = {};
  for (const [k, v] of Object.entries(sigmas)) {
    if (!v || typeof v !== 'object' || typeof v.sd !== 'number' || !Number.isFinite(v.sd) || v.sd < 0) {
      throw new TypeError(`sigma ${k}: se exige { sd ≥ 0, tipo, provenance } — un número suelto `
        + 'no dice de dónde sale');
    }
    if (!Object.values(SigmaTipo).includes(v.tipo)) {
      throw new TypeError(`sigma ${k}: tipo obligatorio ∈ {${Object.values(SigmaTipo).join(', ')}}`);
    }
    if (typeof v.provenance !== 'string' || v.provenance.trim().length < 10) {
      throw new TypeError(`sigma ${k}: provenance obligatoria (≥ 10 caracteres): ninguna `
        + 'incertidumbre existe sin procedencia explícita');
    }
    // una sigma que se declara de FICHA TÉCNICA o MEDIDA afirma algo sobre el MUNDO:
    // exige una cita sustancial (dispositivo/documento/dataset identificable), no una
    // etiqueta — endurecimiento estructural, no convención (adversarial V1.12)
    if (v.tipo !== SigmaTipo.DECLARADA && v.provenance.trim().length < 30) {
      throw new TypeError(`sigma ${k}: tipo '${v.tipo}' exige una cita sustancial (≥ 30 caracteres, `
        + 'identificando dispositivo/documento/dataset), no una etiqueta');
    }
    if (v.sd > 0) out[k] = { sd: v.sd, tipo: v.tipo, provenance: v.provenance };
  }
  if (Object.keys(out).length === 0) {
    throw new TypeError('raytrace_uncertainty: todas las sigmas son 0 — nada que propagar');
  }
  return out;
}

/** Cholesky de la matriz de correlación declarada (rechaza no-PSD y asimetrías). */
function choleskyDeCorrelacion(claves, correlacion) {
  const n = claves.length;
  const M = claves.map((a, i) => claves.map((b, j) => {
    if (i === j) return 1;
    const v = correlacion.matrix?.[a]?.[b] ?? correlacion.matrix?.[b]?.[a] ?? 0;
    const vT = correlacion.matrix?.[b]?.[a] ?? correlacion.matrix?.[a]?.[b] ?? 0;
    if (v !== vT) throw new TypeError(`correlación asimétrica entre ${a} y ${b}`);
    if (!Number.isFinite(v) || Math.abs(v) > 1) throw new RangeError(`correlación ${a}↔${b} fuera de [−1, 1]`);
    return v;
  }));
  const L = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = M[i][j];
      for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      if (i === j) {
        if (s <= 0) {
          throw new RangeError('matriz de correlación no definida positiva: no describe '
            + 'ninguna distribución conjunta real — revisa los coeficientes');
        }
        L[i][j] = Math.sqrt(s);
      } else {
        L[i][j] = s / L[j][j];
      }
    }
  }
  return L;
}

/**
 * Aplica un vector de perturbaciones a las MEDIDAS del preoperatorio.
 *
 * El ojo perturbado conserva TODOS los campos del original (corrección adversarial
 * V1.12: la primera versión reconstruía solo un subconjunto y perdía 11 campos
 * medidos con delta CERO — un predictor legítimo que consumiera wtw_mm reventaba
 * aunque el ojo lo tuviera, y los supuestos publicados omitían la nota de toricidad
 * posterior medida: supuestos FALSOS del caso, el patrón que este módulo prohíbe).
 */
function preopPerturbado(preop, delta) {
  // Copia GENÉRICA del ojo COMPLETO (adversarial V1.12, dos iteraciones): la versión
  // enumerada perdía 11 campos medidos — un predictor legítimo que consumiera wtw_mm
  // reventaba y los supuestos publicados afirmaban "no medido" sobre datos medidos.
  // No se enumeran campos: lo que el modelo almacene, viaja; solo se SUMAN los deltas
  // de las variables perturbadas. createPreopEye re-valida el resultado completo, así
  // que un delta que saque un campo de plausibilidad falla explícito (rechazo contado).
  const { kind, mean_k_d, cornea, meta, ...campos } = preop;
  const c = Object.fromEntries(Object.entries(cornea ?? {}).filter(([, v]) => v !== null && v !== undefined));
  if (typeof c.r_anterior_mm === 'number') c.r_anterior_mm += delta.r_anterior_mm ?? 0;
  if (typeof c.r_posterior_mm === 'number') c.r_posterior_mm += delta.r_posterior_mm ?? 0;
  const mas = (v, d) => (typeof v === 'number' ? v + (d ?? 0) : v);
  return createPreopEye({
    ...campos,
    al_mm: preop.al_mm + (delta.al_mm ?? 0),
    k1_d: preop.k1_d + (delta.k_d ?? 0),
    k2_d: preop.k2_d + (delta.k_d ?? 0),
    acd_mm: mas(preop.acd_mm, delta.acd_mm),
    lt_mm: mas(preop.lt_mm, delta.lt_mm),
    cct_um: mas(preop.cct_um, delta.cct_um),
    cornea: c,
    meta,
  });
}

/**
 * Pipeline determinista de UNA configuración (la unidad que las extracciones repiten):
 * medidas → predictor → (+ residual de posición) → ojo trazado → desenfoque residual
 * de la LIO FIJA. Se usa también para las sondas de inercia y las derivadas del ancla
 * lineal — la MISMA función, sin variantes ocultas.
 */
function residualConLenteFija({ preop, delta, predictor, iol, pupil_mm, sampling, cornea, fidelity, objective }) {
  const pre = preopPerturbado(preop, delta);
  const pos = predictor.predict(pre);
  const postop = createPredictedPostopEye(pre, {
    iol_position_mm: pos.iol_position_mm + (delta.position_prediction_mm ?? 0),
    position_source: pos.source,
  });
  // pupil_mm perturbable DE VERDAD (corrección adversarial V1.12: figuraba en
  // PERTURBABLES pero su delta no se aplicaba en ningún sitio — canal fantasma que
  // moría siempre en la sonda con un mensaje que desorientaba)
  const pupilaDraw = pupil_mm + (delta.pupil_mm ?? 0);
  if (!(pupilaDraw > 0)) throw new RangeError(`pupil_mm perturbada no positiva: ${pupilaDraw}`);
  const eye = buildRaytraceEye(postop, iol, { cornea, fidelity, aperture_mm: pupilaDraw / 2 + 0.5 });
  const bundle = generateBundle({
    radius_mm: pupilaDraw / 2, kind: sampling.kind, n: sampling.n_anillos, perRing: sampling.perRing ?? 6,
  });
  const ev = evaluateObjective(eye, bundle.rays, objective);
  return { residual_d: ev.residual_d, eye, iol_position_mm: postop.iol_position_mm };
}

/**
 * SONDA DE INERCIA: perturba UNA variable de forma determinista y comprueba que el
 * pipeline responde. Si el resultado no cambia EN NADA, la sigma es inerte para esta
 * configuración y se rechaza nombrándola. Verificación POR EJECUCIÓN: no depende de
 * ninguna tabla de consumo que pueda quedarse rancia.
 */
function sondearInercia({ claves, sigmas, ctx, nominal }) {
  const evalua = (k, paso) => {
    try {
      return {
        arriba: residualConLenteFija({ ...ctx, delta: { [k]: +paso } }).residual_d,
        abajo: residualConLenteFija({ ...ctx, delta: { [k]: -paso } }).residual_d,
      };
    } catch (err) {
      // el error viene de la SONDA, no del ojo del usuario: se nombra la sonda y la
      // sigma (adversarial V1.12: antes escapaba un RangeError de plausibilidad crudo
      // sobre un valor que el usuario nunca introdujo)
      throw new RangeError(`sonda de inercia de la sigma ${k}: perturbar ±${paso} sacó el caso del `
        + `rango plausible del modelo (${String(err.message).split('\n')[0]}). Una sd de ese tamaño `
        + 'produciría mayoritariamente extracciones rechazadas: revisa unidades o magnitud.');
    }
  };
  for (const k of claves) {
    const paso = sigmas[k].sd;
    const r = evalua(k, paso);
    if (r.arriba !== nominal.residual_d || r.abajo !== nominal.residual_d) continue;
    // ±sd no movió ningún float: distinguir INERCIA (la configuración no consume la
    // variable) de SUB-RESOLUCIÓN (la consume, pero la sd es demasiado pequeña para
    // alterar el resultado). El paso de contraste debe ser GRANDE pero PLAUSIBLE:
    // salir del rango del validador no prueba consumo óptico (el validador no es el
    // modelo) — se prueban pasos canónicos por variable, de mayor a menor, y se usa
    // el primero que el modelo acepte (adversarial V1.12, dos iteraciones).
    const CANONICOS = {
      al_mm: 0.2, k_d: 0.5, acd_mm: 0.2, lt_mm: 0.15, cct_um: 25,
      r_anterior_mm: 0.1, r_posterior_mm: 0.1, pupil_mm: 0.5, position_prediction_mm: 0.2,
    };
    const candidatos = [...new Set([CANONICOS[k] ?? 0.1, paso * 1e4, paso * 100, paso * 10])]
      .sort((a, b) => b - a);
    let respondeConPasoGrande = false, pasoProbado = null;
    for (const pg of candidatos) {
      try {
        const g = evalua(k, pg);
        pasoProbado = pg;
        respondeConPasoGrande = g.arriba !== nominal.residual_d || g.abajo !== nominal.residual_d;
        break;
      } catch { /* paso fuera de plausibilidad o trazado imposible: probar uno menor */ }
    }
    if (respondeConPasoGrande) {
      throw new RangeError(`sigma ${k}: SUB-RESOLUCIÓN — la configuración SÍ consume la variable `
        + `(un paso ${pasoProbado} la mueve), pero ±${paso} no altera ningún resultado en coma `
        + 'flotante: su contribución al Monte Carlo sería exactamente cero. Se rechaza en lugar '
        + 'de fingirse propagada; revisa las unidades de la sd.');
    }
    throw new RangeError(`sigma ${k}: VARIABLE INERTE en esta configuración — ni ±${paso} ni un paso `
      + `de contraste${pasoProbado !== null ? ` (${pasoProbado})` : ''} la mueven (p. ej. K con radios `
      + 'medidos, CCT con córnea de lectura, ACD con un predictor que no la consume). Su dispersión '
      + 'desaparecería en silencio: se rechaza en lugar de fingirse propagada.');
  }
}

/** Percentil por interpolación lineal (misma convención declarada que bench/divergence). */
function percentilLineal(ordenados, p) {
  if (ordenados.length === 0) return null;
  if (ordenados.length === 1) return ordenados[0];
  const idx = (ordenados.length - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return lo === hi ? ordenados[lo] : ordenados[lo] + (ordenados[hi] - ordenados[lo]) * (idx - lo);
}

function estadisticas(valores) {
  const v = [...valores].sort((a, b) => a - b);
  const n = v.length;
  const media = v.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - media) ** 2, 0) / n);
  return {
    n, media_d: media, sd_d: sd,
    se_media_d: sd / Math.sqrt(n),
    percentiles_d: {
      p5: percentilLineal(v, 0.05), p25: percentilLineal(v, 0.25), p50: percentilLineal(v, 0.5),
      p75: percentilLineal(v, 0.75), p95: percentilLineal(v, 0.95),
    },
    min_d: v[0], max_d: v[n - 1],
  };
}

/** Maquinaria común: validación, sondas, extractor correlacionado y contabilidad. */
function prepara({ preop, predictor, sigmas, correlacion = null, n, seed, pupil_mm, sampling, cornea, fidelity }) {
  assertFidelityMode(fidelity);
  if (!Number.isInteger(seed)) throw new TypeError('seed entera obligatoria (reproducibilidad)');
  if (!Number.isInteger(n) || n < 10) throw new TypeError('n ≥ 10 obligatorio');
  if (!predictor?.predict) throw new TypeError('predictor de posición OBLIGATORIO: la causalidad '
    + 'medida→posición pasa por él (no se acepta una posición fija perturbada a mano)');
  assertFinite(pupil_mm, 'pupil_mm');   // sin defecto silencioso: la pupila se declara
  if (!sampling || !Object.values(SamplingKind).includes(sampling.kind) || !Number.isFinite(sampling.n_anillos)) {
    throw new TypeError('sampling OBLIGATORIO ({ kind, n_anillos })');
  }
  const S = validarSigmas(sigmas);
  // claves en ORDEN CANÓNICO (adversarial V1.12): con el mismo seed y el MISMO
  // CONJUNTO de sigmas, dos corridas reutilizan exactamente los mismos z — pareo
  // deseable para comparaciones — y ese pareo no debe depender del orden de
  // declaración del objeto. Añadir o quitar una clave SÍ rompe el pareo (documentado).
  const claves = Object.keys(S).sort();
  let L = null, declaracionCorrelacion;
  if (correlacion !== null) {
    if (typeof correlacion.provenance !== 'string' || correlacion.provenance.trim().length < 10) {
      throw new TypeError('correlacion.provenance obligatoria: una dependencia asumida también '
        + 'exige procedencia');
    }
    L = choleskyDeCorrelacion(claves, correlacion);
    declaracionCorrelacion = { matrix: correlacion.matrix, provenance: correlacion.provenance };
  } else {
    declaracionCorrelacion = 'INDEPENDENCIA asumida entre todas las entradas perturbadas — '
      + 'supuesto DECLARADO del escenario, no una propiedad medida';
  }
  const gauss = gaussianSampler(mulberry32(seed));
  const extrae = () => {
    const z = claves.map(() => gauss(0, 1));
    const delta = {};
    claves.forEach((k, i) => {
      let zi = z[i];
      if (L) { zi = 0; for (let j = 0; j <= i; j++) zi += L[i][j] * z[j]; }
      delta[k] = zi * S[k].sd;
    });
    return delta;
  };
  return { S, claves, L, declaracionCorrelacion, extrae };
}

const NOTA_POSICION = 'DESCOMPOSICIÓN DE LA POSICIÓN (contra el doble conteo): la varianza de '
  + 'posición tiene dos canales con procedencia distinta — (a) las MEDIDAS propagadas POR el '
  + 'predictor (al_mm/acd_mm/… según sus inputs_used) y (b) position_prediction_mm, el residual '
  + 'del PREDICTOR con medidas idénticas. (b) NO debe incluir efectos de medida: si su sigma se '
  + 'estimó de datos que también varían en medidas, se contaría dos veces.';

function marcadorToric(preop, iol) {
  const astigmatico = Math.abs(preop.k1_d - preop.k2_d) > 1e-9;
  if (hasToricGeometry(iol)) {
    throw new TypeError('raytrace_uncertainty: LIO con geometría TÓRICA — los objetivos escalares '
      + 'no la representan (V1.6/V1.8) y esta propagación tampoco: dimensión no soportada, se '
      + 'rechaza en lugar de publicar un cero físico.');
  }
  return astigmatico
    ? {
      unsupported_dimensions: ['toric'],
      nota_toric: 'el caso es ASTIGMÁTICO y este análisis propaga solo el equivalente esférico '
        + '(colapso registrado en supuestos_trazado): la dimensión tórica NO está calculada — '
        + 'no es un cero físico',
    }
    : { unsupported_dimensions: [] };
}

/**
 * PREGUNTA 1 · Incertidumbre del RESULTADO con una LIO FIJA.
 * Distribución del desenfoque residual (objetivo C) de la lente dada, bajo las sigmas
 * declaradas, con causalidad medida→predictor→posición.
 */
export function raytraceOutcomeUncertainty({
  preop, iol, predictor, sigmas, correlacion = null, n, seed,
  pupil_mm, sampling, cornea = {}, fidelity = DEFAULT_FIDELITY_MODE,
  objective = ObjectiveKind.EQUIVALENT_DEFOCUS,
  ...resto
} = {}) {
  const desconocidas = Object.keys(resto);
  if (desconocidas.length > 0) {
    throw new TypeError(`raytraceOutcomeUncertainty: parámetros no soportados: ${desconocidas.join(', ')}`);
  }
  assertTraceableGeometry(iol, 'raytraceOutcomeUncertainty');
  const toric = marcadorToric(preop, iol);   // rechaza LIO tórica ANTES de trazar nada
  if (objective !== ObjectiveKind.EQUIVALENT_DEFOCUS) {
    throw new TypeError('raytraceOutcomeUncertainty: solo el objetivo C (desenfoque equivalente) '
      + 'produce una distribución en DIOPTRÍAS; el objetivo A daría mm de spot bajo el mismo '
      + 'nombre (unidades mezcladas, prohibido en V1.8).');
  }
  const prep = prepara({ preop, predictor, sigmas, correlacion, n, seed, pupil_mm, sampling, cornea, fidelity });
  const ctx = { preop, predictor, iol, pupil_mm, sampling, cornea, fidelity, objective };
  const prediccionNominal = predictor.predict(preop);

  // NOMINAL (perturbación cero): fija los supuestos y aplica la puerta de fidelidad
  const nominal = residualConLenteFija({ ...ctx, delta: {} });
  // ANCLA NOMINAL: la extracción de perturbación cero debe reproducirlo EXACTAMENTE
  const anclaCero = residualConLenteFija({ ...ctx, delta: Object.fromEntries(prep.claves.map(k => [k, 0])) });
  const ancla_nominal_exacta = Object.is(anclaCero.residual_d, nominal.residual_d);

  // SONDAS DE INERCIA (por ejecución, antes de gastar extracciones)
  sondearInercia({ claves: prep.claves, sigmas: prep.S, ctx, nominal });

  // ANCLA LINEAL: derivadas por diferencias centradas a través del pipeline COMPLETO
  const derivadas = {};
  for (const k of prep.claves) {
    const h = prep.S[k].sd;
    const up = residualConLenteFija({ ...ctx, delta: { [k]: +h } }).residual_d;
    const dn = residualConLenteFija({ ...ctx, delta: { [k]: -h } }).residual_d;
    derivadas[k] = (up - dn) / (2 * h);
  }
  // gᵀΣg (Σ = D·C·D con C la correlación declarada o identidad)
  let varLineal = 0;
  prep.claves.forEach((a, i) => prep.claves.forEach((b, j) => {
    let rho = i === j ? 1 : 0;
    if (prep.L) { rho = 0; for (let k = 0; k <= Math.min(i, j); k++) rho += prep.L[i][k] * prep.L[j][k]; }
    varLineal += derivadas[a] * prep.S[a].sd * rho * derivadas[b] * prep.S[b].sd;
  }));
  const sdLineal = Math.sqrt(Math.max(0, varLineal));

  // EXTRACCIONES
  const residuales = [];
  const motivos = {};
  let rechazadas = 0;
  for (let i = 0; i < n; i++) {
    const delta = prep.extrae();
    try {
      residuales.push(residualConLenteFija({ ...ctx, delta }).residual_d);
    } catch (err) {
      rechazadas++;
      const motivo = clasificaRechazo(err);
      motivos[motivo] = (motivos[motivo] ?? 0) + 1;
    }
  }
  if (residuales.length < Math.max(10, n * 0.5)) {
    throw new RangeError(`Monte Carlo degenerado: ${residuales.length}/${n} extracciones válidas `
      + `(motivos: ${JSON.stringify(motivos)})`);
  }
  // CENSURA (adversarial V1.12): con rechazos por plausibilidad, la distribución
  // publicada está CONDICIONADA a la región plausible — las colas truncadas sesgan la
  // sd a la baja y contaminan el ratio MC/lineal. No se calla: se advierte con nombre.
  const advertenciaCensura = rechazadas > 0
    ? `distribución CONDICIONADA: ${rechazadas} extracción(es) rechazada(s) `
      + `(${JSON.stringify(motivos)}) quedan fuera del numerador — las colas están truncadas, `
      + 'la sd publicada está sesgada A LA BAJA respecto del escenario declarado, y parte de la '
      + 'desviación del ratio MC/lineal es censura, no no-linealidad'
    : null;
  // CONVERGENCIA: la estimación en n/4, n/2 y n, con su error estándar
  const cortes = [Math.floor(residuales.length / 4), Math.floor(residuales.length / 2), residuales.length]
    .filter(m => m >= 10);
  const convergencia = cortes.map(m => {
    const e = estadisticas(residuales.slice(0, m));
    return { n: m, media_d: e.media_d, sd_d: e.sd_d, se_media_d: e.se_media_d };
  });
  const dist = estadisticas(residuales);

  return {
    pregunta: 'incertidumbre del RESULTADO con LIO FIJA (distribución del desenfoque residual)',
    seed,
    n_intentados: n,
    n_validos: residuales.length,
    n_rechazados: rechazadas,
    motivos_rechazo: motivos,
    advertencia_censura: advertenciaCensura,
    procedencia_posicion: procedenciaDePosicion(prediccionNominal, predictor),
    nominal: {
      residual_d: nominal.residual_d,
      iol_position_mm: nominal.iol_position_mm,
      supuestos_trazado: nominal.eye.assumptions,
      cornea_policy: nominal.eye.cornea_policy,
    },
    ancla_nominal_exacta,
    distribucion: dist,
    convergencia: {
      cortes: convergencia,
      delta_sd_ultimo_corte_d: convergencia.length >= 2
        ? Math.abs(convergencia[convergencia.length - 1].sd_d - convergencia[convergencia.length - 2].sd_d)
        : null,
      nota: 'los cortes son PREFIJOS ANIDADOS de la misma secuencia: garantizan la estabilidad '
        + 'del estimador acumulado a lo largo de UNA corrida (condición necesaria), no la '
        + 'varianza entre réplicas — para eso, corre con semillas independientes (adversarial '
        + 'V1.12: el delta entre prefijos subestima la varianza real del estimador ~√3)',
    },
    ancla_lineal: {
      sd_lineal_d: sdLineal,
      ratio_mc_sobre_lineal: sdLineal > 0 ? dist.sd_d / sdLineal : null,
      derivadas_d_por_unidad: derivadas,
      nota: 'derivadas por diferencias centradas (paso = sd) a través del pipeline COMPLETO, '
        + 'predictor incluido. Un ratio ≉ 1 documenta no-linealidad del sistema'
        + (rechazadas > 0 ? ' — Y aquí también CENSURA (hay extracciones rechazadas): ver advertencia_censura' : '')
        + ', no un error.',
    },
    sigmas_declaradas: Object.entries(prep.S).map(([k, v]) => ({ variable: k, ...v })),
    correlaciones: prep.declaracionCorrelacion,
    descomposicion_posicion: NOTA_POSICION,
    parametros_declarados: {
      pupil_mm, sampling: { ...sampling }, objective,
      predictor: predictor.id, predictor_inputs: prediccionNominal.inputs_used,
      iol: `${iol.manufacturer}/${iol.model} (${iol.geometry_status})`,
      fidelity,
    },
    pupila: procedenciaDePupila(preop, pupil_mm),
    ...toric,
    etiqueta: ETIQUETA,
  };
}

/**
 * PREGUNTA 2 · INESTABILIDAD DE LA ELECCIÓN de potencia (distribución DISCRETA sobre
 * escalones de catálogo). No es la sd del resultado: una elección puede ser estable
 * con resultado incierto, y viceversa.
 *
 * Coste acotado por diseño: cada extracción evalúa los escalones del catálogo dentro
 * de una VENTANA declarada alrededor de la elección nominal. Si el mejor escalón de
 * una extracción cae en el BORDE, el resultado es CENSURADO Y CONOCIDO — "la elección
 * salió de la ventana" — y viaja como categoría VISIBLE (`fuera_de_ventana`) en el
 * mismo denominador: descartarlo truncaría las extracciones extremas y sesgaría las
 * fracciones. Ampliar la ventana es decisión del llamante, no un relleno del módulo.
 */
export function raytraceChoiceStability({
  preop, factory, predictor, sigmas, correlacion = null, n, seed,
  pupil_mm, sampling, catalog_d, window_d, search_d,
  cornea = {}, fidelity = DEFAULT_FIDELITY_MODE,
  ...resto
} = {}) {
  const desconocidas = Object.keys(resto);
  if (desconocidas.length > 0) {
    throw new TypeError(`raytraceChoiceStability: parámetros no soportados: ${desconocidas.join(', ')}`);
  }
  if (!factory?.create) throw new TypeError('factory OBLIGATORIA (la elección es entre lentes que ella produce)');
  if (!Array.isArray(catalog_d) || catalog_d.length < 2) throw new TypeError('catalog_d con ≥ 2 escalones obligatorio');
  assertFinite(window_d, 'window_d');
  if (!Array.isArray(search_d) || search_d.length !== 2) throw new TypeError('search_d [min, max] obligatorio');
  const prep = prepara({ preop, predictor, sigmas, correlacion, n, seed, pupil_mm, sampling, cornea, fidelity });

  // ELECCIÓN NOMINAL: el optimizador completo, con todas sus guardas
  const posNominal = predictor.predict(preop);
  const postopNominal = createPredictedPostopEye(preop, {
    iol_position_mm: posNominal.iol_position_mm, position_source: posNominal.source,
  });
  const nominalRun = optimizePowerByRaytrace({
    postop: postopNominal, factory, catalog_d, pupil_mm,
    sampling: sampling.kind, n_anillos: sampling.n_anillos, perRing: sampling.perRing ?? 6,
    search_d, cornea, fidelity,
  });
  const eleccionNominal = nominalRun.best.power_d;
  const ventana = catalog_d.filter(p => Math.abs(p - eleccionNominal) <= window_d + 1e-9)
    .sort((a, b) => a - b);
  if (ventana.length < 3) {
    throw new RangeError(`raytraceChoiceStability: la ventana ±${window_d} D alrededor de `
      + `${eleccionNominal} D contiene solo ${ventana.length} escalones — amplíala o densifica el catálogo`);
  }

  // sondas de inercia sobre el MISMO pipeline de elección (lente nominal fija como
  // referencia del residual: la inercia es propiedad de la configuración, no de la lente)
  const iolNominal = factory.create({ power_d: eleccionNominal });
  const ctxSonda = {
    preop, predictor, iol: iolNominal, pupil_mm, sampling, cornea, fidelity,
    objective: ObjectiveKind.EQUIVALENT_DEFOCUS,
  };
  const nominalSonda = residualConLenteFija({ ...ctxSonda, delta: {} });
  sondearInercia({ claves: prep.claves, sigmas: prep.S, ctx: ctxSonda, nominal: nominalSonda });

  // EXTRACCIONES: elegir el mejor escalón DE LA VENTANA en cada ojo perturbado
  const elecciones = new Map();
  const motivos = {};
  let decididas = 0, fueraDeVentana = 0, rechazadas = 0;
  const lentes = new Map(ventana.map(p => [p, factory.create({ power_d: p })]));
  const bundleNominal = generateBundle({
    radius_mm: pupil_mm / 2, kind: sampling.kind, n: sampling.n_anillos, perRing: sampling.perRing ?? 6,
  });
  for (let i = 0; i < n; i++) {
    const delta = prep.extrae();
    // pupil_mm perturbada TAMBIÉN aquí (adversarial V1.12): la sonda de inercia corre
    // sobre residualConLenteFija, que sí la consume — si este bucle la ignorase, la
    // sigma pasaría la sonda y luego moriría en silencio (canal fantasma en la elección)
    const pupilaDraw = pupil_mm + (delta.pupil_mm ?? 0);
    if (!(pupilaDraw > 0)) { rechazadas++; motivos[DrawRejection.PLAUSIBILITY] = (motivos[DrawRejection.PLAUSIBILITY] ?? 0) + 1; continue; }
    const bundle = delta.pupil_mm === undefined ? bundleNominal : generateBundle({
      radius_mm: pupilaDraw / 2, kind: sampling.kind, n: sampling.n_anillos, perRing: sampling.perRing ?? 6,
    });
    try {
      const pre = preopPerturbado(preop, delta);
      const pos = predictor.predict(pre);
      const postop = createPredictedPostopEye(pre, {
        iol_position_mm: pos.iol_position_mm + (delta.position_prediction_mm ?? 0),
        position_source: pos.source,
      });
      let mejor = null;
      for (const p of ventana) {
        const eye = buildRaytraceEye(postop, lentes.get(p), { cornea, fidelity, aperture_mm: pupilaDraw / 2 + 0.5 });
        const ev = evaluateObjective(eye, bundle.rays, ObjectiveKind.EQUIVALENT_DEFOCUS);
        if (mejor === null || ev.cost < mejor.cost) mejor = { power_d: p, cost: ev.cost };
      }
      decididas++;
      if (mejor.power_d === ventana[0] || mejor.power_d === ventana[ventana.length - 1]) {
        // resultado CENSURADO Y CONOCIDO: el óptimo salió de la ventana declarada.
        // Cuenta en el denominador — descartarlo truncaría las extracciones extremas
        fueraDeVentana++;
        continue;
      }
      elecciones.set(mejor.power_d, (elecciones.get(mejor.power_d) ?? 0) + 1);
    } catch (err) {
      rechazadas++;
      const motivo = clasificaRechazo(err);
      motivos[motivo] = (motivos[motivo] ?? 0) + 1;
    }
  }
  if (decididas < Math.max(10, n * 0.5)) {
    throw new RangeError(`elección degenerada: ${decididas}/${n} extracciones trazables `
      + `(motivos: ${JSON.stringify(motivos)})`);
  }
  const porEscalon = [...elecciones.entries()].sort((a, b) => b[1] - a[1])
    .map(([power_d, veces]) => ({ power_d, veces, fraccion: veces / decididas }));
  const modal = porEscalon[0] ?? null;
  const nominalVeces = elecciones.get(eleccionNominal) ?? 0;

  return {
    pregunta: 'inestabilidad de la ELECCIÓN de potencia (distribución discreta sobre escalones)',
    procedencia_posicion: procedenciaDePosicion(posNominal, predictor),
    seed,
    n_intentados: n,
    n_decididos: decididas,
    n_rechazados: rechazadas,
    motivos_rechazo: motivos,
    fuera_de_ventana: {
      n: fueraDeVentana,
      fraccion: fueraDeVentana / decididas,
      nota: 'elecciones CENSURADAS: el óptimo salió de la ventana declarada — el escalón exacto '
        + 'es desconocido más allá del borde; amplía window_d para resolverlas. Cuentan en el '
        + 'denominador: descartarlas truncaría las extracciones extremas y sesgaría las fracciones.',
    },
    eleccion_nominal_d: eleccionNominal,
    ventana_evaluada_d: ventana,
    por_escalon: porEscalon,
    fraccion_eleccion_nominal: nominalVeces / decididas,
    escalon_modal_d: modal?.power_d ?? null,
    fraccion_modal: modal?.fraccion ?? null,
    modal_coincide_con_nominal: modal === null ? null : modal.power_d === eleccionNominal,
    nota: 'la elección es DISCRETA: su inestabilidad (con qué frecuencia cambia el escalón '
      + 'elegido) es una pregunta distinta de la incertidumbre del resultado con una lente '
      + 'fija — no se resumen una en la otra',
    supuestos_trazado_nominal: nominalRun.supuestos_trazado,
    sigmas_declaradas: Object.entries(prep.S).map(([k, v]) => ({ variable: k, ...v })),
    correlaciones: prep.declaracionCorrelacion,
    descomposicion_posicion: NOTA_POSICION,
    parametros_declarados: {
      pupil_mm, sampling: { ...sampling }, window_d, search_d, catalogo_escalones: catalog_d.length,
      predictor: predictor.id, factory: factory.id, fidelity,
    },
    pupila: procedenciaDePupila(preop, pupil_mm),
    ...marcadorToric(preop, factory.create({ power_d: eleccionNominal })),
    etiqueta: ETIQUETA,
  };
}
