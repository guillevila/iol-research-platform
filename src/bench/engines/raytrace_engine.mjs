/**
 * raytrace_engine.mjs — adaptador del motor de TRAZADO al contrato de benchmark (V1.8).
 *
 * V1.8 es un contrato de COMPARABILIDAD, no un wrapper: el adaptador declara
 * exactamente qué calcula, con qué configuración inyectada, y qué NO calcula.
 *
 * HONESTIDAD TÓRICA: el motor físico puede TRAZAR y analizar configuraciones tóricas
 * (V1.6/V1.7), pero el optimizador raytrace actual busca POTENCIA con objetivos
 * escalares A/C — no busca cilindro+eje. Este motor recomienda el equivalente
 * esférico que realmente soporta: en un caso ASTIGMÁTICO la dimensión tórica se
 * declara `unsupported_dimensions: ['toric']` con sus campos a NULL — jamás un 0 que
 * parezca resultado físico. En un caso sin astigmatismo queratométrico, cilindro 0 SÍ
 * es física del modelo (no hay cilindro que corregir) y se devuelve como tal.
 *
 * INYECCIÓN EXPLÍCITA (nada se escoge en silencio): positionPredictor, iolFactory,
 * objective, sampling, search_d, catálogo, política corneal, fidelity y pupila son
 * parámetros OBLIGATORIOS de construcción. El motor JAMÁS deriva una geometría
 * comercial de `iol_model` ni de `a_constant`: son entradas ESPECÍFICAS DE EVO y se
 * reportan como ignoradas con nombre, nunca se fingen consumidas.
 *
 * PUPILA (V1.8→V1.9): de primer nivel. O viene en el caso (`pupil_mm` +
 * `pupil_source`, procedencia obligatoria) o viene declarada en la construcción del
 * motor. NUNCA cae en silencio al 3.0 mm por defecto de RESEARCH: el adaptador pasa
 * SIEMPRE una pupila explícita al optimizador. En STRICT la semántica del optimizador
 * se conserva intacta (la puerta la sigue gobernando el registro de supuestos).
 *
 * CONVENCIÓN DE REFRACCIÓN (comparabilidad, no equivalencia): `predicted_refraction`
 * de este motor es el DESENFOQUE EQUIVALENTE del objetivo C (vergencia en la
 * referencia LIO-posterior, sin distancia de vértice) — NO la refracción en plano de
 * gafa que reporta el paraxial. Las comparaciones deben tratarlas como convenciones
 * DISTINTAS (comparisons.mjs lo lista); las potencias recomendadas SÍ comparten
 * unidad (D en plano de LIO).
 *
 * RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING.
 */
import { createPreopEye, createPredictedPostopEye } from '../../core/eye.mjs';
import { createPredictionResult } from '../../core/result.mjs';
import { assertBenchCase } from '../interface.mjs';
import { optimizePowerByRaytrace } from '../../optimize/raytrace_power.mjs';
import { ObjectiveKind } from '../../optics/objective.mjs';
import { SamplingKind } from '../../optics/raytrace/bundle.mjs';
import { assertFidelityMode } from '../../core/fidelity.mjs';
import { assertFinite } from '../../core/units.mjs';

/** Campos del benchCase que este adaptador CONSUME (mapea al dominio). */
const CAMPOS_CONSUMIDOS = Object.freeze([
  'al_mm', 'k1_d', 'k1_axis_deg', 'k2_d', 'k2_axis_deg', 'acd_mm', 'lt_mm', 'cct_um',
  'k_index', 'target_d', 'pupil_mm', 'pupil_source', 'cornea', 'meta',
]);
/** Entradas ESPECÍFICAS DE EVO: el motor físico no las usa; se reportan, no se fingen. */
const CAMPOS_EVO = Object.freeze(['a_constant', 'iol_model']);
/** Entradas de la dimensión TÓRICA, que este motor declara UNSUPPORTED. */
const CAMPOS_TORIC = Object.freeze(['sia_d', 'sia_axis_deg']);

export class RaytraceEngine {
  /**
   * TODO se inyecta explícitamente; ningún parámetro tiene un valor escogido en
   * silencio por el adaptador.
   *
   * @param positionPredictor  implementa predict(preopEye) (src/predictors)
   * @param iolFactory         IOLFactory (genérica DECLARADA o fabricante con
   *                           procedencia) — la ÚNICA fuente de geometría
   * @param objective          ObjectiveKind (A o C)
   * @param sampling           { kind, n_anillos, perRing? } (bundle.mjs)
   * @param search_d           [min, max] D del continuo
   * @param catalog_d          escalones implantables, o null (solo continuo)
   * @param cornea             opciones de política corneal ({} = corneaModelOf con la
   *                           auto-elevación DOCUMENTADA: medida completa → MEASURED,
   *                           si no la política por defecto declarada)
   * @param fidelity           FidelityMode
   * @param pupil_mm           número (pupila de escenario declarada por el motor) o
   *                           'FROM_CASE' (el caso DEBE traer pupil_mm + pupil_source)
   */
  constructor({
    positionPredictor, iolFactory, objective, sampling, search_d,
    catalog_d = null, cornea, fidelity, pupil_mm,
  } = {}) {
    if (!positionPredictor?.predict) throw new TypeError('RaytraceEngine: positionPredictor con .predict() OBLIGATORIO');
    if (!iolFactory?.create) throw new TypeError('RaytraceEngine: iolFactory con .create() OBLIGATORIO — la geometría jamás se deriva de iol_model/a_constant');
    if (!Object.values(ObjectiveKind).includes(objective)) {
      throw new TypeError(`RaytraceEngine: objective OBLIGATORIO (${Object.values(ObjectiveKind).join(' | ')})`);
    }
    // El contrato PredictionResult exige `predicted_refraction` en DIOPTRÍAS. El coste
    // del objetivo A es un radio RMS en MILÍMETROS: publicarlo en ese campo sería
    // intercambiar unidades bajo el mismo nombre (0.0037 "D" parecería emetropía casi
    // perfecta y son 3.7 µm de spot) — el patrón que este proyecto prohíbe. Se rechaza
    // en CONSTRUCCIÓN (hallazgo adversarial V1.8).
    if (objective === ObjectiveKind.SPOT_RMS_AT_RETINA) {
      throw new TypeError('RaytraceEngine: el objetivo SPOT_RMS_AT_RETINA no es publicable en el '
        + 'contrato de benchmark — su coste es un radio RMS en mm y `predicted_refraction` está '
        + 'definido en dioptrías. Para comparar objetivos usa compareObjectives '
        + '(src/optimize/raytrace_power.mjs), que los reporta cada uno en su unidad.');
    }
    if (!sampling || !Object.values(SamplingKind).includes(sampling.kind) || !Number.isFinite(sampling.n_anillos)) {
      throw new TypeError('RaytraceEngine: sampling OBLIGATORIO ({ kind: SamplingKind, n_anillos, perRing })');
    }
    // perRing solo aplica a los muestreos por anillos; exigirlo ahí y RECHAZARLO donde
    // es inerte evita el default silencioso que el docstring prohibía (adversarial V1.8)
    const usaAnillos = sampling.kind === SamplingKind.RINGS_EQUAL_AREA;
    if (usaAnillos && !Number.isFinite(sampling.perRing)) {
      throw new TypeError(`RaytraceEngine: sampling.perRing OBLIGATORIO con ${sampling.kind}`);
    }
    if (!usaAnillos && sampling.perRing !== undefined) {
      throw new TypeError(`RaytraceEngine: sampling.perRing no aplica a ${sampling.kind} — `
        + 'declararlo sugeriría un control que ese muestreo no tiene');
    }
    if (!Array.isArray(search_d) || search_d.length !== 2 || !(search_d[1] > search_d[0])) {
      throw new TypeError('RaytraceEngine: search_d OBLIGATORIO ([min, max] D)');
    }
    if (cornea === undefined || cornea === null || typeof cornea !== 'object' || Array.isArray(cornea)) {
      throw new TypeError('RaytraceEngine: cornea OBLIGATORIO (opciones de política corneal; {} = auto-elevación documentada)');
    }
    // vocabulario CERRADO de opciones corneales (hallazgo adversarial V1.8: `cornea`
    // tragaba cualquier clave — `{posterior_ratio, provenance}` con el `policy`
    // OLVIDADO caía a P=K en silencio, 1.59 D de desplazamiento creyendo haber
    // configurado la política de ratio; y `cornea_toric` ni siquiera es alcanzable
    // desde el optimizador, que no lo reenvía)
    const OPCIONES_CORNEA = ['policy', 'posterior_ratio', 'provenance', 'n_cornea', 'n_aqueous'];
    const corneaDesconocidas = Object.keys(cornea).filter(k => !OPCIONES_CORNEA.includes(k));
    if (corneaDesconocidas.length > 0) {
      throw new TypeError(`RaytraceEngine: opciones corneales no reconocidas: ${corneaDesconocidas.join(', ')}. `
        + `Válidas: ${OPCIONES_CORNEA.join(', ')}. (La córnea TÓRICA no es alcanzable desde este `
        + 'adaptador: el optimizador de potencia escalar no admite sistemas tóricos.)');
    }
    if (!cornea.policy && (cornea.posterior_ratio !== undefined || cornea.provenance !== undefined)) {
      throw new TypeError('RaytraceEngine: opciones de política corneal (posterior_ratio/provenance) '
        + 'SIN `policy` declarada — se aplicaría la política por defecto ignorándolas en silencio.');
    }
    assertFidelityMode(fidelity);
    if (pupil_mm !== 'FROM_CASE') {
      assertFinite(pupil_mm, 'pupil_mm');
      if (!(pupil_mm > 0)) throw new RangeError('RaytraceEngine: pupil_mm > 0 o "FROM_CASE"');
    }
    this.predictor = positionPredictor;
    this.factory = iolFactory;
    this.objective = objective;
    this.sampling = { ...sampling };
    this.search_d = [...search_d];
    this.catalog_d = catalog_d === null ? null : [...catalog_d];
    this.cornea = { ...cornea };
    this.fidelity = fidelity;
    this.pupil_mm = pupil_mm;
    this.id = `raytrace_v1+${positionPredictor.id}+${objective}+${iolFactory.id}`;
  }

  predict(c) {
    assertBenchCase(c);
    // NINGÚN input se pierde en silencio: todo campo del caso o se consume, o es una
    // entrada EVO reportada como ignorada, o el caso se rechaza nombrando el campo.
    const desconocidos = Object.keys(c).filter(k => !CAMPOS_CONSUMIDOS.includes(k)
      && !CAMPOS_EVO.includes(k) && !CAMPOS_TORIC.includes(k));
    if (desconocidos.length > 0) {
      throw new TypeError(`RaytraceEngine: campos del caso no reconocidos: ${desconocidos.join(', ')}. `
        + 'Un campo que el adaptador no mapea no se traga: se consume, se declara ignorado (EVO) o se rechaza.');
    }
    const evoIgnorados = CAMPOS_EVO.filter(k => c[k] !== undefined && c[k] !== null);
    const toricIgnorados = CAMPOS_TORIC.filter(k => c[k] !== undefined && c[k] !== null && c[k] !== 0);
    // la diana ≠ 0 se rechaza ANTES de calcular nada: el objetivo escalar actual
    // optimiza emetropía (foco en retina) — declarar otra diana exigiría un objetivo
    // con diana que no existe; no se finge restándola después
    if ((c.target_d ?? 0) !== 0) {
      throw new TypeError('RaytraceEngine: target_d ≠ 0 no soportado — el objetivo escalar '
        + 'actual optimiza emetropía (foco en retina). No se finge una diana restando después.');
    }

    const preop = createPreopEye({
      al_mm: c.al_mm, k1_d: c.k1_d, k1_axis_deg: c.k1_axis_deg ?? 0,
      k2_d: c.k2_d, k2_axis_deg: c.k2_axis_deg ?? 90,
      acd_mm: c.acd_mm ?? null, lt_mm: c.lt_mm ?? null, cct_um: c.cct_um ?? null,
      keratometric_index: c.k_index ?? null,
      ...(c.cornea ? { cornea: c.cornea } : {}),
      // meta ENTERA (device/note incluidos): reconstruirla con solo `source` perdía
      // metadatos del caso en silencio — hallazgo adversarial V1.8
      meta: { ...(c.meta ?? {}), source: c.meta?.source ?? 'synthetic' },
    });
    const pos = this.predictor.predict(preop);
    const postop = createPredictedPostopEye(preop, {
      iol_position_mm: pos.iol_position_mm, position_source: pos.source,
    });

    // pupila SIEMPRE explícita, con procedencia — jamás el defecto silencioso de 3 mm.
    // Y sin PRECEDENCIA TÁCITA (hallazgo adversarial V1.8): que el caso ganara en
    // silencio sobre la pupila del motor movía el óptimo 1.58 D sin un solo aviso.
    // O el motor declara la pupila del escenario, o la delega al caso ('FROM_CASE').
    let pupil_mm, pupil_source;
    const casoTraePupila = typeof c.pupil_mm === 'number';
    if (this.pupil_mm === 'FROM_CASE') {
      if (!casoTraePupila) {
        throw new TypeError('RaytraceEngine: el motor se construyó con pupil_mm="FROM_CASE" y el caso '
          + 'no trae pupil_mm — no se cae en silencio al 3.0 mm por defecto de RESEARCH.');
      }
      pupil_mm = c.pupil_mm;
      pupil_source = c.pupil_source;             // assertBenchCase la exige
    } else {
      if (casoTraePupila && c.pupil_mm !== this.pupil_mm) {
        throw new TypeError(`RaytraceEngine: CONFLICTO de pupila — el motor declara ${this.pupil_mm} mm `
          + `y el caso ${c.pupil_mm} mm (${c.pupil_source}). No hay precedencia tácita: construye el `
          + 'motor con pupil_mm="FROM_CASE" para que mande el caso, o retira la pupila del caso.');
      }
      pupil_mm = this.pupil_mm;
      pupil_source = casoTraePupila ? c.pupil_source : 'escenario declarado en la construcción del motor';
    }

    const target_d = c.target_d ?? 0;
    const r = optimizePowerByRaytrace({
      postop,
      factory: this.factory,
      objective: this.objective,
      catalog_d: this.catalog_d,
      pupil_mm,
      sampling: this.sampling.kind,
      n_anillos: this.sampling.n_anillos,
      perRing: this.sampling.perRing,
      search_d: this.search_d,
      cornea: this.cornea,
      fidelity: this.fidelity,
    });
    const best = r.best ?? { power_d: r.exact_power_d, ...r.at_exact };
    const second = r.second;
    // metadatos de la lente REALMENTE recomendada (geometry_status/procedencia)
    const lenteBest = this.factory.create({ power_d: best.power_d });
    // la dimensión tórica es UNSUPPORTED si hay CUALQUIER entrada astigmática
    // declarada — queratométrica o SIA (hallazgo adversarial V1.8: con K esférica y
    // SIA declarada se publicaba cilindro 0 "físico" mientras se descartaba la SIA)
    const astigmatico = Math.abs(c.k1_d - c.k2_d) > 1e-9 || toricIgnorados.length > 0;

    return createPredictionResult({
      engine: this.id,
      // CONVENCIÓN: desenfoque equivalente en la referencia LIO-posterior — NO
      // refracción en plano de gafa (ver cabecera). Siempre en DIOPTRÍAS: el objetivo
      // A (coste en mm) está rechazado en construcción, así que residual_d existe.
      predicted_refraction: best.residual_d,
      ...(astigmatico ? {
        unsupported_dimensions: ['toric'],
        predicted_cylinder: null, predicted_axis: null,
        recommended_toric: null, recommended_axis: null,
      } : {
        predicted_cylinder: 0, recommended_toric: 0,
      }),
      recommended_power: best.power_d,
      alternative: second && {
        power: second.power_d,
        predicted_refraction: second.residual_d,
        delta_d: r.delta_between_top2,   // objetivo C: |ΔD| — misma unidad que arriba
      },
      intermediate_values: {
        // trazabilidad SUFICIENTE para reproducir la predicción (criterio V1.8 §5)
        position_predictor: this.predictor.id,
        position_source: pos.source,
        iol_position_mm: postop.iol_position_mm,
        iol_factory: this.factory.id,
        iol_geometry_status: lenteBest.geometry_status,
        iol_provenance: lenteBest.provenance,
        is_simulation_surrogate: lenteBest.is_simulation_surrogate,
        objective: this.objective,
        objective_label: r.objective_label,
        pupil_mm, pupil_source,
        sampling: r.parametros_declarados.sampling,
        n_anillos: this.sampling.n_anillos,
        perRing: this.sampling.perRing,
        rayos: r.parametros_declarados.rayos,
        muestreo_2d: r.parametros_declarados.muestreo_2d,
        cornea_policy: r.parametros_declarados.cornea_policy,
        cornea_rotationally_symmetric: r.parametros_declarados.cornea_rotationally_symmetric,
        fidelity: this.fidelity,
        pose: r.parametros_declarados.pose,       // null ≡ DEFAULT_CENTERED
        search_d: this.search_d, tol_d: r.parametros_declarados.tol_d,
        catalog_d: this.catalog_d,
        target_d,
        exact_power_d: r.exact_power_d,
        at_exact: r.at_exact,
        // métricas de la lente REALMENTE recomendada (antes solo viajaban las del
        // óptimo continuo NO implantable — asimetría de trazabilidad, hallazgo V1.8)
        at_recommended: r.best ? { ...r.best } : null,
        lens_model: 'thick_lens_from_factory',
        supuestos_trazado: r.supuestos_trazado,
        refraction_convention: 'desenfoque equivalente en referencia LIO-posterior '
          + '(sin distancia de vértice) — NO plano de gafa: no comparar con la '
          + 'refracción de gafa de otros motores sin declarar la diferencia',
        // entradas presentes en el caso y NO consumidas, con nombre y motivo
        evo_inputs_ignorados: evoIgnorados,
        toric_inputs_ignorados: toricIgnorados,
      },
      uncertainty: null,
      warnings: [
        astigmatico
          ? 'Motor de trazado: SOLO equivalente esférico. El caso es ASTIGMÁTICO y el '
            + 'optimizador raytrace actual no busca cilindro+eje (objetivos escalares A/C): '
            + "la dimensión tórica queda declarada UNSUPPORTED — no es un cero físico."
          : 'Motor de trazado: equivalente esférico (el caso no tiene astigmatismo queratométrico).',
        `Política corneal: ${r.parametros_declarados.cornea_policy}.`,
        'predicted_refraction = desenfoque equivalente (referencia LIO-posterior), no refracción de gafa.',
        ...(evoIgnorados.length > 0
          ? [`Entradas específicas de EVO ignoradas por el motor físico: ${evoIgnorados.join(', ')} `
            + '(la geometría procede de la IOLFactory inyectada; no se fingen consumidas).']
          : []),
        ...(toricIgnorados.length > 0
          ? [`Entradas tóricas no consumidas (dimensión UNSUPPORTED): ${toricIgnorados.join(', ')}.`]
          : []),
      ],
    });
  }
}
