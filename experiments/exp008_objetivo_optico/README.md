# exp008 — ¿Cuánto importa el criterio óptico elegido?

**SIMULACIÓN / NO GROUND TRUTH CLÍNICO** · commit `f9d3f02268` · 2026-08-10T10:48:54.953Z

## Pregunta

Con pupila real los rayos no cortan todos en el mismo punto: no existe "el foco", y
"enfocar en la retina" deja de estar definido. V1.1 implementa tres criterios defendibles
(mínimo RMS en retina, mejor foco sobre retina, desenfoque equivalente nulo). Este
experimento mide cuánta potencia los separa, y cuánto separan al trazado del paraxial.

## Resultado

| Fuente de divergencia | Magnitud |
|---|---|
| **Entre los tres criterios ópticos** | 0.0054 D de media, **0.0397 D como máximo** |
| Aberración esférica (trazado − paraxial del mismo sistema) | -3.5963 … -0.1985 D |
| Espesor de la lente (paraxial del sistema − paraxial delgado) | +0.1703 … +0.2981 D |

### Lectura, en orden de importancia

1. **El criterio elegido casi no importa** con superficies esféricas: los tres coinciden
   dentro de 0.0397 D en el peor caso, muy por debajo del escalón
   comercial de 0.5 D. Es un resultado **negativo y útil**: con la geometría actual, la
   angustia sobre "qué optimizar" no está justificada. Debería reevaluarse al introducir
   asfericidad (V1.2) y tilt/descentración (V1.3), que rompen la simetría que hoy los iguala.
2. **La aberración esférica sí importa**, y crece rápido con la pupila: es la diferencia
   real entre trazar y no trazar.
3. **El espesor de la lente importa tanto o más que la aberración** a pupilas medias, y es
   un efecto que el paraxial de lente delgada de V0 ignora por completo.

## Detalle

| Ojo | AL | K | Pupila | Paraxial delgada | Paraxial sistema | A (RMS) | B (foco) | C (desenf.) | Rango A-B-C | Aberración | Espesor |
|---|---|---|---|---|---|---|---|---|---|---|---|
| corto_K_plana | 21 | 41 | 2 | 34.72483 | 34.99864 | 34.59591 | 34.59645 | 34.59645 | 0.00054 | -0.4022 | +0.2738 |
| corto_K_plana | 21 | 41 | 3 | 34.72483 | 34.99864 | 34.09452 | 34.09721 | 34.09721 | 0.0027 | -0.9014 | +0.2738 |
| corto_K_plana | 21 | 41 | 4 | 34.72483 | 34.99864 | 33.39618 | 33.40453 | 33.40453 | 0.00835 | -1.5941 | +0.2738 |
| corto_K_plana | 21 | 41 | 5 | 34.72483 | 34.99864 | 32.5041 | 32.52393 | 32.52393 | 0.01983 | -2.4747 | +0.2738 |
| corto_K_plana | 21 | 41 | 6 | 34.72483 | 34.99864 | 31.42174 | 31.46148 | 31.46148 | 0.03974 | -3.5372 | +0.2738 |
| corto_K_curva | 21 | 46 | 2 | 27.64551 | 27.94362 | 27.54608 | 27.54639 | 27.54639 | 0.00031 | -0.3972 | +0.2981 |
| corto_K_curva | 21 | 46 | 3 | 27.64551 | 27.94362 | 27.04798 | 27.04953 | 27.04953 | 0.00154 | -0.8941 | +0.2981 |
| corto_K_curva | 21 | 46 | 4 | 27.64551 | 27.94362 | 26.34803 | 26.35279 | 26.35279 | 0.00476 | -1.5908 | +0.2981 |
| corto_K_curva | 21 | 46 | 5 | 27.64551 | 27.94362 | 25.44253 | 25.45377 | 25.45377 | 0.01124 | -2.4899 | +0.2981 |
| corto_K_curva | 21 | 46 | 6 | 27.64551 | 27.94362 | 24.32499 | 24.34734 | 24.34734 | 0.02235 | -3.5963 | +0.2981 |
| normal | 23.5 | 43.5 | 2 | 20.07038 | 20.30737 | 20.0262 | 20.02631 | 20.02631 | 0.00011 | -0.2811 | +0.2370 |
| normal | 23.5 | 43.5 | 3 | 20.07038 | 20.30737 | 19.67276 | 19.6733 | 19.6733 | 0.00053 | -0.6341 | +0.2370 |
| normal | 23.5 | 43.5 | 4 | 20.07038 | 20.30737 | 19.17397 | 19.1756 | 19.1756 | 0.00163 | -1.1318 | +0.2370 |
| normal | 23.5 | 43.5 | 5 | 20.07038 | 20.30737 | 18.52513 | 18.52896 | 18.52896 | 0.00383 | -1.7784 | +0.2370 |
| normal | 23.5 | 43.5 | 6 | 20.07038 | 20.30737 | 17.71912 | 17.72664 | 17.72664 | 0.00753 | -2.5807 | +0.2370 |
| largo_K_plana | 27 | 41 | 2 | 12.19595 | 12.37852 | 12.18003 | 12.18004 | 12.18004 | 0.00001 | -0.1985 | +0.1826 |
| largo_K_plana | 27 | 41 | 3 | 12.19595 | 12.37852 | 11.92984 | 11.9299 | 11.9299 | 0.00006 | -0.4486 | +0.1826 |
| largo_K_plana | 27 | 41 | 4 | 12.19595 | 12.37852 | 11.57551 | 11.57568 | 11.57568 | 0.00018 | -0.8028 | +0.1826 |
| largo_K_plana | 27 | 41 | 5 | 12.19595 | 12.37852 | 11.11254 | 11.11289 | 11.11289 | 0.00035 | -1.2656 | +0.1826 |
| largo_K_plana | 27 | 41 | 6 | 12.19595 | 12.37852 | 10.53449 | 10.53499 | 10.53499 | 0.0005 | -1.8435 | +0.1826 |
| muy_largo | 30 | 43.5 | 2 | 1.46951 | 1.63976 | 1.43152 | 1.43147 | 1.43147 | 0.00005 | -0.2083 | +0.1703 |
| muy_largo | 30 | 43.5 | 3 | 1.46951 | 1.63976 | 1.1678 | 1.16754 | 1.16754 | 0.00026 | -0.4722 | +0.1703 |
| muy_largo | 30 | 43.5 | 4 | 1.46951 | 1.63976 | 0.79198 | 0.79113 | 0.79113 | 0.00086 | -0.8486 | +0.1703 |
| muy_largo | 30 | 43.5 | 5 | 1.46951 | 1.63976 | 0.29691 | 0.29472 | 0.29472 | 0.00218 | -1.3450 | +0.1703 |
| muy_largo | 30 | 43.5 | 6 | 1.46951 | 1.63976 | -0.32749 | -0.33225 | -0.33225 | 0.00476 | -1.9720 | +0.1703 |

## Lo que este experimento NO demuestra

Cuál de los tres criterios predice mejor la refracción postoperatoria real, ni que el
trazado prediga mejor que el paraxial. Ambas cosas exigen una cohorte postoperatoria
(OPEN_QUESTIONS #7). Lo que se mide aquí es **estructura del modelo**, no acierto.

La lente usada es un SUSTITUTO DE SIMULACIÓN (`GenericIOLFactory`, geometría derivada de
la potencia). Ningún número de esta tabla es atribuible a una lente comercial: sin ficha
de fabricante la geometría es `UNKNOWN` y el trazado falla en vez de sustituirla
(OPEN_QUESTIONS #4).
