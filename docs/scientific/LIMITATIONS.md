# LIMITATIONS — Limitaciones vigentes de la plataforma

**Versión:** 1.2 · **Fecha:** 19/08/2026 · RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING
*(v1.2, auditoría de cierre de V1: el documento se había quedado en V1.6 — no registraba el
predictor H_EQ, ni una sola limitación del sistema de incertidumbre, ni los límites numéricos
que V1.9/V1.11/V1.12/V1.14 midieron. Ver también [`../V1_CLOSURE.md` §5](../V1_CLOSURE.md).)*

## Limitaciones de fondo (fase actual)

1. **Sin datos postoperatorios reales.** Nada de lo que produce la plataforma es una
   predicción clínica validada; toda refracción simulada está etiquetada como
   SIMULACIÓN. Prohibido: tratarla como ground truth, entrenar ML contra ella o
   declarar superioridad sobre ninguna fórmula.
2. **Predictores de posición no calibrados.** Los disponibles usan parámetros declarados
   (offset constante, fracción de AL) o una hipótesis geométrica declarada
   (`EquatorialPlanePredictor`, desde V1.11), y sirven solo para sensibilidad y estructura;
   los de literatura están BLOCKED hasta tener fuente con coeficientes (OPEN_QUESTIONS #2) y
   el ML hasta tener datos reales.
2 bis. **H_EQ es una hipótesis, no un hecho.** `EquatorialPlanePredictor` implementa una
   hipótesis de DOS cláusulas separables —(i) la LIO se asienta en el ecuador capsular;
   (ii) ese ecuador se aproxima preoperatoriamente por ACD + LT/2, con residual biológico
   ε_bio— y **ninguna de las dos está validada**. No tiene parámetros libres ni calibración.
   Escribirla como «H_EQ = ACD + LT/2» la convertiría en una definición irrefutable: el proxy
   no es la hipótesis. Validarla exige posición de LIO **medida** en cohorte postoperatoria.
   Nota adicional: el predictor **calcula** el ecuador; el ecuador **medido** por OCT
   (`lens_eq_plane_mm`) sigue siendo un campo reservado y sin consumir (OQ #3, #10).
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
   la propia regla de recomendación de EVO solo se auto-reproduce al 96.2 % (cifra y regla en
   `INFORME.md`).

## Limitaciones de los datos sintéticos

11. Rangos uniformes declarados, no distribuciones poblacionales: los agregados de
   experimentos aleatorios se leen condicionalmente (OPEN_QUESTIONS #5,
   SYNTHETIC_DATA.md).

## Limitaciones del sistema de incertidumbre (V1.12)

12. **Toda sigma es un ESCENARIO DECLARADO, no una distribución medida** (OQ #6). Ningún
    percentil ni intervalo publicado por la capa de incertidumbre es un intervalo de
    paciente: describe un mundo declarado, no una población observada.
13. **La correlación entre variables, si se declara, también es un escenario.** Por defecto
    se asume INDEPENDENCIA, y esa asunción viaja explícita en la salida.
14. **La distribución publicada puede estar CENSURADA.** Si alguna extracción cae fuera de
    los rangos de plausibilidad del modelo, se rechaza y se cuenta: las colas quedan
    truncadas y la desviación típica publicada está sesgada a la baja. La salida lo advierte
    (`advertencia_censura`) en lugar de callarlo.
15. **Dos preguntas distintas que no se resumen una en la otra:** la incertidumbre del
    RESULTADO con una lente fija (continua) y la INESTABILIDAD DE LA ELECCIÓN de escalón
    (discreta). Publicar solo la primera oculta con qué frecuencia cambiaría la lente elegida.
16. **El Monte Carlo paraxial heredado (`montecarlo.mjs`) tiene defectos medidos** que se
    conservan por reproducibilidad de exp004: su PRNG (LCG) infla la varianza de las normales
    un 1.3–2.8 % según semilla, y su convención de percentil (redondeo) difiere de la
    interpolación lineal que usan los módulos nuevos.

## Límites numéricos medidos del motor (V1.9 · V1.11 · V1.12 · V1.14)

17. **El muestreo del haz introduce un sesgo de cuadratura ~O(1/n_anillos)** que afecta a
    valores absolutos (nominal, media, percentiles) pero no a magnitudes de modo común como
    la desviación típica. Con `n_anillos = 5` llegó a sobreestimar |ΔP| ~7 %, y el ancla
    apertura→0 **no lo detectaba**.
18. **La potencia trazada absoluta no está convergida en muestreo** (deriva ~−8e−3 D entre 40
    y 160 anillos, y sigue derivando a 320). Entre motores solo es interpretable la
    **respuesta diferencial**.
19. **El ancla apertura→0 valida el límite, no la pupila finita.** Que el trazado converja al
    paraxial cuando la apertura tiende a cero no demuestra que toda divergencia a pupila
    finita sea «la apertura».
20. **Bicónica, incidencias rasantes:** un doble cruce a distancia sub-muestra (tangencia casi
    exacta) se pierde CONTABILIZADO; nunca se devuelve la rama lejana.
21. **`SQUARE_GRID` es no convergente** (limitación medida, no defecto oculto).
22. **Rendimiento:** los buffers reutilizables de la métrica de spot crecen y no encogen
    (≈1.25 MiB en el peor haz que el motor puede generar). Ver `bench/REPORT_V1_14.md`.

## Regulatorio

12. Todo el software de esta etapa es RESEARCH USE ONLY; ninguna salida constituye
    recomendación quirúrgica validada.
