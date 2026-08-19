# exp015 — Pipeline EQ (V1.11): H_EQ a través del pipeline físico real

**SIMULACION / NO GROUND TRUTH CLINICO — analisis condicional bajo H_EQ declarada** · commit `8a1e44b5c3`

**Hipótesis declarada:** H_EQ: posicion de LIO = ecuador capsular; ecuador = ACD + LT/2 + eps_bio (DECLARADA, no hecho). Nada de esto la valida biológicamente.
La conversión posición→resultado de exp006 (linealización paraxial de lente delgada) se
sustituye por el pipeline físico y cada divergencia se atribuye a su causa. Convenciones:
refracción SOLO intra-paraxial; entre motores, POTENCIA CONTINUA con la misma factory.

## Autotest de la cuadratura

- f(δ) = 1.7·δ, σ = 0.3: cuadratura 0.4068 vs forma cerrada 0.4069 (desviación 0.027 %)

## 0 · Anclas vivas de exp006 (leídas de lo publicado; exp006 NO se regenera)

| σ (mm) | brazo | E\|ε\| publicado | forma cerrada σ√(2/π) | desviación |
|---|---|---|---|---|
| 0.2 | base | 0.16 | 0.1596 | 0.3 % |
| 0.3 | base | 0.241 | 0.2394 | 0.7 % |
| 0.4 | base | 0.323 | 0.3192 | 1.2 % |
| 0.05 | eq | 0.04 | 0.0399 | 0.3 % |
| 0.1 | eq | 0.081 | 0.0798 | 1.5 % |
| 0.2 | eq | 0.162 | 0.1596 | 1.5 % |

- las desviaciones observadas (0.27-1.52 %, TODAS positivas) quedan explicadas, sin que sobre nada, por tres contribuciones medidas: (1) sesgo SISTEMÁTICO al alza del LCG de makeRng, +0.84 % sobre E|ε| en media (rango 0.40-1.50 % según semilla, medido a n = 4e5 × 5 semillas; nótese que montecarlo.mjs documenta 1.3-2.8 % de inflación de VARIANZA y E|ε| ∝ σ = √varianza, de ahí que sobre E|ε| sea ~la mitad) — es lo que explica que TODAS tengan el mismo signo; (2) SE del estimador con n = 6000: 0.98 % relativo; (3) granularidad del redondeo publicado a 3 decimales: 1.25 % en σ = 0.05 y 0.16 % en σ = 0.40. Son limitaciones CONOCIDAS del artefacto congelado, no defectos de sus cifras: exp006 NO se regenera.
- **Divergencia de texto registrada:** Lectura 2 del README: «evita ~0.39 D en el corto frente a ~0.11 D en el largo» (hardcodeado en run_exp006.mjs) ↔ las celdas de esa misma tabla dan 0.363 D (corto) y 0.102 D (largo). DIVERGENCIA DE TEXTO registrada aquí; el ancla válida es results.json. Corregir la prosa exigiría regenerar exp006 y el encargo lo prohíbe salvo defecto de CIFRAS demostrado — que no lo hay.

## 1 · Reproducción bit a bit (posición vía predictor de CAPA B)

- celdas idénticas a lo publicado: **27/27**
- nueva procedencia: `equatorial_plane_geometric (H_EQ DECLARADA: LIO en el ecuador capsular ≈ ACD + LT/2 — hipótesis, no hecho; SIMULACION, validación exige datos postoperatorios nivel 3)` (inputs: acd_mm, lt_mm)
- la promoción de H_EQ a predictor de CAPA B es numéricamente NEUTRA: cambia la procedencia (position_source, inputs_used), no una sola cifra. Esto ES «reproduce exp006» en su única lectura ejecutable.

## 2 · Escalera de causas (un cambio por peldaño)

| Ojo | sens delgada (D/mm) | sens gruesa (D/mm) | dP*/dδ gruesa (D/mm) | dP*/dδ trazada (D/mm) | divergencia motor (D/mm) |
|---|---|---|---|---|---|
| corto | 2.2574 | 2.3093 | 3.3541 | 3.2420 | -0.1121 |
| normal | 1.3469 | 1.3895 | 2.0323 | 1.9709 | -0.0614 |
| largo | 0.6358 | 0.6362 | 0.9392 | 0.8996 | -0.0395 |

- La descomposición es un CAMINO (telescópica): delgada→gruesa exige el paraxial y
  gruesa→trazado exige geometría; el orden inverso no es evaluable (no existe trazado
  de lente sin geometría) y por eso no hay bloque de aditividad entre órdenes.
- Las columnas de refracción y de potencia son DOMINIOS distintos: no se restan entre sí.
- Puente declarado (solo lectura): dRef/dP delgada ≈ -0.6746 D/D en el ojo normal.

## 3 · Matriz de beneficio re-evaluada (columna σ_medida = 0.10 mm)

### Dominio refracción (paraxial): un cambio por canal

Cada columna de canal cambia **una sola cosa**. Los cuatro telescopan exactamente a
(gruesa re-evaluada − exp006 publicado). Nótese que el primero **no es física**: es la
diferencia de ESTIMADOR contra el ancla congelada (MC n=6000 con el LCG defectuoso
medido en V1.12, más su redondeo a 3 decimales).

| Ojo | σ_bio | exp006 pub. (D) | gruesa re-eval. (D) | residuo estimador (D) | física no-linealidad (D) | potencia de sonda (D) | lente puro (D) |
|---|---|---|---|---|---|---|---|
| corto | 0.2 | 0.1780 | 0.1842 | 2.06e-3 | -1.00e-6 | 4.26e-3 | -1.15e-4 |
| corto | 0.3 | 0.3630 | 0.3684 | -2.87e-3 | -4.00e-6 | 8.52e-3 | -2.31e-4 |
| corto | 0.4 | 0.5460 | 0.5526 | -5.81e-3 | -1.00e-5 | 1.28e-2 | -3.46e-4 |
| normal | 0.2 | 0.1060 | 0.1108 | 1.44e-3 | -1.00e-6 | 3.39e-3 | 6.00e-6 |
| normal | 0.3 | 0.2170 | 0.2217 | -2.13e-3 | -5.00e-6 | 6.78e-3 | 1.20e-5 |
| normal | 0.4 | 0.3260 | 0.3325 | -3.69e-3 | -1.40e-5 | 1.02e-2 | 1.80e-5 |
| largo | 0.2 | 0.0500 | 0.0507 | 7.19e-4 | 0.00e+0 | 0.00e+0 | 3.00e-5 |
| largo | 0.3 | 0.1020 | 0.1015 | -5.61e-4 | -2.00e-6 | 0.00e+0 | 6.10e-5 |
| largo | 0.4 | 0.1540 | 0.1522 | -1.84e-3 | -5.00e-6 | 0.00e+0 | 9.10e-5 |

- cada canal cambia UNA sola cosa (corrección adversarial V1.11): residuo_estimador_exp006 = mismo modelo lineal, cuadratura determinista vs el MC congelado de exp006 (SE con n=6000 + defecto del LCG + redondeo a 3 decimales — NO es física); canal_fisica_linealizacion = misma potencia y mismo estimador, respuesta lineal vs re-evaluada; canal_potencia_sonda = misma respuesta delgada, sondeada en la potencia del escalón del otro motor (cuantización de 0.5 D); canal_lente_puro = MISMA potencia, lente delgada vs gruesa. La suma de los cuatro telescopa exactamente a (beneficio_gruesa_reevaluada − beneficio_publicado_exp006).
- **Corrección adversarial de este sprint:** la primera versión publicaba un «canal
  linealización» y un «canal lente» que eran, respectivamente, ~99 % ruido del estimador
  del ancla y ~100 % efecto de sondear cada motor en su propio escalón de 0.5 D — con el
  efecto de lente puro de signo OPUESTO en el ojo corto. Las lecturas «la no-linealidad
  importa milidioptrías» y «la lente gruesa importa ~0.01 D en cortos» eran artefactos de
  atribución, no física.

### Dominio potencia continua (cruce de motores, misma factory)

| Ojo | σ_bio | beneficio P gruesa (D) | beneficio P trazada (D) | canal motor óptico (D) |
|---|---|---|---|---|
| corto | 0.2 | 0.2677 | 0.2587 | -0.0090 |
| corto | 0.3 | 0.5357 | 0.5178 | -0.0179 |
| corto | 0.4 | 0.8043 | 0.7773 | -0.0269 |
| normal | 0.2 | 0.1622 | 0.1573 | -0.0049 |
| normal | 0.3 | 0.3245 | 0.3147 | -0.0098 |
| normal | 0.4 | 0.4871 | 0.4724 | -0.0147 |
| largo | 0.2 | 0.0749 | 0.0718 | -0.0032 |
| largo | 0.3 | 0.1499 | 0.1436 | -0.0063 |
| largo | 0.4 | 0.2250 | 0.2156 | -0.0095 |

- **Ancla de refutación** — diagonal σ_m = σ_bio = 0.2: beneficio ≡ 0 por construcción (misma integral en ambos brazos): **VERIFICADO** (el 0 de exp006 también era por construcción: extracciones emparejadas).
- Convergencia de la cuadratura (celda trazada, σ 0.3): 16 vs 8 intervalos → delta relativo 0.1162 %.
- **Convergencia del haz** (ojo corto, potencia continua trazada, pupila 3 mm, 40 vs 160 anillos): sesgo del ABSOLUTO -8.21e-3 D; sesgo de la RESPUESTA a δ = ±0.4 mm -4.25e-4 / 3.92e-4 D. el ABSOLUTO de potencia trazada NO está convergido en muestreo (~-8e-3 D con 40 anillos, y 160→320 aún deriva): léase como óptimo del haz DECLARADO, no como valor convergido. La RESPUESTA a δ (lo que entra en los canales) es de modo común y su residuo es ~1 % del canal motor — cota publicada aquí, no asumida.
- Verificación Monte Carlo del método (normal, dominio refracción gruesa, σ = 0.30 mm): cuadratura 0.3325 vs MC 0.3359 (desviación 1.02 %). tolerancia esperable ~3 %: SE del MC (~0.6 %) + defecto del LCG de makeRng (infla varianza 1.3-2.8 %, medido en V1.12) + truncamiento declarado de la cuadratura (0.034 %)

## 4 · Integración V1.12: la hipótesis con incertidumbre auditable

- outcome con equatorial_plane_geometric (inputs acd_mm, lt_mm): sd 0.6681 D · ratio MC/lineal 1.0009 · ancla nominal exacta: true
- derivadas (D/unidad): acd_mm 2.0843 · lt_mm 1.0421 · position_prediction_mm 2.0852
- σ_LT con un predictor que NO consume lt_mm: **RECHAZADA por inercia (correcto)** — `sigma lt_mm: VARIABLE INERTE en esta configuración — ni ±0.1 ni un paso de contraste (1) la mueven (p. ej. K con radios medidos, CCT con córnea de lectura, ACD con un predictor que no la consume). Su dispersión desaparecería en silencio: se rechaza en lugar de fingirse propagada.`
- eps_bio de H_EQ viaja como residual del predictor (canal b, position_prediction_mm) y las medidas acd/lt como canal (a) POR el predictor — dos canales con procedencia distinta, sin doble conteo (descomposicion_posicion). La sonda de inercia demuestra POR EJECUCIÓN que lt_mm solo propaga si el predictor lo consume.

## Lo que este experimento NO demuestra

- **NO valida H_EQ**: sigue siendo hipótesis declarada; decidirla exige cohorte con EQ
  preoperatorio (OCT) y posición de LIO medida postoperatoria (nivel 3).
- **NO mide beneficio clínico real** de medir el ecuador: toda cifra es condicional a
  H_EQ y a σ_bio/σ_m DECLARADAS (OQ #6), con lente sustituta (OQ #4) y ojos sintéticos.
- **NO consume** lens_eq_plane_mm/ata_mm/sts_mm: siguen reservados (bloqueo externo,
  OQ #2+#3); la cadena se cierra calculando el ecuador, no leyéndolo.
- **NO re-elige la potencia por extracción**: mantiene la estructura de exp006 (respuesta
  alrededor de posGeom); la inestabilidad de la elección es OTRA pregunta (V1.12,
  raytraceChoiceStability).
- **NO modela el ruido de medida alrededor del ecuador desplazado**: ambos brazos se
  evalúan alrededor de posGeom, descartando el término cruzado 2c·ε_bio·ε_med. con s ≈ 2.3 D/mm y c ≈ 0.09 D/mm² (curvatura medida en el bloque 2), s/(2c·σ_bio) ≈ 40 ⇒ efecto sobre E|·| < 1e-6 D, dos órdenes por debajo del canal más pequeño. Con σ_bio grande o lentes de mayor curvatura dejaría de ser despreciable y habría que re-derivarlo.
- **NO publica una potencia trazada absoluta convergida en muestreo**: el óptimo continuo
  trazado es el del haz DECLARADO de 40 anillos y arrastra ~−8e-3 D de discretización (cota
  medida arriba); lo comparable entre motores es la RESPUESTA a δ, de modo común.
- **NO convierte entre convenciones**: la divergencia de motor vive solo en el dominio
  de potencia; el puente dRef/dP es informativo, no un conversor de resultados.
- **NO decide criterio de foco ni política corneal** (OQ #7/#8): el trazado usa el
  objetivo C y los supuestos registrados viajan en `supuestos_trazado`.
- Las magnitudes por canal dependen de la GenericIOLFactory (sustituto declarado):
  con geometría real de fabricante pueden cambiar.
