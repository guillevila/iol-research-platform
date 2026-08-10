import fs from 'fs';
const BASE = 'https://www.evoiolcalculator.com/toric.aspx';
const CACHE = './cache.json';
let cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {};
let dirty = 0;
export function saveCache() { fs.writeFileSync(CACHE, JSON.stringify(cache)); dirty = 0; }

function hid(html, name) {
  const m = html.match(new RegExp(`id="${name}"[^>]*value="([^"]*)"`));
  return m ? m[1] : '';
}
function span(html, id) {
  const m = html.match(new RegExp(`id="${id}"[^>]*>([\\s\\S]*?)</span>`));
  if (!m) return null;
  return m[1].replace(/&nbsp;/g, ' ').replace(/<[^>]*>/g, '').trim();
}
function num(html, id) {
  const s = span(html, id);
  if (s === null || s === '') return null;
  const v = parseFloat(s.replace('°', '').replace('−', '-'));
  return Number.isFinite(v) ? v : null;
}

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
    await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
  }
  throw new Error('POST failed');
}

export function parse(html) {
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
  out.params1 = span(html, 'Labelpara1');
  out.params2 = span(html, 'Labelpara2');
  out.posBio = span(html, 'LabelPosBio2');
  return out;
}

export async function calc(input = {}, { needModelPostback = false } = {}) {
  const f = { ...DEFAULTS, ...input };
  const key = JSON.stringify(f);
  if (cache[key]) return cache[key];

  const { html: seed, cookie } = await getSession();
  let html;
  if (needModelPostback || f.DropDownToric !== 'Posterior' || f.DropDownLASIK !== '0' || f.DropDownArgos !== '0') {
    const h1 = await rawPost(seed, cookie, { ...f, txtAConstant: '' }, { __EVENTTARGET: 'DropDownToric' });
    html = await rawPost(h1, cookie, f, { btnCalculate: 'Calculate' });
  } else {
    html = await rawPost(seed, cookie, f, { btnCalculate: 'Calculate' });
  }
  const res = parse(html);
  cache[key] = res;
  if (++dirty >= 10) saveCache();
  return res;
}

/**
 * Any paraxial vergence formula gives REF = (a*P + b) / (P + d)  (Mobius transform).
 * Fit it from the (IOL power, refraction) pairs returned for one eye.
 */
export function fitMobius(pairs) {
  // REF*(P + d) = a*P + b  ->  a*P + b - REF*d = REF*P
  const A = [], y = [];
  for (const [P, R] of pairs) { A.push([P, 1, -R]); y.push(R * P); }
  return lstsq(A, y); // [a, b, d]
}
export function mobius(c, P) { return (c[0] * P + c[1]) / (P + c[2]); }

export function lstsq(A, y) {
  const n = A[0].length;
  const AtA = Array.from({ length: n }, () => new Array(n).fill(0));
  const Aty = new Array(n).fill(0);
  for (let r = 0; r < A.length; r++) {
    for (let i = 0; i < n; i++) {
      Aty[i] += A[r][i] * y[r];
      for (let j = 0; j < n; j++) AtA[i][j] += A[r][i] * A[r][j];
    }
  }
  // Gaussian elimination
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let k = i + 1; k < n; k++) if (Math.abs(AtA[k][i]) > Math.abs(AtA[p][i])) p = k;
    [AtA[i], AtA[p]] = [AtA[p], AtA[i]]; [Aty[i], Aty[p]] = [Aty[p], Aty[i]];
    for (let k = i + 1; k < n; k++) {
      const f = AtA[k][i] / AtA[i][i];
      for (let j = i; j < n; j++) AtA[k][j] -= f * AtA[i][j];
      Aty[k] -= f * Aty[i];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = Aty[i];
    for (let j = i + 1; j < n; j++) s -= AtA[i][j] * x[j];
    x[i] = s / AtA[i][i];
  }
  return x;
}
