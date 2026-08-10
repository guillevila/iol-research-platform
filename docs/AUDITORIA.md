# Auditoría del sistema existente

**Título:** Auditoría técnica del repositorio previo al proyecto de nuevo motor
**Versión:** 1.0 · **Fecha:** 10/08/2026 · **Autor:** G. Vila (elaboración asistida por IA)

## 1. Mapa del repositorio (estado encontrado)

### 1.1 Raíz (`Desktop/Prueba`) — producto de usuario

| Archivo | Rol | Estado |
|---|---|---|
| `engine.js` (57 kB) | Motor réplica de EVO: tablas embebidas + lógica completa. Autogenerado por `gen2.mjs`. Sin dependencias. | Funcional |
| `calculadora-torica.html` | Interfaz de la calculadora (consume `engine.js`) | Funcional |
| `dashboard.html` | Panel de validación (datos embebidos) | Funcional |
| `informe-cientifico.html` | Informe científico de la ingeniería inversa | Funcional |
| `INFORME.md`, `COMPARATIVA-CALCULADORAS.md` | Documentación de metodología y comparativas | Vigente |
| `Nuevo doc *.pdf` | Biometría de paciente (PII) | **Excluido de git** |

### 1.2 Directorio de trabajo temporal (scratchpad de sesión) — **RIESGO CRÍTICO**

Todo el material científico vivía fuera del repo, en un directorio temporal borrable:

- **Cachés de respuestas reales de EVO**: `cache2.json` (8,9 MB, 8.311 consultas), `cache.json` (1,9 MB, harness v1). Irreemplazables sin re-consultar la web.
- **Tablas medidas** (6 generaciones): `tables.json` … `tables4.json` (la vigente), rejillas `grid*.json`.
- **Modelos ajustados**: `channels.json`, `toricmodel*.json` (6 iteraciones), `offsets.json`, `cyltable.json`, `models.json`.
- **Datos de experimentos**: `post.json`, `refine.json`, `mobius.json`, `cells.json`, `elps.json`, `modeloffset.json`, `tcaobs.json`.
- **Validación**: `validation-*.json`, `identical.json`, `permodel-cases.json`, `dashboard-data.json`.
- **~60 scripts** `.mjs`: harness de consulta (`evo.mjs`, `evo2.mjs`), ajustes (`finalfit*.mjs`, `combofit.mjs`…), generadores (`gen2.mjs`, `gendash.mjs`, `geninforme.mjs`), validadores (`validate2.mjs`, `builddash.mjs`, `identical.mjs`).

**Acción del Sprint 0:** rescate íntegro a `legacy/evo_replica/` bajo git, con hashes.

## 2. Arquitectura actual (sistema legacy)

Flujo: `evo2.mjs` (consulta ASP.NET con caché) → scripts de ajuste → artefactos JSON →
`gen2.mjs` inyecta los artefactos → `engine.js` (autocontenido) → HTMLs.

Estructura interna de `engine.js`:
1. Normalización de entradas (índice K medido, A/AL efectivas por canales medidos).
2. Interpolación bicúbica + Lagrange de tablas ELP/s₀/κ → curva de Möbius del ojo.
3. Corrección por modelo de LIO (tabla potencia→offset).
4. Regla esférica (más próxima; rejilla especial Zeiss 709/939).
5. Astigmatismo total = 0.9801·anterior + córnea posterior modelada (+ hinge) + SIA.
6. Trazado por meridianos (misma ELP) → residual y EE.
7. Regla de cilindro (cruce por cero + 0.10) y eje exacto.

Métricas validadas (1.206 casos vs web real): potencia 95,4 % · cilindro 79,6 % ·
eje ≤1° 94,8 % · decisión completa 72,6 % · error mediano de tabla 0,01 D.

## 3. Componentes reutilizables para el nuevo proyecto

| Componente | Reutilización |
|---|---|
| Caché de respuestas EVO + harness | Benchmark offline reproducible (sin red) |
| Generadores de casos con semilla (`builddash.mjs`) | Base del replay de métricas y campañas comparativas |
| Datos de validación por caso | Localización de regiones de divergencia |
| Álgebra de doble ángulo (dispersa en scripts) | Reescribir limpia en `src/` (no importar del legacy) |
| Catálogos de cilindros por modelo (`cyltable.json`) | Dato fáctico verificado contra EVO: reutilizable como catálogo |
| `engine.js` | Solo como motor benchmark tras API `run_evo_replica(case)` |

## 4. Componentes a congelar

Todo `legacy/evo_replica/` (motor, datos, caché, harness) con hashes SHA-256 y tests
de regresión (golden cases + réplica de métricas). Cambios prohibidos salvo aislamiento,
y en ese caso: copia, original intacto, motivo documentado.

## 5. Riesgos técnicos

1. **(Materializado, mitigado en Sprint 0)** Artefactos en directorio temporal sin control de versiones.
2. Motor legacy calibrado a EVO v2.0 en fechas concretas; deriva del servidor no detectable offline.
3. Ausencia total de tests automatizados en el sistema previo (validación era por scripts ad hoc).
4. Coeficientes del legacy son *ajustes a EVO*, no física: **no deben migrar al motor nuevo** como si fueran verdades ópticas.
5. Sin datos postoperatorios reales: cualquier "verdad clínica" en esta fase sería sintética (prohibido tratarla como ground truth).
6. Geometrías reales de LIO no publicadas por fabricantes → el modelo físico de lente será genérico y marcado como tal.

## 6. Deuda técnica del legacy

- Scripts monolíticos con rutas absolutas y estado compartido vía JSON.
- Clave de caché acoplada al orden de propiedades del harness (documentado en `EVO_BASELINE.md`).
- Duplicidad de generaciones intermedias (`tables.json`…`tables3.json`, `toricmodel1..5`): se conservan como historia, la vigente es la 4/6.
- Sin sistema de unidades: convenciones implícitas (mm, D, grados) — el motor nuevo las hace explícitas.

## 7. Propuesta de arquitectura nueva

Capas (§4 del encargo): A `src/core/eye.mjs` (preoperative_eye / predicted_postoperative_eye,
parámetros ausentes permitidos) · B `src/predictors/` (posición de LIO modular) ·
C `src/optics/` (paraxial y `raytrace/` comparables) · D `src/core/iol.mjs` (geometría
UNKNOWN explícita, genéricos etiquetados) · E `src/optimize/` · F incertidumbre en
`PredictionResult`. Benchmark común en `src/bench/` con interfaz `predict(case, iol)`.
Detalle completo en `docs/scientific/ARCHITECTURE.md`.
