/**
 * iol_factory.mjs — fábricas de LIO conscientes de la potencia (V0.5 / P0.2-P0.3).
 *
 * MOTIVO (auditoría V0, hallazgo H2): antes era posible pedir una refracción para
 * una potencia mientras se trazaba una geometría fija distinta. Con estas fábricas,
 * **cada potencia produce su propia geometría**, así que ese desacoplamiento deja de
 * ser expresable.
 *
 * Contrato común:
 *     factory.id
 *     factory.create({ power_d, cylinder_d }) -> IOLModel
 *
 * RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING.
 */
import { assertFinite, assertInRange } from './units.mjs';
import { createIOL, GeometryStatus, UNKNOWN, ASSUMED_SPHERICAL } from './iol.mjs';
import { N_AQUEOUS } from '../optics/constants.mjs';

/**
 * Lente GENÉRICA de simulación: equibiconvexa cuyo único dato real es la potencia.
 * Índice y espesor son PARÁMETROS DE SIMULACIÓN DECLARADOS (no datos de fabricante);
 * los radios se derivan de la ecuación del constructor de lentes (lensmaker) para que
 * la potencia física en el medio sea exactamente la nominal:
 *
 *   P = D·(1/R1 − 1/R2) + t·D²/(n·R1·R2),  con R2 = −R1  (equibiconvexa)
 *   ⇒ (t·D²/n)·x² − 2D·x + P = 0,  x = 1/R1   [rama continua con la lente delgada]
 *
 * No representa ninguna lente comercial: `is_simulation_surrogate = true`.
 */
export class GenericIOLFactory {
  /**
   * `q_anterior`/`q_posterior`: asfericidad DECLARADA de las caras del sustituto de
   * simulación (número = constante cónica declarada; por defecto ASSUMED_SPHERICAL).
   * Es un parámetro de simulación más, como el índice o el espesor — NO un dato de
   * fabricante: la lente sigue siendo is_simulation_surrogate.
   */
  constructor({ n_iol = 1.49, thickness_mm = 0.8, n_medium = N_AQUEOUS, label = 'GENERIC_EQUICONVEX',
    q_anterior = ASSUMED_SPHERICAL, q_posterior = ASSUMED_SPHERICAL } = {}) {
    assertInRange(n_iol, 1.3, 1.8, 'n_iol');
    assertInRange(thickness_mm, 0.05, 2.5, 'thickness_mm');
    assertInRange(n_medium, 1.0, 1.6, 'n_medium');
    for (const [q, name] of [[q_anterior, 'q_anterior'], [q_posterior, 'q_posterior']]) {
      if (q !== ASSUMED_SPHERICAL && !(typeof q === 'number' && Number.isFinite(q))) {
        throw new TypeError(`GenericIOLFactory: ${name} debe ser un número (Q declarada) o ASSUMED_SPHERICAL`);
      }
    }
    this.n_iol = n_iol;
    this.thickness_mm = thickness_mm;
    this.n_medium = n_medium;
    this.q_anterior = q_anterior;
    this.q_posterior = q_posterior;
    this.label = label;
    const qTag = (q_anterior === ASSUMED_SPHERICAL && q_posterior === ASSUMED_SPHERICAL)
      ? '' : `_q${q_anterior}/${q_posterior}`;
    this.id = `generic_n${n_iol}_t${thickness_mm}${qTag}`;
  }

  /**
   * Radio anterior (mm) que realiza `power_d` con esta geometría declarada.
   * El caso plano (P=0) NO se trata aparte: la raíz continua de la cuadrática vale
   * exactamente x=0 ⇒ r=Infinity, que es la respuesta correcta. Un sentinela finito
   * ("r muy grande") introduciría una potencia residual espuria.
   */
  radiusForPower(power_d) {
    assertFinite(power_d, 'power_d');
    const D = this.n_iol - this.n_medium;
    const t_m = this.thickness_mm / 1000;
    const a = t_m * D * D / this.n_iol, b = -2 * D, c = power_d;
    const disc = b * b - 4 * a * c;
    if (disc <= 0) {
      throw new RangeError(`potencia ${power_d} D irrealizable con la genérica declarada `
        + `(n=${this.n_iol}, t=${this.thickness_mm} mm)`);
    }
    const x = (-b - Math.sqrt(disc)) / (2 * a);          // rama continua con lente delgada
    return 1000 / x;
  }

  create({ power_d, cylinder_d = 0 }) {
    const r1 = this.radiusForPower(power_d);
    return createIOL({
      manufacturer: 'GENERIC',
      model: `${this.label}_${power_d}D`,
      nominal_power_d: power_d,
      cylinder_d,
      geometry: {
        kind: 'thick_lens',
        refractive_index: this.n_iol,
        central_thickness_mm: this.thickness_mm,
        r_anterior_mm: r1,
        r_posterior_mm: -r1,
        // la genérica es un sustituto de simulación cuya geometría ENTERA es declarada:
        // esferas por decisión (o la Q declarada del constructor), no por desconocimiento
        asphericity_q_anterior: this.q_anterior,
        asphericity_q_posterior: this.q_posterior,
        toric_design: UNKNOWN,
      },
      geometry_status: GeometryStatus.DERIVED_GENERIC,
      source: 'SIMULACION: geometría derivada de la potencia; parámetros declarados, no de fabricante',
    });
  }
}

/**
 * Atajo para simulación: una LIO genérica cuya geometría corresponde a `power_d`.
 * Mantiene el invariante de P0.2 (la geometría SIEMPRE deriva de la potencia pedida);
 * es azúcar sobre `new GenericIOLFactory(...).create(...)`.
 */
export function createGenericThickIOL({ power_d, cylinder_d = 0, n_iol, thickness_mm, n_medium }) {
  const opts = {};
  if (n_iol !== undefined) opts.n_iol = n_iol;
  if (thickness_mm !== undefined) opts.thickness_mm = thickness_mm;
  if (n_medium !== undefined) opts.n_medium = n_medium;
  return new GenericIOLFactory(opts).create({ power_d, cylinder_d });
}

/**
 * Lente TÓRICA SINTÉTICA de simulación (V1.6): deriva una geometría bicónica anterior
 * a partir del equivalente esférico y el cilindro NOMINAL, para experimentos.
 *
 * ESTA ES LA ÚNICA VÍA por la que una etiqueta `cylinder_d` se convierte en radios —
 * y lo hace DECLARÁNDOSE: `is_simulation_surrogate = true`, geometría DERIVED_GENERIC,
 * fuente explícita. `cylinder_d` en una lente de fabricante JAMÁS fabrica radios: o el
 * fabricante documenta la cara tórica (toric_anterior con procedencia) o la geometría
 * tórica es UNKNOWN y el trazado falla.
 *
 * Derivación (exacta, lente gruesa por meridiano):
 *   objetivo por meridiano: P_x = EE − C/2 (plano, x local), P_y = EE + C/2 (empinado, y local)
 *   posterior esférica de la equibiconvexa del EE: r2 = −r1(EE)
 *   P1_m = (P_m − P2) / (1 − (t/n)·P2)   [lineal: despeje exacto del constructor de lentes]
 *   r1_m = (n − n_medio)·1000 / P1_m     [mm]
 * Verificable: physicalPowersOfToricIOL debe devolver cylinder_d == C y mean == EE
 * a precisión de máquina (hay test).
 *
 * Convención de fábrica del proyecto: meridiano MÁS potente en y LOCAL; el eje de
 * implantación se orienta EXCLUSIVAMENTE con pose.rotation_z.
 */
export class SyntheticToricIOLFactory {
  constructor({ n_iol = 1.49, thickness_mm = 0.8, n_medium = N_AQUEOUS, label = 'SYNTHETIC_TORIC',
    q_anterior = ASSUMED_SPHERICAL, q_posterior = ASSUMED_SPHERICAL } = {}) {
    this._generic = new GenericIOLFactory({ n_iol, thickness_mm, n_medium, q_anterior, q_posterior });
    this.n_iol = n_iol;
    this.thickness_mm = thickness_mm;
    this.n_medium = n_medium;
    this.q_anterior = q_anterior;
    this.q_posterior = q_posterior;
    this.label = label;
    this.id = `synthetic_toric_n${n_iol}_t${thickness_mm}`;
  }

  create({ power_d, cylinder_d }) {
    assertFinite(power_d, 'power_d');
    assertFinite(cylinder_d, 'cylinder_d');
    if (!(cylinder_d >= 0)) {
      throw new RangeError('SyntheticToricIOLFactory: cylinder_d nominal debe ser ≥ 0 '
        + '(la orientación la da pose.rotation_z, no el signo)');
    }
    const D = this.n_iol - this.n_medium;
    const t_m = this.thickness_mm / 1000;
    const r1EE = this._generic.radiusForPower(power_d);
    const r2 = -r1EE;
    const P2 = (this.n_medium - this.n_iol) * 1000 / r2;   // c2 en 1/m: 1000/r2[mm]
    const denom = 1 - (t_m / this.n_iol) * P2;
    const r1De = P_m => {
      const P1 = (P_m - P2) / denom;
      return P1 === 0 ? Infinity : D * 1000 / P1;
    };
    return createIOL({
      manufacturer: 'GENERIC',
      model: `${this.label}_${power_d}D_cyl${cylinder_d}D`,
      nominal_power_d: power_d,
      cylinder_d,
      geometry: {
        kind: 'thick_lens',
        refractive_index: this.n_iol,
        central_thickness_mm: this.thickness_mm,
        toric_anterior: {
          r_x_mm: r1De(power_d - cylinder_d / 2),   // meridiano plano en x local
          r_y_mm: r1De(power_d + cylinder_d / 2),   // meridiano potente en y local
          q_x: this.q_anterior, q_y: this.q_anterior,
        },
        r_posterior_mm: r2,
        asphericity_q_posterior: this.q_posterior,
      },
      geometry_status: GeometryStatus.DERIVED_GENERIC,
      source: 'SIMULACION: geometría tórica SINTÉTICA derivada de la etiqueta nominal '
        + '(EE + cilindro); sustituto declarado, no representa ninguna lente comercial',
    });
  }
}

/**
 * Lente COMERCIAL: la geometría procede de una tabla del fabricante, potencia a
 * potencia. Si la potencia pedida no está documentada, devuelve una LIO con
 * `geometry_status = UNKNOWN`: el trazado fallará explícitamente (assertTraceableGeometry)
 * en lugar de inventar radios o caer en la genérica sin avisar.
 */
export class ManufacturerIOLFactory {
  /**
   * @param geometryByPower mapa potencia(D) → { refractive_index, central_thickness_mm,
   *                        r_anterior_mm, r_posterior_mm, ... }
   * @param provenance      cita obligatoria de la fuente (ficha técnica, patente, DOI)
   */
  constructor({ manufacturer, model, geometryByPower, provenance, toric_catalog_d = UNKNOWN, power_range_d = UNKNOWN }) {
    if (!manufacturer || !model) throw new TypeError('ManufacturerIOLFactory: manufacturer y model obligatorios');
    if (!provenance || typeof provenance !== 'string' || provenance.length < 10) {
      throw new TypeError('ManufacturerIOLFactory exige `provenance` documentada '
        + '(ficha técnica / patente / DOI). Sin fuente no se declara geometría de fabricante.');
    }
    if (!geometryByPower || typeof geometryByPower !== 'object') {
      throw new TypeError('geometryByPower requerido: { potencia_d: geometría }');
    }
    this.manufacturer = manufacturer;
    this.model = model;
    this.geometryByPower = geometryByPower;
    this.provenance = provenance;
    this.toric_catalog_d = toric_catalog_d;
    this.power_range_d = power_range_d;
    this.id = `mfr_${manufacturer}_${model}`;
  }

  create({ power_d, cylinder_d = 0 }) {
    assertFinite(power_d, 'power_d');
    const key = String(power_d);
    const g = this.geometryByPower[key] ?? this.geometryByPower[power_d];
    const known = g && typeof g === 'object';
    return createIOL({
      manufacturer: this.manufacturer,
      model: this.model,
      nominal_power_d: power_d,
      cylinder_d,
      toric_catalog_d: this.toric_catalog_d,
      power_range_d: this.power_range_d,
      geometry: known ? { kind: 'thick_lens', ...g } : {},
      ...(known ? { geometry_status: GeometryStatus.MANUFACTURER, provenance: this.provenance } : {}),
      source: known
        ? `geometría de fabricante [${this.provenance}]`
        : `POTENCIA NO DOCUMENTADA en ${this.manufacturer}/${this.model}: geometría UNKNOWN`,
    });
  }
}
