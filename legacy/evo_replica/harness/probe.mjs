const BASE = 'https://www.evoiolcalculator.com/toric.aspx';

function pickHidden(html, name) {
  const re = new RegExp(`id="${name}"[^>]*value="([^"]*)"`);
  const m = html.match(re);
  return m ? m[1] : '';
}
export function pickVal(html, id) {
  const re = new RegExp(`<input[^>]*id="${id}"[^>]*>`);
  const m = html.match(re);
  if (!m) return null;
  const v = m[0].match(/value="([^"]*)"/);
  return v ? v[1] : '';
}
function pickSel(html, id) {
  const re = new RegExp(`<select[^>]*id="${id}"[\\s\\S]*?<\\/select>`);
  const m = html.match(re);
  if (!m) return null;
  const v = m[0].match(/<option selected="selected" value="([^"]*)"/);
  return v ? v[1] : '';
}

const DEFAULTS = {
  TextBoxName: 'T', TextBoxID: '1', TextBoxSurgeon: 'D',
  DropDownArgos: '0',
  RadioButtonRLEye: '1',
  txtAL: '', txtK1: '', TxtK1Axis: '', txtK2: '', TxtK2Axis: '',
  txtACD: '', txtLT: '', txtCCT: '',
  txtRefraction: '0', txtAConstant: '',
  DropDownToric: 'Posterior', DropDownKIndex: '1.3375',
  TxtSIA: '', TxtSIAaxis: '',
  DropDownLASIK: '0', DropDownListPK: 'IOLMaster 700',
  txtPK1: '', TxtPK1axis: '', txtPK2: '', TxtPK2axis: '',
  txtPreLASIK: '', txtPostLASIK: '',
};

function stateOf(html) {
  return {
    __VIEWSTATE: pickHidden(html, '__VIEWSTATE'),
    __VIEWSTATEGENERATOR: pickHidden(html, '__VIEWSTATEGENERATOR'),
    __EVENTVALIDATION: pickHidden(html, '__EVENTVALIDATION'),
  };
}

async function post(html, cookie, fields, extra = {}) {
  const body = new URLSearchParams({
    __EVENTTARGET: '', __EVENTARGUMENT: '', __LASTFOCUS: '',
    ...stateOf(html), ...fields, ...extra,
  });
  const r = await fetch(BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body,
  });
  return await r.text();
}

/** Full two-step flow: select model (autopostback) then calculate. */
export async function calc(input = {}) {
  const g = await fetch(BASE, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  let html = await g.text();
  const cookie = (g.headers.get('set-cookie') || '').split(';')[0];

  const f = { ...DEFAULTS, ...input };

  // Step 1: fire the model dropdown change so the server autofills A constant.
  html = await post(html, cookie, { ...f, txtAConstant: '' }, { __EVENTTARGET: 'DropDownToric' });

  // Server-suggested A constant unless caller forced one.
  const autoA = pickVal(html, 'txtAConstant') || '';
  const aConst = input.txtAConstant || autoA;

  // Step 2: calculate.
  html = await post(html, cookie, { ...f, txtAConstant: aConst }, { btnCalculate: 'Calculate' });
  return { html, autoA, aConst };
}

if (process.argv[1] && process.argv[1].endsWith('probe.mjs')) {
  const { html, autoA } = await calc({
    txtAL: '23.50', txtK1: '43.00', TxtK1Axis: '180', txtK2: '45.00', TxtK2Axis: '90',
    txtACD: '3.20', txtLT: '4.50', txtCCT: '550', txtRefraction: '0',
    DropDownToric: 'Tecnis', TxtSIA: '0.10', TxtSIAaxis: '100',
  });
  const fs = await import('fs');
  fs.writeFileSync('resp2.html', html);
  console.log('autoA =', autoA);
  const i = html.indexOf('class="results"');
  console.log('results idx:', i, 'len', html.length);
  if (i > 0) {
    const txt = html.slice(i).replace(/<script[\s\S]*?<\/script>/g, '');
    console.log(txt.slice(0, 9000));
  } else {
    console.log('errs:', JSON.stringify([...html.matchAll(/err-label[^>]*>([^<]*)</g)].map(x => x[1])));
  }
}
