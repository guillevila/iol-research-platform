/**
 * Tests de física contra SOLUCIONES ANALÍTICAS INDEPENDIENTES (V0.5 / P0.7).
 *
 * MOTIVO (auditoría V0, hallazgo H4): la batería de V0 comprobaba mayoritariamente que
 * el motor coincidía consigo mismo — el trazador contra su propio paraxial, la lente
 * gruesa contra su propia delgada. Eso detecta inconsistencias internas, pero NO detecta
 * un error compartido por las dos rutas.
 *
 * Aquí el valor esperado NO sale del motor. Cada test escribe la ecuación en el
 * comentario, la resuelve en cerrado (varias veces como fracción exacta) y compara. Si
 * el motor y la física discrepan, el motor pierde.
 *
 * Sobre las TOLERANCIAS (hallazgo H10): no se eligen "porque pasan". El trazador es
 * exacto (Snell vectorial 3D), así que su discrepancia con el resultado PARAXIAL es
 * aberración esférica real, de orden O(h²) en la altura del rayo. El primer test lo
 * demuestra midiendo el orden de convergencia: al halvar h, el error se divide por 4.
 * Las tolerancias de los demás tests se fijan a partir de esa ley, no a ojo.
 *
 * RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sphericalSurface, planarSurface } from '../src/optics/raytrace/surfaces.mjs';
import { traceRay } from '../src/optics/raytrace/trace.mjs';
import { refract, transfer, propagate } from '../src/optics/paraxial.mjs';
import { GenericIOLFactory } from '../src/core/iol_factory.mjs';
import { createIOL, physicalPowerOfIOL, GeometryStatus } from '../src/core/iol.mjs';

/** z (mm) donde el rayo emergente corta el eje. Estimador paraxial cuando h→0. */
function axisCrossing_mm(surfaces, h_mm, zStart_mm = -20) {
  const t = traceRay(surfaces, { p: [0, h_mm, zStart_mm], d: [0, 0, 1] });
  assert.ok(t.ok, `rayo perdido a h=${h_mm}: ${JSON.stringify(t)}`);
  const r = t.ray;
  return r.p[2] - r.p[1] * (r.d[2] / r.d[1]);
}

const lenteGruesa = ({ R1, R2, t_mm, n, aperture_mm = 8 }) => [
  sphericalSurface({ id: 'a', zVertex_mm: 0, radius_mm: R1, aperture_mm, n_before: 1, n_after: n }),
  sphericalSurface({ id: 'b', zVertex_mm: t_mm, radius_mm: R2, aperture_mm, n_before: n, n_after: 1 }),
];

// ---------------------------------------------------------------------------
// 1. Lente gruesa biconvexa en aire — potencia y distancia focal posterior
// ---------------------------------------------------------------------------
/*
 * Ecuación del constructor de lentes (forma gruesa, medio = aire):
 *     1/f' = (n−1)·[ 1/R1 − 1/R2 + (n−1)·t /(n·R1·R2) ]
 * Distancia focal POSTERIOR medida desde el vértice trasero:
 *     BFD = f'·[ 1 − (n−1)·t /(n·R1) ]
 *
 * Caso: n = 1.5, R1 = +100 mm, R2 = −100 mm, t = 10 mm. En fracciones exactas:
 *     1/f' = 0.5·[ 20 − 1/3 ] = 59/6 D          ⇒ P = 9.8333... D
 *     BFD  = (6/59)·(1 − 1/30) = (6/59)·(29/30) = 29/295 m = 98.30508474576271 mm
 * Con el vértice trasero en z = 10 mm, el foco cae en z = 108.30508474576271 mm.
 */
const BIC = { R1: 100, R2: -100, t_mm: 10, n: 1.5 };
const BIC_POTENCIA_D = 59 / 6;
const BIC_FOCO_MM = 10 + (29 / 295) * 1000;

test('analítico 1a: lente gruesa biconvexa — el foco trazado es 29/295 m tras el vértice', () => {
  const z = axisCrossing_mm(lenteGruesa(BIC), 0.01);
  assert.ok(Math.abs(z - BIC_FOCO_MM) < 1e-4,
    `foco trazado ${z} mm vs cerrado ${BIC_FOCO_MM} mm`);
});

test('analítico 1b: la discrepancia con el paraxial converge como O(h²) — justifica la tolerancia', () => {
  // Al halvar la altura del rayo el error debe dividirse por 4. Si el trazador tuviera un
  // sesgo constante (error de implementación), el cociente tendería a 1, no a 4.
  const errores = [0.32, 0.16, 0.08, 0.04, 0.02].map(h =>
    Math.abs(axisCrossing_mm(lenteGruesa(BIC), h) - BIC_FOCO_MM));
  for (let i = 1; i < errores.length; i++) {
    const orden = errores[i - 1] / errores[i];
    assert.ok(Math.abs(orden - 4) < 0.05,
      `orden de convergencia ${orden.toFixed(3)} ≠ 4 entre h=${[0.32,0.16,0.08,0.04,0.02][i-1]} y el siguiente`);
  }
  // y por tanto a h = 0.01 el error previsto es ~1.6e-6 mm: la tolerancia 1e-4 del test 1a
  // deja tres órdenes de margen y NO es arbitraria.
  assert.ok(errores[errores.length - 1] < 1e-5);
});

test('analítico 1c: la potencia de esa misma geometría, por lensmaker, es 59/6 D', () => {
  // ruta completamente distinta a la del trazado: aritmética de lente gruesa sobre la
  // geometría, sin trazar un solo rayo.
  const banco = createIOL({
    manufacturer: 'BANCO', model: 'biconvexa_R100_t10', nominal_power_d: BIC_POTENCIA_D,
    geometry: { refractive_index: 1.5, central_thickness_mm: 10, r_anterior_mm: 100, r_posterior_mm: -100 },
    geometry_status: GeometryStatus.DERIVED_GENERIC, source: 'lente de banco del test analítico',
  });
  const P = physicalPowerOfIOL(banco, { n_before: 1, n_after: 1 });
  assert.ok(Math.abs(P - BIC_POTENCIA_D) < 1e-12, `P=${P} vs 59/6=${BIC_POTENCIA_D}`);
  // y la fábrica genérica, dentro de su dominio de LIO, invierte la misma ecuación:
  // para 20 D con n=1.49/t=0.8 en acuoso, la potencia física recuperada es exacta
  const lio = new GenericIOLFactory({ n_iol: 1.49, thickness_mm: 0.8 }).create({ power_d: 20 });
  assert.ok(Math.abs(physicalPowerOfIOL(lio) - 20) < 1e-12);
});

// ---------------------------------------------------------------------------
// 2. Plano-convexa: misma potencia, distinto BFD según la cara que recibe la luz
// ---------------------------------------------------------------------------
/*
 * n = 1.5, |R| = 50 mm, t = 5 mm. La cara plana no aporta potencia (1/R = 0), así que
 *     P = (n−1)/R = 0.5/0.05 = 10 D  en AMBAS orientaciones,  f' = 100 mm.
 * Pero el BFD sí depende de qué cara va delante:
 *     curva delante (R1 = +50):  BFD = 100·(1 − 0.5·0.005/(1.5·0.05)) = 100·(29/30) = 96.666… mm
 *     plana  delante (R1 = ∞ ):  BFD = 100·(1 − 0)                    = 100 mm
 * Es la prueba de que el motor trata la lente como GRUESA (planos principales separados)
 * y no como delgada con un espesor decorativo: una lente delgada daría el mismo BFD.
 */
test('analítico 2: plano-convexa — misma potencia (10 D), BFD distinto según orientación', () => {
  const curvaDelante = [
    sphericalSurface({ id: 'a', zVertex_mm: 0, radius_mm: 50, aperture_mm: 8, n_before: 1, n_after: 1.5 }),
    planarSurface({ id: 'b', z_mm: 5, aperture_mm: 8, n_before: 1.5, n_after: 1 }),
  ];
  const planaDelante = [
    planarSurface({ id: 'a', z_mm: 0, aperture_mm: 8, n_before: 1, n_after: 1.5 }),
    sphericalSurface({ id: 'b', zVertex_mm: 5, radius_mm: -50, aperture_mm: 8, n_before: 1.5, n_after: 1 }),
  ];
  const zCurva = axisCrossing_mm(curvaDelante, 0.01);
  const zPlana = axisCrossing_mm(planaDelante, 0.01);
  assert.ok(Math.abs(zCurva - (5 + 100 * 29 / 30)) < 1e-4, `curva delante: ${zCurva}`);
  assert.ok(Math.abs(zPlana - (5 + 100)) < 1e-4, `plana delante: ${zPlana}`);
  // separación exacta 100/30 mm: si el motor tratara la lente como delgada, sería 0
  assert.ok(Math.abs((zPlana - zCurva) - 100 / 30) < 1e-4);
});

// ---------------------------------------------------------------------------
// 3. Lente gruesa ASIMÉTRICA e inversión del sentido de la luz
// ---------------------------------------------------------------------------
/*
 * n = 1.6, t = 8 mm, R1 = +60, R2 = −30:
 *     P1 = 0.6/0.06 = 10 D,  P2 = (1−1.6)/(−0.03) = 20 D
 *     P  = 10 + 20 − (0.008/1.6)·200 = 30 − 1 = 29 D   ⇒ f' = 1000/29 mm
 * Espejando la lente (R1 = +30, R2 = −60) los papeles de P1 y P2 se intercambian y P NO
 * cambia (reversibilidad de la potencia equivalente), pero el BFD sí:
 *     BFD = f'·[1 − (n−1)·t/(n·R1)]  →  R1=60: f'·0.95 ;  R1=30: f'·0.90
 * Dos literales independientes que comparten el mismo f': si el motor acertara uno por
 * casualidad, fallaría el otro.
 */
test('analítico 3: lente asimétrica — la potencia es reversible, el BFD no', () => {
  const n = 1.6, t = 8, f_mm = 1000 / 29;
  const bfd = R1 => f_mm * (1 - (n - 1) * (t / 1000) / (n * (R1 / 1000)));
  const zDirecta = axisCrossing_mm(lenteGruesa({ R1: 60, R2: -30, t_mm: t, n }), 0.01);
  const zEspejada = axisCrossing_mm(lenteGruesa({ R1: 30, R2: -60, t_mm: t, n }), 0.01);
  assert.ok(Math.abs(zDirecta - (t + bfd(60))) < 1e-4, `directa ${zDirecta} vs ${t + bfd(60)}`);
  assert.ok(Math.abs(zEspejada - (t + bfd(30))) < 1e-4, `espejada ${zEspejada} vs ${t + bfd(30)}`);
  // la diferencia es exactamente f'·0.05 = 50/29 mm
  assert.ok(Math.abs((zDirecta - zEspejada) - 50 / 29) < 1e-4);
});

// ---------------------------------------------------------------------------
// 4. Ojo reducido: un solo dioptrio, f' = n₂·R/(n₂ − n₁)
// ---------------------------------------------------------------------------
/*
 * Un ojo reducido es UNA superficie refractante aire→medio con n = 4/3 y potencia 60 D.
 * De la definición de potencia de dioptrio, P = (n₂ − n₁)/R, se sigue en cerrado:
 *     R  = (n₂ − n₁)/P = (1/3)/60 m = 5.5555… mm
 *     f' = n₂·R/(n₂ − n₁) = n₂/P = (4/3)/60 m = 22.2222… mm
 * (La aritmética es autocontenida: R y f' se derivan de P y n, sin apelar a ninguna
 *  tabla bibliográfica; el test valida el motor, no un ojo esquemático concreto.)
 */
test('analítico 4: dioptrio único — el foco cae en n₂·R/(n₂−n₁) exacto', () => {
  const n2 = 4 / 3, P = 60;
  const R_mm = (n2 - 1) / P * 1000;
  const f_mm = n2 * (R_mm / 1000) / (n2 - 1) * 1000;
  assert.ok(Math.abs(f_mm - n2 / P * 1000) < 1e-12, 'las dos formas cerradas deben coincidir');
  const sup = [sphericalSurface({ id: 'c', zVertex_mm: 0, radius_mm: R_mm, aperture_mm: 3, n_before: 1, n_after: n2 })];
  const z = axisCrossing_mm(sup, 0.01, -10);
  assert.ok(Math.abs(z - f_mm) < 1e-4, `foco ${z} mm vs cerrado ${f_mm} mm`);
});

// ---------------------------------------------------------------------------
// 5. Invariante de Lagrange–Helmholtz
// ---------------------------------------------------------------------------
/*
 *     H = n·(y_A·u_B − y_B·u_A)   se conserva a través de todo sistema centrado.
 * Es una consecuencia de la ley de Snell independiente de cualquier fórmula de
 * vergencias: si el trazador 3D tuviera un error de signo, de normal o de índice, H
 * cambiaría. Se evalúa con dos rayos (uno paralelo, uno inclinado desde el eje) en el
 * plano de entrada y en un plano posterior a la lente.
 */
test('analítico 5: el invariante de Lagrange se conserva a través del sistema', () => {
  const S = lenteGruesa(BIC);
  const yu = (r, z) => { const t = (z - r.p[2]) / r.d[2]; return { y: r.p[1] + t * r.d[1], u: r.d[1] / r.d[2] }; };
  const A0 = { p: [0, 0.02, -20], d: [0, 0, 1] };          // paralelo al eje
  const B0 = { p: [0, 0, -20], d: [0, 0.0005, 1] };        // desde el eje, inclinado
  const a0 = yu(A0, -20), b0 = yu(B0, -20);
  const H0 = 1 * (a0.y * b0.u - b0.y * a0.u);
  const A = traceRay(S, A0), B = traceRay(S, B0);
  assert.ok(A.ok && B.ok);
  const a1 = yu(A.ray, 40), b1 = yu(B.ray, 40);
  const H1 = 1 * (a1.y * b1.u - b1.y * a1.u);
  assert.ok(Math.abs(H1 / H0 - 1) < 1e-6, `H no conservado: ${H0} → ${H1}`);
});

// ---------------------------------------------------------------------------
// 6. Ecuación de Gullstrand para dos lentes delgadas separadas
// ---------------------------------------------------------------------------
/*
 *     P = P1 + P2 − d·P1·P2            (potencia equivalente, medio = aire)
 *     BFD = (1 − d·P1)/P               (foco posterior desde la segunda lente)
 * La cadena de vergencias del motor (refract → transfer → refract) no calcula ninguna de
 * las dos: llega al mismo sitio por otro camino. Coincidir en todo un barrido de (P1,P2,d)
 * es una comprobación algebraica genuina.
 */
test('analítico 6: la cadena de vergencias reproduce la ecuación de Gullstrand', () => {
  for (const P1 of [5, 10, 20, -8]) {
    for (const P2 of [3, 12, 25]) {
      for (const d of [0.005, 0.02, 0.05]) {
        // Singularidad FÍSICA, no defecto: si d·P1 = 1 el foco de la primera lente cae
        // exactamente sobre la segunda y la vergencia incidente es infinita. Se comprueba
        // aparte que el motor la rechaza en vez de devolver un número sin sentido.
        if (Math.abs(1 - d * P1) < 1e-9) continue;
        const V1 = refract(0, P1);
        const V2 = transfer(V1, d, 1);
        const V3 = refract(V2, P2);
        const P = P1 + P2 - d * P1 * P2;
        const bfdCerrado = (1 - d * P1) / P;
        assert.ok(Math.abs(1 / V3 - bfdCerrado) < 1e-12,
          `P1=${P1} P2=${P2} d=${d}: motor ${1 / V3} vs Gullstrand ${bfdCerrado}`);
        // y `propagate` debe dar exactamente lo mismo que la cadena escrita a mano
        const Vp = propagate([
          { type: 'refract', power_d: P1 },
          { type: 'gap', distance_m: d, n: 1 },
          { type: 'refract', power_d: P2 },
        ], 0);
        assert.ok(Math.abs(Vp - V3) < 1e-12);
      }
    }
  }
  // el caso singular d·P1 = 1 (20 D separadas 50 mm) debe fallar explícitamente
  assert.throws(() => transfer(refract(0, 20), 0.05, 1), RangeError);
});

// ---------------------------------------------------------------------------
// 7. Invariancia de escala
// ---------------------------------------------------------------------------
/*
 * Las ecuaciones de la óptica geométrica son homogéneas: si TODAS las longitudes se
 * multiplican por k (radios, espesores, distancias) y los índices no cambian, entonces
 * toda distancia focal se multiplica por k y toda potencia se divide por k.
 * Es una simetría del problema, no una fórmula del motor: detecta cualquier constante
 * dimensional cableada por error (un "1000" perdido, un mm tratado como m).
 */
test('analítico 7: escalar el sistema por k escala los focos por k y las potencias por 1/k', () => {
  for (const k of [0.5, 2, 10]) {
    const z1 = axisCrossing_mm(lenteGruesa(BIC), 0.01);
    const escalada = lenteGruesa({ R1: BIC.R1 * k, R2: BIC.R2 * k, t_mm: BIC.t_mm * k, n: BIC.n, aperture_mm: 8 * k });
    const zk = axisCrossing_mm(escalada, 0.01 * k, -20 * k);
    assert.ok(Math.abs(zk - k * z1) / (k * z1) < 1e-9, `k=${k}: ${zk} ≠ ${k}·${z1}`);
    // y la potencia de la MISMA geometría escalada cae exactamente como 1/k
    const escalar = kk => createIOL({
      manufacturer: 'BANCO', model: 'escala', nominal_power_d: BIC_POTENCIA_D / kk,
      geometry: { refractive_index: 1.5, central_thickness_mm: 10 * kk, r_anterior_mm: 100 * kk, r_posterior_mm: -100 * kk },
      geometry_status: GeometryStatus.DERIVED_GENERIC, source: 'test de invariancia de escala',
    });
    const Pk = physicalPowerOfIOL(escalar(k), { n_before: 1, n_after: 1 });
    assert.ok(Math.abs(Pk - BIC_POTENCIA_D / k) < 1e-12, `k=${k}: P=${Pk} ≠ (59/6)/${k}`);
  }
});

// ---------------------------------------------------------------------------
// 8. El término de espesor de la lente gruesa es exactamente (t/n)·P1·P2
// ---------------------------------------------------------------------------
/*
 *     P_gruesa = P1 + P2 − (t/n)·P1·P2
 * ⇒   P_delgada − P_gruesa = (t/n)·P1·P2   EXACTAMENTE, para cualquier t.
 * No es una aproximación de primer orden: es una identidad. Si el motor tuviera el término
 * cruzado mal (signo, índice, o t sin convertir), la diferencia no seguiría la recta.
 */
test('analítico 8: la corrección de espesor es la identidad (t/n)·P1·P2, no una aproximación', () => {
  const n = 1.49, R1 = 12, R2 = -12, nm = 1.336;
  const P1 = (n - nm) * 1000 / R1;
  const P2 = (nm - n) * 1000 / R2;
  for (const t_mm of [0.05, 0.2, 0.5, 0.8, 1.2, 2.0]) {
    const iol = new GenericIOLFactory({ n_iol: n, thickness_mm: t_mm, n_medium: nm })
      .create({ power_d: 20 });
    // se reconstruye P a partir de la geometría que la fábrica produjo, y se compara con
    // la identidad evaluada sobre ESOS radios
    const r1 = iol.geometry.r_anterior_mm, r2 = iol.geometry.r_posterior_mm;
    const p1 = (n - nm) * 1000 / r1, p2 = (nm - n) * 1000 / r2;
    const identidad = p1 + p2 - (t_mm / 1000 / n) * p1 * p2;
    assert.ok(Math.abs(physicalPowerOfIOL(iol, { n_before: nm, n_after: nm }) - identidad) < 1e-12);
    assert.ok(Math.abs(identidad - 20) < 1e-9, `t=${t_mm}: la fábrica debe realizar 20 D exactos`);
  }
  // y con la geometría FIJA, la caída de potencia con t es exactamente lineal de pendiente P1·P2/n
  const pendiente = P1 * P2 / n / 1000;      // D por mm
  const P_de_t = t_mm => P1 + P2 - (t_mm / 1000 / n) * P1 * P2;
  for (const t_mm of [0.1, 0.9, 1.7]) {
    assert.ok(Math.abs((P_de_t(0) - P_de_t(t_mm)) - pendiente * t_mm) < 1e-12);
  }
});
