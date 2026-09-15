# Disclaimer anterior — pendiente de restaurar

Al rediseñar visualmente `calculadora-torica.html` (cambio sin commitear en curso a 2026-09-15),
el disclaimer clínico se recortó. Se decidió dejarlo recortado por ahora, pero se guarda aquí el
texto completo anterior para poder restaurarlo más adelante si se decide recuperar el detalle.

## Texto completo (versión previa al rediseño)

> **Aviso.** Herramienta independiente, no oficial y sin relación con los autores de EVO ni con ningún
> fabricante. El motor se ha calibrado por muestreo para reproducir la calculadora EVO Toric v2.0, pero
> **no es idéntico**. Concordancia sobre casos aleatorios reservados, en configuración estándar:
> **potencia esférica idéntica en el 99,5 %** en el escenario estándar (divergencia mediana de la tabla de refracciones 0,01 D; en el escenario combinado la coincidencia baja al 92,2 % y la divergencia sube a 0,02 D),
> **eje dentro de 1° en el 98 %**, **cilindro tórico idéntico en el 77 %** —y cuando difiere, siempre
> en un escalón contiguo, en casos límite. En miopía magna (AL 27–31,5 mm): esférica 99,2 %,
> cilindro 93,8 %. Dominio validado: AL 20–32 mm, K media 34–50 D.
> No cubre post-LASIK/PRK/QR, biómetro Argos ni córnea posterior medida. Detalle de ensayos en
> `INFORME.md`.
> Verifique el resultado antes de cualquier uso clínico. **No es un producto sanitario.**

## Texto actual (versión rediseñada, recortada)

> **Aviso clínico:** Herramienta independiente, no oficial. Motor calibrado por muestreo sobre EVO Toric v2.0.
> Concordancia: **potencia esférica idéntica en el 99,5 %** · **eje dentro de 1° en el 98 %** · **cilindro tórico idéntico en el 77 %**.
> Dominio validado: AL 20–32 mm, K media 34–50 D. No cubre post-LASIK/PRK/QR. **Verifique siempre el resultado.**

## Lo que se perdió en el recorte

- El dato del escenario combinado (92,2 % de coincidencia, divergencia 0,02 D) — el caso peor/más realista.
- El desglose específico de miopía magna (AL 27–31,5 mm): esférica 99,2 %, cilindro 93,8 %.
- La referencia a `INFORME.md` como fuente de detalle de los ensayos.
- La mención de que no cubre biómetro Argos ni córnea posterior medida.
- La frase **"No es un producto sanitario"** (disclaimer regulatorio).

Dado el historial del proyecto (commits recientes centrados en eliminar sobreafirmaciones clínicas y
cifras falsas), este recorte debería revisarse antes de publicar/distribuir esta versión, aunque por
ahora se deja así a petición explícita del usuario.
