# OPTICAL_MODEL — Motor paraxial propio

**Versión:** 1.0 · **Fecha:** 10/08/2026 · RESEARCH USE ONLY

## Naturaleza del modelo

`src/optics/paraxial.mjs` implementa óptica gaussiana de vergencias reducidas:
física de primer orden, sin ningún coeficiente ajustado a EVO ni a datos clínicos.
Sus dos operaciones primitivas, con test de forma cerrada cada una:

- **Refracción** en elemento de potencia P (D): `V' = V + P`
- **Propagación** una distancia d (m) en medio de índice n: `V' = V / (1 − (d/n)·V)`

Con ellas se compone cualquier sistema (`propagate`). El signo de las distancias es
+z hacia retina; una propagación negativa deshace exactamente la positiva (testado).

## Córnea

Dos representaciones, elegidas por la capa superior según los datos disponibles:

1. **Física (preferida cuando hay radios):** lente gruesa de dos superficies
   `P = P1 + P2 − (t/n_c)·P1·P2` con `P1=(n_c−1)/r_ant`, `P2=(n_aq−n_c)/r_post`,
   índices convencionales documentados en `constants.mjs` (OPEN_QUESTIONS #1).
2. **Equivalente de lectura:** cuando solo hay queratometría de biómetro, la potencia
   corneal usada queda documentada como convención del dispositivo
   (`corneaRadiusFromKeratometry` deshace la conversión radio↔K si se necesita el radio).
   La relación anterior/posterior cuando falta r_post es una incógnita registrada
   (no se rellena en silencio).

## Ojo pseudofáquico

- **LIO delgada** en su plano previsto: cerrado exacto en ambos sentidos
  (`iolPowerForTarget` ↔ `predictedRefraction`, round-trip < 1e−9 D en tests).
- **LIO gruesa**: `[P_ant, gap(t, n_iol), P_post]` con la genérica declarada de
  `createGenericThickIOL` (lensmaker; radios derivados de la potencia etiquetada,
  índice y espesor son parámetros de simulación declarados, no datos de fabricante).
  Test de consistencia: converge a la delgada cuando t→0; divergencia acotada y
  documentada con espesor clínico.

## Cadena de cálculo (objeto en infinito, diana de gafa)

```
V_gafa = target · (corrección de vértice v: V_córnea = target/(1−v·target))
V₁ = V_córnea + P_córnea
V₂ = V₁ propagada d_LIO en n_acuoso
P_LIO = n_vítreo/(AL − d_LIO) − V₂
```

Todas las distancias en metros dentro del motor; la conversión mm→m es siempre
explícita en la capa que llama (contrato de `units.mjs`).

## Validación del sprint

Tests algebraicos (nunca valores de memoria): foco de lente delgada en aire; forma
cerrada del transfer con n; composición de sistemas; lente gruesa corneal; round-trip
exacto; monotonías físicas (AL↑→P↓, K↑→P↓, LIO más posterior→P↑); singularidades
detectadas (foco en plano destino, LIO fuera del ojo).

## Límites conocidos del paraxial

Primer orden: sin aberración esférica ni asfericidades; los efectos de apertura se
estudian con el ray tracer (`RAY_TRACING.md`) y la comparación sistemática
paraxial↔trazado es objeto del Sprint 4/11.
