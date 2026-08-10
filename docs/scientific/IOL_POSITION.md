# IOL_POSITION — Predicción de la posición postoperatoria de la LIO

**Versión:** 1.0 · **Fecha:** 10/08/2026 · RESEARCH USE ONLY

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

## Interfaz

```js
predictor.predict(preopEye, iol?) -> { iol_position_mm, source, inputs_used }
```

Toda salida documenta su procedencia (`source`) y qué variables usó (`inputs_used`).

## Implementaciones disponibles

| Clase | Modelo | Estado |
|---|---|---|
| `ConstantOffsetPredictor(offset)` | ACD + offset declarado | SIMULACIÓN (para sensibilidad; no calibrado) |
| `FractionOfALPredictor(f)` | f·AL declarada | SIMULACIÓN (ídem) |
| `LinearRegressionPredictor({...,provenance})` | lineal sobre anatomía | Esqueleto: **inconstruible sin procedencia documentada** |
| Modelos de literatura | — | **BLOCKED**: exigen fuente con coeficientes delante (OPEN_QUESTIONS #2) |
| Predictor ML | — | **BLOCKED**: exige datos postoperatorios reales |

## Programa experimental (con la plataforma actual, sin datos clínicos)

1. **Sensibilidad** (exp001): cuantificar Δrefracción por Δposición en ojos cortos /
   normales / largos y potencias altas/bajas → fija qué precisión de predicción hace
   falta para ser clínicamente irrelevante (<0.25 D).
2. **Capacidad informativa** (Sprint 8 — ejecutado en `experiments/exp006_capacidad_eq`):
   bajo la hipótesis declarada H_EQ (LIO en el ecuador capsular; ecuador = ACD+LT/2 +
   desvío biológico σ_bio), medir EQ con σ_m solo aporta si σ_m < σ_bio, y el valor
   refractivo del beneficio escala con la potencia del ojo: con σ_bio=0.3 mm y
   σ_m=0.1 mm evita ~0.36 D de error medio en ojos cortos frente a ~0.10 D en largos.
   Es un análisis condicional: la validez de H_EQ la decidirán datos reales
   (PROTOCOL_FIRST_CLINICAL_BATCH.md, objetivo primario).
3. **Con datos reales** (futuro): regresiones base `f(AL, ACD, LT, K)` vs ampliadas
   `f(+EQ...)` contra posición medida; el criterio de comparación queda definido en
   `VALIDATION_STRATEGY.md` antes de ver dato alguno.
