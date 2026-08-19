# ERRATAS de los experimentos publicados

**RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING**

Los experimentos de este repositorio son **artefactos congelados**: sus `results.json` y sus
`README.md` se generan por script y `scripts/check_experiments.mjs` verifica en cada push que
siguen reproduciéndose. Por eso **no se reescriben** cuando una revisión posterior corrige su
interpretación: se publica una **fe de erratas** al lado, como se haría con un artículo.

Este índice existe porque un lector que abre el README de un experimento no tiene por qué
saber que hay una corrección. **Antes de citar cualquier experimento, mira si tiene errata.**

| Experimento | ¿Errata? | Qué corrige |
|---|---|---|
| exp001 sensibilidad ELP | [ERRATA](exp001_sensibilidad_elp/ERRATA.md) | «umbral clínico de referencia» enunciado como hecho establecido |
| exp002 divergencia paraxial vs EVO | — | |
| exp003 paraxial vs raytrace | — | |
| exp004 Monte Carlo | — | (ver los límites del PRNG en `src/uncertainty/montecarlo.mjs`) |
| exp005 tórico físico vs EVO | — | |
| exp006 capacidad EQ | [ERRATA](exp006_capacidad_eq/ERRATA.md) | «beneficio esperado» no es beneficio clínico; cifra en prosa que no está en su tabla; vocabulario de superioridad; límites numéricos del artefacto |
| exp007 política corneal | — | |
| exp008 objetivo óptico | — | |
| exp009 asfericidad de LIO | — | |
| exp010 pose de LIO | — | |
| exp011 tórico trazado | — | |
| exp012 rotación tórica | — | |
| exp013 atlas de divergencia | [ERRATA](exp013_atlas_divergencia/ERRATA.md) | el sello de commit del README no es el de las cifras vigentes; «CONVERGIDO» es literal fijo, no conclusión derivada |
| exp014 incertidumbre sobre trazado | [ERRATA](exp014_incertidumbre_trazado/ERRATA.md) | sus cifras son una regeneración posterior a la caza adversarial; el sello de commit no lo dice |
| exp015 pipeline EQ | — | (sus correcciones adversariales están **dentro** de su propio README y results.json, publicadas como tales) |

## Por qué las erratas viven fuera del artefacto

Editar el README de un experimento a mano es inestable: lo regenera su script. Editar el
script equivale a reescribir el artefacto histórico. La errata es un fichero **hermano**, no
generado, que `check_experiments.mjs` no toca — así sobrevive a cualquier regeneración y la
historia queda intacta.

**Regla:** si una revisión encuentra que una CIFRA publicada es incorrecta, se regenera el
experimento en un commit propio explicando por qué. Si lo incorrecto es la **interpretación**
o la **prosa**, se publica errata y el artefacto no se toca.
