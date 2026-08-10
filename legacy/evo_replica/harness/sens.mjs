import * as E from './evo.mjs';
import * as F from './fit.mjs';

export const BASE_EYE = {
  txtAL: '23.50', txtK1: '43.50', TxtK1Axis: '180', txtK2: '43.50', TxtK2Axis: '90',
  txtACD: '3.20', txtLT: '4.50', txtCCT: '550', txtAConstant: '119.3',
};

/** 3 target sweeps -> ~15 (P,REF) pairs spanning ~7 D. */
export async function pairsOf(eye, targets = ['-3', '0', '3']) {
  const m = new Map();
  for (const t of targets) {
    const r = await E.calc({ ...eye, txtRefraction: t });
    if (r.ok) for (const [P, R] of r.pairs) m.set(P, R);
  }
  return [...m.entries()].sort((a, b) => a[0] - b[0]);
}

/** Characterise one eye by the Mobius transform REF=(aP+b)/(P+d). */
export function characterise(pairs) {
  const c = E.fitMobius(pairs);
  const [a, b, d] = c;
  // P where REF = 0  ->  aP + b = 0
  const P0 = -b / a;
  // dREF/dP = (a(P+d) - (aP+b))/(P+d)^2 = (ad - b)/(P+d)^2
  const slope = (a * d - b) / Math.pow(P0 + d, 2);
  let maxres = 0;
  for (const [P, R] of pairs) maxres = Math.max(maxres, Math.abs(E.mobius(c, P) - R));
  return { a, b, d, P0, slope, maxres, n: pairs.length };
}

export async function scan(label, key, values, base = BASE_EYE) {
  const rows = [];
  for (const v of values) {
    const eye = { ...base, [key]: String(v) };
    const p = await pairsOf(eye);
    if (p.length < 5) { rows.push({ v, err: true }); continue; }
    rows.push({ v, ...characterise(p) });
  }
  E.saveCache();
  console.log(`\n== ${label} ==`);
  console.log('value      P0(emm)   slope     a          b            d           maxres');
  for (const r of rows) {
    if (r.err) { console.log(String(r.v).padEnd(10), 'ERROR'); continue; }
    console.log(
      String(r.v).padEnd(10),
      r.P0.toFixed(4).padStart(8),
      r.slope.toFixed(5).padStart(9),
      r.a.toFixed(4).padStart(10),
      r.b.toFixed(3).padStart(12),
      r.d.toFixed(3).padStart(11),
      r.maxres.toFixed(4).padStart(8),
    );
  }
  return rows;
}
