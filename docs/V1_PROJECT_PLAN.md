# V1_PROJECT_PLAN — Calculadora de LIO por trazado de rayos

**Versión:** 1.5 · **Fecha:** 18/08/2026 · **Base:** `v0.5-hardening-complete`
RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING

---

## 0. Qué cambia respecto a V0

V0 tiene un motor **paraxial** que elige potencia buscando en una rejilla la que deja la
refracción prevista más cerca de la diana. Tiene también un trazador de rayos, pero solo
se usa para **validar** el paraxial, no para decidir.

V1 invierte eso: la potencia se elige **trazando rayos**, y el criterio de "mejor" deja de
ser implícito. Eso obliga a decidir explícitamente algo que el paraxial esconde:

> Cuando la pupila no es infinitesimal, **los rayos no cortan todos en el mismo punto**.
> No existe "el foco". Hay que decir qué se está optimizando.

Ese es el contenido real de V1, y por eso `OpticalObjective` es lo primero que se
construye. Todo lo demás (superficies cónicas, tilt, tórico) son ingredientes que solo
tienen sentido una vez que existe un criterio explícito al que alimentar.

## 1. Restricciones vigentes (heredadas, no negociables)

1. **El motor no depende de EVO.** EVO es benchmark, control y legado congelado.
   Verificado por `tests/architecture.test.mjs`; la CI lo comprueba en cada push.
2. **Ningún parámetro se calibra contra EVO.** Ni índices, ni ratios, ni offsets.
3. **No se inventa geometría de LIO.** Sin ficha de fabricante → `geometry_status =
   UNKNOWN` → el trazado **falla**, no sustituye.
4. **Toda simulación se etiqueta** `SIMULACION / NO GROUND TRUTH CLINICO`.
5. **Terminología:** frente a EVO se mide **divergencia**, nunca *error*. Medir
   divergencia no es medir acierto.
6. **DONE exige criterios de aceptación cumplidos**, no que el código compile.
7. Ante un bloqueo científico (falta dato, geometría, índice o coeficiente): **no
   extrapolar; registrar la limitación** en OPEN_QUESTIONS.

## 2. Riesgo principal de V1, y cómo se controla

Un trazador con más grados de libertad (asfericidad, tilt, descentración, pupila, tórico)
es **más fácil de equivocar y más difícil de auditar** que un paraxial. Con suficientes
parámetros libres, cualquier resultado es alcanzable — y parecería justificado.

Tres controles, aplicados en todos los sprints:

- **Autoconsistencia pupila→0 (V1.13).** Con apertura tendiendo a cero, el trazado debe
  converger al paraxial **sobre toda la rejilla de ojos**, no en un caso suelto. Cualquier
  divergencia que no desaparezca al cerrar la pupila es un defecto, no un fenómeno.
- **Cada grado de libertad nuevo entra apagado por defecto.** Asfericidad, tilt y
  descentración valen `UNKNOWN` mientras no haya dato o ficha; activarlos exige
  declararlos. Un grado de libertad sin procedencia no puede influir en un resultado.
- **Ningún objetivo óptico se elige por dar mejores números.** Los criterios
  independientes se implementan, se comparan entre sí, y la elección queda abierta hasta
  tener datos postoperatorios.
- **Modo de fidelidad (desde V1.2).** `RESEARCH` (defecto) permite sustituir un UNKNOWN
  ópticamente relevante por un supuesto EXPLÍCITO y registrado en la salida; `STRICT`
  convierte cada supuesto registrado en un error que enumera qué faltó — es el modo en
  el que deberá ejecutarse la validación clínica (nivel 3 de VALIDATION_STRATEGY). La
  puerta es el propio registro de supuestos (`src/core/fidelity.mjs`): ningún supuesto
  registrado puede atravesarla; que todo supuesto esté registrado es disciplina vigilada
  por tests diferenciales, no un teorema. STRICT no es aún el defecto (decisión del
  encargo). La vía paraxial completamente medida pasa STRICT desde su introducción, y
  desde V1.2 también el PRIMER trazado de rayos (córnea y LIO con todas sus Q
  medidas/documentadas); sin esas Q, el trazado bloquea con la superficie nombrada — y
  que lo diga con nombres es la funcionalidad.

## 3. Sprints

### V1.1 · `OpticalObjective` + `RaytracePowerOptimizer` — *núcleo*

Interfaz de objetivo óptico con dos implementaciones independientes, ambas sobre el mismo trazado:

| Objetivo | Criterio | Qué privilegia |
|---|---|---|
| **A · Mínimo RMS en retina** | minimiza el radio RMS del spot **en el plano retiniano** | nitidez en el plano real de la imagen |
| **C · Desenfoque equivalente nulo** | lleva el plano de mejor foco a la retina, con coste en dioptrías | coincidencia foco↔retina, en la unidad clínica |

> **Revisión pre-V1.2.** El plan original enumeraba un tercer criterio, B (mejor foco
> sobre la retina, coste en mm). La revisión demostró que **B ≡ C como criterios de
> optimización**: mismo argmin, ambos derivados de la misma computación de mejor foco,
> distinta unidad de coste (demostración en `objective.mjs`; tests en
> `objective_equivalence.test.mjs`). Mantener los tres habría sido conservar una
> redundancia por fidelidad a la especificación. B es ahora métrica reportada
> (`detail.desplazamiento_mm`). Un tercer criterio genuinamente independiente
> (métrica robusta integrada en profundidad de foco) queda registrado en
> OPEN_QUESTIONS #8 para cuando la asfericidad/tilt rompan la simetría actual.

A y C no son equivalentes en presencia de aberración esférica: A penaliza la aberración,
C la ignora si el foco cae donde debe (exp008 mide la separación). **No se declara
ninguno preferible.** El optimizador acepta el objetivo como parámetro.

Criterios de aceptación:
- los objetivos coinciden entre sí y con el paraxial dentro de 10⁻³ D cuando la
  apertura → 0 (si no coinciden, hay un defecto: sin aberración no hay diferencia posible);
- con apertura clínica difieren de forma **medida y reportada**, no supuesta;
- el optimizador devuelve la potencia continua y la de catálogo, con su segunda opción;
- cada potencia candidata construye **su propia geometría** (invariante de P0.2);
- test: una lente comercial `UNKNOWN` hace fallar el optimizador, no lo degrada a genérica.

### V1.2 · Superficies cónicas
`z = c·r²/(1 + √(1 − (1+k)c²r²))`. La asfericidad distingue TRES estados y ninguno se
convierte en otro en silencio: `k` numérico documentado → superficie cónica;
`ASSUMED_SPHERICAL` → esfera por SUPUESTO DECLARADO (la genérica de simulación);
`UNKNOWN` → esfera con el supuesto REGISTRADO en la salida (`assumptions`), nunca
convertido tácitamente en Q=0.
Aceptación: con `k = 0` coincide con la esfera a precisión de máquina (≤1e-12 mm en
intersección, normal y foco — son fórmulas distintas, la identidad bit a bit no es
demostrable ni necesaria); con `k = −1` (parábola) el cruce de cada rayo coincide con la
solución cerrada; la cónica CARTESIANA `k = −(n1/n2)²` produce foco PERFECTO (aberración
esférica exactamente cero — el test más sensible a errores de sagita o normal); ninguna
lente comercial recibe un `k` inventado (OPEN_QUESTIONS #4); el estado de asfericidad de
cada superficie es auditable en la salida; y el criterio de salida añadido: el PRIMER
trazado ejecutable en STRICT cuando córnea y LIO tienen todas sus Q medidas/documentadas,
manteniendo pupila→0 → paraxial para todo k.

### V1.3 · Tilt y descentración — pose rígida de la LIO
La pose es un VECTOR, no dos escalares: `iol_pose` con descentración (x,y), tilt como
vector eje-ángulo (tx,ty) y `rotation_z` aplicada primero en el marco local (convención
fijada entonces para el tórico; inerte en superficies de revolución — ACTIVA desde
V1.6 con caras bicónicas, donde es el eje de implantación del cilindro). Las
superficies se colocan por transformación rígida global↔local SIN duplicar la matemática
de esfera/cónica (`transformedSurface` reutiliza la intersección de la base).
Aceptación (ejecutada): pose CERO reproduce V1.2 **estructuralmente** (sin envoltorio);
la puerta pupila→0 coaxial NO se aplica a sistemas posados (se rechaza con guía) y se
sustituye por: reversibilidad de Snell sobre superficies transformadas, casos analíticos
independientes (esfera girada sobre su centro ≡ invariante; descentración ≡ traslación;
lámina inclinada con desplazamiento cerrado), simetría ±pose (con cuadratura
180°-simétrica), continuidad/paridad pose→0 (O(s²) donde es teorema, eje a eje) y
ausencia de pérdidas artificiales (tilt ≤ 10°, descentración ≤ 1 mm). El paraxial
RECHAZA la pose (no puede representarla); el muestreo MERIDIONAL se rechaza con pose
(un corte de un sistema asimétrico). Los antiguos escalares son error de migración.

### V1.4 · `RayBundleGenerator`
Muestreo de pupila (anillos concéntricos, espiral de Fibonacci, malla cuadrada) con
número de rayos declarado. Aceptación: el resultado converge al aumentar el número de
rayos, y la **tasa de convergencia se mide**. NOTA (corregida dos veces — V1.7 y la
revisión adversarial de V1.8): `pupil_mm` del OJO **sigue en `reserved.mjs`**. V1.8
creó `benchCase.pupil_mm`, un HOMÓNIMO de escenario declarado con procedencia, que sí
alimenta la apertura del trazado por caso; la pupila MEDIDA del preoperatorio sigue
almacenada y sin consumir, y ninguna ruta la mapea a la apertura.

### V1.5 · Córnea física en el trazado — cierre formal del contrato política↔trazador
El trazador ya consumía las políticas (V1.2/V1.3): V1.5 NO reescribe la córnea de dos
superficies — VERIFICA formalmente el contrato, por política: paraxial y trazado consumen
EXACTAMENTE la misma interpretación (mismo modelo corneal, superficies que reproducen su
potencia de forma cerrada), la política y su procedencia viajan en la salida de ambas
vías, ninguna posterior se fabrica en silencio (READING/SINGLE no construyen posterior;
RATIO la construye SOLO con ratio+procedencia citada y el supuesto registrado; MEASURED
con medidas y registro vacío), y STRICT es diferencial por política también en el
trazador. Distinción explícita: toda córnea física actual es ROTACIONALMENTE SIMÉTRICA
(`rotationally_symmetric: true`); la córnea física ASTIGMÁTICA no existe hasta V1.6.
Además: procedencia de POSE (PoseSource: MEASURED/PREDICTED/DECLARED_SCENARIO/
DEFAULT_CENTERED) para que la validación futura distinga pose observada de predicha.

### V1.6 · Trazado tórico
**REQUISITO PREVIO (registrado en V1.5):** un sistema tórico NO puede reducir el spot a
un RMS escalar ni a un mejor foco axial — dos líneas focales y un eje no caben en un
número. Antes de usar el trazado para optimización tórica debe existir una descripción
2D del spot (matriz de SEGUNDO MOMENTO con ejes principales y orientación, o métrica
equivalente que CONSERVE el astigmatismo y su eje). Prohibido forzar el tórico dentro
de los objetivos escalares actuales (A o C) — la reducción a escalar destruye SIEMPRE
el eje, no solo a veces (también registrado en objective.mjs, sin condicional).
Contenido (EJECUTADO — especificación matemática explícita, no "dos radios
principales" a secas): primitiva **biconicSurface** (`raytrace/surfaces.mjs`) con
sagita `z = (cx·x² + cy·y²) / (1 + √(1 − (1+Qx)·cx²·x² − (1+Qy)·cy²·y²))` —
curvaturas principales y constante cónica POR MERIDIANO; intersección por Newton
SALVAGUARDADO con horquilla (la bicónica no es cuádrica: sin forma cerrada), normal
analítica, dominio de apertura validado al construir. Recupera `conicSurface` con
Rx=Ry y Qx=Qy: estructural en la fórmula y verificado a 1e-12 contra el algoritmo
CERRADO de la cónica (dos algoritmos independientes; también la esfera, y el cilindro
cx=0 contra su foco cerrado). Métrica 2D (`raytrace/astigmatism.mjs`): matriz de
segundo momento M(z) = M0 + M1·z + M2·z², EXACTA tras la última superficie, analizada
como autoproblema GENERALIZADO det(M1/2 + z·M2) = 0 → dos focos principales con sus
meridianos, extraídos de la estructura global del haz — jamás de un plano donde el
spot sea casi circular; caso degenerado explícito (astigmatic:false + razón, nunca un
eje arbitrario). Convención documentada: meridiano de potencia ⊥ línea focal; eje
clínico minus-cyl = meridiano PLANO (trampa de 90° con test propio). Etiqueta ≠
geometría: `SyntheticToricIOLFactory` es la ÚNICA vía etiqueta→radios y se declara
(sustituto DERIVED_GENERIC); cylinder_d sin cara tórica declarada → rechazo; córnea
tórica solo por política explícita (`toric_cornea.mjs`: FROM_K = radios RECUPERADOS
por meridiano — "NO es una córnea astigmática medida" viaja en su procedencia — o
DECLARED con cita; OQ #10 registra por qué ninguna pasa STRICT).
Aceptación (EJECUTADA, tests/biconic + astigmatism + toric_trace): Rx=Ry reproduce la
esférica/cónica a 1e-12; intercambio Rx↔Ry + rotación 90° → mismo conjunto de puntos;
periodicidad de eje 180°; ejes arbitrarios (17°/35°/63.4°/121°… error 0° en exp011);
pupila→0 → cilindro/eje coinciden con los anclas paraxiales POR MERIDIANO (sistemas
de revolución equivalentes, maquinaria V1.2) y el residual con la composición
VECTORIAL completa (≤0.001 D en exp011); córnea sola, LIO sola y combinadas validadas
POR SEPARADO; STRICT bloquea toda geometría tórica inventada (sintética, FROM_K,
DECLARED) y solo pasa la de fabricante documentada; objetivos escalares GUARDADOS
(`evaluateObjective` rechaza `toric: true`); el residual de dos cilindros iguales
sigue 2C|sen θ| (candado algebraico, ver V1.7). exp011.

### V1.7 · Rotación tórica (EJECUTADO: `src/toric/toric_rotation.mjs`, exp012)
**SIN `toric_rotation_deg`** (corrección a petición, antes de implementar): ese
escalar fue ELIMINADO del modelo en V1.3 y NO se reintroduce — la frase anterior de
esta sección ("sale de reserved.mjs") era una inconsistencia: el estado físico de
orientación de la LIO ya vive en `iol_pose.rotation_z_deg`, ópticamente ACTIVO sobre
las caras bicónicas desde V1.6. Un segundo escalar de rotación sería un segundo grado
de libertad geométrico para el mismo estado físico.

TRES CONCEPTOS SEPARADOS (ninguno se confunde con otro):
1. **eje/orientación PLANIFICADA** — dónde se pretendía dejar el meridiano potente de
   la geometría de la LIO (dato de planificación, mod 180; no toca la geometría);
2. **orientación física postoperatoria** — `pose.rotation_z_deg`, el ÚNICO grado de
   libertad geométrico (meridiano potente físico = 90° + rotation_z, convención de
   fábrica en y local);
3. **error de rotación** — diferencia angular DERIVADA entre (2) y (1), mod 180,
   firmada en (−90°, 90°]: positivo = sentido de +rotation_z (regla de la mano
   derecha sobre +z; el mapeo horario/antihorario clínico exige lateralidad, OQ #3).
   JAMÁS es entrada geométrica.

Motor = FÍSICA: modificar `pose.rotation_z_deg`, rotar de verdad la geometría
bicónica (`transformedSurface`, orden ya fijado `R_tilt · Rz` — ninguna rotación
nueva), volver a trazar y extraer el residual con el análisis astigmático 2D
(astigmatism.mjs). `2C·|sen θ|` NO es motor de predicción: es ancla analítica para
cilindros IGUALES en el límite paraxial (en doble ángulo |1 − e^{i2θ}| = 2|sen θ|;
la fórmula C·|sen 2θ| que hubo aquí era errónea — a 30° el residual es C entero, a
90° es 2C). El caso GENERAL se valida contra la RESTA VECTORIAL completa como segunda
ancla independiente, nunca contra fórmula simplificada.

Aceptación (EJECUTADA, tests/toric_rotation.test.mjs + exp012): orientación 0
reproduce V1.6 (igualdad EXACTA: el módulo delega); +180° reproduce la misma óptica;
+90° intercambia los meridianos; ±θ cumplen las simetrías de sistema centrado
(módulos iguales, meridianos espejados); pupila→0 converge a la resta vectorial
(≤0.0009 D en exp012) y con módulos EFECTIVOS igualados a 2C·|sen θ| (≤0.00123 D; a
30° la fracción de C es 0.9999 y a 90° 1.9997 — lo que la fórmula errónea negaba); a
pupila finita la divergencia frente al vectorial se REPORTA (≤0.113 D en exp012),
nunca se llama error; la combinación rotación + tilt + descentración produce
exactamente los mismos números que el pipeline manual (delegación verificada: ninguna
rotación nueva); una entrada `rotation_error_deg` se RECHAZA nombrándola (el error es
derivado, no un grado de libertad).

DISTINCIÓN EXPLÍCITA de tres ejes que no son el mismo: eje de la GEOMETRÍA tórica
(meridiano potente, convención del proyecto), eje CLÍNICO minus-cylinder (meridiano
plano del residual, astigmatism.mjs) y MARCAS/eje de implantación de una LIO
comercial — la correspondencia marca↔geometría exige documentación del fabricante y
NO se asume (OPEN_QUESTIONS #11).

**La distribución real de rotaciones sigue bloqueada** (OPEN_QUESTIONS #6): solo se
admiten escenarios declarados.

### V1.8 · `RaytraceEngine` en el benchmark (EJECUTADO — contrato de COMPARABILIDAD)
No un wrapper: un contrato auditable (`src/bench/engines/raytrace_engine.mjs`,
`src/bench/comparisons.mjs`; a petición).
- **Honestidad tórica**: el motor traza tórico (V1.6/V1.7) pero el optimizador busca
  solo potencia EE con objetivos escalares — un caso ASTIGMÁTICO declara
  `unsupported_dimensions: ['toric']` con campos NULL. `PredictionResult` extendido de
  forma mínima y compatible, con VALIDACIÓN: UNSUPPORTED con valores que parezcan
  físicos = rechazo; null sin declaración = rechazo. `ParaxialEngine` sin catálogo
  tórico sobre caso astigmático: mismo contrato.
- **Inyección explícita total**: positionPredictor, IOLFactory, objective, sampling,
  search_d/catálogo, política corneal, fidelity y pupila son OBLIGATORIOS de
  construcción. `iol_model`/`a_constant` = entradas ESPECÍFICAS DE EVO, reportadas
  como ignoradas con nombre (jamás derivan geometría); `sia_d` = entrada tórica
  UNSUPPORTED; campos desconocidos del caso = rechazo nombrándolos; `target_d ≠ 0` =
  rechazo (el objetivo escalar optimiza emetropía; no se finge restando).
- **Pupila de primer nivel** (V1.9): `benchCase.pupil_mm` + `pupil_source`
  (procedencia OBLIGATORIA, rango plausible 1–10 mm) o pupila declarada en la
  construcción — JAMÁS el defecto silencioso de 3 mm, y SIN precedencia tácita (un
  conflicto motor↔caso se rechaza); STRICT conserva su semántica. `pupil_mm` del OJO
  sigue RESERVADO: el del escenario es un homónimo con otra procedencia, y nada mapea
  todavía la pupila medida del preoperatorio a la apertura.
- **Dos comparaciones separadas**: CONTROLLED_PHYSICS (Paraxial↔Raytrace, controles
  VERIFICADOS sobre las salidas — mismo position_source, misma posición, misma
  política corneal, **misma LENTE GRUESA de la misma factory** y misma diana, o
  rechazo — aísla el modelo óptico; con pupila→0 la divergencia es ~0. La corrección
  de la lente vino de la revisión adversarial: con el paraxial evaluando una lente
  DELGADA, el término de geometría era ~100 % de la cifra publicada. La potencia
  RECOMENDADA solo se compara si ambos conjuntos de potencias implantables coinciden;
  si no, se compara la CONTINUA y se declara por qué) y FULL_ENGINE
  (Raytrace↔EvoReplica: DIVERGENCIA ENTRE MOTORES con la lista de diferencias de
  configuración que impiden atribuirla a una causa). Las refracciones previstas NO se
  restan: gafa (paraxial/EVO) vs desenfoque equivalente (trazado) son convenciones
  DISTINTAS declaradas.
- **Trazabilidad para reproducir**: predictor/position_source, factory +
  geometry_status/provenance, objetivo, pupila+procedencia, sampling+rayos, política
  corneal, fidelity, pose, supuestos_trazado, potencia continua/catálogo/segunda
  opción, search_d/tol, target.
Aceptación (ejecutada, tests/bench_raytrace.test.mjs): pupila→0 + pose cero convergen
al ancla paraxial del sistema controlado; adapter ≡ pipeline directo (igualdad
exacta); ningún input se pierde; UNKNOWN = fallo, no sustituto; STRICT atraviesa
(bloquea enumerando Y pasa con córnea medida por el caso + fabricante documentada);
cambiar solo pupil_mm cambia solo lo esperado; sin "error frente a EVO" ni
superioridad; UNSUPPORTED jamás como cero físico.

### V1.9 · Atlas de divergencia (EJECUTADO: `src/bench/divergence.mjs`, exp013)
Experimento interpretable, no una tabla grande de diferencias. **Pregunta primaria:**
con posición, córnea y lente IDÉNTICAS, ¿dónde y cuánto diverge la potencia óptima
CONTINUA al sustituir la aproximación paraxial por trazado exacto a apertura finita?
Dos análisis COMPLETAMENTE separados:

- **A · CONTROLLED_PHYSICS (principal).** Rejilla declarada AL × K × pupila sobre casos
  ESFÉRICOS (con astigmatismo, la dimensión tórica UNSUPPORTED contaminaría la
  pregunta). Métrica primaria ΔP = P_raytrace − P_paraxial en potencia CONTINUA — la
  cuantización no se mezcla con la física; la decisión de catálogo se reporta aparte y
  SOLO con discretización exactamente idéntica. Los seis controles de V1.8 se verifican
  por celda. Ancla de apertura→0 en la propia rejilla. La monotonía en pupila se
  OBSERVA (series no monótonas y cambios de signo se reportan), no se impone.
- **B · FULL_ENGINE (secundario, descriptivo).** DIVERGENCIA ENTRE MOTORES frente al
  benchmark congelado, con la lista V1.8 de canales de configuración distintos; sin
  atribuir nada al trazado, sin restar refracciones de convenciones distintas, y
  separando saturación/cuantización de catálogo.

**Regla contra el sesgo del superviviente:** cada combinación INTENTADA aparece con su
estado; los estadísticos van SIEMPRE con `n_intentados`/`n_comparables`/`n_rechazados`
y motivos CLASIFICADOS (search/catalog/grid boundary, EVO fuera de dominio,
geometría, fidelity, control violado…). Una región con muchos rechazos es un
resultado. Las bandas de |ΔP| (<0.05 / 0.05–0.10 / 0.10–0.25 / ≥0.25 D) son
DESCRIPTIVAS: no son umbrales de relevancia clínica y de ellas no se deduce beneficio.

El MUESTREO es un parámetro declarado y VERIFICADO (bloque de convergencia): con 5
anillos la cuadratura sobreestimaba |ΔP| ~7 %, y el ancla apertura→0 NO detecta ese
sesgo — el ancla solo excluye artefactos INDEPENDIENTES de la apertura. La atribución
"paraxial vs trazado" queda ACOTADA, no aislada: al cambiar de modelo cambia también
el criterio de foco, y el bloque de sensibilidad al criterio publica esa cota.

Aceptación (ejecutada, tests/divergence.test.mjs + exp013): ningún mapa mezcla lente
delgada/gruesa (se rechaza y se cuenta); ningún default de pupila reaparece; AL/K/pupila
viajan sin redondear ni intercambiarse; los rechazos no desaparecen de los denominadores
(y con cero comparables los estadísticos son `null`, no cero); la cuantización no se
interpreta como física; ninguna clave se llama `error` y ninguna salida afirma acierto o
superioridad; el ancla de apertura→0 converge dentro de la tolerancia de V1.8.
**Fuera de alcance declarado:** tórico, tilt/descentración y Q multidimensional — primero
el atlas limpio del sistema centrado. Las fronteras observadas se registran como
CANDIDATOS a estudio posterior, no como conclusiones.

### V1.10 · Predictores de posición
Solo los que tengan fuente citable. Aceptación: `LiteraturePositionPredictor` únicamente
con la publicación delante (OPEN_QUESTIONS #2); **sin fuente, no se implementa**.

### V1.11 · Pipeline de equivalente esférico
Cierre de la cadena completa con el trazador. Aceptación: reproduce exp006 y explica las
diferencias.

### V1.12 · Incertidumbre sobre trazado (EJECUTADO: src/uncertainty/raytrace_uncertainty.mjs, exp014)
NO es un port del Monte Carlo paraxial: arquitectura nueva elegida por las invariantes.
- **Sigmas con procedencia y tipo obligatorios** ({ sd, tipo ∈ declarada/ficha_tecnica/
  medida, provenance ≥ 10 }): un número suelto se rechaza. Sin fuentes reales (OQ #6),
  todo es 'declarada' y el resultado lo dice.
- **Causalidad real**: cada extracción perturba las MEDIDAS, re-ejecuta el PREDICTOR
  de posición sobre el ojo perturbado y solo entonces añade el residual PROPIO del
  predictor (position_prediction_mm). La descomposición de la posición viaja declarada
  contra el doble conteo.
- **Variables inertes prohibidas POR EJECUCIÓN**: sonda determinista antes de extraer —
  una sigma que no cambia el resultado (K con radios medidos, CCT con córnea de
  lectura, ACD con un predictor que no la usa) se rechaza nombrándola.
- **Dos preguntas, dos salidas**: incertidumbre del RESULTADO con LIO fija
  (distribución continua del desenfoque residual) e INESTABILIDAD DE LA ELECCIÓN
  (distribución discreta sobre escalones, con la censura fuera-de-ventana VISIBLE en
  el denominador — corrección conceptual del sprint: descartar el borde truncaría las
  extracciones extremas y sesgaría las fracciones).
- **Correlaciones**: independencia DECLARADA por defecto; matriz explícita con
  procedencia vía Cholesky (no-PSD rechazada).
- **Anclas y convergencia**: la extracción cero reproduce el nominal EXACTAMENTE; la
  sd MC se compara con la propagación lineal gᵀΣg (derivadas por diferencias centradas
  a través del pipeline completo, predictor incluido); cortes de convergencia con SE.
- seed + intentados/válidos(decididos)/rechazados + motivos clasificados en la salida;
  tórico jamás como cero físico (astigmático ⇒ unsupported declarado; LIO tórica ⇒
  rechazo). El MC paraxial se conserva como escenario declarado de posición fija, con
  puntero a esta arquitectura.
Aceptación (ejecutada, tests/raytrace_uncertainty.test.mjs + exp014): anclas exactas y
ratio MC/lineal ≈ 1; aditividad en cuadratura MEDIDA (ratio 0.998), no asumida;
causalidad demostrada (la misma σ_AL con dos predictores produce derivadas distintas);
inercia publicada como resultado; elección nominal conservada solo el 30.2 % del
escenario mientras el resultado tiene sd 0.66 D — dos preguntas genuinamente distintas.
Caza adversarial aplicada (multirrevisor): copia COMPLETA del ojo perturbado (la
enumerada perdía 11 campos medidos), pupil_mm perturbable de verdad en las DOS salidas,
censura advertida (`advertencia_censura`), RNG local mulberry32 (LCG del proyecto infla
varianza 1.3–2.8 %, medido), pareo de semillas por clave ordenada, SUB-RESOLUCIÓN ≠
INERCIA con pasos de contraste dentro de plausibilidad, procedencia exacta por sigma en
exp014 (dos eran nuevas de V1.12, no de exp004), réplicas de semilla independiente
junto a los prefijos anidados, lectura de correlación derivada de los SIGNOS reales
(en el escenario publicado son opuestos: ρ > 0 REDUCE la sd), y pupila MEDIDA del ojo
registrada como no consumida en la salida (`pupila`).

### V1.13 · Autoconsistencia pupila→0 sobre rejilla — *puerta de corrección*
El control central del apartado 2, ejecutado sobre toda la rejilla de ojos sintéticos.
Aceptación: **ningún** ojo de la rejilla diverge más de 10⁻³ D con apertura → 0.

### V1.14 · Rendimiento
El trazado es ~10³ veces más caro que el paraxial. Aceptación: presupuesto de tiempo
declarado por experimento; sin optimización que altere resultados (cualquier cambio de
resultado por rendimiento es un defecto, no una mejora).

### V1.15 · Documentación
`RAY_TRACING.md` ampliado, `V1_CLOSURE.md`, OPEN_QUESTIONS actualizado.

## 4. Orden de ejecución

V1.1 → V1.13 → V1.4 → V1.2 → V1.3 → V1.5 → V1.6 → V1.7 → V1.8 → V1.9 → V1.12 → V1.11 → V1.14 → V1.15

V1.13 se adelanta deliberadamente al segundo puesto: la puerta de corrección debe existir
**antes** de añadir grados de libertad, no después. V1.10 queda fuera del orden porque está
bloqueado por una fuente externa, no por trabajo.

## 5. Lo que V1 seguirá sin poder afirmar

Trazar rayos no genera datos clínicos. Al terminar V1 seguirá siendo cierto que:

- ningún resultado es una predicción clínica validada;
- no hay comparación de **acierto** con EVO ni con ninguna fórmula, solo divergencia;
- ningún trazado es atribuible a una lente comercial sin ficha de fabricante;
- la elección entre objetivos ópticos, entre políticas corneales y entre predictores de
  posición **sigue abierta** hasta tener cohorte postoperatoria.

Un modelo más detallado no es un modelo más validado. V1 mejora la **capacidad de
representar**; la capacidad de **acertar** sigue esperando datos.
