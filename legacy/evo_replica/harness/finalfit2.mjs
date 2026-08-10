import fs from 'fs';
import { eyeFn } from './eye2.mjs';

const C = JSON.parse(fs.readFileSync('cache2.json', 'utf8'));
const CH = JSON.parse(fs.readFileSync('channels.json', 'utf8'));
const OFF = JSON.parse(fs.readFileSync('offsets.json', 'utf8'));
const D2R = Math.PI / 180, KI = 1.3375;
const toInt = (K, i) => (KI - 1) * 1000 / ((i - 1) * 1000 / K);
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
  if (!(ALeff >= 20.5 && ALeff <= 27.5 && Km >= 39 && Km <= 50)) continue;
  const rows = v.torics.filter(t => t.resiCyl != null && t.resiAxis != null && t.iolAxis != null);
  if (rows.length < 2) continue;
  DS.push({ ALeff, Aeff, Km, ant: vec(antMag, steepAx), antMag,
    sia: +q.TxtSIA || 0, siaax: +q.TxtSIAaxis || 0, model: q.DropDownToric, P: v.baseIOL,
    rows: rows.map(t => ({ c: t.toric, resi: t.resiCyl, rax: t.resiAxis, iax: t.iolAxis })) });
}
// deterministic subsample for fitting, rest for holdout
DS.sort((a, b) => (a.ALeff * 1e6 + a.Km * 1e3 + a.Aeff) - (b.ALeff * 1e6 + b.Km * 1e3 + b.Aeff));
const FIT = DS.filter((_, i) => i % 3 !== 0), HOLD = DS.filter((_, i) => i % 3 === 0);
console.log(`cases: ${DS.length}  fit ${FIT.length}  holdout ${HOLD.length}`);

function score(p, set) {
  const [sa, p0, pK, pAL, pM, pA] = p;
  let sse = 0, n = 0, mx = 0, axSum = 0, axN = 0;
  for (const d of set) {
    const post = p0 + pK * (d.Km - 44) + pAL * (d.ALeff - 23.5) + pM * d.antMag + pA * (d.Aeff - 119.3);
    let t = [sa * d.ant[0] + post, sa * d.ant[1]];
    if (d.sia) { const s = vec(d.sia, (d.siaax + 90) % 180); t = [t[0] + s[0], t[1] + s[1]]; }
    const M = Math.hypot(t[0], t[1]), Th = mer(t);
    if (!(M > 0.001) || !(d.Km - M / 2 > 32) || !(d.Km + M / 2 < 58)) return { rms: 1e9, mx: 1e9, axErr: 1e9 };
    const st = eyeFn(d.ALeff, d.Km + M / 2, d.Aeff), fl = eyeFn(d.ALeff, d.Km - M / 2, d.Aeff);
    for (const r of d.rows) {
      const pred = (st.ref(d.P - r.c / 2) + offOf(d.model, d.P - r.c / 2))
                 - (fl.ref(d.P + r.c / 2) + offOf(d.model, d.P + r.c / 2));
      let dd = Math.abs(((r.rax + 90) % 180) - Th); if (dd > 90) dd = 180 - dd;
      const obs = (dd < 45) ? -Math.abs(r.resi) : Math.abs(r.resi);
      const e = pred - obs; sse += e * e; n++; if (Math.abs(e) > mx) mx = Math.abs(e);
    }
    let da = Math.round(Th) - d.rows[0].iax; if (da > 90) da -= 180; if (da < -90) da += 180;
    axSum += Math.abs(da); axN++;
  }
  return { rms: Math.sqrt(sse / n), mx, axErr: axSum / axN, n };
}
let p = [1.0, 0.58, -0.015, -0.04, 0, 0];
const steps = [0.1, 0.2, 0.03, 0.05, 0.03, 0.03];
for (let r = 0; r < 40; r++) for (let i = 0; i < p.length; i++) {
  let lo = p[i] - steps[i], hi = p[i] + steps[i];
  for (let it = 0; it < 40; it++) {
    const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
    const a = p.slice(); a[i] = m1; const b = p.slice(); b[i] = m2;
    if (score(a, FIT).rms < score(b, FIT).rms) hi = m2; else lo = m1;
  }
  p[i] = (lo + hi) / 2;
}
const f = score(p, FIT), h = score(p, HOLD);
console.log(`\nTCA = ${p[0].toFixed(5)} * ANT + posterior,  posterior_x = ${p[1].toFixed(5)} ${p[2] >= 0 ? '+' : '-'} ${Math.abs(p[2]).toFixed(5)}*(Km-44) ${p[3] >= 0 ? '+' : '-'} ${Math.abs(p[3]).toFixed(5)}*(AL-23.5)`);
console.log(`fit    : residual-cyl rms ${f.rms.toFixed(4)}  max ${f.mx.toFixed(3)}  mean |axis err| ${f.axErr.toFixed(2)} deg  (n=${f.n})`);
console.log(`holdout: residual-cyl rms ${h.rms.toFixed(4)}  max ${h.mx.toFixed(3)}  mean |axis err| ${h.axErr.toFixed(2)} deg  (n=${h.n})`);
fs.writeFileSync('toricmodel3.json', JSON.stringify({ sa: p[0], p0: p[1], pK: p[2], pAL: p[3], pM: p[4], pA: p[5] }, null, 1));
console.log('wrote toricmodel2.json');
