import fs from 'fs';
import { eyeFn } from './eye2.mjs';

const D2R = Math.PI / 180;
export const av = (m, th) => [m * Math.cos(2 * th * D2R), m * Math.sin(2 * th * D2R)];

/**
 * Per-meridian model.
 *  - the posterior regression acts on the CORNEAL-plane anterior astigmatism
 *  - each principal meridian is traced through the eye's own vergence curve
 *  - the toric IOL adds its cylinder to the meridian aligned with the flat cornea
 * Returns the spectacle-plane residual astigmatism as a magnitude + steep meridian.
 */
export function residualOf({ AL, Kmean, A, P, cylIOL, tcaMag, tcaAxis }) {
  const Kf = Kmean - tcaMag / 2, Ks = Kmean + tcaMag / 2;
  const refSteep = eyeFn(AL, Ks, A).ref(P);            // steep cornea meridian, plain IOL power
  const refFlat = eyeFn(AL, Kf, A).ref(P + cylIOL);    // flat cornea meridian, +cyl
  // refraction is more myopic where power is higher
  const diff = refSteep - refFlat;                      // <0 -> still steep at tcaAxis
  return { mag: Math.abs(diff), steepMer: diff < 0 ? tcaAxis : (tcaAxis + 90) % 180, signed: diff };
}

if (process.argv[1] && process.argv[1].endsWith('meridian.mjs')) {
  const P = JSON.parse(fs.readFileSync('post.json', 'utf8'));
  const C = JSON.parse(fs.readFileSync('cache2.json', 'utf8'));
  const key = (AL, K, A) => JSON.stringify({
    TextBoxName: 'T', TextBoxID: '1', TextBoxSurgeon: 'D', DropDownArgos: '0', RadioButtonRLEye: '1',
    txtAL: AL.toFixed(2), txtK1: K.toFixed(2), TxtK1Axis: '180', txtK2: (K + 2).toFixed(2), TxtK2Axis: '90',
    txtACD: '3.20', txtLT: '4.50', txtCCT: '550', txtRefraction: '0', txtAConstant: A.toFixed(2),
    DropDownToric: 'Posterior', DropDownKIndex: '1.3375', TxtSIA: '0', TxtSIAaxis: '0', DropDownLASIK: '0',
    DropDownListPK: 'IOLMaster 700', txtPK1: '', TxtPK1axis: '', txtPK2: '', TxtPK2axis: '', txtPreLASIK: '', txtPostLASIK: '',
  });

  // For each eye of the ratio sweep, solve the corneal-plane TCA that reproduces EVO's rows.
  console.log('Corneal-plane TCA implied by the per-meridian model (anterior 2.00 D WTR)');
  console.log('   A      AL    K40     K42     K44     K46     K48');
  const vals = [];
  for (const A of [117.3, 119.3, 121.3]) for (const AL of [21, 23, 25, 27]) {
    const cells = [40, 42, 44, 46, 48].map(K => {
      const c = C[key(AL, K, A)];
      if (!c || !c.ok) return '    -   ';
      const Km = K + 1;
      const Pb = c.baseIOL;
      // least-squares over the toric rows for the single unknown tcaMag
      const err = t => {
        let s = 0;
        for (const row of c.torics) {
          if (row.resiCyl == null) continue;
          const r = residualOf({ AL, Kmean: Km, A, P: Pb, cylIOL: row.toric, tcaMag: t, tcaAxis: 90 });
          const obs = Math.abs(row.resiCyl), obsSteep = (row.resiAxis + 90) % 180;
          const sgn = (obsSteep === 90 || obsSteep === 0 && false) ? 1 : -1;
          const signedObs = (obsSteep % 180 === 90) ? -obs : obs;   // negative => still steep at 90
          s += (r.signed - signedObs) ** 2;
        }
        return s;
      };
      let lo = 0.2, hi = 3.0;
      for (let i = 0; i < 120; i++) {
        const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
        if (err(m1) < err(m2)) hi = m2; else lo = m1;
      }
      const t = (lo + hi) / 2;
      vals.push({ AL, K, A, t });
      return t.toFixed(4).padStart(8);
    });
    console.log('  ' + A + '  AL' + String(AL).padStart(2) + ' ' + cells.join(''));
  }
  const m = vals.reduce((s, v) => s + v.t, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((s, v) => s + (v.t - m) ** 2, 0) / vals.length);
  console.log(`\n  mean = ${m.toFixed(4)}   sd = ${sd.toFixed(4)}   min = ${Math.min(...vals.map(v => v.t)).toFixed(4)}   max = ${Math.max(...vals.map(v => v.t)).toFixed(4)}`);
  console.log('  (if the per-meridian transfer is right, this should be nearly constant across all eyes)');
}
