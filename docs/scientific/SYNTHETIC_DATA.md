# SYNTHETIC_DATA — Datos sintéticos

**Versión:** 1.0 · **Fecha:** 10/08/2026 · RESEARCH USE ONLY

## Regla de oro

Todo ojo sintético lleva `meta.source='synthetic'` y **nunca** actúa como verdad
clínica. Sirve para: análisis de sensibilidad, experimentos virtuales, mapas de
divergencia entre motores y pruebas de la plataforma.

## Generador (`src/synth/generator.mjs`)

| Modo | Uso | Reproducibilidad |
|---|---|---|
| `gridEyes(spec)` | *grid experiments*: barridos deterministas (AL×K, etc.) | determinista por construcción; `meta.kind='grid'` |
| `randomEyes(n, seed)` | *random synthetic experiments* | LCG con semilla fija (idéntico al usado en las campañas del baseline); `meta.kind='random'`, `meta.seed` |

## Distribuciones

Los rangos son **uniformes y declarados** (`DEFAULT_RANGES`, versionados con el
código): AL 21–27 mm, K media 40–47 D, cilindro 0–4 D, ACD 2.6–4.2 mm, LT 3.6–5.4 mm,
CCT 480–620 µm, diana −1.5…+0.5 D. `meta.distribution='uniform_declared'`.

No son distribuciones poblacionales: los agregados sobre muestras aleatorias deben
leerse condicionalmente, no como prevalencias (OPEN_QUESTIONS #5). Cuando exista una
fuente poblacional citable o datos propios, se añadirá un modo `population` con su
procedencia.

## Metadatos mínimos de todo dataset sintético

`source` · `kind` (grid/random) · `seed` si aplica · `distribution` · y, al persistirse
en `experiments/`, la configuración completa, timestamp y commit hash del generador.
