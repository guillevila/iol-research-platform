/**
 * V1.6 — primitiva biconicSurface: familia matemática explícita del tórico trazado.
 *
 * Anclas de verificación (dos algoritmos INDEPENDIENTES):
 *  - Rx=Ry, kx=ky → la intersección de Newton salvaguardado debe coincidir con la
 *    forma CERRADA de conicSurface (Citardauq) a 1e-12: si cualquiera de los dos
 *    algoritmos tuviera un defecto, la coincidencia sería un milagro.
 *  - cx=0 → cilindro: foco en forma cerrada f' = n2·R/(n2−n1) en un solo meridiano
 *    (la línea focal pura), CERO desviación en el meridiano plano.
 *
 * RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { biconicSurface, conicSurface, sphericalSurface, transformedSurface, intersect, refractDirection } from '../src/optics/raytrace/surfaces.mjs';
import { createIOLPose, rotationOfPose } from '../src/core/pose.mjs';

/** LCG determinista: los tests no usan Math.random (reproducibilidad exacta). */
function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** batería de rayos oblicuos deterministas hacia la superficie */
function probeRays(n = 200, seed = 42) {
  const rnd = lcg(seed);
  const rays = [];
  for (let i = 0; i < n; i++) {
    const x = (rnd() - 0.5) * 5, y = (rnd() - 0.5) * 5;
    const dx = (rnd() - 0.5) * 0.4, dy = (rnd() - 0.5) * 0.4;
    const norm = Math.hypot(dx, dy, 1);
    rays.push({ p: [x, y, -8], d: [dx / norm, dy / norm, 1 / norm] });
  }
  return rays;
}

const Rz = deg => rotationOfPose(createIOLPose({ rotation_z_deg: deg }));

test('biconic · Rx=Ry, kx=ky recupera la CÓNICA a 1e-12 (Newton vs forma cerrada, punto/normal/t)', () => {
  for (const [R, k] of [[7.7, 0], [7.7, -0.18], [-6.8, -0.3], [12, 0.5], [20, -1], [-20, -2.5]]) {
    const bic = biconicSurface({ zVertex_mm: 3, radius_x_mm: R, radius_y_mm: R, kx: k, ky: k, aperture_mm: 3, n_before: 1.0, n_after: 1.376 });
    const con = conicSurface({ zVertex_mm: 3, radius_mm: R, k, aperture_mm: 3, n_before: 1.0, n_after: 1.376 });
    let hits = 0;
    for (const ray of probeRays()) {
      const hb = intersect(bic, ray), hc = intersect(con, ray);
      assert.equal(hb === null, hc === null, `discrepancia de acierto/fallo R=${R} k=${k}`);
      if (!hb) continue;
      hits++;
      for (let i = 0; i < 3; i++) {
        assert.ok(Math.abs(hb.point[i] - hc.point[i]) < 1e-12, `punto[${i}]: ${hb.point[i]} vs ${hc.point[i]}`);
        assert.ok(Math.abs(hb.normal[i] - hc.normal[i]) < 1e-12, `normal[${i}]`);
      }
      assert.ok(Math.abs(hb.t - hc.t) < 1e-12, 't');
    }
    assert.ok(hits > 50, `batería degenerada: solo ${hits} aciertos para R=${R}, k=${k}`);
  }
});

test('biconic · kx=ky=0, Rx=Ry recupera también la ESFERA (tercer algoritmo independiente)', () => {
  const bic = biconicSurface({ zVertex_mm: 0, radius_x_mm: 7.7, radius_y_mm: 7.7, aperture_mm: 3, n_before: 1, n_after: 1.376 });
  const sph = sphericalSurface({ zVertex_mm: 0, radius_mm: 7.7, aperture_mm: 3, n_before: 1, n_after: 1.376 });
  let hits = 0;
  for (const ray of probeRays(150, 7)) {
    const hb = intersect(bic, ray), hs = intersect(sph, ray);
    assert.equal(hb === null, hs === null);
    if (!hb) continue;
    hits++;
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(hb.point[i] - hs.point[i]) < 1e-12);
  }
  assert.ok(hits > 40);
});

test('biconic · cx=0 es un CILINDRO: foco en forma cerrada en un meridiano, cero desviación en el otro', () => {
  // superficie plano-cilíndrica (radius_x = Infinity → curvatura 0): potencia SOLO en y.
  // foco paraxial desde el vértice: f' = n2·R/(n2−n1) = 1.336·6.68/0.336 mm
  const n2 = 1.336, Ry = 6.68;
  const fEsperado = n2 * Ry / (n2 - 1);
  const cyl = biconicSurface({ zVertex_mm: 0, radius_x_mm: Infinity, radius_y_mm: Ry, aperture_mm: 3, n_before: 1, n_after: n2 });
  // meridiano y: rayos paralelos a alturas pequeñas cruzan el eje en f' (límite paraxial)
  for (const h of [1e-3, 5e-3]) {
    const hit = intersect(cyl, { p: [0.4, h, -5], d: [0, 0, 1] });
    assert.ok(hit, 'el rayo debía intersecar');
    const r = refractDirection([0, 0, 1], hit.normal, 1, n2);
    assert.ok(!r.tir);
    const tCruce = -hit.point[1] / r.d[1];
    const zCruce = hit.point[2] + r.d[2] * tCruce;
    assert.ok(Math.abs(zCruce - fEsperado) < 5e-4, `foco cilíndrico ${zCruce} vs ${fEsperado}`);
    // el meridiano x NO desvía: dx sigue siendo exactamente 0
    assert.equal(r.d[0], 0);
  }
  // rayo en el meridiano PLANO (y=0): incidencia normal exacta, sin desviación alguna
  const plano = intersect(cyl, { p: [0.8, 0, -5], d: [0, 0, 1] });
  const rp = refractDirection([0, 0, 1], plano.normal, 1, n2);
  assert.deepEqual(rp.d, [0, 0, 1]);
});

test('biconic · construcción: valida dominio de sagita con el peor meridiano (como la cónica)', () => {
  // meridiano y con (1+ky)cy² grande limita r_max aunque x sea suave
  assert.throws(() => biconicSurface({
    zVertex_mm: 0, radius_x_mm: 50, radius_y_mm: 3, kx: 0, ky: 0.5,
    aperture_mm: 2.6, n_before: 1, n_after: 1.336,
  }), /fuera del dominio/);
  // meridiano hiperbólico (k<−1): sin límite de dominio por ese eje
  const ok = biconicSurface({
    zVertex_mm: 0, radius_x_mm: 50, radius_y_mm: 6, kx: -2, ky: -1.5,
    aperture_mm: 10, n_before: 1, n_after: 1.336,
  });
  assert.equal(ok.kind, 'biconic');
});

test('biconic · intercambio Rx↔Ry + rotación 90° = el MISMO conjunto de puntos (criterio V1.6)', () => {
  const S1 = biconicSurface({ zVertex_mm: 2, radius_x_mm: 8.2, radius_y_mm: 7.1, kx: -0.1, ky: -0.25, aperture_mm: 2.8, n_before: 1, n_after: 1.376 });
  const S2 = transformedSurface({
    base: biconicSurface({ zVertex_mm: 0, radius_x_mm: 7.1, radius_y_mm: 8.2, kx: -0.25, ky: -0.1, aperture_mm: 2.8, n_before: 1, n_after: 1.376 }),
    R: Rz(90), T: [0, 0, 2],
  });
  let hits = 0;
  for (const ray of probeRays(200, 11)) {
    const h1 = intersect(S1, ray), h2 = intersect(S2, ray);
    assert.equal(h1 === null, h2 === null);
    if (!h1) continue;
    hits++;
    for (let i = 0; i < 3; i++) {
      assert.ok(Math.abs(h1.point[i] - h2.point[i]) < 1e-10, `punto[${i}]: ${h1.point[i]} vs ${h2.point[i]}`);
      assert.ok(Math.abs(h1.normal[i] - h2.normal[i]) < 1e-10, `normal[${i}]`);
    }
  }
  assert.ok(hits > 50);
});

test('biconic · periodicidad 180°: Rz(θ) y Rz(θ+180°) producen intersecciones idénticas', () => {
  const base = () => biconicSurface({ zVertex_mm: 1, radius_x_mm: 8.5, radius_y_mm: 7.3, kx: -0.2, ky: -0.05, aperture_mm: 2.5, n_before: 1, n_after: 1.376 });
  for (const theta of [0, 17, 63.4, 121]) {
    const A = transformedSurface({ base: base(), R: Rz(theta), T: [0, 0, 0] });
    const B = transformedSurface({ base: base(), R: Rz(theta + 180), T: [0, 0, 0] });
    for (const ray of probeRays(80, 100 + theta)) {
      const ha = intersect(A, ray), hb = intersect(B, ray);
      assert.equal(ha === null, hb === null);
      if (!ha) continue;
      for (let i = 0; i < 3; i++) assert.ok(Math.abs(ha.point[i] - hb.point[i]) < 1e-11);
    }
  }
});

test('biconic · sin pérdidas artificiales: haz denso pierde EXACTAMENTE los mismos rayos que la cónica vecina', () => {
  // un tórico suave (cilindro corneal ~3 D) no debe perder rayos que la cónica de
  // curvatura media no pierda: mismas pérdidas, misma cuenta
  const bic = biconicSurface({ zVertex_mm: 0, radius_x_mm: 7.9, radius_y_mm: 7.5, kx: -0.18, ky: -0.18, aperture_mm: 3, n_before: 1, n_after: 1.376 });
  const con = conicSurface({ zVertex_mm: 0, radius_mm: 7.7, k: -0.18, aperture_mm: 3, n_before: 1, n_after: 1.376 });
  let nb = 0, nc = 0, total = 0;
  for (const ray of probeRays(400, 999)) {
    total++;
    if (intersect(bic, ray)) nb++;
    if (intersect(con, ray)) nc++;
  }
  assert.equal(nb, nc, `pérdidas distintas: bicónica acierta ${nb}, cónica ${nc} de ${total}`);
  assert.ok(nb > total * 0.3);
});

test('biconic · refracción coherente: Snell sobre la normal bicónica conserva n·sinθ (1e-12)', () => {
  const bic = biconicSurface({ zVertex_mm: 0, radius_x_mm: 8.6, radius_y_mm: 7.2, kx: -0.3, ky: 0.1, aperture_mm: 2.8, n_before: 1, n_after: 1.4 });
  for (const ray of probeRays(120, 5)) {
    const hit = intersect(bic, ray);
    if (!hit) continue;
    const r = refractDirection(ray.d, hit.normal, 1, 1.4);
    if (r.tir) continue;
    const cosI = -(ray.d[0] * hit.normal[0] + ray.d[1] * hit.normal[1] + ray.d[2] * hit.normal[2]);
    const cosT = -(r.d[0] * hit.normal[0] + r.d[1] * hit.normal[1] + r.d[2] * hit.normal[2]);
    const sinI = Math.sqrt(Math.max(0, 1 - cosI * cosI));
    const sinT = Math.sqrt(Math.max(0, 1 - cosT * cosT));
    assert.ok(Math.abs(1 * sinI - 1.4 * sinT) < 1e-12, `Snell violado: ${sinI} vs ${1.4 * sinT / 1}`);
  }
});

// ---------------------------------------------------------------------------------
// Regresiones de la REVISIÓN ADVERSARIAL V1.6 (casos exactos del refutador): la
// intersección por barrido grueso devolvía la rama LEJANA en rayos rasantes, perdía
// raíces genuinas con dz pequeño no nulo (ventana de losa sin cota) y no reintentaba
// cuando el primer cruce caía fuera de apertura. El oráculo es la CÓNICA CERRADA.
// ---------------------------------------------------------------------------------

const esferaBic = a => biconicSurface({ zVertex_mm: 0, radius_x_mm: 7.7, radius_y_mm: 7.7, kx: 0, ky: 0, aperture_mm: a, n_before: 1, n_after: 1.376 });
const esferaCon = a => conicSurface({ zVertex_mm: 0, radius_mm: 7.7, k: 0, aperture_mm: a, n_before: 1, n_after: 1.376 });

test('biconic · regresión adversarial: el rayo rasante que devolvía la rama LEJANA ahora devuelve la próxima', () => {
  // caso literal del refutador: raíces reales en apertura [21.67, 28.43]; el barrido
  // grueso saltaba la primera y devolvía t=28.43 con la orientación equivocada
  const d0 = [-0.108975178, 0.994017085, 0.007378706];
  const n = Math.hypot(...d0);
  const ray = { p: [2.724379, -24.850427, 0.597421], d: d0.map(v => v / n) };
  const hb = intersect(esferaBic(4), ray), hc = intersect(esferaCon(4), ray);
  assert.ok(hb && hc, 'ambos debían intersecar');
  assert.ok(Math.abs(hb.t - hc.t) < 1e-9, `rama equivocada: biconic t=${hb.t} vs conic t=${hc.t}`);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(hb.normal[i] - hc.normal[i]) < 1e-9, `normal[${i}]`);
});

test('biconic · regresión adversarial: dz pequeño no nulo ya no pierde raíces genuinas (ventana acotada)', () => {
  // la ventana de losa crecía como 2·SB/|dz|: con dz=0.005/0.001 se perdían raíces
  // que la cónica cerrada encontraba; ahora la ventana se acota con la apertura
  for (const dzv of [0.005, 0.001, 0]) {
    const n = Math.hypot(1, 0, dzv);
    const ray = { p: [-30, 0, 0.5], d: [1 / n, 0, dzv / n] };
    const hb = intersect(esferaBic(4), ray), hc = intersect(esferaCon(4), ray);
    assert.equal(hb === null, hc === null, `dz=${dzv}: acierto/fallo distinto del oráculo`);
    if (hb) assert.ok(Math.abs(hb.t - hc.t) < 1e-9, `dz=${dzv}: t=${hb.t} vs ${hc.t}`);
  }
});

test('biconic · regresión adversarial: si el primer cruce cae fuera de apertura, se reintenta el segundo', () => {
  // la cónica itera sus dos raíces; la bicónica abandonaba tras la primera. Batería
  // determinista de rayos descendentes cuya primera raíz cae fuera de la apertura 3
  const rnd = lcg(20260811);
  let recuperados = 0;
  for (let i = 0; i < 200; i++) {
    const x0 = 4 + rnd() * 3, z0 = -2 - rnd() * 2;
    const hacia = [-(x0 - rnd() * 1.5), rnd() * 0.4 - 0.2, 2 + rnd() * 3];
    const n = Math.hypot(...hacia);
    const ray = { p: [x0, 0, z0], d: hacia.map(v => v / n) };
    const hb = intersect(esferaBic(3), ray), hc = intersect(esferaCon(3), ray);
    assert.equal(hb === null, hc === null, `caso ${i}: biconic ${hb?.t} vs conic ${hc?.t}`);
    if (hb) {
      assert.ok(Math.abs(hb.t - hc.t) < 1e-9, `caso ${i}: t ${hb.t} vs ${hc.t}`);
      recuperados++;
    }
  }
  assert.ok(recuperados > 30, `batería degenerada: solo ${recuperados} aciertos`);
});

test('biconic · regresión adversarial: batería rasante — ninguna rama lejana y pérdidas idénticas a la cónica', () => {
  const rnd = lcg(123456789);
  let hits = 0, perdidasB = 0, perdidasC = 0;
  for (let i = 0; i < 500; i++) {
    const p = [(rnd() - 0.5) * 12, -25 + rnd() * 5, rnd() * 2 - 0.5];
    const d0 = [(rnd() - 0.5) * 0.4, 1, (rnd() - 0.5) * 0.05];
    const n = Math.hypot(...d0);
    const ray = { p, d: d0.map(v => v / n) };
    const hb = intersect(esferaBic(4), ray), hc = intersect(esferaCon(4), ray);
    if (hc && !hb) perdidasB++;
    if (hb && !hc) perdidasC++;
    if (hb && hc) {
      hits++;
      assert.ok(Math.abs(hb.t - hc.t) < 1e-9, `caso ${i}: rama distinta (${hb.t} vs ${hc.t})`);
    }
  }
  assert.equal(perdidasB, 0, `bicónica perdió ${perdidasB} rayos que la cónica encuentra`);
  assert.equal(perdidasC, 0);
  assert.ok(hits > 100, `batería degenerada: ${hits} aciertos`);
});
