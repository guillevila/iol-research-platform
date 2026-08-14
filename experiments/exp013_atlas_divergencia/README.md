# exp013 — Atlas AL × K × pupila: divergencia paraxial ↔ trazado (V1.9)

**SIMULACION / NO GROUND TRUTH CLINICO** · commit `d0ed55cfa4`

## Pregunta primaria

Con **posición, córnea y lente idénticas**, ¿dónde y cuánto diverge la potencia óptima
**continua** al sustituir la aproximación paraxial por trazado exacto a apertura finita?
Métrica: **ΔP = P_raytrace − P_paraxial** (D, plano de LIO, sin cuantización).

Los seis controles de V1.8 se **verifican en cada celda** y la celda se rechaza si alguno
difiere: misma posición y procedencia, misma política corneal, **misma lente gruesa de la
misma factory** y misma diana. Casos esféricos (k1 = k2) para que la dimensión tórica
UNSUPPORTED no contamine la pregunta.

## Ancla de convergencia (apertura → 0)

| Pupila | n intentados | n comparables | máx \|ΔP\| | ¿converge < 0.01 D? |
|---|---|---|---|---|
| 0.1 mm | 48 | 48 | 0.00113 D | SÍ |

## A · Resumen por pupila (denominador SIEMPRE presente)

Bandas descriptivas de \|ΔP\|: <0.05 / 0.05-0.10 / 0.10-0.25 / >=0.25 D. **No son umbrales de relevancia**
**clínica** y de ellas no se deduce beneficio alguno (OQ #8).

| Pupila (mm) | n int. | n comp. | n rech. | mediana \|ΔP\| | p95 | máx | mediana firmada | bandas (n intentados→% de comparables) |
|---|---|---|---|---|---|---|---|---|
| 0.1 | 48 | 48 | 0 | 0.0007 | 0.0010 | 0.0011 | -0.0007 | 100.0 % / 0.0 % / 0.0 % / 0.0 % |
| 2 | 48 | 48 | 0 | 0.2921 | 0.4147 | 0.4462 | -0.2921 | 0.0 % / 0.0 % / 25.0 % / 75.0 % |
| 3 | 48 | 48 | 0 | 0.6591 | 0.9328 | 0.9979 | -0.6591 | 0.0 % / 0.0 % / 0.0 % / 100.0 % |
| 4 | 48 | 48 | 0 | 1.1731 | 1.6581 | 1.7590 | -1.1731 | 0.0 % / 0.0 % / 0.0 % / 100.0 % |
| 5 | 48 | 48 | 0 | 1.8361 | 2.5795 | 2.7194 | -1.8361 | 0.0 % / 0.0 % / 0.0 % / 100.0 % |
| 6 | 48 | 48 | 0 | 2.6544 | 3.6524 | 3.7990 | -2.6544 | 0.0 % / 0.0 % / 0.0 % / 100.0 % |

## A · Resumen por longitud axial (apertura finita)

| AL (mm) | n int. | n comp. | n rech. | mediana \|ΔP\| | p95 | máx | mediana firmada | bandas |
|---|---|---|---|---|---|---|---|---|
| 21 | 30 | 30 | 0 | 1.6517 | 3.6879 | 3.7990 | -1.6517 | 0.0 % / 0.0 % / 0.0 % / 100.0 % |
| 22 | 30 | 30 | 0 | 1.4061 | 3.1953 | 3.4311 | -1.4061 | 0.0 % / 0.0 % / 0.0 % / 100.0 % |
| 23 | 30 | 30 | 0 | 1.2137 | 2.8752 | 3.1828 | -1.2137 | 0.0 % / 0.0 % / 0.0 % / 100.0 % |
| 23.5 | 30 | 30 | 0 | 1.1499 | 2.7569 | 3.0896 | -1.1499 | 0.0 % / 0.0 % / 0.0 % / 100.0 % |
| 24 | 30 | 30 | 0 | 1.0965 | 2.6582 | 3.0119 | -1.0965 | 0.0 % / 0.0 % / 0.0 % / 100.0 % |
| 25 | 30 | 30 | 0 | 1.0141 | 2.5061 | 2.8911 | -1.0141 | 0.0 % / 0.0 % / 10.0 % / 90.0 % |
| 26 | 30 | 30 | 0 | 0.9553 | 2.3972 | 2.8021 | -0.9553 | 0.0 % / 0.0 % / 13.3 % / 86.7 % |
| 28 | 30 | 30 | 0 | 0.8812 | 2.2554 | 2.6758 | -0.8812 | 0.0 % / 0.0 % / 16.7 % / 83.3 % |

## A · Resumen por queratometría (apertura finita)

| K (D) | n int. | n comp. | n rech. | mediana \|ΔP\| | p95 | máx | mediana firmada | bandas |
|---|---|---|---|---|---|---|---|---|
| 38 | 40 | 40 | 0 | 1.0426 | 2.7409 | 3.1854 | -1.0426 | 0.0 % / 0.0 % / 7.5 % / 92.5 % |
| 40 | 40 | 40 | 0 | 1.0611 | 2.6559 | 3.7058 | -1.0611 | 0.0 % / 0.0 % / 7.5 % / 92.5 % |
| 42 | 40 | 40 | 0 | 1.0997 | 2.7208 | 3.6269 | -1.0997 | 0.0 % / 0.0 % / 7.5 % / 92.5 % |
| 43.5 | 40 | 40 | 0 | 1.1468 | 2.8162 | 3.6226 | -1.1468 | 0.0 % / 0.0 % / 5.0 % / 95.0 % |
| 45 | 40 | 40 | 0 | 1.2093 | 2.9519 | 3.6661 | -1.2093 | 0.0 % / 0.0 % / 2.5 % / 97.5 % |
| 47 | 40 | 40 | 0 | 1.3163 | 3.1952 | 3.7990 | -1.3163 | 0.0 % / 0.0 % / 0.0 % / 100.0 % |

## A · Monotonía en pupila — OBSERVADA, no impuesta

| Series (AL,K) | con datos | monótonas crecientes | NO monótonas | cambian de signo |
|---|---|---|---|---|
| 48 | 48 | 48 | 0 | 0 |

## A · Decisión de catálogo (solo con discretización EXACTAMENTE idéntica)

Subrejilla declarada, ambos motores sobre los mismos 101 escalones de 0.5 D.

- celdas intentadas: 9; comparables: 9; con divergencia de catálogo calculable: 9
- divergencias de catálogo (D): -1, -0.5, -0.5, -0.5, -1, -1, -0.5, -0.5, -1
- divergencias continuas de las mismas celdas (D): -0.78035, -0.781507, -0.837876, -0.616093, -0.656473, -0.744114, -0.517784, -0.583645, -0.690122

La diferencia entre ambas columnas **es cuantización**, no física.

## A · Sensibilidad a la geometría de la lente

| Lente (sustituto declarado) | n comp. | mediana \|ΔP\| | máx \|ΔP\| |
|---|---|---|---|
| equibiconvexa esférica | 18 | 1.1425 | 2.3577 |
| equibiconvexa asférica (Q = −1 declarada) | 18 | 1.0594 | 2.2351 |

## B · DIVERGENCIA ENTRE MOTORES (secundario, descriptivo)

| n intentados | n comparables | n rechazados | motivos | mediana \|Δ\| | máx \|Δ\| | saturación de catálogo |
|---|---|---|---|---|---|---|
| 48 | 43 | 5 | evo_out_of_domain: 5 | 2.0000 | 2.5000 | 0 celdas |

DIVERGENCIA ENTRE MOTORES: pilas completas con predictor, geometría, política corneal, objetivo y A-constant distintos a la vez. NINGUNA parte de esta cifra se atribuye al trazado. Las refracciones previstas NO se restan (convenciones distintas).

## Lectura (limitada a lo que estos datos de simulación permiten afirmar)

1. Con apertura → 0 la divergencia se anula dentro de la tolerancia: el trazado recupera
   el paraxial del mismo sistema. Cualquier divergencia a apertura finita es, por tanto,
   efecto de la apertura y no un artefacto del montaje.
2. Con apertura finita la divergencia es sistemáticamente NEGATIVA
   (mediana firmada -1.1574 D sobre 
   240 celdas comparables de 
   240 intentadas): con esta lente, el trazado sitúa
   el óptimo por debajo del paraxial. Signo y magnitud se reportan; no se interpreta cuál
   de los dos "acierta" — eso exige datos postoperatorios (OQ #8).
3. La MAGNITUD es propiedad del sistema simulado, no una constante del método. El bloque
   de sensibilidad muestra además algo que este experimento NO estaba diseñado para
   responder: cambiar la LIO a una asférica declarada (Q = −1) apenas mueve la cifra, así
   que la geometría de la lente no parece dominarla. Queda REGISTRADO como candidato a un
   estudio posterior con la córnea y su política como ejes explícitos — no como conclusión.
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
  no es atribuible al trazado ni mide acierto de nadie.
