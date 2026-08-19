# ERRATA de exp013 — el sello de commit no apunta a estas cifras

**Estado del artefacto:** CONGELADO. `results.json` y `README.md` se conservan tal como los
generó su script, y `scripts/check_experiments.mjs` verifica en cada push que se reproducen
número a número. Esta errata **no corrige ninguna cifra**: las publicadas son las correctas.

---

## E1 · El commit sellado precede a la corrección que cambió las cifras

El README y el `results.json` sellan el commit **`1452faa7df`**. Un lector que intente
verificar las cifras con `git show 1452faa7df:experiments/exp013_atlas_divergencia/results.json`
obtiene **otras**: en ese commit el muestreo era `n_anillos = 5`, la configuración que la
revisión adversarial de V1.9 demostró **no convergida** (sobreestimaba \|ΔP\| ~7 %).

Las cifras vigentes —con `n_anillos = 40`— las publicó el commit
**`7fca60a`** («fix(V1.9): hallazgos de la revisión adversarial del atlas — cifras corregidas
y contabilidad blindada»).

**Causa:** el campo se estampa con el último commit **al generar**, que es sistemáticamente el
**padre** del que publica. El propio `procedencia_commit` de todos los experimentos ya lo
advierte desde V1.3, pero aquí la consecuencia es más aguda, porque entre el commit sellado y
el que publica hubo una **corrección de cifras**, no solo un cambio de metadatos.

**Qué usar:** las cifras válidas son las del fichero vigente en `main`. La garantía de
reproducibilidad la da `scripts/check_experiments.mjs`, no el campo `commit` — exactamente lo
que dice `procedencia_commit`.

## E2 · «CONVERGIDO» es un literal, no una conclusión derivada

El README afirma «MERIDIONAL con n_anillos = 40 (80 rayos), **CONVERGIDO** (ver bloque de
convergencia)». Esa palabra está **fija en el código** del generador, no se calcula — a
diferencia del ancla de apertura, cuyo veredicto sí se deriva del dato. El bloque de
convergencia que el texto invoca está publicado y el lector puede juzgarlo por sí mismo; lo
que no debe leerse es «CONVERGIDO» como un veredicto que el experimento haya comprobado en
esa ejecución.

## Lo que exp013 NO demuestra

- **No** demuestra que la divergencia medida sea un error de uno de los dos motores: mide
  divergencia entre modelos, y ninguno tiene ground truth.
- Sus bandas son **descriptivas**, no umbrales clínicos.
- El ancla apertura→0 valida el **límite**, no la pupila finita.

**SIMULACIÓN / NO GROUND TRUTH CLÍNICO · RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING**
