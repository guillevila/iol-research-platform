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

**Protocolo** (`bench/compare.mjs`): un **proceso aislado por workload** (para que ninguno
caliente ni ensucie a otro), 8 pasadas de warmup, 15 réplicas, **3 lanzamientos**; el
estadístico es la mediana de las medianas por lanzamiento. Se publica además el mínimo
(robusto al ruido aditivo) y la dispersión entre lanzamientos.

**Suelo de medición declarado:** medí primero la variabilidad del propio instrumento. Tres
lanzamientos del **mismo** código dieron medianas con hasta **130 %** de dispersión en los
workloads sub-milisegundo. Por eso todo workload con dispersión > 25 % se marca `RUIDO` y
**su tiempo no se usa como evidencia**: para esos casos la evidencia es el trabajo
determinista, que no depende de la máquina.

| Workload | antes (ms) | después (ms) | speedup | antes.min | después.min | disp. | evidencia |
|---|---|---|---|---|---|---|---|
| `fija` | 0.50 | 0.30 | ×1.67 | 0.20 | 0.10 | 50 %/0 % | solo trabajo |
| `continua` | 5.60 | 2.70 | ×2.07 | 3.50 | 1.80 | 20 %/35 % | solo trabajo |
| `catalogo` | 13.90 | 5.80 | ×2.40 | 9.80 | 4.10 | 43 %/17 % | solo trabajo |
| `conica` | 0.50 | 0.40 | ×1.25 | 0.30 | 0.20 | 60 %/33 % | solo trabajo |
| `pose` | 0.30 | 0.30 | ×1.00 | 0.20 | 0.10 | 100 %/150 % | solo trabajo |
| `torico` | 0.80 | 0.50 | ×1.60 | 0.30 | 0.30 | 80 %/75 % | solo trabajo |
| **`barrido`** | **37.30** | **15.90** | **×2.35** | 28.40 | 12.00 | 10 %/2 % | **tiempo** |
| **`incertidumbre`** | **9.50** | **5.00** | **×1.90** | 6.20 | 4.00 | 22 %/11 % | **tiempo** |
| **`eleccion`** | **26.20** | **15.70** | **×1.67** | 20.30 | 12.10 | 15 %/7 % | **tiempo** |
| **`pipeline_eq`** | **15.60** | **6.60** | **×2.36** | 11.80 | 5.10 | 22 %/15 % | **tiempo** |
| suma total | 110.20 | 53.20 | ×2.07 | | | | |
| **suma solo fiables** | **88.60** | **43.20** | **×2.05** | | | | **← el speedup defendible** |

**Experimentos reales** (una corrida cada uno, mismo entorno):

| Experimento | antes | después | speedup |
|---|---|---|---|
| `exp013` (atlas de divergencia) | 4598 ms | 2177 ms | ×2.11 |
| `exp014` (incertidumbre) | 5767 ms | 2575 ms | ×2.24 |
| `exp015` (pipeline EQ) | 3073 ms | 1694 ms | ×1.81 |

### Sesgo declarado de la medición

El baseline se midió con `git stash -- src/`, que revierte **también** la instrumentación de
contadores. Es decir: el baseline corrió **sin** los `bump()` y el final **con** ellos
instalados (apagados). Cuantificado sobre `eleccion`, 4 lanzamientos aislados por rama:
medianas 16.7 ms (con instrumentación) frente a 16.05 ms (sin) — **~4 %, dentro del ruido**
de ese workload. El sesgo va **en contra** del speedup que publico, así que las cifras de
arriba son **conservadoras**. Encender los contadores cuesta ×1.14 adicional, y por eso están
apagados durante toda medición de tiempo.

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
2. **Los 12 experimentos publicados reproducen** su `results.json` número a número
   (`scripts/check_experiments.mjs`), incluidos exp013/014/015, que son los que más cambiaron
   de coste.
3. **Suite completa 331/331**, con el legado EVO byte-congelado (7/7) y la independencia
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

## 9 · Lo que este informe NO demuestra

- **No** demuestra que el motor sea rápido en términos absolutos: demuestra que hace **el
  mismo cálculo** por aproximadamente la mitad del tiempo en esta máquina.
- **No** mide en el runner de CI. Los tiempos son de una máquina de desarrollo; en CI solo se
  verifican los contratos deterministas.
- **No** cubre paralelismo: se evaluó y se descartó con motivo para el tamaño actual de V1.
- **No** valida nada científico. Ninguna cifra de aquí es un resultado clínico ni cambia
  ninguna conclusión de V1.9, V1.11 o V1.12 — precisamente eso es lo que la puerta de
  equivalencia garantiza.
