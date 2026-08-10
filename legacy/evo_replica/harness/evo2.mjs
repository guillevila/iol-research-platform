import fs from 'fs';

const BASE = 'https://www.evoiolcalculator.com/toric.aspx';
const CACHE = './cache2.json';
let cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {};
let dirty = 0;
export const cacheSize = () => Object.keys(cache).length;
export function saveCache() { if (dirty) { fs.writeFileSync(CACHE, JSON.stringify(cache)); dirty = 0; } }

const hid = (h, n) => (h.match(new RegExp(`id="${n}"[^>]*value="([^"]*)"`)) || [, ''])[1];
function span(h, id) {
  const m = h.match(new RegExp(`id="${id}"[^>]*>([\\s\\S]*?)</span>`));
  return m ? m[1].replace(/&nbsp;/g, ' ').replace(/<[^>]*>/g, '').trim() : null;
}
function num(h, id) {
  const s = span(h, id);
  if (s === null || s === '') return null;
  const v = parseFloat(s.replace('°', '').replace(/[−–]/g, '-'));
  return Number.isFinite(v) ? v : null;
}

export const DEFAULTS = {
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

let seed = null;
async function getSeed() {
  if (seed) return seed;
  const g = await fetch(BASE, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  seed = { html: await g.text(), cookie: (g.headers.get('set-cookie') || '').split(';')[0] };
  return seed;
}

async function post(html, cookie, fields, extra) {
  const body = new URLSearchParams({
    __EVENTTARGET: '', __EVENTARGUMENT: '', __LASTFOCUS: '',
    __VIEWSTATE: hid(html, '__VIEWSTATE'),
    __VIEWSTATEGENERATOR: hid(html, '__VIEWSTATEGENERATOR'),
    __EVENTVALIDATION: hid(html, '__EVENTVALIDATION'),
    ...fields, ...extra,
  });
  let lastErr;
  for (let a = 0; a < 5; a++) {
    try {
      const r = await fetch(BASE, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0', ...(cookie ? { Cookie: cookie } : {}),
        }, body,
        signal: AbortSignal.timeout(90000),
      });
      if (r.ok) return await r.text();
      lastErr = new Error('HTTP ' + r.status);
    } catch (e) { lastErr = e; }
    await new Promise(r => setTimeout(r, 2000 * (a + 1)));
  }
  throw lastErr;
}

export function parse(html) {
  if (html.indexOf('class="results"') < 0) {
    return { ok: false, errs: [...html.matchAll(/err-label[^>]*>([^<]*)</g)].map(x => x[1].trim()).filter(Boolean) };
  }
  const o = { ok: true, pairs: [], torics: [] };
  for (let i = 1; i <= 5; i++) {
    const p = num(html, `lblResult_IOL${i}`), r = num(html, `lblResult_Refraction${i}`);
    if (p !== null && r !== null) o.pairs.push([p, r]);
  }
  for (let i = 1; i <= 5; i++) {
    const t = num(html, `LblToric${i}`);
    if (t === null) continue;
    o.torics.push({
      toric: t, iolAxis: num(html, `LblIOLAxis${i}`), ref: num(html, `LblToricRef${i}`),
      resiCyl: num(html, `LblResiCyl${i}`), resiAxis: num(html, `LblToricAxis${i}`),
    });
  }
  o.baseIOL = num(html, 'LabelBaseIOL'); o.baseToric = num(html, 'LabelBaseToric');
  o.recIOL = num(html, 'LabelRecIOL'); o.recToric = num(html, 'LabelRecToric'); o.recAxis = num(html, 'LabelRecAxis');
  o.predRef = num(html, 'LabelPredRef'); o.predCyl = num(html, 'LabelPredCyl');
  o.predAxis = num(html, 'LabelPredAxis'); o.predDE = num(html, 'LabelPredDE');
  o.aConst = (html.match(/id="txtAConstant"[^>]*value="([^"]*)"/) || [, ''])[1];
  o.posBio = span(html, 'LabelPosBio2');
  o.limit = span(html, 'LabelLimit');
  return o;
}

async function run(input) {
  const f = { ...DEFAULTS, ...input };
  const key = JSON.stringify(f);
  if (cache[key]) return cache[key];
  const { html: s, cookie } = await getSeed();
  let html;
  const needs2 = f.DropDownToric !== 'Posterior' || f.DropDownLASIK !== '0' || f.DropDownArgos !== '0';
  if (needs2) {
    const h1 = await post(s, cookie, { ...f, txtAConstant: '' }, { __EVENTTARGET: 'DropDownToric' });
    html = await post(h1, cookie, f, { btnCalculate: 'Calculate' });
  } else {
    html = await post(s, cookie, f, { btnCalculate: 'Calculate' });
  }
  const res = parse(html);
  cache[key] = res; dirty++;
  if (dirty >= 25) saveCache();
  return res;
}

/** Concurrency-limited map. */
export async function calcMany(inputs, { concurrency = 3, onProgress } = {}) {
  const out = new Array(inputs.length);
  let next = 0, done = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, inputs.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= inputs.length) break;
      try { out[i] = await run(inputs[i]); }
      catch (e) { out[i] = { ok: false, errs: ['EXC ' + e.message] }; }
      done++;
      if (onProgress && done % 25 === 0) onProgress(done, inputs.length);
    }
  }));
  saveCache();
  return out;
}

export const calc = run;
