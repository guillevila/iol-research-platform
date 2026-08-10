# CURRENT_SPRINT

**Fecha:** 10/08/2026 · **Hito:** **V0 COMPLETADA** (§25 del encargo)

## Estado final de V0

| Sprint | Estado |
|---|---|
| 0 Baseline congelado | DONE |
| 1 Core científico | DONE |
| 2 Paraxial propio | DONE |
| 3 Ray tracer | DONE |
| 4 Ojo completo (paraxial + trazado) | DONE |
| 5 Optimizador | DONE |
| 6 Sintético + sensibilidad | DONE (inicial: ELP, paraxial↔trazado, EQ; tilt/descentración → V1) |
| 7 Posición de LIO modular | DONE (inicial; literatura/ML BLOCKED con motivo) |
| 8 Geometría ampliada | DONE (inicial: exp006; ATA/STS/tilt → V1) |
| 9 Tórico independiente | DONE (inicial; rotación y tórico trazado → V1) |
| 10 Incertidumbre Monte Carlo | DONE |
| 11 Benchmark global | DONE (inicial) |
| 12 Clinical readiness | DONE |

**Suite: 67/67 tests verdes** · 6 experimentos reproducibles (exp001–exp006) ·
13 commits · dashboard científico regenerable.

## BLOCKED permanentes de V0 (requieren el mundo exterior)

1. Coeficientes de modelos de literatura → fuente citable delante (OPEN_QUESTIONS #2).
2. Geometría real de LIO comerciales → fichas de fabricante (#4).
3. Sigmas reales de medida/biología → repetibilidad de dispositivo + cohorte (#6).
4. Cualquier calibración o ML clínico → datos postoperatorios conforme al protocolo
   preregistrado (`PROTOCOL_FIRST_CLINICAL_BATCH.md`).

## Candidatos V1 (por orden de valor científico)

1. **Superficies cónicas e inclinadas** en el trazador (asfericidad Q, tilt,
   descentración) → desbloquea sensibilidad a tilt (Sprint 6/8 restante) y tórico
   trazado.
2. **Optimizador sobre ray tracing** (además del paraxial) → columna de trazado en el
   mapa de divergencia del dashboard.
3. **Rotación tórica**: pérdida de efecto por desalineación y su Monte Carlo.
4. **Adaptador de export del centro** sobre el importador (cuando se conozca formato).
5. Con datos reales: ejecutar el protocolo preregistrado tal cual.
