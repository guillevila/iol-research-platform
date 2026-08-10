import fs from 'fs';
import * as I from './interp.mjs';
import { eyeFn } from './eye2.mjs';

/** Meridian-specific refraction curve: SAME ELP, s0, kappa; only the corneal power changes. */
export function meridianFns(AL, Kmean, A) {
  const base = eyeFn(AL, Kmean, A);
  const mk = Kmer => {
    const P0 = I.p0Of(AL, I.KcOf(Kmer), base.ELP);
    const m = -2 * base.s0 / base.kap, d = m - P0, a = base.s0 * m, b = -a * P0;
    return { P0, ref: P => (a * P + b) / (P + d) };
  };
  return { base, mk };
}
export function signedResidual(AL, Kmean, A, P, cyl, tcaMag) {
  const { mk } = meridianFns(AL, Kmean, A);
  const steep = mk(Kmean + tcaMag / 2), flat = mk(Kmean - tcaMag / 2);
  return steep.ref(P) - flat.ref(P + cyl);   // <0 => still steep at the original steep meridian
}
