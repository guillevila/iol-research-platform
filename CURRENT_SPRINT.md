# CURRENT_SPRINT

**Sprint activo:** 0 → 5 en cadena (esta sesión de trabajo) · **Fecha:** 10/08/2026

## Sprint 0 — Auditoría y congelación del baseline

**Objetivo:** repo bajo git; rescate del material científico desde el directorio
temporal; congelación de la réplica EVO con hashes; API `run_evo_replica(case)`;
reproducción offline de las métricas publicadas.

**Cambios previstos**
- `legacy/evo_replica/{engine.js, data/, cache/, harness/, baseline/}` (rescate + copia congelada)
- `legacy/evo_replica/run_evo_replica.mjs` (API de benchmark)
- `legacy/evo_replica/harness/replay_metrics.mjs` (validación offline, solo caché)
- `legacy/evo_replica/baseline/{HASHES.sha256, baseline_metrics.json, golden_cases.json}`
- `tests/legacy_*.test.mjs` · `docs/scientific/EVO_BASELINE.md` · `package.json`

**Tests definidos**
1. Hash SHA-256 del motor congelado == registrado.
2. Golden cases: salidas del motor congelado == instantánea.
3. Réplica de métricas: recomputadas desde caché == `baseline_metrics.json` (n=1.206).
4. La caja `run_evo_replica` devuelve `PredictionResult`-compatible con warnings RUO.

**Criterios de aceptación:** `npm test` verde; sin acceso a red en tests; PDF fuera de git.
