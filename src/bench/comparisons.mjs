/**
 * comparisons.mjs — las DOS comparaciones del benchmark, separadas a propósito (V1.8).
 *
 * A · CONTROLLED_PHYSICS — ParaxialEngine ↔ RaytraceEngine con el MISMO predictor de
 *     posición, la MISMA interpretación corneal y parámetros declarados: aísla la
 *     divergencia introducida por el MODELO ÓPTICO (vergencias paraxiales vs trazado
 *     exacto). Los controles se VERIFICAN sobre las salidas — si difieren, la
 *     comparación se rechaza: no es física controlada, es una mezcla.
 *
 * B · FULL_ENGINE — RaytraceEngine ↔ EvoReplicaEngine. La salida se denomina
 *     únicamente DIVERGENCIA ENTRE MOTORES y lista las diferencias de configuración
 *     que impiden atribuirla a una sola causa. Jamás "error frente a EVO", jamás
 *     superioridad: EVO es un benchmark congelado, no un ground truth.
 *
 * Métrica comparable entre motores: la POTENCIA recomendada/continua (D en plano de
 * LIO — misma unidad y mismo plano en todos). Las refracciones previstas NO son
 * directamente comparables (gafa vs desenfoque equivalente): se listan como
 * convenciones distintas, no se restan en silencio.
 *
 * RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING.
 */
import { assertBenchCase } from './interface.mjs';

const ETIQUETA = 'SIMULACION / NO GROUND TRUTH CLINICO';

/**
 * A · CONTROLLED_PHYSICS. Ejecuta ambos motores sobre el caso y VERIFICA los
 * controles antes de reportar divergencia alguna.
 */
export function controlledPhysicsComparison({ paraxialEngine, raytraceEngine, benchCase }) {
  assertBenchCase(benchCase);
  const par = ejecuta('paraxial', paraxialEngine, benchCase);
  const rt = ejecuta('raytrace', raytraceEngine, benchCase);
  const iv = { par: par.intermediate_values, rt: rt.intermediate_values };
  // CONTROLES (reforzados tras la revisión adversarial V1.8): los tres primeros no
  // BASTABAN — el término que DOMINA la divergencia era el modelo de LENTE (el
  // paraxial evaluaba una lente DELGADA y el trazado una GRUESA de la factory: ~100 %
  // de la cifra publicada). Ahora se exige también la MISMA lente. Si algún control
  // falla, esto NO aísla el modelo óptico y se rechaza con nombre.
  const controles = [];
  const exige = (nombre, a, b, remedio = '') => {
    if (a !== b) {
      throw new TypeError(`controlledPhysicsComparison: control violado — ${nombre} difiere `
        + `entre motores (${String(a)} vs ${String(b)}): la divergencia ya no aísla el modelo `
        + `óptico.${remedio ? ' ' + remedio : ''}`);
    }
    controles.push(`${nombre} = ${String(a)}`);
  };
  exige('position_source', iv.par.position_source, iv.rt.position_source);
  exige('iol_position_mm', iv.par.iol_position_mm, iv.rt.iol_position_mm);
  exige('cornea_policy', iv.par.cornea_policy, iv.rt.cornea_policy);
  exige('lens_model', iv.par.lens_model, 'thick_lens_from_factory',
    'Inyecta la MISMA IOLFactory al ParaxialEngine ({ iolFactory }): con lente delgada, '
    + 'la diferencia de geometría domina la cifra y no es modelo óptico.');
  exige('iol_factory', iv.par.iol_factory, iv.rt.iol_factory,
    'Ambos motores deben evaluar la MISMA geometría de lente.');
  exige('target_d', iv.par.target_d, iv.rt.target_d);
  // cuantización: solo se compara la potencia RECOMENDADA si ambos conjuntos de
  // potencias implantables coinciden; si no, la resta mezclaría cuantizaciones
  const mismaCuantizacion = JSON.stringify(iv.rt.catalog_d) === JSON.stringify(paraxialEngine.grid);
  return {
    modo: 'CONTROLLED_PHYSICS',
    que_aisla: 'divergencia introducida por el MODELO ÓPTICO (vergencias paraxiales vs '
      + 'trazado exacto de rayos) con MISMA posición, MISMA córnea y MISMA lente gruesa',
    controles_verificados: controles,
    divergencia: {
      // métrica principal: potencia CONTINUA (sin cuantización en ninguno de los dos)
      exact_power_d: iv.rt.exact_power_d - iv.par.exact_power_d,
      recommended_power_d: mismaCuantizacion
        ? rt.recommended_power - par.recommended_power
        : null,
    },
    no_directamente_comparable: {
      predicted_refraction: 'convenciones distintas: gafa (paraxial) vs desenfoque '
        + 'equivalente en referencia LIO-posterior (trazado) — no se restan',
      ...(mismaCuantizacion ? {} : {
        recommended_power: `conjuntos de potencias implantables DISTINTOS (paraxial: rejilla `
          + `de ${paraxialEngine.grid.length} pasos; trazado: `
          + `${iv.rt.catalog_d ? `catálogo de ${iv.rt.catalog_d.length}` : 'continuo, sin catálogo'}) `
          + '— la resta mezclaría cuantizaciones: se compara la potencia CONTINUA',
      }),
      ...(rt.unsupported_dimensions.includes('toric') || par.unsupported_dimensions.includes('toric') ? {
        toric: `dimensión tórica no comparable: paraxial `
          + `${par.unsupported_dimensions.includes('toric') ? 'UNSUPPORTED' : 'calculada'}, trazado `
          + `${rt.unsupported_dimensions.includes('toric') ? 'UNSUPPORTED' : 'calculada'}`,
      } : {}),
    },
    parametros_no_compartidos_declarados: {
      pupila: `el paraxial no modela pupila (primer orden); el trazado usa ${iv.rt.pupil_mm} mm `
        + `(${iv.rt.pupil_source}) — este ES el canal por el que aparece la aberración`,
      objetivo: `el paraxial minimiza |refracción−diana| sobre su rejilla; el trazado ${iv.rt.objective}`,
      cuantizacion: mismaCuantizacion
        ? 'misma rejilla/catálogo en ambos'
        : `distinta (ver no_directamente_comparable.recommended_power)`,
    },
    resultados: { paraxial: par, raytrace: rt },
    etiqueta: ETIQUETA,
  };
}

/** Ejecuta un motor nombrando el fallo: una excepción cruda perdería el contexto. */
function ejecuta(nombre, engine, benchCase) {
  try {
    return engine.predict(benchCase);
  } catch (err) {
    const e = new Error(`[${ETIQUETA}] el motor ${nombre} (${engine?.id ?? '?'}) no pudo predecir `
      + `este caso: ${err.message ?? err}`);
    e.cause = err;
    e.engine = nombre;
    throw e;
  }
}

/**
 * B · FULL_ENGINE. La salida es DIVERGENCIA ENTRE MOTORES: dos pilas completas con
 * configuraciones distintas — la lista de diferencias hace explícito por qué la cifra
 * no es atribuible a una sola causa (y por qué jamás se llama "error").
 */
export function fullEngineComparison({ raytraceEngine, evoEngine, benchCase }) {
  assertBenchCase(benchCase);
  const rt = ejecuta('raytrace', raytraceEngine, benchCase);
  const evo = ejecuta('evo_replica', evoEngine, benchCase);
  const iv = rt.intermediate_values;
  return {
    modo: 'FULL_ENGINE',
    denominacion: 'DIVERGENCIA ENTRE MOTORES — no es una medida de acierto de ninguno',
    divergencia_entre_motores: {
      recommended_power_d: rt.recommended_power - evo.recommended_power,
    },
    no_directamente_comparable: {
      predicted_refraction: 'convenciones distintas: EVO reporta refracción prevista '
        + 'de gafa; el trazado, desenfoque equivalente en referencia LIO-posterior',
      toric: rt.unsupported_dimensions.includes('toric')
        ? 'el trazado declara la dimensión tórica UNSUPPORTED (no optimiza cilindro+eje); '
          + 'EVO puede reportarla — no hay comparación tórica válida'
        : 'caso sin astigmatismo queratométrico',
    },
    diferencias_de_configuracion: [
      `predictor de posición: ${iv.position_predictor} (inyectado, ${iv.position_source}) `
        + 'vs el interno de EVO (regresión opaca del benchmark congelado)',
      `geometría de LIO: ${iv.iol_factory} (${iv.iol_geometry_status}`
        + `${iv.is_simulation_surrogate ? ', SUSTITUTO de simulación declarado' : ''}) `
        + 'vs A-constant + modelo comercial que EVO consume y el motor físico IGNORA con nombre',
      `política corneal: ${iv.cornea_policy} (declarada) vs la convención interna de EVO`,
      `objetivo óptico: ${iv.objective} con pupila ${iv.pupil_mm} mm (${iv.pupil_source}) `
        + 'vs el criterio interno de EVO (sin pupila modelada)',
      `fidelity: ${iv.fidelity} con supuestos registrados en supuestos_trazado vs EVO sin registro de supuestos`,
      // canales que la revisión adversarial V1.8 encontró SIN declarar y que dominan
      // la cifra tanto o más que el modelo óptico:
      `DISCRETIZACIÓN: catálogo inyectado al trazado (${iv.catalog_d ? `${iv.catalog_d.length} escalones, `
        + `${Math.min(...iv.catalog_d)}–${Math.max(...iv.catalog_d)} D` : 'ninguno: potencia continua'}) `
        + 'vs la tabla interna de EVO (escalones y rango propios) — parte de la divergencia es saturación '
        + 'o cuantización de catálogo, no física',
      `A-CONSTANT (${benchCase.a_constant ?? 'no declarada'}): la fija el LLAMANTE y mueve a EVO varios D `
        + 'sin mover el motor físico, que la ignora — barrerla sola cambia la "divergencia" a voluntad',
      `diana: ${iv.target_d} D en el trazado (solo emetropía soportada) vs la diana que EVO honre`,
    ],
    atribucion: 'IMPOSIBLE atribuir la divergencia a una sola causa: las pilas difieren '
      + 'en predictor, geometría, política corneal, objetivo y convención de refracción a la vez. '
      + 'Para aislar el modelo óptico usa CONTROLLED_PHYSICS.',
    resultados: { raytrace: rt, evo_replica: evo },
    etiqueta: ETIQUETA,
  };
}
