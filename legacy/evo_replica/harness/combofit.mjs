import fs from 'fs';
import { eyeFn } from './eye2.mjs';

const D2R = Math.PI / 180;
const av = (m, th) => [m * Math.cos(2 * th * D2R), m * Math.sin(2 * th * D2R)];
const mer = v => { const a = Math.atan2(v[1], v[0]) / 2 / D2R; return ((a % 180) + 180) % 180; };

const C = JSON.parse(fs.readFileSync('cache2.json', 'utf8'));
const P = JSON.parse(fs.readFileSync('post.json', 'utf8'));

function keyOf(o) {
  return JSON.stringify({
    TextBoxName: 'T', TextBoxID: '1', TextBoxSurgeon: 'D', DropDownArgos: '0', RadioButtonRLEye: '1',
    txtAL: o.AL, txtK1: o.K1, TxtK1Axis: o.K1a, txtK2: o.K2, TxtK2Axis: o.K2a,
    txtACD: '3.20', txtLT: '4.50', txtCCT: '550', txtRefraction: '0', txtAConstant: o.A,
    DropDownToric: 'Posterior', DropDownKIndex: '1.3375', TxtSIA: '0', TxtSIAaxis: '0', DropDownLASIK: '0',
    DropDownListPK: 'IOLMaster 700', txtPK1: '', TxtPK1axis: '', txtPK2: '', TxtPK2axis: '', txtPreLASIK: '', txtPostLASIK: '',
  });
}

// ---- dataset 1: posterior sweep (one eye, 8 magnitudes x 12 meridians) ----
const DS = [];
for (const m of [0.5, 1, 1.5, 2, 2.5, 3, 4, 5]) for (const th of [0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165]) {
  const steep = ((th % 180) + 180) % 180, flat = (steep + 90) % 180;
  const k = keyOf({
    AL: '23.50', K1: '43.00', K1a: String(flat === 0 ? 180 : flat),
    K2: (43 + m).toFixed(2), K2a: String(steep === 0 ? 180 : steep), A: '119.30',
  });
  const c = C[k];
  if (c && c.ok && c.baseIOL != null) DS.push({ set: 'post', AL: 23.5, Km: 43 + m / 2, A: 119.3, ant: av(m, steep), P: c.baseIOL, torics: c.torics });
}
// ---- dataset 2: ratio sweep (105 eyes, 2.00 D WTR) ----
for (const AL of [21, 22, 23, 24, 25, 26, 27]) for (const K of [40, 42, 44, 46, 48]) for (const A of [117.3, 119.3, 121.3]) {
  const k = keyOf({ AL: AL.toFixed(2), K1: K.toFixed(2), K1a: '180', K2: (K + 2).toFixed(2), K2a: '90', A: A.toFixed(2) });
  const c = C[k];
  if (c && c.ok && c.baseIOL != null) DS.push({ set: 'ratio', AL, Km: K + 1, A, ant: av(2, 90), P: c.baseIOL, torics: c.torics });
}
console.log('cases: post', DS.filter(d => d.set === 'post').length, ' ratio', DS.filter(d => d.set === 'ratio').length);

/** Predicted signed residual (negative => still steep at the TCA meridian). */
function predict(d, tcaMag, cyl) {
  const steep = eyeFn(d.AL, d.Km + tcaMag / 2, d.A);
  const flat = eyeFn(d.AL, d.Km - tcaMag / 2, d.A);
  return steep.ref(d.P - cyl / 2) - flat.ref(d.P + cyl / 2);
}
function tcaOf(p, d) {
  const [a, b0, b1, cK, cAL] = p;
  const mg = Math.hypot(d.ant[0], d.ant[1]);
  let v = [a * d.ant[0] + b0 + b1 * mg, a * d.ant[1]];
  const s = 1 + cK * (d.Km - 44) + cAL * (d.AL - 23.5);
  return [v[0] * s, v[1] * s];
}
function score(p) {
  let sse = 0, n = 0, mx = 0;
  for (const d of DS) {
    const t = tcaOf(p, d), M = Math.hypot(t[0], t[1]), Th = mer(t);
    for (const row of d.torics) {
      if (row.resiCyl == null || row.resiAxis == null) continue;
      const pred = predict(d, M, row.toric);
      const obsSteep = (row.resiAxis + 90) % 180;
      let dd = Math.abs(obsSteep - Th); if (dd > 90) dd = 180 - dd;
      const obs = (dd < 45) ? -Math.abs(row.resiCyl) : Math.abs(row.resiCyl);
      const e = pred - obs; sse += e * e; n++; mx = Math.max(mx, Math.abs(e));
    }
  }
  return { rms: Math.sqrt(sse / n), mx, n };
}
function fit(seed, steps, mask) {
  let p = seed.slice();
  for (let r = 0; r < 25; r++)
    for (let i = 0; i < p.length; i++) {
      if (mask && !mask[i]) continue;
      let lo = p[i] - steps[i], hi = p[i] + steps[i];
      for (let it = 0; it < 32; it++) {
        const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
        const q1 = p.slice(); q1[i] = m1; const q2 = p.slice(); q2[i] = m2;
        if (score(q1).rms < score(q2).rms) hi = m2; else lo = m1;
      }
      p[i] = (lo + hi) / 2;
    }
  return { p, ...score(p) };
}

const A1 = fit([1.0, 0.55, -0.01, 0, 0], [0.3, 0.3, 0.05, 0.02, 0.02], [1, 1, 1, 0, 0]);
console.log(`no eye correction : a=${A1.p[0].toFixed(5)} b0=${A1.p[1].toFixed(5)} b1=${A1.p[2].toFixed(5)}                          rms=${A1.rms.toFixed(5)} max=${A1.mx.toFixed(4)} n=${A1.n}`);
const A2 = fit(A1.p, [0.3, 0.3, 0.05, 0.02, 0.02], [1, 1, 1, 1, 1]);
console.log(`with K/AL scaling : a=${A2.p[0].toFixed(5)} b0=${A2.p[1].toFixed(5)} b1=${A2.p[2].toFixed(5)} cK=${A2.p[3].toFixed(5)} cAL=${A2.p[4].toFixed(5)}  rms=${A2.rms.toFixed(5)} max=${A2.mx.toFixed(4)}`);

for (const s of ['post', 'ratio']) {
  let sse = 0, n = 0, mx = 0;
  for (const d of DS.filter(d => d.set === s)) {
    const t = tcaOf(A2.p, d), M = Math.hypot(t[0], t[1]), Th = mer(t);
    for (const row of d.torics) {
      if (row.resiCyl == null) continue;
      const pred = predict(d, M, row.toric);
      const obsSteep = (row.resiAxis + 90) % 180;
      let dd = Math.abs(obsSteep - Th); if (dd > 90) dd = 180 - dd;
      const obs = (dd < 45) ? -Math.abs(row.resiCyl) : Math.abs(row.resiCyl);
      sse += (pred - obs) ** 2; n++; mx = Math.max(mx, Math.abs(pred - obs));
    }
  }
  console.log(`  ${s}: rms ${Math.sqrt(sse / n).toFixed(5)}  max ${mx.toFixed(4)}  (n=${n})`);
}
fs.writeFileSync('toricmodel.json', JSON.stringify({ a: A2.p[0], b0: A2.p[1], b1: A2.p[2], cK: A2.p[3], cAL: A2.p[4] }, null, 1));
console.log('wrote toricmodel.json');
