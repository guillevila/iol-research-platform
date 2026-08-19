# IOL_POSITION — Predicción de la posición postoperatoria de la LIO

**Versión:** 1.1 · **Fecha:** 19/08/2026 · RESEARCH USE ONLY
*(v1.1: registra `EquatorialPlanePredictor` — H_EQ pasa a ser código de CAPA B en V1.11.)*

## Por qué es la variable central

En la óptica paraxial del pseudofáquico, la refracción final depende de forma no lineal
de la posición axial de la LIO. El proyecto trata esa posición como una **predicción
biológica separada** de la óptica (CAPA B), de modo que distintos predictores puedan
compararse manteniendo idéntica la física. La magnitud exacta del impacto (D de error
por mm de desplazamiento, según tipo de ojo y potencia) se mide empíricamente en
`experiments/exp001_sensibilidad_elp` — no se asume.

## Definición geométrica (contrato)

`iol_position_mm` = distancia desde el ápex corneal anterior (z=0) hasta el **plano
principal/central de la LIO**, en mm, sobre el eje óptico (+z hacia retina). No es la
"ELP" de una fórmula concreta ni la ACD postoperatoria medida a superficie anterior de
la lente; las conversiones entre convenciones deben ser explícitas (OPEN_QUESTIONS #3).

> **El motor no honra hoy este contrato al pie de la letra, y conviene saberlo**
> (auditoría V1.15). Los constructores de ojo posicionan la lente gruesa por su **CENTRO
> geométrico**, que solo coincide con el plano principal en lentes simétricas; para una
> asimétrica plausible el sesgo medido es ~0.3 mm ≈ 0.4 D. El supuesto **se registra** en
> `assumptions` y **bloquea en STRICT**, así que no pasa inadvertido — pero el contrato
> completo exige implementar el posicionamiento por planos principales calculados de la
> geometría, que sigue pendiente (parte interna de OQ #3).

## Interfaz

```js
predictor.predict(preopEye, iol?) -> { iol_position_mm, source, inputs_used, hypothesis? }
```

Toda salida documenta su procedencia (`source`) y qué variables usó (`inputs_used`).
`hypothesis` es opcional: cuando NO es nulo, marca el resultado como **condicional a una
hipótesis biológica sin validar** (p. ej. `'H_EQ'`). Es una marca legible por máquina, no
prosa: la capa de incertidumbre la transporta hasta su salida en `procedencia_posicion`
(con `condicional_a_hipotesis`), de modo que ningún consumidor aguas abajo pueda tomar el
número por una posición medida. Un predictor sin hipótesis declarada deja el campo ausente
y su salida lo refleja — la posición sigue siendo PREDICHA, nunca medida.

## Implementaciones disponibles

| Clase | Modelo | Estado |
|---|---|---|
| `ConstantOffsetPredictor(offset)` | ACD + offset declarado | SIMULACIÓN (para sensibilidad; no calibrado) |
| `FractionOfALPredictor(f)` | f·AL declarada | SIMULACIÓN (ídem) |
| `EquatorialPlanePredictor()` | H_EQ: LIO en el ecuador capsular, aproximado por ACD + LT/2 | SIMULACIÓN — **hipótesis DECLARADA**, sin parámetros libres ni calibración; NO lee `lens_eq_plane_mm` (el EQ MEDIDO sigue reservado, OQ #2+#3); validarla exige posición postoperatoria real |
| `LinearRegressionPredictor({...,provenance})` | lineal sobre anatomía | Esqueleto: **inconstruible sin procedencia documentada** |
| Modelos de literatura | — | **BLOCKED**: exigen fuente con coeficientes delante (OPEN_QUESTIONS #2) |
| Predictor ML | — | **BLOCKED**: exige datos postoperatorios reales |

## Programa experimental (con la plataforma actual, sin datos clínicos)

1. **Sensibilidad** (exp001): cuantificar Δrefracción por Δposición en ojos cortos /
   normales / largos y potencias altas/bajas → fija qué precisión de posición mantendría la
   divergencia por debajo de un criterio DECLARADO. Ese criterio (0.25 D, el escalón habitual
   de redondeo en refracción escrita) es una elección de este proyecto, **no** un umbral
   clínico con respaldo aportado aquí; ver `experiments/exp001_sensibilidad_elp/ERRATA.md`.
2. **Capacidad informativa** (Sprint 8 del plan de **V0** — no confundir con V1.8 —,
   ejecutado en `experiments/exp006_capacidad_eq`):
   bajo la hipótesis declarada H_EQ (LIO en el ecuador capsular; ecuador = ACD+LT/2 +
   desvío biológico σ_bio) y con σ_bio/σ_m **DECLARADAS sin procedencia medida** (OQ #6),
   un estimador del ecuador con σ_m solo tiene menor divergencia de posición esperada que
   el estimador base si σ_m < σ_bio, y su traducción en dioptrías escala con la potencia
   del ojo: con σ_bio=0.3 mm y σ_m=0.1 mm, ~0.36 D en ojos cortos frente a ~0.10 D en
   largos. **Nada de esto es un beneficio clínico** (ver `exp006_capacidad_eq/ERRATA.md`).
   Es un análisis condicional: la validez de H_EQ la decidirán datos reales
   (PROTOCOL_FIRST_CLINICAL_BATCH.md, objetivo primario).
   **Desde V1.11**, H_EQ es además un predictor de CAPA B implementado
   (`EquatorialPlanePredictor`) — ya no un cálculo inline de experimento — y
   `experiments/exp015_pipeline_eq_trazado` lo hace atravesar el pipeline físico:
   reproduce el eje paraxial de exp006 bit a bit (27/27 celdas, o sea que promover
   H_EQ a CAPA B es numéricamente neutro) y publica la divergencia del trazado
   descompuesta en canales de un solo cambio. **Que exista implementación no valida
   H_EQ**: sigue siendo hipótesis declarada, y el ecuador MEDIDO (`lens_eq_plane_mm`)
   sigue sin consumirse.
3. **Con datos reales** (futuro): regresiones base `f(AL, ACD, LT, K)` vs ampliadas
   `f(+EQ...)` contra posición medida; el criterio de comparación queda definido en
   `VALIDATION_STRATEGY.md` antes de ver dato alguno.
