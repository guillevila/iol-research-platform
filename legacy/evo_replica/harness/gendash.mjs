import fs from 'fs';
const D = JSON.parse(fs.readFileSync('dashboard-data.json', 'utf8'));

// ---- palette (validated: slots 1-3 reference palette; chrome = corporate) ----
const C = {
  s1: '#2a78d6', s2: '#eb6834', s3: '#1baf7a',
  ramp: ['#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#1c5cab'],
  head: '#153F74', sec: '#6F6F6F', ink: '#1a1a1a', muted: '#898781',
  grid: '#e1e0d9', axis: '#c3c2b7', surface: '#ffffff', page: '#f7f8fa', line: '#d6d6d6',
};
const f1 = x => x.toFixed(1), f2 = x => x.toFixed(2), f3 = x => x.toFixed(3);
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

// ---------------------------------------------------------------- helpers
function tiersChart() {
  const W = 860, rowH = 40, labelW = 380, pad = 8;
  const H = D.tiers.length * rowH + 30;
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Niveles de igualdad">`;
  const max = 100, barW = W - labelW - 90;
  D.tiers.slice().reverse().forEach((t, i) => {
    const y = i * rowH + 10, w = Math.max(2, t.p / max * barW);
    const col = C.ramp[Math.min(C.ramp.length - 1, i)];
    s += `<text x="${labelW - 10}" y="${y + 17}" text-anchor="end" font-size="12.5" fill="${C.ink}">${esc(t.name)}</text>`;
    s += `<rect x="${labelW}" y="${y}" width="${w}" height="24" rx="0" fill="${col}" data-tip="${esc(t.name)}: ${t.k} de ${D.totalRows} casos (${f1(t.p)}%)"/>`;
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

function histChart(h, title, colHint) {
  const bw = 24, gap = 20, plotH = 150, top = 18;
  const n = h.counts.length;
  const W = 46 + n * (bw + gap), H = plotH + top + 40;
  const mx = Math.max(...h.counts);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">`;
  s += `<line x1="40" y1="${top + plotH}" x2="${W - 6}" y2="${top + plotH}" stroke="${C.axis}" stroke-width="1"/>`;
  h.counts.forEach((c, i) => {
    const hgt = Math.max(c > 0 ? 3 : 0, c / mx * (plotH - 14));
    const x = 46 + i * (bw + gap), y = top + plotH - hgt;
    if (c > 0) {
      s += `<rect x="${x}" y="${y}" width="${bw}" height="${hgt}" fill="${colHint}" data-tip="${esc(h.labels[i])}: ${c} casos (${f1(100 * c / D.totalRows)}%)"/>`;
      s += `<rect x="${x}" y="${y}" width="${bw}" height="4" rx="2" fill="${colHint}"/>`;
    }
    s += `<text x="${x + bw / 2}" y="${y - 5}" text-anchor="middle" font-size="10" fill="${C.sec}" style="font-variant-numeric:tabular-nums">${c}</text>`;
    s += `<text x="${x + bw / 2}" y="${top + plotH + 15}" text-anchor="middle" font-size="10" fill="${C.muted}">${esc(h.labels[i])}</text>`;
  });
  return s + '</svg>';
}

function scatterChart() {
  const W = 860, H = 300, l = 52, r = 16, t = 16, b = 44;
  const pw = W - l - r, ph = H - t - b;
  const x0 = 20, x1 = 32, ymax = 0.6;
  const X = v => l + (v - x0) / (x1 - x0) * pw;
  const Y = v => t + ph - Math.min(v, ymax) / ymax * ph;
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Desviación de refracción frente a longitud axial">`;
  for (const g of [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6]) {
    s += `<line x1="${l}" y1="${Y(g)}" x2="${W - r}" y2="${Y(g)}" stroke="${g === 0 ? C.axis : C.grid}" stroke-width="1"/>`;
    s += `<text x="${l - 6}" y="${Y(g) + 4}" text-anchor="end" font-size="10.5" fill="${C.muted}" style="font-variant-numeric:tabular-nums">${f1(g)}</text>`;
  }
  for (let a = 20; a <= 32; a += 2) {
    s += `<text x="${X(a)}" y="${H - b + 16}" text-anchor="middle" font-size="10.5" fill="${C.muted}" style="font-variant-numeric:tabular-nums">${a}</text>`;
    s += `<line x1="${X(a)}" y1="${t + ph}" x2="${X(a)}" y2="${t + ph + 4}" stroke="${C.axis}" stroke-width="1"/>`;
  }
  s += `<text x="${(l + W - r) / 2}" y="${H - 6}" text-anchor="middle" font-size="11" fill="${C.sec}">Longitud axial (mm)</text>`;
  const yRef = Y(0.25);
  s += `<line x1="${l}" y1="${yRef}" x2="${W - r}" y2="${yRef}" stroke="${C.s2}" stroke-width="1.5"/>`;
  s += `<text x="${W - r - 4}" y="${yRef - 5}" text-anchor="end" font-size="10.5" fill="${C.sec}">0.25 D — mínimo clínicamente relevante</text>`;
  for (const [al, dr] of D.scatter) {
    s += `<circle cx="${f1(X(al))}" cy="${f1(Y(dr))}" r="4" fill="${C.s1}" fill-opacity="0.65" stroke="${C.surface}" stroke-width="1.5"/>`;
  }
  // capa de interacción: objetivos de hover de 22px sobre cada punto
  for (const [al, dr] of D.scatter) {
    s += `<circle cx="${f1(X(al))}" cy="${f1(Y(dr))}" r="11" fill="transparent" data-tip="AL ${f2(al)} mm — desviación ${f2(dr)} D"/>`;
  }
  return s + '</svg>';
}

function barrettChart() {
  const groups = D.barrett.labels;
  const series = [
    { name: 'Réplica (esta calculadora)', vals: D.barrett.replica, col: C.s1 },
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
      s += `<rect x="${x}" y="${y}" width="${bw}" height="${h}" fill="${se.col}" data-tip="${esc(gname)} — ${esc(se.name)}: ${f2(v)} D de desviación media vs EVO"/>`;
      s += `<rect x="${x}" y="${y}" width="${bw}" height="4" rx="2" fill="${se.col}"/>`;
      s += `<text x="${x + bw / 2}" y="${y - 5}" text-anchor="middle" font-size="11" font-weight="600" fill="${C.ink}" style="font-variant-numeric:tabular-nums">${f2(v)}</text>`;
    });
    s += `<text x="${x0 + gW / 2}" y="${top + plotH + 18}" text-anchor="middle" font-size="11.5" fill="${C.ink}">${esc(gname)}</text>`;
  });
  return s + '</svg>';
}

// per-model table rows
function modelRows() {
  const bar = (v, col) =>
    `<span class="mb"><span class="mbf" style="width:${Math.max(2, v)}%;background:${col}"></span></span>` +
    `<span class="mv">${f1(v)}%</span>`;
  return D.perModel.map(m => `<tr>
    <td class="tl">${esc(m.name)}</td>
    <td>${m.n}</td>
    <td class="bc">${bar(m.iol, C.s1)}</td>
    <td class="bc">${bar(m.cyl, C.s2)}</td>
    <td class="bc">${bar(m.ax1, C.s3)}</td>
    <td>${f3(m.mRef)}</td>
    <td>${f3(m.mTab)}</td>
  </tr>`).join('\n');
}
function modeTable() {
  return D.perMode.map(m => `<tr><td class="tl">${esc(m.name)}</td><td>${m.n}</td><td>${f1(m.iol)}%</td><td>${f1(m.cyl)}%</td><td>${f1(m.ax1)}%</td><td>${f1(m.dec)}%</td><td>${f3(m.mRef)}</td></tr>`).join('');
}
function histTable(h) {
  return h.labels.map((l, i) => `<tr><td class="tl">${esc(l)}</td><td>${h.counts[i]}</td><td>${f1(100 * h.counts[i] / D.totalRows)}%</td></tr>`).join('');
}

const G = D.global;
const kpi = (label, value, sub) =>
  `<div class="tile"><div class="tl2">${label}</div><div class="tv">${value}</div><div class="ts">${sub}</div></div>`;

const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Panel de validación — Calculadora tórica vs EVO</title>
<style>
  :root{color-scheme:light}
  *{box-sizing:border-box}
  body{margin:0;background:${C.page};color:${C.ink};
       font-family:system-ui,-apple-system,"Segoe UI",sans-serif;line-height:1.5}
  .shell{max-width:1080px;margin:0 auto;padding:28px 20px 60px}
  header h1{color:${C.head};font-size:clamp(20px,3.4vw,28px);margin:0 0 4px}
  header .meta{color:${C.sec};font-size:13px;margin:0 0 4px}
  .card{background:${C.surface};border:1px solid ${C.line};border-radius:10px;
        padding:18px 20px 14px;margin-top:18px}
  .card h2{color:${C.head};font-size:15.5px;margin:0 0 2px}
  .card .sub{color:${C.sec};font-size:12.5px;margin:0 0 12px}
  svg{width:100%;height:auto;display:block}
  .tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-top:18px}
  .tile{background:${C.surface};border:1px solid ${C.line};border-radius:10px;padding:12px 14px}
  .tl2{font-size:12px;color:${C.sec}}
  .tv{font-size:30px;font-weight:600;color:${C.head};margin:2px 0}
  .ts{font-size:11.5px;color:${C.muted}}
  .legend{display:flex;gap:18px;flex-wrap:wrap;font-size:12px;color:${C.sec};margin:2px 0 10px}
  .legend span{display:inline-flex;align-items:center;gap:6px}
  .sw{width:11px;height:11px;border-radius:3px;display:inline-block}
  table{border-collapse:collapse;width:100%;font-size:12.5px}
  th{color:${C.sec};font-weight:600;text-align:right;padding:7px 8px;border-bottom:1px solid ${C.axis};font-size:11.5px}
  th.tl,td.tl{text-align:left}
  td{padding:6px 8px;border-bottom:1px solid ${C.grid};text-align:right;
     font-variant-numeric:tabular-nums;white-space:nowrap}
  tr:hover td{background:#f2f6fc}
  .bc{min-width:130px}
  .mb{display:inline-block;width:64px;height:9px;background:#edf0f4;border-radius:4px;
      overflow:hidden;vertical-align:middle;margin-right:7px}
  .mbf{display:block;height:100%;border-radius:4px}
  .mv{display:inline-block;min-width:44px;text-align:right}
  details{margin-top:8px}
  summary{font-size:12px;color:${C.sec};cursor:pointer}
  details table{max-width:430px;margin-top:8px}
  .grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}
  .foot{color:${C.sec};font-size:12px;margin-top:22px;line-height:1.55}
  #tip{position:fixed;pointer-events:none;background:${C.ink};color:#fff;font-size:12px;
       padding:6px 9px;border-radius:6px;opacity:0;transition:opacity .12s;max-width:300px;z-index:9}
  .note{font-size:12px;color:${C.sec};margin-top:8px}
</style>
</head>
<body>
<div class="shell">
  <header>
    <h1>Panel de validación — Calculadora tórica frente a EVO Toric v2.0</h1>
    <p class="meta">Versión 1.0 · ${D.fecha} · G. Vila (elaboración asistida por IA) · EVO tomada como referencia en todas las métricas</p>
    <p class="meta">Herramienta no oficial y sin uso clínico directo; metodología completa en INFORME.md</p>
  </header>

  <div class="tiles">
    ${kpi('Consultas reales a EVO', D.totalQueries.toLocaleString('es-ES'), 'peticiones distintas cacheadas')}
    ${kpi('Casos comparados 1 a 1', D.totalRows.toLocaleString('es-ES'), '7 campañas con semilla fija')}
    ${kpi('Potencia esférica idéntica', f1(G.iol) + '%', 'misma LIO recomendada')}
    ${kpi('Cilindro idéntico', f1(G.cyl) + '%', 'mismo cilindro del catálogo')}
    ${kpi('Eje dentro de ±1°', f1(G.ax1) + '%', 'eje de implantación')}
    ${kpi('Error mediano de refracción', f2(G.medTab) + ' D', 'tablas de 5 potencias, vs 0.25 D clínico')}
  </div>

  <div class="card">
    <h2>¿Cómo de iguales? Niveles de exigencia</h2>
    <p class="sub">Cada caso se evalúa contra la salida real de EVO. La barra indica qué porcentaje de los ${D.totalRows.toLocaleString('es-ES')} casos cumple cada nivel, del criterio más laxo (arriba) a la igualdad absoluta de todos los decimales (abajo).</p>
    ${tiersChart()}
  </div>

  <div class="card">
    <h2>Concordancia por escenario</h2>
    <p class="sub">Porcentaje de coincidencia exacta por tipo de caso simulado.</p>
    <div class="legend">
      <span><span class="sw" style="background:${C.s1}"></span>Potencia igual</span>
      <span><span class="sw" style="background:${C.s2}"></span>Cilindro igual</span>
      <span><span class="sw" style="background:${C.s3}"></span>Eje ≤1°</span>
    </div>
    ${scenarioChart()}
    <details><summary>Ver tabla de datos</summary>
      <table><tr><th class="tl">Escenario</th><th>n</th><th>Potencia</th><th>Cilindro</th><th>Eje ≤1°</th><th>Decisión completa</th><th>|Δref| media (D)</th></tr>${modeTable()}</table>
    </details>
  </div>

  <div class="card">
    <h2>Variación por modelo de LIO (referencia: EVO)</h2>
    <p class="sub">Cada fila resume los casos simulados con ese modelo (campaña dedicada de 14 casos por modelo más los muestreos generales). Las columnas de desviación son medias absolutas frente a EVO.</p>
    <div style="overflow-x:auto">
    <table>
      <tr><th class="tl">Modelo</th><th>n</th><th>Potencia igual</th><th>Cilindro igual</th><th>Eje ≤1°</th><th>|Δref| media (D)</th><th>|Δtabla| media (D)</th></tr>
      ${modelRows()}
    </table>
    </div>
    <p class="note">Los desplazamientos esféricos propios de cada familia (J&amp;J −0.86 D, B&amp;L +1.25 D en potencias altas) ya están corregidos dentro del motor; esta tabla mide lo que queda tras esa corrección.
    Los Zeiss 709M/MP y 939M/MP son lentes bitóricas a medida: EVO recomienda su equivalente esférico en una rejilla
    de 0.25 D acoplada al cilindro elegido (potencia plana + cil/2) con una regla de selección que presenta histéresis
    no reproducible desde fuera; la rejilla está implementada, pero la coincidencia literal de potencia queda en ~60 %
    con tablas de refracción que difieren ≤0.05 D. «Anterior» y «Bitoric» son modos genéricos del propio EVO, no
    lentes comerciales.</p>
  </div>

  <div class="card">
    <h2>Distribución del error</h2>
    <p class="sub">Cuanto más a la izquierda, mejor. El mínimo clínicamente relevante en refracción es 0.25 D; el redondeo de la propia web de EVO es 0.01 D.</p>
    <div class="grid2">
      <div><h3 style="font-size:12.5px;color:${C.sec};margin:0 0 4px">Error máx. de la tabla de refracciones (D)</h3>${histChart(D.hist.tab, 'Error de tabla', C.s1)}
      <details><summary>Ver tabla</summary><table><tr><th class="tl">Rango</th><th>Casos</th><th>%</th></tr>${histTable(D.hist.tab)}</table></details></div>
      <div><h3 style="font-size:12.5px;color:${C.sec};margin:0 0 4px">Desviación del eje de implantación</h3>${histChart(D.hist.ax, 'Desviación de eje', C.s1)}
      <details><summary>Ver tabla</summary><table><tr><th class="tl">Rango</th><th>Casos</th><th>%</th></tr>${histTable(D.hist.ax)}</table></details></div>
      <div><h3 style="font-size:12.5px;color:${C.sec};margin:0 0 4px">Desviación del cilindro residual (D)</h3>${histChart(D.hist.resi, 'Desviación residual', C.s1)}
      <details><summary>Ver tabla</summary><table><tr><th class="tl">Rango</th><th>Casos</th><th>%</th></tr>${histTable(D.hist.resi)}</table></details></div>
    </div>
  </div>

  <div class="card">
    <h2>Desviación de la refracción prevista según la longitud axial</h2>
    <p class="sub">Cada punto es un caso (muestra de ${D.scatter.length}). La línea naranja marca 0.25 D, el mínimo que un paciente puede llegar a notar; todo lo que queda por debajo es clínicamente indistinguible de EVO.</p>
    ${scatterChart()}
  </div>

  <div class="card">
    <h2>En contexto: réplica frente a otra fórmula de referencia</h2>
    <p class="sub">Desviación media de la refracción prevista respecto a EVO, a igual potencia, en el caso clínico real de miopía magna (biometría Anterion). Barrett no intenta imitar a EVO: es un algoritmo distinto — la comparación ilustra la escala.</p>
    <div class="legend">
      <span><span class="sw" style="background:${C.s1}"></span>Réplica (esta calculadora)</span>
      <span><span class="sw" style="background:${C.s2}"></span>Barrett Universal II (impreso Anterion)</span>
    </div>
    ${barrettChart()}
    <p class="note">Kane (iolformula.com) queda pendiente de introducción manual — véase COMPARATIVA-CALCULADORAS.md §7.</p>
  </div>

  <p class="foot"><b>Método.</b> Todos los casos son generados con semilla fija dentro del dominio validado
  (AL 20–32 mm, K media 34–50 D) y consultados realmente contra evoiolcalculator.com; la réplica se evalúa
  después con esos mismos datos. Ningún caso de validación se usó para calibrar el motor. «Decisión completa»
  = misma potencia + mismo cilindro + eje dentro de ±1°. Detalle de los 14 ensayos de ingeniería inversa,
  del modelo matemático y de las limitaciones (post-LASIK, Argos y córnea posterior medida no cubiertos)
  en INFORME.md. Documento de trabajo interno; no es un producto sanitario.</p>
</div>
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

fs.writeFileSync('C:/Users/Guille/Desktop/Prueba/dashboard.html', html);
fs.writeFileSync('dashboard.html', html);
console.log('wrote dashboard.html (' + (html.length / 1024).toFixed(0) + ' kB)');
