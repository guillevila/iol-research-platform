import fs from 'fs';
import { eyeFn } from './eye2.mjs';

const C = JSON.parse(fs.readFileSync('cache2.json', 'utf8'));
const CH = JSON.parse(fs.readFileSync('channels.json', 'utf8'));
const TM = JSON.parse(fs.readFileSync('toricmodel6.json', 'utf8'));
const OFF = JSON.parse(fs.readFileSync('offsets.json', 'utf8'));
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
function postOf(Km, ALeff) {
  const dk = Km - 44, da = ALeff - 23.5;
  const hA = Math.max(0, ALeff - 27), hK = Math.max(0, 38 - Km);
  return TM.p0 + TM.pK * dk + TM.pAL * da + TM.hA * hA + TM.hA2 * hA * hA + TM.hK * hK + TM.hK2 * hK * hK + TM.hAhK * hA * hK;
}

for (const MODE of ['Anterior', 'Bitoric']) {
  const DS = [];
  for (const [k, v] of Object.entries(C)) {
    if (!v || !v.ok || !v.torics || v.torics.length < 2 || v.baseIOL == null) continue;
    let q; try { q = JSON.parse(k); } catch { continue; }
    if (q.DropDownToric !== MODE || q.DropDownLASIK !== '0' || q.txtPK1) continue;
    const al = +q.txtAL, k1 = +q.txtK1, k2 = +q.txtK2, acd = +q.txtACD;
    const lt = q.txtLT === '' ? 4.5 : +q.txtLT, cct = q.txtCCT === '' ? 550 : +q.txtCCT;
    const A = +q.txtAConstant, kidx = +q.DropDownKIndex;
    if (![al, k1, k2, acd, A].every(Number.isFinite)) continue;
    const K1 = toInt(k1, kidx), K2 = toInt(k2, kidx);
    const Km = (K1 + K2) / 2, antMag = Math.abs(K2 - K1);
    const steepAx = (K2 >= K1) ? +q.TxtK2Axis : +q.TxtK1Axis;
    const ALeff = al + CH.ltPerMm_AL * (lt - 4.5) + CH.cctPerUm_AL * (cct - 550);
    const Aeff = A + CH.acdPerMm * (acd - 3.2) + CH.ltPerMm_A * (lt - 4.5) + CH.cctPerUm_A * (cct - 550);
    if (!(ALeff >= 20 && ALeff <= 32 && Km >= 34 && Km <= 50)) continue;
    const fn = eyeFn(ALeff, Km, Aeff);
    if (!isFinite(fn.P0) || fn.P0 <= 6) continue;
    const rows = v.torics.filter(t => t.resiCyl != null && t.resiAxis != null && t.iolAxis != null);
    if (rows.length < 2) continue;
    DS.push({ ALeff, Aeff, Km, ant: vec(antMag, steepAx), sia: +q.TxtSIA || 0, siaax: +q.TxtSIAaxis || 0,
      model: MODE, P: v.baseIOL, rows });
  }
  const variants = {
    'TCA = modelo posterior (motor actual)': d => {
      let t = [0.98007 * d.ant[0] + postOf(d.Km, d.ALeff), 0.98007 * d.ant[1]]; return t;
    },
    'TCA = anterior exacto (sa=1, sin posterior)': d => [d.ant[0], d.ant[1]],
    'TCA = 0.98 * anterior (sin posterior)': d => [0.98007 * d.ant[0], 0.98007 * d.ant[1]],
  };
  console.log(`\n=== modo ${MODE}  (${DS.length} casos) ===`);
  for (const [name, f] of Object.entries(variants)) {
    let sse = 0, n = 0, mx = 0;
    for (const d of DS) {
      let t = f(d);
      if (d.sia) { const s = vec(d.sia, (d.siaax + 90) % 180); t = [t[0] + s[0], t[1] + s[1]]; }
      const M = Math.hypot(t[0], t[1]);
      if (!(M > 0.001) || !(d.Km - M / 2 > 32)) continue;
      const st = eyeFn(d.ALeff, d.Km + M / 2, d.Aeff), fl = eyeFn(d.ALeff, d.Km - M / 2, d.Aeff);
      const Th = mer(t);
      for (const r of d.rows) {
        const pred = (st.ref(d.P - r.toric / 2) + offOf(MODE, d.P - r.toric / 2))
                   - (fl.ref(d.P + r.toric / 2) + offOf(MODE, d.P + r.toric / 2));
        let dd = Math.abs(((r.resiAxis + 90) % 180) - Th); if (dd > 90) dd = 180 - dd;
        const obs = (dd < 45) ? -Math.abs(r.resiCyl) : Math.abs(r.resiCyl);
        const e = pred - obs; sse += e * e; n++; mx = Math.max(mx, Math.abs(e));
      }
    }
    console.log('  ' + name.padEnd(46), 'rms ' + Math.sqrt(sse / n).toFixed(4) + '  max ' + mx.toFixed(3) + '  (filas ' + n + ')');
  }
}
