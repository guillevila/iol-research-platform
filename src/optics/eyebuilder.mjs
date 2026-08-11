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
import { assertTraceableGeometry, ASSUMED_SPHERICAL, UNKNOWN } from '../core/iol.mjs';
import { FidelityMode, DEFAULT_FIDELITY_MODE, assertFidelityMode, enforceStrictness, StrictModeViolation } from '../core/fidelity.mjs';
import { predictedRefraction, predictedRefractionThickIOL, iolPowerForTarget, refract, transfer } from './paraxial.mjs';
import { buildCorneaModel, CorneaPolicy } from './cornea.mjs';
import { N_AIR, N_AQUEOUS, N_CORNEA, N_VITREOUS } from './constants.mjs';
import { sphericalSurface, conicSurface, transformedSurface } from './raytrace/surfaces.mjs';
import { isIdentityPose, rotationOfPose } from '../core/pose.mjs';
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
 * Supuestos del COLAPSO a equivalente esférico: los builders modelan la córnea con su
 * potencia MEDIA. Si el ojo tiene astigmatismo medido, ese dato del caso se está
 * ignorando aquí (la vía tórica sí lo modela) — se registra, no se calla (hallazgo de
 * la caza adversarial de fidelidad).
 */
function notasDeColapsoSE(preop) {
  const notas = [];
  const cyl = Math.abs(preop.k1_d - preop.k2_d);
  if (cyl > 1e-9) {
    notas.push(`cornea: astigmatismo queratométrico medido (${cyl.toFixed(2)} D) no modelado: `
      + 'cálculo de equivalente esférico sobre K media (la vía tórica sí lo modela)');
  }
  const c = preop.cornea ?? {};
  if (typeof c.posterior_k1_d === 'number' && typeof c.posterior_k2_d === 'number') {
    notas.push('cornea: toricidad posterior MEDIDA no usada en el equivalente esférico '
      + '(la vía tórica sí la compone)');
  }
  return notas;
}

/**
 * El modelo PARAXIAL es coaxial: no puede representar tilt ni descentración. Una pose
 * declarada con esos componentes se RECHAZA aquí (no se ignora: mismo patrón que la Q
 * documentada) y se remite a la vía de trazado, que la honra desde V1.3. La rotación
 * rotation_z sola se ACEPTA: para el equivalente esférico paraxial es exactamente
 * inerte (superficies de revolución).
 */
function rechazarPoseEnParaxial(postop, context) {
  const pose = postop.iol_pose;
  if (pose && (pose.tilt_total_deg !== 0 || pose.decenter_total_mm !== 0)) {
    throw new TypeError(`${context}: pose de LIO declarada (tilt ${pose.tilt_total_deg.toFixed(2)}°, `
      + `descentración ${pose.decenter_total_mm.toFixed(2)} mm) — el modelo paraxial coaxial no `
      + 'puede representarla. La vía de trazado (buildRaytraceEye/optimizePowerByRaytrace) '
      + 'la honra desde V1.3; se rechaza en lugar de ignorar un estado declarado.');
  }
}

/**
 * ¿Los planos principales de la lente NO coinciden con su centro geométrico?
 * Para una equibiconvexa (c1 = −c2) coinciden; para una lente asimétrica, posicionarla
 * por el centro reinterpreta el datum "plano principal" (OPEN_QUESTIONS #3) con un
 * sesgo axial real — medido ~0.3 mm (~0.4 D) en una asimétrica plausible.
 */
function centradoAsimetrico(iol) {
  const g = iol.geometry;
  const c1 = curvatureFromRadiusMm(g.r_anterior_mm, 'r_anterior_mm');
  const c2 = curvatureFromRadiusMm(g.r_posterior_mm, 'r_posterior_mm');
  return Math.abs(c1 + c2) > 1e-9;
}
const NOTA_CENTRADO = 'iol: lente asimétrica posicionada por su CENTRO geométrico; sus planos '
  + 'principales no coinciden con él — convención de posicionamiento pendiente (OPEN_QUESTIONS #3)';
const notaSurrogate = iol => `iol: geometría de SUSTITUTO DE SIMULACIÓN (${iol.geometry_status}) `
  + '— radios/índice/espesor declarados, no de la lente implantada';

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
export function buildParaxialEye(postop, { cornea: corneaOpts = {}, fidelity = DEFAULT_FIDELITY_MODE } = {}) {
  assertFidelityMode(fidelity);
  rechazarPoseEnParaxial(postop, 'buildParaxialEye');
  const preop = postop.preop;
  const cornea = corneaModelOf(preop, corneaOpts);
  // Los supuestos de la política corneal suben al nivel del ojo con prefijo propio: la
  // puerta STRICT opera sobre este registro (fidelity.mjs), no sobre lógica por sitio.
  // La ESFERICIDAD corneal no genera nota aquí: el EE paraxial usa solo la potencia
  // media (curvatura de vértice) y la asfericidad no altera el primer orden; lo que SÍ
  // se registra es el colapso del astigmatismo medido a esa media.
  const assumptions = [
    ...cornea.assumptions.map(a => `cornea_policy: ${a}`),
    ...notasDeColapsoSE(preop),
  ];
  enforceStrictness(fidelity, assumptions, 'buildParaxialEye');
  const base = {
    corneaPower_d: cornea.power_d,
    al_m: mmToM(preop.al_mm),
    iolPlane_m: mmToM(postop.iol_position_mm),
  };
  return {
    cornea_kind: cornea.kind,
    cornea_policy: cornea.policy,
    cornea,
    fidelity,
    assumptions,
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
      // La asfericidad y el cilindro NO bloquean aquí: la potencia EE paraxial es exacta
      // con la curvatura del vértice (Q entra a orden r⁴) y la etiqueta nominal ya es el
      // equivalente esférico. Lo que SÍ es un supuesto por lente: el sustituto de
      // simulación y el centrado geométrico de una lente asimétrica.
      const notas = [];
      if (iol.is_simulation_surrogate) notas.push(notaSurrogate(iol));
      if (centradoAsimetrico(iol)) notas.push(NOTA_CENTRADO);
      if (fidelity === FidelityMode.STRICT && notas.length > 0) {
        throw new StrictModeViolation('refractionForIOL', notas);
      }
      // registro PEREZOSO en RESEARCH: estos supuestos dependen de la lente evaluada,
      // así que se añaden al registro del ojo cuando efectivamente se evalúan (dedup)
      for (const nota of notas) if (!assumptions.includes(nota)) assumptions.push(nota);
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
export function buildRaytraceEye(postop, iol, { aperture_mm = 2.5, cornea: corneaOpts = {}, fidelity = DEFAULT_FIDELITY_MODE } = {}) {
  assertFidelityMode(fidelity);
  const preop = postop.preop;
  assertTraceableGeometry(iol, 'buildRaytraceEye');
  const g = iol.geometry;
  // Cilindro de la LIO: un cilindro DECLARADO ≠ 0 no es trazable todavía (no hay
  // superficies tóricas): se rechaza en lugar de trazar la esfera EE ignorando un dato
  // declarado. UNKNOWN se traza como esférica con el supuesto registrado. 0 = esférica
  // declarada, nada que registrar.
  if (typeof iol.cylinder_d === 'number' && iol.cylinder_d !== 0) {
    throw new TypeError(`buildRaytraceEye: cylinder_d=${iol.cylinder_d} D declarado, pero el `
      + 'trazador aún no implementa superficies tóricas. Se rechaza en lugar de ignorar '
      + 'un dato declarado (ver V1_PROJECT_PLAN.md).');
  }
  const surfaces = [];
  const assumptions = [];
  const cornea = corneaModelOf(preop, corneaOpts);
  // supuestos de la política corneal (mismos que en el paraxial, mismo prefijo)
  assumptions.push(...cornea.assumptions.map(a => `cornea_policy: ${a}`));
  // colapso a EE del astigmatismo medido: el trazador construye la córnea con la media
  assumptions.push(...notasDeColapsoSE(preop));
  // una lente genérica es EN SÍ un supuesto: sus radios/índice/espesor no proceden de
  // la lente implantada. En RESEARCH se registra; en STRICT bloquea vía la puerta.
  if (iol.is_simulation_surrogate) assumptions.push(notaSurrogate(iol));
  if (centradoAsimetrico(iol)) assumptions.push(NOTA_CENTRADO);
  if (iol.cylinder_d === UNKNOWN) {
    assumptions.push('iol: cilindro no documentado; trazada como esférica (SUPUESTO registrado)');
  }

  // Asfericidad de cada superficie de la LIO: tres estados, ninguno se convierte en otro
  // en silencio (misma disciplina que el índice queratométrico en P0.1).
  //   número           → constante cónica: se TRAZA como superficie cónica (V1.2);
  //   ASSUMED_SPHERICAL→ esfera por supuesto DECLARADO (sin nota en el sustituto, cuya
  //                      geometría entera ya está registrada; CON nota en lente real);
  //   UNKNOWN          → esfera con el supuesto REGISTRADO en la salida.
  const qDe = (q, id) => {
    if (typeof q === 'number') return;            // documentada/declarada: se traza tal cual
    if (q !== ASSUMED_SPHERICAL) {
      assumptions.push(`${id}: asfericidad no documentada (${String(q ?? UNKNOWN)}); `
        + 'superficie trazada como ESFERA — SUPUESTO registrado, no verificado');
    } else if (!iol.is_simulation_surrogate) {
      assumptions.push(`${id}: esfericidad ASUMIDA por el modelador (ASSUMED_SPHERICAL) `
        + 'sobre lente de fabricante — supuesto declarado, no dato');
    }
  };
  qDe(g.asphericity_q_anterior, 'iol_ant');
  qDe(g.asphericity_q_posterior, 'iol_post');
  /** esfera o cónica según el estado de Q — el despacho de V1.2 */
  const superficie = ({ id, zVertex_mm, radius_mm, q, n_before, n_after }) =>
    typeof q === 'number'
      ? conicSurface({ id, zVertex_mm, radius_mm, k: q, aperture_mm, n_before, n_after })
      : sphericalSurface({ id, zVertex_mm, radius_mm, aperture_mm, n_before, n_after });

  // Asfericidad corneal: si está MEDIDA (topografía) se traza cónica; si no, esfera
  // con el supuesto registrado POR SUPERFICIE. La superficie equivalente (política sin
  // radios) es una construcción, no una medida: lleva su propia nota.
  const qCorneaAnt = preop.cornea?.asphericity_q_anterior ?? null;
  const qCorneaPost = preop.cornea?.asphericity_q_posterior ?? null;
  let cornea_kind;
  if (cornea.r_posterior_mm !== null && typeof preop.cct_um === 'number') {
    cornea_kind = cornea.kind;                    // physical | assumed_ratio: dos superficies reales
    if (qCorneaAnt === null) {
      assumptions.push('cornea_ant: asfericidad no medida; superficie trazada como ESFERA — SUPUESTO registrado');
    }
    if (qCorneaPost === null) {
      assumptions.push('cornea_post: asfericidad no medida; superficie trazada como ESFERA — SUPUESTO registrado');
    }
    surfaces.push(superficie({ id: 'cornea_ant', zVertex_mm: 0, radius_mm: cornea.r_anterior_mm, q: qCorneaAnt, n_before: N_AIR, n_after: N_CORNEA }));
    surfaces.push(superficie({ id: 'cornea_post', zVertex_mm: preop.cct_um / 1000, radius_mm: cornea.r_posterior_mm, q: qCorneaPost, n_before: N_CORNEA, n_after: N_AQUEOUS }));
  } else {
    assumptions.push('cornea: superficie EQUIVALENTE trazada como esférica (construcción de la política corneal, no medida)');
    // si existe una Q corneal MEDIDA, la superficie equivalente no puede aplicarla:
    // dato medido no usado → se registra, no se calla (patrón prohibido)
    if (qCorneaAnt !== null || qCorneaPost !== null) {
      assumptions.push('cornea: asfericidad MEDIDA no usada — la superficie equivalente '
        + '(política sin radios/CCT) no puede aplicarla');
    }
    // UNA superficie aire→acuoso cuyo radio reproduce EXACTAMENTE la potencia que el
    // paraxial usa bajo la misma política ⇒ ambos motores son comparables sin supuestos
    // ocultos, cualquiera que sea la política elegida.
    cornea_kind = 'equivalent_single_surface';
    const r_mm = (N_AQUEOUS - N_AIR) * 1000 / cornea.power_d;
    surfaces.push(sphericalSurface({ id: 'cornea_eq', zVertex_mm: 0, radius_mm: r_mm, aperture_mm, n_before: N_AIR, n_after: N_AQUEOUS }));
  }
  const t = g.central_thickness_mm;
  const pose = postop.iol_pose;
  let iol_back_z;
  if (isIdentityPose(pose)) {
    // pose nula (o no declarada): vía V1.2 EXACTA, sin envoltorio — la recuperación es
    // estructural, no numérica
    const zAnt = postop.iol_position_mm - t / 2;
    surfaces.push(superficie({ id: 'iol_ant', zVertex_mm: zAnt, radius_mm: g.r_anterior_mm, q: g.asphericity_q_anterior, n_before: N_AQUEOUS, n_after: g.refractive_index }));
    surfaces.push(superficie({ id: 'iol_post', zVertex_mm: zAnt + t, radius_mm: g.r_posterior_mm, q: g.asphericity_q_posterior, n_before: g.refractive_index, n_after: N_VITREOUS }));
    iol_back_z = zAnt + t;
  } else {
    // marco LOCAL de la lente centrado en su centro geométrico (vértices en ∓t/2);
    // colocación global por transformación RÍGIDA — la matemática de esfera/cónica no
    // se duplica: el envoltorio mapea el rayo y reutiliza la intersección de la base
    const R = rotationOfPose(pose);
    const T = [pose.decenter_x_mm, pose.decenter_y_mm, postop.iol_position_mm];
    const baseAnt = superficie({ id: 'iol_ant', zVertex_mm: -t / 2, radius_mm: g.r_anterior_mm, q: g.asphericity_q_anterior, n_before: N_AQUEOUS, n_after: g.refractive_index });
    const basePost = superficie({ id: 'iol_post', zVertex_mm: t / 2, radius_mm: g.r_posterior_mm, q: g.asphericity_q_posterior, n_before: g.refractive_index, n_after: N_VITREOUS });
    surfaces.push(transformedSurface({ base: baseAnt, R, T }));
    const post_ = transformedSurface({ base: basePost, R, T });
    surfaces.push(post_);
    iol_back_z = post_.zVertex_mm;
  }
  // La puerta STRICT: con supuestos registrados, el trazado no se entrega. Se evalúa al
  // FINAL para que el error enumere TODOS los supuestos, no solo el primero.
  // La POSE no registra supuesto: es estado previsto DECLARADO (frontera de fidelidad),
  // y el trazador la representa de verdad — no hay imputación que registrar.
  enforceStrictness(fidelity, assumptions, 'buildRaytraceEye');
  return {
    surfaces, cornea_kind, cornea_policy: cornea.policy, cornea, fidelity,
    pose: pose ?? null,
    retina_z_mm: preop.al_mm, iol_back_z_mm: iol_back_z,
    /** supuestos de modelado ACTIVOS en este trazado; vacío no significa "sin supuestos
     *  declarados", significa "sin supuestos NO verificados" */
    assumptions,
  };
}

/**
 * Foco PARAXIAL del mismo sistema físico (vergencias sobre las mismas superficies),
 * para validación cruzada exacta con el trazador cuando h→0.
 * Devuelve la z absoluta (mm) del foco para objeto en infinito.
 */
export function paraxialFocusOfRaytraceEye(eye) {
  if (eye.pose && !isIdentityPose(eye.pose)) {
    throw new TypeError('paraxialFocusOfRaytraceEye: el límite paraxial COAXIAL no está '
      + 'definido para un sistema con tilt/descentración. La validación de sistemas '
      + 'posados usa reversibilidad, casos analíticos, simetría ±pose y continuidad '
      + 'pose→0 (tests/pose.test.mjs), no la puerta pupila→0 coaxial.');
  }
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
