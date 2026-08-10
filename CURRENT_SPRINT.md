# CURRENT_SPRINT

**Fecha:** 10/08/2026 · **Últimas sesiones:** Sprints 0–5, 9, 10 y 11 (DONE); 6, 7 y 12 (PARTIAL); 8 (PENDIENTE)

## Estado al cierre

| Sprint | Estado | Evidencia |
|---|---|---|
| 0 Baseline | DONE | métricas replicadas offline; hashes; golden; 6 tests |
| 1 Core | DONE | core + predictores + schemas; 9 tests |
| 2 Paraxial | DONE | vergencias propias; 8 tests de forma cerrada |
| 3 Ray tracer | DONE | Snell 3D + foco; 12 tests |
| 4 Ojo completo | DONE | builders paraxial y de trazado; validación cruzada; exp003 |
| 5 Optimizador | DONE | mejor/segunda opción, empates, sensibilidad; bench |
| 9 Tórico | DONE (inicial) | vectores + motor por meridianos; integrado en bench; exp005 |
| 10 Incertidumbre | DONE | Monte Carlo con semilla; 6 tests; exp004 |
| 11 Benchmark global | DONE (inicial) | dashboard-investigacion.html desde results.json |
| 6 Sintético+sensibilidad | PARTIAL | falta tilt/descentración/posterior (depende de superficies inclinadas) |
| 7 Posición de LIO | PARTIAL | literatura/ML BLOCKED (OPEN_QUESTIONS #2 y datos reales) |
| 12 Clinical readiness | PARTIAL | schemas + estrategia; faltan importadores/validadores de ficheros |
| 8 Geometría ampliada | PENDIENTE | campos de datos listos; faltan experimentos de ablación |

**Suite: 60/60 tests verdes** (`npm test`). Experimentos: exp001–exp005 reproducibles.

## Próximo sprint recomendado: 8 + 12 (cierre de V0)

**Objetivo 8:** experimentos de ablación sobre capacidad informativa: bajo supuestos
geométricos DECLARADOS, ¿cuánto reduce la incertidumbre de posición conocer EQ/LEP,
ATA, STS o diámetro cristaliniano? (análisis de información con sintéticos; sin
afirmar validez biológica). Entregable: exp006 + actualización de IOL_POSITION.md.

**Objetivo 12 (cierre):** importadores CSV/JSON contra los schemas con validación
estricta y anonimización verificada; protocolo experimental final para el primer
lote de datos reales (VALIDATION_STRATEGY nivel 3 preregistrado).

**Criterios de aceptación:** exp006 reproducible con supuestos declarados en la
config; importador rechaza PII y campos fuera de rango con mensajes útiles; dry-run
con fixtures sintéticas en tests.

**Bloqueos:** ninguno para 8/12. Tras ellos, V0 queda completa según §25 salvo los
puntos que exigen datos externos (documentados como BLOCKED).
