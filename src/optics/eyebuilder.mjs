/**
 * eyebuilder.mjs — construye la descripción óptica paraxial de un ojo pseudofáquico
 * a partir de EyeModel + posición prevista + IOLModel (CAPA C, Sprint 4 parcial).
 *
 * Política corneal (documentada, sin rellenos silenciosos):
 *  - si hay radios anterior Y posterior medidos → córnea física de 2 superficies;
 *  - si no → potencia corneal = lectura queratométrica media, marcada como
 *    'keratometric_reading' (convención del dispositivo, OPEN_QUESTIONS #1/#3).
 *
 * RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING.
 */
import { mmToM } from '../core/units.mjs';
import { corneaPowerTwoSurfaces, predictedRefraction, predictedRefractionThickIOL, iolPowerForTarget, refract, transfer } from './paraxial.mjs';
import { N_AIR, N_AQUEOUS, N_CORNEA, N_VITREOUS } from './constants.mjs';
import { sphericalSurface } from './raytrace/surfaces.mjs';
import { focusOfSystem } from './raytrace/trace.mjs';

export function corneaModelOf(preop) {
  const c = preop.cornea;
  if (typeof c.r_anterior_mm === 'number' && typeof c.r_posterior_mm === 'number' && typeof preop.cct_um === 'number') {
    const { power_d } = corneaPowerTwoSurfaces({
      r_anterior_m: mmToM(c.r_anterior_mm),
      r_posterior_m: mmToM(c.r_posterior_mm),
      cct_m: preop.cct_um / 1e6,
    });
    return { power_d, kind: 'two_surface_physical' };
  }
  return { power_d: preop.mean_k_d, kind: 'keratometric_reading' };
}

/**
 * Ojo paraxial evaluable. `postop.iol_position_mm` es el plano de la LIO (delgada)
 * o el plano CENTRAL de la gruesa (se recoloca su cara anterior en consecuencia).
 */
export function buildParaxialEye(postop, iol = null) {
  const preop = postop.preop;
  const cornea = corneaModelOf(preop);
  const base = {
    corneaPower_d: cornea.power_d,
    al_m: mmToM(preop.al_mm),
    iolPlane_m: mmToM(postop.iol_position_mm),
  };
  const thick = iol && iol.geometry && ['refractive_index', 'central_thickness_mm', 'r_anterior_mm', 'r_posterior_mm']
    .every(k => typeof iol.geometry[k] === 'number');
  return {
    cornea_kind: cornea.kind,
    corneaPower_d: cornea.power_d,
    al_mm: preop.al_mm,
    iol_position_mm: postop.iol_position_mm,
    /** refracción de gafa prevista para una potencia dada (D) */
    refractionFor(power_d) {
      if (thick) {
        const t_m = iol.geometry.central_thickness_mm / 1000;
        return predictedRefractionThickIOL({
          ...base, iolAnterior_m: base.iolPlane_m - t_m / 2,
          iol: { geometry: { ...iol.geometry } },
        });
      }
      return predictedRefraction({ ...base, iolPower_d: power_d });
    },
    /** potencia exacta (continua) que logra la diana, con LIO delgada */
    exactPowerFor(target_d) {
      return iolPowerForTarget({ ...base, target_d });
    },
  };
}

/**
 * Sistema de superficies del ojo completo para el RAY TRACER (Sprint 4).
 *
 * Córnea, dos modos documentados (misma política que el paraxial):
 *  - 'two_surface_physical': radios anterior/posterior + CCT medidos;
 *  - 'equivalent_single_surface': UNA superficie aire→acuoso cuyo radio reproduce
 *    exactamente la potencia de la lectura queratométrica media:
 *       r_mm = (n_aq − 1)·1000 / K_media
 *    (reducción declarada; coincide con la potencia corneal usada por el paraxial,
 *    por lo que ambos motores son comparables sin supuestos ocultos).
 *
 * LIO: requiere geometría numérica completa (la genérica etiquetada la aporta);
 * se centra en `postop.iol_position_mm` (cara anterior en pos − t/2).
 */
export function buildRaytraceEye(postop, iol, { aperture_mm = 2.5 } = {}) {
  const preop = postop.preop;
  const g = iol?.geometry;
  for (const k of ['refractive_index', 'central_thickness_mm', 'r_anterior_mm', 'r_posterior_mm']) {
    if (typeof g?.[k] !== 'number') throw new TypeError('buildRaytraceEye: LIO sin geometría numérica (' + k + ')');
  }
  const surfaces = [];
  const c = preop.cornea;
  let cornea_kind;
  if (typeof c.r_anterior_mm === 'number' && typeof c.r_posterior_mm === 'number' && typeof preop.cct_um === 'number') {
    cornea_kind = 'two_surface_physical';
    surfaces.push(sphericalSurface({ id: 'cornea_ant', zVertex_mm: 0, radius_mm: c.r_anterior_mm, aperture_mm, n_before: N_AIR, n_after: N_CORNEA }));
    surfaces.push(sphericalSurface({ id: 'cornea_post', zVertex_mm: preop.cct_um / 1000, radius_mm: c.r_posterior_mm, aperture_mm, n_before: N_CORNEA, n_after: N_AQUEOUS }));
  } else {
    cornea_kind = 'equivalent_single_surface';
    const r_mm = (N_AQUEOUS - 1) * 1000 / preop.mean_k_d;
    surfaces.push(sphericalSurface({ id: 'cornea_eq', zVertex_mm: 0, radius_mm: r_mm, aperture_mm, n_before: N_AIR, n_after: N_AQUEOUS }));
  }
  const t = g.central_thickness_mm;
  const zAnt = postop.iol_position_mm - t / 2;
  surfaces.push(sphericalSurface({ id: 'iol_ant', zVertex_mm: zAnt, radius_mm: g.r_anterior_mm, aperture_mm, n_before: N_AQUEOUS, n_after: g.refractive_index }));
  surfaces.push(sphericalSurface({ id: 'iol_post', zVertex_mm: zAnt + t, radius_mm: g.r_posterior_mm, aperture_mm, n_before: g.refractive_index, n_after: N_VITREOUS }));
  return { surfaces, cornea_kind, retina_z_mm: preop.al_mm, iol_back_z_mm: zAnt + t };
}

/**
 * Foco PARAXIAL del mismo sistema físico (vergencias sobre las mismas superficies),
 * para validación cruzada exacta con el trazador cuando h→0.
 * Devuelve la z absoluta (mm) del foco para objeto en infinito.
 */
export function paraxialFocusOfRaytraceEye(eye) {
  let V = 0;
  let z = null;
  let nAfterLast = null;
  for (const s of eye.surfaces) {
    const P = (s.n_after - s.n_before) / mmToM(s.radius_mm);
    if (z === null) {
      V = refract(V, P);
    } else {
      V = transfer(V, mmToM(s.zVertex_mm - z), s.n_before);
      V = refract(V, P);
    }
    z = s.zVertex_mm;
    nAfterLast = s.n_after;
  }
  return z + 1000 * nAfterLast / V;
}

/**
 * Compara foco paraxial vs mejor foco trazado del ojo completo.
 * `heights_mm` bajo → validación; alturas clínicas → aberración esférica.
 * ΔD equivalente = n_v/L_par − n_v/L_rt medidos desde la cara posterior de la LIO.
 */
export function compareParaxialVsRaytrace(eye, { heights_mm = [0.05, 0.1, 0.15, 0.2] } = {}) {
  const zPar = paraxialFocusOfRaytraceEye(eye);
  const f = focusOfSystem(eye.surfaces, { heights_mm, zSearchTo_mm: eye.retina_z_mm + 20 });
  const L = z => mmToM(z - eye.iol_back_z_mm);
  const dD = N_VITREOUS / L(zPar) - N_VITREOUS / L(f.bestFocus_mm);
  return {
    paraxialFocus_mm: zPar,
    tracedFocus_mm: f.bestFocus_mm,
    delta_mm: f.bestFocus_mm - zPar,
    equivalentDefocus_d: dD,
    spotRms_mm: f.spotRms_mm,
    raysLost: f.raysLost.length,
  };
}
