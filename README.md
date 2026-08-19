# Plataforma de investigación en cálculo de LIO

**RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING**

Motor óptico experimental en el que la potencia de una lente intraocular se elige **trazando
rayos por un modelo físico explícito**, con cada supuesto declarado y cada resultado
etiquetado como simulación.

> ## Qué es y qué NO es
>
> **ES** una plataforma de investigación: reproduce su propia física, mide sus propias
> divergencias frente a otros modelos, declara sus supuestos y verifica que no cambian sin
> avisar.
>
> **NO ES** una calculadora clínica validada. No existe **ninguna** comparación contra
> refracción postoperatoria real, porque no hay cohorte. No debe usarse para decidir la
> potencia de una lente en un paciente.
>
> Cuando este repositorio compara con otra calculadora, mide **divergencia** — nunca error ni
> acierto. Medir divergencia no es medir quién se acerca más a un paciente.

## Estado

**V1 cerrada en su alcance ejecutable: 14/15 sprints DONE; V1.10 permanece BLOCKED** por una
dependencia externa (falta una publicación citable con coeficientes de predictores de
posición). No se escribe «15/15»: sería falso.

343 tests · 12 experimentos deterministas verificados en cada push · CI en Linux y Windows.

## Por dónde empezar

| Si quieres… | Lee |
|---|---|
| **entender qué hace y qué no demuestra** (empieza aquí) | [`docs/V1_CLOSURE.md`](docs/V1_CLOSURE.md) |
| entender el motor de extremo a extremo | [`docs/scientific/RAY_TRACING.md`](docs/scientific/RAY_TRACING.md) |
| saber qué preguntas científicas siguen abiertas | [`docs/scientific/OPEN_QUESTIONS.md`](docs/scientific/OPEN_QUESTIONS.md) |
| ver las limitaciones declaradas | [`docs/scientific/LIMITATIONS.md`](docs/scientific/LIMITATIONS.md) |
| entender cómo se validaría clínicamente | [`docs/scientific/VALIDATION_STRATEGY.md`](docs/scientific/VALIDATION_STRATEGY.md) |
| ver el estado sprint a sprint | [`CURRENT_SPRINT.md`](CURRENT_SPRINT.md) · [`docs/V1_PROJECT_PLAN.md`](docs/V1_PROJECT_PLAN.md) |
| ver los experimentos | [`experiments/`](experiments/) y la matriz en `V1_CLOSURE.md` §12 |
| ver el informe de rendimiento | [`bench/REPORT_V1_14.md`](bench/REPORT_V1_14.md) |

## Los dos sistemas del repositorio

1. **`legacy/evo_replica/`** — réplica congelada de la calculadora EVO Toric v2.0, obtenida
   por caracterización de caja negra (8.311 consultas reales). Se usa como **benchmark y
   control experimental**, nunca como verdad ni como fuente de parámetros. **No se modifica**:
   102 hashes verificados en cada push, en Linux y en Windows.
2. **`src/`** — el motor científico independiente: modelo de datos anatómico, óptica paraxial
   propia, trazado de rayos, optimizador de potencia, sistema de incertidumbre y benchmark.
   La **física no toca el legado**: un único adaptador declarado
   (`src/bench/engines/evo_engine.mjs`), en la capa de benchmark, puede importarlo — y solo
   por su API pública. Un test de arquitectura vigila exactamente eso: que sea ese módulo y
   ningún otro, y que no entre por una puerta interna.

## Cómo leer cualquier cifra de este repositorio

1. Si compara con EVO u otra calculadora, es **divergencia**, no error ni acierto.
2. Si sale de un experimento, es **simulación** con parámetros declarados.
3. Si menciona una posición de LIO, es **predicha**, nunca medida.
4. Si menciona sigmas, son **escenarios declarados** salvo que citen una fuente.
5. Si una dimensión aparece como `unsupported`, significa **no calculada**, no cero.
6. Si un supuesto está en `assumptions`, es un supuesto **registrado**, no un dato.

## Ejecución

```bash
npm test                            # suite completa (runner nativo de Node ≥ 20, sin dependencias)
node scripts/check_experiments.mjs  # los 12 experimentos reproducen su results.json número a número
node bench/run_bench.mjs            # caracterización de rendimiento (depende de la máquina)
```

## Producto de usuario preexistente

Vive en la raíz, **fuera** del alcance científico de `src/`. Se conserva en su función y sus
cifras, pero **no está intacto**: la auditoría de cierre de V1 corrigió en él
sobreafirmaciones clínicas y una cifra —ver el §8 bis de
[`docs/V1_CLOSURE.md`](docs/V1_CLOSURE.md), que además declara la tensión pendiente con sus
generadores congelados.
`calculadora-torica.html`, `engine.js`, `dashboard.html`, `informe-cientifico.html`,
[`INFORME.md`](INFORME.md), [`COMPARATIVA-CALCULADORAS.md`](COMPARATIVA-CALCULADORAS.md).
[`PROJECT_PLAN.md`](PROJECT_PLAN.md) es el plan **histórico de V0**; el vigente es
`docs/V1_PROJECT_PLAN.md`.
