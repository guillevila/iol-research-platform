import fs from 'fs';
import { eyeFn } from './eye2.mjs';

const C = JSON.parse(fs.readFileSync('cache2.json', 'utf8'));
const CH = JSON.parse(fs.readFileSync('channels.json', 'utf8'));
const KIDX_FACTOR = { '1.3375': 1, '1.3315': 1.0175, '1.332': 1.016 };
const toInt = (K, i) => K * (KIDX_FACTOR[String(i)] ?? (0.3375 / (i - 1)));

// gather every cached case for the SE-offset lenses
const cases = [];
for (const [k, v] of Object.entries(C)) {
  if (!v || !v.ok || v.baseIOL == null || v.recToric == null) continue;
  let q; try { q = JSON.parse(k); } catch { continue; }
  if (!['709M/MP', '939M/MP', '929M/MP'].includes(q.DropDownToric)) continue;
  if (q.DropDownLASIK !== '0' || q.txtPK1) continue;
  const al = +q.txtAL, k1 = +q.txtK1, k2 = +q.txtK2, acd = +q.txtACD;
  const lt = q.txtLT === '' ? 4.5 : +q.txtLT, cct = q.txtCCT === '' ? 550 : +q.txtCCT;
  const A = +q.txtAConstant, kidx = +q.DropDownKIndex, t = +q.txtRefraction;
  if (![al, k1, k2, acd, A, t].every(Number.isFinite)) continue;
  const K1 = toInt(k1, kidx), K2 = toInt(k2, kidx);
  const ALeff = al + CH.ltPerMm_AL * (lt - 4.5) + CH.cctPerUm_AL * (cct - 550);
  const Aeff = A + CH.acdPerMm * (acd - 3.2) + CH.ltPerMm_A * (lt - 4.5) + CH.cctPerUm_A * (cct - 550);
  const Km = (K1 + K2) / 2;
  if (!(ALeff >= 20 && ALeff <= 32 && Km >= 34 && Km <= 50)) continue;
  cases.push({ model: q.DropDownToric, ALeff, Aeff, Km, t, C: v.recToric, rec: v.baseIOL });
}
console.log('cached Zeiss cases:', cases.length,
  ' (709:', cases.filter(c => c.model === '709M/MP').length,
  ' 939:', cases.filter(c => c.model === '939M/MP').length,
  ' 929:', cases.filter(c => c.model === '929M/MP').length + ')');

// candidate rules on the SE grid {0.5-grid + (C odd-half ? 0.25 : 0)}
function gridOf(cyl) { return (Math.round(cyl * 2) % 2 !== 0) ? 0.25 : 0; }
const RULES = {
  'nearest 0.5 (motor actual)': (fn, t, cyl) => Math.round(fn.powerFor(t) / 0.5) * 0.5,
  'nearest en rejilla F+C/2': (fn, t, cyl) => {
    const g = gridOf(cyl); return Math.round((fn.powerFor(t) - g) / 0.5) * 0.5 + g;
  },
  // "mayor P cuya refracción queda a-o-por-encima del umbral" (lado hipermétrope);
  // ref(P) decrece con P, así que se sube mientras se siga cumpliendo (con tope).
  'mayor P con ref>=t-0.01': (fn, t, cyl) => {
    const g = gridOf(cyl); let P = Math.floor((fn.powerFor(t) - g) / 0.5) * 0.5 + g;
    let it = 0;
    while (fn.ref(P) < t - 0.011 && it++ < 8) P -= 0.5;
    while (fn.ref(P + 0.5) >= t - 0.011 && it++ < 16) P += 0.5;
    return P;
  },
  'mayor P con ref>=t+0.01': (fn, t, cyl) => {
    const g = gridOf(cyl); let P = Math.floor((fn.powerFor(t) - g) / 0.5) * 0.5 + g;
    let it = 0;
    while (fn.ref(P) < t + 0.011 && it++ < 8) P -= 0.5;
    while (fn.ref(P + 0.5) >= t + 0.011 && it++ < 16) P += 0.5;
    return P;
  },
  'nearest, empate hacia P alto': (fn, t, cyl) => {
    const g = gridOf(cyl); const lo = Math.floor((fn.powerFor(t) - g) / 0.5) * 0.5 + g, hi = lo + 0.5;
    const dl = Math.abs(fn.ref(lo) - t), dh = Math.abs(fn.ref(hi) - t);
    return dh <= dl + 0.05 ? hi : lo;
  },
  'nearest, empate hacia P alto 0.10': (fn, t, cyl) => {
    const g = gridOf(cyl); const lo = Math.floor((fn.powerFor(t) - g) / 0.5) * 0.5 + g, hi = lo + 0.5;
    const dl = Math.abs(fn.ref(lo) - t), dh = Math.abs(fn.ref(hi) - t);
    return dh <= dl + 0.10 ? hi : lo;
  },
};
for (const [name, rule] of Object.entries(RULES)) {
  let okAll = 0, ok709 = 0, n709 = 0, ok929 = 0, n929 = 0;
  for (const c of cases) {
    const fn = eyeFn(c.ALeff, c.Km, c.Aeff);
    if (!isFinite(fn.P0) || fn.P0 <= 6) continue;
    let rec;
    try { rec = rule(fn, c.t, c.C); } catch { continue; }
    const hit = Math.abs(rec - c.rec) < 0.01;
    if (hit) okAll++;
    if (c.model !== '929M/MP') { n709++; if (hit) ok709++; }
    else { n929++; if (hit) ok929++; }
  }
  console.log(name.padEnd(34), 'total ' + okAll + '/' + cases.length,
    '  709+939: ' + ok709 + '/' + n709, '  929: ' + ok929 + '/' + n929);
}
