# exp001 — Sensibilidad a la posición de la LIO

**SIMULACIÓN / NO GROUND TRUTH CLÍNICO** · commit `972878cdd9` · 2026-08-11T08:31:40.781Z

Δ refracción prevista (D) al desplazar SOLO la posición de la LIO, manteniendo la potencia óptima del ojo base:

| Ojo | AL (mm) | K (D) | P óptima (D) | −0.50 mm | −0.25 mm | +0.25 mm | +0.50 mm | Sensibilidad (D/mm) |
|---|---|---|---|---|---|---|---|---|
| corto_K_plana | 21 | 41 | 34.5 | -1.2413 | -0.615 | 0.6038 | 1.1963 | 2.4376 |
| corto_K_curva | 21 | 46 | 27.5 | -0.9995 | -0.4952 | 0.4863 | 0.9636 | 1.963 |
| normal | 23.5 | 43.5 | 20 | -0.6622 | -0.3287 | 0.324 | 0.6433 | 1.3054 |
| largo_K_plana | 27 | 41 | 12 | -0.3554 | -0.1767 | 0.1747 | 0.3474 | 0.7029 |
| largo_K_curva | 27 | 46 | 5 | -0.1512 | -0.0752 | 0.0743 | 0.1478 | 0.299 |
| muy_largo | 30 | 43.5 | 1.5 | -0.0421 | -0.0209 | 0.0207 | 0.0412 | 0.0833 |

Lectura: la sensibilidad crece con la potencia de LIO (ojos cortos). El umbral clínico de referencia es 0.25 D:
la precisión de posición requerida para no superarlo es ≈ 0.25/|sensibilidad| mm por tipo de ojo.
