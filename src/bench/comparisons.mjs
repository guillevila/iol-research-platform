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
  const par = paraxialEngine.predict(benchCase);
  const rt = raytraceEngine.predict(benchCase);
  const iv = { par: par.intermediate_values, rt: rt.intermediate_values };
  // CONTROLES: mismo predictor (misma posición y procedencia) y misma interpretación
  // corneal. Si no se cumplen, esto NO aísla el modelo óptico — se rechaza con nombre.
  const controles = [];
  const exige = (nombre, a, b) => {
    if (a !== b) {
      throw new TypeError(`controlledPhysicsComparison: control violado — ${nombre} difiere `
        + `entre motores (${String(a)} vs ${String(b)}): la divergencia ya no aísla el modelo óptico.`);
    }
    controles.push(`${nombre} = ${String(a)}`);
  };
  exige('position_source', iv.par.position_source, iv.rt.position_source);
  exige('iol_position_mm', iv.par.iol_position_mm, iv.rt.iol_position_mm);
  exige('cornea_policy', iv.par.cornea_policy, iv.rt.cornea_policy);
  return {
    modo: 'CONTROLLED_PHYSICS',
    que_aisla: 'divergencia introducida por el MODELO ÓPTICO (vergencias paraxiales vs '
      + 'trazado exacto de rayos) con posición, córnea y parámetros compartidos',
    controles_verificados: controles,
    divergencia: {
      recommended_power_d: rt.recommended_power - par.recommended_power,
      exact_power_d: iv.rt.exact_power_d - iv.par.exact_power_d,
    },
    no_directamente_comparable: {
      predicted_refraction: 'convenciones distintas: gafa (paraxial) vs desenfoque '
        + 'equivalente en referencia LIO-posterior (trazado) — no se restan',
    },
    parametros_no_compartidos_declarados: {
      pupila: `el paraxial no modela pupila; el trazado usa ${iv.rt.pupil_mm} mm (${iv.rt.pupil_source})`,
      objetivo: `el paraxial minimiza |refracción−diana|; el trazado ${iv.rt.objective}`,
      geometria_iol: `paraxial: lente gruesa por vergencias; trazado: ${iv.rt.iol_factory} `
        + `(${iv.rt.iol_geometry_status})`,
    },
    resultados: { paraxial: par, raytrace: rt },
    etiqueta: ETIQUETA,
  };
}

/**
 * B · FULL_ENGINE. La salida es DIVERGENCIA ENTRE MOTORES: dos pilas completas con
 * configuraciones distintas — la lista de diferencias hace explícito por qué la cifra
 * no es atribuible a una sola causa (y por qué jamás se llama "error").
 */
export function fullEngineComparison({ raytraceEngine, evoEngine, benchCase }) {
  assertBenchCase(benchCase);
  const rt = raytraceEngine.predict(benchCase);
  const evo = evoEngine.predict(benchCase);
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
    ],
    atribucion: 'IMPOSIBLE atribuir la divergencia a una sola causa: las pilas difieren '
      + 'en predictor, geometría, política corneal, objetivo y convención de refracción a la vez. '
      + 'Para aislar el modelo óptico usa CONTROLLED_PHYSICS.',
    resultados: { raytrace: rt, evo_replica: evo },
    etiqueta: ETIQUETA,
  };
}
