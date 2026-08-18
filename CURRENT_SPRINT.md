# CURRENT_SPRINT

**Fecha:** 18/08/2026 · **Hito:** V0.5 completa (`v0.5-hardening-complete`) · **V1 en curso**
**Suite:** 316/316 tests verdes · CI verde (5 jobs) · 10 experimentos deterministas verificados en CI
RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING

## Dónde estamos

| Fase | Estado |
|---|---|
| V0 (motor paraxial + benchmark congelado) | DONE — ver histórico al pie |
| **V0.5 endurecimiento** (10 hallazgos de `docs/V0_REVIEW.md`) | **DONE** — `docs/V0_5_CLOSURE.md`, tag `v0.5-hardening-complete` |
| **V1** (calculadora por trazado, plan en `docs/V1_PROJECT_PLAN.md`) | **EN CURSO** — 11/15 sprints + revisión pre-V1.2 |

## V1 — estado por sprint

| Sprint | Estado | Nota |
|---|---|---|
| V1.1 `OpticalObjective` + `RaytracePowerOptimizer` | **DONE** | exp008; convergencia O(pupila²) al paraxial del mismo sistema |
| V1.13 Puerta de autoconsistencia pupila→0 (rejilla 18 ojos) | **DONE** | adelantada a propósito: existe ANTES de añadir grados de libertad |
| V1.4 `RayBundleGenerator` (4 muestreos, convergencia medida) | **DONE** | `SQUARE_GRID` documentado como no-convergente (limitación medida) |
| Revisión pre-V1.2 (a petición) | **DONE** | ver bloque siguiente |
| V1.2 Superficies cónicas | **DONE** | k=0≡esfera (1e-12), paraboloide y cartesiana exactos; PRIMER trazado STRICT (todo Q documentado); exp009 |
| V1.3 Pose rígida de LIO (tilt/descentración vectoriales) | **DONE** | pose vector + transformadas rígidas; validación no-coaxial (reversibilidad/±pose/O(s²)); métrica de spot corregida a centroide; exp010 |
| V1.5 Contrato política corneal ↔ trazador | **DONE** | verificado por política (misma interpretación, procedencia viaja, sin posterior fabricada, STRICT diferencial); `rotationally_symmetric` explícito y expuesto en consumidores; PoseSource; caza adversarial aplicada: medidas corneales PARCIALES se usan o se registran (antes: descarte silencioso) |
| V1.6 Tórico trazado | **DONE** | `biconicSurface` (Newton salvaguardado, recupera cónica a 1e-12); métrica 2D (M(z) exacta → autoproblema generalizado, ejes sin plano degenerado); `SyntheticToricIOLFactory` (única vía etiqueta→radios, declarada); córnea tórica por política explícita (jamás "medida", OQ #10); STRICT bloquea todo tórico inventado; objetivos escalares GUARDADOS; exp011 (eje 0° error, vectorial ≤0.001 D); caza adversarial aplicada: intersección bicónica reescrita (ventana acotada, sin rama lejana), coherencia etiqueta↔geometría registrada, MC rechaza claves desconocidas, focos virtuales rechazados con nombre |
| V1.7 Rotación tórica | **DONE** | por FÍSICA (pose.rotation_z rota la bicónica y se re-traza; `toric_rotation_deg` NO reintroducido); error de rotación = DERIVADO (físico − planificado, mod 180, firmado; jamás entrada); anclas: 2C·\|sen θ\| solo módulos iguales (≤0.00123 D), resta vectorial completa en general (≤0.0009 D); divergencia a pupila finita REPORTADA; tres ejes distinguidos (geometría / minus-cyl / marcas → OQ #11); exp012 |
| V1.8 `RaytraceEngine` en benchmark | **DONE** | contrato de COMPARABILIDAD: tórico UNSUPPORTED ≠ cero físico (PredictionResult validado); inyección explícita total; a_constant/iol_model = inputs EVO ignorados con nombre; pupil_mm de ESCENARIO de primer nivel con procedencia (el pupil_mm del OJO sigue reservado: homónimos); CONTROLLED_PHYSICS (controles verificados) / FULL_ENGINE (divergencia entre motores + diferencias listadas); convenciones de refracción NO se restan; caza adversarial aplicada: CONTROLLED_PHYSICS exige la MISMA lente gruesa (el paraxial evaluaba delgada y ese término era ~100% de la cifra), objetivo A rechazado por unidades, pupila sin precedencia tácita, opciones corneales con vocabulario cerrado, borde de catálogo guardado |
| V1.9 Atlas de divergencia | **DONE** | experimento interpretable: A CONTROLLED_PHYSICS (ΔP CONTINUA, AL×K×pupila esférico, ancla apertura→0 verificada, monotonía OBSERVADA no impuesta) y B FULL_ENGINE descriptivo, separados; contabilidad anti-survivor-bias (todo intento con estado y motivo clasificado); bandas DESCRIPTIVAS, no umbrales clínicos; exp013 |
| V1.12 Incertidumbre sobre trazado | **DONE** | arquitectura nueva (no port): sigmas {sd, tipo, provenance} obligatorios; causalidad medidas→predictor→posición con descomposición anti-doble-conteo; variables INERTES rechazadas por sonda de ejecución (SUB-RESOLUCIÓN distinguida de inercia, pasos de contraste canónicos DENTRO de plausibilidad); dos preguntas separadas (resultado con LIO fija vs inestabilidad de la elección, censura fuera-de-ventana VISIBLE); correlaciones declaradas (Cholesky); anclas nominal exacta + lineal gᵀΣg; exp014 (validación por refutación, con réplicas de semilla independiente y procedencia exacta por sigma); caza adversarial aplicada: el ojo perturbado conserva TODOS los campos medidos (la copia enumerada perdía 11), pupil_mm perturbable de verdad en resultado Y elección (era canal fantasma), censura por rechazo ADVERTIDA (`advertencia_censura`: colas truncadas, sd sesgada a la baja), RNG local mulberry32 (el LCG del proyecto infla varianza 1.3–2.8 %, medido y documentado en montecarlo.mjs), pareo de semillas canónico por clave ordenada, pupila MEDIDA registrada como no consumida (`pupila`) |
| V1.11 Pipeline EQ · V1.14 Rendimiento · V1.15 Docs | **SIGUIENTE** | |
| V1.10 Predictores de literatura | **BLOCKED** | OPEN_QUESTIONS #2: sin publicación con coeficientes, no se implementa |

## Revisión pre-V1.2 (los tres puntos pedidos)

1. **B ≡ C demostrado y reducido.** `BEST_FOCUS_ON_RETINA` y `EQUIVALENT_DEFOCUS` eran el
   mismo criterio de optimización en unidades distintas (mismo argmin; demostración en
   `objective.mjs`, tests en `objective_equivalence.test.mjs`). Quedan DOS objetivos
   (A: RMS en retina; C: desenfoque equivalente) y la métrica de B se reporta
   (`detail.desplazamiento_mm`). exp008 regenerado: diff numérico = 0.
2. **`ASSUMED_SPHERICAL` introducido.** Tres estados de asfericidad que no se convierten
   entre sí en silencio: Q numérica documentada → el trazador FALLA hasta implementar
   cónicas; `ASSUMED_SPHERICAL` → esfera por supuesto declarado (la genérica);
   `UNKNOWN` → esfera con el supuesto REGISTRADO en `eye.assumptions`.
3. **exp007 reencuadrado.** Mide sensibilidad sintética a la CONVENCIÓN de índice
   queratométrico, no diferencias entre marcas reales de biómetro. Título, campos y docs
   corregidos; diff numérico = 0.
4. **Modo de fidelidad introducido** (`src/core/fidelity.mjs`, a petición, entrada de
   V1.2). `RESEARCH` (defecto): los UNKNOWN ópticamente relevantes pueden sustituirse
   por supuestos explícitos REGISTRADOS. `STRICT`: cualquier supuesto registrado impide
   el cálculo (`StrictModeViolation` enumera qué faltó) — el modo de la validación
   futura. La puerta es el registro de supuestos: ningún supuesto registrado la
   atraviesa. Hoy pasa STRICT la vía paraxial con córnea medida + lente de fabricante;
   ningún trazado pasaba entonces (asfericidad corneal, Q de LIO) — superado en V1.2,
   ver fila de sprint. Tests diferenciales:
   `tests/fidelity.test.mjs`. La caza adversarial posterior encontró 4 sustituciones
   sin registrar en la ruta STRICT (astigmatismo medido colapsado a EE, centrado
   geométrico vs plano principal, tilt/rotación declarados ignorados, cylinder_d ?? 0)
   y un bypass (la vía tórica llegaba a predictedRefraction sin puerta): todos
   registrados/bloqueados; recommendToric y Monte Carlo entraron en la puerta.
5. **Verificación adversarial posterior** (4 revisores independientes, 15 hallazgos):
   el teorema B≡C sobrevivió, pero la demostración escrita tenía dos huecos reales —
   la unimodalidad en P es hipótesis empírica (H3), no deducción, y el argumento de
   orden era inválido entre lados opuestos (el reorden EXISTE; la equivalencia la
   sostiene el invariante de bracket). Reescrita con hipótesis H1/H2/H3 explícitas y
   dos tests nuevos. Además: el optimizador propagaba `cornea_policy` pero descartaba
   `eye.assumptions` — ahora expone `supuestos_trazado` y hay test que lo fija.

## BLOCKED permanentes (requieren el mundo exterior; nada se desbloquea con código)

1. Coeficientes de literatura → fuente citable delante (OPEN_QUESTIONS #2).
2. Geometría real de LIO comerciales → fichas de fabricante (#4); sin ellas, `UNKNOWN` y el trazado falla.
3. Sigmas reales de medida/biología → repetibilidad + cohorte (#6).
4. Elección de política corneal (#7) y de criterio óptico (#8) → cohorte postoperatoria.
5. Cualquier calibración o ML clínico → datos conforme a `PROTOCOL_FIRST_CLINICAL_BATCH.md`.

## Invariantes que la CI vigila en cada push

- Legado EVO byte-idéntico (102 hashes, en Linux y Windows).
- El motor físico no importa nada del legado (test de arquitectura).
- Los experimentos deterministas (exp001/003/007/008/009/010/011/012/013/014) reproducen su `results.json` publicado.
- Ningún parámetro del motor procede de ajustar contra EVO.

---

<details><summary>Histórico V0 (cerrado 10/08/2026, 67 tests)</summary>

Sprints 0–12 DONE: baseline congelado, core científico, paraxial propio, ray tracer,
ojo completo, optimizador, sintéticos + sensibilidad (exp001–exp003), posición modular,
geometría ampliada (exp006), tórico independiente, Monte Carlo (exp004), benchmark
global (exp002/exp005), clinical readiness. Detalle en `PROJECT_PLAN.md` y
`docs/V0_REVIEW.md` (auditoría posterior con 10 hallazgos, todos cerrados en V0.5).

</details>
