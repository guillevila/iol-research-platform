import fs from 'fs';

const T = JSON.parse(fs.readFileSync('tables2.json', 'utf8'));      // {ALs,Ks,AS,tables}
const CYL = JSON.parse(fs.readFileSync('cyltable.json', 'utf8'));
const MODELS = JSON.parse(fs.readFileSync('models.json', 'utf8'));
const PAR = JSON.parse(fs.readFileSync('params.json', 'utf8'));     // posterior + LT/CCT coefficients

const num = (x, d = 6) => Number(x.toFixed(d));
const modelList = MODELS.models.map(m => ({
  value: m.value, label: m.label, cyls: (CYL[m.value] || { cyls: [] }).cyls,
}));

const data = {
  ALs: T.ALs, Ks: T.Ks, AS: T.AS,
  ELP: T.AS.map(a => T.tables[a].ELP.map(r => r.map(v => num(v, 5)))),
  s0: T.AS.map(a => T.tables[a].s0.map(r => r.map(v => num(v, 6)))),
  kap: T.AS.map(a => T.tables[a].kap.map(r => r.map(v => num(v, 7)))),
  models: modelList,
  par: PAR,
};

const js = `/*
 * engine.js — motor de cálculo de la calculadora tórica de LIO.
 *
 * Implementación independiente, calibrada por muestreo sistemático de la
 * calculadora EVO Toric v2.0. Véase INFORME.md para la metodología completa,
 * los ensayos realizados y la concordancia medida.
 *
 * Generado automáticamente. No editar a mano.
 */
'use strict';
var ENGINE = (function () {
  var D = ${JSON.stringify(data)};

  var NV = 1336;                       // índice reducido del ojo x 1000
  var KIDX_INTERNAL = 1.3375;          // índice queratométrico interno del motor

  // ---- utilidades ------------------------------------------------------
  function KcOf(K) { return 331.5 / (337.5 / K); }        // convenio n = 1.3315
  function p0Of(AL, Kc, ELP) { return NV / (AL - ELP) - NV / (NV / Kc - ELP); }

  function cubic1(vs, t) {
    var n = vs.length, i = Math.max(0, Math.min(n - 2, Math.floor(t))), f = t - i;
    function p(k) { return vs[Math.max(0, Math.min(n - 1, k))]; }
    var p0 = p(i - 1), p1 = p(i), p2 = p(i + 1), p3 = p(i + 2);
    return p1 + 0.5 * f * (p2 - p0 + f * (2 * p0 - 5 * p1 + 4 * p2 - p3 + f * (3 * (p1 - p2) + p3 - p0)));
  }
  function bicubic(M, AL, K) {
    var ta = (AL - D.ALs[0]) / (D.ALs[1] - D.ALs[0]);
    var tk = (K - D.Ks[0]) / (D.Ks[1] - D.Ks[0]);
    var col = [];
    for (var i = 0; i < M.length; i++) col.push(cubic1(M[i], tk));
    return cubic1(col, ta);
  }
  // interpolación en la constante A (rejilla no uniforme -> Lagrange local de 3 puntos)
  function alongA(cube, AL, K, A) {
    var n = D.AS.length, j = 0;
    while (j < n - 2 && D.AS[j + 1] < A) j++;
    var lo = Math.max(0, Math.min(n - 3, j - (A < D.AS[j] ? 1 : 0)));
    var idx = [lo, lo + 1, lo + 2], v = [], x = [];
    for (var q = 0; q < 3; q++) { x.push(D.AS[idx[q]]); v.push(bicubic(cube[idx[q]], AL, K)); }
    var s = 0;
    for (var a = 0; a < 3; a++) {
      var L = 1;
      for (var b = 0; b < 3; b++) if (a !== b) L *= (A - x[b]) / (x[a] - x[b]);
      s += v[a] * L;
    }
    return s;
  }

  // ---- reducción a entradas efectivas ----------------------------------
  // ACD se pliega exactamente sobre la constante A (0.8 unidades por mm).
  // LT y CCT actúan como pequeños desplazamientos de A y de longitud axial.
  function effective(v) {
    var acd = v.acd, lt = (v.lt == null ? D.par.ltDefault : v.lt), cct = (v.cct == null ? D.par.cctDefault : v.cct);
    var Aeff = v.aconst
      + D.par.acdPerMm * (acd - D.par.acdRef)
      + D.par.ltPerMm_A * (lt - D.par.ltDefault)
      + D.par.cctPerUm_A * (cct - D.par.cctDefault);
    var ALeff = v.al
      + D.par.ltPerMm_AL * (lt - D.par.ltDefault)
      + D.par.cctPerUm_AL * (cct - D.par.cctDefault);
    return { Aeff: Aeff, ALeff: ALeff };
  }

  // Convierte una lectura K hecha con índice `idx` al equivalente a 1.3375.
  function toInternalK(K, idx) {
    var r = (idx - 1) * 1000 / K;                 // radio en mm
    return (KIDX_INTERNAL - 1) * 1000 / r;
  }

  // ---- núcleo esférico -------------------------------------------------
  function eyeOf(v) {
    var e = effective(v);
    var K1 = toInternalK(v.k1, v.kindex), K2 = toInternalK(v.k2, v.kindex);
    var Km = (K1 + K2) / 2;
    var ELP = alongA(D.ELP, e.ALeff, Km, e.Aeff);
    var s0 = alongA(D.s0, e.ALeff, Km, e.Aeff);
    var kap = alongA(D.kap, e.ALeff, Km, e.Aeff);
    var P0 = p0Of(e.ALeff, KcOf(Km), ELP);
    var m = -2 * s0 / kap, d = m - P0, a = s0 * m, b = -a * P0;
    return {
      P0: P0, s0: s0, kap: kap, K1: K1, K2: K2, Km: Km, ALeff: e.ALeff, Aeff: e.Aeff,
      ref: function (P) { return (a * P + b) / (P + d); },
      // potencia de LIO que da la refracción objetivo
      powerFor: function (R) { return (b - d * R) / (R - a); }
    };
  }

  // ---- astigmatismo ----------------------------------------------------
  var D2R = Math.PI / 180;
  function vec(m, th) { return [m * Math.cos(2 * th * D2R), m * Math.sin(2 * th * D2R)]; }
  function vmag(v) { return Math.sqrt(v[0] * v[0] + v[1] * v[1]); }
  function vmer(v) { var a = Math.atan2(v[1], v[0]) / 2 / D2R; return ((a % 180) + 180) % 180; }

  /** Astigmatismo corneal total = regresión de córnea posterior + SIA. */
  function totalCorneal(eye, v) {
    var steep = (eye.K2 >= eye.K1) ? v.k2a : v.k1a;          // meridiano curvo
    var mag = Math.abs(eye.K2 - eye.K1);
    var ant = vec(mag, steep);
    var tca = [D.par.postA * ant[0] + D.par.postB, D.par.postA * ant[1]];
    if (v.sia) {                                            // el SIA aplana el meridiano de la incisión
      var s = vec(v.sia, (v.siaax + 90) % 180);
      tca = [tca[0] + s[0], tca[1] + s[1]];
    }
    return tca;
  }

  // ---- cálculo completo ------------------------------------------------
  function calculate(v) {
    var eye = eyeOf(v);
    if (!isFinite(eye.P0)) throw new Error('parámetros fuera del rango del modelo');

    // tabla esférica: 5 potencias en pasos de 0.5 alrededor de la diana
    var target = v.target || 0;
    var Pt = eye.powerFor(target);
    var centre = Math.round(Pt * 2) / 2;
    var sphere = [];
    for (var i = -2; i <= 2; i++) {
      var P = centre + i * 0.5;
      sphere.push({ iol: P, ref: eye.ref(P), recommended: false });
    }
    // la recomendada es la que deja la refracción más cercana a la diana sin pasarse a hipermetropía
    var best = 0, bestd = Infinity;
    for (var j = 0; j < sphere.length; j++) {
      var dd = sphere[j].ref - target;
      var score = (dd >= -1e-9) ? dd : Math.abs(dd) + 1e-6;   // desempate hacia miopía leve
      if (score < bestd) { bestd = score; best = j; }
    }
    sphere[best].recommended = true;
    var baseIOL = sphere[best].iol;

    // tórico
    var tca = totalCorneal(eye, v);
    var tcaMag = vmag(tca), tcaAxis = vmer(tca);
    var ratio = 1 / Math.abs(eye.s0);
    var iolAxis = Math.round(tcaAxis) % 180;
    var u = vec(1, iolAxis);

    var model = null;
    for (var k = 0; k < D.models.length; k++) if (D.models[k].value === v.model) model = D.models[k];
    var cyls = (model && model.cyls.length) ? model.cyls : [0];

    // cilindro ideal en el plano de la LIO
    var ideal = tcaMag * ratio;
    // ordenar por cercanía y quedarnos con tres consecutivos alrededor del ideal
    var iBest = 0, dBest = Infinity;
    for (var q = 0; q < cyls.length; q++) {
      var dq = Math.abs(cyls[q] - ideal);
      if (dq < dBest) { dBest = dq; iBest = q; }
    }
    var from = Math.max(0, Math.min(cyls.length - 3, iBest - 1));
    var shown = cyls.slice(from, from + 3);

    var toric = shown.map(function (c) {
      var rx = tca[0] - (c / ratio) * u[0], ry = tca[1] - (c / ratio) * u[1];
      var rm = vmag([rx, ry]), ra = vmer([rx, ry]);
      var resiAxis = Math.round((ra + 90) % 180);            // eje del cilindro negativo
      var ref = eye.ref(baseIOL) + rm / 2;                   // equivalente esférico
      return {
        cyl: c, iolAxis: iolAxis, ref: ref,
        resiCyl: -rm, resiAxis: resiAxis === 0 ? 180 : resiAxis,
        recommended: c === cyls[iBest]
      };
    });
    var rec = toric.filter(function (t) { return t.recommended; })[0] || toric[0];

    return {
      sphere: sphere, baseIOL: baseIOL, toric: toric,
      tcaMag: tcaMag, tcaAxis: Math.round(tcaAxis) === 0 ? 180 : Math.round(tcaAxis),
      ratio: ratio,
      rec: {
        iol: baseIOL, cyl: rec.cyl, axis: rec.iolAxis, ref: rec.ref,
        resiCyl: rec.resiCyl, resiAxis: rec.resiAxis,
        defocus: Math.abs(rec.ref) + Math.abs(rec.resiCyl) / 2
      }
    };
  }

  function modelNames() { return D.models.map(function (m) { return m.value; }); }
  function modelLabel(v) {
    for (var i = 0; i < D.models.length; i++) if (D.models[i].value === v) return D.models[i].label;
    return v;
  }
  function defaultAConstant() { return null; }

  return {
    calculate: calculate, modelNames: modelNames, modelLabel: modelLabel,
    defaultAConstant: defaultAConstant, _eyeOf: eyeOf, _data: D
  };
})();
if (typeof module !== 'undefined') module.exports = ENGINE;
`;

fs.writeFileSync('../../../../../Desktop/Prueba/engine.js', js);
fs.writeFileSync('engine.js', js);
console.log('wrote engine.js (' + (js.length / 1024).toFixed(1) + ' kB)');
