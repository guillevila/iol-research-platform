/**
 * eyebuilder.mjs — construye la descripción óptica paraxial de un ojo pseudofáquico
 * a partir de EyeModel + posición prevista + IOLModel (CAPA C).
 *
 * La política corneal NO vive aquí: se delega en `cornea.mjs`, que ofrece cuatro
 * políticas declaradas y obliga a que cada resultado diga bajo cuál se obtuvo. Este
 * módulo solo elige la más completa que los datos permiten (radios medidos → córnea
 * física de dos superficies) y respeta la que le indiquen (OPEN_QUESTIONS #7).
 *
 * RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING.
 */
import { mmToM, assertFinite, curvatureFromRadiusMm } from '../core/units.mjs';
import { assertTraceableGeometry } from '../core/iol.mjs';
import { predictedRefraction, predictedRefractionThickIOL, iolPowerForTarget, refract, transfer } from './paraxial.mjs';
import { buildCorneaModel, CorneaPolicy } from './cornea.mjs';
import { N_AIR, N_AQUEOUS, N_CORNEA, N_VITREOUS } from './constants.mjs';
import { sphericalSurface } from './raytrace/surfaces.mjs';
import { focusOfSystem } from './raytrace/trace.mjs';

/**
 * Modelo corneal del ojo. Si hay radios y CCT MEDIDOS se usa la córnea física de dos
 * superficies (la política más completa disponible); si no, se aplica la política
 * declarada en `opts.cornea` (por defecto la del dispositivo, ver cornea.mjs).
 *
 * La política elegida viaja en el objeto devuelto: ninguna capa de arriba puede
 * afirmar una potencia corneal sin poder decir bajo qué convención se obtuvo (H1).
 */
export function corneaModelOf(preop, opts = {}) {
  const c = preop.cornea;
  const medida = typeof c.r_anterior_mm === 'number'
    && typeof c.r_posterior_mm === 'number'
    && typeof preop.cct_um === 'number';
  const policy = medida && !opts.policy ? CorneaPolicy.TWO_SURFACE_MEASURED : opts.policy;
  return buildCorneaModel(preop, { ...opts, ...(policy ? { policy } : {}) });
}

/**
 * Ojo paraxial evaluable. `postop.iol_position_mm` es el plano de la LIO delgada, o
 * el plano CENTRAL de la gruesa (su cara anterior se recoloca en consecuencia).
 *
 * API DELIBERADAMENTE EXPLÍCITA (V0.5 / P0.2). Hay dos formas de evaluar y ninguna
 * puede confundirse con la otra:
 *   - `refractionForThinPower(P)` — lente DELGADA de potencia P (sin geometría);
 *   - `refractionForIOL(iolModel)` — lente GRUESA real: la potencia sale de su
 *     geometría, no de un argumento suelto.
 * La API anterior (`refractionFor(power)` que ignoraba `power` cuando había una LIO
 * gruesa inyectada) queda eliminada.
 */
export function buildParaxialEye(postop, { cornea: corneaOpts = {} } = {}) {
  const preop = postop.preop;
  const cornea = corneaModelOf(preop, corneaOpts);
  const base = {
    corneaPower_d: cornea.power_d,
    al_m: mmToM(preop.al_mm),
    iolPlane_m: mmToM(postop.iol_position_mm),
  };
  return {
    cornea_kind: cornea.kind,
    cornea_policy: cornea.policy,
    cornea,
    corneaPower_d: cornea.power_d,
    al_mm: preop.al_mm,
    iol_position_mm: postop.iol_position_mm,

    /** Refracción de gafa (D) para una LIO DELGADA de potencia `power_d`. */
    refractionForThinPower(power_d) {
      assertFinite(power_d, 'power_d');
      return predictedRefraction({ ...base, iolPower_d: power_d });
    },

    /**
     * Refracción de gafa (D) para una LIO GRUESA concreta. La potencia efectiva la
     * determina la GEOMETRÍA de `iol`; si no es trazable, falla explícitamente.
     * La lente se centra en `iol_position_mm` (cara anterior en pos − t/2).
     */
    refractionForIOL(iol) {
      assertTraceableGeometry(iol, 'refractionForIOL');
      const t_m = iol.geometry.central_thickness_mm / 1000;
      return predictedRefractionThickIOL({
        ...base,
        iolAnterior_m: base.iolPlane_m - t_m / 2,
        iol: { geometry: { ...iol.geometry } },
      });
    },

    /** Potencia exacta (continua) de LIO DELGADA que logra la diana. */
    exactPowerFor(target_d) {
      return iolPowerForTarget({ ...base, target_d });
    },
  };
}

/**
 * Sistema de superficies del ojo completo para el RAY TRACER.
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
export function buildRaytraceEye(postop, iol, { aperture_mm = 2.5, cornea: corneaOpts = {} } = {}) {
  const preop = postop.preop;
  assertTraceableGeometry(iol, 'buildRaytraceEye');
  const g = iol.geometry;
  const surfaces = [];
  const cornea = corneaModelOf(preop, corneaOpts);
  let cornea_kind;
  if (cornea.r_posterior_mm !== null && typeof preop.cct_um === 'number') {
    cornea_kind = cornea.kind;                    // physical | assumed_ratio: dos superficies reales
    surfaces.push(sphericalSurface({ id: 'cornea_ant', zVertex_mm: 0, radius_mm: cornea.r_anterior_mm, aperture_mm, n_before: N_AIR, n_after: N_CORNEA }));
    surfaces.push(sphericalSurface({ id: 'cornea_post', zVertex_mm: preop.cct_um / 1000, radius_mm: cornea.r_posterior_mm, aperture_mm, n_before: N_CORNEA, n_after: N_AQUEOUS }));
  } else {
    // UNA superficie aire→acuoso cuyo radio reproduce EXACTAMENTE la potencia que el
    // paraxial usa bajo la misma política ⇒ ambos motores son comparables sin supuestos
    // ocultos, cualquiera que sea la política elegida.
    cornea_kind = 'equivalent_single_surface';
    const r_mm = (N_AQUEOUS - N_AIR) * 1000 / cornea.power_d;
    surfaces.push(sphericalSurface({ id: 'cornea_eq', zVertex_mm: 0, radius_mm: r_mm, aperture_mm, n_before: N_AIR, n_after: N_AQUEOUS }));
  }
  const t = g.central_thickness_mm;
  const zAnt = postop.iol_position_mm - t / 2;
  surfaces.push(sphericalSurface({ id: 'iol_ant', zVertex_mm: zAnt, radius_mm: g.r_anterior_mm, aperture_mm, n_before: N_AQUEOUS, n_after: g.refractive_index }));
  surfaces.push(sphericalSurface({ id: 'iol_post', zVertex_mm: zAnt + t, radius_mm: g.r_posterior_mm, aperture_mm, n_before: g.refractive_index, n_after: N_VITREOUS }));
  return {
    surfaces, cornea_kind, cornea_policy: cornea.policy, cornea,
    retina_z_mm: preop.al_mm, iol_back_z_mm: zAnt + t,
  };
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
    // una superficie plana (o de radio infinito) tiene curvatura 0: potencia 0
    const P = s.kind === 'plane' ? 0 : (s.n_after - s.n_before) * curvatureFromRadiusMm(s.radius_mm);
    const zs = s.kind === 'plane' ? s.z_mm : s.zVertex_mm;
    if (z === null) {
      V = refract(V, P);
    } else {
      V = transfer(V, mmToM(zs - z), s.n_before);
      V = refract(V, P);
    }
    z = zs;
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
