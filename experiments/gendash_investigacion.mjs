/**
 * gendash_investigacion.mjs — dashboard científico del benchmark (Sprint 11).
 *
 * Regenera `dashboard-investigacion.html` leyendo EXCLUSIVAMENTE los results.json
 * de experiments/ y el baseline congelado (criterio de aceptación: cero datos
 * incrustados a mano). Sin afirmaciones de superioridad clínica.
 * RESEARCH USE ONLY.
 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const load = p => JSON.parse(fs.readFileSync(join(HERE, p), 'utf8'));

const E1 = load('exp001_sensibilidad_elp/results.json');
const E2 = load('exp002_divergencia_paraxial_vs_evo/results.json');
const E3 = load('exp003_paraxial_vs_raytrace/results.json');
const E4 = load('exp004_montecarlo/results.json');
const E5 = load('exp005_torico_fisico_vs_evo/results.json');
const BASE = JSON.parse(fs.readFileSync(join(ROOT, 'legacy/evo_replica/baseline/baseline_metrics.json'), 'utf8'));

const C = {
  s1: '#2a78d6', s2: '#eb6834', s3: '#1baf7a', red: '#e34948',
  head: '#153F74', sec: '#6F6F6F', ink: '#1a1a1a', muted: '#898781',
  grid: '#e1e0d9', axis: '#c3c2b7', surface: '#ffffff', page: '#f7f8fa', line: '#d6d6d6',
};
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const f1 = x => (+x).toFixed(1), f2 = x => (+x).toFixed(2);

// ---------- helpers SVG (marcas: barras ≤24px, cap redondeado, grid hairline) ----------
function hbar({ rows, max, unit, color = C.s1, W = 840, labelW = 190 }) {
  const rowH = 34, H = rows.length * rowH + 14;
  const barMax = W - labelW - 120;
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img">`;
  rows.forEach((r, i) => {
    const y = i * rowH + 6, w = Math.max(2, Math.abs(r.v) / max * barMax);
    s += `<text x="${labelW - 8}" y="${y + 16}" text-anchor="end" font-size="12" fill="${C.ink}">${esc(r.label)}</text>`;
    s += `<rect x="${labelW}" y="${y}" width="${w}" height="22" fill="${r.color ?? color}"/>`;
    s += `<rect x="${labelW + w - 4}" y="${y}" width="4" height="22" rx="2" fill="${r.color ?? color}"/>`;
    s += `<text x="${labelW + w + 8}" y="${y + 16}" font-size="12" font-weight="600" fill="${C.ink}" style="font-variant-numeric:tabular-nums">${r.txt ?? (f2(r.v) + ' ' + unit)}</text>`;
  });
  return s + '</svg>';
}

function intervalChart(rows) { // exp004: p5–p95 + p50
  const W = 840, labelW = 210, rowH = 40, H = rows.length * rowH + 40;
  const lo = Math.min(...rows.map(r => r.p5)), hi = Math.max(...rows.map(r => r.p95));
  const span = hi - lo || 1;
  const X = v => labelW + (v - lo) / span * (W - labelW - 40);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img">`;
  const x0 = X(0);
  s += `<line x1="${x0}" y1="6" x2="${x0}" y2="${H - 26}" stroke="${C.axis}" stroke-width="1"/>`;
  s += `<text x="${x0}" y="${H - 10}" text-anchor="middle" font-size="10.5" fill="${C.muted}">0 D</text>`;
  rows.forEach((r, i) => {
    const y = i * rowH + 22;
    s += `<text x="${labelW - 8}" y="${y + 4}" text-anchor="end" font-size="12" fill="${C.ink}">${esc(r.label)}</text>`;
    s += `<line x1="${X(r.p5)}" y1="${y}" x2="${X(r.p95)}" y2="${y}" stroke="${C.s1}" stroke-width="2" stroke-linecap="round"/>`;
    for (const p of [r.p5, r.p95]) s += `<line x1="${X(p)}" y1="${y - 5}" x2="${X(p)}" y2="${y + 5}" stroke="${C.s1}" stroke-width="2"/>`;
    s += `<circle cx="${X(r.p50)}" cy="${y}" r="4.5" fill="${C.s2}" stroke="${C.surface}" stroke-width="2"/>`;
    s += `<text x="${X(r.p95) + 10}" y="${y + 4}" font-size="11" fill="${C.sec}" style="font-variant-numeric:tabular-nums">${r.txt}</text>`;
  });
  return s + '</svg>';
}

function groupedBars({ groups, series, unit, plotH = 190, valueFmt = f2 }) {
  const bw = 22, gap = 2, gpad = 34, top = 22;
  const gW = series.length * (bw + gap) - gap;
  const W = 60 + groups.length * (gW + gpad), H = plotH + top + 54;
  const maxV = Math.max(...groups.flatMap(g => series.map(s => Math.abs(g.values[s.key] ?? 0)))) || 1;
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img">`;
  s += `<line x1="52" y1="${top + plotH}" x2="${W - 8}" y2="${top + plotH}" stroke="${C.axis}" stroke-width="1"/>`;
  groups.forEach((g, gi) => {
    const x0 = 60 + gi * (gW + gpad);
    series.forEach((se, si) => {
      const v = g.values[se.key] ?? 0;
      const h = Math.max(2, Math.abs(v) / maxV * (plotH - 18));
      const x = x0 + si * (bw + gap), y = top + plotH - h;
      s += `<rect x="${x}" y="${y}" width="${bw}" height="${h}" fill="${se.col}"/>`;
      s += `<rect x="${x}" y="${y}" width="${bw}" height="4" rx="2" fill="${se.col}"/>`;
      s += `<text x="${x + bw / 2}" y="${y - 4}" text-anchor="middle" font-size="9.5" fill="${C.sec}" style="font-variant-numeric:tabular-nums">${valueFmt(v)}</text>`;
    });
    s += `<text x="${x0 + gW / 2}" y="${top + plotH + 16}" text-anchor="middle" font-size="11" fill="${C.ink}">${esc(g.label)}</text>`;
  });
  s += `<text x="${W - 8}" y="12" text-anchor="end" font-size="10.5" fill="${C.muted}">${esc(unit)}</text>`;
  return s + '</svg>';
}

function divergenceTable(cells) { // exp002: matriz AL×K con fondo divergente azul/rojo
  const als = [...new Set(cells.map(c => c.al_mm))].sort((a, b) => a - b);
  const ks = [...new Set(cells.map(c => c.k_d))].sort((a, b) => a - b);
  const maxAbs = Math.max(...cells.filter(c => c.divergencia_d !== null).map(c => Math.abs(c.divergencia_d)));
  const bg = v => {
    if (v === null) return '';
    const a = Math.min(0.55, Math.abs(v) / maxAbs * 0.55);
    const col = v >= 0 ? '42,120,214' : '227,73,72';
    return `background:rgba(${col},${a.toFixed(2)})`;
  };
  let h = '<table><tr><th class="tl">AL \\ K</th>' + ks.map(k => `<th>${k} D</th>`).join('') + '</tr>';
  for (const al of als) {
    h += `<tr><td class="tl">${al} mm</td>` + ks.map(k => {
      const c = cells.find(x => x.al_mm === al && x.k_d === k);
      const v = c?.divergencia_d ?? null;
      return `<td style="${bg(v)}">${v === null ? '—' : f1(v)}</td>`;
    }).join('') + '</tr>';
  }
  return h + '</table>';
}

// ---------- paneles ----------
const p1 = hbar({
  rows: E1.rows.map(r => ({ label: `${r.id} (AL ${r.al_mm}, P ${r.potencia_optima_d} D)`, v: r.sensibilidad_d_por_mm })),
  max: Math.max(...E1.rows.map(r => r.sensibilidad_d_por_mm)),
  unit: 'D/mm',
});

const p4 = intervalChart(E4.rows.map(r => ({
  label: `${r.ojo} · σpos ${r.sigma_pos_mm} mm`,
  p5: r.p5_d, p50: r.p50_d, p95: r.p95_d,
  txt: `ancho ${f2(r.ancho90_d)} D · P(alt.) ${(100 * r.prob_alternativa_mejor).toFixed(0)}%`,
})));

const p3 = groupedBars({
  groups: E3.rows.map(r => ({
    label: `${r.id} (${r.potencia_d} D)`,
    values: { val: Math.abs(r.validacion.delta_d), cli: Math.abs(r.clinico_3mm.delta_d) },
  })),
  series: [
    { key: 'val', name: 'Validación h→0', col: C.s1 },
    { key: 'cli', name: 'Pupila 3 mm', col: C.s2 },
  ],
  unit: '|ΔD| paraxial↔trazado',
});

const p5 = groupedBars({
  groups: E5.rows.map(r => ({
    label: `${r.orientacion} ${r.astig_anterior_d}D`,
    values: { fis: r.fisico_cil_d, evo: r.evo_cil_d },
  })),
  series: [
    { key: 'fis', name: 'Físico (solo medido)', col: C.s1 },
    { key: 'evo', name: 'EVO (posterior predicha)', col: C.s2 },
  ],
  unit: 'cilindro recomendado (D)',
});

const leg = (pairs) => '<div class="legend">' + pairs.map(([c, t]) => `<span><span class="sw" style="background:${c}"></span>${t}</span>`).join('') + '</div>';
const G = BASE.global;

const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Benchmark científico — plataforma de investigación LIO</title>
<style>
  :root{color-scheme:light}
  *{box-sizing:border-box}
  body{margin:0;background:${C.page};color:${C.ink};font-family:system-ui,-apple-system,"Segoe UI",sans-serif;line-height:1.5}
  .shell{max-width:1020px;margin:0 auto;padding:26px 18px 60px}
  h1{color:${C.head};font-size:clamp(19px,3vw,26px);margin:0 0 4px}
  .meta{color:${C.sec};font-size:12.5px;margin:0 0 4px}
  .ruo{background:#fff8ec;border:1px solid #f0d9b5;border-radius:8px;padding:10px 14px;font-size:12.5px;color:#7a3b00;margin:12px 0}
  .card{background:${C.surface};border:1px solid ${C.line};border-radius:10px;padding:16px 18px 12px;margin-top:16px}
  .card h2{color:${C.head};font-size:15px;margin:0 0 2px}
  .card .sub{color:${C.sec};font-size:12.5px;margin:0 0 10px}
  svg{width:100%;height:auto;display:block}
  .tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-top:14px}
  .tile{background:${C.surface};border:1px solid ${C.line};border-radius:10px;padding:11px 13px}
  .tl2{font-size:11.5px;color:${C.sec}}
  .tv{font-size:26px;font-weight:600;color:${C.head};margin:2px 0}
  .ts{font-size:11px;color:${C.muted}}
  .legend{display:flex;gap:16px;flex-wrap:wrap;font-size:12px;color:${C.sec};margin:2px 0 8px}
  .legend span{display:inline-flex;align-items:center;gap:6px}
  .sw{width:11px;height:11px;border-radius:3px;display:inline-block}
  table{border-collapse:collapse;width:100%;font-size:12.5px;margin:6px 0}
  th{color:${C.sec};font-weight:600;text-align:right;padding:6px 8px;border-bottom:1px solid ${C.axis};font-size:11.5px}
  th.tl,td.tl{text-align:left}
  td{padding:5px 8px;border-bottom:1px solid ${C.grid};text-align:right;font-variant-numeric:tabular-nums}
  .note{font-size:12px;color:${C.sec};margin-top:8px}
  .foot{color:${C.sec};font-size:12px;margin-top:20px;line-height:1.55}
  code{font-family:Consolas,monospace;font-size:12px;background:#f1f2f4;padding:1px 5px;border-radius:4px}
</style>
</head>
<body><div class="shell">
<h1>Benchmark científico — motores de cálculo de LIO</h1>
<p class="meta">Generado desde <code>experiments/*/results.json</code> · baseline commit <code>${E5.commit.slice(0, 10)}</code> · ${new Date().toISOString().slice(0, 10)}</p>
<div class="ruo"><b>RESEARCH USE ONLY — NOT FOR CLINICAL DECISION MAKING.</b> Todo lo mostrado es
SIMULACIÓN sin ground truth clínico. Las comparaciones localizan divergencias entre motores;
no afirman cuál acierta.</div>

<div class="tiles">
  <div class="tile"><div class="tl2">Casos EVO cacheados</div><div class="tv">8.319</div><div class="ts">benchmark offline congelado</div></div>
  <div class="tile"><div class="tl2">Baseline reproducido</div><div class="tv">${f1(G.iol_pct)}%</div><div class="ts">potencia idéntica, n=${G.n}</div></div>
  <div class="tile"><div class="tl2">Motores comparables</div><div class="tv">3</div><div class="ts">EVO réplica · paraxial · paraxial+tórico</div></div>
  <div class="tile"><div class="tl2">Experimentos</div><div class="tv">5</div><div class="ts">reproducibles (semilla+commit)</div></div>
</div>

<div class="card">
  <h2>exp001 · Sensibilidad de la refracción a la posición de la LIO</h2>
  <p class="sub">D de error refractivo por mm de error de posición (paraxial; predictor de simulación). La pregunta nuclear del proyecto: dónde importa conocer la posición.</p>
  ${p1}
  <p class="note">Bajo el criterio DECLARADO de 0.25 D, la precisión de posición que mantendría la divergencia por debajo de ese valor: de ±0.10 mm (ojo corto) a ±3 mm (muy largo).</p>
</div>

<div class="card">
  <h2>exp004 · Intervalos de refracción bajo incertidumbre declarada (Monte Carlo)</h2>
  <p class="sub">Whisker = p5–p95; punto = mediana. σ(AL)=${E4.config.sigmas_fijas.al_mm} mm, σ(K)=${E4.config.sigmas_fijas.mean_k_d} D; n=${E4.config.n} por fila, semilla fija. «P(alt.)» = probabilidad de que el escalón vecino hubiese sido mejor.</p>
  ${leg([[C.s1, 'intervalo p5–p95'], [C.s2, 'mediana']])}
  ${p4}
  <p class="note">Las sigmas son escenarios declarados (OPEN_QUESTIONS #6): el panel mide consecuencias, no biología.</p>
</div>

<div class="card">
  <h2>exp003 · ¿Cuánto cambia paraxial → ray tracing?</h2>
  <p class="sub">|ΔD| equivalente entre foco paraxial y mejor foco trazado del MISMO sistema (LIO genérica). Con haz bajo, validación cruzada; con pupila de 3 mm, aberración esférica.</p>
  ${leg([[C.s1, 'validación h→0'], [C.s2, 'pupila 3 mm']])}
  ${p3}
  <p class="note">La aberración caracteriza la lente GENÉRICA declarada; la real depende de la asfericidad de cada modelo comercial (UNKNOWN).</p>
</div>

<div class="card">
  <h2>exp002 · Mapa de divergencia esférica: paraxial (no calibrado) vs EVO</h2>
  <p class="sub">Potencia paraxial − potencia EVO (D). Azul = paraxial pide más; rojo = menos. El predictor de posición no está calibrado: leer la estructura, no el valor absoluto. «—» = fuera de dominio de algún motor.</p>
  <div style="overflow-x:auto">${divergenceTable(E2.cells)}</div>
  <p class="note">Resumen: ${E2.resumen.validas}/${E2.resumen.celdas} celdas · media ${f2(E2.resumen.divergencia_media_d)} D · rango [${E2.resumen.divergencia_min_d}, ${E2.resumen.divergencia_max_d}] D.</p>
</div>

<div class="card">
  <h2>exp005 · Tórico: físico (solo datos medidos) vs EVO (posterior predicha)</h2>
  <p class="sub">Cilindro recomendado con el mismo catálogo. La diferencia sistemática es la firma de la córnea posterior que EVO predice y el físico no asume sin medida.</p>
  ${leg([[C.s1, 'físico (solo medido)'], [C.s2, 'EVO réplica']])}
  ${p5}
  <p class="note">Signo esperado y observado: en WTR el físico pide más cilindro (Δ hasta +1.5 D); en ATR, menos o igual; en oblicuo EVO además rota el eje (45° → ${E5.rows.filter(r => r.orientacion === 'oblicuo').map(r => r.evo_eje_deg + '°').join(', ')}). Árbitro: córnea posterior medida o datos postoperatorios.</p>
</div>

<p class="foot"><b>Regeneración:</b> <code>node experiments/run_exp00N.mjs</code> (N=1..5) y después
<code>node experiments/gendash_investigacion.mjs</code>. Cada resultado lleva configuración, semilla,
timestamp y commit. Procedencia de cada experimento: exp001 <code>${E1.commit.slice(0, 10)}</code> ·
exp002 <code>${E2.commit.slice(0, 10)}</code> · exp003 <code>${E3.commit.slice(0, 10)}</code> ·
exp004 <code>${E4.commit.slice(0, 10)}</code> · exp005 <code>${E5.commit.slice(0, 10)}</code>.
Metodología y límites: <code>docs/scientific/</code>.</p>
</div></body></html>`;

fs.writeFileSync(join(ROOT, 'dashboard-investigacion.html'), html);
console.log('escrito dashboard-investigacion.html (' + (html.length / 1024).toFixed(0) + ' kB)');
