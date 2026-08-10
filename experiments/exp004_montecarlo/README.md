# exp004 — Intervalos de refracción bajo incertidumbre declarada

**SIMULACIÓN / NO GROUND TRUTH CLÍNICO** · commit `d13b279809` · 2026-08-10T09:03:20.307Z

σ(AL)=0.03 mm, σ(K)=0.1 D fijas; n=4000, semilla 20260810.

| Ojo | P (D) | σ posición (mm) | p5 (D) | p50 (D) | p95 (D) | Ancho 90% (D) | P(alternativa mejor) |
|---|---|---|---|---|---|---|---|
| corto | 30.5 | 0.2 | -0.747 | 0.014 | 0.782 | 1.529 | 35.9% (31 D) |
| corto | 30.5 | 0.4 | -1.481 | 0.031 | 1.469 | 2.949 | 43.1% (31 D) |
| normal | 20 | 0.2 | -0.438 | 0.055 | 0.538 | 0.976 | 33.2% (20.5 D) |
| normal | 20 | 0.4 | -0.848 | 0.058 | 0.937 | 1.784 | 41.1% (20.5 D) |
| largo | 10 | 0.2 | -0.198 | 0.074 | 0.346 | 0.543 | 26.1% (10.5 D) |
| largo | 10 | 0.4 | -0.366 | 0.081 | 0.509 | 0.875 | 34.5% (10.5 D) |

Lectura: el ancho del intervalo escala con la sensibilidad de exp001 (corto ≫ largo).
Una P(alternativa) próxima al 50% señala empate real entre escalones: la elección de
potencia está dominada por la incertidumbre de posición, no por la óptica.
