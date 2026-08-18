# exp006 — Valor refractivo de medir el plano ecuatorial (condicional a H_EQ)

**SIMULACIÓN / NO GROUND TRUTH CLÍNICO** · commit `a5cec6591b` · 2026-08-18T11:46:24.789Z

**Hipótesis declarada H_EQ:** H_EQ: posicion de LIO = ecuador capsular; ecuador = ACD + LT/2 + eps_bio. Nada de esto afirma que H_EQ sea
biológicamente cierta: eso lo decidirán datos postoperatorios (VALIDATION_STRATEGY nivel 3).

## Beneficio esperado de medir EQ (D de error refractivo evitado), σ_medida = 0.10 mm

| Ojo | Sensibilidad (D/mm) | σ_bio 0.20 | σ_bio 0.30 | σ_bio 0.40 |
|---|---|---|---|---|
| corto | 2.257 | 0.178 | 0.363 | 0.546 |
| normal | 1.347 | 0.106 | 0.217 | 0.326 |
| largo | 0.636 | 0.05 | 0.102 | 0.154 |

## Matriz completa (error refractivo medio, D): base vs EQ

| Ojo | σ_bio | σ_medida | Base (D) | Con EQ (D) | Beneficio (D) |
|---|---|---|---|---|---|
| corto | 0.2 | 0.05 | 0.363 | 0.092 | 0.271 |
| corto | 0.2 | 0.1 | 0.362 | 0.184 | 0.178 |
| corto | 0.2 | 0.2 | 0.363 | 0.363 | 0 |
| corto | 0.3 | 0.05 | 0.547 | 0.091 | 0.456 |
| corto | 0.3 | 0.1 | 0.545 | 0.182 | 0.363 |
| corto | 0.3 | 0.2 | 0.544 | 0.365 | 0.18 |
| corto | 0.4 | 0.05 | 0.733 | 0.089 | 0.644 |
| corto | 0.4 | 0.1 | 0.729 | 0.183 | 0.546 |
| corto | 0.4 | 0.2 | 0.73 | 0.364 | 0.366 |
| normal | 0.2 | 0.05 | 0.217 | 0.055 | 0.162 |
| normal | 0.2 | 0.1 | 0.216 | 0.11 | 0.106 |
| normal | 0.2 | 0.2 | 0.216 | 0.217 | 0 |
| normal | 0.3 | 0.05 | 0.326 | 0.054 | 0.272 |
| normal | 0.3 | 0.1 | 0.325 | 0.109 | 0.217 |
| normal | 0.3 | 0.2 | 0.325 | 0.218 | 0.107 |
| normal | 0.4 | 0.05 | 0.437 | 0.053 | 0.384 |
| normal | 0.4 | 0.1 | 0.435 | 0.109 | 0.326 |
| normal | 0.4 | 0.2 | 0.436 | 0.217 | 0.219 |
| largo | 0.2 | 0.05 | 0.102 | 0.026 | 0.076 |
| largo | 0.2 | 0.1 | 0.102 | 0.052 | 0.05 |
| largo | 0.2 | 0.2 | 0.102 | 0.102 | 0 |
| largo | 0.3 | 0.05 | 0.154 | 0.026 | 0.128 |
| largo | 0.3 | 0.1 | 0.154 | 0.051 | 0.102 |
| largo | 0.3 | 0.2 | 0.153 | 0.103 | 0.051 |
| largo | 0.4 | 0.05 | 0.206 | 0.025 | 0.181 |
| largo | 0.4 | 0.1 | 0.205 | 0.051 | 0.154 |
| largo | 0.4 | 0.2 | 0.206 | 0.102 | 0.103 |

Lecturas (condicionales a H_EQ):
1. Medir EQ solo aporta si σ_medida < σ_bio; el beneficio ≈ sensibilidad·(E|ε_bio|−E|ε_m|).
2. El beneficio se concentra en ojos cortos (sensibilidad alta): con σ_bio=0.3 y σ_medida=0.1,
   evita ~0.39 D en el corto frente a ~0.11 D en el largo.
3. Dato mínimo para validar H_EQ: cohorte con EQ preoperatorio (OCT) y posición de LIO medida
   postoperatoria (postop.schema.json) — registrado en CLINICAL_DATA_REQUIREMENTS.
