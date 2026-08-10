import * as E from './evo.mjs';

export const NV = 1336;
/** Forward vergence model: refraction at spectacle plane for IOL power P. */
export function refOf(P, ELP, Kc, AL, V = 0.012) {
  const V0 = NV / (AL - ELP);
  const x = (NV * (V0 - P)) / (ELP * (V0 - P) + NV);
  const c = x - Kc;
  return c / (1 + V * c);
}

/** Nelder-Mead simplex. */
export function nm(f, x0, step = 0.1, iters = 4000, tol = 1e-14) {
  const n = x0.length;
  let S = [x0.slice()];
  for (let i = 0; i < n; i++) { const p = x0.slice(); p[i] += (step * (Math.abs(p[i]) || 1)); S.push(p); }
  let F = S.map(f);
  for (let it = 0; it < iters; it++) {
    const idx = F.map((v, i) => i).sort((a, b) => F[a] - F[b]);
    S = idx.map(i => S[i]); F = idx.map(i => F[i]);
    if (Math.abs(F[n] - F[0]) < tol) break;
    const cen = new Array(n).fill(0);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) cen[j] += S[i][j] / n;
    const refl = cen.map((c, j) => c + 1 * (c - S[n][j]));
    const fr = f(refl);
    if (fr < F[0]) {
      const exp = cen.map((c, j) => c + 2 * (c - S[n][j]));
      const fe = f(exp);
      if (fe < fr) { S[n] = exp; F[n] = fe; } else { S[n] = refl; F[n] = fr; }
    } else if (fr < F[n - 1]) { S[n] = refl; F[n] = fr; }
    else {
      const con = cen.map((c, j) => c + 0.5 * (S[n][j] - c));
      const fc = f(con);
      if (fc < F[n]) { S[n] = con; F[n] = fc; }
      else { for (let i = 1; i <= n; i++) { S[i] = S[i].map((v, j) => S[0][j] + 0.5 * (v - S[0][j])); F[i] = f(S[i]); } }
    }
  }
  const b = F.map((v, i) => i).sort((a, b2) => F[a] - F[b2])[0];
  return { x: S[b], f: F[b] };
}

/** Solve (ELP, Kc, ALeff) from observed (P, REF) pairs. */
export function solveEye(pairs, guess = [5.2, 43.2, 23.5]) {
  const obj = ([ELP, Kc, AL]) => {
    let s = 0;
    for (const [P, R] of pairs) { const d = refOf(P, ELP, Kc, AL) - R; s += d * d; }
    return s;
  };
  let best = null;
  for (const g of [guess, [4.5, guess[1], guess[2]], [6.0, guess[1], guess[2]]]) {
    const r = nm(obj, g, 0.05, 6000);
    if (!best || r.f < best.f) best = r;
  }
  return { ELP: best.x[0], Kc: best.x[1], AL: best.x[2], rms: Math.sqrt(best.f / pairs.length) };
}

/** Collect many (P,REF) pairs for one eye by sweeping the target refraction. */
export async function eyePairs(eye, targets = ['-4', '-2', '0', '2', '4']) {
  const all = [];
  for (const t of targets) {
    const r = await E.calc({ ...eye, txtRefraction: t });
    if (r.ok) all.push(...r.pairs);
  }
  const seen = new Map();
  for (const [P, R] of all) seen.set(P, R);
  return [...seen.entries()].sort((a, b) => a[0] - b[0]);
}
