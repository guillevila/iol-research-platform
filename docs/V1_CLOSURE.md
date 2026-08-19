# V1_CLOSURE — Qué es, qué hace y qué NO demuestra la plataforma al cerrar V1

**Versión:** 1.0 · **Fecha:** 19/08/2026
**RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING**

> Este documento está escrito para alguien que **no ha seguido los commits**. Si solo vas a
> leer tres ficheros, lee este, [`README.md`](../README.md) y
> [`docs/scientific/RAY_TRACING.md`](scientific/RAY_TRACING.md).

---

## 0 · Qué es esto, en una frase

Una **plataforma de investigación** en la que la potencia de una lente intraocular se elige
**trazando rayos por un modelo físico explícito**, con cada supuesto declarado y cada
resultado etiquetado como simulación — **no** es una calculadora clínica validada.

## 1 · Qué significa exactamente «V1 cerrada»

**V1 se cierra en su ALCANCE EJECUTABLE: 14 de 15 sprints resueltos; V1.10 permanece
BLOCKED por una dependencia científica externa.** No se escribe «15/15» ni «100 %», porque
sería falso.

| Estado | Sprints | Significado |
|---|---|---|
| **DONE** | V1.1, V1.2, V1.3, V1.4, V1.5, V1.6, V1.7, V1.8, V1.9, V1.11, V1.12, V1.13, V1.14, V1.15 (14) | criterios de aceptación cumplidos y verificados |
| **BLOCKED · EXTERNAL** | V1.10 (1) | no lo bloquea trabajo interno: falta una publicación citable |
| NOT DONE | ninguno | — |

**Por qué el alcance ejecutable puede cerrarse con V1.10 bloqueado.** V1.10 pedía
implementar predictores de posición **de literatura** (tipo C-constant y equivalentes). Sus
coeficientes no están en este repositorio, y la regla del proyecto prohíbe escribirlos de
memoria (OQ #2). Eso lo convierte en una dependencia del mundo exterior: **ninguna cantidad
de programación lo resuelve**. Todo lo que sí dependía de trabajo interno —el punto de
extensión, el contrato de CAPA B, la interfaz `predict()` con `inputs_used` y procedencia,
y la exigencia de `provenance` en construcción— **está construido y probado**, de modo que
implementar un predictor de literatura el día que exista la fuente es rellenar coeficientes
en una clase que ya existe (`LinearRegressionPredictor`), no abrir un sprint.

**Qué reabriría V1.10:** disponer de la publicación concreta (PDF/DOI) con su fórmula y su
tabla de coeficientes. Ese día V1.10 pasa de BLOCKED a ejecutable sin tocar arquitectura.

## 2 · Qué se construyó (por capacidades, no por número de sprint)

Lo que emergió no es una lista de sprints sino **una cadena de capas separadas**, donde cada
una puede fallar de forma explícita en vez de rellenar un hueco en silencio:

### 2.1 · Criterio óptico explícito

Con pupila finita **los rayos no cortan todos en el mismo punto**: «enfocar en la retina» no
está definido hasta que se dice qué se optimiza. La plataforma obliga a declararlo. Dos
criterios independientes conviven (`A` = mínimo RMS del spot en retina; `C` = desenfoque
equivalente nulo del mejor foco, en dioptrías) y **ninguno se declara preferible**. Un tercer
criterio del plan original (`B`) resultó ser **matemáticamente equivalente a C** como
criterio de optimización y se degradó a métrica reportada.

### 2.2 · Motor de trazado

Superficies **cónicas** (con tres estados de asfericidad que no se convierten entre sí en
silencio) y **bicónicas** para el tórico; **pose rígida 3D** de la LIO como vector
(descentración, tilt eje-ángulo, rotación) con transformadas rígidas que no duplican la
matemática de intersección; **muestreo de haz** con cuatro estrategias y convergencia medida;
**pérdidas de rayos contabilizadas**, nunca ocultas.

### 2.3 · Interpretación corneal con procedencia

La córnea puede interpretarse por política declarada (lectura queratométrica, radio físico
recuperado con el índice del dispositivo, tórica derivada o declarada). La política **viaja
en toda salida**, y las medidas corneales parciales se usan o se registran — nunca se
descartan en silencio.

### 2.4 · Predicción de posición como capa separada

La posición postoperatoria de la LIO es una **predicción biológica** (CAPA B), separada de la
física, con predictores intercambiables que declaran `inputs_used` y procedencia. Desde V1.11
incluye `EquatorialPlanePredictor`, que implementa la hipótesis **H_EQ** —(i) la LIO se
asienta en el ecuador capsular y (ii) ese ecuador se aproxima por ACD + LT/2 con residual
biológico ε_bio— **como hipótesis declarada, sin parámetros libres y sin calibrar**.

### 2.5 · Tórico físico y análisis 2D

El astigmatismo no se resume en un escalar: los objetivos escalares **se rechazan** en
sistemas tóricos, y en su lugar hay una métrica 2D que localiza las dos líneas focales y su
eje. La rotación tórica se modela **por física** (se rota la bicónica y se re-traza), y el
«error de rotación» es una magnitud **derivada**, jamás una entrada.

### 2.6 · Benchmark como contrato de comparabilidad

Dos comparaciones distintas y separadas: `CONTROLLED_PHYSICS` (misma física verificada
control a control) y `FULL_ENGINE` (divergencia entre motores, con sus diferencias listadas).
Una dimensión que un motor no soporta se marca `unsupported`, **nunca cero físico**.

### 2.7 · Incertidumbre con causalidad

Cada sigma exige `{sd, tipo, provenance}`. Las perturbaciones fluyen **por el predictor**
(medidas → posición → óptica), no se inyectan a mano. Las variables que la configuración no
consume se **rechazan por sonda de ejecución** en vez de desaparecer en silencio. Y se
separan dos preguntas que no son la misma: la incertidumbre del **resultado** con lente fija
(continua) y la **inestabilidad de la elección** de escalón (discreta).

### 2.8 · Rendimiento con identidad numérica

El motor es ~2× más rápido con **identidad bitwise** de toda salida científica, verificada
entre checkouts limpios. El trabajo científico (rayos, superficies, evaluaciones) queda
invariante; lo eliminado es trabajo de implementación.

## 3 · Matriz CAPACIDAD ↔ EVIDENCIA ↔ LIMITACIÓN

La tabla que impide confundir «tenemos un test» con «está validado clínicamente».

| Capacidad | Evidencia | Qué demuestra | Qué **NO** demuestra | Bloqueo |
|---|---|---|---|---|
| **Objetivo óptico explícito (A/C)** | `objective_equivalence.test.mjs`, exp008 | B≡C demostrado; A y C coinciden ≤0.0397 D con esferas | que A o C sea el criterio clínicamente correcto | cohorte postoperatoria (OQ #8) |
| **Superficies cónicas** | tests de conic (k=0≡esfera ≤1e-12, paraboloide y cartesiana exactos), exp009 | corrección matemática contra formas cerradas | que las Q usadas correspondan a lentes reales | fichas de fabricante (OQ #4) |
| **Pose 3D** | tests de pose (reversibilidad, ±pose, O(s²)), exp010 | consistencia geométrica y de simetrías | que los valores de tilt/descentración sean los reales de un ojo | datos postoperatorios |
| **Tórico físico + análisis 2D** | tests de biconic (recupera cónica a 1e-12), exp011, exp012 | consistencia física, simetrías y convergencia contra anclas vectoriales | acierto clínico ni geometría comercial | geometría de fabricante (OQ #4) + marcas↔ejes (OQ #11) |
| **Autoconsistencia pupila→0** | V1.13 sobre rejilla de 18 ojos, exp003 | que el trazado converge al paraxial del mismo sistema | que la divergencia a pupila finita sea «la apertura» y nada más | — |
| **Benchmark vs EVO** | exp002, exp005, legado congelado (102 hashes) | divergencia entre motores, medida y descompuesta | que un motor sea más exacto que el otro | ground truth clínico |
| **Atlas de divergencia** | exp013 | dónde y cuánto divergen paraxial y trazado, con contabilidad anti-sesgo | que la divergencia sea un error de uno de los dos | ground truth clínico |
| **Incertidumbre con causalidad** | tests de V1.12, exp014 | que la propagación respeta la causalidad y que las anclas nominal/lineal cuadran | que las sigmas sean distribuciones clínicas reales | repetibilidad citable + cohorte (OQ #6) |
| **Pipeline EQ (H_EQ)** | tests de V1.11, exp015 (27/27 celdas bit a bit) | que promover H_EQ a CAPA B es numéricamente neutro y que sus divergencias se descomponen por causa | **que H_EQ sea biológicamente cierta** | posición de LIO medida postoperatoria |
| **Rendimiento** | `performance_contract.test.mjs`, `perf_adversarial.test.mjs`, `bench/REPORT_V1_14.md` | ×2.07 con identidad bitwise entre commits limpios | que el motor sea rápido en términos absolutos ni en CI | — |

## 4 · Qué está validado, y a qué nivel

Tres niveles que **no deben mezclarse jamás**:

### Nivel 1 · Corrección matemática y de software — **SÍ**

Formas cerradas (la cónica cartesiana produce aberración esférica exactamente cero, el test
más sensible del trazador), simetrías (±pose, rotación +180° idéntica, +90° intercambia
meridianos), recuperación de casos límite (bicónica → cónica → esfera a 1e-12), invariantes
de contabilidad, 343 tests, 12 experimentos que reproducen su resultado **número a número** en
cada push, y equivalencia **bitwise** verificada entre checkouts.

### Nivel 2 · Comparación y autoconsistencia — **SÍ, y es lo que más se ha medido**

Convergencia trazado → paraxial con apertura → 0 sobre una rejilla de ojos; divergencia
paraxial ↔ trazado descompuesta por causa; EVO congelado como **benchmark**, nunca como
verdad ni como fuente de parámetros. Nada de esto dice cuál se acerca más a un paciente.

### Nivel 3 · Validación clínica — **NO. Ninguna.**

No existe una sola comparación contra refracción postoperatoria real, porque no hay cohorte.
`VALIDATION_STRATEGY.md` define el nivel 3 y los criterios **antes** de ver dato alguno,
precisamente para no elegirlos después.

## 5 · Qué NO demuestra V1 (sección deliberadamente prominente)

Al terminar V1 **sigue sin estar demostrado** que:

1. el motor **prediga mejor resultados clínicos** que ninguna otra calculadora;
2. el trazado de rayos sea **más exacto** que EVO, Barrett, Kane o cualquier fórmula — lo que
   se mide frente a ellas es **divergencia**, y medir divergencia no es medir acierto;
3. **H_EQ sea biológicamente cierta**, ni en su cláusula de asentamiento ni en la del proxy
   geométrico;
4. las **sigmas** usadas sean distribuciones clínicas reales: son escenarios declarados;
5. `GenericIOLFactory` represente **ninguna lente comercial**: es un sustituto declarado;
6. el objetivo óptico A o C sea el **clínicamente correcto**;
7. una **política corneal** sea superior a otra: solo se ha cuantificado su incoherencia interna;
8. una posición **predicha** sea una posición **medida** — no lo es, por definición;
9. un resultado **simulado** sea una **recomendación clínica**;
10. la asfericidad, el tilt o la descentración usados correspondan a los de un ojo real;
11. la córnea tórica trazada sea **medida**: hoy es derivada o declarada, y por eso ninguna
    pasa el modo STRICT;
12. los intervalos de incertidumbre publicados sean **intervalos de paciente**.

## 6 · Qué está bloqueado por el mundo exterior

Ninguno de estos se desbloquea programando (detalle en
[`OPEN_QUESTIONS.md`](scientific/OPEN_QUESTIONS.md)):

| Bloqueo | OQ | Impide |
|---|---|---|
| Publicación con coeficientes de predictores de posición | #2 | **V1.10** |
| Geometría real de LIO comerciales (radios, espesor, índice, Q) | #4 | atribuir un trazado a una lente concreta |
| Cohorte postoperatoria con refracción estabilizada | #7, #8 | elegir política corneal y criterio óptico |
| Posición de LIO medida postoperatoria | #3, #6 | validar H_EQ y calibrar cualquier predictor |
| Repetibilidad citable de dispositivo | #6 | convertir las sigmas declaradas en reales |
| Convenciones de datum entre dispositivos | #3 | consumir un EQ medido por OCT |
| Procedencia de la Q corneal (dispositivo, zona, convención) | #9 | que una Q «medida» sea comparable |
| Radios corneales per-meridiano medidos | #10 | una córnea tórica que pase STRICT |
| Relación marcas comerciales ↔ meridianos de la geometría | #11 | comparar con ejes de implantación reales |
| Cita bibliográfica de los índices de refracción | #1 | cerrar la procedencia del ojo de simulación |
| Distribución poblacional citable | #5 | agregados sobre sintéticos aleatorios |

## 7 · La arquitectura de confianza

Quizá lo más transferible del proyecto no es la física, sino **cómo se evita engañarse**.
Esto es infraestructura de **confianza científica**, y no es validación clínica:

| Mecanismo | Qué impide |
|---|---|
| **Legado EVO congelado** (102 hashes, verificado en Linux y Windows) | que el benchmark cambie bajo los pies |
| **Test de arquitectura** | que el motor importe nada del legado |
| **`provenance` en todo** | que un número aparezca sin saber de dónde vino |
| **`assumptions` registrados** | que un supuesto se confunda con un dato |
| **RESEARCH vs STRICT** | que un cálculo con huecos pase por completo |
| **UNKNOWN ≠ asumido** | que un hueco se rellene en silencio |
| **`unsupported` ≠ cero** | que «no lo sé» se publique como «vale cero» |
| **Contabilidad anti-sesgo-del-superviviente** | que los casos que fallaron desaparezcan del denominador |
| **Experimentos deterministas verificados en CI** | que un resultado publicado cambie sin que nadie lo note |
| **Revisiones adversariales por sprint** | que la narrativa sobreviva a los datos |
| **Equivalencia bitwise** | que una optimización cambie un resultado |
| **Presupuesto HARD/SOFT/CARACTERIZACIÓN** | que un umbral frágil se confunda con un invariante |

El patrón que persigue todo lo anterior es siempre el mismo: **«un valor plausible donde
debería haber un fallo explícito»**.

## 8 · Lo que V1 nos obligó a corregir (hallazgos negativos)

Un sistema que solo publica sus aciertos no es auditable. Estos son casos en los que los datos
contradijeron lo que creíamos, **con la corrección aplicada**:

| Creíamos | Encontramos | Dónde quedó |
|---|---|---|
| La comparación `CONTROLLED_PHYSICS` medía física | El paraxial evaluaba lente **delgada** y el trazado **gruesa**: ese término era ~100 % de la cifra publicada | V1.8: misma factory obligatoria en ambos motores |
| El muestreo del haz estaba convergido | Con `n_anillos = 5` la cuadratura **sobreestimaba \|ΔP\| ~7 %**, y el ancla pupila→0 no lo veía | V1.9: n_anillos 40 + bloque de convergencia |
| El ancla pupila→0 valida el trazado a pupila finita | Solo valida el límite: **no** demuestra que toda divergencia finita sea «la apertura» | declarado en exp013 y aquí |
| «H_EQ = ACD + LT/2» | Eso es el **proxy**, no la hipótesis; escrito así la vuelve irrefutable y deja a exp006 sin objeto | V1.11: enunciado en dos cláusulas separables |
| La no-linealidad de exp006 era despreciable porque la respuesta es lineal | Es despreciable por **cancelación** del término par en E\|·\| bajo perturbación simétrica; la respuesta **sí** está curvada (−0.087 D/mm²) | V1.11: publicado con la curvatura |
| El término cruzado ε_bio×ε_med era < 1e-6 D | Medido por cuadratura 2D: **1.3e-5 D**, un orden más, comparable al canal de no-linealidad | V1.11: cota medida, no estimada |
| Los canales de divergencia de exp015 estaban bien atribuidos | El de «linealización» era ~99 % **ruido del estimador** del ancla; el de «lente» ~100 % **cuantización del escalón**, con el efecto de lente puro de signo opuesto | V1.11: cuatro canales de un solo cambio |
| El cuello de botella de rendimiento estaría en construir geometría | Estaba en la **métrica de spot** y en una comprobación de finitud | V1.14: perfilar antes de optimizar |
| El primer benchmark de V1.14 medía bien | Era **asimétrico** (baseline sin instrumentar, final instrumentado) | V1.14: rehecho desde commits limpios |
| Una sigma declarada se propaga si está en la lista | `pupil_mm` era un **canal fantasma**: pasaba la sonda y moría en silencio | V1.12: perturbación real en ambas salidas |
| Reutilizar el haz entre extracciones Monte Carlo daría velocidad | El perfil demostró que `generateBundle` **ni aparece** entre los costes | V1.14: medir evitó optimizar algo inútil |

## 9 · Qué es hoy este proyecto, y qué no

**HOY ES** una plataforma de investigación y un motor óptico experimental: reproduce su
propia física, mide sus propias divergencias, declara sus supuestos y verifica que no cambian
sin avisar.

**HOY NO ES** una calculadora clínica validada. No debe usarse para decidir la potencia de
una lente en un paciente.

**Qué faltaría para cruzar esa frontera** (y es una lista de datos, no de código):

1. una **cohorte postoperatoria** con biometría preoperatoria completa, dispositivo
   identificado, lente implantada con geometría documentada y refracción estabilizada;
2. **geometría de fabricante** de las lentes usadas;
3. un **predictor de posición defendible**, calibrado sobre posición medida — no sobre
   refracción, que confunde los grados de libertad;
4. **validación temporal y externa**: criterios fijados antes de ver los datos
   (`VALIDATION_STRATEGY.md`), evaluación en cohorte distinta de la de ajuste;
5. ejecución en modo **STRICT**, donde ningún supuesto registrado atraviesa la puerta.

No se publica ningún porcentaje de «preparación clínica»: sería un número inventado.

## 10 · Qué debería hacerse a continuación

Sin inventar una «V2» ni poner fechas. Los bloqueos de mayor valor, clasificados por lo que
realmente exigen:

**A · Se puede hacer ya, con código y datos públicos**
- Posicionamiento de la LIO por **planos principales calculados** de la geometría, en lugar
  del centro geométrico con supuesto registrado (cierra la parte interna de OQ #3).
- Tercer criterio óptico genuinamente independiente (métrica robusta integrada en
  profundidad de foco), que solo tiene sentido ahora que asfericidad y pose existen (OQ #8).

**B · Requiere literatura o documentación externa**
- **V1.10**: predictores de literatura, en cuanto exista la publicación (OQ #2).
- Cita formal de los índices de refracción (OQ #1) y distribución poblacional citable (OQ #5).

**C · Requiere datos clínicos**
- Todo lo que decida entre políticas corneales (OQ #7), entre criterios ópticos (OQ #8) y
  todo lo que valide H_EQ o cualquier predictor (OQ #3, #6).

**D · Requiere colaboración con fabricante o dispositivo**
- Geometría comercial (OQ #4), radios per-meridiano medidos (OQ #10), relación marcas↔ejes
  (OQ #11) y procedencia de la Q corneal (OQ #9).

El orden natural no es A→D: **el trabajo de mayor valor está en C y D**, y es el que este
repositorio no puede hacer solo.

## 11 · Dónde está cada cosa

| Quiero… | Ir a |
|---|---|
| entender el motor de extremo a extremo | [`scientific/RAY_TRACING.md`](scientific/RAY_TRACING.md) |
| ver qué preguntas siguen abiertas y por qué | [`scientific/OPEN_QUESTIONS.md`](scientific/OPEN_QUESTIONS.md) |
| ver las limitaciones declaradas | [`scientific/LIMITATIONS.md`](scientific/LIMITATIONS.md) |
| entender cómo se validaría clínicamente | [`scientific/VALIDATION_STRATEGY.md`](scientific/VALIDATION_STRATEGY.md) |
| saber qué datos harían falta | [`scientific/CLINICAL_DATA_REQUIREMENTS.md`](scientific/CLINICAL_DATA_REQUIREMENTS.md) |
| ver el detalle sprint a sprint | [`V1_PROJECT_PLAN.md`](V1_PROJECT_PLAN.md) y [`../CURRENT_SPRINT.md`](../CURRENT_SPRINT.md) |
| ver los experimentos | [`../experiments/`](../experiments/) y la matriz de la sección 12 |
| ver el informe de rendimiento | [`../bench/REPORT_V1_14.md`](../bench/REPORT_V1_14.md) |

## 12 · Matriz de experimentos

Los 12 experimentos verificados en CI. **Todos son SIMULACIÓN**; ninguno contiene datos de
paciente. Las cifras son las de sus `results.json` publicados, no reinterpretaciones.

| id | Pregunta | Camino | Qué valida | Qué **NO** valida | Estado |
|---|---|---|---|---|---|
| **exp001** | ¿cuánta refracción mueve un mm de posición de LIO? | paraxial | la sensibilidad D/mm por tipo de ojo, base de todo lo demás | que la posición predicha sea la real | reproduce |
| **exp003** | ¿converge el trazado al paraxial con apertura → 0? | paraxial ↔ trazado | autoconsistencia del motor en el límite | nada sobre pupila finita | reproduce |
| **exp006** | ¿cuánto valdría medir el ecuador frente a inferirlo? | paraxial, condicional a H_EQ | aritmética del escenario declarado | **ningún beneficio clínico** — ver su [ERRATA](../experiments/exp006_capacidad_eq/ERRATA.md) | reproduce (congelado) |
| **exp007** | ¿depende la potencia de la convención de índice queratométrico? | paraxial | incoherencia interna cuantificada (hasta 1.26 D) | cuál política se acerca más a la realidad | reproduce |
| **exp008** | ¿difieren los objetivos A y C? | trazado | que con esferas coinciden ≤0.0397 D | cuál es el criterio correcto | reproduce |
| **exp009** | ¿separa la asfericidad de LIO los criterios A y C? | trazado | que no lo hace en \|Q\| ≤ 1 (0.015 D) | que esas Q sean de lentes reales | reproduce |
| **exp010** | ¿los separa la pose 3D? | trazado | que tampoco (0.0157 D) | que esos tilts sean los de un ojo real | reproduce |
| **exp011** | ¿reproduce el trazado tórico las anclas vectoriales? | trazado tórico 2D | consistencia física y de ejes (≤0.001 D) | acierto clínico ni geometría comercial | reproduce |
| **exp012** | ¿qué produce físicamente una LIO tórica rotada? | trazado tórico 2D | rotación por física; error de rotación derivado | distribución real de rotaciones | reproduce |
| **exp013** | ¿dónde divergen paraxial y trazado? | ambos, `CONTROLLED_PHYSICS` | atlas de divergencia con contabilidad anti-sesgo | que la divergencia sea error de uno | reproduce |
| **exp014** | ¿cómo se propaga la incertidumbre con causalidad? | trazado + V1.12 | anclas, convergencia, causalidad, inercia | que las sigmas sean reales | reproduce |
| **exp015** | ¿qué cambia al pasar H_EQ por la física completa? | cadena completa | 27/27 celdas bit a bit; divergencias por canal | **que H_EQ sea cierta** | reproduce |

*(exp002, exp004 y exp005 existen y son válidos, pero quedan fuera del verificador por coste:
exp002/exp005 consultan el benchmark congelado y exp004 es un Monte Carlo largo.)*

---

## Cómo leer cualquier cifra de este repositorio

1. Si compara con EVO u otra calculadora, es **divergencia**, no error ni acierto.
2. Si sale de un experimento, es **simulación** con parámetros declarados.
3. Si menciona una posición de LIO, es **predicha**, nunca medida.
4. Si menciona sigmas, son **escenarios declarados** salvo que citen una fuente.
5. Si una dimensión aparece como `unsupported`, significa **no calculada**, no cero.
6. Si un supuesto está en `assumptions`, es un supuesto **registrado**, no un dato.

**RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING**
