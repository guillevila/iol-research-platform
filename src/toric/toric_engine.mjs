/**
 * toric_engine.mjs — motor tórico independiente (CAPA D — astigmatismo).
 *
 * Física propia; NO usa el modelo de córnea posterior PREDICHA del legacy (aquello
 * es una regresión ajustada a EVO). Aquí el astigmatismo corneal total se compone
 * exclusivamente de DATOS: queratometría anterior + córnea posterior MEDIDA (si
 * existe) + SIA declarado. Si la posterior no está medida, se usa solo la anterior
 * y el resultado lo declara (limitación conocida frente a calculadoras que la
 * predicen; véase LIMITATIONS.md).
 *
 * Método por meridianos (óptica de vergencias propia, paraxial.mjs):
 *  - potencias corneales del meridiano curvo/plano = K_media ± |TCA|/2;
 *  - la LIO tórica de cilindro c reparte ±c/2 entre meridianos (el EE es el label);
 *  - residual(c) = refracción_prevista(meridiano curvo, EE−c/2)
 *                − refracción_prevista(meridiano plano,  EE+c/2);
 *  - se elige el cilindro del catálogo que minimiza |residual| y el eje es el
 *    meridiano curvo del TCA (exacto; el redondeo es cosa de la presentación).
 *
 * RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING.
 */
import { mmToM } from '../core/units.mjs';
import { DEFAULT_FIDELITY_MODE, assertFidelityMode, enforceStrictness } from '../core/fidelity.mjs';
import { isIdentityPose } from '../core/pose.mjs';
import { predictedRefraction } from '../optics/paraxial.mjs';
import { corneaModelOf } from '../optics/eyebuilder.mjs';
import { toVec, fromVec, addVec, cylFromMeridians, siaVec } from './vectors.mjs';

/**
 * Astigmatismo corneal total (vector doble ángulo) a partir de datos medidos.
 * `posterior` opcional: { pk1_d, pk1_axis_deg, pk2_d, pk2_axis_deg } (potencias
 * firmadas de la cara posterior, típicamente negativas).
 */
export function totalCornealAstigmatism(preop, { sia_d = 0, sia_axis_deg = 0 } = {}) {
  let v = cylFromMeridians(preop.k1_d, preop.k1_axis_deg, preop.k2_d, preop.k2_axis_deg);
  const c = preop.cornea;
  const posteriorMeasured = typeof c.posterior_k1_d === 'number' && typeof c.posterior_k2_d === 'number'
    && typeof c.posterior_axis_deg === 'number';
  if (posteriorMeasured) {
    // ejes de la posterior: eje declarado (pk1) y su perpendicular (pk2)
    v = addVec(v, cylFromMeridians(c.posterior_k1_d, c.posterior_axis_deg, c.posterior_k2_d, c.posterior_axis_deg + 90));
  }
  if (sia_d > 0) v = addVec(v, siaVec(sia_d, sia_axis_deg));
  const { magnitude_d, steepAxis_deg } = fromVec(v);
  return { vec: v, magnitude_d, steepAxis_deg, posterior_included: posteriorMeasured };
}

/**
 * Recomendación tórica para un ojo postoperatorio previsto y una potencia EE dada.
 * `catalog_d` = lista de cilindros disponibles EN PLANO DE LIO (dato del fabricante,
 * inyectado; no se asume ninguno por defecto).
 */
export function recommendToric({ postop, sePower_d, catalog_d, target_d = 0, sia_d = 0, sia_axis_deg = 0, fidelity = DEFAULT_FIDELITY_MODE }) {
  if (!Array.isArray(catalog_d) || catalog_d.length === 0) throw new TypeError('catalog_d requerido (cilindros de fabricante)');
  assertFidelityMode(fidelity);
  // La vía tórica es paraxial por meridianos: no puede representar una pose de LIO.
  // Ignorarla en silencio sería el bypass que la caza de fidelidad ya cerró una vez —
  // se RECHAZA con remisión, hasta que el tórico trace (plan V1).
  if (!isIdentityPose(postop.iol_pose)) {
    throw new TypeError('recommendToric: pose de LIO declarada — el motor tórico paraxial '
      + 'por meridianos no puede representarla y no la va a ignorar en silencio. '
      + 'La vía de trazado (buildRaytraceEye) la honra; el tórico trazado llega con el plan V1.');
  }
  const preop = postop.preop;
  const cornea = corneaModelOf(preop);
  const tca = totalCornealAstigmatism(preop, { sia_d, sia_axis_deg });
  // Esta vía NO colapsa el astigmatismo (lo modela por meridianos), así que sus
  // supuestos son: los de la política corneal, y la posterior no medida si falta.
  // Antes esta función llegaba a predictedRefraction sin puerta ni registro
  // (bypass encontrado por la revisión adversarial de fidelidad).
  const supuestos = [
    ...cornea.assumptions.map(a => `cornea_policy: ${a}`),
    ...(tca.posterior_included ? [] : [
      'toric: córnea posterior NO medida — TCA compuesto solo de queratometría anterior + SIA declarado',
    ]),
  ];
  enforceStrictness(fidelity, supuestos, 'recommendToric');
  const base = { al_m: mmToM(preop.al_mm), iolPlane_m: mmToM(postop.iol_position_mm) };
  const refFor = (K_d, P_d) => predictedRefraction({ ...base, corneaPower_d: K_d, iolPower_d: P_d });
  const Ksteep = cornea.power_d + tca.magnitude_d / 2;
  const Kflat = cornea.power_d - tca.magnitude_d / 2;

  const evalCyl = c => {
    const refSteep = refFor(Ksteep, sePower_d - c / 2);
    const refFlat = refFor(Kflat, sePower_d + c / 2);
    const signed = refSteep - refFlat;            // <0 ⇒ sigue curvo el meridiano del TCA
    return {
      cylinder_d: c,
      residual_cyl_d: -Math.abs(signed),          // convención clínica: cilindro negativo
      residual_steep_axis_deg: signed < 0 ? tca.steepAxis_deg : (tca.steepAxis_deg + 90) % 180,
      predicted_se_d: (refSteep + refFlat) / 2,
      signed_residual_d: signed,
    };
  };

  const evals = catalog_d.map(evalCyl).sort((a, b) => Math.abs(a.residual_cyl_d) - Math.abs(b.residual_cyl_d));
  const best = evals[0], second = evals[1] ?? null;
  return {
    tca: { magnitude_d: tca.magnitude_d, steep_axis_deg: tca.steepAxis_deg, posterior_included: tca.posterior_included },
    recommended: best,
    alternative: second,
    delta_between_top2_d: second ? Math.abs(Math.abs(second.residual_cyl_d) - Math.abs(best.residual_cyl_d)) : null,
    implantation_axis_deg: tca.steepAxis_deg,
    cornea_kind: cornea.kind,
    cornea_policy: cornea.policy,
    // la córnea de ESTE motor es rotacionalmente simétrica (buildCorneaModel EE): el
    // TCA se compone VECTORIALMENTE sobre esa potencia media — que ningún consumidor
    // lea "two_surface_physical" como córnea astigmática FÍSICA (la trazada existe
    // desde V1.6 en toric_cornea.mjs, pero NO es la que usa este motor; caza V1.5)
    cornea_rotationally_symmetric: cornea.rotationally_symmetric,
    fidelity,
    supuestos_modelo: supuestos,
    warnings: [
      'RESEARCH USE ONLY - NOT FOR CLINICAL DECISION MAKING',
      ...(tca.posterior_included ? [] : ['Cornea posterior NO medida: TCA basado solo en queratometria anterior (+SIA); '
        + 'las calculadoras que PREDICEN la posterior daran sistematicamente otro cilindro.']),
    ],
  };
}
