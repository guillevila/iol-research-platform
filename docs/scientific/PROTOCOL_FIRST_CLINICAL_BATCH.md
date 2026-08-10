# PROTOCOL_FIRST_CLINICAL_BATCH — Protocolo preregistrado del primer lote de datos reales

**Versión:** 1.0 · **Fecha:** 10/08/2026 · **Estado:** PREREGISTRADO (sin haber visto ningún dato)
RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING

Este protocolo se fija ANTES de recibir dato alguno; cualquier desviación futura se
documentará como enmienda fechada. Operacionaliza el nivel 3 de `VALIDATION_STRATEGY.md`.

## 1. Objetivos, por orden

1. **Primario:** error del predictor de posición — |posición prevista − posición medida|
   (mm), para el modelo base f(AL, ACD, LT, K) frente al ampliado f(+EQ/OCT) (H_EQ,
   exp006).
2. **Secundario:** error refractivo de los motores (EVO réplica; físico paraxial con
   cada predictor): error absoluto medio/mediano del EE y % dentro de ±0.25/±0.50/±1.00 D.
3. **Terciario:** subgrupo preespecificado = regiones de divergencia de exp002/exp005
   (ojos cortos con K curva; astigmatismos WTR ≥ 2 D).

## 2. Criterios de inclusión del caso

- Preop conforme a `preop.schema.json` (importador sin errores; PII limpia).
- Cirugía conforme a `surgery.schema.json` con LIO identificada y potencia implantada.
- Postop conforme a `postop.schema.json` con refracción manifiesta a **≥ 30 días**
  (`followup_days ≥ 30`) y, para el objetivo primario, `iol_axial_position_mm` medida.
- Exclusiones: cirugía combinada, complicaciones registradas, post-refractiva previa
  (fuera del dominio del benchmark y del físico actual).

## 3. Regla de partición

Partición **temporal** (los últimos ~30 % de casos por `surgery_period` quedan como
holdout) y nunca aleatoria simple; si hay varios cirujanos, se reporta además por
`surgeon_id`. Ninguna calibración toca el holdout.

## 4. Umbral para calibrar (no solo reportar)

Solo se ajustará un predictor (`LinearRegressionPredictor` con `provenance` del lote)
si el conjunto de ajuste tiene n suficiente para que el intervalo del coeficiente
principal no incluya el cero con holgura (se calculará con los datos; sin n
suficiente, el lote se usa únicamente para REPORTAR errores de los modelos
existentes). El requisito de precisión objetivo viene de exp001: σ_pos que deja el
error refractivo < 0.25 D por tipo de ojo (0.10 mm en cortos, 0.35 mm en largos).

## 5. Flujo operativo

```
export del centro → importBatch(kind) por nivel → linkCases →
   informe de rechazos/huérfanos al centro (sin corregir en silencio) →
   casos completos → motores (run_evo_replica · ParaxialEngine+predictores) →
   métricas preespecificadas + subgrupos → experiments/expNNN con semilla/commit
```

## 6. Qué NO se hará con este lote

- Entrenar ML end-to-end.
- Declarar superioridad clínica de ningún motor.
- Reajustar el benchmark EVO congelado.
- Excluir casos a posteriori sin enmienda documentada.
