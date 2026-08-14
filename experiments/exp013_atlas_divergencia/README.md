# exp013 — Atlas AL × K × pupila: divergencia paraxial ↔ trazado (V1.9)

**SIMULACION / NO GROUND TRUTH CLINICO** · commit `1452faa7df`

## Pregunta primaria

Con **posición, córnea y lente idénticas**, ¿dónde y cuánto diverge la potencia óptima
**continua** al sustituir la aproximación paraxial por trazado exacto a apertura finita?
Métrica: **ΔP = P_raytrace − P_paraxial** (D, plano de LIO, sin cuantización).

Los seis controles de V1.8 se **verifican en cada celda** y la celda se rechaza si alguno
difiere: misma posición y procedencia, misma política corneal, **misma lente gruesa de la
misma factory** y misma diana. Casos esféricos (k1 = k2) para que la dimensión tórica
UNSUPPORTED no contamine la pregunta.

## Parámetros numéricos declarados

- **Muestreo**: MERIDIONAL con n_anillos = 40 (80 rayos), CONVERGIDO
  (ver bloque de convergencia). No es un parámetro libre: con 5 anillos la cuadratura
  sobreestimaba |ΔP| ~7 %, y el ancla apertura→0 **no** detecta ese sesgo.
- **Objetivo**: EQUIVALENT_DEFOCUS (desenfoque equivalente del mejor foco).
- **Predictor de posición**: ConstantOffsetPredictor(1.7), el mismo en ambos motores.
- **Rejilla de potencias compartida**: powerGrid(-5, 45, 0.5) — 101 escalones.

## Ancla de convergencia (apertura → 0)

| Pupila | n intentados | n comparables | máx \|ΔP\| | ¿converge < 5e-3 D? |
|---|---|---|---|---|
| 0.1 mm | 48 | 48 | 0.00103 D | SÍ |

Tolerancia 5e-3 D: la de V1.8 a esta misma pupila. El residuo observado **no es ruido**,
es el término físico O(p²) evaluado en 0.1 mm. **Límite del ancla**: solo excluye
artefactos INDEPENDIENTES de la apertura; un sesgo que escale con p² la atraviesa sin ser
visto — exactamente lo que ocurría con el muestreo sin converger.

## A · Convergencia del muestreo (el parámetro se verifica, no se elige)

Subrejilla AL {21, 23.5, 26} × K {40, 47} × pupila {3, 6} mm.

| n_anillos | rayos | n comparables | mediana \|ΔP\| | máx \|ΔP\| |
|---|---|---|---|---|
| 5 | 10 | 12 | 1.4410 | 3.7990 |
| 10 | 20 | 12 | 1.3753 | 3.6266 |
| 20 | 40 | 12 | 1.3423 | 3.5395 |
| 40 | 80 | 12 | 1.3258 | 3.4958 |
| 60 | 120 | 12 | 1.3202 | 3.4811 |

Deriva del último paso: -0.0055 D.

## A · Resumen por pupila (denominador SIEMPRE presente)

Bandas descriptivas de \|ΔP\|: <0.05 / 0.05-0.10 / 0.10-0.25 / >=0.25 D. **No son umbrales de relevancia**
**clínica** y de ellas no se deduce beneficio alguno (OQ #8).

| Pupila (mm) | n int. | n comp. | n rech. | mediana \|ΔP\| | p95 | máx | mediana firmada | bandas (n intentados→% de comparables) |
|---|---|---|---|---|---|---|---|---|
| 0.1 | 48 | 48 | 0 | 0.0007 | 0.0010 | 0.0010 | -0.0007 | 100.0 % / 0.0 % / 0.0 % / 0.0 % |
| 2 | 48 | 48 | 0 | 0.2689 | 0.3818 | 0.4109 | -0.2689 | 0.0 % / 0.0 % / 35.4 % / 64.6 % |
| 3 | 48 | 48 | 0 | 0.6067 | 0.8589 | 0.9196 | -0.6067 | 0.0 % / 0.0 % / 0.0 % / 100.0 % |
| 4 | 48 | 48 | 0 | 1.0800 | 1.5270 | 1.6226 | -1.0800 | 0.0 % / 0.0 % / 0.0 % / 100.0 % |
| 5 | 48 | 48 | 0 | 1.6909 | 2.3792 | 2.5113 | -1.6909 | 0.0 % / 0.0 % / 0.0 % / 100.0 % |
| 6 | 48 | 48 | 0 | 2.4420 | 3.4077 | 3.4958 | -2.4420 | 0.0 % / 0.0 % / 0.0 % / 100.0 % |

## A · Resumen por longitud axial (apertura finita)

| AL (mm) | n int. | n comp. | n rech. | mediana \|ΔP\| | p95 | máx | mediana firmada | bandas |
|---|---|---|---|---|---|---|---|---|
| 21 | 30 | 30 | 0 | 1.5215 | 3.4605 | 3.4958 | -1.5215 | 0.0 % / 0.0 % / 0.0 % / 100.0 % |
| 22 | 30 | 30 | 0 | 1.2952 | 2.9450 | 3.1531 | -1.2952 | 0.0 % / 0.0 % / 0.0 % / 100.0 % |
| 23 | 30 | 30 | 0 | 1.1173 | 2.6436 | 2.9217 | -1.1173 | 0.0 % / 0.0 % / 0.0 % / 100.0 % |
| 23.5 | 30 | 30 | 0 | 1.0583 | 2.5336 | 2.8350 | -1.0583 | 0.0 % / 0.0 % / 0.0 % / 100.0 % |
| 24 | 30 | 30 | 0 | 1.0090 | 2.4419 | 2.7627 | -1.0090 | 0.0 % / 0.0 % / 10.0 % / 90.0 % |
| 25 | 30 | 30 | 0 | 0.9328 | 2.3005 | 2.6504 | -0.9328 | 0.0 % / 0.0 % / 13.3 % / 86.7 % |
| 26 | 30 | 30 | 0 | 0.8784 | 2.1993 | 2.5679 | -0.8784 | 0.0 % / 0.0 % / 16.7 % / 83.3 % |
| 28 | 30 | 30 | 0 | 0.8100 | 2.0680 | 2.4517 | -0.8100 | 0.0 % / 0.0 % / 16.7 % / 83.3 % |

## A · Resumen por queratometría (apertura finita)

| K (D) | n int. | n comp. | n rech. | mediana \|ΔP\| | p95 | máx | mediana firmada | bandas |
|---|---|---|---|---|---|---|---|---|
| 38 | 40 | 40 | 0 | 0.9596 | 2.5312 | 3.4905 | -0.9596 | 0.0 % / 0.0 % / 10.0 % / 90.0 % |
| 40 | 40 | 40 | 0 | 0.9771 | 2.4482 | 3.4238 | -0.9771 | 0.0 % / 0.0 % / 10.0 % / 90.0 % |
| 42 | 40 | 40 | 0 | 1.0121 | 2.5053 | 3.3476 | -1.0121 | 0.0 % / 0.0 % / 10.0 % / 90.0 % |
| 43.5 | 40 | 40 | 0 | 1.0551 | 2.5909 | 3.3409 | -1.0551 | 0.0 % / 0.0 % / 7.5 % / 92.5 % |
| 45 | 40 | 40 | 0 | 1.1123 | 2.7133 | 3.3778 | -1.1123 | 0.0 % / 0.0 % / 5.0 % / 95.0 % |
| 47 | 40 | 40 | 0 | 1.2101 | 2.9333 | 3.4958 | -1.2101 | 0.0 % / 0.0 % / 0.0 % / 100.0 % |

## A · Monotonía en pupila — OBSERVADA, no impuesta

| Series (AL,K) | con datos | monótonas crecientes | NO monótonas | cambian de signo |
|---|---|---|---|---|
| 48 | 48 | 48 | 0 | 0 |

## A · Decisión de catálogo (solo con discretización EXACTAMENTE idéntica)

Subrejilla declarada, ambos motores sobre los mismos 101 escalones de 0.5 D.

- celdas intentadas: 9; comparables: 9; con divergencia de catálogo calculable: 9
- divergencias de catálogo (D): -0.5, -0.5, -0.5, -0.5, -1, -1, -0.5, -0.5, -0.5
- divergencias continuas de las mismas celdas (D): -0.718779, -0.719561, -0.771055, -0.567256, -0.604148, -0.684528, -0.476558, -0.536964, -0.634703

La diferencia entre ambas columnas es compatible con CUANTIZACIÓN, no con física: el
desvío máximo respecto de la continua es 0.3959 D (≤ 0.5 D = un escalón; compatible: SÍ).

## A · Sensibilidad a la ASFERICIDAD Q de la lente

Subrejilla AL {22, 23.5, 25} × K {40, 43.5, 47} × pupila {3, 5} mm. Se varía **un solo**
grado de libertad geométrico (la constante cónica Q de ambas caras); forma base, reparto
de radios, índice y espesor quedan FIJOS — de aquí no se concluye nada sobre "la
geometría" en general.

| Lente (sustituto declarado) | n int. | n comp. | n rech. | mediana \|ΔP\| | máx \|ΔP\| |
|---|---|---|---|---|---|
| equibiconvexa esférica | 18 | 18 | 0 | 1.0514 | 2.1682 |
| equibiconvexa con Q = −1 declarada | 18 | 18 | 0 | 0.9738 | 2.0522 |

## A · Sensibilidad al CRITERIO de foco

Al sustituir paraxial por trazado cambia también el CRITERIO: el paraxial iguala la
refracción de primer orden a la diana; el trazado sitúa el mejor foco por tamaño de spot.
Subrejilla AL {22, 23.5, 25} × K {40, 43.5, 47} × pupila 3 mm:

- **SPOT_RMS_AT_RETINA**: no publicable en el contrato de benchmark — su coste es un radio RMS en mm, no una refracción en dioptrías: el adaptador lo rechaza (V1.8).
- **EQUIVALENT_DEFOCUS**: mediana \|ΔP\| 0.6347 D sobre 9/9 celdas.

**Limitación declarada:** los dos objetivos implementados (A y C) son AMBOS criterios de tamaño de spot, y solo C es publicable en el contrato de benchmark: un criterio genuinamente distinto (p. ej. RMS de frente de onda) no existe en el motor. La atribución "paraxial vs trazado" queda por tanto acotada, no aislada — registrado como candidato en OPEN_QUESTIONS #8

## B · DIVERGENCIA ENTRE MOTORES (secundario, descriptivo)

| n intentados | n comparables | n rechazados | motivos | mediana \|Δ\| | máx \|Δ\| | saturación de catálogo |
|---|---|---|---|---|---|---|
| 48 | 43 | 5 | evo_out_of_domain: 5 | 2.0000 | 2.5000 | 0 celdas |

DIVERGENCIA ENTRE MOTORES: pilas completas con predictor, geometría, política corneal, objetivo y A-constant distintos a la vez. NINGUNA parte de esta cifra se atribuye al trazado. Las refracciones previstas NO se restan (convenciones distintas).

## Lectura (limitada a lo que estos datos de simulación permiten afirmar)

1. Con apertura → 0 la divergencia se anula dentro de la tolerancia: el trazado recupera
   el paraxial del mismo sistema, luego **un artefacto INDEPENDIENTE de la apertura queda
   excluido**. La implicación inversa NO vale: un sesgo que escale con la apertura atraviesa
   el ancla sin ser visto — es lo que pasaba con el muestreo sin converger, y por eso su
   convergencia se verifica aparte.
2. Con apertura finita la divergencia es sistemáticamente NEGATIVA
   (mediana firmada -1.0642 D sobre 
   240 celdas comparables de 
   240 intentadas): en este sistema, el trazado
   sitúa el óptimo por debajo del paraxial. Signo y magnitud se reportan; no se interpreta
   cuál de los dos "acierta" — eso exige datos postoperatorios (OQ #8).
3. La MAGNITUD es propiedad del SISTEMA simulado (córnea + lente + criterio), no una
   constante del método. Variar la ASFERICIDAD Q de la lente la mueve poco
   (1.0514 → 0.9738 D de mediana en la
   subrejilla común), lo que sugiere —sin comprobarlo— que la asfericidad de la LIO no la
   domina. Queda REGISTRADO como candidato a estudio posterior con la córnea y su política
   como ejes explícitos; NO es una conclusión de este experimento.
4. Rechazos: 0 de 240 celdas con apertura finita, y 5 de 48 en el bloque B (evo_out_of_domain). Aparecen en las tablas
   con su denominador: una región que no se puede comparar es un resultado, no un hueco.

## Lo que este experimento NO demuestra

- **Nada clínico.** Ni que el trazado prediga mejor, ni que estas divergencias tengan
  consecuencia refractiva en un paciente: eso exige cohorte postoperatoria (OQ #8).
- Las lentes son **sustitutos de simulación declarados** (OQ #4); las cifras describen su
  geometría, no lentes comerciales.
- La rejilla es **declarada y uniforme**, no una población: las frecuencias por banda no
  son prevalencias (OQ #5).
- El bloque B compara **pilas completas** que difieren en varios canales a la vez; su cifra
  no es atribuible al trazado ni mide acierto de nadie. Sus valores son restas de potencias
  CUANTIZADAS a 0.5 D, así que las bandas descriptivas (pensadas para la continua) no
  describen ahí una distribución: no se aplican al bloque B.
- **Fuera de alcance declarado** (no es que salgan nulos: no se han ensayado): toricidad,
  tilt/descentración (todo el atlas es POSE CERO) y la Q corneal / política corneal, que el
  atlas mantiene fijas. La divergencia observada corresponde al sistema CENTRADO, ESFÉRICO
  y bajo la política corneal por defecto.
- La atribución "paraxial vs trazado" está **acotada, no aislada**: al cambiar de modelo
  cambia también el criterio de foco (ver bloque de sensibilidad al criterio).
