# RAY_TRACING — Trazador de rayos propio

**Versión:** 1.2 · **Fecha:** 11/08/2026 · RESEARCH USE ONLY

## Alcance actual

Trazado exacto (no paraxial) de rayos meridionales y oblicuos en 3D a través de
superficies **esféricas, cónicas (Q), BICÓNICAS (tóricas: curvaturas y Q por
meridiano, V1.6) y planas** con apertura — centradas, o con pose rígida
(tilt/descentración/rotación) en la LIO desde V1.3 —, refracción por ley de Snell
vectorial con detección de reflexión total interna, y localización del **mejor foco**
como el plano que minimiza el radio RMS del spot respecto del CENTROIDE. Para sistemas
TÓRICOS el foco escalar no existe: la descripción es la **métrica 2D** de
`astigmatism.mjs` (abajo). Unidades internas: milímetros.

## Componentes

| Módulo | Contenido |
|---|---|
| `vec3.mjs` | álgebra 3D mínima (dot, cross, normalize con guarda de vector nulo) |
| `surfaces.mjs` | superficie esférica (vértice + radio firmado + apertura + índices a ambos lados), plana, CÓNICA (V1.2: raíces Citardauq estables, dominio de apertura validado), BICÓNICA (V1.6: sagita con curvatura y Q por meridiano; intersección por Newton SALVAGUARDADO con horquilla — no es cuádrica, no hay forma cerrada; recuperación de la cónica a 1e-12 verificada contra el algoritmo cerrado) y envoltorio de transformación RÍGIDA global↔local (V1.3: pose sin duplicar la matemática; orienta también el eje tórico vía Rz); intersección con selección de casquete útil y normal orientada contra el rayo; Snell vectorial: t = η·d + (η·cosθᵢ − cosθₜ)·n̂ |
| `astigmatism.mjs` | métrica 2D del spot (V1.6): matriz de segundo momento M(z) = M0 + M1·z + M2·z² EXACTA tras la última superficie; focos principales y meridianos por autoproblema GENERALIZADO det(M1/2 + z·M2) = 0 — el eje se extrae de la estructura global del haz, nunca de un plano donde el spot sea casi circular; reducción clínica (esfera/cilindro negativo/eje = meridiano plano) con la misma conversión de desenfoque que el objetivo C |
| `trace.mjs` | `traceRay` (con causas de pérdida: apertura, TIR, NaN), haz paralelo, RMS de spot, `bestFocus` por sección áurea (RMS(z) unimodal), `focusOfSystem` con estimador paraxial numérico de contraste |

## Convenciones

Las de `units.mjs`/`ARCHITECTURE.md`: +z hacia retina; radio firmado (R>0 = centro a
la derecha del vértice); `n_before/n_after` según el sentido de la luz. Un rayo
perdido **nunca** desaparece en silencio: se reporta con su causa (`raysLost`).

## Validación (tests, formas cerradas en el propio test)

- Incidencia normal invariante; n₁=n₂ no refracta (barrido de ángulos).
- Snell cuantitativo: n₁·sinθᵢ = n₂·sinθₜ (< 1e−12) y dirección de salida unitaria.
- TIR exactamente en el ángulo crítico asin(n₂/n₁) (±0.01 rad).
- Dioptrio esférico: el foco trazado converge a la forma cerrada f′ = n₂R/(n₂−n₁)
  cuando h→0, y el error crece monótonamente con la altura (aberración esférica
  cualitativamente correcta).
- `focusOfSystem` ≈ paraxial con haz bajo (|Δ| < 0.01 mm; spot RMS < 1e−4 mm).
- Numérico: sin NaN en barridos de curvatura±/altura; pérdidas contabilizadas.

## Límites actuales y siguientes pasos

- Ni la asfericidad ni el tórico están pendientes: cónicas (Q) desde V1.2, pose
  rígida de LIO desde V1.3, BICÓNICAS (tóricas) y métrica 2D desde V1.6. Quedan
  pendientes tilt y descentración de la CÓRNEA; la arquitectura de `surfaces.mjs`
  (`transformedSurface`, tipos nuevos sin tocar `trace.mjs`) los admite. La córnea
  tórica trazada existe SOLO como política explícita (derivada de K o declarada) —
  nunca "medida" hasta que el modelo de datos tenga radios per-meridiano (OQ #10).
- Incidencias RASANTES sobre la bicónica: el barrido de horquilla (25 muestras) puede
  perder dobles cruces tangenciales — documentado; en el ojo los haces llegan lejos de
  la tangencia y el test de pérdidas exige igualdad exacta con la cónica vecina.
- El "mejor foco" por RMS es una métrica geométrica; métricas de calidad de imagen
  (MTF, Strehl) quedan fuera del alcance V0.
- La comparación sistemática paraxial↔trazado sobre el ojo completo pertenece al
  Sprint 4 (builder de superficies del ojo) y al benchmark del Sprint 11.

## Métrica de foco (corrección V1.3)

El tamaño de mancha es el RMS alrededor del CENTROIDE del haz (definición estándar):
el desplazamiento del centroide es apuntamiento, no borrosidad. Los haces meridionales
son pares ±h (180°-simétricos), de modo que en sistemas coaxiales el centroide cae en
el eje y la métrica coincide con la histórica — los resultados publicados anteriores a
la corrección se conservan sin cambio (verificado por scripts/check_experiments.mjs).
