# ARCHITECTURE — Plataforma de investigación en cálculo de LIO

**Versión:** 1.1 · **Fecha:** 19/08/2026 · RESEARCH USE ONLY
*(v1.1: tabla de capas sincronizada con el `src/` real al cerrar V1 y desambiguación de «CAPA B».)*

## Principio rector

Separar lo que se **mide** (anatomía preoperatoria), lo que se **predice biológicamente**
(estado postoperatorio, sobre todo la posición de la LIO) y lo que se **calcula
físicamente** (óptica). La hipótesis del proyecto es que gran parte del error de las
fórmulas modernas vive en la segunda pieza, no en la tercera.

## Capas y módulos

```
CAPA A  Datos anatómicos          src/core/eye.mjs        preoperative_eye (ausencias permitidas)
CAPA B  Predicción BIOLÓGICA      src/predictors/         predict(preop) → posición + procedencia
        de la posición de LIO                             (ConstantOffset, FractionOfAL,
                                                           EquatorialPlane/H_EQ, LinearRegression)
        su salida                 src/core/eye.mjs        predicted_postoperative_eye
CAPA C  Óptica física             src/optics/paraxial.mjs vergencias reducidas (gaussiano)
                                  src/optics/raytrace/    Snell 3D, superficies, foco, astigmatismo 2D
                                  src/optics/cornea.mjs   políticas corneales declaradas
                                  src/optics/eyebuilder.mjs  EyeModel+IOL → sistema óptico
CAPA D  Modelo de LIO             src/core/iol.mjs        UNKNOWN explícito; genéricas etiquetadas
                                  src/core/iol_factory.mjs geometría POR potencia (nunca reutilizada)
                                  src/toric/              rotación tórica por física
CAPA E  Optimizador               src/optimize/           potencia continua y de catálogo
CAPA F  Incertidumbre             src/uncertainty/        sigmas con procedencia, causalidad
                                                           medidas→predictor→posición (V1.12)
BENCH   Comparación de motores    src/bench/              predict(case, iol) homogéneo
LEGACY  Benchmark congelado       legacy/evo_replica/     run_evo_replica(case)
SINTÉT. Ojos sintéticos           src/synth/              source=synthetic, semillas fijas
CLÍNICO Esquemas de datos reales  src/clinical/           (sin datos: solo el contrato)
PERF    Coste computacional       src/perf/               contadores deterministas (V1.14)
EXP     Experimentos              experiments/            config+semilla+commit+resultados
BANCO   Rendimiento               bench/                  workloads, equivalencia bitwise, timings
```

> **Desambiguación de «CAPA B»** (sincronización V1.15). En el resto del repositorio —y en
> particular en V1.11 y V1.12— «CAPA B» significa **el predictor de posición**, no el estado
> postoperatorio que produce. La distinción importa porque toda la disciplina de causalidad
> de V1.12 depende de ella: las medidas se perturban y fluyen **por** el predictor, y el
> residual propio del predictor viaja por un canal separado. El `predicted_postoperative_eye`
> es la **salida** de esa capa, no la capa.

## Reglas de dependencia

- La FÍSICA de `src/` no importa nada de `legacy/`. Un **único puente autorizado**,
  `src/bench/engines/evo_engine.mjs`, sí lo importa, y solo por su API pública
  (`run_evo_replica.mjs`). `tests/architecture.test.mjs` verifica ambas cosas: que sea ese
  módulo y ningún otro, y que no se entre por una puerta interna. *(Precisión V1.15: este
  punto decía «`src/` no importa nada de `legacy/`», que es literalmente falso y describía
  mal lo que el test demuestra.)*
- Los coeficientes del legacy son ajustes a EVO: prohibida su migración a `src/`.
- `optics` no depende de `predictors` (verificado: cero imports). Los experimentos dependen
  de todo (capa superior).
- **Excepción declarada** (auditoría V1.15): `core` **sí** depende de `optics` en un punto —
  `src/core/iol_factory.mjs` importa `N_AQUEOUS` de `optics/constants.mjs`, porque derivar
  la geometría de una lente a partir de su potencia exige el índice del medio que la rodea.
  Hasta V1.15 este documento afirmaba lo contrario como contrato duro, y era falso. Se
  declara la excepción en vez de fingir la regla: **una regla que el código incumple no es un
  contrato, es una aspiración**. No la vigila ningún test (a diferencia de la independencia
  `src/` ↛ `legacy/`, que sí tiene `tests/architecture.test.mjs`).

## Convenciones (contratos duros)

- **Datum**: ápex corneal anterior = z 0 mm; +z hacia retina; posiciones de LIO al
  plano principal/central de la lente. Definido en `src/core/units.mjs` y usado por
  todas las capas.
- **Unidades**: mm en dominio clínico, metros dentro de las fórmulas, D para potencias,
  grados (mod 180) en meridianos clínicos, radianes en geometría.
- **Ausencias**: `null` = no medido (permitido); `UNKNOWN` = parámetro de fabricante
  no documentado. Nunca se rellenan en silencio.
- **Etiquetado**: todo dato sintético lleva `source='synthetic'`; todo resultado lleva
  el aviso RESEARCH USE ONLY; toda simulación de estado postoperatorio lleva
  `SIMULACION / NO GROUND TRUTH CLINICO`.

## Flujo de una predicción física

El pipeline completo y vigente, con sus dos caminos (esférico y tórico), vive en
**[`RAY_TRACING.md` §1](RAY_TRACING.md)** y no se duplica aquí: mantener dos diagramas del
mismo pipeline garantiza que uno de los dos quede desincronizado — que es exactamente lo que
pasó hasta V1.15, cuando este esquema afirmaba un «optimizador (potencia/cilindro/eje)» que
**no existe**.

> **Precisión importante.** `optimizePowerByRaytrace` busca **solo POTENCIA**, con objetivos
> escalares. La dimensión tórica **no se optimiza por trazado**: el motor la *analiza* (métrica
> 2D de `astigmatism.mjs`) y los objetivos escalares se **rechazan** sobre sistemas tóricos,
> porque destruyen el astigmatismo y su eje. El motor tórico PARAXIAL de V0
> (`src/toric/toric_engine.mjs`, `recommendToric`) sí recomienda cilindro y eje, pero es otra
> vía y no usa trazado.

## Qué NO es esta plataforma (fase actual)

No es un producto clínico, no tiene interfaz final, no declara superioridad sobre
ninguna fórmula y no contiene ML entrenado (no existen datos postoperatorios reales).
