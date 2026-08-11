# exp009 — Asfericidad de LIO: cuánta potencia mueve la Q y si separa a los criterios A y C

**SIMULACIÓN / NO GROUND TRUTH CLÍNICO** · commit `972878cdd9` · 2026-08-11T08:31:41.904Z

La lente es el **sustituto de simulación** con Q declarada como parámetro (ningún valor
procede de una lente comercial, OPEN_QUESTIONS #4). Córnea medida esférica; el efecto
aislado es el de la Q de la LIO.

## Resumen

| Magnitud | Valor |
|---|---|
| Casos (Q × pupila) | 21 |
| Máximo desplazamiento de potencia por Q declarada (vs Q=0, criterio C) | **0.15109 D** |
| Máxima separación A–C con asfericidad (|Q|≤1) | **0.01527 D** |
| Separación A–C del MISMO ojo con Q=0, misma pupila máxima | 0.00808 D |

## Detalle

| Q | Pupila (mm) | P óptima A (D) | P óptima C (D) | ΔP vs Q=0 (C) | Rango A–C (D) |
|---|---|---|---|---|---|
| -1 | 3 | 20.23357 | 20.23363 | 0.04939 | 0.00006 |
| -1 | 4.5 | 19.48884 | 19.48919 | 0.09988 | 0.00035 |
| -1 | 6 | 18.40625 | 18.4075 | 0.15109 | 0.00125 |
| -0.5 | 3 | 20.20859 | 20.20889 | 0.02465 | 0.0003 |
| -0.5 | 4.5 | 19.43757 | 19.43909 | 0.04978 | 0.00151 |
| -0.5 | 6 | 18.32693 | 18.33155 | 0.07514 | 0.00462 |
| -0.25 | 3 | 20.19612 | 20.19655 | 0.01231 | 0.00043 |
| -0.25 | 4.5 | 19.41204 | 19.41416 | 0.02485 | 0.00212 |
| -0.25 | 6 | 18.28754 | 18.29388 | 0.03747 | 0.00634 |
| 0 | 3 | 20.18367 | 20.18424 | 0 | 0.00057 |
| 0 | 4.5 | 19.38657 | 19.38931 | 0 | 0.00274 |
| 0 | 6 | 18.24833 | 18.25641 | 0 | 0.00808 |
| 0.25 | 3 | 20.17123 | 20.17193 | -0.01231 | 0.0007 |
| 0.25 | 4.5 | 19.36117 | 19.36455 | -0.02476 | 0.00338 |
| 0.25 | 6 | 18.20928 | 18.21913 | -0.03728 | 0.00985 |
| 0.5 | 3 | 20.15881 | 20.15965 | -0.02459 | 0.00085 |
| 0.5 | 4.5 | 19.33584 | 19.33987 | -0.04944 | 0.00403 |
| 0.5 | 6 | 18.17042 | 18.18205 | -0.07436 | 0.01164 |
| 1 | 3 | 20.13401 | 20.13515 | -0.04909 | 0.00114 |
| 1 | 4.5 | 19.28537 | 19.29074 | -0.09857 | 0.00537 |
| 1 | 6 | 18.0932 | 18.10847 | -0.14794 | 0.01527 |

## Lectura

1. La Q de la LIO mueve la potencia óptima trazada hasta 0.151 D (|Q|=1, pupila 6 mm;
   con |Q|≤0.5 el máximo es 0.075 D) — por debajo del paso refractivo de 0.25 D y a un
   tercio del escalón de 0.5 D. Es la magnitud del dato que el trazador, hasta V1.2,
   se negaba a usar (y que sin fichas de fabricante sigue sin existir para lentes
   reales — OPEN_QUESTIONS #4). Si es relevante para una decisión no lo dice esta
   simulación: lo dirán datos clínicos.
2. Reevaluación exigida por OPEN_QUESTIONS #8 tras V1.2: en ESTE ojo, la asfericidad
   (|Q|≤1) sube la separación A–C de 0.00808 a 0.01527 D a pupila 6 mm —
   la duplica aproximadamente (×1.9), pero sigue ~33 veces por debajo del escalón de 0.5 D.
   La conclusión de exp008 (el criterio apenas importa) SOBREVIVE a la asfericidad de
   LIO en este rango; el siguiente candidato a romper la simetría es el tilt (V1.3).
   Nota de alcance: exp008 midió hasta 0.0397 D en un ojo corto de ~34 D — comparar
   ese máximo de rejilla con este ojo normal sería mezclar efectos.

## Lo que este experimento NO demuestra

Qué Q tienen las lentes reales (no hay fichas de fabricante), ni qué criterio óptico
predice mejor un resultado clínico (exige cohorte postoperatoria, OPEN_QUESTIONS #8).
