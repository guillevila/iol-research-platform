# exp010 — Pose de LIO: tilt, descentración e interacción sobre potencia y criterios

**SIMULACIÓN / NO GROUND TRUTH CLÍNICO** · commit `972878cdd9` · 2026-08-11T08:31:42.461Z

Lente: sustituto de simulación esférico. Poses = escenarios DECLARADOS (las
distribuciones reales de tilt/descentración exigen datos de imagen, OQ #6). Geometría
coplanaria (tilt sobre +x, descentración sobre +y) para maximizar la interacción.

## Resumen

| Magnitud | Valor |
|---|---|
| Casos (tilt × dec × pupila) | 32 |
| Máximo efecto del TILT solo (≤7.5°) | **0.32971 D** |
| Máximo efecto de la DESCENTRACIÓN sola (≤0.75 mm) | **0.05876 D** |
| Máxima INTERACCIÓN (lo no explicado por los efectos separados) | **0.20202 D** |
| Máxima separación A–C con pose | **0.01566 D** |
| Separación A–C sin pose (mismo ojo, pupila máxima) | 0.00252 D |

### La dirección importa (por qué la pose es un vector, no dos escalares)

| Pupila | tilt 5° + dec 0.5 mm COPLANARES | mismos módulos, ORTOGONALES | diferencia |
|---|---|---|---|
| 3 mm | 20.00047 D | 20.07181 D | -0.0713 D |
| 4.5 mm | 19.28039 D | 19.32943 D | -0.0490 D |

## Detalle (criterio C salvo indicado)

| Pupila | Tilt (°) | Dec (mm) | P óptima C (D) | P óptima A (D) | Efecto tilt | Efecto dec | Interacción | Rango A–C |
|---|---|---|---|---|---|---|---|---|
| 3 | 0 | 0 | 20.22165 | 20.22113 | +0.0000 | +0.0000 | +0.0000 | 0.00052 |
| 3 | 0 | 0.25 | 20.2102 | 20.20948 | +0.0000 | -0.0115 | +0.0000 | 0.00072 |
| 3 | 0 | 0.5 | 20.24301 | 20.24257 | +0.0000 | +0.0214 | +0.0000 | 0.00044 |
| 3 | 0 | 0.75 | 20.28041 | 20.28051 | +0.0000 | +0.0588 | +0.0000 | 0.0001 |
| 3 | 2.5 | 0 | 20.18205 | 20.18116 | -0.0396 | +0.0000 | +0.0000 | 0.00089 |
| 3 | 2.5 | 0.25 | 20.16054 | 20.15927 | -0.0396 | -0.0115 | -0.0101 | 0.00126 |
| 3 | 2.5 | 0.5 | 20.15352 | 20.15243 | -0.0396 | +0.0214 | -0.0499 | 0.0011 |
| 3 | 2.5 | 0.75 | 20.19061 | 20.19029 | -0.0396 | +0.0588 | -0.0502 | 0.00032 |
| 3 | 5 | 0 | 20.07307 | 20.07102 | -0.1486 | +0.0000 | +0.0000 | 0.00206 |
| 3 | 5 | 0.25 | 20.02043 | 20.0175 | -0.1486 | -0.0115 | -0.0412 | 0.00293 |
| 3 | 5 | 0.5 | 20.00047 | 19.99784 | -0.1486 | +0.0214 | -0.0940 | 0.00263 |
| 3 | 5 | 0.75 | 20.04036 | 20.03875 | -0.1486 | +0.0588 | -0.0915 | 0.00161 |
| 3 | 7.5 | 0 | 19.89485 | 19.89035 | -0.3268 | +0.0000 | +0.0000 | 0.00449 |
| 3 | 7.5 | 0.25 | 19.86859 | 19.86395 | -0.3268 | -0.0115 | -0.0148 | 0.00464 |
| 3 | 7.5 | 0.5 | 19.78401 | 19.77831 | -0.3268 | +0.0214 | -0.1322 | 0.0057 |
| 3 | 7.5 | 0.75 | 19.86597 | 19.86261 | -0.3268 | +0.0588 | -0.0876 | 0.00335 |
| 4.5 | 0 | 0 | 19.47438 | 19.47187 | +0.0000 | +0.0000 | +0.0000 | 0.00252 |
| 4.5 | 0 | 0.25 | 19.4626 | 19.45957 | +0.0000 | -0.0118 | +0.0000 | 0.00303 |
| 4.5 | 0 | 0.5 | 19.53089 | 19.52869 | +0.0000 | +0.0565 | +0.0000 | 0.0022 |
| 4.5 | 0 | 0.75 | 19.52694 | 19.52489 | +0.0000 | +0.0525 | +0.0000 | 0.00205 |
| 4.5 | 2.5 | 0 | 19.43283 | 19.42936 | -0.0416 | +0.0000 | +0.0000 | 0.00347 |
| 4.5 | 2.5 | 0.25 | 19.3808 | 19.37574 | -0.0416 | -0.0118 | -0.0402 | 0.00506 |
| 4.5 | 2.5 | 0.5 | 19.43808 | 19.43432 | -0.0416 | +0.0565 | -0.0512 | 0.00376 |
| 4.5 | 2.5 | 0.75 | 19.41171 | 19.40792 | -0.0416 | +0.0525 | -0.0737 | 0.00379 |
| 4.5 | 5 | 0 | 19.32289 | 19.31685 | -0.1515 | +0.0000 | +0.0000 | 0.00604 |
| 4.5 | 5 | 0.25 | 19.23079 | 19.22176 | -0.1515 | -0.0118 | -0.0803 | 0.00902 |
| 4.5 | 5 | 0.5 | 19.28039 | 19.2734 | -0.1515 | +0.0565 | -0.0990 | 0.00699 |
| 4.5 | 5 | 0.75 | 19.23439 | 19.22724 | -0.1515 | +0.0525 | -0.1411 | 0.00715 |
| 4.5 | 7.5 | 0 | 19.14467 | 19.1339 | -0.3297 | +0.0000 | +0.0000 | 0.01078 |
| 4.5 | 7.5 | 0.25 | 19.01277 | 18.9971 | -0.3297 | -0.0118 | -0.1201 | 0.01566 |
| 4.5 | 7.5 | 0.5 | 19.05801 | 19.04532 | -0.3297 | +0.0565 | -0.1432 | 0.01268 |
| 4.5 | 7.5 | 0.75 | 18.9952 | 18.98225 | -0.3297 | +0.0525 | -0.2020 | 0.01295 |

## Lectura

1. Tilt y descentración mueven la potencia óptima en direcciones y magnitudes que la
   tabla cuantifica; la INTERACCIÓN no es despreciable frente a los efectos puros en
   las combinaciones grandes — tratar los dos como aditivos sería un error de modelo.
2. La dependencia direccional (coplanar vs ortogonal con los mismos módulos) es la
   razón por la que la pose se modela como VECTOR: dos escalares no determinan el
   sistema. Será aún más relevante con el eje tórico (V1.7).
3. Sobre la pregunta heredada de exp009 (¿separa la pose a los criterios A y C?): el
   valor medido manda — véase la columna Rango A–C frente al caso sin pose.

## Lo que este experimento NO demuestra

Nada clínico: ni qué poses ocurren realmente tras cirugía (OQ #6), ni qué criterio
óptico predice mejor (OQ #8), ni la magnitud de estos efectos en lentes reales (la
lente es un sustituto declarado; OQ #4). Atribuir relevancia clínica a estas cifras
exigiría datos postoperatorios que este proyecto aún no tiene.
