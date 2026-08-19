# PROJECT_PLAN — Plataforma de investigación en cálculo de LIO

**Versión:** 1.0 · **Fecha:** 10/08/2026 · **Autor:** G. Vila (elaboración asistida por IA)
**Estado regulatorio:** RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING

> ## ⚠ DOCUMENTO HISTÓRICO — plan de **V0**, superado
>
> Este es el plan de **V0**, que se cerró el 10/08/2026 (Sprint 12). **No contiene ninguno de
> los quince sprints de V1** y no describe el estado actual de la plataforma. Se conserva
> intacto como registro de cómo se construyó V0.
>
> - Plan vigente de V1: [`docs/V1_PROJECT_PLAN.md`](docs/V1_PROJECT_PLAN.md)
> - Qué es y qué NO demuestra la plataforma hoy: [`docs/V1_CLOSURE.md`](docs/V1_CLOSURE.md)
> - Estado por sprint: [`CURRENT_SPRINT.md`](CURRENT_SPRINT.md)
>
> **Aviso de numeración:** los «Sprint N» de este documento son los de V0 y **no** se
> corresponden con los «V1.N» del plan vigente. En particular, el Sprint 10 de V0 era el
> Monte Carlo paraxial, mientras que V1.10 son los predictores de literatura, que siguen
> BLOCKED.

## Objetivo científico

Construir una plataforma capaz de predecir el resultado óptico postoperatorio mediante
la cadena **anatomía → estado postoperatorio previsto → modelo óptico físico →
selección de LIO → (futuro) validación clínica**, con la réplica de EVO como benchmark
congelado — no como dependencia interna.

Preguntas que la plataforma debe poder responder (criterio §24 del encargo):
1) ¿cuánto error produce una predicción incorrecta de posición de LIO?; 2) ¿en qué ojos
importa más?; 3) ¿cuánto cambia el resultado paraxial → ray tracing?; 4) ¿qué variables
anatómicas tienen mayor potencial informativo?; 5) ¿dónde diverge el modelo físico de
EVO?; 6) ¿qué datos clínicos permitirían decidir cuál acierta?; 7) ¿qué dataset mínimo
valida la siguiente hipótesis?

## Restricciones vinculantes

- Sin datos postoperatorios reales: **ninguna simulación es ground truth clínico**
  (etiquetado obligatorio `SIMULACIÓN / NO GROUND TRUTH CLÍNICO`).
- Prohibido inventar coeficientes clínicos, geometrías de LIO comerciales o parámetros
  no documentados: se usan interfaces + `UNKNOWN` + modelos genéricos etiquetados.
- El legacy EVO se congela y solo se consume vía `run_evo_replica(case)`.
- Reproducibilidad total: semillas, configs versionadas, hashes, logs, tests.

## Estados

`PENDIENTE` · `EN CURSO` · `DONE` · `PARTIAL` · `BLOCKED` (con motivo).

---

## SPRINT 0 — Auditoría y congelación del baseline — **DONE**

- **Objetivo:** repo bajo git; rescatar artefactos del directorio temporal; congelar la
  réplica EVO con hashes; API `run_evo_replica(case)`; reproducir métricas offline.
- **Hipótesis:** las métricas publicadas (95,4/79,6/94,8/72,6 sobre 1.206) son
  reproducibles en frío desde la caché, sin red.
- **Entregables:** `legacy/evo_replica/` completo · `HASHES.sha256` ·
  `baseline/baseline_metrics.json` · golden cases · tests de regresión ·
  `docs/scientific/EVO_BASELINE.md` · `docs/AUDITORIA.md`.
- **Criterios de aceptación:** `npm test` verde; métricas replicadas exactamente;
  hash del motor congelado verificado por test; PDF de paciente fuera de git.
- **Riesgos:** clave de caché acoplada al orden de campos (mitigado: documentada y testada).

## SPRINT 1 — Core científico y modelo de datos — **DONE**

- **Objetivo:** `src/core/`: unidades explícitas, `EyeModel` (preop/postop separados,
  ausencias permitidas), `IOLModel` (UNKNOWN explícito, genéricos etiquetados),
  `PredictionResult` (con incertidumbre y warnings), validadores; esquema de datos
  clínicos futuros (JSON Schema, sin PII).
- **Hipótesis:** un modelo de datos con datum geométrico único (ápex corneal, eje óptico,
  mm) elimina la clase de errores de convención que degradan las fórmulas.
- **Entregables:** `units.mjs`, `eye.mjs`, `iol.mjs`, `result.mjs` + tests ·
  `data/clinical_schema/*.schema.json` · `ARCHITECTURE.md`,
  `CLINICAL_DATA_REQUIREMENTS.md`, `IOL_POSITION.md` (interfaz), `OPEN_QUESTIONS.md`.
- **Aceptación:** tests verdes; round-trips de unidades exactos; validadores rechazan
  entradas absurdas y aceptan parámetros ausentes.

## SPRINT 2 — Motor óptico paraxial independiente — **DONE**

- **Objetivo:** vergencias reducidas propias (sin ecuaciones ajustadas de EVO):
  potencia de LIO para diana, refracción prevista, córnea de 1 y 2 superficies.
- **Hipótesis:** un modelo gaussiano limpio reproduce los casos ópticos cerrados con
  error numérico ~0 y sirve de referencia para el ray tracer.
- **Entregables:** `src/optics/{constants,paraxial}.mjs` + tests algebraicos cerrados ·
  `OPTICAL_MODEL.md`.
- **Aceptación:** round-trip potencia↔refracción < 1e-9 D; casos cerrados exactos;
  constantes documentadas, sin números mágicos.

## SPRINT 3 — Ray tracer mínimo — **DONE**

- **Objetivo:** rayos 3D, superficies esféricas/planas con apertura, Snell vectorial,
  TIR, propagación, búsqueda de foco (RMS spot), comparación con foco paraxial.
- **Hipótesis:** para superficies esféricas y alturas pequeñas el foco trazado converge
  al paraxial (validación cruzada de ambos motores).
- **Entregables:** `src/optics/raytrace/{vec3,surfaces,trace}.mjs` + unit/property/
  numerical tests · `RAY_TRACING.md`.
- **Aceptación:** propiedades (rayo axial invariante, n1=n2 no refracta, simetría,
  TIR detectado) verdes; foco trazado → paraxial cuando h→0 (tolerancia documentada);
  sin NaN en barridos.

## SPRINT 4 — Modelo completo del ojo — **DONE**

- **Objetivo:** construir el sistema óptico ojo+LIO desde `EyeModel`/`IOLModel`
  (córnea 2 superficies, cámara acuosa, LIO gruesa genérica, vítreo, retina).
- **Hecho:** builder paraxial (`buildParaxialEye`) y builder de trazado
  (`buildRaytraceEye`: córnea física de 2 superficies o superficie equivalente
  declarada r=336/K, LIO gruesa genérica, retina); `paraxialFocusOfRaytraceEye`
  calcula el foco paraxial de LAS MISMAS superficies (validación cruzada exacta).
- **Evidencia:** tests (convergencia trazado→paraxial < 0.01 mm con haz bajo, ambos
  modos corneales) y `experiments/exp003_paraxial_vs_raytrace` (Δfoco/ΔD por AL:
  validación ≈ 0.002 D; aberración esférica de la genérica a pupila 3 mm:
  −0.44…−0.95 D, creciente con la potencia).

## SPRINT 5 — Optimización de potencia — **DONE**

- **Objetivo:** dado un ojo y un catálogo, buscar potencia óptima con
  `objective(IOL) = predicted_optical_error`; guardar segunda opción, diferencia y
  regiones de empate.
- **Entregables:** `src/optimize/power_search.mjs` + tests · integrado en benchmark.
- **Aceptación:** el óptimo coincide con el mínimo analítico paraxial; empates
  detectados y reportados.

## SPRINT 6 — Generador sintético + sensibilidad — **PARTIAL**

- **Objetivo:** ojos sintéticos documentados (`source=synthetic`; grid vs random con
  semilla) y análisis de sensibilidad sistemático (prioridad: posición de LIO).
- **Hecho:** `src/synth/generator.mjs` (rangos explícitos documentados) + experimento
  `experiments/exp001_sensibilidad_elp` (ΔELP ±0.50/±0.25 × ojos cortos/normales/
  largos: tablas Δrefracción) + `exp002_divergencia_paraxial_vs_evo` (primer mapa).
- **Pendiente:** sensibilidad a córnea posterior/tilt/descentración (requiere Sprint 4
  completo); gráficas integradas en dashboard científico (Sprint 11).

## SPRINT 7 — Predictor modular de posición postoperatoria — **PARTIAL**

- **Objetivo:** interfaz `IOLPositionPredictor` con implementaciones: constante,
  regresión simple, modelo de literatura (solo con fuente), futuro ML.
- **Hecho:** interfaz + `ConstantOffsetPredictor` + `hooks` para regresión/literatura
  (`src/predictors/iol_position.mjs`), documentado en `IOL_POSITION.md`.
- **Pendiente / BLOCKED parcial:** modelos de literatura concretos — requieren fuente
  documental verificable (registrado en `OPEN_QUESTIONS.md`); ML — requiere datos
  reales (prohibido entrenar con sintético como verdad).

## SPRINT 8 — Geometría anatómica adicional (EQ/LEP, ATA, STS, tilt) — **DONE (inicial)**

- **Hecho:** campos de datos en `EyeModel` desde Sprint 1; `exp006_capacidad_eq`
  cuantifica —condicional a la hipótesis declarada H_EQ— el valor refractivo de
  medir el ecuador cristaliniano frente a inferirlo de ACD+LT: solo aporta si
  σ_medida < σ_bio, con beneficio concentrado en ojos cortos (~0.36 D con
  σ_bio 0.3 / σ_m 0.1). Define además el dato mínimo que valida H_EQ (protocolo).
- **Pendiente (fuera de "inicial"):** ablaciones de ATA/STS/diámetro y tilt (las dos
  últimas requieren superficies inclinadas en el trazador — candidato V1).

## SPRINT 9 — Sistema tórico independiente — **DONE (inicial)**

- **Hecho:** `src/toric/vectors.mjs` (doble ángulo reescrito, property-tests: ida y
  vuelta, mod 180, cancelación de perpendiculares, potencias firmadas) y
  `src/toric/toric_engine.mjs` (TCA solo con DATOS: anterior + posterior MEDIDA +
  SIA vectorial; residual por meridianos con la vergencia propia; catálogo
  inyectado; eje exacto). Integrado en `ParaxialEngine` (opción `toricCatalog_d`).
- **Decisión de diseño:** NO incorpora la regresión de córnea posterior predicha del
  legacy (ajuste a EVO); sin posterior medida lo declara en warnings. La divergencia
  sistemática esperada frente a EVO (≈0.6 D menos de TCA en WTR) queda documentada y
  es objeto natural del benchmark (Sprint 11).
- **Pendiente (fuera de "inicial"):** rotación tórica prevista y pérdida por
  desalineación; tórico sobre trazado de rayos (superficies tóricas).

## SPRINT 10 — Incertidumbre — **DONE**

- **Hecho:** `src/uncertainty/montecarlo.mjs` (Box-Muller sobre PRNG con semilla;
  percentiles de refracción bajo sigmas DECLARADAS; probabilidad de que la potencia
  alternativa fuese mejor; extracciones inválidas contadas). Consistencia verificada
  por test: sd(MC) ≈ |sensibilidad|·σ (±15 %). exp004 cuantifica intervalos y empates
  por tipo de ojo (con σpos=0.4 mm, el ojo corto tiene P(alternativa)≈43 %: la
  elección de escalón la domina la posición, no la óptica).
- **Sigmas reales:** pendientes de fuente/datos (OPEN_QUESTIONS #6); las usadas son
  escenarios declarados.

## SPRINT 11 — Benchmark global (dashboard científico) — **DONE (inicial)**

- **Hecho:** `dashboard-investigacion.html` regenerado íntegramente desde
  `experiments/*/results.json` (cero datos a mano, criterio cumplido): sensibilidad
  (exp001), intervalos MC (exp004), paraxial↔trazado (exp003), mapa de divergencia
  esférica con escala divergente azul/rojo (exp002) y tórico físico vs EVO (exp005,
  la firma de la córnea posterior con su signo). Sin afirmaciones de superioridad.
- **Pendiente (fuera de "inicial"):** columna de trazado en el mapa de divergencia
  (requiere optimizador sobre ray tracing) y navegación por muestras aleatorias.

## SPRINT 12 — Clinical readiness — **DONE**

- **Hecho:** esquemas JSON (preop/cirugía/postop, sin PII) + validador genérico del
  subconjunto de JSON Schema usado (`src/clinical/schema_validator.mjs`, fuente única
  de verdad = los .schema.json) + importador con guardas heurísticas de PII (fechas
  completas, nombres propios; los rechazos se reportan, nunca se corrigen en
  silencio) + enlace preop↔cirugía↔postop con huérfanos
  (`src/clinical/importer.mjs`, 7 tests con fixtures sintéticas) +
  **protocolo preregistrado** del primer lote (`PROTOCOL_FIRST_CLINICAL_BATCH.md`:
  objetivos ordenados, inclusión, partición temporal, umbral de calibración,
  prohibiciones).
- **Nota:** el mapeo del formato de export concreto del centro se hará como adaptador
  fino sobre este importador cuando se conozca (no bloquea nada).

---

## Orden de ejecución y dependencias

0 → 1 → 2 → 3 → (4 ‖ 5) → 6 → 7 → 8/9 → 10 → 11 → 12. El sprint 5 se adelantó sobre el
builder paraxial (dependencia real satisfecha); el trazado del ojo completo (resto del
4) no bloquea 6–7 pero sí la parte de trazado de 11.

## Definición de éxito V0 (checklist)

- [x] Baseline EVO reproducible y congelado
- [x] Motor paraxial independiente
- [x] Ray tracer funcional (superficies esféricas, foco)
- [x] Modelo de ojo configurable (datos + builders paraxial y de trazado)
- [x] Modelo de LIO configurable con UNKNOWN
- [x] Optimizador de potencia
- [x] Motor tórico inicial
- [x] Análisis de sensibilidad (ELP; paraxial↔trazado; capacidad EQ) — [ ] tilt/descentración (V1)
- [x] Generador sintético etiquetado
- [x] Benchmark contra EVO (mapas esférico y tórico; dashboard científico)
- [x] Sistema de incertidumbre (estructura + Monte Carlo con semilla)
- [x] Arquitectura modular de posición postoperatoria
- [x] Soporte de datos para EQ/OCT (campos + análisis de capacidad exp006)
- [x] Esquema de datos clínicos + importador validado + protocolo preregistrado
- [x] Tests extensos (unit/property/regresión/numéricos): 67 verdes
- [x] Documentación científica inicial completa

**V0 COMPLETADA** (10/08/2026) en todos los puntos que no exigen datos externos.
Quedan BLOCKED con motivo registrado: coeficientes de literatura sin fuente delante
(OPEN_QUESTIONS #2), geometrías comerciales de LIO (#4), sigmas reales (#6) y todo
ML clínico (requiere datos postoperatorios). Candidatos V1 en CURRENT_SPRINT.md.
