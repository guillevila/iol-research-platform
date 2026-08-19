# ERRATA de exp014 — las cifras publicadas son una regeneración

**Estado del artefacto:** CONGELADO en su forma actual y verificado en cada push. Esta errata
**no corrige ninguna cifra**.

---

## E1 · El sello de commit precede a la regeneración que produjo estas cifras

`results.json` sella el commit **`f884ef28d1`**. Las cifras vigentes las publicó
**`a5cec65`** («exp014 regenerado tras la caza adversarial (cambio explicado)»), que reescribió
el experimento tras la revisión de V1.12.

**Por qué cambiaron entonces** (está en el mensaje de ese commit, y se resume aquí para que no
haya que buscarlo):

- el generador de números aleatorios pasó de `makeRng` (LCG del proyecto, cuya varianza está
  inflada 1.3–2.8 %, medido) a `mulberry32`;
- el muestreo pasó de `n_anillos = 5` a `40`, porque el sesgo de localización ~O(1/n_anillos)
  contaminaba nominal, media y percentiles (la desviación típica es robusta por ser de modo
  común);
- la **procedencia por sigma** se hizo exacta: σ_AL y σ_K vienen de exp004, pero σ_ACD y
  σ_posición son escenarios **nuevos** de V1.12 — decir «valores de exp004» era inexacto para
  dos de las cuatro.

**Qué usar:** las cifras del fichero vigente en `main`. La reproducibilidad la garantiza
`scripts/check_experiments.mjs`, no el campo `commit`.

## Lo que exp014 NO demuestra

- Las sigmas son **escenarios declarados** (OQ #6), no distribuciones clínicas: ningún
  percentil de aquí es un intervalo de paciente.
- La lente es un **sustituto declarado** (OQ #4) y el ojo es sintético.
- La dimensión tórica no está calculada: un caso astigmático llevaría
  `unsupported_dimensions`, jamás un cero físico.

**SIMULACIÓN / NO GROUND TRUTH CLÍNICO · RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING**
