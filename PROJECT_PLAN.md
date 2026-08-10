# PROJECT_PLAN — Plataforma de investigación en cálculo de LIO

**Versión:** 1.0 · **Fecha:** 10/08/2026 · **Autor:** G. Vila (elaboración asistida por IA)
**Estado regulatorio:** RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING

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

## SPRINT 4 — Modelo completo del ojo — **PARTIAL**

- **Objetivo:** construir el sistema óptico ojo+LIO desde `EyeModel`/`IOLModel`
  (córnea 2 superficies, cámara acuosa, LIO gruesa genérica, vítreo, retina).
- **Hecho:** builder paraxial completo (`src/optics/eyebuilder.mjs`) usado por el
  benchmark; LIO gruesa genérica etiquetada.
- **Pendiente:** builder para el ray tracer (superficies 3D del ojo completo) y
  comparación paraxial↔trazado sobre ojos sintéticos.
- **Aceptación restante:** diferencia foco paraxial vs trazado documentada por rango de AL.

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

## SPRINT 8 — Geometría anatómica adicional (EQ/LEP, ATA, STS, tilt) — **PENDIENTE**

- Interfaces de datos ya presentes en `EyeModel` (campos opcionales). Falta: experimentos
  de ablación (base vs base+EQ vs anatomía ampliada) sobre sensibilidad e información.

## SPRINT 9 — Sistema tórico independiente — **PENDIENTE**

- Vectores de doble ángulo limpios, meridianos, SIA, córnea posterior física (cuando
  esté medida), catálogo; comparación frente a EVO. Nota: el álgebra de doble ángulo
  se reescribe en `src/`, no se importa del legacy.

## SPRINT 10 — Incertidumbre — **PENDIENTE**

- Sensibilidad local + Monte Carlo + intervalos físicos + ranking de alternativas
  (la estructura `uncertainty` de `PredictionResult` ya lo soporta).

## SPRINT 11 — Benchmark global (dashboard científico) — **PENDIENTE**

- Comparar EVO réplica vs paraxial vs ray tracing; mapas de divergencia; sin afirmar
  superioridad clínica. Base ya existente: `src/bench/` + experimentos 001/002.

## SPRINT 12 — Clinical readiness — **PARTIAL**

- **Hecho:** esquemas JSON de datos clínicos (preop/cirugía/postop, sin PII) +
  `CLINICAL_DATA_REQUIREMENTS.md` + `VALIDATION_STRATEGY.md`.
- **Pendiente:** importadores/validadores de ficheros reales y protocolo experimental
  final (requiere conocer el formato de export del centro).

---

## Orden de ejecución y dependencias

0 → 1 → 2 → 3 → (4 ‖ 5) → 6 → 7 → 8/9 → 10 → 11 → 12. El sprint 5 se adelantó sobre el
builder paraxial (dependencia real satisfecha); el trazado del ojo completo (resto del
4) no bloquea 6–7 pero sí la parte de trazado de 11.

## Definición de éxito V0 (checklist)

- [x] Baseline EVO reproducible y congelado
- [x] Motor paraxial independiente
- [x] Ray tracer funcional (superficies esféricas, foco)
- [x] Modelo de ojo configurable (datos) — [ ] builder de trazado completo
- [x] Modelo de LIO configurable con UNKNOWN
- [x] Optimizador de potencia
- [ ] Motor tórico inicial
- [x] Análisis de sensibilidad (ELP) — [ ] resto de variables
- [x] Generador sintético etiquetado
- [x] Benchmark contra EVO (primer mapa de divergencia)
- [x] Estructura de incertidumbre en resultados — [ ] Monte Carlo
- [x] Arquitectura modular de posición postoperatoria
- [x] Soporte de datos para EQ/OCT (campos opcionales)
- [x] Esquema de datos clínicos
- [x] Tests extensos (unit/property/regresión/numéricos)
- [x] Documentación científica inicial completa
