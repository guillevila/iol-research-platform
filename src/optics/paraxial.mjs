/**
 * paraxial.mjs — motor óptico gaussiano propio (CAPA C, modelo paraxial).
 *
 * Física pura de vergencias reducidas; NINGÚN coeficiente ajustado a EVO.
 * Convenciones: potencias/vergencias en D; distancias de propagación en METROS
 * (las capas superiores convierten desde mm de forma explícita); luz viaja +z.
 *
 * Elementos: el sistema es una lista ordenada de
 *   { type:'refract', power_d }                       — dioptrio/elemento delgado
 *   { type:'gap', distance_m, n }                     — propagación en medio n
 *
 * RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING.
 */
import { assertFinite } from '../core/units.mjs';
import { N_AIR, N_AQUEOUS, N_CORNEA, N_VITREOUS, DEFAULT_VERTEX_M } from './constants.mjs';

/** Refracción en elemento de potencia P: V' = V + P. */
export function refract(V, P) {
  assertFinite(V, 'V'); assertFinite(P, 'P');
  return V + P;
}

/**
 * Propagación de vergencia reducida una distancia d (m) en medio de índice n:
 *   V' = V / (1 − (d/n)·V)
 * Singularidad física: si el haz enfoca exactamente en el plano destino, V'→∞.
 */
export function transfer(V, d_m, n) {
  assertFinite(V, 'V'); assertFinite(d_m, 'd'); assertFinite(n, 'n');
  const den = 1 - (d_m / n) * V;
  if (Math.abs(den) < 1e-12) throw new RangeError('transfer: foco en el plano destino (vergencia infinita)');
  return V / den;
}

/** Propaga una vergencia de entrada a través del sistema completo. */
export function propagate(system, V0 = 0) {
  let V = assertFinite(V0, 'V0');
  for (const el of system) {
    if (el.type === 'refract') V = refract(V, el.power_d);
    else if (el.type === 'gap') V = transfer(V, el.distance_m, el.n);
    else throw new TypeError('elemento desconocido: ' + JSON.stringify(el));
  }
  return V;
}

/**
 * Potencia corneal física de dos superficies (lente gruesa):
 *   P1 = (n_c − n_antes)/r1 ; P2 = (n_post − n_c)/r2 ; radios en METROS
 *   P  = P1 + P2 − (t/n_c)·P1·P2
 */
export function corneaPowerTwoSurfaces({ r_anterior_m, r_posterior_m, cct_m, nBefore = N_AIR, nCornea = N_CORNEA, nAfter = N_AQUEOUS }) {
  assertFinite(r_anterior_m, 'r_anterior'); assertFinite(r_posterior_m, 'r_posterior'); assertFinite(cct_m, 'cct');
  const P1 = (nCornea - nBefore) / r_anterior_m;
  const P2 = (nAfter - nCornea) / r_posterior_m;
  return { power_d: P1 + P2 - (cct_m / nCornea) * P1 * P2, P1, P2 };
}

/**
 * Ojo pseudofáquico paraxial mínimo (córnea delgada equivalente + LIO delgada):
 * la córnea se representa por una potencia total P_cornea (de 2 superficies si hay
 * radios; si no, la capa superior decide y lo documenta), la LIO delgada en su plano.
 *
 * Devuelve la potencia de LIO que enfoca en retina un objeto en infinito con
 * refracción de gafa `target_d` a vértice `vertex_m`:
 *
 *   V_gafa = target → V_córnea = target/(1 − v·target)
 *   V1 = V_córnea + P_córnea
 *   V2 = transfer(V1, d_LIO, n_acuoso)
 *   P_LIO = n_vítreo/(AL − d_LIO) − V2          [todas las distancias en m]
 */
export function iolPowerForTarget({ corneaPower_d, al_m, iolPlane_m, target_d = 0, vertex_m = DEFAULT_VERTEX_M, nAqueous = N_AQUEOUS, nVitreous = N_VITREOUS }) {
  assertFinite(corneaPower_d, 'corneaPower'); assertFinite(al_m, 'al'); assertFinite(iolPlane_m, 'iolPlane');
  if (!(iolPlane_m > 0 && iolPlane_m < al_m)) throw new RangeError('plano de LIO fuera del ojo');
  const Vcornea = target_d / (1 - vertex_m * target_d);
  const V1 = refract(Vcornea, corneaPower_d);
  const V2 = transfer(V1, iolPlane_m, nAqueous);
  const Vneeded = nVitreous / (al_m - iolPlane_m);
  return Vneeded - V2;
}

/**
 * Refracción de gafa prevista para una LIO delgada de potencia P dada.
 * Inversa exacta de iolPowerForTarget (round-trip verificado por test).
 */
export function predictedRefraction({ corneaPower_d, al_m, iolPlane_m, iolPower_d, vertex_m = DEFAULT_VERTEX_M, nAqueous = N_AQUEOUS, nVitreous = N_VITREOUS }) {
  assertFinite(iolPower_d, 'iolPower');
  if (!(iolPlane_m > 0 && iolPlane_m < al_m)) throw new RangeError('plano de LIO fuera del ojo');
  const Vneeded = nVitreous / (al_m - iolPlane_m);
  const V2 = Vneeded - iolPower_d;               // vergencia requerida a la entrada de la LIO
  const V1 = transfer(V2, -iolPlane_m, nAqueous); // deshacer la propagación córnea→LIO
  const Vcornea = V1 - corneaPower_d;
  const den = 1 + vertex_m * Vcornea;
  if (Math.abs(den) < 1e-12) throw new RangeError('refracción singular en el plano de gafa');
  return Vcornea / den;
}

/**
 * LIO GRUESA como par de superficies delgadas separadas: para el paraxial basta
 * el sistema [P_ant, gap(t, n_iol), P_post]; devuelve refracción prevista tratando
 * la posición como la de la superficie ANTERIOR de la lente.
 */
/*
 * NOTA sobre asfericidad: esta vía ignora asphericity_q_* DELIBERADAMENTE y es correcto,
 * no un relleno tácito: la óptica paraxial depende solo de la curvatura en el vértice, y
 * la constante cónica entra en la sagita a partir del término r⁴ — la potencia paraxial
 * de una superficie cónica es EXACTAMENTE la de su esfera osculatriz. El trazador de
 * rayos, que sí ve la sagita completa, es quien la traza (superficies cónicas desde V1.2).
 */
export function predictedRefractionThickIOL({ corneaPower_d, al_m, iolAnterior_m, iol, vertex_m = DEFAULT_VERTEX_M, nAqueous = N_AQUEOUS, nVitreous = N_VITREOUS }) {
  const g = iol.geometry;
  for (const k of ['refractive_index', 'central_thickness_mm', 'r_anterior_mm', 'r_posterior_mm']) {
    if (typeof g[k] !== 'number') throw new TypeError('LIO sin geometría numérica: ' + k);
  }
  const nI = g.refractive_index, t_m = g.central_thickness_mm / 1000;
  const P1 = (nI - nAqueous) / (g.r_anterior_mm / 1000);
  const P2 = (nVitreous - nI) / (g.r_posterior_mm / 1000);
  const backLen_m = al_m - iolAnterior_m - t_m;
  if (!(backLen_m > 0)) throw new RangeError('la LIO gruesa no cabe delante de la retina');
  // recorrido inverso desde la retina hasta la córnea
  const VafterP2 = nVitreous / backLen_m;
  const VbeforeP2 = VafterP2 - P2;
  const VafterP1 = transfer(VbeforeP2, -t_m, nI);
  const VbeforeP1 = VafterP1 - P1;
  const V1 = transfer(VbeforeP1, -iolAnterior_m, nAqueous);
  const Vcornea = V1 - corneaPower_d;
  return Vcornea / (1 + vertex_m * Vcornea);
}
