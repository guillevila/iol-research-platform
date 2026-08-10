# EVO_BASELINE — Motor benchmark congelado

**Versión:** 1.0 · **Fecha:** 10/08/2026 · **Autor:** G. Vila (elaboración asistida por IA)
**Estado:** CONGELADO · RESEARCH USE ONLY

## Qué es

`legacy/evo_replica/` contiene la réplica empírica de la calculadora EVO Toric v2.0
obtenida por caracterización de caja negra (metodología completa en `INFORME.md` e
`informe-cientifico.html`, en la raíz). En este proyecto actúa exclusivamente como:

- benchmark y control experimental (`run_evo_replica(case)`);
- referencia para localizar regiones de divergencia del motor físico nuevo;
- motor legacy congelado: **prohibido evolucionarlo**.

Sus coeficientes son ajustes a EVO, no física: **no deben migrar** a `src/`.

## Inventario congelado

| Ruta | Contenido |
|---|---|
| `engine.js` | Motor autocontenido (tablas embebidas). Hash en `baseline/HASHES.sha256` |
| `engine.cjs` | **Copia byte-idéntica** de `engine.js`. Motivo: el paquete raíz es `type:module`, y un `.js` se interpretaría como ESM; el motor es CommonJS. Igualdad verificada por test |
| `data/` (35 ficheros) | Tablas medidas (vigente `tables4.json`), modelos ajustados (`toricmodel6.json`, `channels.json`, `offsets.json`), catálogos (`models.json`, `cyltable.json`), datos de experimentos y validaciones por caso |
| `cache/cache2.json` | **8.319 respuestas reales de EVO** (clave = JSON de los campos del formulario; el orden de propiedades es significativo y se documenta abajo). `cache/cache.json` es la caché del harness v1 |
| `harness/` (61 scripts) | Provenance completo: consulta, ajustes, generadores y validadores originales, más los tres scripts de baseline (`replay_metrics`, `make_golden`, `make_hashes`) |
| `baseline/` | `HASHES.sha256` (102 archivos) · `baseline_metrics.json` · `golden_cases.json` (12 casos) |

## Clave de caché (contrato crítico)

`JSON.stringify({...DEFAULTS, ...input})` con `DEFAULTS` en el orden exacto definido en
`harness/evo2.mjs` (campos del formulario ASP.NET). Cualquier consumidor offline debe
replicar ese orden; `replay_metrics.mjs` es la implementación de referencia.

## Métricas del baseline (reproducidas offline, deterministas)

Replay de las 7 campañas con semilla fija (clean 200/999111 · long 150/24681357 ·
full 250/888222 · models 100/313131 · kidx 100/515151 · sia 100/616161 · permodel 406)
contra la caché, sin red:

| Métrica global (n = 1.206) | Valor |
|---|---|
| Potencia esférica idéntica | 95.44 % |
| Cilindro idéntico | 79.60 % |
| Eje ≤ 1° | 94.78 % |
| Decisión completa | 72.64 % |
| Error mediano de tabla | 0.01 D |

Detalle por campaña en `baseline/baseline_metrics.json`.

## Garantías de congelación (tests)

`tests/legacy_baseline.test.mjs`: hash del motor · igualdad byte de `engine.cjs` ·
hashes de datos críticos · 12 golden cases (instantánea exacta del comportamiento) ·
réplica exacta de métricas. Ejecutar con `npm test`.

## Limitaciones heredadas

Las del informe original: dominio AL 20–32 / K 34–50 / A 110–125; sin post-refractiva,
Argos ni córnea posterior medida; histéresis Zeiss 709/939; fidelidad al servidor EVO
de las fechas de muestreo (ago-2026).
