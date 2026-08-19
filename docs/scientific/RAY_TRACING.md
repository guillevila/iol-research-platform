# RAY_TRACING — El motor óptico, de extremo a extremo

**Versión:** 2.0 · **Fecha:** 19/08/2026 · RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING

Documento técnico canónico del motor tal como está **hoy**, al cerrar V1. No es una
cronología de sprints: describe el pipeline vigente, sus convenciones y sus límites. Para
qué demuestra y qué no demuestra la plataforma en conjunto, ver
[`../V1_CLOSURE.md`](../V1_CLOSURE.md).

---

## 1 · El pipeline, en orden

Cada flecha es una frontera real entre capas: lo de la izquierda no sabe nada de lo de la
derecha, y cada paso puede **fallar de forma explícita** en vez de rellenar un hueco.

```
  ojo PREOPERATORIO (dato medido)                    src/core/eye.mjs
        │
        ├─▶ interpretación CORNEAL (política declarada)    src/optics/cornea.mjs
        │        · KERATOMETRIC_READING  (lectura como potencia)
        │        · SINGLE_SURFACE_FROM_RADIUS (radio físico vía índice del dispositivo)
        │        · dos superficies si hay radios anterior+posterior medidos
        │        · tórica: derivada de K1/K2 o DECLARADA (jamás «medida»)   OQ #10
        │
        ▼
  predictor de POSICIÓN (CAPA B, biología)          src/predictors/iol_position.mjs
        │   predict(preop) → { iol_position_mm, source, inputs_used, hypothesis? }
        │   · ConstantOffset / FractionOfAL  (simulación declarada)
        │   · EquatorialPlane                (hipótesis H_EQ declarada)
        │   · LinearRegression               (exige provenance en construcción)
        │   · de literatura                  BLOQUEADO — OQ #2 / V1.10
        ▼
  ojo POSTOPERATORIO PREVISTO                        src/core/eye.mjs
        │   iol_position_mm ∈ [1.5, 8.5] y < AL, con position_source obligatorio
        │   + iol_pose opcional (vector: descentración, tilt eje-ángulo, rotación z)
        ▼
  geometría de LIO (factory)                         src/core/iol_factory.mjs
        │   CADA potencia construye SU propia geometría — nunca se reutiliza entre potencias
        │   Generic (sustituto declarado) · SyntheticToric (etiqueta→radios, declarada)
        │   Comercial sin ficha ⇒ geometry_status = UNKNOWN ⇒ el trazado FALLA   OQ #4
        ▼
  ojo TRAZABLE (superficies ordenadas en z)          src/optics/eyebuilder.mjs
        │   + assumptions[] registrados · + cornea_policy · + fidelity
        ▼
  HAZ de rayos                                       src/optics/raytrace/bundle.mjs
        │   MERIDIONAL · RINGS_EQUAL_AREA · FIBONACCI_SPIRAL · SQUARE_GRID
        │   pupila = parámetro de ESCENARIO declarado (≠ pupil_mm medida del ojo)
        ▼
  TRAZADO                                            src/optics/raytrace/{surfaces,trace}.mjs
        │   intersección → normal orientada → Snell vectorial → siguiente superficie
        │   pérdidas contabilizadas con causa: apertura, TIR, NaN
        ▼
        ├──▶ camino ESFÉRICO / EE ────────────────────────────────────┐
        │      objetivo escalar          src/optics/objective.mjs      │
        │      A · RMS del spot en retina                              │
        │      C · desenfoque equivalente del mejor foco (D)           │
        │                                                              ▼
        │                                          optimización de POTENCIA
        │                                          src/optimize/raytrace_power.mjs
        │                                          · continua (sección áurea)
        │                                          · + catálogo: cada escalón evaluado
        │                                            una vez → recomendada, segunda
        │                                            opción y no-evaluables registrados
        │
        └──▶ camino TÓRICO ──────────────────────────────────────────┐
               los objetivos escalares se RECHAZAN (destruyen el eje) │
               métrica 2D    src/optics/raytrace/astigmatism.mjs      ▼
               M(z) = M0 + M1·z + M2·z² exacta → autoproblema         análisis clínico
               generalizado → dos líneas focales + eje                (esfera/cilindro/eje)
               ⚠ la OPTIMIZACIÓN de potencia tórica sigue UNSUPPORTED

  y sobre cualquiera de los dos caminos:
        · INCERTIDUMBRE   src/uncertainty/raytrace_uncertainty.mjs   (V1.12)
        · BENCHMARK       src/bench/                                  (V1.8)
```

## 2 · Convenciones (fuente canónica: `src/core/units.mjs`)

| Convención | Valor |
|---|---|
| **Datum axial** | ápex corneal anterior = z = 0; eje óptico = +z hacia la retina |
| **Unidades internas** | milímetros; dioptrías solo donde se declara |
| **Radio firmado** | R > 0 ⇒ centro de curvatura a la derecha del vértice |
| **Índices** | `n_before` / `n_after` según el sentido de la luz |
| **`iol_position_mm`** | ápex corneal → **plano principal/central** de la LIO. No es la ACD postoperatoria ni la «ELP» de una fórmula |
| **`acd_mm`** | epitelio → cara anterior del cristalino. Comparte datum con lo anterior: por eso ACD + LT/2 es un `iol_position_mm` válido **sin** corrección por CCT |
| **Eje tórico** | el de la GEOMETRÍA (meridiano potente; `y` local + `rotation_z`). Distinto del eje clínico minus-cylinder (meridiano plano) y de las marcas comerciales — tres cosas que **no** se mapean entre sí sin ficha (OQ #11) |
| **Pose** | vector, no escalares: descentración (x,y), tilt eje-ángulo (tx,ty), `rotation_z` aplicada primero en el marco local. Orden `R_tilt · Rz` |
| **Signo del desenfoque** | + = enfoca por detrás de la retina (hipermétrope) |

**Un rayo perdido nunca desaparece en silencio:** se contabiliza con su causa.

## 3 · Superficies e intersección

| Tipo | Método | Nota |
|---|---|---|
| **plana** | analítico | apertura con tolerancia declarada |
| **esférica** | cuadrática, casquete útil seleccionado | normal orientada contra el rayo |
| **cónica** (Q) | cuadrática por **Citardauq**, no la fórmula clásica | evita la cancelación catastrófica cuando A→0 (k ≈ −1, \|R\| grande), que convertía imprecisión en **rechazo de intersecciones genuinas** |
| **bicónica** (tórica) | **Newton salvaguardado** con horquilla | no es cuádrica: no hay forma cerrada. Ventana acotada por losa ∩ apertura, barrido fino de 256 muestras, todas las horquillas en orden de t, gana la primera raíz válida |
| **transformada** | envoltorio rígido global↔local | la pose no duplica la matemática de intersección de la base |

**Asfericidad: tres estados que no se convierten entre sí en silencio.** `k` numérico
documentado → cónica; `ASSUMED_SPHERICAL` → esfera por supuesto **declarado**; `UNKNOWN` →
esfera con el supuesto **registrado** en `assumptions`. Nunca se convierte tácitamente en
Q = 0.

## 4 · Métrica de foco

El tamaño de mancha es el **RMS alrededor del CENTROIDE** del haz, no alrededor del eje.
Corrección de V1.3, motivada por un defecto real: con una LIO posada el haz entero se desplaza
lateralmente (prisma), y medir sobre el eje mezclaba ese desplazamiento con el desenfoque —
producía separaciones A–C absurdas (~10 D) que **no eran física**. El desplazamiento del
centroide es apuntamiento (el ojo fija moviéndose), no borrosidad.

`bestFocus` localiza el plano de mínimo RMS por sección áurea (RMS(z) es unimodal cerca del
foco). Un mínimo pegado al borde del bracket **no se devuelve**: se rechaza con nombre, porque
o el bracket no contiene el foco o el haz es degenerado.

Para sistemas **tóricos** el foco escalar no existe. La métrica 2D calcula la matriz de segundo
momento M(z) = M0 + M1·z + M2·z² **exacta** tras la última superficie y extrae los focos y
meridianos principales por el autoproblema generalizado det(M1/2 + z·M2) = 0 — el eje sale de
la estructura **global** del haz, nunca de un plano donde el spot sea casi circular.

## 5 · Lente delgada frente a lente gruesa

Distinción que costó un hallazgo adversarial: el optimizador paraxial evalúa una lente
**delgada** (la potencia *es* el dato) salvo que se le inyecte una `iolFactory`, en cuyo caso
evalúa la lente **gruesa** que esa factory produce. Comparar paraxial ↔ trazado sin la misma
factory en ambos mezcla dos cosas distintas —modelo óptico y modelo de lente— y **la geometría
domina**: en V1.8 ese término era ~100 % de la cifra publicada. Toda comparación controlada
exige la misma factory en los dos motores, y `lens_model` lo declara en la salida.

## 6 · Procedencia y modo de fidelidad

- **`assumptions`**: todo supuesto que el motor introduce viaja en la salida.
- **`cornea_policy`, `position_source`, `provenance`**: de dónde viene cada decisión.
- **`RESEARCH`** (defecto): un `UNKNOWN` ópticamente relevante puede sustituirse por un
  supuesto **explícito y registrado**.
- **`STRICT`**: cualquier supuesto registrado **impide** el cálculo y enumera qué faltó. Es el
  modo de la validación futura. Hoy lo atraviesan la vía paraxial completamente medida y el
  trazado con todas las Q documentadas; **ninguna córnea tórica lo atraviesa**, por
  construcción, y eso es correcto (OQ #10).
- La **predicción de posición** queda fuera de la puerta de fidelidad a propósito: no es un
  dato faltante sino el objeto del cálculo. Su procedencia viaja aparte — y desde V1.11
  atraviesa también la capa de incertidumbre (`procedencia_posicion.hypothesis`,
  `condicional_a_hipotesis`), para que un resultado condicional a una hipótesis no validada
  sea distinguible por máquina.

## 7 · Validación del trazador (formas cerradas en el propio test)

| Prueba | Criterio |
|---|---|
| Incidencia normal invariante; n₁ = n₂ no refracta | barrido de ángulos |
| Snell cuantitativo | n₁·sin θᵢ = n₂·sin θₜ < 1e−12, salida unitaria |
| Reflexión total interna | exactamente en asin(n₂/n₁) ± 0.01 rad |
| Dioptrio esférico | el foco converge a f′ = n₂R/(n₂−n₁) cuando h→0, con error creciente en h |
| Cónica con k = 0 | coincide con la esfera ≤ 1e−12 (fórmulas distintas: la identidad bit a bit no es exigible) |
| Paraboloide (k = −1) | el cruce de cada rayo coincide con la solución cerrada |
| **Cónica cartesiana** k = −(n₁/n₂)² | aberración esférica **exactamente cero** — el test más sensible a errores de sagita o normal |
| Bicónica → cónica | recuperación a 1e−12 contra el algoritmo cerrado |
| Pose | reversibilidad, simetría ±pose, comportamiento O(s²) |
| Rotación tórica | +180° idéntica; +90° intercambia meridianos; anclas vectoriales ≤ 0.001 D |
| Autoconsistencia | apertura → 0 converge al paraxial del mismo sistema, sobre una rejilla de 18 ojos |
| Numérico | sin NaN en barridos de curvatura y altura; pérdidas contabilizadas |

## 8 · Límites numéricos declarados

- **Bicónica, incidencias rasantes**: un doble cruce a distancia sub-muestra (tangencia casi
  exacta) se **pierde contabilizado**; nunca se devuelve la rama lejana separada.
- **Cuadratura del haz**: el muestreo introduce un sesgo de localización ~O(1/n_anillos) que
  afecta a valores absolutos (nominal, media, percentiles) pero **no** a magnitudes de modo
  común como la desviación típica. Con `n_anillos = 5` la cuadratura llegó a sobreestimar
  \|ΔP\| ~7 % — y el ancla apertura→0 **no lo veía**.
- **Potencia trazada absoluta**: no está convergida en muestreo (deriva ~−8e−3 D entre 40 y 160
  anillos, y sigue derivando a 320). Lo interpretable entre motores es la **respuesta
  diferencial**, no el valor absoluto.
- **`SQUARE_GRID`**: documentado como no convergente (limitación medida, no un defecto oculto).
- **El ancla apertura→0 valida el límite, no la pupila finita**: que el trazado converja al
  paraxial cuando la apertura tiende a cero **no** demuestra que toda divergencia a pupila
  finita sea «la apertura».
- **Rendimiento**: los buffers reutilizables de la métrica de spot crecen y no encogen
  (≈1.25 MiB en el peor haz que el motor puede generar). Ver
  [`../../bench/REPORT_V1_14.md`](../../bench/REPORT_V1_14.md).

## 9 · Qué NO hace este motor

- **No optimiza potencia tórica**: el análisis 2D describe el astigmatismo resultante, pero
  elegir una LIO tórica sigue `UNSUPPORTED`. Una dimensión no soportada **nunca** se publica
  como cero.
- **No traza tilt ni descentración de la CÓRNEA** (solo de la LIO). La arquitectura de
  `surfaces.mjs` los admitiría sin tocar `trace.mjs`.
- **No calcula métricas de calidad de imagen** (MTF, Strehl): el «mejor foco» por RMS es una
  métrica geométrica.
- **No traza toricidad corneal posterior medida**: los tomógrafos la reportan y el modelo la
  almacena, pero se registra como dato disponible **no usado** (OQ #10).
- **No convierte entre convenciones de eje**: geometría, minus-cylinder clínico y marcas
  comerciales son tres cosas distintas y el motor solo conoce la primera.
- **No valida nada clínicamente.** Ver [`../V1_CLOSURE.md`](../V1_CLOSURE.md) §5.
