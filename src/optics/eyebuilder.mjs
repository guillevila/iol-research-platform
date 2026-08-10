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
import { corneaPowerTwoSurfaces, predictedRefraction, predictedRefractionThickIOL, iolPowerForTarget } from './paraxial.mjs';

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
