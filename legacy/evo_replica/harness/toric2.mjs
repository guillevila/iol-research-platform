import * as E from './evo2.mjs';

const D2R = Math.PI / 180;
export const vec = (m, th) => [m * Math.cos(2 * th * D2R), m * Math.sin(2 * th * D2R)];
export const mag = v => Math.hypot(v[0], v[1]);
export const meridian = v => (((Math.atan2(v[1], v[0]) / 2 / D2R) % 180) + 180) % 180;

/**
 * Recover (toric ratio, total corneal astigmatism vector) from EVO's toric rows.
 * Residual row: resiCyl is minus-cylinder at resiAxis  =>  steep meridian = resiAxis + 90.
 * Model: R_i = C - (t_i / ratio) * u   (u = unit vector along the corrected meridian)
 */
export function extract(rows) {
  const pts = rows.filter(r => r.resiCyl != null && r.resiAxis != null && r.toric != null)
    .map(r => ({ t: r.toric, R: vec(Math.abs(r.resiCyl), r.resiAxis + 90), ax: r.iolAxis }));
  if (pts.length < 2) return null;
  const lin = j => {
    const n = pts.length;
    const st = pts.reduce((s, p) => s + p.t, 0), sy = pts.reduce((s, p) => s + p.R[j], 0);
    const stt = pts.reduce((s, p) => s + p.t * p.t, 0), sty = pts.reduce((s, p) => s + p.t * p.R[j], 0);
    const den = n * stt - st * st;
    if (Math.abs(den) < 1e-12) return null;
    const slope = (n * sty - st * sy) / den;
    return { slope, inter: (sy - slope * st) / n };
  };
  const fx = lin(0), fy = lin(1);
  if (!fx || !fy) return null;
  const k = Math.hypot(fx.slope, fy.slope);
  if (k < 1e-9) return null;
  const C = [fx.inter, fy.inter];
  let res = 0;
  for (const p of pts) {
    res = Math.max(res, Math.hypot(C[0] + p.t * fx.slope - p.R[0], C[1] + p.t * fy.slope - p.R[1]));
  }
  return {
    ratio: 1 / k, TCA: C, tcaMag: mag(C), tcaAxis: meridian(C),
    corrAxis: meridian([-fx.slope, -fy.slope]), iolAxis: pts[0].ax,
    sameAxis: pts.every(p => p.ax === pts[0].ax), fitres: res, n: pts.length,
  };
}

/** Build an eye whose anterior astigmatism is `m` dioptres with steep meridian `th`. */
export function astigEye(base, K1, m, th) {
  const steep = ((th % 180) + 180) % 180;
  const flat = (steep + 90) % 180;
  return {
    ...base,
    txtK1: K1.toFixed(2), TxtK1Axis: String(Math.round(flat) === 0 ? 180 : Math.round(flat)),
    txtK2: (K1 + m).toFixed(2), TxtK2Axis: String(Math.round(steep) === 0 ? 180 : Math.round(steep)),
  };
}

export const BASE = {
  txtAL: '23.50', txtACD: '3.20', txtLT: '4.50', txtCCT: '550',
  txtAConstant: '119.30', txtRefraction: '0', TxtSIA: '0', TxtSIAaxis: '0',
};

export async function probeMany(eyes, concurrency = 8) {
  const rs = await E.calcMany(eyes, { concurrency });
  return rs.map(r => (r && r.ok ? { raw: r, ex: extract(r.torics) } : { raw: r, ex: null }));
}
