# ERRATA de exp001 — «umbral clínico de referencia» es vocabulario inadmisible

**Estado del artefacto:** CONGELADO. Las cifras de sensibilidad publicadas son **correctas** y
esta errata no toca ninguna: corrige cómo se enuncia una de sus lecturas.

---

## E1 · 0.25 D se presenta como un hecho clínico establecido

El README dice:

> «El **umbral clínico de referencia** es 0.25 D: la precisión de posición **requerida** para
> no superarlo es ≈ 0.25/\|sensibilidad\| mm por tipo de ojo.»

Dos problemas, y son del tipo que el resto del proyecto prohíbe expresamente:

1. **«umbral clínico de referencia»** enuncia como establecido algo que no se cita ni se
   condiciona. 0.25 D es un **criterio declarado** en este proyecto —el escalón habitual de
   redondeo en refracción escrita—, no un umbral con respaldo clínico aportado aquí.
2. **«la precisión requerida»** deriva de ese criterio un **requisito clínico**. Lo que el
   experimento sostiene es una relación puramente óptica: cuánta posición hace falta para
   mover la refracción una cantidad dada.

**Formulación admisible:** *«bajo el criterio DECLARADO de 0.25 D, la precisión de posición
que mantendría la divergencia por debajo de ese valor es ≈ 0.25/\|sensibilidad\| mm por tipo de
ojo. Que 0.25 D sea o no el umbral relevante para un paciente es una pregunta clínica que este
trabajo no responde.»*

## Lo que exp001 SÍ demuestra, y que sigue siendo válido

La relación D/mm entre posición de LIO y refracción prevista, por tipo de ojo y potencia,
calculada con el motor paraxial propio. Es la base cuantitativa de por qué la predicción de
posición es la variable central del problema — y esa lectura **no depende** del umbral.

**SIMULACIÓN / NO GROUND TRUTH CLÍNICO · RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING**
