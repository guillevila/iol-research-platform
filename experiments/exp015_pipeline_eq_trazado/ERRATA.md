# ERRATA de exp015 — el sello de commit precede a su última corrección

**Estado del artefacto:** CONGELADO y verificado en cada push. Esta errata **no corrige
ninguna cifra**.

---

## E1 · El sello de commit no es el de las cifras vigentes

`results.json` sella el commit **`e419d9f`**, y las cifras vigentes las publicó el commit
posterior de la ronda de cierre de V1.11 (`bf9c5dc`, «revisión del diff completo — 20
incoherencias del propio cierre»), que entre otras cosas amplió las anclas de 6 a 54 celdas,
midió el término cruzado por cuadratura 2D y publicó el sesgo del PRNG.

Es el **mismo defecto** que motivó las erratas de exp013 y exp014: el campo se estampa con el
último commit **al generar**, que es el padre del que publica. Se registra aquí por
coherencia — el índice [`../ERRATAS.md`](../ERRATAS.md) decía que exp015 no la necesitaba
porque sus correcciones adversariales están dentro de su propio README, lo cual es cierto
pero **no cubre el sello**.

**Qué usar:** las cifras del fichero vigente en `main`. La garantía de reproducibilidad la da
`scripts/check_experiments.mjs`, no el campo `commit`.

## Lo que exp015 NO demuestra

Está publicado en su propio README (sección «Lo que este experimento NO demuestra») y se
resume: **no valida H_EQ**, no mide beneficio clínico, no consume el ecuador medido, no
re-elige potencia por extracción, y su canal de no-linealidad es pequeño por **cancelación
estructural**, no porque la respuesta sea lineal.

**SIMULACIÓN / NO GROUND TRUTH CLÍNICO · RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING**
