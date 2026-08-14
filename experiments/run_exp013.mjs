/**
 * exp013 — Atlas AL × K × pupila de la divergencia PARAXIAL ↔ TRAZADO (V1.9).
 *
 * SIMULACIÓN / NO GROUND TRUTH CLÍNICO · RESEARCH USE ONLY
 *
 * PREGUNTA PRIMARIA (análisis A · CONTROLLED_PHYSICS): manteniendo posición, córnea y
 * lente IDÉNTICAS, ¿dónde y cuánto diverge la potencia óptima CONTINUA al sustituir la
 * aproximación paraxial por trazado exacto a apertura finita?
 *
 * Métrica primaria: ΔP = P_raytrace − P_paraxial (potencia CONTINUA, sin rejilla ni
 * catálogo: la cuantización no se mezcla con la física). La decisión de catálogo se
 * reporta APARTE y solo con discretización EXACTAMENTE idéntica en ambos motores.
 *
 * ANÁLISIS B · FULL_ENGINE (secundario, descriptivo): DIVERGENCIA ENTRE MOTORES frente
 * al benchmark congelado. No se atribuye ninguna divergencia al trazado: las pilas
 * difieren en varios canales a la vez y la comparación los lista.
 *
 * CONTRA EL SESGO DEL SUPERVIVIENTE: cada combinación INTENTADA aparece con su estado;
 * los estadísticos van SIEMPRE con su denominador (n_intentados / n_comparables /
 * n_rechazados + motivos clasificados). Una región con muchos rechazos es un resultado.
 *
 * Determinista: todo es rejilla declarada, sin muestreo aleatorio (no hay semilla que
 * declarar). Casos ESFÉRICOS (k1 = k2) a propósito: con astigmatismo la dimensión
 * tórica quedaría UNSUPPORTED en ambos motores y contaminaría la pregunta.
 */
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ParaxialEngine } from '../src/bench/engines/paraxial_engine.mjs';
import { RaytraceEngine } from '../src/bench/engines/raytrace_engine.mjs';
import { EvoReplicaEngine } from '../src/bench/engines/evo_engine.mjs';
import { GenericIOLFactory } from '../src/core/iol_factory.mjs';
import { ConstantOffsetPredictor } from '../src/predictors/iol_position.mjs';
import { ObjectiveKind } from '../src/optics/objective.mjs';
import { SamplingKind } from '../src/optics/raytrace/bundle.mjs';
import { FidelityMode } from '../src/core/fidelity.mjs';
import { powerGrid } from '../src/optimize/power_search.mjs';
import {
  controlledPhysicsSweep, fullEngineSweep, resumen, resumenPorEje,
  analizarMonotoniaEnPupila, BANDAS_D,
} from '../src/bench/divergence.mjs';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), 'exp013_atlas_divergencia');
fs.mkdirSync(OUT_DIR, { recursive: true });

const REJILLA_POTENCIAS = powerGrid(-5, 45, 0.5);   // COMPARTIDA (paraxial y catálogo)
const PUPILA_ANCLA_MM = 0.1;

const CONFIG = {
  id: 'exp013_atlas_divergencia',
  etiqueta: 'SIMULACION / NO GROUND TRUTH CLINICO',
  pregunta_primaria: 'Con posición, córnea y lente IDÉNTICAS, dónde y cuánto diverge la '
    + 'potencia óptima CONTINUA entre la aproximación paraxial y el trazado exacto a apertura finita',
  determinismo: 'rejilla declarada, sin muestreo aleatorio: no hay semilla',
  rejilla_A: {
    al_mm: [21, 22, 23, 23.5, 24, 25, 26, 28],
    k_d: [38, 40, 42, 43.5, 45, 47],
    pupil_mm: [PUPILA_ANCLA_MM, 2.0, 3.0, 4.0, 5.0, 6.0],
    pupil_source: 'ancla numérica de convergencia (0.1 mm) / escenario declarado (resto)',
  },
  rejilla_B_full_engine: {
    al_mm: [21, 22, 23, 23.5, 24, 25, 26, 28],
    k_d: [38, 40, 42, 43.5, 45, 47],
    pupil_mm_fija: 3.0,
    pupil_source: 'escenario declarado (la pupila no entra en el motor congelado)',
  },
  controles_compartidos: [
    'positionPredictor: ConstantOffsetPredictor(1.7) — MISMA instancia en ambos motores',
    'iolFactory: GenericIOLFactory — MISMA instancia: ambos evalúan la MISMA lente GRUESA',
    'política corneal: la del dispositivo (casos solo-K), idéntica en ambos',
    'target_d = 0 en ambos',
    'la comparación VERIFICA position_source, iol_position_mm, cornea_policy, lens_model, '
      + 'iol_factory y target_d, y RECHAZA la celda si alguno difiere',
  ],
  lente: 'GenericIOLFactory equibiconvexa — SUSTITUTO DE SIMULACIÓN declarado (OQ #4). '
    + 'La MAGNITUD de la divergencia depende fuertemente de la geometría de la lente: '
    + 'el bloque de sensibilidad lo cuantifica con una asférica declarada.',
  objetivo_trazado: ObjectiveKind.EQUIVALENT_DEFOCUS,
  muestreo: { kind: SamplingKind.MERIDIONAL, n_anillos: 5 },
  search_d: [-6, 45],
  rejilla_potencias_compartida: `powerGrid(-5, 45, 0.5) — ${REJILLA_POTENCIAS.length} escalones`,
  a_constant_evo: 119.3,
  iol_model_evo: 'Posterior',
  bandas_descriptivas: BANDAS_D,
  nota_bandas: 'DESCRIPTIVAS de la distribución, NO umbrales de relevancia clínica',
};

const predictor = new ConstantOffsetPredictor(1.7);
const factoryEsferica = new GenericIOLFactory();
// asférica DECLARADA (parámetro de simulación, no ficha de fabricante): sirve para
// medir cuánto de la magnitud es propiedad de la LENTE y no del método
const factoryAsferica = new GenericIOLFactory({ q_anterior: -1.0, q_posterior: -1.0 });

const paraxialCon = f => new ParaxialEngine(predictor, { grid: REJILLA_POTENCIAS, iolFactory: f });
const raytraceCon = (f, catalog_d = null) => new RaytraceEngine({
  positionPredictor: predictor, iolFactory: f,
  objective: ObjectiveKind.EQUIVALENT_DEFOCUS,
  sampling: { kind: SamplingKind.MERIDIONAL, n_anillos: 5 },
  search_d: CONFIG.search_d, catalog_d,
  cornea: {}, fidelity: FidelityMode.RESEARCH, pupil_mm: 'FROM_CASE',
});
const BASE = { acd_mm: 3.2, lt_mm: 4.5, cct_um: 550, k_index: 1.3375, target_d: 0, meta: { source: 'synthetic' } };

// ---------- A · CONTROLLED_PHYSICS (resultado principal) ----------
const A = controlledPhysicsSweep({
  paraxialEngine: paraxialCon(factoryEsferica),
  raytraceEngine: raytraceCon(factoryEsferica),
  grid: CONFIG.rejilla_A,
  baseCase: BASE,
});
const celdasA = A.celdas;
const ancla = celdasA.filter(c => c.pupil_mm === PUPILA_ANCLA_MM);
const anclaResumen = resumen(ancla);
const conApertura = celdasA.filter(c => c.pupil_mm !== PUPILA_ANCLA_MM);

// ---------- A2 · decisión de CATÁLOGO, solo con discretización IDÉNTICA ----------
const catalogo = controlledPhysicsSweep({
  paraxialEngine: paraxialCon(factoryEsferica),
  raytraceEngine: raytraceCon(factoryEsferica, REJILLA_POTENCIAS),
  grid: { al_mm: [22, 23.5, 25], k_d: [40, 43.5, 47], pupil_mm: [3.0], pupil_source: 'escenario declarado' },
  baseCase: BASE,
});
const catalogoComparables = catalogo.celdas.filter(c => c.estado === 'comparable');
const catalogoResumen = {
  ...resumen(catalogo.celdas),
  n_con_divergencia_de_catalogo: catalogoComparables.filter(c => c.divergencia_catalogo_d !== null).length,
  divergencias_catalogo_d: catalogoComparables.map(c => c.divergencia_catalogo_d),
  divergencias_continuas_d: catalogoComparables.map(c => +c.divergencia_d.toFixed(6)),
};

// ---------- A3 · sensibilidad a la GEOMETRÍA de la lente ----------
const asferica = controlledPhysicsSweep({
  paraxialEngine: paraxialCon(factoryAsferica),
  raytraceEngine: raytraceCon(factoryAsferica),
  grid: { al_mm: [22, 23.5, 25], k_d: [40, 43.5, 47], pupil_mm: [3.0, 5.0], pupil_source: 'escenario declarado' },
  baseCase: BASE,
});
const esfericaMismaSubrejilla = celdasA.filter(c =>
  [22, 23.5, 25].includes(c.al_mm) && [40, 43.5, 47].includes(c.k_d) && [3.0, 5.0].includes(c.pupil_mm));

// ---------- B · FULL_ENGINE (secundario, descriptivo) ----------
const B = fullEngineSweep({
  raytraceEngine: raytraceCon(factoryEsferica, REJILLA_POTENCIAS),
  evoEngine: new EvoReplicaEngine(),
  grid: {
    al_mm: CONFIG.rejilla_B_full_engine.al_mm,
    k_d: CONFIG.rejilla_B_full_engine.k_d,
    pupil_mm: [CONFIG.rejilla_B_full_engine.pupil_mm_fija],
    pupil_mm_fija: CONFIG.rejilla_B_full_engine.pupil_mm_fija,
    pupil_source: CONFIG.rejilla_B_full_engine.pupil_source,
  },
  baseCase: { ...BASE, a_constant: CONFIG.a_constant_evo, iol_model: CONFIG.iol_model_evo },
  discretizacion_comparable: true,   // ambos en escalones de 0.5 D (EVO: tabla interna)
});

const redondea = (o, n = 6) => JSON.parse(JSON.stringify(o, (k, v) =>
  typeof v === 'number' && Number.isFinite(v) && !Number.isInteger(v) ? +v.toFixed(n) : v));

const result = {
  config: CONFIG,
  timestamp: new Date().toISOString(),
  commit: execSync('git rev-parse HEAD').toString().trim(),
  procedencia_commit: 'último commit AL GENERAR: el experimento puede incluir cambios aún '
    + 'sin committear (hallazgo adversarial V1.3: el commit estampado era sistemáticamente '
    + 'el PADRE del que publica). La reproducibilidad NO la garantiza este campo sino '
    + 'scripts/check_experiments.mjs, que re-ejecuta contra el árbol del commit que publica '
    + 'y en cada push de CI.',

  A_controlled_physics: redondea({
    metrica: 'ΔP = P_raytrace − P_paraxial (potencia CONTINUA, D en plano de LIO)',
    ancla_pupila_0: {
      pupil_mm: PUPILA_ANCLA_MM,
      ...anclaResumen,
      converge: anclaResumen.max_abs_d !== null && anclaResumen.max_abs_d < 0.01,
      criterio: 'con apertura→0 el trazado debe recuperar el paraxial del MISMO sistema '
        + '(puerta V1.13); tolerancia de referencia 0.01 D',
    },
    global_con_apertura_finita: resumen(conApertura),
    por_pupila: resumenPorEje(celdasA, 'pupil_mm'),
    por_al: resumenPorEje(conApertura, 'al_mm'),
    por_k: resumenPorEje(conApertura, 'k_d'),
    monotonia_en_pupila: analizarMonotoniaEnPupila(celdasA),
    catalogo_discretizacion_identica: catalogoResumen,
    sensibilidad_geometria_lente: {
      proposito: 'cuánto de la MAGNITUD es propiedad de la geometría de la lente y no del método',
      esferica: resumen(esfericaMismaSubrejilla),
      asferica_q_menos_1: resumen(asferica.celdas),
      nota: 'ambas son SUSTITUTOS DE SIMULACIÓN declarados (OQ #4): ninguna representa una '
        + 'lente comercial, y la comparación entre ellas no dice nada sobre lentes reales',
    },
    candidatos_a_estudio_posterior: [
      {
        observacion: 'sustituir la LIO esférica por una asférica DECLARADA (Q = −1) apenas '
          + 'reduce la divergencia en la subrejilla común, pese a que esa Q elimina buena '
          + 'parte de la aberración esférica DE LA LENTE',
        lectura_conservadora: 'la magnitud observada no parece dominada por la geometría de la '
          + 'LIO; el candidato natural es la CÓRNEA del modelo (superficie única equivalente, '
          + 'esférica, bajo la política de lectura), pero ESTE experimento no lo comprueba',
        que_haria_falta: 'un atlas con la Q corneal y la política corneal como ejes explícitos '
          + '(fuera del alcance declarado de V1.9: aquí el atlas es AL × K × pupila del sistema '
          + 'centrado). Registrado como candidato, no como conclusión.',
      },
    ],
    celdas: celdasA.map(c => ({
      al_mm: c.al_mm, k_d: c.k_d, pupil_mm: c.pupil_mm, estado: c.estado,
      divergencia_d: c.divergencia_d === null ? null : +c.divergencia_d.toFixed(6),
      p_raytrace_d: c.p_raytrace_d === undefined ? null : +c.p_raytrace_d.toFixed(6),
      p_paraxial_d: c.p_paraxial_d === undefined ? null : +c.p_paraxial_d.toFixed(6),
      motivo: c.motivo ?? null,
    })),
  }),

  B_full_engine: redondea({
    denominacion: B.denominacion,
    resumen: resumen(B.celdas),
    n_saturacion_catalogo: B.celdas.filter(c => c.estado === 'comparable' && c.saturacion_catalogo).length,
    celdas: B.celdas.map(c => ({
      al_mm: c.al_mm, k_d: c.k_d, estado: c.estado,
      divergencia_d: c.divergencia_d === null ? null : +c.divergencia_d.toFixed(6),
      p_raytrace_recomendada_d: c.p_raytrace_recomendada_d ?? null,
      p_evo_recomendada_d: c.p_evo_recomendada_d ?? null,
      p_raytrace_continua_d: c.p_raytrace_continua_d === undefined ? null : +c.p_raytrace_continua_d.toFixed(6),
      saturacion_catalogo: c.saturacion_catalogo ?? null,
      catalog_evaluados: c.catalog_evaluados ?? null,
      catalog_no_evaluables: c.catalog_no_evaluables ?? null,
      motivo: c.motivo ?? null,
    })),
    advertencia: 'DIVERGENCIA ENTRE MOTORES: pilas completas con predictor, geometría, política '
      + 'corneal, objetivo y A-constant distintos a la vez. NINGUNA parte de esta cifra se '
      + 'atribuye al trazado. Las refracciones previstas NO se restan (convenciones distintas).',
  }),
};
fs.writeFileSync(join(OUT_DIR, 'results.json'), JSON.stringify(result, null, 2) + '\n');

// ---------- README ----------
const A_ = result.A_controlled_physics, B_ = result.B_full_engine;
const fmt = v => (v === null ? '—' : (v >= 0 ? '+' : '') + v.toFixed(4));
const pct = v => (v === null ? '—' : (100 * v).toFixed(1) + ' %');
const filaResumen = (etiqueta, r) => `| ${etiqueta} | ${r.n_intentados} | ${r.n_comparables} | `
  + `${r.n_rechazados} | ${r.mediana_abs_d === null ? '—' : r.mediana_abs_d.toFixed(4)} | `
  + `${r.p95_abs_d === null ? '—' : r.p95_abs_d.toFixed(4)} | ${r.max_abs_d === null ? '—' : r.max_abs_d.toFixed(4)} | `
  + `${fmt(r.mediana_firmada_d)} | ${BANDAS_D.map(b => pct(r.bandas_fraccion[b])).join(' / ')} |`;

const md = [
  '# exp013 — Atlas AL × K × pupila: divergencia paraxial ↔ trazado (V1.9)',
  '',
  `**${CONFIG.etiqueta}** · commit \`${result.commit.slice(0, 10)}\``,
  '',
  '## Pregunta primaria',
  '',
  'Con **posición, córnea y lente idénticas**, ¿dónde y cuánto diverge la potencia óptima',
  '**continua** al sustituir la aproximación paraxial por trazado exacto a apertura finita?',
  'Métrica: **ΔP = P_raytrace − P_paraxial** (D, plano de LIO, sin cuantización).',
  '',
  'Los seis controles de V1.8 se **verifican en cada celda** y la celda se rechaza si alguno',
  'difiere: misma posición y procedencia, misma política corneal, **misma lente gruesa de la',
  'misma factory** y misma diana. Casos esféricos (k1 = k2) para que la dimensión tórica',
  'UNSUPPORTED no contamine la pregunta.',
  '',
  '## Ancla de convergencia (apertura → 0)',
  '',
  `| Pupila | n intentados | n comparables | máx \\|ΔP\\| | ¿converge < 0.01 D? |`,
  '|---|---|---|---|---|',
  `| ${PUPILA_ANCLA_MM} mm | ${A_.ancla_pupila_0.n_intentados} | ${A_.ancla_pupila_0.n_comparables} | `
    + `${A_.ancla_pupila_0.max_abs_d === null ? '—' : A_.ancla_pupila_0.max_abs_d.toFixed(5)} D | `
    + `${A_.ancla_pupila_0.converge ? 'SÍ' : 'NO'} |`,
  '',
  '## A · Resumen por pupila (denominador SIEMPRE presente)',
  '',
  `Bandas descriptivas de \\|ΔP\\|: ${BANDAS_D.join(' / ')} D. **No son umbrales de relevancia**`,
  '**clínica** y de ellas no se deduce beneficio alguno (OQ #8).',
  '',
  '| Pupila (mm) | n int. | n comp. | n rech. | mediana \\|ΔP\\| | p95 | máx | mediana firmada | bandas (n intentados→% de comparables) |',
  '|---|---|---|---|---|---|---|---|---|',
  ...A_.por_pupila.map(r => filaResumen(String(r.pupil_mm), r)),
  '',
  '## A · Resumen por longitud axial (apertura finita)',
  '',
  '| AL (mm) | n int. | n comp. | n rech. | mediana \\|ΔP\\| | p95 | máx | mediana firmada | bandas |',
  '|---|---|---|---|---|---|---|---|---|',
  ...A_.por_al.map(r => filaResumen(String(r.al_mm), r)),
  '',
  '## A · Resumen por queratometría (apertura finita)',
  '',
  '| K (D) | n int. | n comp. | n rech. | mediana \\|ΔP\\| | p95 | máx | mediana firmada | bandas |',
  '|---|---|---|---|---|---|---|---|---|',
  ...A_.por_k.map(r => filaResumen(String(r.k_d), r)),
  '',
  '## A · Monotonía en pupila — OBSERVADA, no impuesta',
  '',
  `| Series (AL,K) | con datos | monótonas crecientes | NO monótonas | cambian de signo |`,
  '|---|---|---|---|---|',
  `| ${A_.monotonia_en_pupila.n_series} | ${A_.monotonia_en_pupila.n_series_con_datos_suficientes} | `
    + `${A_.monotonia_en_pupila.n_monotonas_crecientes} | ${A_.monotonia_en_pupila.n_no_monotonas} | `
    + `${A_.monotonia_en_pupila.n_cambian_de_signo} |`,
  '',
  '## A · Decisión de catálogo (solo con discretización EXACTAMENTE idéntica)',
  '',
  `Subrejilla declarada, ambos motores sobre los mismos ${REJILLA_POTENCIAS.length} escalones de 0.5 D.`,
  '',
  `- celdas intentadas: ${A_.catalogo_discretizacion_identica.n_intentados}; comparables: `
    + `${A_.catalogo_discretizacion_identica.n_comparables}; con divergencia de catálogo calculable: `
    + `${A_.catalogo_discretizacion_identica.n_con_divergencia_de_catalogo}`,
  `- divergencias de catálogo (D): ${A_.catalogo_discretizacion_identica.divergencias_catalogo_d.join(', ') || '—'}`,
  `- divergencias continuas de las mismas celdas (D): ${A_.catalogo_discretizacion_identica.divergencias_continuas_d.join(', ')}`,
  '',
  'La diferencia entre ambas columnas **es cuantización**, no física.',
  '',
  '## A · Sensibilidad a la geometría de la lente',
  '',
  '| Lente (sustituto declarado) | n comp. | mediana \\|ΔP\\| | máx \\|ΔP\\| |',
  '|---|---|---|---|',
  `| equibiconvexa esférica | ${A_.sensibilidad_geometria_lente.esferica.n_comparables} | `
    + `${A_.sensibilidad_geometria_lente.esferica.mediana_abs_d?.toFixed(4) ?? '—'} | `
    + `${A_.sensibilidad_geometria_lente.esferica.max_abs_d?.toFixed(4) ?? '—'} |`,
  `| equibiconvexa asférica (Q = −1 declarada) | ${A_.sensibilidad_geometria_lente.asferica_q_menos_1.n_comparables} | `
    + `${A_.sensibilidad_geometria_lente.asferica_q_menos_1.mediana_abs_d?.toFixed(4) ?? '—'} | `
    + `${A_.sensibilidad_geometria_lente.asferica_q_menos_1.max_abs_d?.toFixed(4) ?? '—'} |`,
  '',
  '## B · DIVERGENCIA ENTRE MOTORES (secundario, descriptivo)',
  '',
  `| n intentados | n comparables | n rechazados | motivos | mediana \\|Δ\\| | máx \\|Δ\\| | saturación de catálogo |`,
  '|---|---|---|---|---|---|---|',
  `| ${B_.resumen.n_intentados} | ${B_.resumen.n_comparables} | ${B_.resumen.n_rechazados} | `
    + `${Object.entries(B_.resumen.motivos_rechazo).map(([k, v]) => `${k}: ${v}`).join('; ') || '—'} | `
    + `${B_.resumen.mediana_abs_d?.toFixed(4) ?? '—'} | ${B_.resumen.max_abs_d?.toFixed(4) ?? '—'} | `
    + `${B_.n_saturacion_catalogo} celdas |`,
  '',
  B_.advertencia,
  '',
  '## Lectura (limitada a lo que estos datos de simulación permiten afirmar)',
  '',
  '1. Con apertura → 0 la divergencia se anula dentro de la tolerancia: el trazado recupera',
  '   el paraxial del mismo sistema. Cualquier divergencia a apertura finita es, por tanto,',
  '   efecto de la apertura y no un artefacto del montaje.',
  `2. Con apertura finita la divergencia es sistemáticamente ${A_.global_con_apertura_finita.mediana_firmada_d < 0 ? 'NEGATIVA' : 'POSITIVA'}`,
  `   (mediana firmada ${fmt(A_.global_con_apertura_finita.mediana_firmada_d)} D sobre `,
  `   ${A_.global_con_apertura_finita.n_comparables} celdas comparables de `,
  `   ${A_.global_con_apertura_finita.n_intentados} intentadas): con esta lente, el trazado sitúa`,
  '   el óptimo por debajo del paraxial. Signo y magnitud se reportan; no se interpreta cuál',
  '   de los dos "acierta" — eso exige datos postoperatorios (OQ #8).',
  '3. La MAGNITUD es propiedad del sistema simulado, no una constante del método. El bloque',
  '   de sensibilidad muestra además algo que este experimento NO estaba diseñado para',
  '   responder: cambiar la LIO a una asférica declarada (Q = −1) apenas mueve la cifra, así',
  '   que la geometría de la lente no parece dominarla. Queda REGISTRADO como candidato a un',
  '   estudio posterior con la córnea y su política como ejes explícitos — no como conclusión.',
  `4. Rechazos: ${A_.global_con_apertura_finita.n_rechazados} de `
    + `${A_.global_con_apertura_finita.n_intentados} celdas con apertura finita, y `
    + `${B_.resumen.n_rechazados} de ${B_.resumen.n_intentados} en el bloque B `
    + `(${Object.keys(B_.resumen.motivos_rechazo).join(', ') || 'ninguno'}). Aparecen en las tablas`,
  '   con su denominador: una región que no se puede comparar es un resultado, no un hueco.',
  '',
  '## Lo que este experimento NO demuestra',
  '',
  '- **Nada clínico.** Ni que el trazado prediga mejor, ni que estas divergencias tengan',
  '  consecuencia refractiva en un paciente: eso exige cohorte postoperatoria (OQ #8).',
  '- Las lentes son **sustitutos de simulación declarados** (OQ #4); las cifras describen su',
  '  geometría, no lentes comerciales.',
  '- La rejilla es **declarada y uniforme**, no una población: las frecuencias por banda no',
  '  son prevalencias (OQ #5).',
  '- El bloque B compara **pilas completas** que difieren en varios canales a la vez; su cifra',
  '  no es atribuible al trazado ni mide acierto de nadie.',
].join('\n');
fs.writeFileSync(join(OUT_DIR, 'README.md'), md + '\n');
console.log(md);
