import fs from 'fs';

const T = JSON.parse(fs.readFileSync('tables4.json', 'utf8'));
const CYL = JSON.parse(fs.readFileSync('cyltable.json', 'utf8'));
const MODELS = JSON.parse(fs.readFileSync('models.json', 'utf8'));
const CH = JSON.parse(fs.readFileSync('channels.json', 'utf8'));
const TM = JSON.parse(fs.readFileSync('toricmodel6.json', 'utf8'));
const OFF = JSON.parse(fs.readFileSync('offsets.json', 'utf8'));

const n = (x, d) => Number(x.toFixed(d));
const data = {
  ALs: T.ALs, Ks: T.Ks, AS: T.AS,
  ELP: T.AS.map(a => T.tables[a].ELP.map(r => r.map(v => n(v, 5)))),
  s0: T.AS.map(a => T.tables[a].s0.map(r => r.map(v => n(v, 6)))),
  kap: T.AS.map(a => T.tables[a].kap.map(r => r.map(v => n(v, 7)))),
  mask: T.AS.map(a => T.validMask[a]),
  models: MODELS.models.map(m => ({ v: m.value, l: m.label, c: (CYL[m.value] || { cyls: [0] }).cyls })),
  ch: {
    acdRef: 3.2, acdA: n(CH.acdPerMm, 5),
    ltRef: 4.5, ltA: n(CH.ltPerMm_A, 5), ltAL: n(CH.ltPerMm_AL, 5),
    cctRef: 550, cctA: n(CH.cctPerUm_A, 8), cctAL: n(CH.cctPerUm_AL, 8),
  },
  tm: { sa: n(TM.sa, 5), p0: n(TM.p0, 5), pK: n(TM.pK, 5), pAL: n(TM.pAL, 5),
        hA: n(TM.hA, 5), hA2: n(TM.hA2, 5), hK: n(TM.hK, 5), hK2: n(TM.hK2, 5),
        hAhK: n(TM.hAhK, 5), bias: 0.10 },
  off: OFF,
};

const js = `/*
 * engine.js — motor de la calculadora tórica de LIO.
 * Implementación independiente, calibrada por muestreo sistemático de la
 * calculadora EVO Toric v2.0. Metodología, ensayos y concordancia medida
 * en INFORME.md. Generado automáticamente; no editar a mano.
 */
'use strict';
var ENGINE = (function () {
var D = ${JSON.stringify(data)};
var NV = 1336, KI = 1.3375, D2R = Math.PI / 180;

function KcOf(K) { return 331.5 / (337.5 / K); }
function p0Of(AL, Kc, E) { return NV / (AL - E) - NV / (NV / Kc - E); }

function cub(v, t) {
  var m = v.length, i = Math.max(0, Math.min(m - 2, Math.floor(t))), f = t - i;
  function g(k) { return v[Math.max(0, Math.min(m - 1, k))]; }
  var a = g(i - 1), b = g(i), c = g(i + 1), d = g(i + 2);
  return b + 0.5 * f * (c - a + f * (2 * a - 5 * b + 4 * c - d + f * (3 * (b - c) + d - a)));
}
function bic(M, AL, K) {
  var ta = (AL - D.ALs[0]) / (D.ALs[1] - D.ALs[0]), tk = (K - D.Ks[0]) / (D.Ks[1] - D.Ks[0]);
  var col = []; for (var i = 0; i < M.length; i++) col.push(cub(M[i], tk));
  return cub(col, ta);
}
function alongA(cube, AL, K, A) {
  var m = D.AS.length, j = 0;
  while (j < m - 2 && D.AS[j + 1] < A) j++;
  var lo = Math.max(0, Math.min(m - 3, j - (A < D.AS[j] ? 1 : 0)));
  var x = [D.AS[lo], D.AS[lo + 1], D.AS[lo + 2]];
  var v = [bic(cube[lo], AL, K), bic(cube[lo + 1], AL, K), bic(cube[lo + 2], AL, K)];
  var s = 0;
  for (var a = 0; a < 3; a++) { var L = 1; for (var b = 0; b < 3; b++) if (a !== b) L *= (A - x[b]) / (x[a] - x[b]); s += v[a] * L; }
  return s;
}
/** Curva de refracción del ojo para una potencia corneal dada. */
function curve(AL, K, A) {
  var E = alongA(D.ELP, AL, K, A), s0 = alongA(D.s0, AL, K, A), kp = alongA(D.kap, AL, K, A);
  var P0 = p0Of(AL, KcOf(K), E);
  var m = -2 * s0 / kp, d = m - P0, a = s0 * m, b = -a * P0;
  return { P0: P0, s0: s0,
    ref: function (P) { return (a * P + b) / (P + d); },
    powerFor: function (R) { return (b - d * R) / (R - a); } };
}

/** Corrección de refracción propia del modelo de LIO, función solo de la potencia. */
function offOf(model, P) {
  var t = D.off[model];
  if (!t || !t.length) return 0;
  if (P <= t[0][0]) return t[0][1];
  if (P >= t[t.length - 1][0]) return t[t.length - 1][1];
  for (var i = 1; i < t.length; i++) if (P <= t[i][0]) {
    var f = (P - t[i - 1][0]) / (t[i][0] - t[i - 1][0]);
    return t[i - 1][1] + f * (t[i][1] - t[i - 1][1]);
  }
  return 0;
}
// Factores medidos empíricamente contra EVO (el basado en radio da 1.0181/1.0166 y deja 0.03 D de sesgo)
var KIDX_FACTOR = { '1.3375': 1, '1.3315': 1.0175, '1.332': 1.016 };
function toInternalK(K, idx) {
  var f = KIDX_FACTOR[String(idx)];
  if (f == null) f = 0.3375 / (idx - 1);
  return K * f;
}
function vec(m, th) { return [m * Math.cos(2 * th * D2R), m * Math.sin(2 * th * D2R)]; }
function vmag(v) { return Math.sqrt(v[0] * v[0] + v[1] * v[1]); }
function vmer(v) { var a = Math.atan2(v[1], v[0]) / 2 / D2R; return ((a % 180) + 180) % 180; }
function deg(x) { var r = Math.round(x) % 180; return r <= 0 ? r + 180 : r; }

/** ¿Están validados los nodos que rodean a este ojo? */
function maskOk(AL, K, A) {
  var ia = Math.floor((AL - D.ALs[0]) / (D.ALs[1] - D.ALs[0]));
  var ik = Math.floor((K - D.Ks[0]) / (D.Ks[1] - D.Ks[0]));
  var ja = 0; while (ja < D.AS.length - 2 && D.AS[ja + 1] < A) ja++;
  for (var da = 0; da <= 1; da++) for (var dk = 0; dk <= 1; dk++) for (var dj = 0; dj <= 1; dj++) {
    var a = Math.max(0, Math.min(D.ALs.length - 1, ia + da));
    var k = Math.max(0, Math.min(D.Ks.length - 1, ik + dk));
    var j = Math.max(0, Math.min(D.AS.length - 1, ja + dj));
    if (!D.mask[j][a][k]) return false;
  }
  return true;
}
function prepare(v) {
  var lt = (v.lt == null ? D.ch.ltRef : v.lt), cct = (v.cct == null ? D.ch.cctRef : v.cct);
  var Aeff = v.aconst + D.ch.acdA * (v.acd - D.ch.acdRef)
           + D.ch.ltA * (lt - D.ch.ltRef) + D.ch.cctA * (cct - D.ch.cctRef);
  var ALeff = v.al + D.ch.ltAL * (lt - D.ch.ltRef) + D.ch.cctAL * (cct - D.ch.cctRef);
  var K1 = toInternalK(v.k1, v.kindex), K2 = toInternalK(v.k2, v.kindex);
  // meridiano curvo = el de mayor potencia
  var steep = (K2 >= K1) ? v.k2a : v.k1a;
  var antMag = Math.abs(K2 - K1), Km = (K1 + K2) / 2;
  return { Aeff: Aeff, ALeff: ALeff, Km: Km, antMag: antMag, steep: steep };
}

/** Astigmatismo corneal TOTAL (plano corneal): regresión de córnea posterior + SIA. */
function totalCorneal(p, v) {
  var ant = vec(p.antMag, p.steep), t = D.tm;
  // córnea posterior predicha: modelo lineal del dominio típico + términos "hinge"
  // que solo actúan en ojos largos (AL>27) o córneas planas (Km<38); dentro del
  // dominio original valen exactamente cero, así que aquel comportamiento no cambia
  var dk = p.Km - 44, da = p.ALeff - 23.5;
  var hA = Math.max(0, p.ALeff - 27), hK = Math.max(0, 38 - p.Km);
  var post = t.p0 + t.pK * dk + t.pAL * da
           + t.hA * hA + t.hA2 * hA * hA + t.hK * hK + t.hK2 * hK * hK + t.hAhK * hA * hK;
  var tca = [t.sa * ant[0] + post, t.sa * ant[1]];
  if (v.sia) { var s = vec(v.sia, (v.siaax + 90) % 180); tca = [tca[0] + s[0], tca[1] + s[1]]; }
  return tca;
}

function calculate(v) {
  var p = prepare(v);
  // Dominio tabulado y validado
  if (!(p.ALeff >= 20 && p.ALeff <= 32)) throw new Error('longitud axial fuera del rango validado (20-32 mm)');
  if (!(p.Km >= 34 && p.Km <= 50)) throw new Error('queratometría media fuera del rango validado (34-50 D)');
  if (!(p.Aeff >= 110 && p.Aeff <= 125)) throw new Error('constante A efectiva fuera del rango validado (110-125)');
  if (!maskOk(p.ALeff, p.Km, p.Aeff)) throw new Error('combinación fuera del dominio fiable (potencia de LIO demasiado baja)');
  var base = curve(p.ALeff, p.Km, p.Aeff);
  if (!isFinite(base.P0)) throw new Error('fuera del rango del modelo');

  var target = v.target || 0;
  var refOf = function (P) { return base.ref(P) + offOf(v.model, P); };
  // invierte refOf numéricamente (offOf es lineal a trozos y pequeño)
  var Pt = base.powerFor(target);
  for (var it = 0; it < 40; it++) {
    var e = refOf(Pt) - target, s = (refOf(Pt + 0.01) - refOf(Pt - 0.01)) / 0.02;
    if (!isFinite(s) || Math.abs(s) < 1e-9) break;
    Pt -= e / s; if (Math.abs(e) < 1e-9) break;
  }
  // EVO elige la mayor potencia cuya refracción prevista no sobrepasa la diana hacia la miopía
  // EVO recomienda la potencia cuya refracción prevista queda más cerca de la diana
  var centre = Math.round(Pt / 0.5) * 0.5;
  var sphere = [];
  for (var i = -2; i <= 2; i++) { var P = centre + i * 0.5; sphere.push({ iol: P, ref: refOf(P), recommended: i === 0 }); }
  var baseIOL = centre;

  var tca = totalCorneal(p, v);
  var M = vmag(tca), Th = vmer(tca);
  var steepC = curve(p.ALeff, p.Km + M / 2, p.Aeff);
  var flatC = curve(p.ALeff, p.Km - M / 2, p.Aeff);

  var model = null;
  for (var k = 0; k < D.models.length; k++) if (D.models[k].v === v.model) model = D.models[k];
  var cyls = (model && model.c.length) ? model.c : [0];

  function residualFor(c) {
    var d = (steepC.ref(baseIOL - c / 2) + offOf(v.model, baseIOL - c / 2)) - (flatC.ref(baseIOL + c / 2) + offOf(v.model, baseIOL + c / 2));  // <0 => sigue curvo en Th
    return { mag: Math.abs(d), signed: d, steep: d < 0 ? Th : (Th + 90) % 180 };
  }
  // Cilindro ideal: cruce por cero del astigmatismo residual. EVO apunta ligeramente
  // por encima de ese punto (sesgo medido de +0.10 D en el plano de la LIO).
  function pickCyl() {
    var lo = 0, hi = 20;
    if (residualFor(hi).signed < 0) { lo = hi; }
    else { for (var it2 = 0; it2 < 60; it2++) { var mid = (lo + hi) / 2; if (residualFor(mid).signed < 0) lo = mid; else hi = mid; } }
    var cStar = (lo + hi) / 2 + D.tm.bias;
    var ib = 0, dB = Infinity;
    for (var q = 0; q < cyls.length; q++) { var e2 = Math.abs(cyls[q] - cStar); if (e2 < dB - 1e-9) { dB = e2; ib = q; } }
    return ib;
  }
  var iBest = pickCyl();
  // Zeiss 709M/MP y 939M/MP (bitóricas a medida): la potencia del meridiano plano va en
  // pasos de 0.5 D y el EE mostrado = plana + cil/2, así que hereda un desplazamiento de
  // 0.25 D cuando el cilindro es múltiplo impar de 0.5. Regla medida por barrido (INFORME).
  if (v.model === '709M/MP' || v.model === '939M/MP') {
    for (var zi = 0; zi < 2; zi++) {
      var gOff = (Math.round(cyls[iBest] * 2) % 2 !== 0) ? 0.25 : 0;
      var c2 = Math.round((Pt - gOff) / 0.5) * 0.5 + gOff;
      if (c2 === baseIOL) break;
      baseIOL = c2;
      sphere = [];
      for (var zj = -2; zj <= 2; zj++) { var zP = baseIOL + zj * 0.5; sphere.push({ iol: zP, ref: refOf(zP), recommended: zj === 0 }); }
      var ni = pickCyl();
      if (ni === iBest) break;
      iBest = ni;
    }
  }
  var from = Math.max(0, Math.min(cyls.length - 3, iBest - 1));
  var shown = cyls.slice(from, from + 3);

  var toric = shown.map(function (c) {
    var r = residualFor(c);
    var se = ((steepC.ref(baseIOL - c / 2) + offOf(v.model, baseIOL - c / 2)) + (flatC.ref(baseIOL + c / 2) + offOf(v.model, baseIOL + c / 2))) / 2;
    return { cyl: c, iolAxis: deg(Th), ref: se, resiCyl: -r.mag, resiAxis: deg(r.steep + 90), recommended: c === cyls[iBest] };
  });
  var rec = toric.filter(function (t) { return t.recommended; })[0] || toric[0];

  return {
    sphere: sphere, baseIOL: baseIOL, toric: toric,
    tcaMag: M, tcaAxis: deg(Th), antMag: p.antMag,
    rec: { iol: baseIOL, cyl: rec.cyl, axis: rec.iolAxis, ref: rec.ref,
           resiCyl: rec.resiCyl, resiAxis: rec.resiAxis,
           defocus: Math.abs(rec.ref) + Math.abs(rec.resiCyl) / 2 }
  };
}

return {
  calculate: calculate,
  modelNames: function () { return D.models.map(function (m) { return m.v; }); },
  modelLabel: function (x) { for (var i = 0; i < D.models.length; i++) if (D.models[i].v === x) return D.models[i].l; return x; },
  defaultAConstant: function () { return null; },
  _data: D
};
})();
if (typeof module !== 'undefined') module.exports = ENGINE;
`;

fs.writeFileSync('engine.js', js);
fs.writeFileSync('C:/Users/Guille/Desktop/Prueba/engine.js', js);
console.log('wrote engine.js (' + (js.length / 1024).toFixed(1) + ' kB)');
