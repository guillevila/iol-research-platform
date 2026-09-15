/*
 * campaign_pk_lasik.mjs — campaña de muestreo NUEVA (2026-09-15) contra
 * evoiolcalculator.com para caracterizar dos huecos documentados en
 * EVO_QUERY_PROVENANCE.md §4.2: córnea posterior MEDIDA (PK1/PK2/ejes) y
 * antecedente de cirugía refractiva (DropDownLASIK: miópico/hipermétrope/RK).
 *
 * El corpus original (cache2.json, 8.318/8.319 consultas) NO tiene ninguna
 * consulta con estos campos activos -- ver EVO_QUERY_PROVENANCE.md. Este
 * script NO toca cache.json/cache2.json (el benchmark congelado); escribe en
 * su propio fichero, cache/cache_pk_lasik.json, precisamente para no romper
 * la composición documentada y verificada por tests/evo_provenance.test.mjs.
 *
 * Uso:  node campaign_pk_lasik.mjs            (ejecuta todo el diseño)
 *       node campaign_pk_lasik.mjs --dry-run   (solo imprime cuántas consultas y sale)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = 'https://www.evoiolcalculator.com/toric.aspx';
const CACHE_PATH = path.join(__dirname, '..', 'cache', 'cache_pk_lasik.json');

let cache = fs.existsSync(CACHE_PATH) ? JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8')) : {};
let dirty = 0;
function saveCache() { fs.writeFileSync(CACHE_PATH, JSON.stringify(cache)); dirty = 0; }

function hid(html, name) { const m = html.match(new RegExp(`id="${name}"[^>]*value="([^"]*)"`)); return m ? m[1] : ''; }
function span(html, id) { const m = html.match(new RegExp(`id="${id}"[^>]*>([\\s\\S]*?)</span>`)); if (!m) return null; return m[1].replace(/&nbsp;/g, ' ').replace(/<[^>]*>/g, '').trim(); }
function num(html, id) { const s = span(html, id); if (s === null || s === '') return null; const v = parseFloat(s.replace('°', '').replace('−', '-')); return Number.isFinite(v) ? v : null; }

const DEFAULTS = {
  TextBoxName: 'T', TextBoxID: '1', TextBoxSurgeon: 'D',
  DropDownArgos: '0', RadioButtonRLEye: '1',
  txtAL: '', txtK1: '', TxtK1Axis: '', txtK2: '', TxtK2Axis: '',
  txtACD: '', txtLT: '', txtCCT: '',
  txtRefraction: '0', txtAConstant: '119.3',
  DropDownToric: 'Posterior', DropDownKIndex: '1.3375',
  TxtSIA: '0', TxtSIAaxis: '0',
  DropDownLASIK: '0', DropDownListPK: 'IOLMaster 700',
  txtPK1: '', TxtPK1axis: '', txtPK2: '', TxtPK2axis: '',
  txtPreLASIK: '', txtPostLASIK: '',
};

let session = null;
async function getSession() {
  if (session) return session;
  const g = await fetch(BASE, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await g.text();
  session = { html, cookie: (g.headers.get('set-cookie') || '').split(';')[0] };
  return session;
}

async function rawPost(seedHtml, cookie, fields, extra) {
  const body = new URLSearchParams({
    __EVENTTARGET: '', __EVENTARGUMENT: '', __LASTFOCUS: '',
    __VIEWSTATE: hid(seedHtml, '__VIEWSTATE'),
    __VIEWSTATEGENERATOR: hid(seedHtml, '__VIEWSTATEGENERATOR'),
    __EVENTVALIDATION: hid(seedHtml, '__EVENTVALIDATION'),
    ...fields, ...extra,
  });
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const r = await fetch(BASE, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0',
          ...(cookie ? { Cookie: cookie } : {}),
        },
        body,
      });
      if (r.ok) return await r.text();
    } catch (e) { /* retry */ }
    await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
  }
  throw new Error('POST failed');
}

function parse(html) {
  if (html.indexOf('class="results"') < 0) {
    return { ok: false, errs: [...html.matchAll(/err-label[^>]*>([^<]*)</g)].map(x => x[1].trim()).filter(Boolean) };
  }
  const out = { ok: true, pairs: [], torics: [] };
  for (let i = 1; i <= 5; i++) {
    const p = num(html, `lblResult_IOL${i}`), r = num(html, `lblResult_Refraction${i}`);
    if (p !== null && r !== null) out.pairs.push([p, r]);
  }
  out.baseIOL = num(html, 'LabelBaseIOL');
  out.baseToric = num(html, 'LabelBaseToric');
  for (let i = 1; i <= 5; i++) {
    const t = num(html, `LblToric${i}`);
    if (t === null) continue;
    out.torics.push({
      toric: t,
      iolAxis: num(html, `LblIOLAxis${i}`),
      ref: num(html, `LblToricRef${i}`),
      resiCyl: num(html, `LblResiCyl${i}`),
      resiAxis: num(html, `LblToricAxis${i}`),
    });
  }
  out.recIOL = num(html, 'LabelRecIOL');
  out.recToric = num(html, 'LabelRecToric');
  out.recAxis = num(html, 'LabelRecAxis');
  out.predRef = num(html, 'LabelPredRef');
  out.predCyl = num(html, 'LabelPredCyl');
  out.predAxis = num(html, 'LabelPredAxis');
  out.predDE = num(html, 'LabelPredDE');
  return out;
}

async function calc(input = {}) {
  const f = { ...DEFAULTS, ...input };
  const key = JSON.stringify(f);
  if (cache[key]) return cache[key];
  const { html: seed, cookie } = await getSession();
  const eventTarget = f.DropDownLASIK !== '0' ? 'DropDownLASIK' : 'DropDownToric';
  const h1 = await rawPost(seed, cookie, { ...f, txtAConstant: '' }, { __EVENTTARGET: eventTarget });
  const html = await rawPost(h1, cookie, f, { btnCalculate: 'Calculate' });
  const res = parse(html);
  cache[key] = { input: f, result: res };
  if (++dirty >= 20) saveCache();
  return cache[key];
}

async function calcMany(inputs, { concurrency = 3, onProgress } = {}) {
  const out = new Array(inputs.length);
  let next = 0, done = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, inputs.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= inputs.length) break;
      try { out[i] = await calc(inputs[i]); }
      catch (e) { out[i] = { input: inputs[i], result: { ok: false, errs: ['EXC ' + e.message] } }; }
      done++;
      if (onProgress && (done % 20 === 0 || done === inputs.length)) onProgress(done, inputs.length);
    }
  }));
  saveCache();
  return out;
}

// ---------------------------------------------------------------------
// Diseño del muestreo
// ---------------------------------------------------------------------
function eyeBase(al, km, aMag, aAxisK1) {
  const k1 = km - aMag / 2, k2 = km + aMag / 2;
  return {
    txtAL: al.toFixed(2), txtK1: k1.toFixed(2), TxtK1Axis: String(aAxisK1),
    txtK2: k2.toFixed(2), TxtK2Axis: String((aAxisK1 + 90) % 180),
    txtACD: '3.20', txtLT: '4.50', txtCCT: '550',
  };
}

const inputs = [];
const tag = (obj, t) => { obj.__tag = t; return obj; };

// -- Bloque A: córnea posterior MEDIDA --------------------------------
const pkEyes = [
  [21, 38], [21, 44], [21, 50],
  [25, 38], [25, 44], [25, 50],
  [29, 38], [29, 44], [29, 50],
];
const pkMagnitudes = [0.2, 0.4, 0.6, 0.8];
const pkRelAxes = [0, 45, 90, 135]; // relativo al eje curvo anterior (k2a)
// PK1/PK2 son la potencia posterior real (validada por EVO en [3,9] D, signo
// "-" fijo en la propia UI -- ver resp.html), NO una magnitud de astigmatismo
// suelta. Se construyen alrededor de una potencia posterior típica (~6.00 D)
// igual que K1/K2 anteriores se construyen alrededor de Km.
const PK_BASE = 6.00;
function pkPair(astigMag, steepAxis) {
  const pk1axis = (steepAxis + 90) % 180;
  return {
    txtPK1: (PK_BASE - astigMag / 2).toFixed(2), TxtPK1axis: String(pk1axis),
    txtPK2: (PK_BASE + astigMag / 2).toFixed(2), TxtPK2axis: String(steepAxis),
  };
}

for (const [al, km] of pkEyes) {
  const base = eyeBase(al, km, 1.5, 180); // WTR: K1@180 (plano), K2@90 (curvo)
  const steepAnt = 90;
  // control sin PK
  inputs.push(tag({ ...base }, `pkA_${al}_${km}_ctrl`));
  for (const mag of pkMagnitudes) {
    for (const rel of pkRelAxes) {
      const pkAxis2 = (steepAnt + rel) % 180;
      inputs.push(tag({
        ...base, ...pkPair(mag, pkAxis2),
      }, `pkA_${al}_${km}_m${mag}_r${rel}`));
    }
  }
}
// ATR check en 3 ojos centrales
for (const [al, km] of [[21, 44], [25, 44], [29, 44]]) {
  const base = eyeBase(al, km, 1.5, 90); // ATR: K1@90 (plano), K2@180... normalizado a 0
  const steepAnt = 0;
  inputs.push(tag({ ...base }, `pkATR_${al}_${km}_ctrl`));
  for (const mag of pkMagnitudes) {
    for (const rel of pkRelAxes) {
      const pkAxis2 = (steepAnt + rel) % 180;
      inputs.push(tag({
        ...base, ...pkPair(mag, pkAxis2),
      }, `pkATR_${al}_${km}_m${mag}_r${rel}`));
    }
  }
}
// Astigmatismo anterior mayor (3D) en 3 ojos: interacción magnitud anterior x PK
for (const [al, km] of [[21, 44], [25, 44], [29, 44]]) {
  const base = eyeBase(al, km, 3.0, 180);
  const steepAnt = 90;
  inputs.push(tag({ ...base }, `pkHiAnt_${al}_${km}_ctrl`));
  for (const mag of pkMagnitudes) {
    for (const rel of pkRelAxes) {
      const pkAxis2 = (steepAnt + rel) % 180;
      inputs.push(tag({
        ...base, ...pkPair(mag, pkAxis2),
      }, `pkHiAnt_${al}_${km}_m${mag}_r${rel}`));
    }
  }
}

// -- Bloque B: antecedente de cirugía refractiva ----------------------
const lasikEyes = [
  [22, 40], [24, 42], [26, 44], [28, 46], [30, 48], [24, 38],
];
// Confirmado por sonda: ambos campos van en negativo, |pre| > |post|,
// independientemente de si el modo es miópico, hipermétrope o RK.
const lasikDesign = [
  { mode: '1', label: 'myopic', deltas: [1, 2, 3, 4, 5, 6] },
  { mode: '2', label: 'hyperopic', deltas: [1, 2, 3, 3.5, 4] },
  { mode: '3', label: 'rk', deltas: [2, 4, 6, 8, 10] },
];

for (const [al, km] of lasikEyes) {
  const base = eyeBase(al, km, 0, 0); // sin astigmatismo anterior (aísla el efecto LASIK)
  for (const { mode, label, deltas } of lasikDesign) {
    for (const d of deltas) {
      const post = -0.25;
      const pre = post - d; // |pre| > |post|, ambos negativos
      inputs.push(tag({
        ...base,
        DropDownLASIK: mode, txtPreLASIK: pre.toFixed(2), txtPostLASIK: post.toFixed(2),
      }, `lasik_${label}_${al}_${km}_d${d}`));
    }
  }
}
// interacción con astigmatismo (toric) -- 3 ojos, solo miópico, 3 magnitudes
for (const [al, km] of [[24, 42], [26, 44], [28, 46]]) {
  const base = eyeBase(al, km, 1.5, 180);
  for (const d of [2, 4, 6]) {
    const post = -0.25, pre = post - d;
    inputs.push(tag({
      ...base,
      DropDownLASIK: '1', txtPreLASIK: pre.toFixed(2), txtPostLASIK: post.toFixed(2),
    }, `lasikTor_${al}_${km}_d${d}`));
  }
}

console.log(`Diseño total: ${inputs.length} consultas`);
if (process.argv.includes('--dry-run')) process.exit(0);

const t0 = Date.now();
let okCount = 0, errCount = 0;
const results = await calcMany(inputs, {
  concurrency: 3,
  onProgress: (done, total) => console.log(`[${done}/${total}] ${((Date.now() - t0) / 1000).toFixed(0)}s`),
});
for (const r of results) { if (r.result && r.result.ok) okCount++; else errCount++; }
saveCache();
console.log(`\nHecho en ${((Date.now() - t0) / 1000).toFixed(0)}s. ok=${okCount} err=${errCount} total=${results.length}`);
console.log(`Cache: ${CACHE_PATH}`);
if (errCount > 0) {
  const errs = results.filter(r => !r.result.ok).slice(0, 10);
  console.log('Primeros errores:', JSON.stringify(errs.map(e => ({ tag: e.input.__tag, errs: e.result.errs })), null, 1));
}
