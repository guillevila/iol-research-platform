/*
 * campaign_hyp_rk_biometry.mjs — campaña complementaria (2026-09-16) a
 * campaign_pk_lasik.mjs. Esa primera campaña y una investigación dirigida
 * posterior (confirmada por el usuario reproduciendo el caso a mano en
 * evoiolcalculator.com) establecieron que, para Hyperopic y RK, el
 * desplazamiento que aplica EVO NO depende de Pre/Post LASIK SE (probado
 * desde vacío hasta los extremos de validación, -16 a -0.5 D, siempre
 * idéntico) -- pero SÍ depende del ojo, y también afecta al cilindro/eje del
 * tórico, no solo a la esfera (visto reproduciendo el caso del usuario:
 * AL=23,K1=43,K2=46 -> 21.5/3.5/87° sin cirugía, 21/3/86° con Hyperopic).
 *
 * Este script barre AL x Km (con y sin astigmatismo anterior) para Hyperopic
 * y RK, con Pre/Post LASIK fijos en un valor válido cualquiera (confirmado
 * irrelevante), para caracterizar ese desplazamiento en función de la
 * biometría y poder implementarlo como un interruptor sí/no calibrado.
 *
 * Comparte caché con campaign_pk_lasik.mjs (misma clase de investigación).
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

const eyes = [
  [21, 36], [21, 44], [21, 50],
  [24, 36], [24, 44], [24, 50],
  [27, 36], [27, 44], [27, 50],
  [30, 36], [30, 44], [30, 50],
];
const astigLevels = [0, 2.0]; // sin astigmatismo, y con 2D WTR

const modeDesign = [
  { mode: '2', label: 'hyp', pre: '-4.00', post: '-0.25' },
  { mode: '3', label: 'rk', pre: '-6.00', post: '-0.25' },
];

for (const [al, km] of eyes) {
  for (const aMag of astigLevels) {
    const base = eyeBase(al, km, aMag, 180);
    inputs.push(tag({ ...base }, `hrBio_ctrl_${al}_${km}_a${aMag}`));
    for (const { mode, label, pre, post } of modeDesign) {
      inputs.push(tag({
        ...base, DropDownLASIK: mode, txtPreLASIK: pre, txtPostLASIK: post,
      }, `hrBio_${label}_${al}_${km}_a${aMag}`));
    }
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
if (errCount > 0) {
  const errs = results.filter(r => !r.result.ok).slice(0, 10);
  console.log('Primeros errores:', JSON.stringify(errs.map(e => ({ tag: e.input.__tag, errs: e.result.errs })), null, 1));
}
