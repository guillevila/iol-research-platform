# exp011 — Trazado tórico (V1.6): eje, convergencia y rotación

**SIMULACION / NO GROUND TRUTH CLINICO** · commit `a028a96207`

LIO tórica = **sustituto sintético declarado** (la única vía etiqueta→radios, y se
declara); córnea tórica = radios **recuperados** de K1/K2 (no medidos). Ninguna
geometría tórica de este experimento pasa STRICT — por construcción.

## Resumen

| Métrica | Valor |
|---|---|
| Máximo error de recuperación de eje (7 ejes arbitrarios) | **0°** |
| Cilindro del ancla paraxial por meridiano | 3.22662 D |
| Divergencia trazado−paraxial con pupila mínima (r=0.1 mm) | +0.00005 D |
| Divergencia con pupila máxima (r=2.0 mm) | +0.01923 D |
| Máxima divergencia trazado vs composición vectorial (rotación) | **0.0009 D** |

## 1 · Recuperación de eje (córnea tórica FROM_K, ejes arbitrarios)

| Eje declarado | Eje recuperado | Error | Eje minus-cyl (= meridiano plano) |
|---|---|---|---|
| 0° | 0° | 0° | 90° |
| 17° | 17° | 0° | 107° |
| 35° | 35° | 0° | 125° |
| 63.4° | 63.4° | 0° | 153.4° |
| 90° | 90° | 0° | 0° |
| 121° | 121° | 0° | 31° |
| 158° | 158° | 0° | 68° |

## 2 · Convergencia pupila→0 (LIO tórica 3 D sobre córnea esférica)

| Radio de pupila (mm) | Cilindro trazado (D) | Ancla paraxial (D) | Divergencia (D) |
|---|---|---|---|
| 0.1 | 3.22667 | 3.22662 | +0.00005 |
| 0.35 | 3.22718 | 3.22662 | +0.00056 |
| 0.75 | 3.22922 | 3.22662 | +0.0026 |
| 1.25 | 3.23393 | 3.22662 | +0.00731 |
| 2 | 3.24585 | 3.22662 | +0.01923 |

## 3 · Rotación de la LIO tórica sobre córnea tórica (ejes de partida alineados a 90°)

El residual trazado se compara con la **resta vectorial completa** en doble ángulo
construida con los módulos MEDIDOS por el propio análisis (córnea sola y LIO sola).
La columna 2C·|sen θ| es la ley del criterio V1.7 para módulos IGUALES: aquí los
módulos difieren (efectividad de vergencia), así que NO debe coincidir — se incluye
para mostrar que la composición completa es la referencia válida, no una fórmula.

| Rotación | Residual trazado (D) | Vectorial completa (D) | Divergencia (D) | 2C·\|sen θ\| (C=LIO) |
|---|---|---|---|---|
| 0° | 7.60894 | 7.60983 | -0.00089 | 0 |
| 5° | 7.58066 | 7.58154 | -0.00088 | 0.56254 |
| 10° | 7.49604 | 7.4969 | -0.00086 | 1.12079 |
| 15° | 7.35578 | 7.35661 | -0.00082 | 1.67051 |
| 30° | 6.61493 | 6.61558 | -0.00065 | 3.22718 |
| 45° | 5.44223 | 5.44263 | -0.0004 | 4.56393 |
| 60° | 3.93419 | 3.93429 | -0.0001 | 5.58965 |
| 90° | 1.15636 | 1.15546 | +0.0009 | 6.45437 |

## Lectura

1. El autoproblema generalizado recupera ejes arbitrarios con error ≤ 0° — sin depender de ningún plano donde el spot
   pudiera ser casi circular.
2. El cilindro trazado converge al ancla paraxial por meridiano cuando la pupila se
   cierra (la divergencia restante a pupila grande es aberración, no error de eje).
3. El residual por rotación sigue la composición vectorial de doble ángulo con los
   módulos medidos; la ley 2C·|sen θ| del criterio V1.7 es el caso particular de
   módulos iguales y NO sustituye a la resta vectorial completa.

## Lo que este experimento NO demuestra

Nada clínico: la lente es un sustituto sintético declarado (OQ #4), la córnea tórica
procede de K1/K2 bajo una convención (no de mapas de elevación medidos, OQ #10) y la
relevancia clínica de cualquier residual exige datos postoperatorios (OQ #8).
