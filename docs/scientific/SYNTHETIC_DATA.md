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
| `randomEyes(n, seed)` | *random synthetic experiments* | LCG con semilla fija (el mismo de las campañas del baseline, **por compatibilidad histórica, no por calidad** — ver aviso abajo); `meta.kind='random'`, `meta.seed` |

> **Defecto MEDIDO del PRNG** (auditoría V1.15). El LCG de `makeRng` **no es un buen
> generador**: infla la varianza de las normales derivadas un **1.3–2.8 %** según semilla, y
> su sesgo sobre E|N(0,σ)| es de **~0.8 % al alza** y sistemático (medido y publicado en
> `experiments/exp015_pipeline_eq_trazado` → `bloque0_anclas_exp006.sesgo_prng_medido`, y
> documentado en `src/uncertainty/montecarlo.mjs`). Se conserva **por reproducibilidad de los
> resultados ya publicados**, no porque sea adecuado. Los módulos nuevos (V1.12 en adelante)
> usan `mulberry32` local. Antes de usar `randomEyes` para un análisis nuevo cuya conclusión
> dependa de la varianza, ténganse en cuenta esos números.

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
