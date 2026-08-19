# Calculadora tórica de LIO — informe de ingeniería inversa y validación

**Fecha:** 7 de agosto de 2026
**Objeto:** documentar cómo se ha construido `calculadora-torica.html` + `engine.js`, qué
ensayos se han hecho sobre la calculadora EVO Toric v2.0 y qué concordancia se ha medido.

> **Aviso.** Esta es una implementación independiente y no oficial, sin relación con los
> autores de EVO ni con ningún fabricante. **No es un producto sanitario.** La fórmula EVO 2.0
> es propietaria y no está publicada; lo que sigue es una reconstrucción por muestreo, no una
> copia de su código. Verifique el resultado antes de cualquier uso clínico.

---

## 1. Punto de partida

La calculadora original (`evoiolcalculator.com/toric.aspx`) es una aplicación **ASP.NET
WebForms**. Lo primero que se comprobó fue si el cálculo ocurría en el navegador:

| Comprobación | Resultado |
|---|---|
| Scripts cargados en la página | 3: Google Analytics + 2 líneas de `__doPostBack` |
| Lógica de cálculo en cliente | **Ninguna** |
| Mecanismo | `POST` con `__VIEWSTATE` / `__EVENTVALIDATION`; el servidor devuelve el HTML con los resultados |

Es decir: no hay fórmula que leer. Toda la caracterización posterior se hizo **por
observación de entradas y salidas**, tratando el servidor como una caja negra.

Se construyó un banco de pruebas programático que reproduce el flujo del navegador
(incluido el segundo `POST` que exige el desplegable de modelo de LIO, que reinicia el
campo de constante A). Todas las respuestas se cachearon en disco: **7.859 consultas
distintas** acumuladas a lo largo del trabajo.

---

## 2. Estructura del motor esférico

### 2.1 La firma de una fórmula de vergencia

Toda fórmula paraxial de vergencia produce, para un ojo dado, una relación
**exactamente de Möbius** entre potencia de LIO `P` y refracción `R`:

```
R(P) = (a·P + b) / (P + d)
```

Se barrió la refracción diana (−4 a +4 D) para obtener 25 pares (P, R) del mismo ojo y se
ajustaron los 3 parámetros.

**Ensayo 1 — ¿es una fórmula de vergencia?**

| Ajuste | Puntos | rms | Suelo de redondeo |
|---|---|---|---|
| Möbius, 1 ojo, 7 constantes A | 105 | **0.0043 D** | ≈0.003 D |

Encaja al nivel del redondeo a 2 decimales de la web. **Confirmado: es una fórmula de
vergencia paraxial.** Esto reduce cada ojo a 3 números.

**Ensayo 2 — validez del modelo en toda la rejilla.** Se ajustó la Möbius celda por celda
sobre 126 ojos:

| Grupo | n | Residuo máximo medio | Peor |
|---|---|---|---|
| Celdas clínicamente válidas | 114 | **0.0072 D** | 0.0118 D |
| Celdas degeneradas | 12 | 0.41 D | 0.73 D |

Las 12 celdas degeneradas son ojos de 26–28 mm con córneas de 48–50 D, que necesitarían
LIOs de **−1.7 a +5 D**. En ese régimen EVO recorta la tabla y el modelo deja de ser
Möbius. No son ojos reales; se reparan por extrapolación y se documentan como zona de
menor fiabilidad.

### 2.2 Reducción de las entradas

Se probó, para cada variable, si su efecto puede expresarse como desplazamiento de otra.
El criterio fue **igualdad exacta de la tabla de refracciones**, no un ajuste estadístico.

**Ensayo 3 — el ACD es exactamente equivalente a la constante A.**
Se buscó la constante A que reproduce la tabla de un ACD distinto:

| Ojo de prueba | ACD 3.2 → 3.8 equivale a | Diferencia máxima (15 puntos) |
|---|---|---|
| AL 21.0 | ΔA = +0.48 | **0.0000** |
| AL 23.5 | ΔA = +0.48 | **0.0000** |
| AL 26.5 | ΔA = +0.48 | **0.0000** |
| K 40.0 | ΔA = +0.48 | **0.0000** |
| K 47.0 | ΔA = +0.48 | **0.0000** |
| LT 5.2 | ΔA = +0.48 | **0.0000** |

Coincidencia perfecta en los seis casos: **0.8 unidades de constante A por mm de ACD**,
constante en todo el rango. Esto elimina una dimensión entera del problema.

**Ensayo 4 — coeficientes de todos los canales.** Resolviendo el par (P₀, pendiente) para
cada valor en tres ojos de referencia (AL 22/K 41, AL 23.5/K 43.5, AL 25/K 46):

| Variable | Efecto sobre la constante A | Efecto sobre la longitud axial | Desviación máx. |
|---|---|---|---|
| ACD | **+0.800352 / mm** | +0.000646 / mm (≈ 0) | 0.015 |
| Grosor de cristalino (LT) | **+0.285036 / mm** | **−0.056464 / mm** | 0.020 |
| CCT | −0.000081 / µm | −0.000155 / µm | 0.019 |

Autocomprobación: barriendo la constante A de 112 a 125 y resolviendo el mismo sistema se
recupera el valor introducido con error ≤0.01 dentro del rango tabulado.

**Ensayo 5 — valores por defecto.** Con LT y CCT vacíos, EVO asume **4.50 mm y 550 µm**
(diferencia máxima 0.01 D frente a introducirlos explícitamente). Con ACD vacío el
comportamiento equivale aproximadamente a 2.95–3.00 mm pero **no se reproduce con
exactitud**, por lo que en esta calculadora el ACD es obligatorio.

**Ensayo 6 — cómo entra la queratometría.** Comparando K 43.50/43.50 con pares de igual
media aritmética:

| Entrada | Diferencia máxima |
|---|---|
| K 42.00 / 45.00 | 0.010 |
| K 41.00 / 46.00 | 0.010 |
| K 40.00 / 47.00 | 0.010 |

Se usa la **media aritmética de potencias** (K1+K2)/2. La media de radios habría dado
43.22 para el par 40/47 y una discrepancia de ~0.2 D, que no se observa.

**Ensayo 7 — índice queratométrico.** El factor de conversión al índice interno (1.3375)
se midió empíricamente buscando la K equivalente:

| Índice | Factor basado en radio | Factor medido | Diferencia máx. con el medido |
|---|---|---|---|
| 1.3315 | 1.0181 | **1.0175** | 0.010 |
| 1.332 | 1.0166 | **1.0160** | 0.010 |

El factor teórico deja un sesgo constante de 0.03 D; el medido lo elimina.

### 2.3 Tablas y precisión de interpolación

Rejilla muestreada: **AL 20–32 mm** (paso 1), **K 34–50 D** (paso 2), **constante A** en
110.3 / 112.3 / 115.3 / 117.3 / 119.3 / 121.3 / 123.3 / 125.0 → **936 nodos** × 3 barridos
de diana. En cada nodo se guardan tres superficies: posición efectiva de la lente, pendiente
y curvatura.

Los nodos donde la potencia de LIO cae por debajo de ~5 D se marcan como no válidos (243 de
936) y se rellenan con una superficie polinómica suave ajustada a los nodos buenos, solo
para que la interpolación no se desestabilice cerca del borde; el motor rechaza el cálculo
en esa zona.

| Comprobación | Resultado |
|---|---|
| Reconstrucción sobre la propia rejilla (693 nodos válidos) | media **0.0072 D**, p95 0.0098, máx. 0.0196 D |
| Interpolación: se elimina una columna de K entera (hueco 2 D → 4 D) | mediana **0.0038 D**, p95 0.013, máx. 0.030 D |

Como el error de interpolación cúbica escala con la cuarta potencia del paso, con la
rejilla real (hueco de 2 D) el error es ~16 veces menor, del orden de **0.002 D**. Por eso
**no fue necesario densificar la rejilla**.

### 2.4 Corrección por modelo de LIO

Se descubrió que el modelo de lente **desplaza el resultado esférico en ojos cortos**.
Muestreando 725 combinaciones modelo/ojo:

| Modelo | AL 20 | AL 21 | AL 22 | AL 23.5 | AL 25 | AL 28 |
|---|---|---|---|---|---|---|
| Tecnis / ZCU / Eyhance / PureSee / Synergy / Odyssey | −0.63 | −0.43 | −0.25 | 0.03 | 0.02 | 0.01 |
| MX60T / MX60ET / Aspire / Envy | +1.08 | +0.69 | +0.35 | 0.00 | 0.00 | 0.00 |
| SN6ATx, Vivity, Kowa, LuxGood/Smart/Life, Galaxy | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| EMV, Nidek, Simedice | +0.07 | +0.03 | +0.02 | 0.02 | 0.01 | 0.01 |

**Ensayo 8 — ¿de qué depende ese desplazamiento?** Se comprobó en tres series con
distintas K y constantes A que la corrección depende **solo de la potencia de la LIO**:

| Potencia | Tecnis (K 43.5) | Tecnis (K 47) | MX60T (K 43.5) | MX60T (K 47) |
|---|---|---|---|---|
| 27–28 D | −0.25 | −0.25 | +0.35 | +0.35 |
| 32–33 D | −0.43 | −0.48 | +0.69 | +0.77 |

Coincidencia a igual potencia con córneas muy distintas. Es coherente con que EVO modele
el **grosor real de cada lente**, que solo importa en potencias altas. Se tabuló la
corrección por modelo en función de la potencia (nula por debajo de ~24 D).

---

## 3. Motor tórico

### 3.1 Extracción del astigmatismo interno

De las tres filas de cilindro que muestra EVO se puede despejar por álgebra vectorial
tanto el astigmatismo total que ha usado como la razón tórica. Verificación sobre el caso
base (córnea 43@180 / 45@90):

| Cilindro | Residuo predicho por el despeje | Residuo mostrado por EVO |
|---|---|---|
| 1.50 | 0.250 | −0.25 @ 180 |
| 2.25 | −0.220 | −0.22 @ 90 |
| 3.00 | −0.690 | −0.70 @ 90 |

El método reconstruye la tercera fila con error 0.01 usando solo las dos primeras.

### 3.2 Tres hallazgos que cambian el modelo

**Ensayo 9 — el eje se calcula sin redondear.** Ajustando el modelo usando el eje entero
mostrado frente al eje exacto:

| Convención | rms del cilindro residual |
|---|---|
| Eje redondeado a grados enteros | 0.0243 |
| **Eje exacto (se redondea solo al mostrar)** | **0.0129** |

**Ensayo 10 — la potencia etiquetada es el equivalente esférico.** El cilindro se reparte
±c/2 entre meridianos, no se suma entero a uno:

| Reparto | rms |
|---|---|
| Cilindro entero en un meridiano | 0.0246 |
| **±c/2** | **0.0165** |

**Ensayo 11 — EVO ejecuta su fórmula completa en cada meridiano principal.** Se probó qué
partes del modelo se recalculan por meridiano, midiendo la dispersión del astigmatismo
corneal implícito (que debería ser constante entre ojos):

| Variante | Dispersión |
|---|---|
| **Todo por meridiano (fórmula completa)** | **1.88 %** |
| Solo la posición de lente por meridiano | 1.82 % |
| Todo con la K media | 6.46 % |
| Solo la forma de la curva por meridiano | 6.55 % |

Es decir, el residuo que muestra EVO es astigmatismo **en el plano de gafas**, y la
conversión desde el plano corneal depende del ojo. Esto explica por qué un mismo
astigmatismo corneal de 2.00 D produce entre 0.95 y 1.41 D de astigmatismo refractivo
según la longitud axial y la queratometría.

### 3.3 Modelo de córnea posterior

Con 4.829 observaciones extraídas de la caché, el vector posterior implícito resultó
**esencialmente constante y sin componente oblicua**:

| Magnitud del astigmatismo anterior | Componente horizontal posterior | Desv. típica |
|---|---|---|
| 0.15–0.75 D | 0.580 | 0.079 |
| 0.75–1.5 D | 0.585 | 0.108 |
| 1.5–2.5 D | 0.570 | 0.089 |
| 2.5–3.5 D | 0.562 | 0.129 |
| 3.5–6 D | 0.597 | 0.139 |

Componente oblicua: media **−0.0003**, percentiles 5–95 de −0.094 a +0.092. Es decir, la
córnea posterior aporta un vector casi fijo contra la regla, coherente con la literatura.

Ajuste final (2.797 casos de ajuste / 1.399 reservados):

```
astigmatismo total = 0.980 × anterior  +  posterior
posterior (meridiano horizontal) = 0.606 − 0.0313·(Km − 44) − 0.0630·(AL − 23.5)
razón tórica = 1 / |pendiente de vergencia|      (factor ajustado 1.003–1.011 ≈ 1)
```

| Conjunto | rms del cilindro residual | Error medio de eje |
|---|---|---|
| Ajuste (2.797 casos, 8.010 filas) | 0.0711 | 0.07° |
| **Reservado (1.399 casos, 4.019 filas)** | **0.0734** | **0.06°** |

La ausencia de degradación en el conjunto reservado indica que no hay sobreajuste.

**Extensión a ojos largos y córneas planas.** Al ampliar el dominio (AL hasta 32 mm, K
desde 34 D) se comprobó que una superficie global reajustada mejoraba los extremos pero
**degradaba el eje en el dominio típico** (de 98 % a 92 % dentro de 1°). Se descartó y se
adoptó un modelo jerárquico: el modelo del dominio típico queda **congelado tal cual**, y
se añaden términos *hinge* — `max(0, AL−27)` y `max(0, 38−Km)` y sus cuadrados/cruce — que
son **exactamente cero dentro del dominio original** y solo actúan fuera. Coeficientes
ajustados sobre 4.522 casos (2.261 reservados):

```
posterior += −0.0005·hA + 0.0060·hA² + 0.0368·hK − 0.0018·hK² − 0.0121·hA·hK
             con hA = max(0, AL−27),  hK = max(0, 38−Km)
```

| Subconjunto reservado | rms del cilindro residual | Error medio de eje |
|---|---|---|
| Dominio típico | 0.0923 ¹ | 0.15° |
| Dominio extendido (AL>27.5 o Km<39) | 0.1465 | 0.06° |
| Solo ojos largos (AL>27.5) | **0.0514** | **0.08°** |

¹ No comparable con la tabla anterior: este conjunto incluye además todos los casos con
SIA, otros índices K y otros modelos de LIO acumulados en la caché, no solo el barrido
limpio. La verificación de que el dominio típico no cambió es la validación de extremo a
extremo de la sección 5.1 (97.9 % de ejes dentro de 1°, igual que antes de la ampliación).

### 3.4 SIA

**Ensayo 12 — cómo se aplica el astigmatismo inducido.** Con córnea 2.00 D a favor de la
regla y SIA 1.00 D a 0°:

| Hipótesis | Predicción | Observado |
|---|---|---|
| SIA sumado **después** de la córnea posterior | −2.202 | **−2.180** |
| SIA sumado al astigmatismo anterior, antes | −2.052 | −2.180 |

Se suma **después**, como vector en el meridiano perpendicular a la incisión. Verificación
sobre 20 combinaciones de magnitud (0–1 D) y eje (0/45/90/135): error máximo **0.013 D**.

### 3.5 Regla de elección del cilindro

**Ensayo 13 — criterio de recomendación.** Contrastado sobre 4.308 casos:

| Regla candidata | Acierto |
|---|---|
| Mínimo cilindro residual | 90.6 % |
| Redondear hacia arriba | 81.1 % |
| Redondear hacia abajo | 21.0 % |
| **Cilindro más próximo al cruce por cero + 0.10 D** | **96.2 %** |

EVO apunta sistemáticamente algo por encima del punto de anulación exacta. El sesgo medido
es de **+0.10 D** en el plano de la LIO.

**Ensayo 14 — regla de selección de la LIO esférica.** Sobre 4.811 tablas completas:

| Regla | Acierto |
|---|---|
| **Potencia con refracción más próxima a la diana** | **94.0 %** |
| Mayor potencia que no sobrepasa la diana | 56.8 % |
| La recomendada es siempre la fila central de la tabla | 4.811 / 4.811 |

El 6 % restante son ojos con potencia recortada, donde EVO deja de ser monótona.

**Ensayo 15 — rejilla de potencia de las lentes Zeiss a medida.** La campaña por modelo
del panel de validación destapó que con **709M/MP y 939M/MP** (bitóricas a medida) EVO
recomienda potencias fuera de la rejilla de 0.5 D (18.25, 26.25…). Un barrido fino de la
diana (paso 0.05 D) demostró la estructura: la **potencia del meridiano plano va en pasos
de 0.5 D** y el equivalente esférico mostrado es plana + cil/2, de modo que hereda un
desplazamiento de 0.25 D cuando el cilindro es múltiplo impar de 0.5. El 929M/MP usa la
rejilla estándar (100 % de acierto con la regla normal). Sobre 184 casos cacheados de
709/939 se contrastaron seis reglas de selección:

| Regla | Acierto 709+939 |
|---|---|
| Rejilla 0.5 estándar (motor previo) | 53 % |
| **La más próxima en la rejilla plana + cil/2** | **81 %** |
| Variantes de suelo/histéresis probadas | 65–71 % |

Se implementó la regla ganadora. El 19 % restante presenta una histéresis alrededor de la
emetropía (mesetas asimétricas medidas de hasta 0.55 D de ancho) que no se reduce a
ninguna regla observable desde fuera; y como la sub-rejilla depende de la paridad del
cilindro elegido, un desacuerdo de un escalón en el cilindro arrastra a la potencia. La
coincidencia literal de potencia en estas dos lentes queda en ~60 %, con tablas de
refracción que difieren ≤0.05 D.

**Ensayo 16 — modos «Anterior» y «Bitoric».** Se contrastó si estos modos genéricos de EVO
omiten la córnea posterior: con 180 y 94 casos, el modelo posterior completo ajusta mejor
(rms 0.125 / 0.080) que usar solo el astigmatismo anterior (rms 0.45 / 0.49), así que se
mantiene el tratamiento actual. Su fidelidad es algo menor que la de los modelos
comerciales y así queda reflejada en el panel.

---

## 4. Base de datos de lentes

Se enumeraron los **29 modelos** con sus identificadores exactos y su tabla completa de
cilindros, barriendo el astigmatismo de 0.5 a 9.0 D por modelo. Los resultados coinciden
con los catálogos reales de fabricante, lo que valida la extracción:

| Modelo | Cilindros disponibles |
|---|---|
| Tecnis, J&J ZCU/Eyhance/PureSee | 1, 1.5, 2.25, 3, 3.75, 4.5, 5.25, 6, 7, 8 |
| Alcon SA6ATx/SN6ATx/CNW0Tx | 1, 1.5, 2.25, 3, 3.75, 4.5, 5.25, 6 |
| Alcon Vivity/Panoptix, J&J Synergy/Odyssey | 1, 1.5, 2.25, 3, 3.75 |
| B&L MX60T | 0.9, 1.25, 2, 2.75, 3.5, 4.25, 5, 5.75 |
| B&L MX60ET/PT, Aspire, Envy | 0.9, 1.25, 1.5, 2, 2.5, 3, 3.5, 4.25, 5, 5.75 |
| B&L LuxGood/LuxSmart/LuxLife | 0.75, 1, 1.5, 2.25, 3, 3.75, 4.5, 5.25, 6 |
| Zeiss 709/929/939 M/MP | 1 a 12 en pasos de 0.5 |
| Rayner EMV/Galaxy | 0.75, 1.5, 2.25, 3, 3.75, 4.5 |
| Nidek NP-T | 0.75, 1.5, 2.25, 3, 3.75, 4.5, 5.25, 6 |
| Kowa Toric | 1.5, 2.25, 3, 3.75, 4.5 |
| Simedice Toric | 0.75, 1.5, 2.25, 2.5, 2.75, 3, 3.5 |

---

## 5. Validación con casos reservados

Casos aleatorios generados con semilla fija, **no usados en ningún ajuste**, comparados uno
a uno contra el servidor de EVO. Rangos: AL 21–27 mm, K 40–47 D, astigmatismo 0.25–4.00 D,
eje 0–180°, ACD 2.6–4.2 mm, LT 3.6–5.4 mm, CCT 480–620 µm, diana −1.5 a +0.5 D,
constante A 117.0–120.5.

### 5.1 Configuración estándar, ojo normal (AL 21–27, K 40–47, índice 1.3375, sin SIA) — 188 casos

| Métrica | Resultado |
|---|---|
| **LIO esférica recomendada idéntica** | **187 / 188 (99.5 %)** |
| Error de la tabla de refracciones (5 filas) | mediana **0.000**, p95 0.010, máx. 0.020 D |
| Eje de la LIO exacto / dentro de 1° | 76.1 % / **97.9 %** |
| Cilindro tórico recomendado idéntico | 145 / 188 (77.1 %) |
| Error del cilindro residual | mediana 0.060, p95 0.220 D |
| Error del equivalente esférico previsto | mediana 0.020, p95 0.040 D |

### 5.2 Ojo largo con córnea plana (AL 27–31.5, K 34–40) — 128 casos

Este es el dominio añadido a raíz de un caso real de miopía magna.

| Métrica | Resultado |
|---|---|
| **LIO esférica recomendada idéntica** | **127 / 128 (99.2 %)** |
| **Cilindro tórico recomendado idéntico** | **120 / 128 (93.8 %)** |
| Eje de la LIO dentro de 1° | 94.5 % |
| Error de la tabla de refracciones | mediana 0.000, p95 0.020, máx. 0.030 D |
| Error del cilindro residual | mediana 0.030, p95 0.180 D |

### 5.3 Por tipo de variante (100 casos cada uno)

| Modo | LIO esférica | Cilindro | Eje ≤1° | Error de tabla (mediana) |
|---|---|---|---|---|
| Solo modelos de LIO | 96 % | 84 % | 98 % | 0.010 |
| Solo índice K distinto | 98 % | 82 % | 93 % | 0.010 |
| Solo SIA | 98 % | 67 % | 92 % | 0.000 |

### 5.4 Todo combinado — 232 casos

| Métrica | Resultado |
|---|---|
| LIO esférica recomendada idéntica | 214 / 232 (92.2 %) |
| Error de la tabla de refracciones | mediana 0.010, p95 0.090, máx. 0.200 D |
| Eje de la LIO dentro de 1° | 89.7 % |
| Cilindro tórico recomendado idéntico | 182 / 232 (78.4 %) |
| Error del cilindro residual | mediana 0.050, p95 0.240 D |

En los tres bloques, un pequeño porcentaje de casos generados al azar cae en la zona de
potencia de LIO muy baja y **la calculadora los rechaza** en lugar de responder; por eso el
número de casos evaluados es menor que el generado.

### 5.5 Caso de referencia trazado a mano

Ojo: AL 23.50, K 43.00@180 / 45.00@90, ACD 3.20, LT 4.50, CCT 550, diana 0,
constante A 119.30, Tecnis, SIA 0.10@100.

| Salida | EVO | Esta calculadora |
|---|---|---|
| Tabla esférica | 0.74 / 0.44 / 0.13 / −0.19 / −0.50 | 0.74 / 0.43 / 0.11 / −0.20 / −0.52 |
| LIO recomendada | 21.0 | **21.0** |
| Cilindro | 1.50 | **1.50** |
| Eje de la LIO | 89° | **89°** |
| Cilindro residual | −0.10 @ 179° | **−0.10 @ 179°** |
| Equivalente de desenfoque | 0.18 | 0.16 |

### 5.6 Caso clínico real (miopía magna, biometría Anterion)

Paciente con AL 29.39 mm (OD) y 31.10 mm (OS), córneas de 35–37 D. Fue el caso que obligó
a ampliar el dominio: con las tablas iniciales (AL 20–28, K 38–50) la calculadora lo
rechazaba. Nota: el Anterion informa *AQD*; para EVO debe usarse **CCT + AQD**.

| Ojo / lente | Salida | EVO | Esta calculadora |
|---|---|---|---|
| OD, B&L Aspire, A 119.10 | LIO / cilindro / eje | 14.5 / 3.50 / 7° | **14.5 / 3.50 / 7°** |
| OD, B&L Envy, A 119.28 | LIO / cilindro / eje | 14.5 / 3.50 / 7° | **14.5 / 3.50 / 7°** |
| OS, B&L Aspire, A 119.10 | LIO / cilindro / eje | 12.0 / 0.90 / 167° | **12.0 / 0.90 / 167°** |
| OS, B&L Envy, A 119.28 | LIO / cilindro / eje | 12.0 / 0.90 / 167° | **12.0 / 0.90 / 167°** |

Diferencia máxima en las tablas de refracción: **0.02 D**. Los cuatro cálculos coinciden en
potencia y cilindro. En OD el cilindro residual previsto es −0.01 D (EVO) frente a −0.02 D
(aquí): con un residuo prácticamente nulo el eje que se informa carece de significado, y por
eso uno indica 7° y el otro 97°.

---

## 6. Interpretación honesta de los resultados

**Lo que es sólido.** El motor esférico está prácticamente resuelto: en configuración
estándar reproduce la potencia recomendada en el 99.5 % de los casos y las refracciones
con error mediano de 0.000 D. Eso no es un ajuste afortunado: la estructura (fórmula de
vergencia, equivalencia exacta ACD↔constante A, media aritmética de K) se dedujo con
pruebas de igualdad exacta, no estadísticas.

**Lo que es bueno pero no perfecto.** El eje de la LIO cae dentro de 1° en el 98 % de los
casos estándar. Un grado de divergencia corresponde a ~3 % del efecto cilíndrico (pérdida
ÓPTICA, por composición de doble ángulo) e impide la igualdad literal. Si ese margen es o no
relevante en el resultado de un paciente es una pregunta clínica que este trabajo no responde.

**Lo que es la principal limitación.** El cilindro tórico recomendado coincide en el
77–84 % de los casos. Cuando difiere, es **siempre en un escalón adyacente** y ocurre en
situaciones límite, en las que el astigmatismo total cae cerca de la frontera entre dos
cilindros disponibles. Dos causas se suman:

1. El modelo de córnea posterior tiene un error residual de ~0.07 D (rms), del que una
   parte parece ser una dependencia de la longitud axial que no es físicamente
   interpretable y que probablemente refleja un detalle del transferidor corneal de EVO
   que no se ha logrado identificar.
2. La propia regla de recomendación de EVO solo se reproduce al 96 % incluso conociendo
   sus residuos exactos: hay un ~4 % de casos en que EVO elige un cilindro que no es el
   que minimiza el astigmatismo residual mostrado, por un criterio interno no identificado.

**Conclusión práctica.** La reproducción de EVO es alta y estable en potencia esférica y en
eje, y menos estable en cilindro cerca de las fronteras de escalón. Esto describe **fidelidad
a EVO, no exactitud clínica**: ningún resultado de este documento está contrastado contra
refracción postoperatoria. Para el cilindro, en casos límite: si el astigmatismo residual previsto es parecido para dos cilindros contiguos,
conviene contrastar con la calculadora oficial.

---

## 7. Alcance no cubierto

Estas funciones de EVO **no** están implementadas y la calculadora no debe usarse para
ellas:

- Ojos post-LASIK / PRK / queratotomía radial (los tres modos del desplegable).
- Biómetro Argos (longitud axial segmentada).
- Córnea posterior **medida** (campos PK1/PK2 de opciones avanzadas).
- ACD vacío: aquí es obligatorio.
- Ojos fuera de **AL 20–32 mm**, **K media 34–50 D** o constante A efectiva 110–125.
- Combinaciones en las que la potencia de LIO necesaria baja de ~6 D (ojos muy largos con
  córneas curvas). Ahí EVO cambia de comportamiento y deja de comportarse como una fórmula
  de vergencia: el ajuste de Möbius, que en el resto del dominio encaja a 0.007 D, se
  degrada a 0.4–0.7 D. El motor lleva una **máscara de validez nodo a nodo** construida con
  ese criterio (693 nodos válidos de 936).

En los cuatro últimos supuestos el motor **rechaza el cálculo con un mensaje explícito** en
lugar de extrapolar; se prefiere no dar respuesta a dar una respuesta poco fiable.

---

## 8. Reproducibilidad

- `engine.js` se genera automáticamente a partir de las tablas medidas; contiene las
  superficies interpoladas, la tabla de cilindros de los 29 modelos, las correcciones por
  modelo y los coeficientes del modelo corneal.
- Todas las consultas al servidor quedaron cacheadas (8.311 entradas), de modo que los
  ajustes y las validaciones pueden repetirse sin volver a consultar la web.
- El panel `dashboard.html` resume la validación completa (1.206 casos comparados uno a
  uno, con desglose por escenario y por modelo de LIO) y se regenera desde la caché.
- Las validaciones usan generadores con semilla fija, por lo que los conjuntos de casos son
  reproducibles exactamente.
