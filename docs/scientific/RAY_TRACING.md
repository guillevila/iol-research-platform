# RAY_TRACING — Trazador de rayos propio

**Versión:** 1.1 · **Fecha:** 11/08/2026 · RESEARCH USE ONLY

## Alcance actual

Trazado exacto (no paraxial) de rayos meridionales y oblicuos en 3D a través de
superficies **esféricas, cónicas (Q) y planas** con apertura — centradas, o con pose
rígida (tilt/descentración/rotación) en la LIO desde V1.3 —, refracción por ley de
Snell vectorial con detección de reflexión total interna, y localización del **mejor
foco** como el plano que minimiza el radio RMS del spot respecto del CENTROIDE.
Unidades internas: milímetros.

## Componentes

| Módulo | Contenido |
|---|---|
| `vec3.mjs` | álgebra 3D mínima (dot, cross, normalize con guarda de vector nulo) |
| `surfaces.mjs` | superficie esférica (vértice + radio firmado + apertura + índices a ambos lados), plana, CÓNICA (V1.2: raíces Citardauq estables, dominio de apertura validado) y envoltorio de transformación RÍGIDA global↔local (V1.3: pose sin duplicar la matemática); intersección con selección de casquete útil y normal orientada contra el rayo; Snell vectorial: t = η·d + (η·cosθᵢ − cosθₜ)·n̂ |
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

- La asfericidad NO está pendiente: las cónicas (Q) existen desde V1.2 — una córnea
  con Q medida en ambas caras se traza y pasa STRICT — y la LIO tiene pose rígida
  (tilt/descentración/rotación) desde V1.3. Quedan pendientes tilt y descentración
  de la CÓRNEA y las superficies TÓRICAS (V1.6); la arquitectura de `surfaces.mjs`
  (`transformedSurface`, tipos nuevos sin tocar `trace.mjs`) los admite.
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
