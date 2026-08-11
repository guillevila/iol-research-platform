# exp012 — Rotación de LIO tórica (V1.7): residual por física vs anclas vectoriales

**SIMULACION / NO GROUND TRUTH CLINICO** · commit `e3762ca890`

El residual sale de ROTAR de verdad la geometría bicónica (pose.rotation_z) y
re-trazar; el error de rotación es una cantidad DERIVADA (físico − planificado,
mod 180, firmada). Las anclas (2C·|sen θ| para módulos iguales; resta vectorial
completa en general) VALIDAN el trazado — no lo sustituyen. La distribución real
de rotaciones sigue bloqueada (OQ #6): errores DECLARADOS.

## Componentes medidos (pupila r=0.08 mm)

| Componente | Cilindro efectivo (D) |
|---|---|
| Córnea tórica sola (empinada a 90°) | 4.37747 |
| LIO tórica etiqueta 3 D sola | 3.22665 |
| LIO reetiquetada 4.06998 D (módulos igualados midiendo) | 4.37747 |

## A · Módulos EFECTIVOS igualados — la ley 2·C·|sen θ| como ancla (criterio V1.7)

| Error derivado | Residual trazado (D) | 2C·\|sen θ\| (D) | Divergencia (D) | Fracción de C |
|---|---|---|---|---|
| 0° | 0.00123 | 0 | +0.00123 | 0.0003 |
| 2.5° | 0.38186 | 0.38188 | -0.00003 | 0.0872 |
| 5° | 0.76299 | 0.76304 | -0.00005 | 0.1743 |
| 10° | 1.52017 | 1.52028 | -0.00011 | 0.3473 |
| 15° | 2.26577 | 2.26594 | -0.00017 | 0.5176 |
| 30° | 4.37708 | 4.37747 | -0.00039 | 0.9999 |
| 45° | 6.19003 | 6.19067 | -0.00064 | 1.4141 |
| 60° | 7.58108 | 7.58199 | -0.00091 | 1.7318 |
| 90° | 8.75374 | 8.75493 | -0.00119 | 1.9997 |

A 30° el residual es ≈ C entero (fracción 0.9999) y a 90° ≈ 2C
(fracción 1.9997) — lo que la fórmula errónea C·|sen 2θ| negaba.

## B · Caso general (módulos distintos): resta VECTORIAL completa como ancla

| Error derivado | Vectorial (D) | Trazado r=0.08 (D) | Diverg. (D) | Trazado r=1.5 (D) | Diverg. (D) | Eje residual |
|---|---|---|---|---|---|---|
| 0° | 1.15082 | 1.15172 | +0.0009 | 1.24403 | +0.09321 | 90° |
| 2.5° | 1.19661 | 1.19747 | +0.00086 | 1.28762 | +0.09101 | 83.29° |
| 5° | 1.32422 | 1.32497 | +0.00076 | 1.41005 | +0.08583 | 77.639° |
| 10° | 1.74012 | 1.74063 | +0.00051 | 1.8157 | +0.07558 | 70.549° |
| 15° | 2.26032 | 2.26062 | +0.0003 | 2.33096 | +0.07064 | 67.486° |
| 30° | 3.93051 | 3.93041 | -0.0001 | 4.00614 | +0.07563 | 67.601° |
| 45° | 5.43815 | 5.43775 | -0.0004 | 5.52718 | +0.08903 | 72.02° |
| 60° | 6.61045 | 6.6098 | -0.00065 | 6.71188 | +0.10144 | 77.653° |
| 90° | 7.60412 | 7.60323 | -0.00089 | 7.71674 | +0.11263 | 90° |

## Lectura

1. Con pupila de ancla el trazado coincide con la composición vectorial a ≤ 0.0009 D y con 2C·|sen θ| (módulos
   igualados) a ≤ 0.00123 D: la física reproduce las anclas donde son válidas.
2. A pupila finita (r=1.5 mm) el trazado DIVERGE del vectorial hasta 0.11263 D — aberraciones y efectividad
   que el álgebra de doble ángulo no contiene. Es divergencia entre modelos, no "error".
3. El error de rotación aquí es SIEMPRE derivado de una pose declarada: ningún
   escenario introduce un segundo grado de libertad geométrico de orientación.

## Lo que este experimento NO demuestra

Nada clínico: distribución real de rotaciones bloqueada (OQ #6); lente sustituto
sintético declarado (OQ #4); córnea tórica derivada de K, no medida (OQ #10);
correspondencia con marcas de LIO comerciales sin documentar (OQ #11).
