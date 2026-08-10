# CURRENT_SPRINT

**Fecha:** 10/08/2026 · **Última sesión completada:** Sprints 0–3 y 5 (DONE); 4, 6, 7 y 12 (PARTIAL)

## Estado al cierre de la sesión

| Sprint | Estado | Evidencia |
|---|---|---|
| 0 Baseline | DONE | `legacy/evo_replica/` + 6 tests de regresión; métricas replicadas exactamente offline |
| 1 Core | DONE | `src/core/` + predictores + schemas clínicos; 9 tests |
| 2 Paraxial | DONE | `src/optics/paraxial.mjs`; 8 tests de forma cerrada |
| 3 Ray tracer | DONE | `src/optics/raytrace/`; 12 tests unit/property/numéricos |
| 4 Ojo completo | PARTIAL | builder paraxial hecho; falta builder de superficies para trazado |
| 5 Optimizador | DONE | `src/optimize/` + benchmark multi-motor; 7 tests |
| 6 Sintético+sensibilidad | PARTIAL | generador + exp001 (sensibilidad ELP) + exp002 (divergencia) |
| 7 Predictor de posición | PARTIAL | interfaz + 2 simulados + regresión con procedencia obligatoria; literatura/ML BLOCKED (OPEN_QUESTIONS #2, datos reales) |
| 12 Clinical readiness | PARTIAL | schemas + VALIDATION_STRATEGY; faltan importadores |

**Suite de tests: 42/42 verdes** (`npm test`).

## Próximo sprint recomendado: 4 (cierre) + 9

**Objetivo:** builder de superficies del ojo completo para el ray tracer (córnea 2
superficies + LIO gruesa genérica + retina) y comparación sistemática
paraxial↔trazado por AL (cierra Sprint 4); después, motor tórico independiente
(Sprint 9: doble ángulo limpio en `src/`, meridianos, SIA, catálogo).

**Cambios previstos:** `src/optics/eyebuilder.mjs` (modo raytrace), `src/toric/`,
`experiments/exp003_paraxial_vs_raytrace/`, tests nuevos.

**Criterios de aceptación:** foco trazado vs paraxial documentado por rango de AL con
haz bajo (validación cruzada); vectores tóricos con property-tests (suma conmutativa,
mod 180, ida/vuelta); sin NaN en barridos.

**Bloqueos conocidos:** ninguno para 4/9. Los BLOCKED reales del proyecto siguen
siendo: coeficientes de literatura sin fuente delante y todo lo que requiera datos
postoperatorios reales (registrados en OPEN_QUESTIONS.md).
