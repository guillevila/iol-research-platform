# LIMITATIONS — Limitaciones vigentes de la plataforma

**Versión:** 1.0 · **Fecha:** 10/08/2026 · RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING

## Limitaciones de fondo (fase actual)

1. **Sin datos postoperatorios reales.** Nada de lo que produce la plataforma es una
   predicción clínica validada; toda refracción simulada está etiquetada como
   SIMULACIÓN. Prohibido: tratarla como ground truth, entrenar ML contra ella o
   declarar superioridad sobre ninguna fórmula.
2. **Predictores de posición no calibrados.** Los disponibles usan parámetros
   declarados (offset constante, fracción de AL) y sirven solo para sensibilidad y
   estructura; los de literatura están BLOCKED hasta tener fuente con coeficientes
   (OPEN_QUESTIONS #2) y el ML hasta tener datos reales.
3. **Geometría de LIO comercial desconocida.** El ray tracing usa la genérica
   etiquetada (`generic:true`); ningún resultado puede atribuirse a una lente
   comercial concreta (OPEN_QUESTIONS #4).
4. **Índices oculares convencionales pendientes de cita formal** (OPEN_QUESTIONS #1);
   son configurables y ningún test depende de su valor absoluto.

## Limitaciones del motor físico actual

5. **Esférico:** el motor tórico independiente es Sprint 9; el eje/cilindro solo los
   produce hoy el benchmark legacy.
6. **Ray tracer:** superficies esféricas/planas centradas; sin asfericidad, tilt ni
   descentración de superficies (Sprint 4/8); métrica de foco = RMS geométrico (sin
   MTF/difracción). El builder del ojo completo para trazado está pendiente
   (hoy el ojo completo se evalúa en paraxial).
7. **Córnea sin radios medidos:** se usa la lectura queratométrica como potencia,
   documentado como convención de lectura — no como física (OPEN_QUESTIONS #3).

## Limitaciones del benchmark legacy (heredadas y documentadas en EVO_BASELINE.md)

8. Fidelidad a EVO v2.0 en fechas de muestreo; dominio AL 20–32 / K 34–50 / A 110–125;
   sin post-refractiva, Argos ni córnea posterior medida; histéresis Zeiss 709/939;
   la propia regla de recomendación de EVO solo se auto-reproduce al 96.2 %.

## Limitaciones de los datos sintéticos

9. Rangos uniformes declarados, no distribuciones poblacionales: los agregados de
   experimentos aleatorios se leen condicionalmente (OPEN_QUESTIONS #5,
   SYNTHETIC_DATA.md).

## Regulatorio

10. Todo el software de esta etapa es RESEARCH USE ONLY; ninguna salida constituye
    recomendación quirúrgica validada.
