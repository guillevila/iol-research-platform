# V1_PROJECT_PLAN — Calculadora de LIO por trazado de rayos

**Versión:** 1.0 · **Fecha:** 10/08/2026 · **Base:** `v0.5-hardening-complete`
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
fijada para el tórico V1.7; hoy exactamente inerte en superficies de revolución). Las
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
rayos, y la **tasa de convergencia se mide**; `pupil_mm` del ojo puede alimentar la
apertura (sale de `reserved.mjs`).

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
Contenido: superficies tóricas reales (dos radios principales) en la LIO y córnea física
ASTIGMÁTICA (per-meridiano — hasta aquí toda córnea física es rotacionalmente simétrica).
Aceptación: con los dos radios iguales reproduce la esférica exactamente; el astigmatismo
trazado coincide con el vectorial de doble ángulo en el límite paraxial; la métrica 2D
existe y sus ejes principales recuperan el eje del cilindro en casos construidos.

### V1.7 · Rotación tórica
Penalización del residual por rotación respecto al eje diana. Aceptación: rotación 0
reproduce V1.6; el residual crece con |sen(2·rotación)| como predice el álgebra vectorial.
`toric_rotation_deg` sale de `reserved.mjs`. **La distribución real de rotaciones sigue
bloqueada** (OPEN_QUESTIONS #6): solo se admiten escenarios declarados.

### V1.8 · `RaytraceEngine` en el benchmark
Adaptador al contrato de `src/bench/interface.mjs`, junto a `ParaxialEngine` y `EvoEngine`.
Aceptación: terminología **divergencia**; ninguna salida afirma superioridad.

### V1.9 · Análisis de divergencia
Mapa trazado ↔ paraxial ↔ EVO sobre rejilla declarada, por regiones (AL corta/larga, K
plana/curva, pupila). Aceptación: cada celda reporta su n y su dispersión; se identifica
**dónde** el trazado aporta información que el paraxial no tiene, sin afirmar que acierte
más.

### V1.10 · Predictores de posición
Solo los que tengan fuente citable. Aceptación: `LiteraturePositionPredictor` únicamente
con la publicación delante (OPEN_QUESTIONS #2); **sin fuente, no se implementa**.

### V1.11 · Pipeline de equivalente esférico
Cierre de la cadena completa con el trazador. Aceptación: reproduce exp006 y explica las
diferencias.

### V1.12 · Incertidumbre sobre trazado
Monte Carlo con sigmas **etiquetadas por procedencia** (declarada / ficha técnica / medida).
Aceptación: ninguna sigma sin procedencia; el resultado indica de qué tipo son.

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
