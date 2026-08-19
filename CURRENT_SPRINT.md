# ESTADO DEL PROYECTO — V1 cerrada en su alcance ejecutable

**Fecha:** 19/08/2026 · **Hito:** V1 CERRADA (alcance ejecutable) · **Sin sprint activo**
**Suite:** 343/343 tests verdes · CI verde (5 jobs) · 12 experimentos deterministas verificados en CI
RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING

> **No hay ningún sprint en curso.** Este fichero es ahora el registro de estado, no un
> tablero de trabajo. El documento canónico para entender qué es y qué NO demuestra la
> plataforma es **[docs/V1_CLOSURE.md](docs/V1_CLOSURE.md)**.

## Semántica del cierre (leer antes que cualquier cifra)

**V1 se cierra en su ALCANCE EJECUTABLE: 14/15 sprints DONE; V1.10 permanece BLOCKED por
dependencia externa.** No se escribe «15/15» ni «100 %» porque sería falso.

| Estado | Cuántos | Cuáles |
|---|---|---|
| **DONE** | 14 | V1.1–V1.9, V1.11–V1.15 |
| **BLOCKED · EXTERNAL** | 1 | V1.10 (predictores de literatura) |
| NOT DONE | 0 | — |

**Por qué el alcance ejecutable puede cerrarse con V1.10 bloqueado:** lo que bloquea a V1.10
no es trabajo interno sino la ausencia de una publicación citable con coeficientes (OQ #2), y
la regla del proyecto prohíbe escribirlos de memoria. Todo lo que sí dependía de este
repositorio —contrato de CAPA B, interfaz `predict()` con `inputs_used` y procedencia, punto
de extensión `LinearRegressionPredictor` que exige `provenance` en construcción— está
construido y probado.

**Qué reabriría V1.10:** disponer de la publicación (PDF/DOI) con su fórmula y su tabla de
coeficientes. Ese día se implementa rellenando una clase existente, sin tocar arquitectura.

## Dónde estamos

| Fase | Estado |
|---|---|
| V0 (motor paraxial + benchmark congelado) | DONE — ver histórico al pie |
| **V0.5 endurecimiento** (10 hallazgos de `docs/V0_REVIEW.md`) | **DONE** — `docs/V0_5_CLOSURE.md`, tag `v0.5-hardening-complete` |
| **V1** (motor por trazado, plan en `docs/V1_PROJECT_PLAN.md`) | **CERRADA en alcance ejecutable** — 14/15 DONE + revisión pre-V1.2; V1.10 BLOCKED externo. Cierre: [`docs/V1_CLOSURE.md`](docs/V1_CLOSURE.md) |

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
| V1.11 Pipeline EQ (el plano ecuatorial, H_EQ, a través del trazado) | **DONE** | definición CORREGIDA antes de implementar: el título del plan («equivalente esférico») era una expansión errónea de la sigla EQ = ecuador capsular (evidencia: V0_REVIEW H9 «EQ/ATA/STS → V1.11», exp006_capacidad_eq, convención EE/EQ del repo); el criterio de aceptación (exp006) era el correcto. **H_EQ es una hipótesis de dos cláusulas** — (i) la LIO se asienta en el ecuador capsular y (ii) ese ecuador ≈ ACD + LT/2 + ε_bio — nunca la fórmula a secas: el proxy no es la hipótesis. Entrega: `EquatorialPlanePredictor` (H_EQ como CAPA B, sin parámetros libres, hipótesis declarada en `source`, datum ápex-z0 coherente, NO lee el ecuador MEDIDO — reservado intacto, prueba de invarianza por ejecución); `lt_mm` perturbable en V1.12 con sonda de inercia; exp006 pasa a estar VIGILADO (su exclusión alegaba una cobertura de tests inexistente) con cifras intactas; exp015 reproduce el eje paraxial de exp006 **27/27 celdas bit a bit** (promover H_EQ a CAPA B es numéricamente neutro) y publica la divergencia del pipeline físico en canales de UN cambio cada uno. Caza adversarial aplicada (5 vectores): la primera escalera de causas atribuía mal dos canales (el de «linealización» era ~99 % ruido del estimador del ancla; el de «lente» era ~100 % cuantización del escalón de 0.5 D, con el efecto de lente puro de signo OPUESTO en el corto) — repartidos en cuatro canales telescópicos; cota de discretización del haz publicada; aceptación (c) del plan enmendada por prometer canales no entregados; «alcance EE-only» retirado del nombre (era herencia del título viejo: la restricción es del OPTIMIZADOR y de la rejilla, no de un predictor de posición); IOL_POSITION.md y el registro de reservados sincronizados. Ronda de CIERRE (2 fiscales + verificación numérica + revisión del diff completo): la procedencia de la hipótesis atraviesa ahora la capa de incertidumbre (`procedencia_posicion.hypothesis` / `condicional_a_hipotesis`, legible por máquina — antes solo viajaba `predictor.id`); el término de no-linealidad se reinterpreta (es pequeño por CANCELACIÓN del término par en E|·| bajo perturbación simétrica, NO porque la respuesta sea lineal: su curvatura es −0.087 D/mm² y el desvío de la recta a 0.8 mm −0.056 D); la cota del término cruzado ε_bio×ε_med se MIDE por cuadratura 2D (1.30e-5 D, no «< 1e-6 D» — la analítica era optimista un orden); el haz se mide a 40/160/320 anillos (el ABSOLUTO no converge y se declara como tal; solo la respuesta diferencial es interpretable); las anclas pasan a cubrir las 54 celdas (rango real 0.27–2.77 %, no el 1.52 % de una selección de 6); y las limitaciones de interpretación del artefacto congelado quedan en [ERRATA.md](experiments/exp006_capacidad_eq/ERRATA.md) sin reescribirlo |
| V1.14 Rendimiento | **DONE** | PERFILAR ANTES DE OPTIMIZAR: el perfil de V8 situó el coste en `spotRmsAt` (22.6 %), `isFiniteVec` (12.1 %), `intersect` (11.8 %) y GC (10.1 %) — no en construir geometría ni en el catálogo, que era la apuesta intuitiva. Cuatro optimizaciones generales en `src/` (buffer reutilizable en spotRmsAt conservando las DOS pasadas; bucle explícito en isFiniteVec; eliminado el array `hits` de traceRay que nadie consumía; aplanado único de rayos en bestFocus). **Speedup defendible ×2.07** medido desde DOS COMMITS LIMPIOS con instrumentación simétrica y orden contrabalanceado (tres protocolos independientes convergen: ×2.05, ×2.07, ×2.13); heterogéneo de ×1.49 a ×2.78 y publicado como tal. Experimentos: exp013 ×2.11, exp014 ×2.24, exp015 ×1.81. **Ningún bit científico cambió**: equivalencia bitwise (codificación IEEE-754 de 8 bytes) verificada ENTRE CHECKOUTS LIMPIOS en los 10 workloads. Trabajo CIENTÍFICO invariante (mismos rayos, mismas evaluaciones); lo eliminado es trabajo de IMPLEMENTACIÓN: GC de `barrido` 262→74 ms (−72 %). Presupuesto en tres niveles: HARD (trabajo determinista exacto + equivalencia), SOFT (relativo calibrado, avisa y NO falla — un umbral en ms absolutos sobre runner compartido sería frágil: medí 130 % de dispersión con el mismo código), CARACTERIZACIÓN (bench/). Descartados con motivo: `Math.hypot`→`sqrt` (rompe bits), caché de geometría por potencia (error científico), reutilizar haz entre extracciones (el perfil demostró que era irrelevante), paralelismo (el pareo por semilla es propiedad científica de V1.12). Caza adversarial: 12 tests que atacan el estado compartido (A→B→A, grande→pequeño, rayos filtrados, fallos a mitad, aliasing, orden aleatorio, 25 repeticiones) — todos pasan; tradeoff declarado: los buffers no encogen (~1.25 MiB en el peor haz). Artefactos en `bench/`, NO en `experiments/`: un tiempo de pared no puede reproducirse número a número |
| V1.15 Documentación y cierre de V1 | **DONE** | `docs/V1_CLOSURE.md` como documento canónico (qué es V1, capacidades por función y no por sprint, matriz CAPACIDAD↔EVIDENCIA↔LIMITACIÓN, matriz de los 12 experimentos, arquitectura de confianza, hallazgos NEGATIVOS que obligaron a corregir la narrativa, estado real del producto y siguiente trabajo clasificado por lo que exige); `RAY_TRACING.md` reescrito como pipeline de extremo a extremo con convenciones, datum y límites numéricos declarados; OPEN_QUESTIONS auditada **pregunta a pregunta contra el código** (ninguna se resolvió programando: 8 ABIERTAS externas, 3 PARCIALES). Defectos documentales corregidos: la referencia «Sprint 10» de OQ #6 apuntaba al Sprint 10 de **V0** y hoy se lee como V1.10, que es otra cosa y sigue BLOCKED; OQ #8 prometía repetir la comparación A–C tras el tórico, imposible por construcción desde V1.6 (los objetivos escalares se RECHAZAN en sistemas tóricos) — el compromiso se cierra por imposibilidad declarada, que es más informativo que un número; recuento de tests obsoleto en el informe de V1.14. |
| V1.10 Predictores de literatura | **BLOCKED · EXTERNAL** | OPEN_QUESTIONS #2: sin publicación con coeficientes, no se implementa. **No lo bloquea trabajo interno**: el punto de extensión existe y está probado |

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
- Los experimentos deterministas (exp001/003/006/007/008/009/010/011/012/013/014/015) reproducen su `results.json` publicado.
- Ningún parámetro del motor procede de ajustar contra EVO.

---

<details><summary>Histórico V0 (cerrado 10/08/2026, 67 tests)</summary>

Sprints 0–12 DONE: baseline congelado, core científico, paraxial propio, ray tracer,
ojo completo, optimizador, sintéticos + sensibilidad (exp001–exp003), posición modular,
geometría ampliada (exp006), tórico independiente, Monte Carlo (exp004), benchmark
global (exp002/exp005), clinical readiness. Detalle en `PROJECT_PLAN.md` y
`docs/V0_REVIEW.md` (auditoría posterior con 10 hallazgos, todos cerrados en V0.5).

</details>
