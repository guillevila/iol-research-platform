# VALIDATION_STRATEGY — Estrategia de validación

**Versión:** 1.0 · **Fecha:** 10/08/2026 · RESEARCH USE ONLY

## Principio

La validación se define ANTES de mirar datos. Tres niveles, cada uno con su verdad
de referencia y sus límites declarados:

## Nivel 1 — Validación física (disponible hoy)

- **Verdad:** formas cerradas de la óptica (foco de dioptrio, lensmaker, round-trips
  de vergencia, ley de Snell cuantitativa).
- **Mecanismo:** tests unitarios/property/numéricos (`npm test`); ningún valor
  esperado escrito de memoria: se deriva algebraicamente en el propio test.
- **Cobertura actual:** suite completa verde en CI en cada push (recuento vigente en
  `CURRENT_SPRINT.md`; la cifra en este documento quedaba obsoleta con cada sprint).
- **Validación cruzada interna:** trazado → paraxial cuando la apertura → 0, verificado
  sobre una rejilla de 18 ojos (V1.13) y publicado en `exp003`; la comparación sistemática
  sobre el ojo completo **ya está entregada** (`exp013`, atlas AL×K×pupila, y el contrato de
  comparabilidad de V1.8). *(Corrección V1.15: este punto la presentaba como futura, citando
  la numeración de sprints de V0.)* **Advertencia de alcance:** el ancla apertura→0 valida el
  LÍMITE; no demuestra que toda divergencia a pupila finita se deba a la apertura.

> **Qué NO puede pasar STRICT hoy, y por qué importa para el diseño del estudio**
> (auditoría V1.15). Exigir STRICT es correcto, pero dos vías son estructuralmente
> incompatibles con él mientras dos OQ sigan abiertas, y el estudio debe saberlo al
> planificarse:
> - **Ninguna córnea tórica trazada** pasa STRICT, por construcción: sus dos políticas son
>   derivación (radios recuperados de K1/K2) o declaración, y el modelo de datos no tiene
>   radios per-meridiano medidos (OQ #10). Llamar «medida» a una derivación sería el relleno
>   tácito que el proyecto prohíbe.
> - **El posicionamiento de la LIO** por centro geométrico en lugar de por planos principales
>   es un supuesto registrado que STRICT bloquea (OQ #3, parte interna).
>
> Consecuencia práctica: un estudio de nivel 3 que exija STRICT **solo puede cubrir hoy la
> vía esférica con córnea completamente medida**. Ampliarlo exige resolver esas dos OQ, no
> relajar el modo.

## Nivel 2 — Benchmark contra EVO congelado (disponible hoy)

- **Verdad:** NO es verdad clínica; es un punto de referencia estable y reproducible
  (8.319 respuestas reales cacheadas; réplica con métricas conocidas).
- **Mecanismo:** `src/bench/` con contrato común; mapas de divergencia en
  `experiments/` (exp002 es el primero). El resultado se lee como LOCALIZACIÓN de
  desacuerdo, jamás como ranking de acierto.
- **Uso:** priorizar qué regiones anatómicas necesitan datos clínicos primero.

## Nivel 3 — Validación clínica (futura, requiere datos reales)

- **Verdad:** refracción manifiesta estable postoperatoria y, cuando exista, posición
  de LIO medida (`postop.schema.json`).
- **Diseño preregistrado (antes de ver datos):**
  1. Partición temporal o por centro (nunca aleatoria simple si hay efecto cirujano).
  2. Métricas primarias: error absoluto medio y mediano de EE; % dentro de ±0.25 /
     ±0.50 / ±1.00 D; para posición: mm de error absoluto del predictor.
  3. Comparadores: EVO réplica (y EVO real cacheada donde exista), motor físico con
     cada predictor de posición, y fórmulas publicadas si se implementan con fuente.
  4. Los casos de las regiones de divergencia (exp002) se analizan como subgrupo
     prioritario preespecificado.
  5. Sin datos suficientes para separar ajuste/validación honestamente, no se
     calibra: solo se reporta.
  6. **Modo de fidelidad STRICT obligatorio** (`src/core/fidelity.mjs`, desde la
     revisión pre-V1.2): todo cálculo del estudio se ejecuta con
     `fidelity: STRICT`, de modo que ningún caso validado contenga NINGUNA
     sustitución/imputación de datos del caso — ni siquiera declarada — sobre
     parámetros ópticamente relevantes: un resultado con imputaciones validaría la
     imputación, no el motor. Precisión semántica: STRICT no elimina los supuestos
     de MODELO (índices convencionales, elección de método, vértice declarado), que
     permanecen documentados como frontera — lo que se valida es el modelo CON sus
     convenciones, sin imputaciones por caso; ni implica "máxima fidelidad física"
     (ver cabecera de `src/core/fidelity.mjs`). Los casos bloqueados por
     STRICT no se descartan en silencio: `StrictModeViolation` transporta la lista
     exacta de supuestos, y el estudio reporta cuántos casos quedaron excluidos y
     por qué dato faltante (eso ES un resultado: mide qué datos exige el motor).

## Reproducibilidad transversal

Semillas fijas en todo experimento; configuración + timestamp + commit hash en cada
`experiments/*/results.json`; datasets inmutables con hash (baseline ya congelado);
prohibido el resultado no regenerable.
