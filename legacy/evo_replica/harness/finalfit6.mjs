import fs from 'fs';
import { eyeFn } from './eye2.mjs';

const C = JSON.parse(fs.readFileSync('cache2.json', 'utf8'));
const CH = JSON.parse(fs.readFileSync('channels.json', 'utf8'));
const OFF = JSON.parse(fs.readFileSync('offsets.json', 'utf8'));
const NARROW = JSON.parse(fs.readFileSync('toricmodel2.json', 'utf8'));   // frozen typical-domain model
const D2R = Math.PI / 180;
const KIDX_FACTOR = { '1.3375': 1, '1.3315': 1.0175, '1.332': 1.016 };
const toInt = (K, i) => K * (KIDX_FACTOR[String(i)] ?? (0.3375 / (i - 1)));
const vec = (m, th) => [m * Math.cos(2 * th * D2R), m * Math.sin(2 * th * D2R)];
const mer = v => { const a = Math.atan2(v[1], v[0]) / 2 / D2R; return ((a % 180) + 180) % 180; };
function offOf(m, P) {
  const t = OFF[m]; if (!t || !t.length) return 0;
  if (P <= t[0][0]) return t[0][1];
  if (P >= t[t.length - 1][0]) return t[t.length - 1][1];
  for (let i = 1; i < t.length; i++) if (P <= t[i][0]) { const f = (P - t[i - 1][0]) / (t[i][0] - t[i - 1][0]); return t[i - 1][1] + f * (t[i][1] - t[i - 1][1]); }
  return 0;
}

const DS = [];
for (const [k, v] of Object.entries(C)) {
  if (!v || !v.ok || !v.torics || v.torics.length < 2 || v.baseIOL == null) continue;
  let q; try { q = JSON.parse(k); } catch { continue; }
  if (q.DropDownLASIK !== '0' || q.DropDownArgos !== '0' || q.txtPK1 || q.txtPK2) continue;
  const al = +q.txtAL, k1 = +q.txtK1, k2 = +q.txtK2, acd = +q.txtACD;
  const lt = q.txtLT === '' ? 4.5 : +q.txtLT, cct = q.txtCCT === '' ? 550 : +q.txtCCT;
  const A = +q.txtAConstant, kidx = +q.DropDownKIndex;
  if (![al, k1, k2, acd, A, kidx].every(Number.isFinite)) continue;
  const K1 = toInt(k1, kidx), K2 = toInt(k2, kidx);
  const Km = (K1 + K2) / 2, antMag = Math.abs(K2 - K1);
  const steepAx = (K2 >= K1) ? +q.TxtK2Axis : +q.TxtK1Axis;
  if (!Number.isFinite(steepAx)) continue;
  const ALeff = al + CH.ltPerMm_AL * (lt - 4.5) + CH.cctPerUm_AL * (cct - 550);
  const Aeff = A + CH.acdPerMm * (acd - 3.2) + CH.ltPerMm_A * (lt - 4.5) + CH.cctPerUm_A * (cct - 550);
  if (!(ALeff >= 20 && ALeff <= 32 && Km >= 34 && Km <= 50)) continue;
  const fn = eyeFn(ALeff, Km, Aeff);
  if (!isFinite(fn.P0) || fn.P0 <= 6) continue;
  const rows = v.torics.filter(t => t.resiCyl != null && t.resiAxis != null && t.iolAxis != null);
  if (rows.length < 2) continue;
  DS.push({ ALeff, Aeff, Km, ant: vec(antMag, steepAx), antMag,
    sia: +q.TxtSIA || 0, siaax: +q.TxtSIAaxis || 0, model: q.DropDownToric, P: v.baseIOL,
    rows: rows.map(t => ({ c: t.toric, resi: t.resiCyl, rax: t.resiAxis, iax: t.iolAxis })) });
}
DS.sort((a, b) => (a.ALeff * 1e6 + a.Km * 1e3 + a.Aeff) - (b.ALeff * 1e6 + b.Km * 1e3 + b.Aeff));
const FIT = DS.filter((_, i) => i % 3 !== 0), HOLD = DS.filter((_, i) => i % 3 === 0);
const isTyp = d => d.ALeff <= 27.5 && d.Km >= 39;
console.log(`cases ${DS.length} (fit ${FIT.length}/hold ${HOLD.length});  typical ${DS.filter(isTyp).length}  extended ${DS.filter(d => !isTyp(d)).length}`);

// hinge extension: exactly zero inside the original domain (AL<=27, Km>=38)
// post = N(dk,da) + q0*hA + q1*hA^2 + q2*hK + q3*hK^2 + q4*hA*hK
function postOf(p, d) {
  const dk = d.Km - 44, da = d.ALeff - 23.5;
  const N = NARROW.p0 + NARROW.pK * dk + NARROW.pAL * da;
  const hA = Math.max(0, d.ALeff - 27), hK = Math.max(0, 38 - d.Km);
  return N + p[0] * hA + p[1] * hA * hA + p[2] * hK + p[3] * hK * hK + p[4] * hA * hK;
}
function score(p, set) {
  let sse = 0, n = 0, mx = 0, axSum = 0, axN = 0;
  for (const d of set) {
    let t = [NARROW.sa * d.ant[0] + postOf(p, d), NARROW.sa * d.ant[1]];
    if (d.sia) { const s = vec(d.sia, (d.siaax + 90) % 180); t = [t[0] + s[0], t[1] + s[1]]; }
    const M = Math.hypot(t[0], t[1]), Th = mer(t);
    if (!(M > 0.001) || !(d.Km - M / 2 > 32) || !(d.Km + M / 2 < 58)) return { rms: 1e9, mx: 1e9, axErr: 1e9, n: 0 };
    const st = eyeFn(d.ALeff, d.Km + M / 2, d.Aeff), fl = eyeFn(d.ALeff, d.Km - M / 2, d.Aeff);
    for (const r of d.rows) {
      const pred = (st.ref(d.P - r.c / 2) + offOf(d.model, d.P - r.c / 2))
                 - (fl.ref(d.P + r.c / 2) + offOf(d.model, d.P + r.c / 2));
      let dd = Math.abs(((r.rax + 90) % 180) - Th); if (dd > 90) dd = 180 - dd;
      const obs = (dd < 45) ? -Math.abs(r.resi) : Math.abs(r.resi);
      const e = pred - obs; sse += e * e; n++; if (Math.abs(e) > mx) mx = Math.abs(e);
    }
    let da2 = Math.round(Th) - d.rows[0].iax; if (da2 > 90) da2 -= 180; if (da2 < -90) da2 += 180;
    axSum += Math.abs(da2); axN++;
  }
  return { rms: n ? Math.sqrt(sse / n) : 1e9, mx, axErr: axN ? axSum / axN : 1e9, n };
}
let p = [0, 0, 0, 0, 0];
const steps = [0.05, 0.01, 0.05, 0.01, 0.01];
for (let r = 0; r < 30; r++) for (let i = 0; i < p.length; i++) {
  let lo = p[i] - steps[i], hi = p[i] + steps[i];
  for (let it = 0; it < 36; it++) {
    const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
    const a = p.slice(); a[i] = m1; const b = p.slice(); b[i] = m2;
    if (score(a, FIT).rms < score(b, FIT).rms) hi = m2; else lo = m1;
  }
  p[i] = (lo + hi) / 2;
}
console.log('hinge coefs [hA, hA2, hK, hK2, hAhK] =', p.map(x => x.toFixed(5)).join(', '));
const h = score(p, HOLD);
const hTyp = score(p, HOLD.filter(isTyp));
const hExt = score(p, HOLD.filter(d => !isTyp(d)));
const hLong = score(p, HOLD.filter(d => d.ALeff > 27.5));
console.log(`HOLDOUT total   : rms ${h.rms.toFixed(4)} max ${h.mx.toFixed(3)} ax ${h.axErr.toFixed(2)}° (n=${h.n})`);
console.log(`HOLDOUT typical : rms ${hTyp.rms.toFixed(4)} ax ${hTyp.axErr.toFixed(2)}°`);
console.log(`HOLDOUT extended: rms ${hExt.rms.toFixed(4)} ax ${hExt.axErr.toFixed(2)}°`);
console.log(`HOLDOUT long    : rms ${hLong.rms.toFixed(4)} ax ${hLong.axErr.toFixed(2)}°`);
fs.writeFileSync('toricmodel6.json', JSON.stringify({
  sa: NARROW.sa, p0: NARROW.p0, pK: NARROW.pK, pAL: NARROW.pAL,
  hA: p[0], hA2: p[1], hK: p[2], hK2: p[3], hAhK: p[4],
}, null, 1));
console.log('wrote toricmodel6.json');
