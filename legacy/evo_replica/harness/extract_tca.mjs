import fs from 'fs';
import * as I from './interp.mjs';
import { eyeFn } from './eye2.mjs';

const C = JSON.parse(fs.readFileSync('cache2.json', 'utf8'));
const CH = JSON.parse(fs.readFileSync('channels.json', 'utf8'));
const OFF = JSON.parse(fs.readFileSync('offsets.json', 'utf8'));
const D2R = Math.PI / 180;
const KI = 1.3375;
const toInt = (K, idx) => (KI - 1) * 1000 / ((idx - 1) * 1000 / K);
const vec = (m, th) => [m * Math.cos(2 * th * D2R), m * Math.sin(2 * th * D2R)];

function offOf(model, P) {
  const t = OFF[model];
  if (!t || !t.length) return 0;
  if (P <= t[0][0]) return t[0][1];
  if (P >= t[t.length - 1][0]) return t[t.length - 1][1];
  for (let i = 1; i < t.length; i++) if (P <= t[i][0]) {
    const f = (P - t[i - 1][0]) / (t[i][0] - t[i - 1][0]);
    return t[i - 1][1] + f * (t[i][1] - t[i - 1][1]);
  }
  return 0;
}

const out = [];
let scanned = 0, used = 0;
for (const [k, v] of Object.entries(C)) {
  scanned++;
  if (!v || !v.ok || !v.torics || v.torics.length < 2 || v.baseIOL == null) continue;
  let q; try { q = JSON.parse(k); } catch { continue; }
  if (q.DropDownLASIK !== '0' || q.DropDownArgos !== '0') continue;
  if (q.txtPK1 || q.txtPK2) continue;
  const al = +q.txtAL, k1 = +q.txtK1, k2 = +q.txtK2, acd = +q.txtACD;
  const lt = q.txtLT === '' ? 4.5 : +q.txtLT, cct = q.txtCCT === '' ? 550 : +q.txtCCT;
  const A = +q.txtAConstant, kidx = +q.DropDownKIndex;
  const sia = +q.TxtSIA || 0, siaax = +q.TxtSIAaxis || 0;
  if (![al, k1, k2, acd, A, kidx].every(Number.isFinite)) continue;
  const K1 = toInt(k1, kidx), K2 = toInt(k2, kidx);
  const antMag = Math.abs(K2 - K1);
  const steepAx = (K2 >= K1) ? +q.TxtK2Axis : +q.TxtK1Axis;
  if (!Number.isFinite(steepAx)) continue;
  const Km = (K1 + K2) / 2;
  const Aeff = A + CH.acdPerMm * (acd - 3.2) + CH.ltPerMm_A * (lt - 4.5) + CH.cctPerUm_A * (cct - 550);
  const ALeff = al + CH.ltPerMm_AL * (lt - 4.5) + CH.cctPerUm_AL * (cct - 550);
  const model = q.DropDownToric;
  const P = v.baseIOL;
  const iolAxis = v.torics[0].iolAxis;
  if (iolAxis == null) continue;

  // solve the TOTAL astigmatism magnitude M (post-SIA) from the toric rows
  const rows = v.torics.filter(t => t.resiCyl != null && t.resiAxis != null);
  if (rows.length < 2) continue;
  const err = M => {
    if (!(M > 0.01) || !(Km - M / 2 > 32) || !(Km + M / 2 < 58)) return 1e9;
    const st = eyeFn(ALeff, Km + M / 2, Aeff), fl = eyeFn(ALeff, Km - M / 2, Aeff);
    let s = 0;
    for (const t of rows) {
      const pred = (st.ref(P - t.toric / 2) + offOf(model, P - t.toric / 2))
                 - (fl.ref(P + t.toric / 2) + offOf(model, P + t.toric / 2));
      let d = Math.abs(((t.resiAxis + 90) % 180) - iolAxis); if (d > 90) d = 180 - d;
      const obs = (d < 45) ? -Math.abs(t.resiCyl) : Math.abs(t.resiCyl);
      s += (pred - obs) ** 2;
    }
    return s;
  };
  let lo = 0.02, hi = 7.0;
  for (let i = 0; i < 90; i++) { const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3; if (err(m1) < err(m2)) hi = m2; else lo = m1; }
  const M = (lo + hi) / 2;
  if (err(M) > 0.02) continue;                       // reject poor inversions
  // TCA vector (post-SIA) at the reported meridian, then remove SIA
  let t = vec(M, iolAxis);
  if (sia) { const s = vec(sia, (siaax + 90) % 180); t = [t[0] - s[0], t[1] - s[1]]; }
  out.push({ antMag, steepAx, ALeff, Km, Aeff, tx: t[0], ty: t[1],
             antx: vec(antMag, steepAx)[0], anty: vec(antMag, steepAx)[1], model, sia });
  used++;
}
console.log(`scanned ${scanned} cache entries, extracted ${used} usable TCA observations`);
fs.writeFileSync('tcaobs.json', JSON.stringify(out));

// quick look: TCA_x vs ANT_x, TCA_y vs ANT_y
const lin = (xs, ys) => {
  const n = xs.length, sx = xs.reduce((a, b) => a + b, 0), sy = ys.reduce((a, b) => a + b, 0);
  const sxx = xs.reduce((a, b) => a + b * b, 0), sxy = xs.reduce((a, b, i) => a + b * ys[i], 0);
  const sl = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  return { slope: sl, inter: (sy - sl * sx) / n };
};
const fx = lin(out.map(o => o.antx), out.map(o => o.tx));
const fy = lin(out.map(o => o.anty), out.map(o => o.ty));
console.log(`TCA_x = ${fx.slope.toFixed(5)} * ANT_x + ${fx.inter.toFixed(5)}`);
console.log(`TCA_y = ${fy.slope.toFixed(5)} * ANT_y + ${fy.inter.toFixed(5)}`);
