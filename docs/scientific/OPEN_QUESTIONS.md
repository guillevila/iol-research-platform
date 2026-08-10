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
