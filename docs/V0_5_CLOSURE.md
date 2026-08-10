# V0.5 — Cierre del endurecimiento

**Versión:** 1.0 · **Fecha:** 10/08/2026 · RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING

Cierre de la fase de endurecimiento abierta por `docs/V0_REVIEW.md`. Los **10 hallazgos**
de la auditoría están corregidos y verificados. Este documento registra qué se comprobó,
qué se encontró de nuevo por el camino, y qué **sigue sin resolverse** — que es la parte
que importa antes de construir V1 encima.

---

## 1. Estado verificado

| Criterio de salida | Comprobación | Resultado |
|---|---|---|
| Batería de tests verde | `npm test` | **116/116** |
| CI verde | 5 jobs (Node 20/22 Linux, Node 22 Windows, legado, experimentos) | **verde** |
| Legado EVO byte-idéntico | `tests/legacy_baseline.test.mjs` (102 hashes) | **intacto** |
| Motor independiente de EVO | `tests/architecture.test.mjs` | **verificado** |
| Experimentos reproducibles | `scripts/check_experiments.mjs` | **3/3 exactos** |
| Documentación sincronizada | LIMITATIONS, OPEN_QUESTIONS, V0_REVIEW | **al día** |

Los tests pasaron de **67 → 116** (+49). El crecimiento no es de cobertura de líneas:
son tests que antes **no podían fallar** porque no existía nada que los hiciera fallar
(soluciones analíticas independientes, guardias de arquitectura, invariancia al
dispositivo, coherencia del registro de campos reservados).

## 2. Los 10 hallazgos

| # | Sev. | Cierre |
|---|---|---|
| H1 | ALTA | Política corneal explícita (`src/optics/cornea.mjs`), 4 políticas declaradas; exp007 cuantifica el impacto |
| H2 | ALTA | `refractionFor` eliminada; `refractionForThinPower` / `refractionForIOL` no pueden confundirse |
| H3 | ALTA | `nominal_power_d` ↔ `geometry` + `geometry_status`; fábricas que derivan geometría de potencia |
| H4 | MEDIA | 10 tests contra soluciones cerradas externas al motor |
| H5 | MEDIA | `EVO_QUERY_PROVENANCE.md` + test que recomputa cada cifra |
| H6 | MEDIA | Avisos generados por llamada, no estado global del proyecto |
| H7 | MEDIA | CI con 5 jobs y guardias específicas |
| H8 | BAJA | 0 referencias a sprints en `src/` |
| H9 | BAJA | `src/core/reserved.mjs` + test bidireccional |
| H10 | BAJA | Tolerancias derivadas o sustituidas por la ley física que verifican |

## 3. Hallazgos NUEVOS, encontrados al corregir los anteriores

Ninguno estaba en la auditoría. Los cuatro son del mismo tipo: **un valor plausible
puesto donde debería haber un fallo explícito**.

1. **Sentinela de radio plano.** La fábrica genérica devolvía `r = 10⁹ mm` para una lente
   plana, dejando 3·10⁻⁷ D de potencia residual espuria. La raíz continua de la cuadrática
   vale exactamente 0, así que `r = Infinity` es la respuesta correcta. Se añadió
   `curvatureFromRadiusMm` (única magnitud del proyecto donde el infinito es físicamente
   significativo).

2. **Índice queratométrico rellenado en silencio.** `createPreopEye` ponía
   `keratometric_index ?? 1.3375`. Asumir la convención dominante sobre un dato de otra
   marca **falsea el radio corneal recuperado**. Ahora queda `null` y las políticas que lo
   necesitan fallan diciéndolo.

3. **El baseline "congelado" no lo era fuera de Linux.** Sin `.gitattributes`, un checkout
   en Windows convertía LF→CRLF y los hashes SHA-256 dejaban de coincidir. Lo detectó la CI
   en su **primera ejecución**, que es exactamente para lo que se montó. Un baseline que
   depende del sistema operativo del que lo mira no es un baseline.

4. **Dos defectos latentes en `paraxialFocusOfRaytraceEye`:** reventaba con superficies
   planas (leía `radius_mm`, inexistente en un plano) y con radios infinitos.

También se corrigió **un error de la propia auditoría**: V0_REVIEW atribuía las 8 consultas
EVO posteriores al dashboard a "sondas de rejilla Zeiss/Anterior-Bitoric". Leyendo el
fichero, son **dos ojos de un caso clínico × cuatro configuraciones de LIO**. La afirmación
original se hizo reconstruyendo de memoria el orden de trabajo en vez de mirar los datos.
Queda registrada en V0_REVIEW en lugar de borrarse.

## 4. El resultado científico de esta fase

exp007 mide algo que no se sabía: **cuánto depende la recomendación de la marca del
biómetro**. Sobre 30 casos (radio corneal físico × longitud axial), con la política que V0
usaba por defecto:

- dispersión entre convenciones (1.3375 / 1.3315 / 1.332): **hasta 1.26 D**;
- la marca cambia el escalón recomendado de 0.5 D en **27 de 30 casos (90 %)**;
- con la política de radio recuperado la dispersión es **0 D**, por construcción.

Esto **no** demuestra que la política de radio prediga mejor. Las fórmulas clásicas están
calibradas *sobre* la convención del dispositivo: cambiar la política sin recalibrar el
predictor de posición mueve el sesgo de sitio, no lo elimina. Los dos grados de libertad
están confundidos y **solo se separan con datos postoperatorios** (OPEN_QUESTIONS #7). Por
eso el defecto sigue siendo `KERATOMETRIC_READING` — ahora como elección declarada y
registrada en cada salida, no heredada por accidente.

## 5. Lo que sigue sin resolverse

Ninguno de estos puntos se desbloquea escribiendo código. Todos esperan datos, geometría
real o una fuente citable, y **V1 debe construirse sabiéndolo**:

| # | Bloqueo | Qué haría falta |
|---|---|---|
| OQ #1 | Índices oculares sin cita formal | Bibliografía verificable |
| OQ #2 | Predictores de posición de literatura | Publicación con coeficientes delante |
| OQ #3 | Convenciones de datum entre dispositivos | Especificación del dispositivo de medida |
| OQ #4 | Geometría real de LIO comerciales | Fichas técnicas / patentes por modelo y potencia |
| OQ #5 | Distribuciones poblacionales | Estudio citable o base propia |
| OQ #6 | Sigmas reales de medida y biológicas | Repetibilidad de dispositivo + cohorte |
| OQ #7 | Qué política corneal predice mejor | Cohorte postoperatoria con biómetro identificado |

**16 campos** del modelo siguen almacenados sin consumir (`src/core/reserved.mjs`), cada
uno con su motivo de bloqueo. **No es deuda técnica**: es el esquema esperando los datos
que lo justifiquen.

## 6. Lo que esta plataforma sigue sin poder afirmar

Sin cambios respecto a V0, y conviene repetirlo:

1. **Nada de lo que produce es una predicción clínica validada.** Toda refracción simulada
   está etiquetada como SIMULACIÓN.
2. **No hay ninguna comparación de acierto con EVO ni con ninguna fórmula.** Solo
   divergencia estructural. Medir divergencia no es medir acierto.
3. **Ningún resultado de ray tracing es atribuible a una lente comercial concreta:** sin
   ficha de fabricante, la geometría es `UNKNOWN` y el trazado falla en vez de sustituirla.
4. **Ningún parámetro del motor físico procede de ajustar EVO**, y ahora hay un test de
   arquitectura que lo vigila.

---

**Etiqueta:** `v0.5-hardening-complete`
**Puerta de entrada a V1:** abierta.
