# VALIDATION_STRATEGY — Estrategia de validación

**Versión:** 1.0 · **Fecha:** 10/08/2026 · RESEARCH USE ONLY

## Principio

La validación se define ANTES de mirar datos. Tres niveles, cada uno con su verdad
de referencia y sus límites declarados:

## Nivel 1 — Validación física (disponible hoy)

- **Verdad:** formas cerradas de la óptica (foco de dioptrio, lensmaker, round-trips
  de vergencia, ley de Snell cuantitativa).
- **Mecanismo:** tests unitarios/property/numéricos (`npm test`); ningún valor
  esperado escrito de memoria: se deriva algebraicamente en el propio test.
- **Cobertura actual:** 42 tests verdes (baseline, core, paraxial, ray tracer, bench).
- **Validación cruzada interna:** trazado → paraxial cuando h→0 (testado); la
  comparación sistemática sobre el ojo completo es Sprint 4/11.

## Nivel 2 — Benchmark contra EVO congelado (disponible hoy)

- **Verdad:** NO es verdad clínica; es un punto de referencia estable y reproducible
  (8.319 respuestas reales cacheadas; réplica con métricas conocidas).
- **Mecanismo:** `src/bench/` con contrato común; mapas de divergencia en
  `experiments/` (exp002 es el primero). El resultado se lee como LOCALIZACIÓN de
  desacuerdo, jamás como ranking de acierto.
- **Uso:** priorizar qué regiones anatómicas necesitan datos clínicos primero.

## Nivel 3 — Validación clínica (futura, requiere datos reales)

- **Verdad:** refracción manifiesta estable postoperatoria y, cuando exista, posición
  de LIO medida (`postop.schema.json`).
- **Diseño preregistrado (antes de ver datos):**
  1. Partición temporal o por centro (nunca aleatoria simple si hay efecto cirujano).
  2. Métricas primarias: error absoluto medio y mediano de EE; % dentro de ±0.25 /
     ±0.50 / ±1.00 D; para posición: mm de error absoluto del predictor.
  3. Comparadores: EVO réplica (y EVO real cacheada donde exista), motor físico con
     cada predictor de posición, y fórmulas publicadas si se implementan con fuente.
  4. Los casos de las regiones de divergencia (exp002) se analizan como subgrupo
     prioritario preespecificado.
  5. Sin datos suficientes para separar ajuste/validación honestamente, no se
     calibra: solo se reporta.
  6. **Modo de fidelidad STRICT obligatorio** (`src/core/fidelity.mjs`, desde la
     revisión pre-V1.2): todo cálculo del estudio se ejecuta con
     `fidelity: STRICT`, de modo que ningún caso validado contenga NINGÚN supuesto
     — ni siquiera declarado — sobre parámetros ópticamente relevantes: un resultado
     con supuestos validaría el supuesto, no el motor. Los casos bloqueados por
     STRICT no se descartan en silencio: `StrictModeViolation` transporta la lista
     exacta de supuestos, y el estudio reporta cuántos casos quedaron excluidos y
     por qué dato faltante (eso ES un resultado: mide qué datos exige el motor).

## Reproducibilidad transversal

Semillas fijas en todo experimento; configuración + timestamp + commit hash en cada
`experiments/*/results.json`; datasets inmutables con hash (baseline ya congelado);
prohibido el resultado no regenerable.
