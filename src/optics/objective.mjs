/**
 * objective.mjs — qué significa "la mejor potencia" cuando la pupila no es un punto
 * (V1.1, CAPA E; revisado antes de V1.2).
 *
 * EL PROBLEMA QUE ESTE MÓDULO HACE EXPLÍCITO
 * ------------------------------------------
 * En óptica paraxial todos los rayos cortan el eje en el MISMO punto, así que "el foco"
 * existe y "enfocar en la retina" no necesita definición. Con pupila real eso es falso:
 * la aberración esférica hace que cada zona de la pupila corte en un sitio distinto. No
 * hay un foco, hay una distribución. Elegir potencia exige entonces decir **qué se
 * optimiza**.
 *
 * DOS objetivos, no tres — y por qué (revisión pre-V1.2)
 * ------------------------------------------------------
 * La versión inicial ofrecía tres criterios: A (mínimo RMS en retina), B (mejor foco
 * sobre la retina) y C (desenfoque equivalente nulo). La revisión demostró que **B y C
 * no son criterios independientes**: son el mismo criterio en unidades distintas, y
 * mantenerlos como objetivos separados era una redundancia heredada de la especificación,
 * no una decisión óptica. B se eliminó como objetivo y su magnitud (desplazamiento del
 * mejor foco, en mm) quedó como métrica REPORTADA dentro de C.
 *
 * DEMOSTRACIÓN de la equivalencia B ≡ C como criterios de optimización
 * --------------------------------------------------------------------
 * Sea z*(P) el plano de mejor foco (mínimo RMS axial) del haz trazado con potencia P —
 * ambos criterios lo calculan con LA MISMA llamada a `bestFocus`. Sea z_ret la retina y
 * z_ref la referencia (cara posterior de la LIO). Definiendo, para z > z_ref,
 *
 *     φ(z) = n/L_ret − n/L(z),   con  L(z) = (z − z_ref)/1000  y  L_ret = L(z_ret),
 *
 * se tiene   coste_B(P) = |z*(P) − z_ret|   y   coste_C(P) = |φ(z*(P))|.
 *
 * HIPÓTESIS. Dos son estructurales del código y una es empírica del motor; ninguna se
 * da por supuesta (una versión anterior de esta demostración presentaba la unimodalidad
 * como deducida, y una revisión adversarial señaló correctamente que no lo es):
 *
 *   H1 (estructural) z*(P) > z_ref siempre: la búsqueda de `bestFocus` arranca en
 *      z_ref + 0.05 mm y la cara posterior de la LIO es la última superficie del
 *      sistema. En ese dominio φ es estrictamente creciente
 *      (dφ/dz = n·1000/(z−z_ref)² > 0) y φ(z_ret) = 0.
 *   H2 (estructural) el conjunto de rayos evaluado no cambia con P (sin pérdidas). Con
 *      pérdidas, z*(P) podría saltar discontinuamente y el cero volverse inalcanzable.
 *      Los tests de equivalencia lo VERIFICAN en cada barrido (raysLost = 0) y V1.13
 *      lo vigila con pupila clínica sobre la rejilla completa.
 *   H3 (empírica)    z*(P) es continua y estrictamente decreciente en P. Es una
 *      propiedad medida del motor, no un teorema: la fija el test
 *      'z*(P) es estrictamente decreciente' sobre varios ojos y aperturas.
 *
 * De H1: φ(z) = 0 ⇔ z = z_ret y sign(φ(z)) = sign(z − z_ret). Con H3, z*(P) cruza z_ret
 * a lo sumo una vez, en P*: ambos costes se anulan exactamente ahí y, por composición de
 * |·| con una función estrictamente monótona de P, ambos son unimodales en P con el
 * MISMO minimizador P*. ∎ (del argmin común; la búsqueda se trata aparte, abajo)
 *
 * SOBRE LA BÚSQUEDA — el punto delicado. NO basta afirmar que "ambos costes ordenan
 * igual": es falso entre puntos a lados OPUESTOS de P*, porque φ es convexa (la escala
 * dióptrica es asimétrica: más D/mm en el lado miope) y puede invertir el orden de B
 * respecto a C — y la sección áurea hace comparaciones entre lados. Lo que garantiza el
 * mismo resultado es el INVARIANTE DE BRACKET: sobre una función unimodal, cada paso de
 * la sección áurea descarta un tramo que NO contiene el minimizador, sea cual sea el
 * lado que el orden local le haga descartar; ambas búsquedas mantienen a P* dentro del
 * bracket en todo momento y convergen a él hasta la tolerancia, aunque sus trayectorias
 * intermedias difieran. `tests/objective_equivalence.test.mjs` verifica las dos mitades
 * del fenómeno: que existen pares a lados opuestos donde B y C ordenan DISTINTO (el
 * reorden es real, no hipotético) y que aun así sus argmin coinciden.
 *
 * Donde la equivalencia NO llega: elegir entre DOS escalones discretos de catálogo que
 * caen a lados opuestos de P* es una única comparación entre lados, sin bracket que la
 * proteja: ahí B (mm) y C (D) podrían desempatar distinto. La asimetría relativa es
 * ≈ 2·|Δz|/L_ret; con la pendiente medida en el ojo de referencia (~3.9 D/mm), el
 * semiescalón de un catálogo de 0.5 D son ~0.065 mm ⇒ ~0.7 % de asimetría — solo empates
 * al filo de la navaja. C se conserva como objetivo porque su coste está en dioptrías —
 * la unidad comparable entre ojos y con los umbrales clínicos; el desplazamiento en mm
 * (la métrica de B) se reporta en `detail.desplazamiento_mm`.
 *
 * A sí es independiente: minimiza el RMS EN el plano retiniano, y con aberración su
 * óptimo NO coincide con llevar el mejor foco a la retina (exp008 lo cuantifica:
 * ~0.0004–0.04 D según pupila, con superficies esféricas). Un tercer criterio
 * genuinamente independiente (p. ej. métrica robusta integrada en profundidad de foco)
 * queda registrado como candidato en OPEN_QUESTIONS #8 para cuando la asfericidad y el
 * tilt rompan la simetría que hoy mantiene pequeñas estas diferencias.
 *
 * Con pupila → 0 TODOS los criterios convergen entre sí y al paraxial del mismo sistema:
 * sin aberración no hay diferencia posible. Hay tests que lo vigilan (V1.13).
 *
 * REQUISITO REGISTRADO PARA EL TÓRICO (V1.5 → plan V1.6): los objetivos de este módulo
 * son ESCALARES — colapsan el spot 2D a un número (RMS radial o desenfoque axial). Un
 * sistema TÓRICO tiene dos líneas focales y un EJE: reducirlo a un escalar destruye
 * exactamente la información que el tórico necesita (magnitud Y orientación del
 * astigmatismo residual). Antes de usar el trazado para optimización tórica debe
 * existir una descripción 2D del spot — matriz de SEGUNDO MOMENTO con ejes principales
 * y orientación, o métrica equivalente que conserve astigmatismo y eje. PROHIBIDO
 * forzar el sistema tórico dentro del objetivo C actual.
 *
 * Convenio de signo del residuo: **positivo = la luz enfoca por DETRÁS de la retina**
 * (ojo hipermétrope), que es el signo de la refracción de gafa necesaria para corregirlo.
 *
 * RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING.
 */
import { assertFinite } from '../core/units.mjs';
import { N_VITREOUS } from './constants.mjs';
import { traceRay, spotRmsAt, bestFocus } from './raytrace/trace.mjs';

export const ObjectiveKind = Object.freeze({
  SPOT_RMS_AT_RETINA: 'SPOT_RMS_AT_RETINA',
  EQUIVALENT_DEFOCUS: 'EQUIVALENT_DEFOCUS',
});

/**
 * Traza un haz por el sistema y devuelve los rayos emergentes, contabilizando pérdidas.
 * Las pérdidas NO se ocultan: un objetivo evaluado con la mitad del haz perdido no es
 * comparable con otro evaluado entero.
 */
export function traceBundle(surfaces, bundle) {
  const out = [], lost = [];
  for (const r0 of bundle) {
    const tr = traceRay(surfaces, r0);
    if (tr.ok) out.push(tr.ray); else lost.push({ ray0: r0, reason: tr.reason, at: tr.at });
  }
  return { rays: out, lost };
}

/**
 * Desenfoque equivalente (D) de un plano de foco respecto a la retina.
 *
 *   ΔD = n_vítreo · (1/L_retina − 1/L_foco),  distancias desde la cara posterior de la
 *   LIO, en metros.
 *
 * Es la forma estándar de convertir un desplazamiento axial en dioptrías: la vergencia
 * que habría que añadir para llevar el foco de un plano al otro. Signo positivo cuando el
 * foco cae por detrás de la retina. Es la φ de la demostración de cabecera: estrictamente
 * creciente en z_foco y nula exactamente en la retina.
 */
export function equivalentDefocus_d(zFoco_mm, zRetina_mm, zReferencia_mm, n = N_VITREOUS) {
  assertFinite(zFoco_mm, 'zFoco_mm');
  assertFinite(zRetina_mm, 'zRetina_mm');
  assertFinite(zReferencia_mm, 'zReferencia_mm');
  const Lf = (zFoco_mm - zReferencia_mm) / 1000;
  const Lr = (zRetina_mm - zReferencia_mm) / 1000;
  if (!(Lf > 0) || !(Lr > 0)) {
    throw new RangeError('equivalentDefocus: foco o retina no están por detrás de la referencia');
  }
  return n / Lr - n / Lf;
}

/**
 * Evalúa un objetivo sobre un ojo trazado.
 *
 * @param eye      salida de `buildRaytraceEye` (superficies + retina_z_mm + iol_back_z_mm)
 * @param bundle   rayos de entrada (ver bundle.mjs / defaultBundle)
 * @param kind     ObjectiveKind
 * @returns {{
 *   kind: string, cost: number, residual_d: number|null,
 *   spotRms_mm: number, bestFocus_mm: number|null, raysTraced: number, raysLost: number,
 *   detail: object
 * }}
 *   `cost` es lo que el optimizador MINIMIZA (siempre ≥ 0).
 *   `residual_d` es la magnitud FIRMADA e interpretable en dioptrías (+ = hipermétrope);
 *   es null para el objetivo A, cuyo coste no es una dioptría.
 */
export function evaluateObjective(eye, bundle, kind = ObjectiveKind.EQUIVALENT_DEFOCUS) {
  if (!Object.values(ObjectiveKind).includes(kind)) {
    throw new TypeError(`objetivo desconocido: ${kind}. Válidos: ${Object.values(ObjectiveKind).join(', ')}`
      + (kind === 'BEST_FOCUS_ON_RETINA'
        ? '. BEST_FOCUS_ON_RETINA se eliminó como objetivo: es equivalente a '
          + 'EQUIVALENT_DEFOCUS para optimización (mismo argmin; ver demostración en la '
          + 'cabecera de objective.mjs). Su métrica se reporta en detail.desplazamiento_mm.'
        : ''));
  }
  // Un haz PLANAR (meridional: todo en el plano x=0) sobre un ojo POSADO mediría un
  // solo corte de un sistema sin simetría de revolución — y devolvería un número
  // plausible en silencio. La guarda del optimizador se replica aquí porque este
  // evaluador también es API pública.
  if (eye.pose && (eye.pose.tilt_total_deg !== 0 || eye.pose.decenter_total_mm !== 0)
    && bundle.every(r => r.p[0] === 0 && r.d[0] === 0)) {
    throw new TypeError(`objetivo ${kind}: haz meridional (planar en x=0) sobre un ojo `
      + 'con pose — un sistema sin simetría de revolución exige muestreo 2D (bundle.mjs).');
  }
  const { rays, lost } = traceBundle(eye.surfaces, bundle);
  if (rays.length < 2) {
    throw new RangeError(`objetivo ${kind}: haz insuficiente (${rays.length} rayos, `
      + `${lost.length} perdidos: ${JSON.stringify(lost.slice(0, 3).map(l => l.reason))})`);
  }
  const zRet = eye.retina_z_mm;
  const rmsRetina = spotRmsAt(rays, zRet);
  const base = { raysTraced: rays.length, raysLost: lost.length, spotRms_mm: rmsRetina };

  if (kind === ObjectiveKind.SPOT_RMS_AT_RETINA) {
    // el coste ES el tamaño del spot en retina; no hay conversión a dioptrías porque un
    // RMS no es un desenfoque (dos desenfoques opuestos dan el mismo RMS)
    return {
      kind, cost: rmsRetina, residual_d: null, bestFocus_mm: null, ...base,
      detail: { criterio: 'radio RMS del spot en el plano retiniano (mm)' },
    };
  }

  // EQUIVALENT_DEFOCUS: localizar el plano de mejor foco y convertir a dioptrías
  const zUltima = Math.max(...eye.surfaces.map(s => s.kind === 'plane' ? s.z_mm : s.zVertex_mm));
  const foco = bestFocus(rays, zUltima + 0.05, zRet + 15);
  const dD = equivalentDefocus_d(foco.z_mm, zRet, eye.iol_back_z_mm);
  return {
    kind, cost: Math.abs(dD), residual_d: dD,
    bestFocus_mm: foco.z_mm, ...base,
    detail: {
      criterio: 'desenfoque equivalente del mejor foco respecto a la retina (D)',
      signo: '+ = enfoca por detrás de la retina (hipermétrope)',
      // métrica del antiguo objetivo B, ahora reportada: mismo cero, misma monotonía
      desplazamiento_mm: foco.z_mm - zRet,
      rms_en_mejor_foco_mm: foco.rms_mm,
    },
  };
}

/** Etiqueta legible de un objetivo, para incluir en resultados y avisos. */
export function describeObjective(kind) {
  switch (kind) {
    case ObjectiveKind.SPOT_RMS_AT_RETINA:
      return 'A · mínimo RMS del spot en retina (privilegia nitidez en el plano de la imagen)';
    case ObjectiveKind.EQUIVALENT_DEFOCUS:
      return 'C · desenfoque equivalente nulo (mejor foco sobre la retina, medido en dioptrías; '
        + 'el desplazamiento en mm se reporta como métrica)';
    default:
      throw new TypeError(`objetivo desconocido: ${kind}`);
  }
}
