# V1.14 — Rendimiento del motor: informe de medición

**Versión:** 1.0 · **Fecha:** 19/08/2026 · RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING

> **UNA OPTIMIZACIÓN QUE CAMBIA UN RESULTADO NO ES UNA OPTIMIZACIÓN. ES UN CAMBIO DE MODELO.**
> Todo lo que sigue está sujeto a esa regla, y la regla se hace cumplir por máquina:
> `bench/equivalence.mjs` contra `bench/baseline_v114.json`, más el contrato de
> `tests/performance_contract.test.mjs`.

## Por qué este informe no es un experimento

Los `experiments/` de este proyecto son artefactos científicos deterministas:
`scripts/check_experiments.mjs` exige que su `results.json` se reproduzca **número a número**
en cada push. Un tiempo de pared no puede cumplir eso —depende de la máquina, del runner y
del JIT— y meterlo ahí haría irreproducible un `results.json`. Por eso V1.14 **no crea un
exp016**: sus artefactos son

| Artefacto | Qué garantiza | ¿Depende de la máquina? |
|---|---|---|
| `bench/baseline_v114.json` | salida científica de los 10 workloads, codificada bit a bit | **No** |
| `tests/performance_contract.test.mjs` | trabajo determinista exacto + equivalencia bitwise | **No** |
| `bench/run_bench.mjs`, `bench/compare.mjs` | caracterización de tiempo con disciplina | Sí (lo declara) |
| este informe | qué se midió, qué se optimizó, qué cambió y qué no | Sí (declara la máquina) |

**Máquina de las mediciones de tiempo:** Node v24.18.0 · win32 10.0.26200 ·
AMD Ryzen AI 7 445 (12 núcleos). Los tiempos solo son comparables entre corridas de este
mismo entorno; el **trabajo determinista** es comparable entre cualquier par de máquinas.

## 1 · Dónde estaba realmente el coste (perfil, no intuición)

Perfil de V8 (`--cpu-prof`) sobre `exp013`, 5261 ms muestreados, por tiempo propio:

| Función | % | ms |
|---|---|---|
| `spotRmsAt` | 22.6 % | 1189 |
| `isFiniteVec` | 12.1 % | 635 |
| `intersect` | 11.8 % | 623 |
| recolector de basura | 10.1 % | 533 |
| `traceRay` | 8.7 % | 458 |
| `bestFocus` | 8.2 % | 431 |
| `norm` (`Math.hypot`) | 5.9 % | 311 |

Lectura: el coste **no** estaba en construir geometría, ni en reconstruir el ojo, ni en la
búsqueda de catálogo. Estaba en **el bucle interno de la métrica de spot** y en **la
comprobación de finitud**, más la presión de asignación que ambos generaban.

## 2 · Qué se optimizó, y qué se descartó

Cuatro cambios, todos en `src/` (mejoran el **motor**, no un experimento concreto):

1. **`spotRmsAt`: buffer `Float64Array` reutilizable** en vez de un array nuevo de 2N por
   llamada. `bestFocus` la invoca ~40 veces por búsqueda. Se conserva el algoritmo de **dos
   pasadas** con su orden de acumulación: **no** se sustituyó por la forma de una pasada
   `E[x²]−E[x]²`, que sería más rápida y daría otros bits.
2. **`isFiniteVec`: bucle explícito** en vez de `Array.every(Number.isFinite)`. El coste era
   la llamada al callback por componente, y se ejecuta por rayo **y** por superficie.
3. **`traceRay`: eliminado el array `hits`** del valor de retorno. Verificado por barrido
   completo del repositorio: **ningún** consumidor lo leía. Construía un objeto por superficie
   y por rayo para nada. Además, un solo objeto cursor en lugar de uno por superficie, y sin
   la copia inicial de `ray0` (`intersect` y `refractDirection` no mutan sus entradas). El
   objeto **retornado** sigue siendo nuevo, para que dos rayos jamás compartan identidad.
4. **`bestFocus`: aplanado único de los rayos** a un `Float64Array`, de modo que las ~40
   evaluaciones de la sección áurea no repitan la indirección rayo→array→componente ni el
   filtro de dirección (que no depende de *z*).

### Descartado a propósito, con motivo

| Candidato | Por qué NO |
|---|---|
| `Math.hypot(x,y,z)` → `Math.sqrt(x²+y²+z²)` en `norm` (9–12 % del perfil) | `hypot` es más preciso; el cambio **altera los últimos bits** de toda dirección refractada. Velocidad a cambio de romper la identidad numérica: prohibido por el principio del sprint. |
| Cachear geometría de LIO entre potencias | La factory construye geometría **dependiente de la potencia**: reutilizarla entre potencias sería el error científico exacto que el encargo señala. Y el perfil dice que `createIOL` es ~2.5 %: no compensa el riesgo. |
| Reutilizar el haz entre extracciones Monte Carlo | Los contadores decían que `incertidumbre` generaba **164 haces idénticos**… y el perfil demostró que `generateBundle` **no aparece** entre los 10 primeros. Medir evitó optimizar algo irrelevante. |
| Micro-optimizar `intersect` (cerrar closures `sag`, desplegar el `sort` de 2 elementos, evitar el array de raíces) | Ganancia estimada ~5 %, repartida en muchas asignaciones pequeñas, con riesgo no nulo de alterar el orden de evaluación de raíces. Queda **registrado como cuello de botella abierto**. |
| Paralelismo (workers) para Monte Carlo / sweeps | El workload más caro son ~16–40 ms: el coste de arrancar workers y serializar ojos y rayos domina. Y el pareo de extracciones por semilla es una **propiedad científica** de V1.12 (la misma semilla = el mismo experimento): repartir extracciones entre workers exigiría un PRNG por flujo con pareo demostrado. Para el tamaño actual de V1, **no compensa**; queda como opción si llegan cohortes grandes. |
| Reducir cualquier parámetro científico | Prohibido por definición. El contrato HARD lo verifica: los parámetros de los workloads son parte de la instantánea comparada. |

## 3 · Speedup medido, con disciplina

### Protocolo definitivo: dos commits limpios, instrumentación simétrica, orden contrabalanceado

La primera medición de este sprint comparaba un árbol con `git stash`, lo que dejaba el
baseline **sin** la instrumentación de contadores y el final **con** ella: asimétrico. La
medición que se publica aquí lo corrige:

- **dos `git worktree` independientes**, uno en `bf9c5dc` (el commit inmediatamente anterior
  a V1.14) y otro en `HEAD`;
- **instrumentación simétrica**: se retiran los `bump()` del árbol final, de modo que ambos
  midan motor puro. Ninguna rama tiene ventaja de instrumentación;
- **orden contrabalanceado** base→final y final→base, 3 rondas (6 lanzamientos por rama),
  para que la deriva térmica o del JIT no se atribuya a una de las dos;
- proceso nuevo por medición, 8 pasadas de warmup, 15 réplicas;
- mismo Node (v24.18.0), mismo host, mismos workloads con los mismos parámetros.

| Workload | base med. | final med. | speedup | base min | final min | speedup(min) | disp. base/final | evidencia |
|---|---|---|---|---|---|---|---|---|
| `continua` | 5.45 | 2.55 | ×2.14 | 3.20 | 1.70 | ×1.88 | 25 % / 30 % | ruidoso |
| `catalogo` | 13.35 | 4.80 | **×2.78** | 9.10 | 3.90 | ×2.33 | 19 % / 28 % | **tiempo** |
| `barrido` | 35.30 | 16.10 | **×2.19** | 29.00 | 11.80 | ×2.46 | 30 % / 34 % | **tiempo** |
| `incertidumbre` | 7.30 | 4.90 | ×1.49 | 5.90 | 3.90 | ×1.51 | 19 % / 47 % | ruidoso |
| `eleccion` | 28.40 | 15.55 | ×1.83 | 20.70 | 11.20 | ×1.85 | 55 % / 54 % | ruidoso |
| `pipeline_eq` | 15.00 | 6.70 | ×2.24 | 11.20 | 4.70 | ×2.38 | 122 % / 50 % | ruidoso |
| **agregado (6 workloads > 3 ms)** | **104.80** | **50.60** | **×2.07** | 79.10 | 37.20 | ×2.13 | | |

**Cifra principal defendible: ×2.07** sobre los seis workloads que superan claramente el suelo
del instrumento. Los sub-milisegundo (`fija`, `conica`, `pose`, `torico`) quedan **excluidos
por completo** de la cifra agregada: su ruido supera al efecto, y su evidencia es el trabajo
determinista, no el tiempo. La cifra se calcula como suma de medianas del baseline dividida
por suma de medianas del final —es decir, ponderando cada workload por su coste— **no** como
media de cocientes, que daría un número mayor y menos honesto.

**Convergencia de tres protocolos independientes**, que es lo que la hace creíble:

| Protocolo | speedup agregado |
|---|---|
| Asimétrico con `git stash` (medición inicial) | ×2.05 |
| **Simétrico desde commits limpios, contrabalanceado** | **×2.07** |
| Simétrico, estadístico robusto (suma de mínimos) | ×2.13 |

**La heterogeneidad es real y no se esconde:** va de ×1.49 (`incertidumbre`) a ×2.78
(`catalogo`). El patrón tiene explicación física: los workloads dominados por `bestFocus`
sobre haces grandes (catálogo, barrido, pipeline) son los que más ganan, porque eran los que
más veces recorrían la métrica de spot con indirección y asignación. El dominado por
reconstruir el ojo en cada extracción (`incertidumbre`) gana menos, porque esa parte no se
tocó.

Nota sobre la dispersión: esta tanda se ejecutó como 72 mediciones consecutivas y varios
workloads muestran dispersión alta (hasta 122 %), señal de ruido térmico del sistema. Por eso
se publica también la columna de mínimos —estadístico robusto frente a ruido aditivo— y por eso
las tres cifras agregadas coinciden dentro del 4 %.

**Experimentos reales** (una corrida cada uno, mismo entorno, árbol instrumentado):

| Experimento | antes | después | speedup |
|---|---|---|---|
| `exp013` (atlas de divergencia) | 4598 ms | 2177 ms | ×2.11 |
| `exp014` (incertidumbre) | 5767 ms | 2575 ms | ×2.24 |
| `exp015` (pipeline EQ) | 3073 ms | 1694 ms | ×1.81 |

**Suite completa:** 3883 ms → **3639 ms**, y eso *añadiendo* 17 tests nuevos (contrato de
rendimiento + batería adversarial, 1408 ms). El motor más rápido compensa con creces el coste
de la verificación nueva.

**Coste de la instrumentación**, medido para que nadie tenga que fiarse: contadores instalados
y apagados ≈ 4 % (dentro del ruido; medido sobre `eleccion`, 4 lanzamientos por rama);
encenderlos cuesta ×1.14. Durante toda medición de tiempo están apagados, y en la comparación
simétrica de arriba no están ni instalados.

## 4 · Cómo se demuestra que ningún resultado cambió

Tres mecanismos independientes, todos ejecutables:

1. **Equivalencia bitwise de los 10 workloads.** `bench/equivalence.mjs` serializa cada número
   como sus **8 bytes IEEE-754** en hexadecimal, de modo que `0.1` y `0.1+1 ULP` no colisionan
   y `−0 ≠ +0`; `NaN` e `Infinity` llevan etiqueta explícita en lugar de convertirse en `null`.
   Las claves de objeto se ordenan (el orden de inserción no es una propiedad científica). La
   salida capturada incluye, según el workload: coste, residual firmado, mejor foco, RMS,
   rayos trazados **y perdidos**, `detail`, supuestos registrados, política corneal, potencia
   continua, recomendada y **segunda opción**, catálogo no evaluable, cilindro/eje clínicos,
   distribución Monte Carlo bajo la misma semilla, contabilidad de rechazos con motivos,
   advertencia de censura, procedencia de la posición y de la pupila, `unsupported_dimensions`.
   Resultado: **idéntica bit a bit en los 10**.
   La verificación DEFINITIVA se hizo entre **dos checkouts limpios**: instantánea capturada
   en `bf9c5dc` (pre-V1.14) y verificada desde `HEAD` — dos árboles independientes, uno sin
   optimizar y otro optimizado, producen salida byte-idéntica.
2. **Los 12 experimentos publicados reproducen** su `results.json` número a número
   (`scripts/check_experiments.mjs`), incluidos exp013/014/015, que son los que más cambiaron
   de coste.
3. **Suite completa 343/343** (331 al cerrar la primera tanda de V1.14, más los 12 tests de
   la batería adversarial de rendimiento), con el legado EVO byte-congelado (7/7) y la independencia
   arquitectónica del motor (6/6) verificadas aparte.

## 5 · Trabajo eliminado (medido, no estimado)

Las cuatro optimizaciones **no reducen** ninguna unidad de trabajo contada: se trazan los
mismos rayos, se evalúan las mismas intersecciones, se hacen las mismas búsquedas de foco. Lo
que se eliminó es **asignación de memoria efímera**, y su efecto se mide en el recolector
(20 pasadas por workload, observador de GC de `perf_hooks`):

| Workload | GCs antes | GCs después | ms de GC antes | ms de GC después | reducción de GC |
|---|---|---|---|---|---|
| `barrido` | 419 | 264 | 262.1 | 74.2 | **−72 %** |
| `eleccion` | 161 | 128 | 75.0 | 29.6 | **−61 %** |
| `incertidumbre` | 37 | 27 | 49.6 | 11.9 | **−76 %** |
| `pipeline_eq` | 61 | 58 | 26.0 | 24.0 | −8 % |

Objetos efímenos eliminados por evaluación, derivados exactamente de los contadores (con
`S` = superficies del sistema, típicamente 3):

- `hits` de `traceRay`: `rayos × (1 + S)` → en `barrido`, **57 600** objetos por pasada;
- cursor por superficie: `rayos × (S − 1)` → **28 800**;
- copia inicial de `ray0`: `rayos × 2` → **28 800**;
- array `pts` de `spotRmsAt`: `spot_rms` → **7 290**.

## 6 · Cómo escala el coste (para cuando lleguen cohortes reales)

Medido con los contadores, que son exactos:

| Dimensión | Escala | Evidencia |
|---|---|---|
| **Número de rayos** (`n_anillos`) | **lineal** en rayos; las iteraciones de `bestFocus` **no** dependen del número de rayos (`spot_rms` = 40 constante para 20→320 rayos) | intersecciones 60→960 con rayos 20→320 |
| **Tolerancia del search** (`tol_d`) | **logarítmica**: evaluaciones 18→37 para `tol` 1e-2→1e-6 | sección áurea |
| **Anchura del search range** | **logarítmica**: evaluaciones 26→30 para ancho 4→32 D — ampliar el rango es casi gratis | |
| **Tamaño del catálogo** | **LINEAL, y es la dimensión dominante**: evaluaciones 35→51→69→85→**169** para 7→23→41→57→**141** escalones. Cada escalón cuesta una evaluación completa de objetivo (trazado + mejor foco) | |
| **Extracciones Monte Carlo** | lineal por construcción (una evaluación por extracción válida) | |
| **Tamaño del sweep** | lineal en celdas | |

**Consecuencia práctica:** con datos reales, el coste lo gobernará el **tamaño del catálogo**
y el número de casos, no la precisión del optimizador. Afinar tolerancias es casi gratis;
ampliar catálogos no lo es.

## 7 · Presupuesto computacional de V1

Tres niveles con estatus **explícito**, porque un umbral en milisegundos absolutos sobre un
runner de CI compartido sería una prueba frágil que falla por vecinos ruidosos y no por
regresiones (lo medí: hasta 130 % de dispersión con el mismo código):

| Nivel | Qué fija | Estatus | Dónde |
|---|---|---|---|
| Trabajo determinista exacto por workload | rayos, intersecciones, `spot_rms`, `best_focus`, evaluaciones de objetivo, geometrías de LIO, ojos, haces | **HARD** (rompe la CI) | `tests/performance_contract.test.mjs` |
| Equivalencia numérica bitwise + parámetros científicos intactos | ninguna salida científica cambia; ningún parámetro se reduce | **HARD** (rompe la CI) | ídem, contra `bench/baseline_v114.json` |
| Presupuesto **relativo** calibrado (coste ÷ bucle de calibración medido en el mismo proceso) | detecta regresiones groseras de constante multiplicativa | **SOFT** (avisa por consola, **no** rompe) | ídem |
| Caracterización de wall-clock por workload y por experimento | referencia para comparar en el mismo entorno | **CARACTERIZACIÓN** | `bench/`, este informe |

Cada workload declara su carga y sus parámetros en `bench/workloads.mjs`; el contrato HARD
declara su trabajo exacto. Si alguien cambia un parámetro científico creyendo que optimiza,
el test falla nombrando el parámetro y el valor.

## 8 · Cuellos de botella que permanecen (y por qué)

Perfil **después** de las optimizaciones (`exp014`, 2255 ms muestreados):

| Función | % | Por qué no se tocó |
|---|---|---|
| `intersect` | 22.9 % | Lo que queda es asignación difusa (raíces, punto, normal, objeto resultado) repartida en muchos sitios pequeños; la ganancia estimada (~5 %) no justifica el riesgo de alterar el orden de evaluación de raíces, que en V1.2/V1.6 ya produjo pérdidas silenciosas de intersecciones genuinas. |
| `traceRay` | 13.4 % | Ya optimizado; el resto es el bucle irreducible de superficies. |
| `norm` (`Math.hypot`) | 12.4 % | Sustituirlo por `sqrt` cambia los últimos bits de toda dirección refractada. **Identidad numérica antes que velocidad.** |
| `spotRmsPlano` | 10.1 % | Ya optimizado; el resto es la aritmética irreducible de dos pasadas, que se conserva a propósito. |
| recolector de basura | 9.5 % | Bajó de 10.1 % con un total muy inferior (de 533 ms a 215 ms). Reducirlo más exige atacar `intersect`. |

## 10 · Trabajo CIENTÍFICO frente a trabajo de IMPLEMENTACIÓN

Que se tracen los mismos rayos **no** significa que no haya optimización. V1.14 distingue dos
clases de trabajo y solo toca la segunda:

| | TRABAJO CIENTÍFICO | TRABAJO DE IMPLEMENTACIÓN |
|---|---|---|
| **Qué es** | rayos trazados, superficies intersecadas, evaluaciones de objetivo, potencias candidatas, búsquedas de foco, extracciones Monte Carlo | asignaciones de memoria, arrays temporales, comprobaciones repetidas, recorridos redundantes, indirección de propiedades, recolección de basura |
| **Lo define** | la pregunta científica y sus parámetros declarados | cómo está escrito el código |
| **En V1.14** | **INVARIANTE** — verificado exacto por el contrato HARD | **REDUCIDO** — es de donde sale todo el speedup |
| **Cambiarlo es** | cambiar el experimento (prohibido en este sprint) | optimizar (el objetivo del sprint) |

Por eso la puerta de equivalencia informa «trabajo sin cambios» en los diez workloads y aun
así el motor va al doble: no se hace menos ciencia, se hace con menos desperdicio.

## 11 · Refutaciones adversariales ejecutadas

Los ocho vectores del encargo se ejecutaron como pruebas, no como opinión. Todas viven en
`tests/perf_adversarial.test.mjs` (12 tests) y se ejecutan en cada CI.

### A · Caché y estado compartido (el riesgo que V1.14 introduce de verdad)

Las optimizaciones metieron **estado mutable a nivel de módulo**: los buffers `scratch`
(spotRmsAt), `planos` (bestFocus) y el objeto `cursor` (traceRay). Se atacaron así:

| Ataque | Resultado |
|---|---|
| `A→B→A` con haces de distinto ojo y tamaño: ¿el A final == el A aislado? | idéntico |
| haz **grande** y luego **pequeño**: ¿el pequeño lee datos viejos del prefijo sobrante? | idéntico (el bucle recorre lo escrito, no la capacidad) |
| rayos **filtrados intercalados** (|d_z| < 1e-12) en mitad de la lista: ¿se descuadran índice y contador? | idéntico al haz sin degenerados |
| `bestFocus` A→B→A, y ¿su aplanado contamina `spotRmsAt`, que usa el *otro* buffer? | idéntico |
| llamada que **falla a mitad** (bracket inválido, haz vacío, mínimo en el borde): ¿deja residuo tóxico? | el cálculo siguiente es idéntico |
| **aliasing**: ¿dos rayos del mismo haz comparten el array de posición o dirección? | todos distintos; y ninguno comparte identidad con el haz de entrada |
| ¿`traceRay` **muta** el rayo de entrada? | no; trazarlo dos veces da lo mismo |
| **orden de ejecución**: 3 pasadas en orden aleatorio determinista + orden inverso | toda salida idéntica |
| **repetición**: 25 pasadas del workload Monte Carlo | todas idénticas |

**Reentrancia:** no existe camino donde `spotRmsAt` o `bestFocus` se llamen anidadamente —
ninguna de las dos invoca código de usuario ni acepta callbacks, y el motor es de un solo hilo
sin `await` en la ruta caliente. El único punto recursivo del trazado es `intersect` para
superficies `transformed`, que **no toca ninguno de los dos buffers**.

### B · Resultado cambiado

La comprobación decisiva es entre **dos checkouts limpios**: se capturó la instantánea
científica en `bf9c5dc` (pre-V1.14, sin optimizar) y se verificó desde `HEAD`. Resultado:
**idéntica bit a bit en los diez workloads**. Además se verificaron rutas que los workloads no
cubren: pérdidas por apertura con su razón y punto, contabilidad `rays + lost = total` con sus
motivos, `parallelBundle` con sus pares ±h, y que `evaluateObjective` conserva todos sus campos
(incluido `residual_d = null` y `bestFocus_mm = null` para el objetivo A).

### C · Benchmark engañoso

El propio informe encontró y corrigió el sesgo: la primera medición era **asimétrica**
(baseline sin instrumentar, final instrumentado). Se rehízo desde commits limpios con
instrumentación simétrica y orden contrabalanceado — sección 3. Los sub-milisegundo se excluyen
de la cifra agregada por ruido, y la exclusión **no favorece** al resultado (sus speedups
aparentes eran ×1.00–×1.67, por debajo de la media).

### D · Parámetro científico reducido

Barrido del diff completo `bf9c5dc..HEAD` sobre `src/`: **ninguna** constante científica
cambia. El único `1e-12` que aparece en el diff es el mismo filtro de dirección preexistente,
movido de sitio, no alterado. Y el contrato HARD incluye los parámetros de cada workload en la
instantánea comparada: reducir uno haría fallar el test nombrándolo.

### E · CI frágil

El test SOFT de presupuesto **no puede fallar por tiempo**: sus únicas aserciones son que la
calibración mide un tiempo positivo y que todo workload con presupuesto SOFT tiene también
contrato HARD; un exceso se reporta por consola como aviso. La suite completa pasó de 3883 ms
a **3639 ms** *añadiendo* 17 tests: el contrato no encarece la CI.

### F · Memoria y GC

| Medida | Resultado |
|---|---|
| GC en `barrido` (20 pasadas) | 419 → 264 recolecciones; **262.1 → 74.2 ms** |
| GC en `incertidumbre` | 37 → 27; **49.6 → 11.9 ms** |
| GC en `eleccion` | 161 → 128; **75.0 → 29.6 ms** |
| Fuga tras **250 pasadas** de `barrido`/`eleccion`/`incertidumbre` | +0.08 a +0.17 MiB (nivel de ruido, sin crecimiento monótono) |
| **Tradeoff declarado**: los buffers crecen y **no encogen** | +54 KiB tras un haz de 1000 rayos; peor caso del motor (haz Fibonacci de 20 000 rayos) ≈ **1.25 MiB permanentes** |

Ese ~1.25 MiB es el precio de la velocidad y se publica como tal: está acotado por el mayor haz
que el proceso haya visto, no crece con el número de evaluaciones.

### G · Determinismo

Cubierto por los tests de orden aleatorio, orden inverso, 25 repeticiones del Monte Carlo, y la
equivalencia entre commits limpios. Sobre el orden de reducción en coma flotante: los buffers
`Float64Array` almacenan **exactamente** el mismo `double` que un `Array`, y las dos pasadas
(centroide y luego varianza) conservan su orden de acumulación — por eso la salida es idéntica
bit a bit y no «casi igual».

### H · Generalidad

`src/` no contiene ninguna referencia a `exp013`/`exp014`/`exp015`, a los workloads del
benchmark, ni a ojos, pupilas, números de anillos o factories concretos. No hay *fast paths*
que reconozcan casos históricos ni cachés precalculadas. Los tamaños iniciales de buffer (1024
y 6×512) son solo semillas: el crecimiento dinámico se ejercita con haces mayores en los tests.
La independencia arquitectónica del motor sigue verde (6/6), y `src/perf/counters.mjs` no
importa nada del proyecto, así que no puede crear ciclos.

## 12 · Por qué el catálogo cuesta lo que cuesta (y por qué NO se optimiza)

El contador dice: catálogo de 141 escalones → 169 evaluaciones de objetivo, frente a ~30 del
continuo solo. Las ~139 evaluaciones extra **no son un desperdicio**: el optimizador evalúa
cada escalón del catálogo exactamente **una vez** (`for (const p of catalog_d)`), y de ahí
salen tres cosas que el contrato científico publica:

1. la **recomendada** (el escalón de menor coste);
2. la **segunda opción** y su diferencia (contrato de V1.8, base del análisis de empates);
3. el registro **`catalog_no_evaluables`** — qué escalones no pudieron evaluarse y por qué,
   que es la guarda anti-sesgo-del-superviviente de V1.9.

Evaluar solo los dos escalones que rodean al óptimo continuo sería más rápido y **asumiría
unimodalidad del coste sobre el catálogo** sin demostrarla, además de vaciar (2) y (3). Es
exactamente la clase de atajo que este proyecto rechaza. Coste **estructural**, no evitable:
queda documentado para que, cuando lleguen cohortes reales, se sepa que la dimensión dominante
es el tamaño del catálogo y no la precisión del optimizador.

## 13 · Lo que este informe NO demuestra

- **No** demuestra que el motor sea rápido en términos absolutos: demuestra que hace **el
  mismo cálculo** por aproximadamente la mitad del tiempo en esta máquina.
- **No** mide en el runner de CI. Los tiempos son de una máquina de desarrollo; en CI solo se
  verifican los contratos deterministas.
- **No** cubre paralelismo: se evaluó y se descartó con motivo para el tamaño actual de V1.
- **No** valida nada científico. Ninguna cifra de aquí es un resultado clínico ni cambia
  ninguna conclusión de V1.9, V1.11 o V1.12 — precisamente eso es lo que la puerta de
  equivalencia garantiza.
