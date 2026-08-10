# V0_REVIEW — Auditoría crítica de V0

**Versión:** 1.0 · **Fecha:** 10/08/2026 · **Autor:** G. Vila (elaboración asistida por IA)
**Método:** revisión de la implementación real (`src/`, `tests/`, `experiments/`) contrastada
contra la documentación. **`PROJECT_PLAN.md` no se ha tomado como fuente de verdad**: varios
puntos marcados DONE tienen defectos que se detallan abajo.

**Estado de partida:** 67 tests verdes, 14 commits, V0 declarada completa.
**Resultado de la auditoría:** 3 hallazgos de severidad ALTA, 4 MEDIA, 3 BAJA.
Ninguno invalida los experimentos ya publicados (se indica el impacto caso por caso),
pero **dos de los ALTA bloquearían V1** si se construyera encima sin corregirlos.

---

## Resumen de hallazgos

| # | Hallazgo | Sev. | Archivos | Bloquea V1 |
|---|---|---|---|---|
| H1 | `keratometric_index` se almacena pero **la física nunca lo usa** | ALTA | `eyebuilder.mjs`, `constants.mjs`, `eye.mjs` | Sí |
| H2 | `refractionFor(power_d)` **ignora `power_d`** con LIO gruesa | ALTA | `eyebuilder.mjs:51-60` | Sí |
| H3 | No existe separación `nominal_power` ↔ `physical_geometry` ni factory | ALTA | `iol.mjs` | Sí |
| H4 | Tests de física mayoritariamente **autorreferenciales** | MEDIA | `tests/*.test.mjs` | No |
| H5 | Discrepancia 8.311 vs 8.319 sin explicar | MEDIA | docs varias | No |
| H6 | Documentación y warnings obsoletos ("tórico pendiente") | MEDIA | `paraxial_engine.mjs`, `LIMITATIONS.md` | No |
| H7 | Sin CI: nada impide subir tests rojos o alterar el legacy | MEDIA | — | No |
| H8 | Acoplamiento del código con la numeración de sprints | BAJA | `src/**` | No |
| H9 | 11 parámetros anatómicos/de LIO almacenados y no usados | BAJA | `eye.mjs`, `iol.mjs` | No |
| H10 | Tolerancias laxas sin justificación física documentada | BAJA | `paraxial.test.mjs`, `raytrace_eye.test.mjs` | No |

---

## H1 · El índice queratométrico se guarda y se ignora (ALTA)

**Evidencia.** `createPreopEye` almacena `keratometric_index` (por defecto 1.3375), pero:

- `corneaModelOf()` (`eyebuilder.mjs:28`) devuelve `power_d: preop.mean_k_d` — usa la lectura
  del biómetro **directamente como potencia física**, sin mirar el índice con que se obtuvo.
- `buildRaytraceEye()` (`eyebuilder.mjs:97`) calcula `r = (n_aq − 1)·1000 / K_media`, es decir
  con **1.336**, no con el índice del dispositivo.
- `corneaRadiusFromKeratometry()` existe en `constants.mjs:37` y **no se invoca en ningún sitio**
  (única aparición: su propia definición).

**Impacto científico.** Dos biómetros que miden **el mismo ojo físico** con convenciones
distintas (1.3375 vs 1.3315) producen lecturas K distintas, y el motor las interpreta como
**córneas físicamente distintas**. El radio anterior real es `r = (n_k − 1)/K`, invariante al
dispositivo; hoy esa invariancia no existe en el código. Magnitud: entre 1.3375 y 1.3315 hay
un 1.8 % de diferencia en K para el mismo radio (≈0.8 D sobre 43.5 D).

Nota: el legacy EVO **sí** trata el índice (factores medidos 1.0175/1.0160), lo que agrava el
contraste — el motor "físico" es hoy menos riguroso que el benchmark empírico en este punto.

**Corrección propuesta (P0.1).** Política corneal explícita en dos ramas:
- **Caso A (radios medidos):** córnea física de dos superficies. Ya implementado, se mantiene.
- **Caso B (solo K):** recuperar el radio anterior con el índice **del dispositivo**
  (`r = (n_k − 1)/K`, invariante) y convertirlo a potencia con un **índice reducido de
  proyecto declarado**; la cara posterior no medida NO se modela con ningún coeficiente
  empírico (prohibido calibrar contra EVO): se declara que el modelo es *reducido* y que
  absorbe implícitamente la posterior, como hace la propia convención queratométrica.
- Tests obligatorios: mismo radio físico expresado como K con 1.3375 / 1.3315 / 1.332 debe
  devolver **el mismo radio recuperado** y la misma potencia reducida.

---

## H2 · `refractionFor(power_d)` ignora su argumento con LIO gruesa (ALTA)

**Evidencia.** `eyebuilder.mjs:51-60`:

```js
refractionFor(power_d) {
  if (thick) {                       // ← si se inyectó una LIO con geometría numérica
    return predictedRefractionThickIOL({ ..., iol: {...} });   // power_d NO se usa
  }
  return predictedRefraction({ ...base, iolPower_d: power_d });
}
```

Con una LIO gruesa inyectada, `refractionFor(20)` y `refractionFor(25)` **ejecutan la misma
lente física** y devuelven el mismo número. Es exactamente el patrón que el encargo señala
como prohibido.

**Impacto actual: nulo en los resultados publicados.** `searchBestPower()` llama
`buildParaxialEye(postop)` **sin `iol`**, de modo que siempre entra por la rama delgada
(correcta). Es un defecto **latente**: ningún experimento actual lo pisa.

**Impacto en V1: bloqueante.** El optimizador de trazado debe crear una geometría por cada
potencia candidata; con esta API, un barrido de 60 potencias evaluaría 60 veces la misma lente
y devolvería un óptimo arbitrario, sin error visible.

**Corrección propuesta (P0.2/P0.3).** Eliminar la ambigüedad de raíz: `buildParaxialEye` deja
de aceptar una LIO fija con firma `refractionFor(power)`. Se introduce `IOLFactory`
(`create({model, power_d, cylinder_d}) -> IOLModel`) y el ojo expone
`refractionForIOL(iolModel)`; para la rama delgada se mantiene `refractionForThinPower(power_d)`
con nombre inequívoco. Cualquier uso de geometría con potencia desacoplada debe ser
imposible de expresar.

---

## H3 · Potencia nominal y geometría física no están separadas (ALTA)

**Evidencia.** `createIOL()` acepta `se_power_d` y `geometry` como campos independientes sin
ninguna relación forzada: nada impide construir una LIO con `se_power_d: 21` y una geometría
cuya potencia real sea 30 D. `createGenericThickIOL()` sí deriva la geometría de la potencia
(lensmaker, testado), pero es una función suelta, no un contrato.

**Impacto.** Para lentes comerciales la geometría es UNKNOWN (correcto, ya se marca), pero el
modelo permite mezclar una etiqueta comercial con geometría genérica sin que el resultado lo
declare — riesgo de atribuir a una lente real un trazado que no le corresponde.

**Corrección propuesta (P0.3).** `nominal_power_d` (identifica el modelo comercial) separado de
`physical_geometry` (lo que traza el motor), con `geometry_status ∈ {DERIVED_GENERIC,
MANUFACTURER, UNKNOWN}`. Si es UNKNOWN, el ray tracing comercial **falla explícitamente** en
lugar de sustituir en silencio por la genérica.

---

## H4 · Los tests de física validan el motor contra sí mismo (MEDIA)

**Evidencia.** Varios de los tests "de forma cerrada" comparan dos funciones del **mismo
módulo**:
- `paraxial.test.mjs` "round-trip exacto": `iolPowerForTarget` ↔ `predictedRefraction`, ambas de
  `paraxial.mjs`. Prueba **consistencia interna**, no corrección física.
- `raytrace_eye.test.mjs`: trazado vs `paraxialFocusOfRaytraceEye`, ambos internos.
- `engine_bench.test.mjs`: el óptimo de rejilla se compara con `exact_power_d` del mismo motor.

Sí hay validación externa genuina en: dioptrio esférico (`f' = n₂R/(n₂−n₁)`), Snell
cuantitativo, ángulo crítico, lensmaker de la genérica. Pero el grueso del ojo pseudofáquico
carece de referencia independiente.

**Impacto.** Un error sistemático **compartido** por ambas implementaciones (p. ej. una
convención de signo equivocada en toda la cadena) pasaría todos los tests.

**Corrección propuesta (P0.7).** Batería de casos con solución analítica **externa**, cada uno
documentando su ecuación: lente gruesa (fórmula de constructores con espesor), plano-convexa,
equiconvexa, sistema de dos elementos separados (fórmula de Gullstrand para potencia
equivalente y planos principales), invariancia frente a cambio de unidades, y reversibilidad
del trazado (rayo invertido recorre el mismo camino).

---

## H5 · Discrepancia 8.311 vs 8.319 — **resuelta** (MEDIA)

**Investigación (sin modificar dato alguno):**

| Medida | Valor |
|---|---|
| `cache/cache.json` (harness v1) | 1.572 entradas |
| `cache/cache2.json` (harness v2) | **8.319 entradas** |
| Claves de v1 contenidas en v2 | **1.572 (100 %)** — v2 es superconjunto estricto |
| Consultas únicas totales del proyecto | **8.319** |
| Respuestas útiles (`ok:true`) | 8.318 |
| Respuestas de rechazo del servidor | 1 (diana fuera del rango −5…+5 D; rechazo legítimo, cacheado) |

**Origen del 8.311:** es el conteo de `cacheSize()` en el instante en que se generó
`dashboard-data.json`, y de ahí se copió a `README.md`, `INFORME.md`, `informe-cientifico.html`
y `dashboard.html`. Las **8 consultas restantes** se realizaron *después*, durante las sondas
de diagnóstico finales (regla de rejilla Zeiss 709/939 y modos Anterior/Bitoric).

**Conclusión:** no hay pérdida ni duplicación de datos; ambas cifras son correctas en su
momento. Se documentará en `EVO_QUERY_PROVENANCE.md` y se citará **8.319** como cifra final.
Los documentos históricos ya publicados no se reescriben (son instantáneas fechadas); se
añadirá la nota de provenance.

---

## H6 · Documentación y warnings desincronizados (MEDIA)

- `src/bench/engines/paraxial_engine.mjs:73` emite el warning *"Motor esférico paraxial;
  tórico pendiente (Sprint 9)"* — pero el tórico **ya está integrado** en ese mismo motor
  (opción `toricCatalog_d`). El warning es falso cuando se pasa catálogo.
- `docs/scientific/LIMITATIONS.md:23` mantiene *"el motor tórico independiente es Sprint 9"*.
- `README.md` / `AUDITORIA.md` citan 8.311 (ver H5).

**Impacto.** Un lector externo (o un revisor clínico) recibiría información falsa sobre las
capacidades del motor. **Corrección (P0.5):** warnings condicionales al estado real y barrido de
documentación.

---

## H7 · Sin integración continua (MEDIA)

No existe `.github/workflows/`. Nada impide subir tests rojos, ni detecta una alteración
accidental del baseline congelado (cuyos hashes solo se verifican si alguien ejecuta `npm test`
localmente). **Corrección (P0.6):** matriz Node 20/22 con `npm test`, que incluye por
construcción los tests de hash y de réplica de métricas del legacy.

---

## H8 · El código productivo referencia números de sprint (BAJA)

`src/toric/vectors.mjs`, `toric_engine.mjs`, `paraxial_engine.mjs` y otros llevan "(Sprint N)"
en cabeceras y mensajes. Acopla artefactos permanentes a un plan temporal; envejece mal.
**Corrección:** describir la función, no el cronograma (el historial vive en git y en el plan).

---

## H9 · Parámetros almacenados y no utilizados (BAJA)

Verificado que **ninguno** de estos se usa fuera de `core/`: `lens_eq_plane_mm`,
`lens_eq_diameter_mm`, `lens_tilt_deg`, `lens_decentration_mm`, `wtw_mm`, `ata_mm`, `sts_mm`,
`pupil_mm`, `asphericity_q`, `toric_design`, `haptic_angulation_deg`, `power_range_d`.

Es **intencionado** (interfaces preparadas para V1, §4 del encargo original) y no constituye un
error, pero no está declarado en ningún sitio: quien lea el modelo de datos puede creer que el
motor los tiene en cuenta. **Corrección:** marcarlos explícitamente como *reservados* en
`ARCHITECTURE.md` con el sprint de V1 que los activará (asfericidad → V1.2; tilt/decentración →
V1.3; pupila → V1.4; EQ/ATA/STS → V1.11).

---

## H10 · Tolerancias laxas sin justificación (BAJA)

| Test | Tolerancia | Problema |
|---|---|---|
| `paraxial.test.mjs:87` | `< 0.06 D` (gruesa t=0.1 mm vs delgada) | no se justifica por qué 0.06 |
| `paraxial.test.mjs:92` | `< 0.5 D` (gruesa t=0.8 mm) | umbral arbitrario, no derivado |
| `raytrace_eye.test.mjs:67` | `< 0.6 mm` (foco vs retina) | absorbe el efecto de espesor sin cuantificarlo |
| `toric.test.mjs:82` | `< 0.45 D` residual | depende del catálogo, no de la física |

**Corrección:** derivar cada tolerancia de una cota física declarada (p. ej. desplazamiento de
planos principales de la lente gruesa) o convertir el test en una comprobación de *tendencia*
en vez de un umbral mágico.

---

## Verificaciones que SÍ pasaron la auditoría

- **Independencia de EVO:** `src/` no importa el legacy salvo en `bench/engines/evo_engine.mjs`,
  que es el adaptador de benchmark declarado y usa solo la API pública. Ningún coeficiente
  ajustado a EVO ha migrado al motor físico (comprobado: los parámetros de `toric_engine.mjs`
  son datos medidos + SIA, sin la regresión posterior del legacy).
- **Etiquetado de simulación:** `predicted_postoperative_eye`, resultados Monte Carlo y todos
  los `results.json` llevan la marca `SIMULACION / NO GROUND TRUTH CLINICO` y el aviso RUO.
- **Reproducibilidad:** semillas fijas en generador, Monte Carlo y campañas; cada experimento
  guarda config + timestamp + commit.
- **Guardas de dominio:** el motor rechaza extrapolar fuera de la rejilla tabulada y las
  extracciones Monte Carlo inválidas se cuentan, no se silencian.
- **Higiene de datos personales:** ningún PII en archivos versionados (reverificado).

---

## Plan V0.5 derivado de esta auditoría

| Tarea | Hallazgos que cierra | Criterio de aceptación |
|---|---|---|
| P0.1 Política corneal e índice queratométrico | H1 | Invariancia del radio recuperado para 1.3375/1.3315/1.332 demostrada por test |
| P0.2 `IOLFactory` power-aware | H2 | Imposible expresar `refractionFor(P)` con geometría desacoplada; test que falla con la API antigua |
| P0.3 Nominal vs geometría | H3 | `geometry_status` explícito; trazado comercial con UNKNOWN falla en vez de sustituir |
| P0.4 Provenance EVO | H5 | `EVO_QUERY_PROVENANCE.md` con las cifras verificadas de esta auditoría |
| P0.5 Sincronizar documentación | H6, H8, H9 | Sin afirmaciones falsas; campos reservados declarados |
| P0.6 CI Node 20/22 | H7 | Actions en verde; falla ante test rojo o hash del legacy alterado |
| P0.7 Tests analíticos externos | H4, H10 | ≥6 casos con ecuación independiente documentada en el test |

**Puerta de salida de V0.5:** tests verdes, CI verde, legacy byte-idéntico, documentación
sincronizada, H1–H3 cerrados. Solo entonces se genera `V1_PROJECT_PLAN.md`.
