# EVO_QUERY_PROVENANCE — Procedencia del corpus de consultas al benchmark congelado

**Versión:** 1.0 · **Fecha:** 10/08/2026 · RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING

Este documento existe porque la auditoría V0 (hallazgo **H5**) encontró **tres cifras
distintas** circulando por el repositorio para "el número de consultas a EVO": 8.311,
8.318 y 8.319. Ninguna era falsa; contaban cosas diferentes y nadie lo decía. Aquí se
fija qué cuenta cada una, y `tests/evo_provenance.test.mjs` impide que vuelvan a
divergir en silencio.

> **Naturaleza de este corpus.** Son respuestas de un servidor externo (EVO v2.0)
> registradas en su momento. Constituyen el **benchmark congelado** del proyecto: un
> comparador, no una verdad. No son datos clínicos, no son ground truth, y **ningún
> parámetro del motor físico nuevo se calibra contra ellas**.

---

## 1. Las tres cifras, reconciliadas

| Cifra | Qué cuenta exactamente | Dónde aparece |
|---|---|---|
| **8.319** | Consultas **únicas** registradas en `cache2.json` (claves distintas) | el corpus real, hoy |
| **8.318** | De esas, las que el servidor **respondió con resultado** (`ok:true`) | denominador de todo análisis numérico |
| **8.311** | Instantánea del corpus **en el momento de generar el dashboard** | `dashboard-data.json → totalQueries`, `dashboard.html`, `INFORME.md` |

Las tres son correctas dentro de su contexto:

- **8.319 − 8.318 = 1**: una única consulta que EVO **rechazó legítimamente por dominio**,
  no un fallo de red ni un error del harness. Se conserva deliberadamente:

  ```
  txtRefraction = "-6"   →   {"ok": false, "errs": ["* Range -5 to 5 D"]}
  ```

  EVO acepta refracción diana en [−5, +5] D. La consulta pedía −6 D. Que el rechazo esté
  guardado es lo que permite documentar el **límite de dominio del benchmark** en vez de
  suponerlo. Borrarla habría hecho desaparecer la evidencia de una frontera real.

- **8.319 − 8.311 = 8**: ocho consultas posteriores a la generación del dashboard. No son
  sondas exploratorias: son **los dos ojos de un caso clínico × 4 modelos de LIO**,
  consultados para responder a un caso concreto después de publicado el dashboard.

  | Ojo | AL | K1 | K2 | ACD | Modelos consultados |
  |---|---|---|---|---|---|
  | A | 22.53 | 42.03 | 45.55 | 3.10 | Tecnis, MX60ET, Posterior (A=119.40), Posterior (A=119.10) |
  | B | 22.57 | 43.10 | 45.24 | 3.09 | Tecnis, MX60ET, Posterior (A=119.40), Posterior (A=119.10) |

  El dashboard **no se regeneró** tras añadirlas, de ahí la diferencia. Es un desfase de
  instantánea, no una discrepancia de datos.

**Regla a partir de aquí:** todo análisis numérico usa **8.318** como denominador y lo
declara. La cifra 8.311 solo es válida referida a los artefactos generados en aquella
instantánea, que se conservan tal cual por reproducibilidad.

## 2. Los dos harness, y por qué cache.json es redundante pero se conserva

| Fichero | Entradas | Relación |
|---|---|---|
| `cache/cache.json` | 1.572 | harness v1 (primera campaña) |
| `cache/cache2.json` | 8.319 | harness v2 (campaña completa) |

`cache.json` es un **subconjunto estricto** de `cache2.json`: las 1.572 claves están todas
en v2, y las 1.572 respuestas son **idénticas byte a byte**. Cero divergencias.

Esto es un dato con valor propio: significa que **el servidor devolvió lo mismo ante las
mismas entradas en dos campañas separadas**. Es la única evidencia de estabilidad temporal
del benchmark que el proyecto puede exhibir sin volver a consultar el servidor, y por eso
`cache.json` se conserva pese a ser redundante como fuente de datos.

## 3. Composición del corpus

Todo el corpus comparte una configuración fija que **acota lo que el benchmark puede
afirmar**:

- **Biómetro:** `IOLMaster 700` en las 8.319 consultas. Sin Argos (`0` en todas).
- **Sin post-refractiva:** `LASIK = 0` en las 8.319. El corpus **no dice nada** sobre ojos
  operados de cirugía refractiva previa.
- **Índice queratométrico:** 1.3375 en 7.966; 1.332 en 179; 1.3315 en 174. El barrido de
  índices existe pero es minoritario y deliberado (caracterización del canal, no muestreo).
- **SIA ≠ 0** en 718 consultas.
- **Ojos biométricamente distintos:** 2.416 combinaciones (AL, K1, K2, ACD, LT, CCT).

Rangos efectivamente muestreados:

| Parámetro | Mín | Máx |
|---|---|---|
| AL (mm) | 19.00 | 32.00 |
| K1 (D) | 34.00 | 50.00 |
| K2 (D) | 34.00 | 52.50 |
| ACD (mm) | 2.40 | 4.40 |
| Constante A | 110.30 | 125.00 |
| Refracción diana (D) | −6 (rechazada) | +4 |

Reparto por modelo de LIO (las 12 primeras):

| Modelo | n |
|---|---|
| Posterior | 5.753 |
| Anterior | 184 |
| 709M/MP | 123 |
| SN6ATx | 108 |
| MX60ET | 107 |
| CNW0Tx | 104 |
| Tecnis | 102 |
| MX60T | 101 |
| Vivity | 100 |
| Aspire | 100 |
| Bitoric | 99 |
| Panoptix | 99 |

El desequilibrio es intencionado: `Posterior` concentra el 69 % porque fue el canal usado
para caracterizar la estructura de la fórmula (barridos densos de AL/K/ACD); los demás
modelos se muestrearon lo justo para tabular su desplazamiento de potencia. **Consecuencia
que debe respetarse:** cualquier estadístico agregado sobre "todos los modelos" está
dominado por `Posterior` y no es representativo del catálogo.

## 4. Lo que este corpus NO permite afirmar

1. **Que EVO sea correcto.** Es un comparador. Su acierto clínico no se evalúa aquí.
2. **Nada sobre ojos post-LASIK/PRK, Argos, o córnea posterior medida.** No hay una sola
   consulta con esas configuraciones.
3. **Nada fuera de los rangos de la tabla anterior.** Extrapolar es inventar.
4. **Que la réplica local sea EVO.** Reproduce su comportamiento observado en el dominio
   muestreado y en las fechas de muestreo; la propia regla de recomendación de EVO solo se
   auto-reproduce al 96.2 % (ver `EVO_BASELINE.md`).
5. **Ninguna superioridad de nada frente a nada.** Comparar divergencia no es medir acierto.

## 5. Verificación

Las cifras de este documento no se mantienen a mano. Se recomputan desde los ficheros:

```bash
node --test tests/evo_provenance.test.mjs
```

El test falla si cambia el número de entradas, si `cache.json` deja de ser subconjunto
estricto de `cache2.json`, si aparece o desaparece la consulta rechazada, o si los rangos
muestreados se salen de lo declarado aquí.

## 6. Restricción del proyecto

Este corpus es **benchmark, control y legado congelado**. Está prohibido:

- calibrar cualquier parámetro del motor físico nuevo para acercarse a estos valores;
- introducir constantes derivadas de este corpus en `src/` fuera de `src/bench/`;
- presentar divergencia frente a EVO como error del motor propio (terminología obligatoria:
  **divergencia**, nunca *error*).

El único punto de entrada permitido desde `src/` hacia el legado es
`legacy/evo_replica/run_evo_replica.mjs`.
