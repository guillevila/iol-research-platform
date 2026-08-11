# LIMITATIONS — Limitaciones vigentes de la plataforma

**Versión:** 1.1 · **Fecha:** 11/08/2026 · RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING

## Limitaciones de fondo (fase actual)

1. **Sin datos postoperatorios reales.** Nada de lo que produce la plataforma es una
   predicción clínica validada; toda refracción simulada está etiquetada como
   SIMULACIÓN. Prohibido: tratarla como ground truth, entrenar ML contra ella o
   declarar superioridad sobre ninguna fórmula.
2. **Predictores de posición no calibrados.** Los disponibles usan parámetros
   declarados (offset constante, fracción de AL) y sirven solo para sensibilidad y
   estructura; los de literatura están BLOCKED hasta tener fuente con coeficientes
   (OPEN_QUESTIONS #2) y el ML hasta tener datos reales.
3. **Geometría de LIO comercial desconocida.** El ray tracing solo puede trazar
   geometría numérica completa. Sin ficha de fabricante, una LIO comercial queda con
   `geometry_status = UNKNOWN` y el trazado FALLA explícitamente en vez de sustituirla
   por la genérica; la genérica declarada (`DERIVED_GENERIC`, `is_simulation_surrogate`)
   es un sustituto de simulación y ningún resultado obtenido con ella puede atribuirse
   a una lente comercial concreta (OPEN_QUESTIONS #4).
4. **Índices oculares convencionales pendientes de cita formal** (OPEN_QUESTIONS #1);
   son configurables y ningún test depende de su valor absoluto.

## Limitaciones del motor físico actual

5. **Tórico:** el motor tórico propio existe (vectores de doble ángulo, cálculo por
   meridianos, TCA solo si está MEDIDO). Su limitación real es que sin córnea posterior
   medida el astigmatismo posterior no se estima: queda declarado, no rellenado.
6. **Ray tracer:** superficies esféricas, planas, CÓNICAS (V1.2) y BICÓNICAS (V1.6,
   tóricas: curvaturas y Q por meridiano), con POSE RÍGIDA de la LIO — tilt y
   descentración vectoriales — desde V1.3 (la córnea sigue coaxial). La córnea
   astigmática trazada EXISTE desde V1.6 pero SOLO como política tórica EXPLÍCITA
   (`toric_cornea.mjs`: radios RECUPERADOS de K1/K2 o DECLARADOS con procedencia —
   nunca "medida": el modelo de datos no tiene radios per-meridiano medidos, OQ #10);
   la vía por defecto sigue colapsando a equivalente esférico CON registro. La
   toricidad de LIO se traza SOLO con cara tórica DECLARADA en la geometría (sintética
   etiquetada o fabricante con procedencia): cilindro nominal sin geometría → rechazo.
   Un sistema tórico NO admite objetivos escalares (guardado: `evaluateObjective`
   rechaza) — su descripción es la métrica 2D (`astigmatism.mjs`: dos focos
   principales + meridianos, autoproblema generalizado). Ninguna geometría tórica
   actual pasa STRICT salvo la de fabricante documentada; métrica de foco =
   RMS geométrico alrededor del CENTROIDE del haz (el desplazamiento del centroide es
   apuntamiento, no borrosidad — corregido en V1.3), sin MTF/difracción. Con pose ≠ 0
   NO existe el límite paraxial coaxial: `paraxialFocusOfRaytraceEye` lo rechaza y la
   validación usa reversibilidad, casos analíticos, simetría ±pose y continuidad
   pose→0 (`tests/pose.test.mjs`). La Q corneal "medida" aún no lleva procedencia
   (zona de ajuste/convención): OPEN_QUESTIONS #9.
7. **Córnea sin radios medidos: la política por defecto NO es invariante al
   dispositivo.** `KERATOMETRIC_READING` usa la lectura K como potencia corneal. La
   conversión radio→K emplea un índice ficticio declarado por convención (1.3375 /
   1.3315 / 1.332): en simulación, la misma córnea física expresada bajo dos
   convenciones distintas produce recomendaciones distintas — **hasta 1.26 D**, y en
   27 de 30 casos simulados cambia el escalón de 0.5 D (exp007). La comparación es
   entre CONVENCIONES DE LECTURA aplicadas en simulación, no entre dispositivos
   reales medidos. Desde V0.5 la política es explícita y viaja en cada salida
   (`cornea_policy`), y existe `SINGLE_SURFACE_FROM_RADIUS`, invariante por
   construcción. **Se mantiene la de lectura por defecto** porque cambiarla desplazaría
   en bloque las predicciones sin recalibrar el predictor de posición, y decidir cuál
   predice mejor exige datos postoperatorios que no se tienen (OPEN_QUESTIONS #7).
   No se ha ajustado ninguna constante corneal contra EVO.
8. **Superficie corneal posterior: no se asume.** `TWO_SURFACE_RATIO` existe pero exige
   ratio y procedencia citada explícitos; no hay ratio por defecto, y está prohibido
   derivarlo ajustando contra EVO.

9. **Modo STRICT disponible pero NO por defecto.** Desde la revisión pre-V1.2 existe un
   modo de fidelidad (`src/core/fidelity.mjs`): `RESEARCH` (defecto) sustituye
   parámetros desconocidos por supuestos explícitos registrados en cada salida
   (`assumptions` / `supuestos_trazado` / `supuestos_modelo`); `STRICT` bloquea el
   cálculo ante cualquier supuesto registrado. Hoy pasa STRICT: la vía paraxial de EE
   con córnea de dos superficies MEDIDA, SIN astigmatismo queratométrico (el colapso a
   EE de un cilindro medido se registra y bloquea) y con lente delgada explícita o de
   fabricante SIMÉTRICA (el centrado geométrico de una asimétrica reinterpreta el datum
   del plano principal, OQ #3); la vía tórica con córnea medida INCLUIDA la posterior; y
   desde V1.2, el PRIMER TRAZADO DE RAYOS: córnea medida con Q de topografía en ambas
   caras + lente de fabricante simétrica con Q documentada y cilindro 0 declarado; y
   desde V1.6, el TRAZADO TÓRICO de fabricante: la misma córnea medida + LIO con cara
   tórica DOCUMENTADA (Q por meridiano numéricas y etiqueta coherente con la
   geometría) — la córnea tórica, en cambio, NUNCA pasa STRICT todavía (OQ #10). Sin
   esas Q, el trazado sigue bloqueando con la superficie nombrada. La
   validación clínica futura (VALIDATION_STRATEGY, nivel 3) deberá ejecutarse en STRICT.
   Límite honesto: la puerta garantiza que ningún supuesto REGISTRADO la atraviesa; que
   todo supuesto esté registrado es una disciplina vigilada por tests, no un teorema.
   Semántica exacta: STRICT significa "sin sustituciones/imputaciones registradas del
   caso" — NO "sin supuestos de modelo" (índices convencionales, método y vértice
   permanecen, documentados) ni "máxima fidelidad física": procedencia del dato,
   predicción del modelo e imputación son tres conceptos separados (cabecera de
   `src/core/fidelity.mjs`).

## Limitaciones del benchmark legacy (heredadas y documentadas en EVO_BASELINE.md)

10. Fidelidad a EVO v2.0 en fechas de muestreo; dominio AL 20–32 / K 34–50 / A 110–125;
   sin post-refractiva, Argos ni córnea posterior medida; histéresis Zeiss 709/939;
   la propia regla de recomendación de EVO solo se auto-reproduce al 96.2 %.

## Limitaciones de los datos sintéticos

11. Rangos uniformes declarados, no distribuciones poblacionales: los agregados de
   experimentos aleatorios se leen condicionalmente (OPEN_QUESTIONS #5,
   SYNTHETIC_DATA.md).

## Regulatorio

12. Todo el software de esta etapa es RESEARCH USE ONLY; ninguna salida constituye
    recomendación quirúrgica validada.
