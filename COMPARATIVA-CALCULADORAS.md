# Comparativa de calculadoras de LIO ante un mismo caso

**Título:** Comparativa de resultados: EVO Toric v2.0, réplica local, Barrett Universal II y Kane
**Versión:** 1.0
**Fecha:** 09/08/2026
**Autor:** G. Vila (elaboración asistida por IA)

---

## 1. Objeto y alcance

Comparar, **ante los mismos datos biométricos**, el resultado de cuatro calculadoras de
potencia de lente intraocular. El caso empleado es real (biometría Heidelberg Anterion,
exploración de 03/07/2026): miopía magna bilateral con longitudes axiales de 29.39 y
31.10 mm. Se han omitido todos los datos identificativos del paciente.

Este es precisamente el tipo de ojo donde las fórmulas más discrepan entre sí, por lo que
la comparativa muestra el rango real de desacuerdo, no el caso cómodo.

| Calculadora | Naturaleza | Origen del resultado en este informe |
|---|---|---|
| **EVO Toric v2.0** (evoiolcalculator.com) | Fórmula propietaria (T.K. Yeo), cálculo en servidor | Consulta directa a la web con los datos del caso |
| **Réplica local** (calculadora-torica.html) | Réplica de EVO calibrada por muestreo (véase INFORME.md) | Cálculo local |
| **Barrett Universal II** | Fórmula propietaria (G. Barrett), integrada en el Anterion | Informe impreso del propio biómetro (mismo examen) |
| **Kane** (iolformula.com) | Fórmula propietaria con componente de IA | **Pendiente** — requiere introducción manual (§7) |

## 2. Datos de entrada comunes

| Parámetro | OD | OS |
|---|---|---|
| Longitud axial | 29.39 mm | 31.10 mm |
| K plana | 35.11 D @ 99° | 35.52 D @ 62° |
| K curva | 37.47 D @ 9° | 35.93 D @ 152° |
| Astigmatismo corneal anterior | 2.36 D | 0.41 D |
| ACD óptica (CCT + AQD) | 4.15 mm | 4.14 mm |
| Grosor de cristalino | 3.63 mm | 3.64 mm |
| CCT | 472 µm | 457 µm |
| Refracción diana | 0.00 D | 0.00 D |
| Índice queratométrico | 1.3375 | 1.3375 |

Lentes evaluadas: B&L **Aspire** (constante A 119.10) y B&L **Envy** (constante A 119.28),
las mismas en las cuatro columnas.

> Nota técnica: el Anterion informa por separado AQD (humor acuoso) y CCT. EVO y Kane
> esperan la ACD óptica medida desde el epitelio, es decir **CCT + AQD** (4.15 / 4.14 mm).
> Usar el AQD a secas (3.68 mm) desplazaría el resultado.

## 3. Ojo derecho (AL 29.39 mm) — refracción prevista según potencia de LIO

**Lente Aspire, constante A 119.10:**

| Potencia (EE) | EVO | Réplica | Barrett UII | Kane |
|---|---|---|---|---|
| 14.0 D | +0.39 | +0.40 | +0.59 | — |
| **14.5 D** | **+0.05 ◄** | **+0.06 ◄** | +0.25 | — |
| **15.0 D** | −0.30 | −0.29 | **−0.10 ◄** | — |
| 15.5 D | −0.64 | −0.64 | −0.45 | — |

**Lente Envy, constante A 119.28:**

| Potencia (EE) | EVO | Réplica | Barrett UII | Kane |
|---|---|---|---|---|
| 14.0 D | +0.47 | +0.48 | +0.66 | — |
| **14.5 D** | **+0.13 ◄** | **+0.14 ◄** | +0.32 | — |
| **15.0 D** | −0.21 | −0.20 | **−0.03 ◄** | — |
| 15.5 D | −0.55 | −0.55 | −0.38 | — |

◄ = potencia recomendada por cada calculadora.

**Lectura OD:** EVO y la réplica recomiendan **14.5 D**; Barrett recomienda **15.0 D**
(medio escalón más). A igual potencia, Barrett predice una refracción ~**0.19–0.20 D más
hipermetrópica** que EVO, de forma casi constante en toda la tabla. La réplica difiere de
EVO en 0.01 D como máximo.

## 4. Ojo izquierdo (AL 31.10 mm) — refracción prevista según potencia de LIO

**Lente Aspire, constante A 119.10:**

| Potencia (EE) | EVO | Réplica | Barrett UII | Kane |
|---|---|---|---|---|
| 11.5 D | +0.18 | +0.19 | +0.77 | — |
| **12.0 D** | **−0.17 ◄** | **−0.16 ◄** | +0.46 | — |
| **12.5 D** | −0.52 | −0.51 | **+0.14 ◄** | — |
| 13.0 D | −0.87 | −0.86 | −0.19 | — |

**Lente Envy, constante A 119.28:**

| Potencia (EE) | EVO | Réplica | Barrett UII | Kane |
|---|---|---|---|---|
| **12.0 D** | **−0.10 ◄** | **−0.09 ◄** | +0.51 | — |
| 12.5 D | −0.45 | −0.44 | +0.19 | — |
| **13.0 D** | −0.80 | −0.79 | **−0.13 ◄** | — |
| 13.5 D | — | — | −0.46 | — |

**Lectura OS:** EVO y la réplica recomiendan **12.0 D**; Barrett recomienda **12.5 D**
(Aspire) y **13.0 D** (Envy) — entre medio y **un escalón entero** más de potencia. A
igual potencia, Barrett predice **0.59–0.68 D más hipermetropía** que EVO. Dicho de otro
modo: para dejar este ojo en el mismo punto, Barrett pide hasta 1.0 D más de lente. La
réplica difiere de EVO en 0.01 D.

## 5. Recomendación tórica (cilindro y eje)

El informe impreso del Anterion solo incluye el módulo **esférico** de Barrett (Universal
II); su versión tórica es una calculadora separada (ASCRS). Por tanto aquí solo pueden
compararse EVO y la réplica:

| | EVO | Réplica | Barrett Toric | Kane Toric |
|---|---|---|---|---|
| OD — cilindro / eje | 3.50 D @ 7° | **3.50 D @ 7°** | — | — |
| OD — residual previsto | −0.01 D | −0.01 D | — | — |
| OS — cilindro / eje | 0.90 D @ 167° | **0.90 D @ 167°** | — | — |
| OS — residual previsto | −0.04 D | −0.03 D | — | — |

## 6. Concordancia numérica frente a EVO (este caso)

Desviación media de la refracción prevista a igual potencia, tomando EVO como referencia:

| Comparación | OD | OS | Recomendación de potencia |
|---|---|---|---|
| **Réplica ↔ EVO** | **0.01 D** | **0.01 D** | **Idéntica en los 4 cálculos** |
| Barrett ↔ EVO | 0.20 D | 0.63 D | Distinta en los 4 (½–1 escalón más) |

Como contexto: sobre 548 casos aleatorios (no solo este), la réplica coincide con EVO en
la potencia esférica el 96–99.5 % según el escenario, con error mediano de refracción de
0.00 D (metodología y tablas completas en INFORME.md). La comparación con Barrett de este
informe se basa en un único caso —el disponible con datos reales—, por lo que sus cifras
ilustran el orden de magnitud, no una estadística.

## 7. Columna Kane: cómo completarla

Kane (iolformula.com) se calcula en su web de forma interactiva y no se ha consultado para
este informe. Para completar la columna basta con introducir manualmente, para cada ojo:
AL, K1/K2 con sus ejes, ACD **4.15 / 4.14** (desde epitelio; si el campo indica «aqueous
depth», usar 3.68 / 3.68 + comprobar la ayuda del campo), LT, CCT, constante A de cada
lente y diana 0.00. Con los cinco pares potencia-refracción que devuelva por ojo y lente,
las tablas de §3–§4 quedan completas y puede recalcularse §6.

## 8. Lectura clínica

1. **La réplica no es una opinión más: es el eco de EVO.** Su columna coincide con EVO
   al céntimo de dioptría y en las cuatro recomendaciones. Sirve para tener EVO offline,
   no para contrastar algoritmos.
2. **Barrett y EVO son dos modelos ópticos distintos del mismo ojo**, y en este caso
   extremo discrepan de verdad: hasta 0.68 D en la refracción prevista y hasta 1.0 D en
   la potencia recomendada (OS con Envy). Ninguna de las dos es «la verdad»: son
   predictores del resultado postoperatorio, ambos de primer nivel en la literatura, y su
   desacuerdo crece con la longitud axial.
3. En ojos así, la decisión no es aritmética sino clínica: qué fórmula ha funcionado
   mejor históricamente en el propio centro con esa familia de lentes y ese rango de ojo,
   y qué lado del error se prefiere (en miopía magna suele preferirse el residual miope,
   lo que favorecería la elección más conservadora de EVO frente a la de Barrett).
4. Para el trabajo diario: el Anterion ya imprime Barrett; la calculadora local aporta la
   columna EVO sin depender de la web. Dos fórmulas independientes visibles a la vez es
   exactamente lo que recomienda la buena práctica en ojos extremos.

## 9. Limitaciones

- Un solo caso clínico con datos de tercero (Barrett del impreso); no es una validación
  estadística entre fórmulas, sino una comparativa demostrativa «ante mismos datos».
- Kane pendiente de introducción manual (§7).
- La columna Barrett procede del módulo integrado en el Anterion (Universal II esférico);
  el Barrett Toric de ASCRS podría añadir la comparación de cilindro y eje.
- Réplica validada solo dentro de su dominio (AL 20–32 mm, K media 34–50 D, sin cirugía
  refractiva previa); detalles en INFORME.md.
