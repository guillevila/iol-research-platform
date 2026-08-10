# CURRENT_SPRINT

**Fecha:** 10/08/2026 · **Últimas sesiones:** Sprints 0–5 y 9 (DONE); 6, 7 y 12 (PARTIAL)

## Estado al cierre

| Sprint | Estado | Evidencia |
|---|---|---|
| 0 Baseline | DONE | métricas replicadas offline; hashes; golden; 6 tests |
| 1 Core | DONE | core + predictores + schemas; 9 tests |
| 2 Paraxial | DONE | vergencias propias; 8 tests de forma cerrada |
| 3 Ray tracer | DONE | Snell 3D + foco; 12 tests |
| 4 Ojo completo | DONE | builders paraxial y de trazado; validación cruzada; exp003 |
| 5 Optimizador | DONE | mejor/segunda opción, empates, sensibilidad; bench |
| 9 Tórico | DONE (inicial) | vectores + motor por meridianos con datos medidos; integrado en bench; 7 tests |
| 6 Sintético+sensibilidad | PARTIAL | generador + exp001/exp002/exp003; falta tilt/descentración/posterior |
| 7 Posición de LIO | PARTIAL | interfaz + simulados; literatura/ML BLOCKED (OPEN_QUESTIONS) |
| 12 Clinical readiness | PARTIAL | schemas + estrategia; faltan importadores |

**Suite: 54/54 tests verdes** (`npm test`). Experimentos reproducibles en `experiments/`.

## Próximo sprint recomendado: 10 (incertidumbre) + 11 (benchmark global)

**Objetivo 10:** Monte Carlo sobre las entradas con incertidumbre declarada (posición
de LIO, AL, K, ACD) → intervalos físicos en `PredictionResult.uncertainty`; ranking de
alternativas con probabilidad de empate.
**Objetivo 11:** dashboard científico comparando EVO réplica vs paraxial (esférico y
tórico) vs trazado sobre rejillas y muestras sintéticas; mapas de divergencia
navegables. Sin afirmaciones de superioridad clínica.

**Cambios previstos:** `src/uncertainty/montecarlo.mjs`, `experiments/exp004_montecarlo`,
generador de dashboard en `experiments/` reutilizando el patrón SVG del dashboard
operativo; tests de reproducibilidad de percentiles con semilla fija.

**Criterios de aceptación:** percentiles estables con semilla (test); intervalos
coherentes con las sensibilidades de exp001; dashboard sin datos incrustados a mano
(regenerado desde results.json).

**Bloqueos:** ninguno para 10/11. Sprint 8 (EQ/ATA/STS) puede ejecutarse en paralelo
como análisis de capacidad informativa con supuestos declarados.
