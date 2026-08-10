# Plataforma de investigación en cálculo de LIO

**RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING**

Este repositorio contiene dos sistemas separados:

1. **`legacy/evo_replica/`** — réplica congelada de la calculadora EVO Toric v2.0,
   obtenida por caracterización de caja negra (8.311 consultas reales). Se usa como
   *benchmark* y control experimental. **No se modifica.**
2. **`src/`** — el nuevo motor científico independiente: modelo de datos anatómico,
   óptica paraxial propia, ray tracing, optimizador y sistema de incertidumbre.
   No depende internamente de EVO.

Documentación de arranque:

| Documento | Contenido |
|---|---|
| `PROJECT_PLAN.md` | Plan completo por sprints, con estados |
| `CURRENT_SPRINT.md` | Sprint en ejecución |
| `docs/AUDITORIA.md` | Auditoría del sistema existente |
| `docs/scientific/` | Documentación científica (arquitectura, óptica, baseline, limitaciones…) |

Ejecución de tests: `npm test` (usa el runner nativo de Node ≥ 20; sin dependencias).

Producto de usuario preexistente (se conserva en la raíz, intacto):
`calculadora-torica.html`, `engine.js`, `dashboard.html`, `informe-cientifico.html`,
`INFORME.md`, `COMPARATIVA-CALCULADORAS.md`.
