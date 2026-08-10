# CLINICAL_DATA_REQUIREMENTS — Datos clínicos futuros

**Versión:** 1.0 · **Fecha:** 10/08/2026 · RESEARCH USE ONLY

## Estado actual

**No existe base propia de datos postoperatorios.** En consecuencia, en esta fase:
ninguna refracción simulada es verdad clínica, no se entrena ML clínico y no se
declara superioridad de ningún motor. Este documento define qué habrá que capturar
cuando existan datos reales, con el esquema ya listo en `data/clinical_schema/`.

## Esquemas (JSON Schema 2020-12, sin PII)

| Fichero | Contenido | Clave |
|---|---|---|
| `preop.schema.json` | Biometría completa + córnea posterior + rasgos OCT opcionales | `patient_case_id` anonimizado |
| `surgery.schema.json` | LIO implantada (fabricante/modelo/potencia/cilindro/eje), incisión, SIA, cirujano anonimizado, periodo generalizado | ídem |
| `postop.schema.json` | Refracción manifiesta, AV, y si el centro dispone: posición axial real de la LIO, tilt, descentración, rotación tórica | ídem |

Reglas de anonimización: sin nombre, sin fecha de nacimiento, sin número de historia;
fecha de cirugía generalizable a trimestre; `surgeon_id` como código.

## Dataset mínimo viable (para validar la hipótesis de posición)

- **Objetivo primario:** comparar predictores de posición (`f(AL,ACD,LT,K)` vs
  `f(+EQ/OCT)`) contra posición **medida** postoperatoria.
- Requiere por caso: preop completo con OCT (plano ecuatorial, diámetro), LIO modelo y
  potencia, y postop con `iol_axial_position_mm` medida + refracción estable (≥ 30 días).
- Tamaño orientativo: se determinará con análisis de potencia una vez se conozca la
  varianza real; los experimentos de sensibilidad (exp001) indican qué precisión de
  posición es necesaria para que el error óptico quede bajo 0.25 D por tipo de ojo —
  ese resultado fija el requisito de medida antes que el tamaño muestral.
- Refracción a distancia estandarizada (gafa, vértice declarado) y dispositivo de
  medida registrado (`measurement_device`).

## Uso previsto de los datos (cuando existan)

1. Validar/calibrar `IOLPositionPredictor` (regresión con procedencia documentada).
2. Medir el residuo `refracción real − predicción física` y SOLO entonces plantear ML
   sobre ese residuo (nunca end-to-end de inicio).
3. Resolver las regiones de divergencia física↔EVO identificadas en `experiments/`.
