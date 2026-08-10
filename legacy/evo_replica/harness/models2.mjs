import fs from 'fs';
import { eyeFn } from './physical.mjs';

const P = JSON.parse(fs.readFileSync('post.json', 'utf8'));
const D2R = Math.PI / 180;
const antVec = (m, th) => [m * Math.cos(2 * th * D2R), m * Math.sin(2 * th * D2R)];
const uOf = ax => [Math.cos(2 * ax * D2R), Math.sin(2 * ax * D2R)];

const obs = [];
for (const r of P.posterior.filter(r => r.mode === 'Posterior' && r.torics)) {
  const Kmean = 43 + r.m / 2;
  const fn = eyeFn(23.5, Kmean, 119.3);
  const ant = antVec(r.m, r.th);
  for (const t of r.torics) {
    if (t.resiCyl == null || t.resiAxis == null || t.iolAxis == null) continue;
    obs.push({ ant, c: t.toric, u: uOf(t.iolAxis), R: antVec(Math.abs(t.resiCyl), t.resiAxis + 90), s0: Math.abs(fn.s0), m: r.m, th: r.th });
  }
}

function fit(nparam, predictTCA, cylFactor, seed, steps) {
  const err = p => {
    let sse = 0, mx = 0;
    for (const o of obs) {
      const [tx, ty] = predictTCA(p, o);
      const k = cylFactor(p, o);
      const e = Math.hypot(tx - o.c * k * o.u[0] - o.R[0], ty - o.c * k * o.u[1] - o.R[1]);
      sse += e * e; mx = Math.max(mx, e);
    }
    return { rms: Math.sqrt(sse / obs.length), mx };
  };
  let p = seed.slice();
  for (let round = 0; round < 150; round++)
    for (let i = 0; i < nparam; i++) {
      let lo = p[i] - steps[i], hi = p[i] + steps[i];
      for (let it = 0; it < 70; it++) {
        const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
        const q1 = p.slice(); q1[i] = m1; const q2 = p.slice(); q2[i] = m2;
        if (err(q1).rms < err(q2).rms) hi = m2; else lo = m1;
      }
      p[i] = (lo + hi) / 2;
    }
  return { p, ...err(p) };
}

const A = fit(3, (p, o) => [p[0] * o.ant[0] + p[1], p[0] * o.ant[1]], p => 1 / p[2], [0.85, 0.49, 1.56], [0.2, 0.2, 0.2]);
console.log(`M1 constant ratio            : a=${A.p[0].toFixed(5)} b=${A.p[1].toFixed(5)} ratio=${A.p[2].toFixed(5)}   rms=${A.rms.toFixed(5)} max=${A.mx.toFixed(4)}`);

const B = fit(3, (p, o) => [p[0] * o.ant[0] + p[1], p[0] * o.ant[1]], (p, o) => p[2] * o.s0, [0.85, 0.49, 1.0], [0.2, 0.2, 0.3]);
console.log(`M2 ratio = 1/(k*|s0|)        : a=${B.p[0].toFixed(5)} b=${B.p[1].toFixed(5)} k=${B.p[2].toFixed(5)}      rms=${B.rms.toFixed(5)} max=${B.mx.toFixed(4)}`);

const C = fit(4, (p, o) => [p[0] * o.ant[0] + p[1], p[3] * o.ant[1]], (p, o) => p[2] * o.s0, [0.85, 0.49, 1.0, 0.85], [0.2, 0.2, 0.3, 0.2]);
console.log(`M3 separate x/y slopes       : ax=${C.p[0].toFixed(5)} b=${C.p[1].toFixed(5)} k=${C.p[2].toFixed(5)} ay=${C.p[3].toFixed(5)}  rms=${C.rms.toFixed(5)} max=${C.mx.toFixed(4)}`);

console.log('\nM2 rms by anterior magnitude:');
for (const m of [...new Set(obs.map(o => o.m))].sort((x, y) => x - y)) {
  const s = obs.filter(o => o.m === m);
  let sse = 0, mx = 0;
  for (const o of s) {
    const tx = B.p[0] * o.ant[0] + B.p[1], ty = B.p[0] * o.ant[1], k = B.p[2] * o.s0;
    const e = Math.hypot(tx - o.c * k * o.u[0] - o.R[0], ty - o.c * k * o.u[1] - o.R[1]);
    sse += e * e; mx = Math.max(mx, e);
  }
  console.log(`   m=${String(m).padStart(3)}: rms ${Math.sqrt(sse / s.length).toFixed(4)}  max ${mx.toFixed(4)}   (Kmean ${43 + m / 2})`);
}
console.log('\nM2 rms by meridian:');
for (const th of [...new Set(obs.map(o => o.th))].sort((x, y) => x - y)) {
  const s = obs.filter(o => o.th === th);
  let sse = 0;
  for (const o of s) {
    const tx = B.p[0] * o.ant[0] + B.p[1], ty = B.p[0] * o.ant[1], k = B.p[2] * o.s0;
    sse += Math.hypot(tx - o.c * k * o.u[0] - o.R[0], ty - o.c * k * o.u[1] - o.R[1]) ** 2;
  }
  console.log(`   th=${String(th).padStart(3)}: rms ${Math.sqrt(sse / s.length).toFixed(4)}`);
}
