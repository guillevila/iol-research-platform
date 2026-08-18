# exp014 — Incertidumbre sobre trazado (V1.12): validación por refutación

**SIMULACION / NO GROUND TRUTH CLINICO** · commit `f884ef28d1`

Sigmas de **escenario declarado** (OQ #6): σ_AL y σ_K reutilizan los valores de exp004;
σ_ACD y σ_posición son **nuevos de este escenario V1.12** (exp004 no los declaraba).
Nada es repetibilidad real. Muestreo MERIDIONAL con **n_anillos = 40** (el sesgo de
localización ~O(1/n_anillos) de V1.9 contamina nominal/media a n bajo; la sd es robusta).
El experimento intenta ROMPER el sistema nuevo; cada bloque es una vía de refutación.

## 1 · Anclas

- extracción de perturbación cero ≡ nominal: **EXACTA**
- sd Monte Carlo 0.6648 D vs lineal gᵀΣg 0.6740 D → ratio **0.9864**
- nominal: -1.3707 D de desenfoque residual (LIO fija 21 D)

## 2 · Convergencia (prefijos anidados) y réplicas (semillas independientes)

| n intentados | n válidos | media (D) | sd (D) | SE media (D) |
|---|---|---|---|---|
| 250 | 250 | -1.3188 | 0.6794 | 0.0430 |
| 500 | 500 | -1.3327 | 0.6753 | 0.0302 |
| 1000 | 1000 | -1.3328 | 0.6796 | 0.0215 |
| 2000 | 2000 | -1.3394 | 0.6764 | 0.0151 |

- n crecientes con la MISMA semilla son prefijos anidados: miden la estabilidad del estimador acumulado, no la varianza entre corridas
- réplicas independientes (n = 1000): seed 101 → sd 0.6563 D · seed 202 → sd 0.6762 D · seed 303 → sd 0.6816 D · rango entre réplicas **0.0253 D**

## 3 · Aditividad (¿cuadratura o interacción?)

n = 1000 por sigma sola; conjunta: 2000/2000 válidas.

| Sigma sola | sd (D) | derivada (D/unidad) |
|---|---|---|
| al_mm | 0.1196 | -4.0333 |
| acd_mm | 0.2853 | 1.9245 |
| k_d | 0.1491 | -1.5089 |
| position_prediction_mm | 0.5711 | 1.9251 |

- suma en cuadratura: 0.6664 D · conjunta: 0.6648 D · ratio **0.9976**
- ratio ≈ 1 ⇒ las contribuciones se combinan en cuadratura (interacciones despreciables en este escenario); un ratio ≠ 1 documentaría interacción, no un error

## 4 · Causalidad medida→predictor→posición

n = 1000 por escenario.

| Escenario | sd (D) | dR/dAL (D/mm) |
|---|---|---|
| σ_AL, predictor por ACD (AL solo afecta óptica) | 0.1196 | -4.0333 |
| σ_AL, predictor por AL (dos caminos causales) | 0.1077 | -3.6320 |

la MISMA sigma de AL produce dispersión distinta según el predictor: con FractionOfAL la AL mueve TAMBIÉN la posición predicha (dos caminos causales). La diferencia es la causalidad medida→predictor→posición funcionando, no un artefacto.

## 5 · Inercia publicada (no silenciada)

σ_ACD con FractionOfAL fue **RECHAZADA por inercia** (correcto): `sigma acd_mm: VARIABLE INERTE en esta configuración — ni ±0.15 ni un paso de contraste (1.5) la mueven (p. ej. K con radios medidos, CCT con córnea de lectura, ACD con un predictor que no la consume). Su dispersión desaparecería en silencio: se rechaza en lugar de fingirse propagada.`

## 6 · Elección vs resultado (mismo escenario, preguntas distintas)

- elección nominal: 19.5 D · fracción que conserva la elección: **0.3017**
- distribución: 19.5 D → 30.2 % · 20 D → 26.0 % · 19 D → 17.7 % · 20.5 D → 13.3 % · 21 D → 6.3 % · 18.5 D → 4.8 % · 21.5 D → 0.7 % · 18 D → 0.5 % · fuera de ventana: 0.5 % (censura VISIBLE)
- denominadores: 600 decididas + 0 rechazadas = 600 intentadas

la elección es DISCRETA: su inestabilidad (con qué frecuencia cambia el escalón elegido) es una pregunta distinta de la incertidumbre del resultado con una lente fija — no se resumen una en la otra

## 7 · Correlación declarada (escenario, no dato)

n = 1000 por escenario (misma semilla: comparación pareada).

- independencia: sd 0.3104 D · con ρ(AL, ACD) = 0.5: sd 0.2490 D → la correlación **REDUCE** la dispersión (previsto por las derivadas: REDUCE, signos OPUESTOS)
- en ESTE escenario dR/dAL y dR/dACD tienen signos opuestos, así que rho > 0 debe reducir la dispersión (2·rho·g_i·g_j·sigma_i·sigma_j < 0); el efecto observado la reduce, coherente con las derivadas — y la correlación es un ESCENARIO DECLARADO, no un dato

## Lo que este experimento NO demuestra

- **Nada clínico**: las sigmas son escenario declarado (OQ #6), la lente un sustituto (OQ #4)
  y el ojo sintético. Ningún intervalo de aquí es un intervalo real de paciente.
- La dimensión tórica no está calculada (caso esférico a propósito); un caso astigmático
  llevaría `unsupported_dimensions: [toric]`, jamás un cero físico.
- La correlación del bloque 7 es un escenario para VERIFICAR la maquinaria, no una
  afirmación sobre biometría real.
