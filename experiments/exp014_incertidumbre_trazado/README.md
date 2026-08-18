# exp014 — Incertidumbre sobre trazado (V1.12): validación por refutación

**SIMULACION / NO GROUND TRUTH CLINICO** · commit `7fca60a4b5`

Sigmas de **escenario declarado** (valores de exp004; OQ #6): nada es repetibilidad real.
El experimento intenta ROMPER el sistema nuevo; cada bloque es una vía de refutación.

## 1 · Anclas

- extracción de perturbación cero ≡ nominal: **EXACTA**
- sd Monte Carlo 0.6887 D vs lineal gᵀΣg 0.6732 D → ratio **1.0229**
- nominal: -1.4280 D de desenfoque residual (LIO fija 21 D)

## 2 · Convergencia (misma semilla, n crecientes)

| n intentados | n válidos | media (D) | sd (D) | SE media (D) |
|---|---|---|---|---|
| 250 | 250 | -1.4560 | 0.6881 | 0.0435 |
| 500 | 500 | -1.4192 | 0.6876 | 0.0307 |
| 1000 | 1000 | -1.4054 | 0.6857 | 0.0217 |
| 2000 | 2000 | -1.3847 | 0.6828 | 0.0153 |

## 3 · Aditividad (¿cuadratura o interacción?)

| Sigma sola | sd (D) | derivada (D/unidad) |
|---|---|---|
| al_mm | 0.1266 | -4.0333 |
| acd_mm | 0.3014 | 1.9219 |
| k_d | 0.1582 | -1.5125 |
| position_prediction_mm | 0.6032 | 1.9225 |

- suma en cuadratura: 0.7041 D · conjunta: 0.6887 D · ratio **0.9781**
- ratio ≈ 1 ⇒ las contribuciones se combinan en cuadratura (interacciones despreciables en este escenario); un ratio ≠ 1 documentaría interacción, no un error

## 4 · Causalidad medida→predictor→posición

| Escenario | sd (D) | dR/dAL (D/mm) |
|---|---|---|
| σ_AL, predictor por ACD (AL solo afecta óptica) | 0.1266 | -4.0333 |
| σ_AL, predictor por AL (dos caminos causales) | 0.1140 | -3.6325 |

la MISMA sigma de AL produce dispersión distinta según el predictor: con FractionOfAL la AL mueve TAMBIÉN la posición predicha (dos caminos causales). La diferencia es la causalidad medida→predictor→posición funcionando, no un artefacto.

## 5 · Inercia publicada (no silenciada)

σ_ACD con FractionOfAL fue **RECHAZADA por inercia** (correcto): `sigma acd_mm: VARIABLE INERTE en esta configuración — perturbarla ±0.15 no cambia el resultado en absoluto (p. ej. K con radios medidos, CCT con córnea de lectura, ACD con un predictor que no la consume). Su dispersión d`

## 6 · Elección vs resultado (mismo escenario, preguntas distintas)

- elección nominal: 19.5 D · fracción que conserva la elección: **0.3067**
- distribución: 19.5 D → 30.7 % · 20 D → 27.7 % · 19 D → 16.5 % · 20.5 D → 12.3 % · 18.5 D → 6.0 % · 21 D → 4.7 % · 18 D → 1.0 % · 21.5 D → 0.5 % · 17.5 D → 0.2 % · fuera de ventana: 0.5 % (censura VISIBLE)
- denominadores: 600 decididas + 0 rechazadas = 600 intentadas

la elección es DISCRETA: su inestabilidad (con qué frecuencia cambia el escalón elegido) es una pregunta distinta de la incertidumbre del resultado con una lente fija — no se resumen una en la otra

## 7 · Correlación declarada (escenario, no dato)

- independencia: sd 0.3259 D · con ρ(AL, ACD) = 0.5: sd 0.2637 D
- con derivadas del mismo signo, rho > 0 amplifica la dispersión; el efecto observado debe seguir ese signo — y la correlación es un ESCENARIO DECLARADO, no un dato

## Lo que este experimento NO demuestra

- **Nada clínico**: las sigmas son escenario declarado (OQ #6), la lente un sustituto (OQ #4)
  y el ojo sintético. Ningún intervalo de aquí es un intervalo real de paciente.
- La dimensión tórica no está calculada (caso esférico a propósito); un caso astigmático
  llevaría `unsupported_dimensions: [toric]`, jamás un cero físico.
- La correlación del bloque 7 es un escenario para VERIFICAR la maquinaria, no una
  afirmación sobre biometría real.
