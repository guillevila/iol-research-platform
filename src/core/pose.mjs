/**
 * pose.mjs — pose rígida de la LIO: descentración, tilt e índice de rotación (V1.3).
 *
 * POR QUÉ NO BASTAN ESCALARES: "tilt 5°" y "descentración 0.5 mm" no determinan un
 * sistema óptico — falta la DIRECCIÓN. V1.3 es 3D, y en cuanto exista el tórico (V1.7)
 * la orientación relativa entre el eje del cilindro y la dirección del tilt/descentración
 * será exactamente lo que importe. Los antiguos campos escalares quedan eliminados del
 * modelo (usarlos es un error explícito, no un alias).
 *
 * CONVENCIÓN DE COORDENADAS (documentada, la misma del datum del proyecto)
 * ------------------------------------------------------------------------
 *  - Sistema DEXTRÓGIRO: +z hacia la retina; x/y son los ejes transversales del datum.
 *    El mapeo clínico (nasal/temporal/superior/inferior) requiere LATERALIDAD (OD/OS),
 *    que el modelo no captura todavía: registrado, no resuelto (ver OPEN_QUESTIONS #3).
 *  - PIVOTE: el centro geométrico de la LIO (el mismo datum de posicionamiento actual;
 *    la discrepancia centro↔planos principales sigue registrada, OQ #3).
 *  - TILT como VECTOR EJE-ÁNGULO: (tilt_x_deg, tilt_y_deg) define UNA rotación de
 *    ‖(tx,ty)‖ grados alrededor del eje unitario (tx,ty,0)/‖·‖ (regla de la mano
 *    derecha). tilt_x puro > 0 = rotación alrededor de +x: la parte superior de la
 *    lente (+y local) se inclina hacia +z (retina). Esta representación evita la
 *    ambigüedad de orden de Rx·Ry: dos componentes ⇒ una única rotación, sin convenio
 *    de composición que recordar.
 *  - rotation_z_deg: rotación alrededor del eje óptico LOCAL de la lente, aplicada
 *    ANTES del tilt:   p_global = T + R_tilt · Rz(rotation_z) · p_local
 *    con T = (decenter_x_mm, decenter_y_mm, iol_position_mm). Este orden es la
 *    convención fijada para el tórico (V1.7): rotation_z orienta el cilindro EN la
 *    lente y el tilt inclina la lente entera ya orientada. Con superficies de
 *    revolución, rotation_z es ópticamente INERTE — se aplica igualmente (aplicar una
 *    rotación a una superficie simétrica no es ignorar un dato: la física no depende
 *    de él, exactamente). Con caras TÓRICAS (bicónicas, V1.6) rotation_z es ACTIVA:
 *    es EL eje de implantación del cilindro (meridiano potente de fábrica en y local).
 *
 * La pose es ESTADO POSTOPERATORIO PREVISTO (frontera de fidelity.mjs): declararla es
 * declarar un escenario/predicción, no imputar un dato del caso. `null` = no declarada
 * (predicción por defecto: centrada). El trazador la honra (V1.3); el paraxial no puede
 * representarla y la RECHAZA en vez de ignorarla.
 *
 * RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING.
 */
import { assertFinite, degToRad } from './units.mjs';

/**
 * Procedencia de la pose (V1.5): la validación futura tendrá que distinguir una pose
 * OBSERVADA (imagen postoperatoria) de una PREDICHA o de un escenario de simulación.
 * No cambia hoy ninguna física ni ninguna puerta: es trazabilidad — como
 * `position_source` para la posición. `iol_pose: null` equivale a DEFAULT_CENTERED
 * (la predicción por defecto: centrada), sin objeto de pose.
 */
export const PoseSource = Object.freeze({
  MEASURED: 'MEASURED',                     // observada en imagen postoperatoria
  PREDICTED: 'PREDICTED',                   // salida de un predictor
  DECLARED_SCENARIO: 'DECLARED_SCENARIO',   // escenario de simulación (defecto al declarar)
  DEFAULT_CENTERED: 'DEFAULT_CENTERED',     // pose null: centrada por defecto
});

/** Límites de plausibilidad amplios (no clínicos): detectan unidades equivocadas. */
const MAX_TILT_DEG = 30;
const MAX_DECENTER_MM = 3;

export function createIOLPose({
  decenter_x_mm = 0, decenter_y_mm = 0,
  tilt_x_deg = 0, tilt_y_deg = 0,
  rotation_z_deg = 0,
  source = PoseSource.DECLARED_SCENARIO,
} = {}) {
  for (const [v, name] of [[decenter_x_mm, 'decenter_x_mm'], [decenter_y_mm, 'decenter_y_mm'],
    [tilt_x_deg, 'tilt_x_deg'], [tilt_y_deg, 'tilt_y_deg'], [rotation_z_deg, 'rotation_z_deg']]) {
    assertFinite(v, name);
  }
  if (!Object.values(PoseSource).includes(source)) {
    throw new TypeError(`pose source desconocido: ${String(source)}. `
      + `Válidos: ${Object.values(PoseSource).join(', ')}`);
  }
  const tilt_total_deg = Math.hypot(tilt_x_deg, tilt_y_deg);
  const decenter_total_mm = Math.hypot(decenter_x_mm, decenter_y_mm);
  if (tilt_total_deg > MAX_TILT_DEG) {
    throw new RangeError(`tilt total ${tilt_total_deg.toFixed(2)}° > ${MAX_TILT_DEG}°: fuera de plausibilidad (¿unidades?)`);
  }
  if (decenter_total_mm > MAX_DECENTER_MM) {
    throw new RangeError(`descentración total ${decenter_total_mm.toFixed(2)} mm > ${MAX_DECENTER_MM} mm: fuera de plausibilidad (¿unidades?)`);
  }
  return Object.freeze({
    kind: 'iol_pose',
    decenter_x_mm, decenter_y_mm, tilt_x_deg, tilt_y_deg, rotation_z_deg,
    tilt_total_deg, decenter_total_mm,
    source,
  });
}

/** Pose idéntica a la nula (la comparación es exacta: 0 declarado, no “casi cero”). */
export function isIdentityPose(pose) {
  return pose === null || pose === undefined || (
    pose.decenter_x_mm === 0 && pose.decenter_y_mm === 0
    && pose.tilt_x_deg === 0 && pose.tilt_y_deg === 0 && pose.rotation_z_deg === 0);
}

/**
 * Conversión desde la descripción clínica (magnitud + azimut) a componentes.
 *  - `tilt_axis_deg`: azimut del EJE de giro en el plano x-y (mod 360; el sentido lo da
 *    la regla de la mano derecha sobre ese eje).
 *  - `decenter_axis_deg`: azimut de la DIRECCIÓN de desplazamiento (mod 360).
 * Equivalencia exacta con las componentes (misma rotación, mismo vector): no hay dos
 * representaciones que puedan discrepar.
 */
export function poseFromClinical({
  tilt_deg = 0, tilt_axis_deg = 0,
  decenter_mm = 0, decenter_axis_deg = 0,
  rotation_z_deg = 0,
  source = PoseSource.DECLARED_SCENARIO,
} = {}) {
  assertFinite(tilt_deg, 'tilt_deg'); assertFinite(decenter_mm, 'decenter_mm');
  assertFinite(tilt_axis_deg, 'tilt_axis_deg'); assertFinite(decenter_axis_deg, 'decenter_axis_deg');
  if (tilt_deg < 0 || decenter_mm < 0) {
    throw new RangeError('magnitudes clínicas no negativas: la dirección la da el azimut');
  }
  const ta = degToRad(tilt_axis_deg), da = degToRad(decenter_axis_deg);
  return createIOLPose({
    tilt_x_deg: tilt_deg * Math.cos(ta),
    tilt_y_deg: tilt_deg * Math.sin(ta),
    decenter_x_mm: decenter_mm * Math.cos(da),
    decenter_y_mm: decenter_mm * Math.sin(da),
    rotation_z_deg,
    source,
  });
}

/** Pose opuesta (−t, −d, misma rotación z): la que usa el test de simetría ±pose. */
export function negatePose(pose) {
  return createIOLPose({
    decenter_x_mm: -pose.decenter_x_mm, decenter_y_mm: -pose.decenter_y_mm,
    tilt_x_deg: -pose.tilt_x_deg, tilt_y_deg: -pose.tilt_y_deg,
    rotation_z_deg: pose.rotation_z_deg,
    source: pose.source,
  });
}

// ---------- álgebra de la rotación (matrices 3×3 como arrays de filas) ----------

const matmul = (A, B) => A.map((fila, i) =>
  [0, 1, 2].map(j => fila[0] * B[0][j] + fila[1] * B[1][j] + fila[2] * B[2][j]));

/** Rodrigues para eje unitario en el plano x-y (az = 0). */
function rotationAboutInPlaneAxis(ax, ay, rad) {
  const c = Math.cos(rad), s = Math.sin(rad), C = 1 - c;
  // R = I + s·K + C·K²,  K = [[0,0,ay],[0,0,−ax],[−ay,ax,0]]
  return [
    [c + C * ax * ax, C * ax * ay, s * ay],
    [C * ax * ay, c + C * ay * ay, -s * ax],
    [-s * ay, s * ax, c],
  ];
}

/**
 * Matriz de rotación local→global de la pose:  R = R_tilt · Rz(rotation_z).
 * La inversa es la transpuesta (rotación pura); la traslación va aparte (T).
 */
export function rotationOfPose(pose) {
  const zr = degToRad(pose.rotation_z_deg);
  const Rz = [
    [Math.cos(zr), -Math.sin(zr), 0],
    [Math.sin(zr), Math.cos(zr), 0],
    [0, 0, 1],
  ];
  if (pose.tilt_total_deg === 0) return Rz;
  const ax = pose.tilt_x_deg / pose.tilt_total_deg;
  const ay = pose.tilt_y_deg / pose.tilt_total_deg;
  const Rt = rotationAboutInPlaneAxis(ax, ay, degToRad(pose.tilt_total_deg));
  return matmul(Rt, Rz);
}
