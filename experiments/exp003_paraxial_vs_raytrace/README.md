# exp003 — Paraxial vs ray tracing (ojo completo, LIO genérica)

**SIMULACIÓN / NO GROUND TRUTH CLÍNICO** · commit `972878cdd9` · 2026-08-11T08:31:40.979Z

| Ojo | AL | P (D) | Validación h→0: Δfoco (mm) / ΔD | Pupila 3 mm: Δfoco (mm) / ΔD | Spot RMS (mm) |
|---|---|---|---|---|---|
| corto | 21 | 30.5 | -0.0005 / -0.0029 | -0.174 / -0.949 | 0.0039 |
| normal | 23.5 | 20 | -0.0005 / -0.0021 | -0.166 / -0.67 | 0.0032 |
| largo | 27 | 10 | -0.0006 / -0.0016 | -0.178 / -0.505 | 0.0029 |
| muy_largo | 30 | 3.5 | -0.0006 / -0.0014 | -0.203 / -0.445 | 0.0029 |

Lectura: con haz bajo ambos motores coinciden (validación cruzada); con pupila clínica la aberración
esférica de la GENÉRICA adelanta el mejor foco — el efecto crece con la potencia (ojos cortos).
Estos ΔD caracterizan la lente genérica declarada, no una LIO comercial (asfericidad real UNKNOWN).
