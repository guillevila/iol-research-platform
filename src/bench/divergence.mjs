/**
 * divergence.mjs — barridos de divergencia sobre el contrato de benchmark (V1.9).
 *
 * PREGUNTA PRIMARIA (análisis A): manteniendo posición, córnea y lente IDÉNTICAS,
 * ¿dónde y cuánto diverge la potencia óptima CONTINUA al sustituir la aproximación
 * paraxial por trazado exacto a apertura finita?
 *
 * Este módulo NO decide nada ni afirma que un motor acierte: produce celdas, cuentas
 * y estadísticos descriptivos. Dos reglas lo gobiernan:
 *
 *  1. CONTRA EL SESGO DEL SUPERVIVIENTE. Cada combinación INTENTADA aparece en la
 *     salida con su estado. Los rechazos NO se descartan antes de calcular: cada
 *     resumen lleva `n_intentados`, `n_comparables`, `n_rechazados` y el desglose de
 *     motivos. Una región con muchos rechazos ES un resultado.
 *  2. NADA DE CUANTIZACIÓN DISFRAZADA DE FÍSICA. La métrica primaria es la potencia
 *     CONTINUA (sin rejilla ni catálogo). La decisión de catálogo solo se compara
 *     cuando la discretización es EXACTAMENTE la misma en ambos motores, y se reporta
 *     aparte.
 *
 * TERMINOLOGÍA: `divergencia` entre modelos/motores, nunca "error" — medir divergencia
 * no es medir acierto, y ninguna salida de aquí afirma superioridad de nadie.
 *
 * RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING.
 */
import { controlledPhysicsComparison, fullEngineComparison } from './comparisons.mjs';
import { StrictModeViolation } from '../core/fidelity.mjs';

export const ETIQUETA = 'SIMULACION / NO GROUND TRUTH CLINICO';

/** Motivos de rechazo CLASIFICADOS (un rechazo sin clasificar es información perdida). */
export const RejectionReason = Object.freeze({
  SEARCH_BOUNDARY: 'search_boundary',        // el óptimo continuo cae en el borde de search_d
  CATALOG_BOUNDARY: 'catalog_boundary',      // el óptimo cae FUERA del catálogo
  GRID_BOUNDARY: 'grid_boundary',            // la diana no está en el rango de la rejilla paraxial
  EVO_OUT_OF_DOMAIN: 'evo_out_of_domain',    // el benchmark congelado declara el caso fuera de dominio
  GEOMETRY_UNKNOWN: 'geometry_unknown',      // la potencia pedida no tiene geometría de fabricante
  FIDELITY_STRICT: 'fidelity_strict',        // STRICT bloqueó por supuestos registrados
  CONTROL_VIOLATED: 'control_violated',      // los motores no compartían un control: no es física controlada
  POSITION_PREDICTOR: 'position_predictor',  // el predictor no pudo predecir (dato faltante)
  RAY_LOSS: 'ray_loss',                      // haz insuficiente / rayos perdidos en el trazado
  UNSUPPORTED: 'unsupported',                // dimensión o parámetro no soportado (p. ej. diana ≠ 0)
  OTHER: 'other',
});

/**
 * Clasifica una excepción por su mensaje. Es un mapeo FRÁGIL por naturaleza (depende
 * de textos), y por eso `OTHER` conserva el mensaje íntegro: un motivo que deje de
 * reconocerse aparecerá como OTHER con su texto, nunca desaparecerá ni se recontará
 * como otra cosa.
 */
export function classifyRejection(err) {
  const m = String(err?.message ?? err);
  if (err instanceof StrictModeViolation || /STRICT ·/.test(m)) return RejectionReason.FIDELITY_STRICT;
  if (/control violado/.test(m)) return RejectionReason.CONTROL_VIOLATED;
  if (/FUERA del catálogo|BORDE, no un óptimo/.test(m)) return RejectionReason.CATALOG_BOUNDARY;
  if (/borde del intervalo de búsqueda/.test(m)) return RejectionReason.SEARCH_BOUNDARY;
  if (/no está contenida en el rango de la rejilla/.test(m)) return RejectionReason.GRID_BOUNDARY;
  if (/fuera del dominio|longitud axial fuera|demasiado baja|demasiado alta/i.test(m)) return RejectionReason.EVO_OUT_OF_DOMAIN;
  if (/geometría trazable|geometry_status|no tiene geometría/.test(m)) return RejectionReason.GEOMETRY_UNKNOWN;
  if (/requiere acd_mm|predictor/i.test(m)) return RejectionReason.POSITION_PREDICTOR;
  if (/haz insuficiente|rayos perdidos|pérdidas excesivas/.test(m)) return RejectionReason.RAY_LOSS;
  if (/no soportado|UNSUPPORTED/.test(m)) return RejectionReason.UNSUPPORTED;
  return RejectionReason.OTHER;
}

/**
 * BANDAS DESCRIPTIVAS de |ΔP| (D). Son cortes de CONVENIENCIA para describir una
 * distribución — NO son umbrales de relevancia clínica y de ellas no se deduce
 * beneficio alguno: qué divergencia importa a un paciente exige datos postoperatorios
 * que este proyecto no tiene (OPEN_QUESTIONS #8).
 */
export const BANDAS_D = Object.freeze(['<0.05', '0.05-0.10', '0.10-0.25', '>=0.25']);
export function bandaDe(absD) {
  if (absD < 0.05) return BANDAS_D[0];
  if (absD < 0.10) return BANDAS_D[1];
  if (absD < 0.25) return BANDAS_D[2];
  return BANDAS_D[3];
}

const NOTA_BANDAS = 'bandas DESCRIPTIVAS de la distribución, NO umbrales de relevancia '
  + 'clínica: de ellas no se deduce beneficio (OPEN_QUESTIONS #8)';

/** Percentil por interpolación lineal sobre la muestra ordenada (convención declarada). */
export function percentil(ordenados, p) {
  if (ordenados.length === 0) return null;
  if (ordenados.length === 1) return ordenados[0];
  const idx = (ordenados.length - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return lo === hi ? ordenados[lo] : ordenados[lo] + (ordenados[hi] - ordenados[lo]) * (idx - lo);
}

/**
 * Estadísticos de un conjunto de celdas COMPARABLES, SIEMPRE junto a su denominador
 * original. Conserva signo (mediana firmada, mín/máx firmados) y magnitud (|Δ|).
 */
export function resumen(celdas, valorDe = c => c.divergencia_d) {
  const comparables = celdas.filter(c => c.estado === 'comparable');
  const rechazadas = celdas.filter(c => c.estado === 'rechazado');
  const motivos = {};
  for (const c of rechazadas) motivos[c.motivo] = (motivos[c.motivo] ?? 0) + 1;
  const firmados = comparables.map(valorDe).sort((a, b) => a - b);
  const abs = firmados.map(Math.abs).sort((a, b) => a - b);
  const bandas = Object.fromEntries(BANDAS_D.map(b => [b, 0]));
  for (const a of abs) bandas[bandaDe(a)]++;
  const n = abs.length;
  return {
    n_intentados: celdas.length,
    n_comparables: n,
    n_rechazados: rechazadas.length,
    motivos_rechazo: motivos,
    // magnitud
    mediana_abs_d: n ? percentil(abs, 0.5) : null,
    media_abs_d: n ? abs.reduce((s, v) => s + v, 0) / n : null,
    p95_abs_d: n ? percentil(abs, 0.95) : null,
    max_abs_d: n ? abs[n - 1] : null,
    // signo (la pregunta "¿en qué dirección?" no se responde con valores absolutos)
    mediana_firmada_d: n ? percentil(firmados, 0.5) : null,
    min_firmado_d: n ? firmados[0] : null,
    max_firmado_d: n ? firmados[n - 1] : null,
    n_positivos: firmados.filter(v => v > 0).length,
    n_negativos: firmados.filter(v => v < 0).length,
    // bandas descriptivas, en cuenta Y fracción sobre COMPARABLES (denominador aparte)
    bandas_n: bandas,
    bandas_fraccion: Object.fromEntries(BANDAS_D.map(b => [b, n ? bandas[b] / n : null])),
    nota_bandas: NOTA_BANDAS,
  };
}

/** Agrupa celdas por el valor de una variable y resume cada grupo con su denominador. */
export function resumenPorEje(celdas, campo, valorDe) {
  const valores = [...new Set(celdas.map(c => c[campo]))].sort((a, b) => a - b);
  return valores.map(v => ({
    [campo]: v,
    ...resumen(celdas.filter(c => c[campo] === v), valorDe),
  }));
}

/**
 * A · CONTROLLED_PHYSICS — barrido AL × K × pupila con TODOS los controles de V1.8
 * verificados en cada celda (los verifica `controlledPhysicsComparison`, que rechaza
 * si alguno falla: aquí ese rechazo se clasifica y se cuenta, no se oculta).
 *
 * Los casos son ESFÉRICOS (k1 = k2) a propósito: con astigmatismo, la dimensión tórica
 * quedaría UNSUPPORTED en ambos motores y contaminaría la pregunta.
 */
export function controlledPhysicsSweep({ paraxialEngine, raytraceEngine, grid, baseCase }) {
  validarRejilla(grid);
  const celdas = [];
  for (const al_mm of grid.al_mm) {
    for (const k_d of grid.k_d) {
      for (const pupil_mm of grid.pupil_mm) {
        // los valores del barrido viajan SIN redondear: el redondeo es cosa del reporte
        const benchCase = {
          ...baseCase,
          al_mm, k1_d: k_d, k2_d: k_d,
          k1_axis_deg: 180, k2_axis_deg: 90,
          pupil_mm, pupil_source: grid.pupil_source,
        };
        const celda = { al_mm, k_d, pupil_mm };
        try {
          const cmp = controlledPhysicsComparison({ paraxialEngine, raytraceEngine, benchCase });
          const ivR = cmp.resultados.raytrace.intermediate_values;
          const ivP = cmp.resultados.paraxial.intermediate_values;
          celdas.push({
            ...celda,
            estado: 'comparable',
            divergencia_d: cmp.divergencia.exact_power_d,        // P_raytrace − P_paraxial
            p_raytrace_d: ivR.exact_power_d,
            p_paraxial_d: ivP.exact_power_d,
            divergencia_catalogo_d: cmp.divergencia.recommended_power_d,   // null si no comparable
            iol_position_mm: ivR.iol_position_mm,
            cornea_policy: ivR.cornea_policy,
            lens_model: ivR.lens_model,
            controles: cmp.controles_verificados,
          });
        } catch (err) {
          celdas.push({
            ...celda,
            estado: 'rechazado',
            motivo: classifyRejection(err),
            mensaje: String(err?.message ?? err),
            divergencia_d: null,
          });
        }
      }
    }
  }
  return { modo: 'CONTROLLED_PHYSICS', celdas, etiqueta: ETIQUETA };
}

/**
 * B · FULL_ENGINE — DIVERGENCIA ENTRE MOTORES (descriptivo, secundario). No atribuye
 * ninguna divergencia al trazado: las pilas difieren en varios canales a la vez y la
 * comparación los lista. La refracción NO se resta (convenciones distintas).
 *
 * La potencia recomendada solo se compara cuando la discretización es comparable, y la
 * SATURACIÓN de catálogo se separa: si el óptimo continuo del trazado no está en el
 * catálogo, la diferencia no es cuantización sino falta de escalón.
 */
export function fullEngineSweep({ raytraceEngine, evoEngine, grid, baseCase, discretizacion_comparable = false }) {
  validarRejilla({ ...grid, pupil_mm: grid.pupil_mm ?? [null] });
  const celdas = [];
  for (const al_mm of grid.al_mm) {
    for (const k_d of grid.k_d) {
      const benchCase = {
        ...baseCase,
        al_mm, k1_d: k_d, k2_d: k_d,
        k1_axis_deg: 180, k2_axis_deg: 90,
        ...(grid.pupil_mm_fija !== undefined
          ? { pupil_mm: grid.pupil_mm_fija, pupil_source: grid.pupil_source }
          : {}),
      };
      const celda = { al_mm, k_d };
      try {
        const cmp = fullEngineComparison({ raytraceEngine, evoEngine, benchCase });
        const rt = cmp.resultados.raytrace, evo = cmp.resultados.evo_replica;
        const iv = rt.intermediate_values;
        const paso = iv.catalog_d && iv.catalog_d.length > 1
          ? +(iv.catalog_d[1] - iv.catalog_d[0]).toFixed(6) : null;
        // saturación: el escalón recomendado se aleja del óptimo continuo más de medio
        // paso ⇒ no es cuantización, es que el catálogo no llega
        const desvio = Math.abs(rt.recommended_power - iv.exact_power_d);
        const saturado = paso !== null && desvio > paso / 2 + 1e-9;
        celdas.push({
          ...celda,
          estado: 'comparable',
          divergencia_d: discretizacion_comparable ? rt.recommended_power - evo.recommended_power : null,
          // sobre cuántos escalones decidió realmente el trazado (los no evaluables se
          // registran: un catálogo amplio no está íntegramente considerado por defecto)
          catalog_evaluados: iv.catalog_evaluados,
          catalog_no_evaluables: (iv.catalog_no_evaluables ?? []).length,
          p_raytrace_recomendada_d: rt.recommended_power,
          p_evo_recomendada_d: evo.recommended_power,
          p_raytrace_continua_d: iv.exact_power_d,
          discretizacion_comparable,
          saturacion_catalogo: saturado,
          desvio_escalon_d: desvio,
          diferencias_de_configuracion: cmp.diferencias_de_configuracion.length,
        });
      } catch (err) {
        celdas.push({
          ...celda,
          estado: 'rechazado',
          motivo: classifyRejection(err),
          mensaje: String(err?.message ?? err),
          divergencia_d: null,
        });
      }
    }
  }
  return {
    modo: 'FULL_ENGINE',
    denominacion: 'DIVERGENCIA ENTRE MOTORES — no es una medida de acierto de ninguno',
    celdas,
    etiqueta: ETIQUETA,
  };
}

/**
 * Monotonía en pupila: HIPÓTESIS A OBSERVAR, no ley a imponer. Para cada (AL, K)
 * comprueba si |ΔP| crece con la pupila y reporta las series que NO lo hacen, las que
 * cambian de signo y las incompletas (con rechazos): todas ellas son resultados.
 */
export function analizarMonotoniaEnPupila(celdas) {
  const claves = [...new Set(celdas.map(c => `${c.al_mm}|${c.k_d}`))];
  const series = claves.map(clave => {
    const [al, k] = clave.split('|').map(Number);
    const dePupila = celdas
      .filter(c => c.al_mm === al && c.k_d === k)
      .sort((a, b) => a.pupil_mm - b.pupil_mm);
    const comparables = dePupila.filter(c => c.estado === 'comparable');
    const abs = comparables.map(c => Math.abs(c.divergencia_d));
    const signos = new Set(comparables.filter(c => c.divergencia_d !== 0).map(c => Math.sign(c.divergencia_d)));
    let creciente = true;
    for (let i = 1; i < abs.length; i++) if (abs[i] < abs[i - 1] - 1e-12) creciente = false;
    return {
      al_mm: al, k_d: k,
      n_intentados: dePupila.length,
      n_comparables: comparables.length,
      monotona_creciente_en_pupila: comparables.length >= 2 ? creciente : null,
      cambia_de_signo: signos.size > 1,
      signos: [...signos].sort(),
    };
  });
  const conDatos = series.filter(s => s.monotona_creciente_en_pupila !== null);
  return {
    n_series: series.length,
    n_series_con_datos_suficientes: conDatos.length,
    n_monotonas_crecientes: conDatos.filter(s => s.monotona_creciente_en_pupila).length,
    n_no_monotonas: conDatos.filter(s => !s.monotona_creciente_en_pupila).length,
    n_cambian_de_signo: series.filter(s => s.cambia_de_signo).length,
    series_no_monotonas: conDatos.filter(s => !s.monotona_creciente_en_pupila),
    series_que_cambian_de_signo: series.filter(s => s.cambia_de_signo),
    nota: 'la monotonía en pupila se OBSERVA, no se impone: una serie no monótona o un '
      + 'cambio de signo es un resultado que se reporta, no un fallo del barrido',
    series,
  };
}

function validarRejilla(grid) {
  for (const eje of ['al_mm', 'k_d', 'pupil_mm']) {
    if (!Array.isArray(grid?.[eje]) || grid[eje].length === 0) {
      throw new TypeError(`divergence: la rejilla exige el eje ${eje} como array no vacío`);
    }
    for (const v of grid[eje]) {
      if (v !== null && !Number.isFinite(v)) throw new TypeError(`divergence: valor no finito en ${eje}`);
    }
  }
  if (grid.pupil_mm.some(v => v !== null) && typeof grid.pupil_source !== 'string') {
    throw new TypeError('divergence: la rejilla de pupila exige `pupil_source` (procedencia declarada)');
  }
}
