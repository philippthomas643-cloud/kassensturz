/* ======================================================================
   Diagramme (SVG, ohne Bibliothek): Vermögensverlauf und Aufteilung
   ====================================================================== */
const SVGNS = "http://www.w3.org/2000/svg";
function niceTicks(min, max, n) {
  if (!isFinite(min) || !isFinite(max)) return { lo: 0, hi: 1, ticks: [0, 1] };
  if (min === max) { const pad = Math.abs(max) * 0.05 || 1; min -= pad; max += pad; }
  const step0 = (max - min) / (n || 4);
  const mag = 10 ** Math.floor(Math.log10(step0));
  const norm = step0 / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo, g = 0; v <= hi + step / 2 && g < 20; v += step, g++) ticks.push(Math.round(v * 1e6) / 1e6);
  return { lo, hi, ticks };
}
function chartSeries() {
  const today = isoDate();
  const back = { "1M": 31, "3M": 92, "6M": 183, "1J": 366 }[S.ui.chart.range];
  const from = back ? addDays(today, -back) : "0000-01-01";
  const pts = Array.from(S.data.snaps.values())
    .filter((s) => validISO(s.date) && s.date >= from && s.date <= today && isFinite(s.total))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((s) => ({ date: s.date, total: s.total, EUR: (s.byCur && s.byCur.EUR) || 0, USDT: (s.byCur && s.byCur.USDT) || 0, BTC: (s.byCur && s.byCur.BTC) || 0 }));
  const d = derive();
  if (accountsList().length && !d.missing.length) {
    const live = { date: today, total: d.total, EUR: d.byCur.EUR.eur || 0, USDT: d.byCur.USDT.eur || 0, BTC: d.byCur.BTC.eur || 0, live: true };
    if (pts.length && pts[pts.length - 1].date === today) pts[pts.length - 1] = live;
    else pts.push(live);
  }
  return pts;
}
function el(tag, attrs, parent) {
  const n = document.createElementNS(SVGNS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
}
function xTicks(first, last, width) {
  const span = daysBetween(first, last);
  const out = [];
  if (span <= 45) {
    const n = width < 420 ? 3 : 5;
    for (let i = 0; i <= n; i++) {
      const d = addDays(first, Math.round((span * i) / n));
      const dt = parseISO(d);
      out.push({ d, label: dt.getDate() + ". " + MONTHS_AX[dt.getMonth()] });
    }
    return out;
  }
  let m = parseISO(first);
  m = new Date(m.getFullYear(), m.getMonth() + 1, 1);
  const months = [];
  for (let g = 0; g < 400; g++) {
    const d = isoDate(m);
    if (d > last) break;
    months.push(m);
    m = new Date(m.getFullYear(), m.getMonth() + 1, 1);
  }
  const maxTicks = Math.max(2, Math.floor(width / 64));
  const every = Math.max(1, Math.ceil(months.length / maxTicks));
  months.forEach((dt, i) => {
    if (i % every) return;
    const yr = dt.getMonth() === 0 || (i === 0 && span > 330) ? " ’" + String(dt.getFullYear()).slice(2) : "";
    out.push({ d: isoDate(dt), label: MONTHS_AX[dt.getMonth()] + yr });
  });
  return out;
}
let chartUid = 0;
let lastChartH = 0; // reservierte Höhe, damit beim Neuzeichnen nichts zusammenfällt
function drawNetWorthChart() {
  const host = $("#chart-nw");
  if (!host) return;
  const pts = chartSeries();
  const mode = S.ui.chart.mode;
  if (S.ui.chart.table) {
    host.innerHTML = chartTable(pts);
    return;
  }
  if (pts.length < 2) {
    host.innerHTML = '<p class="chart-empty">Der Verlauf füllt sich ab jetzt von selbst: An jedem Tag, an dem du Kassensturz öffnest, wird dein Gesamtvermögen gespeichert.' + (pts.length ? " Heute: <b>" + fmtEUR(pts[0].total) + "</b>." : "") + " Bis dahin zeigt dir <b>Aufteilung</b>, wie sich dein Vermögen verteilt.</p>";
    return;
  }
  const W = Math.max(280, Math.round(host.clientWidth || 600));
  const H = W < 520 ? 196 : 256;
  lastChartH = H;
  const M = { l: 46, r: 10, t: 12, b: 26 };
  const iw = W - M.l - M.r, ih = H - M.t - M.b;
  const first = pts[0].date, last = pts[pts.length - 1].date;
  const span = Math.max(1, daysBetween(first, last));
  const X = (d) => M.l + (daysBetween(first, d) / span) * iw;
  let yt;
  if (mode === "cur") {
    const max = Math.max(...pts.map((p) => p.EUR + p.USDT + p.BTC), 1);
    yt = niceTicks(0, max, 4);
  } else {
    const vals = pts.map((p) => p.total);
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const pad = (hi - lo) * 0.14 || Math.abs(hi) * 0.03 || 1;
    yt = niceTicks(Math.max(lo >= 0 ? 0 : -Infinity, lo - pad), hi + pad, 4);
  }
  const Y = (v) => M.t + ih - ((v - yt.lo) / (yt.hi - yt.lo || 1)) * ih;
  const uid = "g" + ++chartUid;

  host.innerHTML = "";
  const svg = el("svg", { class: "plot", viewBox: "0 0 " + W + " " + H, width: W, height: H, role: "img", tabindex: "0", "aria-label": "Vermögensverlauf von " + fmtDate(first, true) + " bis " + fmtDate(last, true) + ": " + fmtEUR(pts[0].total) + " auf " + fmtEUR(pts[pts.length - 1].total) + ". Pfeiltasten zeigen einzelne Tage." }, host);
  const defs = el("defs", {}, svg);
  const lg = el("linearGradient", { id: uid, x1: "0", y1: "0", x2: "0", y2: "1" }, defs);
  el("stop", { offset: "0", style: "stop-color:var(--ink);stop-opacity:.16" }, lg);
  el("stop", { offset: "1", style: "stop-color:var(--ink);stop-opacity:0" }, lg);
  // Raster
  const g0 = el("g", {}, svg);
  for (const t of yt.ticks) {
    const y = Math.round(Y(t)) + 0.5;
    el("line", { class: t === yt.lo ? "base" : "gl", x1: M.l, x2: W - M.r, y1: y, y2: y }, g0);
    const tx = el("text", { class: "ax", x: 0, y: y + 3.5, "text-anchor": "start" }, g0);
    tx.textContent = fmtCompactEUR(t);
  }
  for (const tk of xTicks(first, last, iw)) {
    const x = X(tk.d);
    if (x < M.l + 14 || x > W - M.r - 14) continue;
    const tx = el("text", { class: "ax", x, y: H - 6, "text-anchor": "middle" }, g0);
    tx.textContent = tk.label;
  }
  // Daten
  const gd = el("g", {}, svg);
  const lineD = (acc) => pts.map((p, i) => (i ? "L" : "M") + X(p.date).toFixed(1) + " " + Y(acc(p)).toFixed(1)).join("");
  const series = [];
  if (mode === "cur") {
    const cum = pts.map(() => 0);
    for (const c of CURS) {
      const lower = cum.slice();
      pts.forEach((p, i) => { cum[i] += Math.max(0, p[c]); });
      const upper = cum.slice();
      if (!pts.some((p) => p[c] > 0)) continue;
      const top = pts.map((p, i) => (i ? "L" : "M") + X(p.date).toFixed(1) + " " + Y(upper[i]).toFixed(1)).join("");
      const bottom = pts.slice().reverse().map((p, j) => { const i = pts.length - 1 - j; return "L" + X(p.date).toFixed(1) + " " + Y(lower[i]).toFixed(1); }).join("");
      el("path", { d: top + bottom + "Z", fill: CUR[c].color, "fill-opacity": "0.18", stroke: "none" }, gd);
      el("path", { d: top, fill: "none", stroke: CUR[c].color, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }, gd);
      series.push({ c, upper });
    }
  } else {
    const area = lineD((p) => p.total) + "L" + X(last).toFixed(1) + " " + (M.t + ih) + "L" + X(first).toFixed(1) + " " + (M.t + ih) + "Z";
    el("path", { d: area, fill: "url(#" + uid + ")", stroke: "none" }, gd);
    el("path", { d: lineD((p) => p.total), fill: "none", stroke: "var(--ink)", "stroke-width": 2.2, "stroke-linejoin": "round", "stroke-linecap": "round" }, gd);
  }
  // Endpunkt
  const lp = pts[pts.length - 1];
  const ly = mode === "cur" ? Y(lp.EUR + lp.USDT + lp.BTC) : Y(lp.total);
  el("circle", { cx: X(lp.date), cy: ly, r: 9, fill: "var(--ink)", "fill-opacity": ".12" }, gd);
  el("circle", { cx: X(lp.date), cy: ly, r: 4.5, fill: "var(--ink)", stroke: "var(--panel)", "stroke-width": 2 }, gd);
  // Interaktion
  const gh = el("g", { style: "display:none" }, svg);
  const xh = el("line", { class: "xh", y1: M.t, y2: M.t + ih }, gh);
  const dots = [];
  const dotSeries = mode === "cur" ? series.map((s) => ({ color: CUR[s.c].color, get: (i) => s.upper[i] })) : [{ color: "var(--ink)", get: (i) => pts[i].total }];
  for (const s of dotSeries) dots.push({ s, n: el("circle", { r: 4.5, fill: s.color, stroke: "var(--panel)", "stroke-width": 2 }, gh) });
  const tip = document.createElement("div");
  tip.className = "tip";
  tip.hidden = true;
  host.appendChild(tip);
  if (mode === "cur") {
    const lgd = document.createElement("div");
    lgd.className = "chart-legend";
    lgd.innerHTML = series.map((s) => '<span><i style="background:' + CUR[s.c].color + '"></i>' + CUR[s.c].name + " · " + fmtEUR(lp[s.c]) + "</span>").join("");
    host.appendChild(lgd);
  }
  let cur = -1;
  const show = (i) => {
    cur = i;
    const p = pts[i];
    const x = X(p.date);
    gh.style.display = "";
    xh.setAttribute("x1", x);
    xh.setAttribute("x2", x);
    for (const d of dots) { d.n.setAttribute("cx", x); d.n.setAttribute("cy", Y(d.s.get(i))); }
    const rows = CURS.filter((c) => pts.some((q) => q[c])).map((c) => '<div class="tr"><span class="k" style="background:' + CUR[c].color + '"></span><span class="n">' + CUR[c].name + '</span><span class="v">' + fmtEUR(p[c]) + "</span></div>").join("");
    tip.innerHTML = '<div class="d">' + (p.live ? "Jetzt · " : "") + WD[parseISO(p.date).getDay()] + ", " + fmtDate(p.date, true) + "</div>" +
      '<div class="tr"><span class="k" style="background:var(--ink)"></span><span class="n">Gesamt</span><span class="v">' + fmtEUR(p.total) + "</span></div>" + rows;
    tip.hidden = false;
    const tw = tip.offsetWidth, hw = host.clientWidth;
    const scale = hw / W;
    let left = x * scale + 14;
    if (left + tw > hw) left = x * scale - tw - 14;
    tip.style.left = Math.max(0, left) + "px";
    tip.style.top = Math.max(0, M.t * scale) + "px";
  };
  const hide = () => { gh.style.display = "none"; tip.hidden = true; cur = -1; };
  const nearest = (clientX) => {
    const r = svg.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * W;
    let best = 0, bd = Infinity;
    pts.forEach((p, i) => { const dd = Math.abs(X(p.date) - x); if (dd < bd) { bd = dd; best = i; } });
    return best;
  };
  svg.addEventListener("pointermove", (e) => show(nearest(e.clientX)));
  svg.addEventListener("pointerdown", (e) => show(nearest(e.clientX)));
  svg.addEventListener("pointerleave", hide);
  svg.addEventListener("focus", () => show(pts.length - 1));
  svg.addEventListener("blur", hide);
  svg.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") { e.preventDefault(); show(Math.max(0, (cur < 0 ? pts.length - 1 : cur) - 1)); }
    if (e.key === "ArrowRight") { e.preventDefault(); show(Math.min(pts.length - 1, (cur < 0 ? pts.length - 1 : cur) + 1)); }
    if (e.key === "Escape") hide();
  });
}
function chartTable(pts) {
  if (!pts.length) return '<p class="muted">Noch keine Werte gespeichert.</p>';
  const rows = pts.slice().reverse().map((p) => "<tr><td>" + fmtDate(p.date, true) + (p.live ? " (jetzt)" : "") + "</td><td>" + fmtEUR(p.total) + "</td><td>" + fmtEUR(p.EUR) + "</td><td>" + fmtEUR(p.USDT) + "</td><td>" + fmtEUR(p.BTC) + "</td></tr>").join("");
  return '<div class="table-wrap" data-keep-scroll="nwtable"><table class="data"><thead><tr><th>Datum</th><th>Gesamt</th><th>Euro</th><th>USDT in €</th><th>BTC in €</th></tr></thead><tbody>' + rows + "</tbody></table></div>";
}

/* ---------- Aufteilung (Donut) ---------- */
function allocData() {
  const d = derive();
  const by = S.ui.chart.allocBy === "acc" ? "acc" : "cur";
  let items = [];
  if (by === "acc") {
    for (const c of CURS) {
      const list = accountsList()
        .filter((a) => a.currency === c && a.includeInTotal !== false)
        .map((a) => { const b = balanceOf(a.id); return { key: a.id, name: a.name, cur: c, native: b, eur: toEUR(b, c) }; })
        .filter((x) => x.eur != null && x.eur > 0.005)
        .sort((a, b) => b.eur - a.eur);
      list.forEach((x, i) => {
        const pct = list.length > 1 ? Math.round(100 - (i * 58) / (list.length - 1)) : 100;
        x.color = pct >= 100 ? CUR[c].color : "color-mix(in srgb, " + CUR[c].color + " " + pct + "%, var(--panel))";
      });
      items = items.concat(list);
    }
    if (items.length > 9) {
      const sorted = items.slice().sort((a, b) => b.eur - a.eur);
      const keep = new Set(sorted.slice(0, 8).map((x) => x.key));
      const rest = items.filter((x) => !keep.has(x.key));
      items = items.filter((x) => keep.has(x.key));
      items.push({ key: "_rest", name: rest.length + " weitere Konten", cur: null, native: null, eur: rest.reduce((s, x) => s + x.eur, 0), color: "var(--ink-3)" });
    }
  } else {
    items = CURS.map((c) => ({ key: c, name: CUR[c].name, cur: c, native: d.byCur[c].native, eur: d.byCur[c].eur, color: CUR[c].color, n: d.byCur[c].n }))
      .filter((x) => x.n && x.eur != null && x.eur > 0.005);
  }
  const sum = items.reduce((s, x) => s + x.eur, 0);
  for (const x of items) x.pct = sum > 0 ? x.eur / sum : 0;
  return { items, sum, total: d.total, by };
}
function arcPath(cx, cy, r, a0, a1) {
  const p = (a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const [x0, y0] = p(a0), [x1, y1] = p(a1);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return "M" + x0.toFixed(2) + " " + y0.toFixed(2) + "A" + r + " " + r + " 0 " + large + " 1 " + x1.toFixed(2) + " " + y1.toFixed(2);
}
function allocHtml() {
  const { items, total, by } = allocData();
  if (!items.length) {
    return '<p class="chart-empty">' + (accountsList().length ? "Sobald ein Konto Guthaben hat, siehst du hier, wie sich dein Vermögen verteilt." : "Leg dein erstes Konto an – dann siehst du hier, wie sich dein Vermögen auf Euro, USDT und Bitcoin verteilt.") + "</p>";
  }
  const focus = items.find((x) => x.key === S.ui.chart.focus) || null;
  const R = 80, SW = 22, C = 100;
  const gap = items.length > 1 ? 0.035 : 0;
  let a = -Math.PI / 2;
  let arcs = "";
  for (const x of items) {
    const sweep = x.pct * Math.PI * 2;
    const a0 = a + gap / 2, a1 = a + sweep - gap / 2;
    const label = esc(x.name) + ": " + fmtPct(x.pct * 100) + ", " + fmtEUR(x.eur);
    if (items.length === 1) arcs += '<circle class="arc on" cx="' + C + '" cy="' + C + '" r="' + R + '" fill="none" style="stroke:' + x.color + '" stroke-width="' + SW + '" data-act="alloc-focus" data-key="' + esc(x.key) + '"><title>' + label + "</title></circle>";
    else if (a1 > a0) arcs += '<path class="arc' + (focus && focus.key === x.key ? " on" : "") + '" d="' + arcPath(C, C, R, a0, a1) + '" fill="none" style="stroke:' + x.color + '" stroke-width="' + SW + '" data-act="alloc-focus" data-key="' + esc(x.key) + '"><title>' + label + "</title></path>";
    a += sweep;
  }
  const center = focus
    ? '<span class="l">' + esc(focus.name) + '</span><span class="v">' + fmtEUR(focus.eur, { dec: focus.eur >= 10000 ? 0 : 2 }) + '</span><span class="s">' + fmtPct(focus.pct * 100) + (focus.cur && focus.cur !== "EUR" ? " · " + fmtAmt(focus.native, focus.cur, { max: focus.cur === "BTC" ? 6 : 2 }) : "") + "</span>"
    : '<span class="l">Gesamt</span><span class="v">' + fmtEUR(total, { dec: Math.abs(total) >= 10000 ? 0 : 2 }) + '</span><span class="s">' + items.length + (by === "acc" ? (items.length === 1 ? " Konto" : " Konten") : items.length === 1 ? " Asset" : " Assets") + "</span>";
  const legend = items.map((x) => {
    const sub = by === "acc"
      ? (x.cur === "EUR" ? "Euro" : x.cur ? fmtAmt(x.native, x.cur, { max: x.cur === "BTC" ? 8 : 2 }) : "")
      : (x.cur === "EUR" ? x.n + (x.n === 1 ? " Konto" : " Konten") : fmtAmt(x.native, x.cur, { max: x.cur === "BTC" ? 8 : 2 }));
    return '<button type="button" class="alloc-item" data-act="alloc-focus" data-key="' + esc(x.key) + '" aria-pressed="' + (!!focus && focus.key === x.key) + '">' +
      '<span class="sw" style="background:' + x.color + '"></span><span class="n">' + esc(x.name) + '</span><span class="p">' + fmtPct(x.pct * 100) + "</span>" +
      '<span class="s">' + (sub || "&nbsp;") + '</span><span class="e">' + fmtEUR(x.eur) + "</span></button>";
  }).join("");
  const aria = "Aufteilung deines Vermögens: " + items.map((x) => x.name + " " + fmtPct(x.pct * 100)).join(", ");
  return '<div class="alloc"><div class="alloc-donut' + (focus ? " focus" : "") + '"><svg viewBox="0 0 200 200" role="img" aria-label="' + esc(aria) + '">' +
    '<circle cx="' + C + '" cy="' + C + '" r="' + R + '" fill="none" stroke="var(--panel-2)" stroke-width="' + SW + '"></circle>' + arcs + "</svg>" +
    '<div class="alloc-center">' + center + "</div></div>" +
    '<div class="alloc-legend">' + legend + "</div></div>";
}
