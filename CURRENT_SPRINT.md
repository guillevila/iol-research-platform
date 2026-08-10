# CURRENT_SPRINT

**Fecha:** 10/08/2026 · **Hito:** V0.5 completa (`v0.5-hardening-complete`) · **V1 en curso**
**Suite:** 154/154 tests verdes · CI verde (5 jobs) · 4 experimentos deterministas verificados en CI
RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING

## Dónde estamos

| Fase | Estado |
|---|---|
| V0 (motor paraxial + benchmark congelado) | DONE — ver histórico al pie |
| **V0.5 endurecimiento** (10 hallazgos de `docs/V0_REVIEW.md`) | **DONE** — `docs/V0_5_CLOSURE.md`, tag `v0.5-hardening-complete` |
| **V1** (calculadora por trazado, plan en `docs/V1_PROJECT_PLAN.md`) | **EN CURSO** — 3/15 sprints + revisión pre-V1.2 |

## V1 — estado por sprint

| Sprint | Estado | Nota |
|---|---|---|
| V1.1 `OpticalObjective` + `RaytracePowerOptimizer` | **DONE** | exp008; convergencia O(pupila²) al paraxial del mismo sistema |
| V1.13 Puerta de autoconsistencia pupila→0 (rejilla 18 ojos) | **DONE** | adelantada a propósito: existe ANTES de añadir grados de libertad |
| V1.4 `RayBundleGenerator` (4 muestreos, convergencia medida) | **DONE** | `SQUARE_GRID` documentado como no-convergente (limitación medida) |
| Revisión pre-V1.2 (a petición) | **DONE** | ver bloque siguiente |
| V1.2 Superficies cónicas | **SIGUIENTE** | los tres estados de asfericidad ya existen; falta el trazado cónico |
| V1.3 Tilt y descentración | pendiente | requiere muestreo 2D (ya disponible en V1.4) |
| V1.5 Córnea física en el trazado | pendiente | políticas corneales ya explícitas (P0.1) |
| V1.6 Tórico trazado · V1.7 Rotación | pendiente | |
| V1.8 `RaytraceEngine` en benchmark · V1.9 Divergencia | pendiente | terminología: divergencia, nunca error |
| V1.11 Pipeline EQ · V1.12 Incertidumbre · V1.14 Rendimiento · V1.15 Docs | pendiente | |
| V1.10 Predictores de literatura | **BLOCKED** | OPEN_QUESTIONS #2: sin publicación con coeficientes, no se implementa |

## Revisión pre-V1.2 (los tres puntos pedidos)

1. **B ≡ C demostrado y reducido.** `BEST_FOCUS_ON_RETINA` y `EQUIVALENT_DEFOCUS` eran el
   mismo criterio de optimización en unidades distintas (mismo argmin; demostración en
   `objective.mjs`, tests en `objective_equivalence.test.mjs`). Quedan DOS objetivos
   (A: RMS en retina; C: desenfoque equivalente) y la métrica de B se reporta
   (`detail.desplazamiento_mm`). exp008 regenerado: diff numérico = 0.
2. **`ASSUMED_SPHERICAL` introducido.** Tres estados de asfericidad que no se convierten
   entre sí en silencio: Q numérica documentada → el trazador FALLA hasta implementar
   cónicas; `ASSUMED_SPHERICAL` → esfera por supuesto declarado (la genérica);
   `UNKNOWN` → esfera con el supuesto REGISTRADO en `eye.assumptions`.
3. **exp007 reencuadrado.** Mide sensibilidad sintética a la CONVENCIÓN de índice
   queratométrico, no diferencias entre marcas reales de biómetro. Título, campos y docs
   corregidos; diff numérico = 0.

## BLOCKED permanentes (requieren el mundo exterior; nada se desbloquea con código)

1. Coeficientes de literatura → fuente citable delante (OPEN_QUESTIONS #2).
2. Geometría real de LIO comerciales → fichas de fabricante (#4); sin ellas, `UNKNOWN` y el trazado falla.
3. Sigmas reales de medida/biología → repetibilidad + cohorte (#6).
4. Elección de política corneal (#7) y de criterio óptico (#8) → cohorte postoperatoria.
5. Cualquier calibración o ML clínico → datos conforme a `PROTOCOL_FIRST_CLINICAL_BATCH.md`.

## Invariantes que la CI vigila en cada push

- Legado EVO byte-idéntico (102 hashes, en Linux y Windows).
- El motor físico no importa nada del legado (test de arquitectura).
- Los experimentos deterministas (exp001/003/007/008) reproducen su `results.json` publicado.
- Ningún parámetro del motor procede de ajustar contra EVO.

---

<details><summary>Histórico V0 (cerrado 10/08/2026, 67 tests)</summary>

Sprints 0–12 DONE: baseline congelado, core científico, paraxial propio, ray tracer,
ojo completo, optimizador, sintéticos + sensibilidad (exp001–exp003), posición modular,
geometría ampliada (exp006), tórico independiente, Monte Carlo (exp004), benchmark
global (exp002/exp005), clinical readiness. Detalle en `PROJECT_PLAN.md` y
`docs/V0_REVIEW.md` (auditoría posterior con 10 hallazgos, todos cerrados en V0.5).

</details>
