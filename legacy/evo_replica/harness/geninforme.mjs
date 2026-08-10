import fs from 'fs';
const D = JSON.parse(fs.readFileSync('dashboard-data.json', 'utf8'));

const C = {
  s1: '#2a78d6', s2: '#eb6834', s3: '#1baf7a',
  ramp: ['#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#1c5cab'],
  head: '#153F74', sec: '#6F6F6F', ink: '#1a1a1a', muted: '#898781',
  grid: '#e1e0d9', axis: '#c3c2b7', surface: '#ffffff', page: '#f7f8fa', line: '#d6d6d6',
};
const f1 = x => x.toFixed(1), f2 = x => x.toFixed(2), f3 = x => x.toFixed(3);
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const G = D.global;

// ---------------- figures ----------------
function figMobius() {
  const pts = [[13.5,4.5],[14,4.22],[14.5,3.94],[15,3.66],[15.5,3.39],[17,2.52],[17.5,2.23],[18,1.93],[18.5,1.63],[19,1.33],[20,0.72],[20.5,0.41],[21,0.1],[21.5,-0.22],[22,-0.53],[23,-1.19],[23.5,-1.52],[24,-1.84],[24.5,-2.18],[25,-2.51],[26,-3.2],[26.5,-3.54],[27,-3.9],[27.5,-4.26],[28,-4.61]];
  const a = 66.920909, b = -1415.858782, d = -127.391478;
  const W = 620, H = 300, l = 50, r = 14, t = 12, bo = 40;
  const pw = W - l - r, ph = H - t - bo;
  const X = p => l + (p - 13) / (29 - 13) * pw;
  const Y = v => t + (5 - v) / 10 * ph;
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Ajuste de Möbius sobre respuestas reales de EVO">`;
  for (const g of [-4, -2, 0, 2, 4]) {
    s += `<line x1="${l}" y1="${Y(g)}" x2="${W - r}" y2="${Y(g)}" stroke="${g === 0 ? C.axis : C.grid}" stroke-width="1"/>`;
    s += `<text x="${l - 6}" y="${Y(g) + 4}" text-anchor="end" font-size="10" fill="${C.muted}" style="font-variant-numeric:tabular-nums">${g}</text>`;
  }
  for (let p = 14; p <= 28; p += 2) s += `<text x="${X(p)}" y="${H - bo + 16}" text-anchor="middle" font-size="10" fill="${C.muted}" style="font-variant-numeric:tabular-nums">${p}</text>`;
  s += `<text x="${(l + W - r) / 2}" y="${H - 4}" text-anchor="middle" font-size="10.5" fill="${C.sec}">Potencia de LIO (D)</text>`;
  s += `<text x="12" y="${t + ph / 2}" text-anchor="middle" font-size="10.5" fill="${C.sec}" transform="rotate(-90 12 ${t + ph / 2})">Refracción prevista (D)</text>`;
  let path = '';
  for (let p = 13.2; p <= 28.6; p += 0.1) {
    const v = (a * p + b) / (p + d);
    path += (path ? 'L' : 'M') + X(p).toFixed(1) + ',' + Y(v).toFixed(1);
  }
  s += `<path d="${path}" fill="none" stroke="${C.s1}" stroke-width="2" stroke-linecap="round"/>`;
  for (const [p, v] of pts)
    s += `<circle cx="${X(p).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="4" fill="${C.s2}" stroke="${C.surface}" stroke-width="1.5" data-tip="P ${p} D → ${v} D (respuesta real de EVO)"/>`;
  return s + '</svg>';
}

function figPipeline() {
  const W = 900, H = 258;
  const box = (x, y, w, h, title, sub, hi) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${hi ? '#eef4fb' : '#f7f8fa'}" stroke="${hi ? C.s1 : C.line}" stroke-width="1.2"/>` +
    `<text x="${x + w / 2}" y="${y + 20}" text-anchor="middle" font-size="12" font-weight="600" fill="${C.head}">${esc(title)}</text>` +
    (sub ? `<text x="${x + w / 2}" y="${y + 36}" text-anchor="middle" font-size="10" fill="${C.sec}">${esc(sub)}</text>` : '');
  const arrow = (x1, y1, x2, y2) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${C.axis}" stroke-width="1.4"/>` +
    `<polygon points="${x2},${y2} ${x2 - 7},${y2 - 3.5} ${x2 - 7},${y2 + 3.5}" fill="${C.axis}" transform="rotate(${Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI} ${x2} ${y2})"/>`;
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Esquema del algoritmo">`;
  // row 1: spherical chain
  s += box(8, 16, 150, 46, '1 · Entradas', 'AL, K1/K2, ACD, LT, CCT, A');
  s += arrow(158, 39, 182, 39);
  s += box(184, 16, 172, 46, '2 · Normalización', 'índice K → 1.3375 · A y AL efectivas');
  s += arrow(356, 39, 380, 39);
  s += box(382, 16, 190, 46, '3 · Curva del ojo', 'vergencia + tablas ELP / s₀ / κ');
  s += arrow(572, 39, 596, 39);
  s += box(598, 16, 138, 46, '4 · Ajuste por lente', 'off(modelo, P)');
  s += arrow(736, 39, 760, 39);
  s += box(762, 16, 130, 46, '5 · LIO esférica', 'rejilla 0.5 D, la más próxima', true);
  // row 2: toric chain
  s += box(8, 150, 190, 46, '6 · Astigmatismo total', 'anterior ×0.980 + córnea posterior');
  s += arrow(198, 173, 222, 173);
  s += box(224, 150, 128, 46, '7 · + SIA', 'vector en doble ángulo');
  s += arrow(352, 173, 376, 173);
  s += box(378, 150, 216, 46, '8 · Trazado por meridianos', 'curvas Km ± TCA/2, misma ELP');
  s += arrow(594, 173, 618, 173);
  s += box(620, 150, 272, 46, '9 · Cilindro y eje', 'cruce por cero + 0.10 D → catálogo del modelo', true);
  // vertical link: spherical power feeds the meridian tracing
  s += arrow(827, 62, 827, 92);
  s += `<text x="838" y="82" font-size="10" fill="${C.sec}">potencia elegida</text>`;
  s += arrow(827, 92, 486, 92) + arrow(486, 92, 486, 148);
  s += `<line x1="827" y1="92" x2="486" y2="92" stroke="${C.axis}" stroke-width="1.4"/>`;
  // inputs feed toric chain too
  s += arrow(83, 62, 83, 148);
  s += `<text x="92" y="110" font-size="10" fill="${C.sec}">K1/K2 y ejes</text>`;
  return s + '</svg>';
}

function tiersChart() {
  const W = 860, rowH = 40, labelW = 380, pad = 8;
  const H = D.tiers.length * rowH + 30;
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Niveles de igualdad">`;
  const barW = W - labelW - 90;
  D.tiers.slice().reverse().forEach((t, i) => {
    const y = i * rowH + 10, w = Math.max(2, t.p / 100 * barW);
    const col = C.ramp[Math.min(C.ramp.length - 1, i)];
    s += `<text x="${labelW - 10}" y="${y + 17}" text-anchor="end" font-size="12.5" fill="${C.ink}">${esc(t.name)}</text>`;
    s += `<rect x="${labelW}" y="${y}" width="${w}" height="24" fill="${col}" data-tip="${esc(t.name)}: ${t.k} de ${D.totalRows} casos (${f1(t.p)}%)"/>`;
    s += `<rect x="${labelW + w - 4}" y="${y}" width="4" height="24" rx="2" fill="${col}"/>`;
    s += `<text x="${labelW + w + pad}" y="${y + 17}" font-size="12.5" font-weight="600" fill="${C.ink}">${f1(t.p)}%</text>`;
    s += `<text x="${labelW + w + pad + 52}" y="${y + 17}" font-size="11" fill="${C.muted}">${t.k} casos</text>`;
  });
  s += `<line x1="${labelW}" y1="${H - 16}" x2="${W - 60}" y2="${H - 16}" stroke="${C.axis}" stroke-width="1"/>`;
  return s + '</svg>';
}

function scenarioChart() {
  const groups = D.perMode;
  const series = [
    { k: 'iol', name: 'Potencia igual', col: C.s1 },
    { k: 'cyl', name: 'Cilindro igual', col: C.s2 },
    { k: 'ax1', name: 'Eje ≤1°', col: C.s3 },
  ];
  const bw = 22, gap = 2, gpad = 26, plotH = 210, top = 26;
  const gW = series.length * (bw + gap) - gap;
  const W = 56 + groups.length * (gW + gpad) + 10, H = plotH + top + 58;
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Concordancia por escenario">`;
  for (const g of [0, 25, 50, 75, 100]) {
    const y = top + plotH - g / 100 * plotH;
    s += `<line x1="52" y1="${y}" x2="${W - 8}" y2="${y}" stroke="${g === 0 ? C.axis : C.grid}" stroke-width="1"/>`;
    s += `<text x="46" y="${y + 4}" text-anchor="end" font-size="10.5" fill="${C.muted}" style="font-variant-numeric:tabular-nums">${g}</text>`;
  }
  groups.forEach((g, gi) => {
    const x0 = 56 + gi * (gW + gpad);
    series.forEach((se, si) => {
      const v = g[se.k], h = Math.max(2, v / 100 * plotH);
      const x = x0 + si * (bw + gap), y = top + plotH - h;
      s += `<rect x="${x}" y="${y}" width="${bw}" height="${h}" fill="${se.col}" data-tip="${esc(g.name)} — ${se.name}: ${f1(v)}% (n=${g.n})"/>`;
      s += `<rect x="${x}" y="${y}" width="${bw}" height="4" rx="2" fill="${se.col}"/>`;
      s += `<text x="${x + bw / 2}" y="${y - 4}" text-anchor="middle" font-size="9.5" fill="${C.sec}" style="font-variant-numeric:tabular-nums">${Math.round(v)}</text>`;
    });
    s += `<text x="${x0 + gW / 2}" y="${top + plotH + 16}" text-anchor="middle" font-size="11" fill="${C.ink}">${esc(g.name)}</text>`;
    s += `<text x="${x0 + gW / 2}" y="${top + plotH + 30}" text-anchor="middle" font-size="10" fill="${C.muted}">n=${g.n}</text>`;
  });
  return s + '</svg>';
}

function histChart(h, title) {
  const bw = 24, gap = 20, plotH = 150, top = 18;
  const n = h.counts.length;
  const W = 46 + n * (bw + gap), H = plotH + top + 40;
  const mx = Math.max(...h.counts);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">`;
  s += `<line x1="40" y1="${top + plotH}" x2="${W - 6}" y2="${top + plotH}" stroke="${C.axis}" stroke-width="1"/>`;
  h.counts.forEach((c2, i) => {
    const hgt = Math.max(c2 > 0 ? 3 : 0, c2 / mx * (plotH - 14));
    const x = 46 + i * (bw + gap), y = top + plotH - hgt;
    if (c2 > 0) {
      s += `<rect x="${x}" y="${y}" width="${bw}" height="${hgt}" fill="${C.s1}" data-tip="${esc(h.labels[i])}: ${c2} casos (${f1(100 * c2 / D.totalRows)}%)"/>`;
      s += `<rect x="${x}" y="${y}" width="${bw}" height="4" rx="2" fill="${C.s1}"/>`;
    }
    s += `<text x="${x + bw / 2}" y="${y - 5}" text-anchor="middle" font-size="10" fill="${C.sec}" style="font-variant-numeric:tabular-nums">${c2}</text>`;
    s += `<text x="${x + bw / 2}" y="${top + plotH + 15}" text-anchor="middle" font-size="10" fill="${C.muted}">${esc(h.labels[i])}</text>`;
  });
  return s + '</svg>';
}

function scatterChart() {
  const W = 860, H = 300, l = 52, r = 16, t = 16, b = 44;
  const pw = W - l - r, ph = H - t - b;
  const X = v => l + (v - 20) / 12 * pw;
  const Y = v => t + ph - Math.min(v, 0.6) / 0.6 * ph;
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Desviación frente a longitud axial">`;
  for (const g of [0, 0.2, 0.4, 0.6]) {
    s += `<line x1="${l}" y1="${Y(g)}" x2="${W - r}" y2="${Y(g)}" stroke="${g === 0 ? C.axis : C.grid}" stroke-width="1"/>`;
    s += `<text x="${l - 6}" y="${Y(g) + 4}" text-anchor="end" font-size="10.5" fill="${C.muted}" style="font-variant-numeric:tabular-nums">${f1(g)}</text>`;
  }
  for (let a = 20; a <= 32; a += 2) s += `<text x="${X(a)}" y="${H - b + 16}" text-anchor="middle" font-size="10.5" fill="${C.muted}" style="font-variant-numeric:tabular-nums">${a}</text>`;
  s += `<text x="${(l + W - r) / 2}" y="${H - 6}" text-anchor="middle" font-size="11" fill="${C.sec}">Longitud axial (mm)</text>`;
  const yR = Y(0.25);
  s += `<line x1="${l}" y1="${yR}" x2="${W - r}" y2="${yR}" stroke="${C.s2}" stroke-width="1.5"/>`;
  s += `<text x="${W - r - 4}" y="${yR - 5}" text-anchor="end" font-size="10.5" fill="${C.sec}">0.25 D — mínimo clínicamente relevante</text>`;
  for (const [al, dr] of D.scatter) s += `<circle cx="${X(al).toFixed(1)}" cy="${Y(dr).toFixed(1)}" r="4" fill="${C.s1}" fill-opacity="0.65" stroke="${C.surface}" stroke-width="1.5"/>`;
  for (const [al, dr] of D.scatter) s += `<circle cx="${X(al).toFixed(1)}" cy="${Y(dr).toFixed(1)}" r="11" fill="transparent" data-tip="AL ${f2(al)} mm — desviación ${f2(dr)} D"/>`;
  return s + '</svg>';
}

function barrettChart() {
  const groups = D.barrett.labels;
  const series = [
    { name: 'Réplica (este trabajo)', vals: D.barrett.replica, col: C.s1 },
    { name: 'Barrett Universal II', vals: D.barrett.barrett, col: C.s2 },
  ];
  const bw = 24, gap = 2, gpad = 70, plotH = 190, top = 24;
  const gW = series.length * (bw + gap) - gap;
  const W = 70 + groups.length * (gW + gpad), H = plotH + top + 52;
  const mx = 0.7;
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Desviación frente a EVO: réplica vs Barrett">`;
  for (const g of [0, 0.2, 0.4, 0.6]) {
    const y = top + plotH - g / mx * plotH;
    s += `<line x1="56" y1="${y}" x2="${W - 10}" y2="${y}" stroke="${g === 0 ? C.axis : C.grid}" stroke-width="1"/>`;
    s += `<text x="50" y="${y + 4}" text-anchor="end" font-size="10.5" fill="${C.muted}" style="font-variant-numeric:tabular-nums">${f1(g)}</text>`;
  }
  groups.forEach((gname, gi) => {
    const x0 = 70 + gi * (gW + gpad);
    series.forEach((se, si) => {
      const v = se.vals[gi], h = Math.max(3, v / mx * plotH);
      const x = x0 + si * (bw + gap), y = top + plotH - h;
      s += `<rect x="${x}" y="${y}" width="${bw}" height="${h}" fill="${se.col}" data-tip="${esc(gname)} — ${esc(se.name)}: ${f2(v)} D"/>`;
      s += `<rect x="${x}" y="${y}" width="${bw}" height="4" rx="2" fill="${se.col}"/>`;
      s += `<text x="${x + bw / 2}" y="${y - 5}" text-anchor="middle" font-size="11" font-weight="600" fill="${C.ink}" style="font-variant-numeric:tabular-nums">${f2(v)}</text>`;
    });
    s += `<text x="${x0 + gW / 2}" y="${top + plotH + 18}" text-anchor="middle" font-size="11.5" fill="${C.ink}">${esc(gname)}</text>`;
  });
  return s + '</svg>';
}

function modelRows() {
  const bar = (v, col) =>
    `<span class="mb"><span class="mbf" style="width:${Math.max(2, v)}%;background:${col}"></span></span>` +
    `<span class="mv">${f1(v)}%</span>`;
  return D.perModel.map(m => `<tr>
    <td class="tl">${esc(m.name)}</td><td>${m.n}</td>
    <td class="bc">${bar(m.iol, C.s1)}</td><td class="bc">${bar(m.cyl, C.s2)}</td><td class="bc">${bar(m.ax1, C.s3)}</td>
    <td>${f3(m.mRef)}</td></tr>`).join('\n');
}

const kpi = (label, value, sub) =>
  `<div class="tile"><div class="tl2">${label}</div><div class="tv">${value}</div><div class="ts">${sub}</div></div>`;

const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Réplica del EVO Toric v2.0 por caracterización de caja negra — informe científico</title>
<style>
  :root{color-scheme:light}
  *{box-sizing:border-box}
  body{margin:0;background:${C.page};color:${C.ink};font-family:Georgia,"Times New Roman",serif;line-height:1.62;font-size:15px}
  .shell{max-width:960px;margin:0 auto;padding:34px 22px 70px}
  .doc{background:${C.surface};border:1px solid ${C.line};border-radius:12px;padding:clamp(24px,4vw,52px)}
  h1{color:${C.head};font-size:clamp(21px,3.3vw,29px);line-height:1.25;margin:0 0 6px;font-family:"Segoe UI",system-ui,sans-serif}
  .meta{color:${C.sec};font-size:13px;font-family:"Segoe UI",system-ui,sans-serif;margin:0 0 4px}
  h2{color:${C.head};font-size:19px;margin:38px 0 10px;border-bottom:2px solid #e4e9f2;padding-bottom:6px}
  h3{color:${C.head};font-size:15.5px;margin:24px 0 8px}
  p{margin:9px 0}
  .abstract{background:#f4f7fb;border:1px solid #dde6f2;border-radius:8px;padding:16px 20px;margin:20px 0;font-size:14.5px}
  .abstract b{color:${C.head}}
  .warn{background:#fff8ec;border:1px solid #f0d9b5;border-radius:8px;padding:12px 16px;font-size:13px;color:#7a3b00;font-family:"Segoe UI",system-ui,sans-serif}
  figure{margin:18px 0;padding:14px 14px 8px;background:#fcfcfc;border:1px solid ${C.grid};border-radius:8px}
  figcaption{font-size:12.5px;color:${C.sec};font-family:"Segoe UI",system-ui,sans-serif;margin-top:8px;line-height:1.5}
  figcaption b{color:${C.ink}}
  svg{width:100%;height:auto;display:block}
  .eq{font-family:Georgia,serif;font-style:italic;background:#f7f9fc;border-left:3px solid ${C.head};
      padding:10px 16px;margin:12px 0;overflow-x:auto;white-space:nowrap;font-size:15px}
  .eq sub,.eq sup{font-style:normal;font-size:11px}
  table{border-collapse:collapse;width:100%;font-size:12.8px;font-family:"Segoe UI",system-ui,sans-serif;margin:10px 0}
  th{color:${C.sec};font-weight:600;text-align:right;padding:7px 8px;border-bottom:1px solid ${C.axis};font-size:11.5px}
  th.tl,td.tl{text-align:left}
  td{padding:6px 8px;border-bottom:1px solid ${C.grid};text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
  tr:hover td{background:#f2f6fc}
  .tabcap{font-size:12.5px;color:${C.sec};font-family:"Segoe UI",system-ui,sans-serif;margin:4px 0 2px}
  .tabcap b{color:${C.ink}}
  .tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:16px 0}
  .tile{background:#fbfcfe;border:1px solid ${C.line};border-radius:10px;padding:12px 14px;font-family:"Segoe UI",system-ui,sans-serif}
  .tl2{font-size:11.5px;color:${C.sec}}
  .tv{font-size:26px;font-weight:600;color:${C.head};margin:2px 0}
  .ts{font-size:11px;color:${C.muted}}
  .legend{display:flex;gap:18px;flex-wrap:wrap;font-size:12px;color:${C.sec};font-family:"Segoe UI",system-ui,sans-serif;margin:2px 0 8px}
  .legend span{display:inline-flex;align-items:center;gap:6px}
  .sw{width:11px;height:11px;border-radius:3px;display:inline-block}
  .mb{display:inline-block;width:58px;height:9px;background:#edf0f4;border-radius:4px;overflow:hidden;vertical-align:middle;margin-right:7px}
  .mbf{display:block;height:100%;border-radius:4px}
  .mv{display:inline-block;min-width:44px;text-align:right}
  .bc{min-width:120px}
  .note{background:#f6f8fa;border-left:3px solid ${C.axis};padding:8px 14px;font-size:13px;color:${C.sec};margin:10px 0}
  .grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:14px}
  ol.deriv{padding-left:20px}
  ol.deriv>li{margin:10px 0}
  code{font-family:Consolas,monospace;font-size:13px;background:#f4f5f7;padding:1px 5px;border-radius:4px}
  #tip{position:fixed;pointer-events:none;background:${C.ink};color:#fff;font-size:12px;font-family:"Segoe UI",system-ui,sans-serif;
       padding:6px 9px;border-radius:6px;opacity:0;transition:opacity .12s;max-width:300px;z-index:9}
  .toc{font-family:"Segoe UI",system-ui,sans-serif;font-size:13px;columns:2;column-gap:34px;margin:14px 0 4px}
  .toc a{color:${C.head};text-decoration:none;display:block;padding:2px 0}
  .toc a:hover{text-decoration:underline}
  @media print{.doc{border:none}body{background:#fff}}
</style>
</head>
<body>
<div class="shell"><div class="doc">

<h1>Réplica de la calculadora EVO Toric v2.0 mediante caracterización de caja negra:
derivación del algoritmo, formulación y validación frente a 1.206 casos</h1>
<p class="meta"><b>Versión:</b> 1.0 &nbsp;·&nbsp; <b>Fecha:</b> 09/08/2026 &nbsp;·&nbsp; <b>Autor:</b> G. Vila (elaboración asistida por IA)</p>
<p class="meta"><b>Material asociado:</b> calculadora-torica.html · engine.js · dashboard.html · INFORME.md · COMPARATIVA-CALCULADORAS.md</p>

<div class="warn"><b>Aviso.</b> Trabajo independiente, no oficial y sin relación con los autores de EVO ni con
ningún fabricante. La réplica no es un producto sanitario y no sustituye a la calculadora original en la
decisión quirúrgica. Los datos clínicos citados están anonimizados.</div>

<div class="abstract">
<b>Resumen.</b> La fórmula EVO 2.0 (Emmetropia Verifying Optical) es propietaria y se ejecuta en el servidor
de su web, por lo que no puede copiarse: solo observarse. Este trabajo la caracteriza como <i>caja negra</i>
mediante <b>8.311 consultas sistemáticas</b> a la calculadora oficial, deduce su estructura interna
(una fórmula de vergencia paraxial con posición efectiva de lente tabulable, un modelo de córnea posterior
casi constante y trazado por meridianos), la formula como un algoritmo explícito de nueve pasos y lo valida
frente a <b>1.206 casos reservados</b> comparados uno a uno con la web. Resultado: potencia esférica idéntica
en el <b>${f1(G.iol)}%</b> de los casos (error mediano de refracción ${f2(G.medTab)} D), eje de implantación a ≤1° en el
<b>${f1(G.ax1)}%</b> y cilindro tórico idéntico en el <b>${f1(G.cyl)}%</b>, con las discrepancias concentradas en empates
técnicos entre escalones contiguos del catálogo. Se documentan además los techos estructurales que impiden
la igualdad absoluta y la comparación con Barrett Universal II y SRK/T sobre dos casos clínicos reales.
</div>

<div class="toc">
<a href="#s1">1 · Planteamiento del problema</a>
<a href="#s2">2 · Métodos: cómo se dedujo el algoritmo</a>
<a href="#s3">3 · El algoritmo</a>
<a href="#s4">4 · Resultados de validación</a>
<a href="#s5">5 · Comparativa con otras fórmulas</a>
<a href="#s6">6 · Limitaciones y techos estructurales</a>
<a href="#s7">7 · Reproducibilidad</a>
</div>

<h2 id="s1">1 · Planteamiento del problema</h2>
<p>La calculadora EVO Toric v2.0 se sirve como página ASP.NET: el navegador envía los datos y recibe el
resultado ya calculado. La inspección del cliente confirmó que <b>no existe código de cálculo descargable</b>
(los únicos scripts son analítica y el mecanismo de <i>postback</i>). La fórmula, además, no está publicada.
El objetivo fue construir una calculadora offline que reproduzca sus resultados, y conocer con precisión
medida <i>cuánto</i> los reproduce.</p>
<p>El principio de trabajo: tratar la web como una función matemática desconocida, diseñar experimentos que
aíslen cada variable, y no aceptar ninguna hipótesis que no reproduzca las respuestas reales al nivel del
redondeo que muestra la propia web (0.01 D).</p>

<h2 id="s2">2 · Métodos: cómo se dedujo el algoritmo</h2>

<h3>2.1 · La firma matemática: una transformada de Möbius</h3>
<p>Para un mismo ojo, se barrió la refracción diana para obtener 25 pares (potencia, refracción). Toda
fórmula de vergencia paraxial produce necesariamente una relación de Möbius entre ambas magnitudes
— tres parámetros libres. El ajuste reprodujo los 25 puntos con un rms de <b>0.004 D</b>, el suelo del
redondeo; repetido sobre 105 puntos de 7 constantes A, idéntico resultado. Conclusión: <b>EVO es una fórmula
de vergencia</b>, y cada ojo queda descrito por solo tres números.</p>

<figure>${figMobius()}
<figcaption><b>Figura 1.</b> Las 25 respuestas reales de EVO para un ojo (puntos) y la transformada de Möbius
de 3 parámetros que las reproduce (línea; rms 0.004 D). Ojo: AL 23.50, K 43/45, ACD 3.20, constante A 119.3.</figcaption></figure>

<h3>2.2 · Reducción de variables: qué entra por qué canal</h3>
<p>Se probó, con criterio de <b>igualdad exacta de tablas</b> (no ajuste estadístico), cómo entra cada variable:</p>
<table>
<tr><th class="tl">Ensayo</th><th class="tl">Hallazgo</th><th class="tl">Evidencia</th></tr>
<tr><td class="tl">ACD ↔ constante A</td><td class="tl">Canal único: <b>0.8003 unidades de A por mm</b></td><td class="tl">Diferencia 0.0000 D en 15 puntos × 6 ojos</td></tr>
<tr><td class="tl">Grosor de cristalino</td><td class="tl">+0.2850 a la A y −0.0565 a la AL, por mm</td><td class="tl">Desviación máx. 0.02 D</td></tr>
<tr><td class="tl">Paquimetría (CCT)</td><td class="tl">Efecto casi nulo (−0.00008 A/µm)</td><td class="tl">0.05 mm de ELP en todo el rango</td></tr>
<tr><td class="tl">Queratometría</td><td class="tl"><b>Media aritmética</b> (K1+K2)/2, no media de radios</td><td class="tl">Pares 40/47 vs 43.5/43.5: diferencia 0.01 D</td></tr>
<tr><td class="tl">Índice queratométrico</td><td class="tl">Factores medidos 1.0175 (1.3315) y 1.0160 (1.332)</td><td class="tl">El factor teórico por radios deja 0.03 D de sesgo</td></tr>
<tr><td class="tl">Campos vacíos</td><td class="tl">LT→4.50 mm, CCT→550 µm</td><td class="tl">Coincidencia 0.01 D</td></tr>
</table>

<h3>2.3 · Tabulación del ojo: rejilla de 936 nodos</h3>
<p>Reducidas las entradas a tres ejes (AL efectiva, K media, A efectiva), se muestreó la rejilla
AL 20–32 mm × K 34–50 D × 8 constantes A y en cada nodo se despejaron los tres parámetros del ojo,
re-expresados como magnitudes físicas: <b>posición efectiva de lente</b> (ELP), pendiente <i>s₀</i> y
curvatura <i>κ</i>. Sobre los 693 nodos clínicamente válidos, la reconstrucción frente a las tablas reales
de EVO da un error medio de <b>0.0072 D</b> (máx. 0.0196). El error de interpolación entre nodos, medido
eliminando columnas enteras, queda en ~0.002 D. Los nodos donde la potencia necesaria cae por debajo de
~5 D (ojo largo + córnea curva) no siguen el modelo y quedan enmascarados: la calculadora rechaza esa zona.</p>

<h3>2.4 · El motor tórico: tres descubrimientos</h3>
<ol class="deriv">
<li><b>El eje se calcula exacto y se redondea solo al mostrar.</b> Ajustar con el eje entero duplica el error
(rms 0.024 → 0.013 al usar el eje exacto).</li>
<li><b>La potencia etiquetada es el equivalente esférico</b>: el cilindro se reparte ±c/2 entre los dos
meridianos (rms 0.025 → 0.017).</li>
<li><b>EVO ejecuta su fórmula completa en cada meridiano principal.</b> Se contrastaron cuatro variantes;
solo el trazado completo por meridiano hace que el astigmatismo corneal implícito sea constante entre ojos
(dispersión 1.9% frente a 6.5% con la K media). El residual que muestra EVO es, por tanto, astigmatismo
<i>en plano de gafas</i>, dependiente del ojo.</li>
</ol>
<p>Con esa estructura, el vector de córnea posterior implícito resultó <b>casi constante</b>:
+0.58 D contra la regla, sin componente oblicua (media −0.0003 D sobre 4.829 observaciones), con dependencias
suaves de K y AL que se ajustaron sobre 4.522 casos y se verificaron en 2.261 reservados sin degradación
(rms 0.071 vs 0.073). La extensión a ojos largos y córneas planas se hizo con términos <i>hinge</i> que son
exactamente cero dentro del dominio original.</p>

<h3>2.5 · Las reglas de decisión, medidas</h3>
<table>
<tr><th class="tl">Regla</th><th class="tl">Formulación ganadora</th><th>Acierto</th><th>Contrastada sobre</th></tr>
<tr><td class="tl">Potencia esférica</td><td class="tl">Refracción prevista más próxima a la diana (rejilla 0.5 D)</td><td>94.0%</td><td>4.811 tablas</td></tr>
<tr><td class="tl">Cilindro tórico</td><td class="tl">Cruce por cero del residual <b>+ 0.10 D</b> → más próximo del catálogo</td><td>96.2%</td><td>4.308 casos</td></tr>
<tr><td class="tl">Eje de implantación</td><td class="tl">Meridiano exacto del astigmatismo total</td><td>±0.07° medio</td><td>12.029 filas</td></tr>
<tr><td class="tl">Zeiss 709/939 (a medida)</td><td class="tl">Rejilla EE = plana(0.5 D) + cil/2 → desplazamiento 0.25 D</td><td>81% ¹</td><td>184 casos</td></tr>
</table>
<p class="note">¹ El 19% restante presenta una histéresis alrededor de la emetropía, medida con barridos de
0.05 D pero no reducible a ninguna regla observable desde fuera; es uno de los techos estructurales (§6).</p>

<h3>2.6 · Corrección por modelo de LIO</h3>
<p>El modelo de lente desplaza el resultado esférico solo en potencias altas, y el desplazamiento depende
<b>únicamente de la potencia</b> (verificado con tres series de córneas distintas): familia J&amp;J hasta
−0.86 D y familia B&amp;L hasta +1.25 D a 40 D de potencia, nulos por debajo de ~24 D. Es el comportamiento
esperable si EVO modela el grosor real de cada lente. Se tabuló por modelo y potencia.</p>

<h2 id="s3">3 · El algoritmo</h2>
<figure>${figPipeline()}
<figcaption><b>Figura 2.</b> Estructura del algoritmo. La cadena superior produce la potencia esférica; la
inferior, el cilindro y su eje. Ambas comparten la misma curva de vergencia del ojo.</figcaption></figure>

<h3>Paso 1–2 · Normalización de entradas</h3>
<div class="eq">K<sub>int</sub> = K · f<sub>índice</sub> &nbsp;&nbsp; (f = 1 · 1.0175 · 1.0160 según índice) &nbsp;&nbsp;·&nbsp;&nbsp; K<sub>m</sub> = (K1 + K2) / 2</div>
<div class="eq">A<sub>ef</sub> = A + 0.8003·(ACD − 3.2) + 0.2850·(LT − 4.5) − 0.000081·(CCT − 550)</div>
<div class="eq">AL<sub>ef</sub> = AL − 0.0565·(LT − 4.5) − 0.000155·(CCT − 550)</div>
<p><b>Interpretación:</b> todo lo que EVO hace con ACD, cristalino y paquimetría equivale a mover la constante A
y la longitud axial. Una cámara anterior 1 mm más profunda actúa exactamente como una constante A 0.8 mayor.</p>

<h3>Paso 3 · La curva de vergencia del ojo</h3>
<p>De las tablas muestreadas se interpolan (bicúbica en AL×K, Lagrange en A) tres magnitudes: ELP, s₀ y κ.
Con ellas se construye la potencia de emetropía y la curva completa:</p>
<div class="eq">P₀ = 1336 / (AL<sub>ef</sub> − ELP) − 1336 / (1336 / K<sub>c</sub> − ELP) , &nbsp; K<sub>c</sub> = 331.5 / r , &nbsp; r = 337.5 / K<sub>m</sub></div>
<div class="eq">R(P) = (a·P + b) / (P + d) &nbsp;&nbsp; con &nbsp; m = −2·s₀/κ , &nbsp; d = m − P₀ , &nbsp; a = s₀·m , &nbsp; b = −a·P₀</div>
<p><b>Interpretación:</b> R(P) es "qué refracción quedará con una lente de potencia P". P₀ es la potencia que
deja el ojo emétrope; s₀, cuánto cambia la refracción por dioptría de lente (~0.6–0.7); κ, cómo se curva esa
relación. Las tres salen de medir a EVO, no de teoría.</p>

<h3>Paso 4–5 · Corrección por lente y elección esférica</h3>
<div class="eq">R<sub>mod</sub>(P) = R(P) + off(modelo, P) &nbsp;&nbsp;·&nbsp;&nbsp; LIO = arg mín |R<sub>mod</sub>(P) − diana| , P ∈ rejilla 0.5 D</div>
<p>Para Zeiss 709M/MP y 939M/MP la rejilla del equivalente esférico es plana + cil/2 (desplazada 0.25 D si el
cilindro es múltiplo impar de 0.5). La tabla muestra 5 potencias en pasos de 0.5 alrededor de la elegida.</p>

<h3>Paso 6–7 · Astigmatismo corneal total</h3>
<p>El astigmatismo se opera como vector en espacio de doble ángulo (magnitud, 2·eje). Al anterior medido se
le suma la córnea posterior <i>predicha</i> y después el SIA:</p>
<div class="eq">TCA = 0.9801 · ANT + [P<sub>post</sub>, 0] + SIA<sub>vec</sub></div>
<div class="eq">P<sub>post</sub> = 0.6062 − 0.0313·(K<sub>m</sub> − 44) − 0.0630·(AL<sub>ef</sub> − 23.5) + términos hinge (solo AL&gt;27 o K<sub>m</sub>&lt;38)</div>
<p><b>Interpretación:</b> la córnea posterior aporta ~0.6 D de astigmatismo contra la regla casi constante
— por eso EVO recomienda menos cilindro del que sugiere la queratometría en astigmatismos a favor de la regla,
y más en los contra la regla. El SIA se suma como vector en el meridiano perpendicular a la incisión,
<i>después</i> de la córnea posterior (verificado: error máx. 0.013 D en 20 combinaciones).</p>

<h3>Paso 8 · Trazado por meridianos</h3>
<p>Se construyen dos curvas de vergencia con la <b>misma ELP</b> pero córneas K<sub>m</sub> ± TCA/2, y la lente
tórica reparte su cilindro c entre ambas:</p>
<div class="eq">residual(c) = R<sub>curvo</sub>(P − c/2) − R<sub>plano</sub>(P + c/2) &nbsp;&nbsp;·&nbsp;&nbsp; EE previsto = ½·[R<sub>curvo</sub>(P − c/2) + R<sub>plano</sub>(P + c/2)]</div>
<p><b>Interpretación:</b> esto explica que el mismo astigmatismo corneal produzca residuales distintos según
el ojo: la conversión córnea→gafas pasa por la óptica completa de cada meridiano, no por una razón fija.</p>

<h3>Paso 9 · Elección de cilindro y eje</h3>
<div class="eq">c* = cruce por cero del residual + 0.10 &nbsp;&nbsp;·&nbsp;&nbsp; cilindro = más próximo a c* en el catálogo del modelo &nbsp;&nbsp;·&nbsp;&nbsp; eje = meridiano exacto de TCA</div>
<p>El sesgo de +0.10 D (EVO prefiere sobrecorregir ligeramente) se midió contrastando cuatro reglas
candidatas; sube el acierto del 90.6% al 96.2%. Se muestran tres cilindros consecutivos del catálogo del
modelo (29 modelos, catálogos completos enumerados contra la web).</p>

<h2 id="s4">4 · Resultados de validación</h2>
<p>Todos los casos son aleatorios con semilla fija, generados <i>después</i> de calibrar el motor y comparados
uno a uno contra la web real. Ningún caso de validación participó en ningún ajuste.</p>

<div class="tiles">
${kpi('Consultas reales a EVO', D.totalQueries.toLocaleString('es-ES'), 'peticiones distintas cacheadas')}
${kpi('Casos comparados', D.totalRows.toLocaleString('es-ES'), '7 campañas independientes')}
${kpi('Potencia idéntica', f1(G.iol) + '%', 'misma LIO recomendada')}
${kpi('Cilindro idéntico', f1(G.cyl) + '%', 'mismo escalón del catálogo')}
${kpi('Eje ≤ 1°', f1(G.ax1) + '%', 'eje de implantación')}
${kpi('Error mediano', f2(G.medTab) + ' D', 'refracción, vs 0.25 D clínico')}
</div>

<figure>${tiersChart()}
<figcaption><b>Figura 3.</b> Concordancia según el nivel de exigencia, sobre los ${D.totalRows.toLocaleString('es-ES')} casos.
La igualdad de todos los decimales (~0%) es inalcanzable por construcción: con ~13 números redondeados a
0.01 D por caso, basta una diferencia real de 0.005 D en uno para romperla.</figcaption></figure>

<figure>
<div class="legend"><span><span class="sw" style="background:${C.s1}"></span>Potencia igual</span>
<span><span class="sw" style="background:${C.s2}"></span>Cilindro igual</span>
<span><span class="sw" style="background:${C.s3}"></span>Eje ≤1°</span></div>
${scenarioChart()}
<figcaption><b>Figura 4.</b> Concordancia exacta por escenario de validación. La miopía magna (dominio añadido
tras el caso clínico 1) es el escenario con mejor cilindro (93.8%).</figcaption></figure>

<p class="tabcap"><b>Tabla 1.</b> Variación por modelo de LIO frente a EVO. Las correcciones esféricas por
familia ya están dentro del motor; la columna |Δref| es la desviación media absoluta de la refracción prevista.</p>
<div style="overflow-x:auto">
<table>
<tr><th class="tl">Modelo</th><th>n</th><th>Potencia igual</th><th>Cilindro igual</th><th>Eje ≤1°</th><th>|Δref| media (D)</th></tr>
${modelRows()}
</table>
</div>
<p class="note">Zeiss 709M/MP y 939M/MP: lentes bitóricas a medida con rejilla de potencia acoplada al
cilindro (§2.5); su coincidencia literal de potencia queda en ~60% con tablas que difieren ≤0.05 D.
«Anterior» y «Bitoric» son modos genéricos de EVO, no lentes comerciales.</p>

<figure>
<div class="grid2">
<div><div class="tabcap"><b>a)</b> Error máx. de la tabla de refracciones (D)</div>${histChart(D.hist.tab, 'Error de tabla')}</div>
<div><div class="tabcap"><b>b)</b> Desviación del eje de implantación</div>${histChart(D.hist.ax, 'Desviación de eje')}</div>
<div><div class="tabcap"><b>c)</b> Desviación del cilindro residual (D)</div>${histChart(D.hist.resi, 'Desviación residual')}</div>
</div>
<figcaption><b>Figura 5.</b> Distribución del error frente a EVO. Referencias: el redondeo de la propia web
es 0.01 D; el mínimo clínicamente relevante, 0.25 D.</figcaption></figure>

<figure>${scatterChart()}
<figcaption><b>Figura 6.</b> Desviación de la refracción prevista según la longitud axial
(muestra de ${D.scatter.length} casos). No hay deriva sistemática con el tamaño del ojo; los puntos por encima
de 0.25 D son aislados y corresponden a los empates de cilindro descritos en §6.</figcaption></figure>

<h2 id="s5">5 · Comparativa con otras fórmulas</h2>
<p>La réplica no es una fórmula nueva: es el eco de EVO. Las demás calculadoras son algoritmos independientes
que <i>legítimamente</i> discrepan entre sí — más cuanto más extremo es el ojo. Dos casos reales lo ilustran.</p>

<h3>5.1 · Caso clínico 1 — miopía magna bilateral (Anterion; AL 29.39 / 31.10 mm)</h3>
<figure>
<div class="legend"><span><span class="sw" style="background:${C.s1}"></span>Réplica (este trabajo)</span>
<span><span class="sw" style="background:${C.s2}"></span>Barrett Universal II (impreso del biómetro)</span></div>
${barrettChart()}
<figcaption><b>Figura 7.</b> Desviación media de la refracción prevista respecto a EVO, a igual potencia.
La réplica coincide con EVO a 0.01 D y en las 4 recomendaciones; Barrett difiere hasta 0.63 D y eligió otra
potencia en los dos ojos (½–1 escalón más). No es un error de Barrett: es otra fórmula con otra óptica.</figcaption></figure>

<p class="tabcap"><b>Tabla 2.</b> Recomendaciones en el caso 1 (lentes B&amp;L, diana 0 D).</p>
<table>
<tr><th class="tl">Ojo · lente</th><th class="tl">EVO</th><th class="tl">Réplica</th><th class="tl">Barrett UII</th></tr>
<tr><td class="tl">OD · Aspire (A 119.10)</td><td class="tl">14.5 · cil 3.50 @ 7°</td><td class="tl"><b>14.5 · cil 3.50 @ 7°</b></td><td class="tl">15.0 (esférico)</td></tr>
<tr><td class="tl">OD · Envy (A 119.28)</td><td class="tl">14.5 · cil 3.50 @ 7°</td><td class="tl"><b>14.5 · cil 3.50 @ 7°</b></td><td class="tl">15.0 (esférico)</td></tr>
<tr><td class="tl">OS · Aspire (A 119.10)</td><td class="tl">12.0 · cil 0.90 @ 167°</td><td class="tl"><b>12.0 · cil 0.90 @ 167°</b></td><td class="tl">12.5 (esférico)</td></tr>
<tr><td class="tl">OS · Envy (A 119.28)</td><td class="tl">12.0 · cil 0.90 @ 167°</td><td class="tl"><b>12.0 · cil 0.90 @ 167°</b></td><td class="tl">13.0 (esférico)</td></tr>
</table>

<h3>5.2 · Caso clínico 2 — astigmatismo elevado (IOLMaster V7.7; AL 22.53 / 22.57 mm)</h3>
<p>Ejecutado por el propio usuario en la web de EVO (B&amp;L Aspire, A 119.10, SIA 0.25 @ 135°) y replicado
aquí con configuración idéntica. El impreso del biómetro aporta además la columna SRK/T:</p>
<p class="tabcap"><b>Tabla 3.</b> Caso 2: decisión completa por calculadora.</p>
<table>
<tr><th class="tl">Ojo</th><th class="tl">EVO (web, pantallazo)</th><th class="tl">Réplica</th><th class="tl">SRK/T (impreso, A 119.10)</th></tr>
<tr><td class="tl">OD (K 42.03/45.55, cil 3.52 D)</td><td class="tl">25.0 · cil 4.25 @ 82°</td><td class="tl"><b>25.0 · cil 4.25</b> @ 83°</td><td class="tl">24.5 (esférico)</td></tr>
<tr><td class="tl">OS (K 43.10/45.24, cil 2.14 D)</td><td class="tl">24.0 · cil 2.00 @ 89°</td><td class="tl"><b>24.0 · cil 2.00 @ 89°</b></td><td class="tl">24.0 (esférico)</td></tr>
</table>
<p>Refracciones en la fila recomendada a ±0.01–0.02 D de la web; residuales a ≤0.11 D. SRK/T (1990) difiere
de EVO medio escalón en el OD — de nuevo, discrepancia entre fórmulas, no error. La calculadora Kane queda
pendiente de introducción manual (no es consultable por script; véase COMPARATIVA-CALCULADORAS.md §7).</p>

<h2 id="s6">6 · Limitaciones y techos estructurales</h2>
<ol class="deriv">
<li><b>La igualdad literal absoluta es inalcanzable</b> (Figura 3): la fórmula es propietaria y cada caso
muestra ~13 números redondeados.</li>
<li><b>La propia regla de recomendación de EVO solo se auto-reproduce al 96.2%</b>: existe un ~4% de casos
donde su elección de cilindro no se explica ni con sus propios residuales publicados. Ese margen es
irrecuperable desde fuera y domina el 20% de desacuerdo de cilindro — siempre en escalones contiguos con
residuales casi empatados.</li>
<li><b>Zeiss 709/939</b>: histéresis de selección no observable (§2.5); potencia literal ~60%, tablas ≤0.05 D.</li>
<li><b>Dominio validado</b>: AL 20–32 mm, K media 34–50 D, constante A 110–125, ojo virgen. Post-LASIK/PRK/QR,
biómetro Argos y córnea posterior medida <b>no</b> están cubiertos; fuera de dominio el motor rechaza el
cálculo en lugar de extrapolar.</li>
<li><b>Dependencia de versión</b>: la réplica imita a EVO v2.0 tal y como respondía en las fechas de muestreo;
un cambio en su servidor no se reflejaría. El banco de pruebas permite re-validar bajo demanda.</li>
</ol>

<h2 id="s7">7 · Reproducibilidad</h2>
<p>Las 8.311 respuestas de EVO están cacheadas; todos los ajustes y validaciones se regeneran de la caché sin
tocar la web. Los casos de validación usan generadores con semilla fija (documentadas en INFORME.md), por lo
que cada cifra de este documento es reproducible exactamente. El motor (<code>engine.js</code>) se genera
automáticamente desde las tablas medidas; la calculadora (<code>calculadora-torica.html</code>) y el panel
operativo (<code>dashboard.html</code>) lo consumen sin modificarlo.</p>

<p class="meta" style="margin-top:30px;border-top:1px solid ${C.grid};padding-top:12px">
Documento de trabajo interno · ${D.fecha} · Los datos de pacientes citados están anonimizados ·
No es un producto sanitario ni sustituye a la calculadora oficial.</p>

</div></div>
<div id="tip"></div>
<script>
(function(){
  var tip=document.getElementById('tip');
  document.addEventListener('mousemove',function(e){
    var t=e.target;
    var d=t&&t.getAttribute&&t.getAttribute('data-tip');
    if(d){tip.textContent=d;tip.style.opacity=1;
      var x=Math.min(e.clientX+14,window.innerWidth-tip.offsetWidth-8);
      var y=Math.min(e.clientY+14,window.innerHeight-tip.offsetHeight-8);
      tip.style.left=x+'px';tip.style.top=y+'px';}
    else tip.style.opacity=0;
  });
})();
</script>
</body>
</html>`;

fs.writeFileSync('C:/Users/Guille/Desktop/Prueba/informe-cientifico.html', html);
fs.writeFileSync('informe-cientifico.html', html);
console.log('wrote informe-cientifico.html (' + (html.length / 1024).toFixed(0) + ' kB)');
