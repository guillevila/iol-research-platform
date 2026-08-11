# exp007 — Política corneal: ¿depende la recomendación de la convención de índice queratométrico?

**SIMULACIÓN / NO GROUND TRUTH CLÍNICO** · commit `972878cdd9` · 2026-08-11T08:31:41.219Z

## Pregunta

La lectura K de un queratómetro no es una medida directa de dioptrías: es un radio
convertido con un índice ficticio declarado por convención (1.3375, 1.3315 y 1.332 son
convenciones en uso). Si el motor usa la lectura K **como** potencia corneal, hereda la
convención bajo la que se expresó el dato. Este experimento fija el radio corneal
**físico**, calcula la K que produciría cada convención, y mide cuánta potencia de LIO
se mueve por ese único motivo.

## Alcance — qué compara y qué NO

Esto es **sensibilidad sintética a la convención de conversión**, no una comparación de
biómetros reales: dos dispositivos que compartan convención coincidirían exactamente
aquí, y los dispositivos reales difieren además por factores no modelados (óptica de
medida, zona de anillos, algoritmo de promediado). Ninguna fila de este experimento
procede de un dispositivo físico.

## Resultado

| Magnitud | Valor |
|---|---|
| Casos simulados (radio × AL) | 30 |
| Dispersión máxima entre convenciones — política `KERATOMETRIC_READING` | **1.2602 D** |
| Dispersión máxima entre convenciones — política `SINGLE_SURFACE_FROM_RADIUS` | 0 D |
| Casos en los que la convención cambia el escalón recomendado (rejilla 0.5 D) | 27/30 (90.0%) |
| Separación entre políticas (n_k=1.3375) | 0.2454 … 0.3159 D (media 0.2785 D) |

La segunda fila es 0 **por construcción**: recuperar el radio deshace exactamente la
conversión declarada. No es un resultado empírico, es la comprobación de que la
implementación cumple la invariancia que promete (y el test `P0.1: tres convenciones...` lo fija).

## Detalle por caso

| r (mm) | AL (mm) | K bajo 1.3375 | K bajo 1.3315 | K bajo 1.332 | Rango entre convenciones (D) | ¿Cambia escalón? | Δ políticas (D) |
|---|---|---|---|---|---|---|---|
| 7.00 | 21 | 48.214 | 47.357 | 47.429 | 1.2602 | SÍ | 0.3159 |
| 7.00 | 22.5 | 48.214 | 47.357 | 47.429 | 1.2602 | SÍ | 0.3159 |
| 7.00 | 23.5 | 48.214 | 47.357 | 47.429 | 1.2602 | SÍ | 0.3159 |
| 7.00 | 25 | 48.214 | 47.357 | 47.429 | 1.2602 | SÍ | 0.3159 |
| 7.00 | 27 | 48.214 | 47.357 | 47.429 | 1.2602 | SÍ | 0.3159 |
| 7.00 | 30 | 48.214 | 47.357 | 47.429 | 1.2602 | no | 0.3159 |
| 7.35 | 21 | 45.918 | 45.102 | 45.17 | 1.1762 | SÍ | 0.2948 |
| 7.35 | 22.5 | 45.918 | 45.102 | 45.17 | 1.1762 | SÍ | 0.2948 |
| 7.35 | 23.5 | 45.918 | 45.102 | 45.17 | 1.1762 | SÍ | 0.2948 |
| 7.35 | 25 | 45.918 | 45.102 | 45.17 | 1.1762 | SÍ | 0.2948 |
| 7.35 | 27 | 45.918 | 45.102 | 45.17 | 1.1762 | SÍ | 0.2948 |
| 7.35 | 30 | 45.918 | 45.102 | 45.17 | 1.1762 | no | 0.2948 |
| 7.70 | 21 | 43.831 | 43.052 | 43.117 | 1.1026 | SÍ | 0.2763 |
| 7.70 | 22.5 | 43.831 | 43.052 | 43.117 | 1.1026 | SÍ | 0.2763 |
| 7.70 | 23.5 | 43.831 | 43.052 | 43.117 | 1.1026 | SÍ | 0.2763 |
| 7.70 | 25 | 43.831 | 43.052 | 43.117 | 1.1026 | SÍ | 0.2763 |
| 7.70 | 27 | 43.831 | 43.052 | 43.117 | 1.1026 | SÍ | 0.2763 |
| 7.70 | 30 | 43.831 | 43.052 | 43.117 | 1.1026 | SÍ | 0.2763 |
| 8.05 | 21 | 41.925 | 41.18 | 41.242 | 1.0375 | SÍ | 0.26 |
| 8.05 | 22.5 | 41.925 | 41.18 | 41.242 | 1.0375 | SÍ | 0.26 |
| 8.05 | 23.5 | 41.925 | 41.18 | 41.242 | 1.0375 | SÍ | 0.26 |
| 8.05 | 25 | 41.925 | 41.18 | 41.242 | 1.0375 | SÍ | 0.26 |
| 8.05 | 27 | 41.925 | 41.18 | 41.242 | 1.0375 | SÍ | 0.26 |
| 8.05 | 30 | 41.925 | 41.18 | 41.242 | 1.0375 | SÍ | 0.26 |
| 8.40 | 21 | 40.179 | 39.464 | 39.524 | 0.9795 | no | 0.2454 |
| 8.40 | 22.5 | 40.179 | 39.464 | 39.524 | 0.9795 | SÍ | 0.2454 |
| 8.40 | 23.5 | 40.179 | 39.464 | 39.524 | 0.9795 | SÍ | 0.2454 |
| 8.40 | 25 | 40.179 | 39.464 | 39.524 | 0.9795 | SÍ | 0.2454 |
| 8.40 | 27 | 40.179 | 39.464 | 39.524 | 0.9795 | SÍ | 0.2454 |
| 8.40 | 30 | 40.179 | 39.464 | 39.524 | 0.9795 | SÍ | 0.2454 |

## Lectura

1. Bajo la política de V0, la potencia recomendada depende de la convención bajo la que
   se expresó la medida, aunque la córnea física sea idéntica. El efecto es sistemático,
   no ruido.
2. La política de radio recuperado elimina esa dependencia por completo.
3. Las dos políticas no coinciden entre sí: la de lectura sobreestima la potencia corneal en
   el factor (n_ac−1)/(n_k−1) = 0.9956 para 1.3375, lo que empuja la LIO en sentido contrario.

## Lo que este experimento NO demuestra

- Diferencias entre **marcas o modelos reales de biómetro**: no se midió ningún dispositivo.
- Que la política de radio prediga mejor la refracción postoperatoria real. Las fórmulas
  clásicas están calibradas **sobre** la convención de lectura, de modo que cambiar la
  política sin recalibrar el predictor de posición desplaza la predicción en bloque.
  Decidir cuál es preferible exige datos postoperatorios reales: registrado en
  OPEN_QUESTIONS #7. Por eso la política por defecto sigue siendo `KERATOMETRIC_READING`
  — ahora declarada y registrada en cada salida, no heredada por accidente.
