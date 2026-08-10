# OPEN_QUESTIONS — Incertidumbre científica registrada

**Versión:** 1.0 · **Fecha:** 10/08/2026 · RESEARCH USE ONLY
Regla del proyecto: la incertidumbre científica se registra aquí y se resuelve con
evidencia, nunca con suposición.

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
- **Por qué importa:** el sistema de incertidumbre (Sprint 10) propaga sigmas
  DECLARADAS; con sigmas reales, sus intervalos serían informativos por paciente.
- **Evidencia disponible:** ninguna propia; los valores usados en exp004 (0.2/0.4 mm
  de posición; 0.03 mm AL; 0.10 D K) son escenarios declarados, no medidas.
- **Acción:** repetibilidad de dispositivo con fichas técnicas citables y, para la
  posición, datos postoperatorios reales (postop.schema.json).
- **Datos requeridos:** especificaciones de biómetro y cohorte con posición medida.

## #7 · ¿Qué política corneal predice mejor la refracción real?

- **Pregunta:** para un ojo sin radios corneales medidos, ¿debe el motor usar la
  lectura queratométrica como potencia (`KERATOMETRIC_READING`) o recuperar el radio
  físico con el índice del dispositivo (`SINGLE_SURFACE_FROM_RADIUS`)?
- **Por qué importa:** no es una sutileza de convención. exp007 muestra que bajo la
  política de lectura la potencia recomendada **depende de la marca del biómetro**
  (hasta 1.26 D de dispersión entre 1.3375 / 1.3315 / 1.332, y cambio del escalón de
  0.5 D en 27 de 30 casos simulados). La política de radio elimina esa dependencia por
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
  "enfocar en la retina" no está definido. ¿Debe minimizarse el RMS del spot en retina (A),
  llevarse el plano de mejor foco a la retina (B), o anularse el desenfoque equivalente (C)?
- **Por qué importa:** son criterios distintos y, con geometría suficientemente asimétrica,
  dan potencias distintas. Elegir uno sin declararlo esconde una decisión de modelado.
- **Evidencia disponible:** exp008 mide que **con superficies esféricas apenas importa**:
  los tres coinciden dentro de 0.0397 D en el peor caso (pupila 6 mm), muy por debajo del
  escalón comercial de 0.5 D. Es un resultado negativo útil, no una respuesta: la simetría
  de revolución de las superficies esféricas es la que hoy los iguala.
- **Qué lo cambiaría:** asfericidad (V1.2), tilt y descentración (V1.3) y tórico (V1.6)
  rompen esa simetría. La comparación debe **repetirse** tras cada uno de esos sprints.
- **Lo que exige zanjarlo:** cohorte postoperatoria. Ningún criterio se declara preferible
  mientras no exista; `compareObjectives()` existe precisamente para no tener que elegir.
- **PROHIBIDO:** elegir criterio por proximidad a EVO o a cualquier otra calculadora.
