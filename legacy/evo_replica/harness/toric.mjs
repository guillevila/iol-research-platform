import * as E from './evo.mjs';

const D2R = Math.PI / 180;

/** Cylinder magnitude m with STEEP meridian at th -> double-angle vector. */
export const vec = (m, th) => [m * Math.cos(2 * th * D2R), m * Math.sin(2 * th * D2R)];
export const mag = v => Math.hypot(v[0], v[1]);
export function meridian(v) {
  let a = Math.atan2(v[1], v[0]) / 2 / D2R;
  return ((a % 180) + 180) % 180;
}

/**
 * From EVO's toric rows recover:
 *  - ratio: IOL-plane cylinder -> corneal-plane cylinder divisor
 *  - TCA:   total corneal astigmatism vector (steep meridian convention)
 * Residual row: resiCyl is minus-cyl at resiAxis => steep meridian = resiAxis + 90.
 */
export function extract(rows) {
  const pts = rows
    .filter(r => r.resiCyl !== null && r.resiAxis !== null && r.toric !== null)
    .map(r => ({ t: r.toric, R: vec(Math.abs(r.resiCyl), r.resiAxis + 90), ax: r.iolAxis }));
  if (pts.length < 2) return null;
  // R_i = C - (t_i / ratio) * u   ->  linear in t_i for each component
  const fitc = j => {
    const n = pts.length;
    const st = pts.reduce((s, p) => s + p.t, 0), sy = pts.reduce((s, p) => s + p.R[j], 0);
    const stt = pts.reduce((s, p) => s + p.t * p.t, 0), sty = pts.reduce((s, p) => s + p.t * p.R[j], 0);
    const den = n * stt - st * st;
    const slope = (n * sty - st * sy) / den;
    const inter = (sy - slope * st) / n;
    return { slope, inter };
  };
  const fx = fitc(0), fy = fitc(1);
  const k = Math.hypot(fx.slope, fy.slope);       // = 1/ratio
  if (k < 1e-9) return null;
  const C = [fx.inter, fy.inter];
  const u = [-fx.slope / k, -fy.slope / k];
  // residual of the linear model (sanity)
  let res = 0;
  for (const p of pts) {
    const px = C[0] - p.t * k * u[0], py = C[1] - p.t * k * u[1];
    res = Math.max(res, Math.hypot(px - p.R[0], py - p.R[1]));
  }
  return {
    ratio: 1 / k,
    TCA: C, tcaMag: mag(C), tcaAxis: meridian(C),
    uAxis: meridian(u), iolAxis: pts[0].ax, fitres: res, n: pts.length,
  };
}

/** Convenience: run one eye and extract its toric characterisation. */
export async function probe(eye) {
  const r = await E.calc(eye);
  if (!r.ok) return { err: r.errs };
  const ex = extract(r.torics);
  return { raw: r, ex };
}
