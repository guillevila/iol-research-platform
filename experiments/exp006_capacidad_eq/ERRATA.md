# ERRATA de exp006 — limitaciones de INTERPRETACIÓN (las cifras no cambian)

**Estado del artefacto:** CONGELADO en sus CIFRAS. Las filas (`rows`) y la configuración
(`config`) de `results.json` son bit a bit las de la publicación original (2026-08-10),
verificado campo a campo. Lo único que cambió en V1.11 (commit `d5de293`, al incorporar
exp006 al verificador de reproducibilidad) son metadatos: `timestamp`, `commit` y el campo
`procedencia_commit` que el resto de experimentos ya llevaba desde V1.3. **Ninguna cifra
cambia.** Esta errata **no corrige ningún número** — todos los verificados siguen siendo
correctos — sino la forma en que su prosa podría leerse. Es el equivalente a publicar una
fe de erratas en lugar de reescribir el artículo: la trazabilidad del resultado histórico
se preserva íntegra.

Registrada en la revisión adversarial de cierre de V1.11 (fiscales EE↔EQ e
hipótesis→clínica). Verificación de que las cifras no cambian: `scripts/check_experiments.mjs`
re-ejecuta exp006 en cada push y compara número a número contra lo publicado.

---

## E1 · «Beneficio esperado» no es un beneficio clínico

El README titula una tabla **«Beneficio esperado de medir EQ (D de error refractivo
evitado)»** y el campo se llama `beneficio_d`. Leído fuera de contexto, eso parece un
efecto clínico. **No lo es.** La cifra es una consecuencia aritmética de un mundo
generativo declarado:

- es **condicional a H_EQ**, una hipótesis de dos cláusulas separables y **no validada**:
  (i) la LIO se asienta en el ecuador capsular; (ii) ese ecuador se aproxima
  preoperatoriamente por ACD + LT/2, con residual biológico ε_bio;
- es **condicional a σ_bio y σ_medida**, que son **escenarios DECLARADOS sin procedencia
  medida** (OPEN_QUESTIONS #6). El README publicado no lo dice en la tabla; ninguna de
  esas sigmas procede de repetibilidad de dispositivo ni de biología observada;
- el «error refractivo evitado» se calcula **dentro** del mundo H_EQ: se compara un
  estimador que no ve ε_bio contra otro que mide el ecuador con ruido σ_m. Si H_EQ es
  falsa —si la LIO no se asienta en el ecuador, o si ACD+LT/2 no lo aproxima— la tabla
  entera deja de tener referente.

Lectura admisible: *bajo H_EQ y con esas sigmas declaradas, un estimador con σ_m < σ_bio
tiene menor error de posición esperado que el estimador base, y ese margen se traduce en
dioptrías con la sensibilidad del ojo.* Lectura **inadmisible**: «medir el ecuador con OCT
evita X dioptrías en pacientes».

## E2 · La «Lectura 2» cita cifras que no están en su propia tabla

El README dice: *«evita ~0.39 D en el corto frente a ~0.11 D en el largo»* (σ_bio = 0.3,
σ_medida = 0.1). Las celdas computadas de esa misma tabla dan **0.363 D** y **0.102 D**.
La discrepancia (+7.4 % y +7.8 %) viene de que ese texto está **fijo en el código** del
script y no se recalcula de las filas. Su origen **no consta en el historial**: el commit
que publicó exp006 ya traía 0.363 / 0.102 en su `results.json`, así que no hubo ninguna
versión con parámetros que produjeran 0.39 / 0.11.

**Las cifras válidas son las de `results.json`**, no las de la prosa. Cualquier trabajo
posterior debe anclar contra el JSON. No se regenera el README porque las cifras
publicadas son correctas y reescribirlo destruiría la trazabilidad de lo que se publicó
aquel día; se corrige aquí, que es donde corresponde.

## E3 · Vocabulario de superioridad en el docstring

El docstring de `run_exp006.mjs` autoriza la conclusión *«BAJO H_EQ, medir EQ con σ_m
mejora al modelo base si σ_m < σ_bio»*. El verbo «mejora» es vocabulario de superioridad,
que el proyecto evita sin ground truth. En su contexto la frase es defendible —es un
enunciado matemático sobre un modelo generativo declarado, no sobre pacientes— pero se
registra aquí porque, aislada, se lee como una afirmación comparativa clínica. Formulación
preferible: *«bajo H_EQ, el estimador con σ_m < σ_bio tiene menor error de posición
esperado que el estimador base»*.

## E4 · Limitaciones numéricas conocidas del artefacto (no son defectos de sus cifras)

Medidas en V1.11 al usar exp006 como ancla de exp015:

| Contribución | Magnitud | Efecto |
|---|---|---|
| Sesgo del LCG de `makeRng` sobre E\|ε\| | **~0.8 %** al alza (dependiente de semilla; MEDIDO y publicado en `exp015 → bloque0_anclas_exp006.sesgo_prng_medido`, reproducible en cada corrida) | sistemático **al alza**: es lo que explica que las 54 desviaciones contra la forma cerrada σ√(2/π) sean **todas positivas** |
| SE del estimador con n = 6000 | **0.98 %** relativo (derivable: √(1−2/π)/√(2/π)/√n) | dispersión aleatoria |
| Redondeo publicado a 3 decimales | **1.25 %** en σ = 0.05; 0.16 % en σ = 0.40 | granularidad; pesa más en σ pequeña |

Sobre las **54 celdas publicadas** (27 filas × 2 brazos) el rango real de desviación es
**0.27 %–2.77 %**, todas positivas. Las tres contribuciones lo explican en la banda
esperable del estimador, pero **no exactamente**: en las celdas de σ pequeña —donde el
redondeo pesa más— el dato queda hasta ~2 SE por encima de la suma de sesgo + redondeo
(6 de las 54 celdas superan 2·SE). `montecarlo.mjs` documenta el defecto del LCG como
1.3–2.8 % de inflación de **varianza**; sobre E|ε| el efecto es ~la mitad porque
E|ε| ∝ σ = √varianza.

---

## Lo que exp006 NO demuestra (y sigue sin demostrar)

- **No valida H_EQ.** Ninguna de sus dos cláusulas se contrasta contra dato alguno.
- **No mide** el plano ecuatorial: simula el ruido de un OCT hipotético con σ_m declarada.
  El campo `lens_eq_plane_mm` (ecuador MEDIDO) sigue **reservado y sin consumir** en todo
  el proyecto.
- **No dice nada sobre pacientes.** Ojos sintéticos, sigmas declaradas, sin cohorte.
- Validar H_EQ exige **posición de LIO medida en cohorte postoperatoria** con EQ
  preoperatorio por OCT (`docs/scientific/PROTOCOL_FIRST_CLINICAL_BATCH.md`, objetivo
  primario; `VALIDATION_STRATEGY.md` nivel 3).

**SIMULACIÓN / NO GROUND TRUTH CLÍNICO · RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING**
