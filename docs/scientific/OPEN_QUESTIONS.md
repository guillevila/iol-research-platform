# OPEN_QUESTIONS — Incertidumbre científica registrada

**Versión:** 1.2 · **Fecha:** 19/08/2026 · RESEARCH USE ONLY
Regla del proyecto: la incertidumbre científica se registra aquí y se resuelve con
evidencia, nunca con suposición.

## Estado tras el cierre de V1 (auditoría pregunta a pregunta, V1.15)

Cada pregunta se revisó **contra el código**, no contra su propia redacción. Vocabulario:

- **ABIERTA · EXTERNA** — nada que programar la resuelve; espera un dato, una ficha o una
  publicación que no está en este repositorio.
- **PARCIAL** — una parte quedó resuelta y se dice cuál; el resto sigue abierto y se dice
  por qué.
- **RESUELTA** — con la capacidad que la resolvió.

| OQ | Tema | Estado | Qué la desbloquearía |
|---|---|---|---|
| #1 | Índices de refracción del ojo de simulación | **ABIERTA · EXTERNA** | una cita bibliográfica verificable |
| #2 | Modelos de literatura para posición de LIO | **ABIERTA · EXTERNA** | la publicación con sus coeficientes (**es lo que mantiene V1.10 BLOCKED**) |
| #3 | Convenciones de «posición de LIO» | **PARCIAL** | especificación del dispositivo postoperatorio + posicionamiento por planos principales |
| #4 | Geometría real de LIO comerciales | **ABIERTA · EXTERNA** | fichas de fabricante |
| #5 | Distribuciones poblacionales para sintéticos | **ABIERTA · EXTERNA** | estudio poblacional citable |
| #6 | Sigmas reales de medida y biología | **PARCIAL** | repetibilidad citable + cohorte con posición medida |
| #7 | Qué política corneal se acerca más a la refracción real | **ABIERTA · EXTERNA** | cohorte postoperatoria con biómetro identificado |
| #8 | Qué criterio óptico debe optimizar el trazado | **PARCIAL** | cohorte postoperatoria |
| #9 | Procedencia y comparabilidad de la Q corneal | **ABIERTA · EXTERNA** | esquema de procedencia de dispositivo/zona/convención |
| #10 | Radios corneales per-meridiano MEDIDOS | **ABIERTA · EXTERNA** | tomografía con radios por meridiano y cara |
| #11 | Marcas de LIO tórica ↔ eje de la geometría | **ABIERTA · EXTERNA** | ficha de fabricante con esa relación |

**Ninguna** de las once se resolvió escribiendo código, y eso es coherente con lo que son:
la mayoría son dependencias del mundo exterior: **8 ABIERTAS · EXTERNAS y 3 PARCIALES**
(#3, #6, #8). Las tres PARCIALES lo son porque V1 construyó la maquinaria que las consumirá
—o cerró una sub-pregunta concreta—, no porque haya respondido la pregunta científica.

---

## #1 · Índices de refracción del ojo de simulación

- **Pregunta:** ¿qué valores de índice usar para córnea, acuoso y vítreo en el modelo
  físico, y con qué cita formal?
- **Por qué importa:** desplazan potencia corneal y vergencias; son la base del motor C.
- **Evidencia disponible:** los valores convencionales de ojos esquemáticos clásicos
  (córnea ≈ 1.376; acuoso/vítreo ≈ 1.336) son de uso universal en biometría, y 1.336
  es además consistente con el comportamiento reproducido del propio EVO (nv=1336 en
  el legacy). Se han declarado en `src/optics/constants.mjs` como *convencionales,
  pendientes de cita formal*.
- **Experimento/acción:** añadir cita bibliográfica verificable (Gullstrand/Le Grand,
  edición concreta) cuando haya acceso a la fuente; los tests no dependen de los
  valores absolutos (usan formas cerradas).
- **Datos requeridos:** ninguno clínico; solo bibliografía.

## #2 · Modelos de literatura para posición de LIO

- **Pregunta:** ¿qué modelo publicado de predicción de posición implementar primero
  (p. ej. tipo C-constant) y con qué coeficientes exactos?
- **Por qué importa:** es el comparador natural de los predictores propios.
- **Evidencia disponible:** existen familias publicadas; sus coeficientes NO están en
  este repositorio y escribirlos de memoria está prohibido.
- **Acción:** conseguir la publicación concreta; implementar
  `LiteraturePositionPredictor` citando fórmula y tabla de coeficientes.
- **Datos requeridos:** la fuente (PDF/DOI) delante.

## #3 · Convenciones de "posición de LIO" entre fuentes

- **Pregunta:** ¿cómo se mapean entre sí `iol_position_mm` (nuestro datum: ápex →
  plano principal), la ACD postoperatoria medida (ápex/endotelio → superficie anterior
  de la LIO) y la "ELP" de cada fórmula (parámetro efectivo no anatómico)?
- **Por qué importa:** mezclar convenciones introduce sesgos de décimas de mm que la
  sensibilidad (exp001) demuestra relevantes.
- **Acción:** al importar datos reales, registrar SIEMPRE dispositivo y definición; la
  conversión superficie↔plano principal exige espesor e índice de la LIO (si son
  UNKNOWN, la conversión queda etiquetada como aproximación).
- **Adenda (revisión de fidelidad):** el propio motor reinterpretaba el datum — los
  builders posicionan la lente gruesa por su CENTRO geométrico, que solo coincide con
  los planos principales en lentes simétricas (para una asimétrica plausible el sesgo
  medido es ~0.3 mm ≈ 0.4 D). Ahora ese supuesto se REGISTRA (y bloquea en STRICT);
  resolver la convención exige implementar el posicionamiento por planos principales
  calculados de la geometría.
- **Estado (V1.11):** resuelta la parte INTERNA. El datum del modelo está declarado en un
  solo sitio y es coherente de extremo a extremo: ápex corneal anterior = z = 0
  (`units.mjs`), `acd_mm` medida desde epitelio (`eye.mjs`), de modo que ACD + LT/2 **es**
  directamente un `iol_position_mm` válido sin corrección por CCT — y eso queda escrito en
  el docstring de `EquatorialPlanePredictor`, junto con la advertencia de que un ACD medido
  desde ENDOTELIO por otro dispositivo NO es válido sin conversión explícita.
  Sigue abierta la parte EXTERNA (qué convención usa cada dispositivo postoperatorio) y la
  INTERNA pendiente de la adenda: el posicionamiento por planos principales calculados de
  la geometría, hoy sustituido por el centro geométrico con el supuesto registrado.
- **Datos requeridos:** especificación del dispositivo de medida postoperatoria.

## #4 · Geometría real de LIO comerciales

- **Pregunta:** ¿radios/espesor/índice/asfericidad reales por modelo y potencia?
- **Por qué importa:** sin ella, el ray tracing usa la genérica etiquetada y no puede
  atribuirse a una lente comercial.
- **Evidencia disponible:** ninguna en el repo; los fabricantes rara vez lo publican.
- **Acción:** solicitar fichas técnicas/patentes por modelo; mientras tanto,
  `generic:true` y `unknown_parameters` en `IOLModel`.
- **Datos requeridos:** documentación de fabricante.

## #5 · Distribuciones poblacionales para sintéticos "realistas"

- **Pregunta:** ¿qué distribuciones (media/desviación/correlaciones AL–K–ACD…) usar
  para sintéticos aleatorios más allá de rangos uniformes declarados?
- **Por qué importa:** los resúmenes agregados de experimentos aleatorios dependen de
  la distribución; con uniformes solo son válidos los análisis condicionales.
- **Acción:** hasta tener fuente poblacional citable o datos propios, el generador usa
  RANGOS UNIFORMES DECLARADOS y lo etiqueta (`distribution:'uniform_declared'`).
- **Datos requeridos:** estudio poblacional citable o base propia.

## #6 · Incertidumbres reales de medida y biológicas (sigmas)

- **Pregunta:** ¿qué desviaciones típicas reales tienen la posición postoperatoria de
  la LIO (dado un predictor), la AL, la queratometría y la ACD por dispositivo?
- **Por qué importa:** el sistema de incertidumbre propaga sigmas DECLARADAS; con sigmas
  reales, sus intervalos serían informativos por paciente.
  *(Corrección de referencia, V1.15: este párrafo decía «el sistema de incertidumbre
  (Sprint 10)», refiriéndose al Sprint 10 del plan de **V0** —el Monte Carlo paraxial de
  `montecarlo.mjs`—. Hoy «V1.10» es otra cosa por completo: los predictores de literatura,
  que siguen BLOCKED. La referencia inducía a error y se retira.)*
- **Evidencia disponible:** ninguna propia; los valores usados en exp004 (0.2/0.4 mm
  de posición; 0.03 mm AL; 0.10 D K) son escenarios declarados, no medidas.
- **Estado (V1.12):** la MAQUINARIA para consumir sigmas reales ya existe —
  `raytrace_uncertainty.mjs` exige `{sd, tipo, provenance}` por variable
  (`SigmaTipo.FICHA_TECNICA` / `MEDIDA` con cita sustancial obligatoria), admite
  correlaciones declaradas con procedencia y separa resultado-con-LIO-fija de
  inestabilidad-de-elección (exp014). Lo ÚNICO que falta es la fuente real; al
  llegar, se declara con su cita y todo lo demás funciona sin cambios.
- **Acción:** repetibilidad de dispositivo con fichas técnicas citables y, para la
  posición, datos postoperatorios reales (postop.schema.json).
- **Datos requeridos:** especificaciones de biómetro y cohorte con posición medida.

## #7 · ¿Qué política corneal predice mejor la refracción real?

- **Pregunta:** para un ojo sin radios corneales medidos, ¿debe el motor usar la
  lectura queratométrica como potencia (`KERATOMETRIC_READING`) o recuperar el radio
  físico con el índice del dispositivo (`SINGLE_SURFACE_FROM_RADIUS`)?
- **Por qué importa:** exp007 muestra que bajo la política de lectura la potencia
  recomendada **depende de la convención de índice queratométrico** bajo la que se
  expresó el dato (hasta 1.26 D de dispersión entre 1.3375 / 1.3315 / 1.332, y cambio
  del escalón de 0.5 D en 27 de 30 casos simulados; sensibilidad sintética, no
  comparación de dispositivos reales). La política de radio elimina esa dependencia por
  construcción, pero desplaza la predicción en bloque ~0.25–0.32 D respecto a la de
  lectura.
- **Evidencia disponible:** solo la incoherencia interna cuantificada (exp007). NO hay
  evidencia sobre cuál se acerca más a la refracción postoperatoria real, porque eso
  exige datos postoperatorios de los que el proyecto carece.
- **Por qué no se puede zanjar razonando:** las fórmulas clásicas están calibradas
  **sobre** la convención del dispositivo; sus constantes absorben el sesgo. Cambiar la
  política sin recalibrar simultáneamente el predictor de posición mueve el sesgo de
  sitio, no lo elimina. Los dos grados de libertad están confundidos y solo se separan
  con datos.
- **Acción:** mantener `KERATOMETRIC_READING` por defecto (elección declarada, no
  heredada) y registrar `cornea_policy` en toda salida. Al disponer de la primera
  cohorte postoperatoria (PROTOCOL_FIRST_CLINICAL_BATCH.md), comparar el error de
  predicción de ambas políticas **con el predictor de posición reajustado en cada una**,
  no a predictor fijo.
- **Datos requeridos:** cohorte con biómetro identificado (y su índice queratométrico
  declarado) + refracción postoperatoria estabilizada.
- **PROHIBIDO:** elegir política, índice o ratio posterior por proximidad a EVO o a
  cualquier otra calculadora.

## #8 · ¿Qué criterio óptico debe optimizar el trazado?

- **Pregunta:** con pupila real los rayos no cortan todos en el mismo punto, así que
  "enfocar en la retina" no está definido. ¿Debe minimizarse el RMS del spot en retina (A)
  o anularse el desenfoque equivalente del mejor foco (C)?
- **Resolución parcial (pre-V1.2):** el conjunto inicial tenía TRES criterios; B (mejor
  foco sobre la retina, coste en mm) resultó ser **equivalente a C como criterio de
  optimización** — mismo argmin, misma computación, distinta unidad (demostración en
  `objective.mjs`, tests en `objective_equivalence.test.mjs`). B pasó a métrica
  reportada. La única salvedad: al desempatar entre dos escalones de catálogo a lados
  OPUESTOS del óptimo, la asimetría de la escala dióptrica (~0.7 % por semiescalón con la
  pendiente del ojo de referencia; ver el cálculo en `objective.mjs`) podría
  en teoría hacer elegir distinto; solo afecta a empates al filo.
- **Por qué importa lo que queda:** A y C sí son criterios distintos y, con geometría
  suficientemente asimétrica, darán potencias distintas. Elegir uno sin declararlo
  esconde una decisión de modelado.
- **Evidencia disponible:** exp008 mide que **con superficies esféricas apenas importa**:
  A y C coinciden dentro de 0.0397 D en el peor caso (pupila 6 mm), muy por debajo del
  escalón comercial de 0.5 D. Es un resultado negativo útil, no una respuesta: la simetría
  de revolución de las superficies esféricas es la que hoy los iguala.
- **Candidato a tercer criterio genuinamente independiente** (no implementado): métrica
  robusta integrada en profundidad de foco (p. ej. RMS promediado sobre ±0.25 D de
  desenfoque), que penaliza soluciones frágiles. Solo tendrá sentido implementarlo cuando
  asfericidad/tilt hagan que A y C se separen de verdad.
- **Qué lo cambiaría:** asfericidad (V1.2), tilt y descentración (V1.3) y tórico (V1.6)
  rompen esa simetría. La comparación debe **repetirse** tras cada uno de esos sprints.
- **Cierre del compromiso con el tórico (auditoría V1.15).** Los dos primeros sprints
  tienen su reevaluación registrada abajo (exp009, exp010). El tercero —el tórico— **no
  puede tenerla, y la razón es más informativa que un número**: desde V1.6,
  `evaluateObjective` **rechaza** cualquier sistema tórico, porque un objetivo ESCALAR
  destruye el astigmatismo y su eje. Es decir, la pregunta «¿A o C en un sistema tórico?»
  está mal formulada: en presencia de astigmatismo el resultado no es un número, es una
  pareja de líneas focales con un eje, y ahí el sustituto no es «otro escalar» sino la
  métrica 2D (`analyzeAstigmaticBundle` + `clinicalFromAstigmaticAnalysis`). El compromiso
  del plan queda por tanto **resuelto por imposibilidad declarada**, no pendiente. Lo que
  sigue abierto es A vs C en sistemas de revolución con asimetría suficiente.
- **Reevaluación tras V1.2 (exp009):** con Q de LIO declarada |Q| ≤ 1 sobre el ojo
  normal, la separación A–C a pupila 6 mm sube de 0.008 D (Q=0) a 0.015 D — se duplica
  pero sigue ~33 veces por debajo del escalón de 0.5 D. La conclusión de exp008
  sobrevive a la asfericidad de LIO en ese rango; el siguiente candidato a separarlos
  es el tilt (V1.3). La Q en sí mueve la potencia óptima hasta 0.15 D (|Q|=1, 6 mm):
  relevante, y sin fichas de fabricante ese dato sigue sin existir para lentes reales.
- **Reevaluación tras V1.3 (exp010):** tampoco la pose separa los criterios — máx A–C
  0.0157 D con tilt ≤7.5° + descentración ≤0.75 mm (0.0025 sin pose): ~32 veces bajo el
  escalón de 0.5 D. Nota metodológica: la primera ejecución de exp010 dio "9.7 D" de
  separación — era la métrica de spot sobre el EJE mezclando prisma con desenfoque
  (corregida a centroide en V1.3), no física. El siguiente candidato del plan era el tórico
  (V1.6) — y resultó no ser evaluable: ver el cierre del compromiso más arriba.
- **Lo que exige zanjarlo:** cohorte postoperatoria. Ningún criterio se declara preferible
  mientras no exista; `compareObjectives()` existe precisamente para no tener que elegir.
- **PROHIBIDO:** elegir criterio por proximidad a EVO o a cualquier otra calculadora.

## #9 · Procedencia y comparabilidad de la asfericidad corneal (Q)

- **Pregunta:** ¿qué dispositivo, zona de ajuste y convención hay detrás de una Q
  corneal "medida"?
- **Por qué importa:** la Q depende de la ZONA DE AJUSTE (6/8/10 mm), del algoritmo del
  topógrafo/tomógrafo y de la convención de signo/definición; dos dispositivos pueden
  reportar Q distintas para la misma córnea. V1.2 hizo la Q trazable y STRICT hoy trata
  "Q numérica presente" como dato completo — **no debe confundirse con "Q comparable
  entre dispositivos"**. Es la misma clase de problema que el índice queratométrico
  (resuelto con `keratometric_index` declarado, exp007): convención sin declarar =
  física que hereda el aparato.
- **Estado:** registrado, no resuelto (a propósito: la integración de dispositivos no
  toca este sprint). El campo `cornea.asphericity_q_*` existe sin metadatos de
  procedencia.
- **Acción futura:** al integrar datos reales, la Q corneal deberá llevar procedencia
  (dispositivo, zona de ajuste, convención) como parte del esquema clínico, y la
  validación STRICT de trazado deberá exigirla — hasta entonces, un trazado STRICT con
  Q "medida" valida el motor bajo LA CONVENCIÓN de esa medida, no una Q universal.
- **PROHIBIDO:** ajustar Q contra EVO o elegir convención por conveniencia.

## #10 · Radios corneales per-meridiano MEDIDOS (córnea tórica STRICT)

- **Pregunta:** ¿qué medida aporta radios corneales POR MERIDIANO de ambas caras, con
  eje, para que una córnea tórica trazada sea "medida" y no derivada?
- **Por qué importa:** V1.6 introdujo la córnea tórica trazable, pero sus dos políticas
  son derivación (radios recuperados de K1/K2 bajo n_k) o declaración (escenario con
  procedencia). El modelo de datos del ojo no tiene radios per-meridiano medidos de
  ninguna cara — así que **ninguna córnea tórica pasa STRICT, por construcción**, y eso
  es correcto: llamar "medida" a una derivación sería el relleno tácito que este
  proyecto prohíbe. La toricidad POSTERIOR real (que los tomógrafos sí miden como
  posterior_k1/k2) tampoco se traza aún: se registra como dato disponible no usado.
- **Estado:** registrado, no resuelto (requiere integración de tomografía/mapas de
  elevación con procedencia, convención y zona — misma clase de problema que OQ #9).
- **Acción futura:** esquema clínico con radios per-meridiano por cara + eje +
  dispositivo/zona/convención; entonces una política TORIC_TWO_SURFACE_MEASURED podrá
  existir y pasar STRICT.
- **PROHIBIDO:** promover K1/K2 a "córnea astigmática medida" para esquivar la puerta.

## #11 · Marcas de implantación de LIO comercial ↔ eje de la geometría tórica

- **Pregunta:** para cada modelo comercial, ¿qué relación EXACTA declara el fabricante
  entre las marcas de eje de la óptica y los meridianos principales de la geometría?
- **Por qué importa:** en este proyecto conviven TRES ejes que no son el mismo: el de
  la GEOMETRÍA tórica (meridiano potente, convención interna: y local + rotation_z),
  el CLÍNICO minus-cylinder del residual (meridiano plano) y las MARCAS de una LIO
  comercial. Los fabricantes marcan "típicamente" el meridiano plano de la óptica,
  pero "típicamente" no es documentación: asumir la correspondencia sin ficha es un
  error de 90° en potencia, exactamente la clase de confusión que la convención
  explícita de astigmatism.mjs existe para impedir.
- **Estado:** registrado, no resuelto. V1.7 trabaja SOLO con el eje de la geometría;
  ninguna función del repo interpreta marcas comerciales.
- **Acción futura:** al documentar una LIO tórica comercial (OQ #4), la ficha deberá
  incluir la relación marcas↔meridianos; hasta entonces, cualquier comparación con
  ejes de implantación clínicos reales queda fuera del alcance.
- **PROHIBIDO:** mapear marcas→geometría por costumbre o por conveniencia.
