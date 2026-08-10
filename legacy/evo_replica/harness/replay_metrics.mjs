/**
 * replay_metrics.mjs — reproducción OFFLINE de las métricas del baseline.
 *
 * Regenera con semilla fija las 7 campañas de validación, obtiene la respuesta de
 * EVO EXCLUSIVAMENTE de la caché congelada (cero red: si un caso faltara, error),
 * ejecuta el motor congelado y recalcula las métricas globales y por campaña.
 *
 * Uso:  node replay_metrics.mjs [--write]   (--write actualiza baseline_metrics.json)
 * Como módulo: `computeMetrics()` para los tests de regresión.
 *
 * RESEARCH USE ONLY. Este archivo pertenece al baseline congelado: no evolucionar.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const require = createRequire(import.meta.url);
// Copia .cjs byte-idéntica del motor (véase run_evo_replica.mjs).
const ENGINE = require(join(ROOT, 'engine.cjs'));

// ---- clave de caché: DEBE ser idéntica a la del harness original (evo2.mjs) ----
// El orden de propiedades importa: JSON.stringify conserva el orden de inserción.
const DEFAULTS = {
  TextBoxName: 'T', TextBoxID: '1', TextBoxSurgeon: 'D',
  DropDownArgos: '0', RadioButtonRLEye: '1',
  txtAL: '', txtK1: '', TxtK1Axis: '', txtK2: '', TxtK2Axis: '',
  txtACD: '', txtLT: '', txtCCT: '',
  txtRefraction: '0', txtAConstant: '119.3',
  DropDownToric: 'Posterior', DropDownKIndex: '1.3375',
  TxtSIA: '0', TxtSIAaxis: '0',
  DropDownLASIK: '0', DropDownListPK: 'IOLMaster 700',
  txtPK1: '', TxtPK1axis: '', txtPK2: '', TxtPK2axis: '',
  txtPreLASIK: '', txtPostLASIK: '',
};

let CACHE = null;
function evoFromCache(input) {
  if (!CACHE) CACHE = JSON.parse(fs.readFileSync(join(ROOT, 'cache', 'cache2.json'), 'utf8'));
  const key = JSON.stringify({ ...DEFAULTS, ...input });
  const hit = CACHE[key];
  if (!hit) throw new Error('CACHE MISS (el replay debe ser 100% offline): ' + key.slice(0, 120));
  return hit;
}

// ---- generación de campañas: réplica exacta del generador original (builddash) ----
const MODELS = JSON.parse(fs.readFileSync(join(ROOT, 'data', 'models.json'), 'utf8')).models.map(m => m.value);

function gen(mode, N, seed0) {
  let seed = seed0;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const U = (a, b) => a + (b - a) * rnd();
  const pick = a => a[Math.floor(rnd() * a.length) % a.length];
  const out = [];
  for (let i = 0; i < N; i++) {
    const LONG = mode === 'long';
    const al = +(LONG ? U(27.0, 31.5) : U(21.0, 27.0)).toFixed(2);
    const k1 = +(LONG ? U(34.0, 40.0) : U(40.0, 47.0)).toFixed(2);
    const cyl = +U(0.25, 4.00).toFixed(2);
    const ax = Math.floor(U(0, 180)); const k1a = ax === 0 ? 180 : ax;
    const k2a = ((k1a + 90) % 180) === 0 ? 180 : (k1a + 90) % 180;
    const c = {
      txtAL: al.toFixed(2), txtK1: k1.toFixed(2), TxtK1Axis: String(k1a),
      txtK2: (k1 + cyl).toFixed(2), TxtK2Axis: String(k2a),
      txtACD: (+U(2.6, 4.2).toFixed(2)).toFixed(2), txtLT: (+U(3.6, 5.4).toFixed(2)).toFixed(2),
      txtCCT: String(Math.round(U(480, 620))),
      txtRefraction: String(+(Math.round(U(-1.5, 0.5) * 4) / 4).toFixed(2)),
      txtAConstant: (+U(117.0, 120.5).toFixed(2)).toFixed(2),
      DropDownToric: 'Posterior', DropDownKIndex: '1.3375', TxtSIA: '0', TxtSIAaxis: '0',
    };
    if (mode === 'full') {
      c.DropDownToric = pick(MODELS); c.DropDownKIndex = pick(['1.3375', '1.3375', '1.3375', '1.3315', '1.332']);
      c.TxtSIA = (+U(0, 0.5).toFixed(2)).toFixed(2); c.TxtSIAaxis = String(Math.floor(U(0, 180)));
    } else if (mode === 'sia') {
      c.TxtSIA = (+U(0.05, 0.5).toFixed(2)).toFixed(2); c.TxtSIAaxis = String(Math.floor(U(0, 180)));
    } else if (mode === 'kidx') {
      c.DropDownKIndex = pick(['1.3315', '1.332']);
    } else if (mode === 'models') {
      c.DropDownToric = pick(MODELS);
    }
    out.push(c);
  }
  return out;
}

export function campaigns() {
  return [
    ['clean', gen('clean', 200, 999111)],
    ['long', gen('long', 150, 24681357)],
    ['full', gen('full', 250, 888222)],
    ['models', gen('models', 100, 313131)],
    ['kidx', gen('kidx', 100, 515151)],
    ['sia', gen('sia', 100, 616161)],
    ['permodel', JSON.parse(fs.readFileSync(join(ROOT, 'data', 'permodel-cases.json'), 'utf8'))],
  ];
}

const r2 = x => Math.round(x * 100) / 100;

export function computeMetrics() {
  const rows = [];
  for (const [mode, cases] of campaigns()) {
    for (const c of cases) {
      const evo = evoFromCache(c);
      if (!evo || !evo.ok || evo.recIOL == null || evo.recToric == null) continue;
      let m;
      try {
        m = ENGINE.calculate({
          al: +c.txtAL, k1: +c.txtK1, k1a: +c.TxtK1Axis, k2: +c.txtK2, k2a: +c.TxtK2Axis,
          acd: +c.txtACD, lt: +c.txtLT, cct: +c.txtCCT, target: +c.txtRefraction,
          aconst: +c.txtAConstant, model: c.DropDownToric, kindex: +c.DropDownKIndex,
          sia: +c.TxtSIA, siaax: +c.TxtSIAaxis,
        });
      } catch (e) {
        // Solo los rechazos de dominio del motor son esperables; cualquier otro
        // error debe romper el replay (jamás silenciar fallos de carga o lógica).
        if (/fuera del (rango|dominio)/.test(e.message)) continue;
        throw e;
      }
      let dAx = Math.abs(m.rec.axis - evo.recAxis); if (dAx > 90) dAx = 180 - dAx;
      const em = new Map(evo.pairs);
      let tabMax = 0;
      for (const s of m.sphere) if (em.has(s.iol)) tabMax = Math.max(tabMax, Math.abs(r2(s.ref) - em.get(s.iol)));
      rows.push({
        mode,
        dIOL: r2(Math.abs(m.baseIOL - evo.baseIOL)),
        dCyl: r2(Math.abs(m.rec.cyl - evo.recToric)),
        dAx,
        dRef: evo.predRef != null ? r2(Math.abs(r2(m.rec.ref) - evo.predRef)) : null,
        tabMax: r2(tabMax),
      });
    }
  }
  const pct = (k, n) => 100 * k / n;
  const median = a => { const s = a.filter(v => v != null).slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
  const stat = list => ({
    n: list.length,
    iol_pct: pct(list.filter(r => r.dIOL === 0).length, list.length),
    cyl_pct: pct(list.filter(r => r.dCyl === 0).length, list.length),
    ax1_pct: pct(list.filter(r => r.dAx <= 1).length, list.length),
    decision_pct: pct(list.filter(r => r.dIOL === 0 && r.dCyl === 0 && r.dAx <= 1).length, list.length),
    median_table_err_d: median(list.map(r => r.tabMax)),
  });
  const perMode = {};
  for (const mode of [...new Set(rows.map(r => r.mode))]) perMode[mode] = stat(rows.filter(r => r.mode === mode));
  return { generated_at_note: 'determinista: semillas fijas + cache congelada', global: stat(rows), perMode };
}

const OUT = join(ROOT, 'baseline', 'baseline_metrics.json');
if (process.argv[1] && process.argv[1].endsWith('replay_metrics.mjs')) {
  const m = computeMetrics();
  console.log(JSON.stringify(m.global, null, 2));
  if (process.argv.includes('--write')) {
    fs.writeFileSync(OUT, JSON.stringify(m, null, 1));
    console.log('escrito', OUT);
  } else if (fs.existsSync(OUT)) {
    const base = JSON.parse(fs.readFileSync(OUT, 'utf8'));
    const same = JSON.stringify(base.global) === JSON.stringify(m.global);
    console.log(same ? 'COINCIDE con baseline_metrics.json' : 'NO COINCIDE con baseline');
    process.exitCode = same ? 0 : 1;
  }
}
