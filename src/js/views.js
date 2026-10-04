/* ======================================================================
   Darstellung
   ====================================================================== */
function curChip(cur) {
  return '<span class="cur" style="--c:' + CUR[cur].color + '">' + cur + "</span>";
}
function curIcon(cur) { return icon(cur === "BTC" ? "btc" : cur === "USDT" ? "usdt" : "eur"); }
function avatarHtml(cur) { return '<span class="avatar" style="--c:' + CUR[cur].color + '" aria-hidden="true">' + curIcon(cur) + "</span>"; }
function demoTag(d) { return d && d.demo ? '<span class="tag">Beispiel</span>' : ""; }
function splitMoney(v) {
  const s = nf(2, 2).format(Math.abs(v));
  const i = s.lastIndexOf(",");
  return { sign: v < -0.004 ? "−" : "", int: s.slice(0, i), dec: s.slice(i + 1) };
}
function pageHead(title, sub, actions) {
  return '<div class="page-h"><div><h1>' + title + "</h1>" + (sub ? "<p>" + sub + "</p>" : "") + '</div><div class="page-actions">' + (actions || "") + "</div></div>";
}
function emptyState(title, text, btn) {
  return '<div class="empty"><h3>' + title + "</h3><p>" + text + "</p>" + (btn || "") + "</div>";
}
function accName(id) {
  const a = S.data.accounts.get(id);
  return a ? esc(a.name) : "Gelöschtes Konto";
}
function changeHtml(v, pct, suffix) {
  if (v == null || !isFinite(v)) return "";
  const up = v >= 0;
  const cls = Math.abs(v) < 0.005 ? "" : up ? "pos" : "neg";
  return '<span class="chg ' + cls + '">' + icon(up ? "up" : "down", "sm") + fmtEUR(v, { sign: true }) + (pct != null && isFinite(pct) ? " · " + fmtPct(pct * 100, { sign: true }) : "") + "</span>" + (suffix ? "<span>" + suffix + "</span>" : "");
}

/* ---------- Rahmen ---------- */
function renderShell() {
  const nav = ROUTES.map((r) => '<a href="#' + r.id + '"' + (S.ui.route === r.id ? ' aria-current="page"' : "") + ">" + icon(r.icon) + "<span>" + r.label + "</span></a>").join("");
  $("#nav-side").innerHTML = nav;
  $("#nav-tab").innerHTML = nav;
  $("#btn-settings-side").innerHTML = icon("sliders") + "<span>Einstellungen</span>";
  $("#btn-settings-top").innerHTML = icon("sliders");
  $("#fab").innerHTML = icon("plus");
  const onboarding = S.runtime !== "ok" || needsWelcome();
  document.body.classList.toggle("onboarding", onboarding);
  $("#fab").hidden = onboarding;
  renderRateBits();
}
function rateStatus() {
  const r = effRates();
  const at = Math.max((r.BTC && r.BTC.at) || 0, (r.USDT && r.USDT.at) || 0);
  if (rateMode() === "manual") return { dot: "off", text: "Manuelle Kurse" + (at ? " · " + fmtTime(at) : ""), short: "Manuell" };
  const st = S.live.state;
  const seeded = ["BTC", "USDT"].some((c) => r[c] && r[c].src === "seed");
  if (st === "ok") {
    const fresh = Date.now() - S.live.at <= 5 * 60 * 1000;
    return fresh
      ? { dot: "live", text: "Live · " + fmtTime(S.live.at) + (S.live.src ? " · " + S.live.src : ""), short: "Live" }
      : { dot: "stale", text: "Stand " + fmtTime(S.live.at) + (S.live.src ? " · " + S.live.src : ""), short: fmtTime(S.live.at) };
  }
  if (!r.BTC && !r.USDT) return st === "loading" || st === "idle" ? { dot: "off", text: "Kurse laden …", short: "Lädt …" } : { dot: "off", text: st === "offline" ? "Offline · noch keine Kurse" : "Keine Kurse erreichbar", short: st === "offline" ? "Offline" : "Keine Kurse" };
  const base = seeded ? "Beispielkurse" : "Stand " + fmtTime(at);
  if (st === "offline") return { dot: "off", text: "Offline · " + base, short: "Offline" };
  if (st === "loading" || st === "idle") return { dot: "stale", text: "Aktualisiere … · " + base, short: "Lädt …" };
  return { dot: "stale", text: base + " · gerade keine Verbindung", short: seeded ? "Beispiel" : fmtTime(at) };
}
function renderRateBits() {
  const r = effRates();
  const st = rateStatus();
  const side = $("#side-rates");
  if (side) {
    side.innerHTML =
      '<div class="r"><span>BTC/EUR</span><b>' + fmtRate(r.BTC && r.BTC.eur) + "</b></div>" +
      '<div class="r"><span>USDT/EUR</span><b>' + fmtRate(r.USDT && r.USDT.eur) + "</b></div>" +
      '<div class="status-line"><span class="dot ' + st.dot + '"></span><span>' + esc(st.text) + "</span></div>";
  }
  const top = $("#top-status");
  if (top) {
    top.innerHTML = '<span class="dot ' + st.dot + '"></span><span>' + esc(st.short) + "</span>";
    top.title = st.text;
    top.hidden = S.runtime !== "ok" || needsWelcome();
  }
  const sub = $("#rates-sub");
  if (sub) sub.textContent = st.text;
}

/* ---------- Hauptbereich ---------- */
let lastMainHtml = "";
function needsWelcome() {
  if (S.runtime !== "ok") return false;
  const app = S.data.meta.get("app");
  if (app && app.onboarded) return false;
  return !S.data.accounts.size && !S.data.tx.size && !S.data.goals.size && !S.data.fixed.size;
}
let renderDeferred = false;
let renderedRoute = "";
/** Baut den Hauptbereich neu auf. passive = von selbst ausgelöst (neue Kurse, Daten), nicht durch einen Tipp. */
function renderMain(passive) {
  const main = $("#main");
  if (S.runtime === "pending") return;
  if (S.runtime !== "ok") {
    main.innerHTML = runtimeMessage();
    lastMainHtml = "";
    return;
  }
  const ae = document.activeElement;
  const typing = !!(ae && main.contains(ae) && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName));
  if (passive && typing) {
    // Während getippt wird nichts austauschen (sonst springt die Tastatur bzw. die Seite) – danach nachholen
    if (!renderDeferred) {
      renderDeferred = true;
      ae.addEventListener("blur", () => { renderDeferred = false; scheduleRender(); }, { once: true });
    }
    return;
  }
  const keep = typing && ae.id ? { id: ae.id, s: ae.selectionStart, e: ae.selectionEnd } : null;
  const scrollY0 = window.scrollY;
  const scrollers = $$("[data-keep-scroll]", main).map((el) => [el.dataset.keepScroll, el.scrollTop, el.scrollLeft]);
  let html;
  if (needsWelcome()) html = welcomeHtml();
  else {
    html = banners();
    const v = VIEWS[S.ui.route] || VIEWS.uebersicht;
    html += v();
  }
  if (html === lastMainHtml && main.firstChild) return; // nichts geändert – kein Neuaufbau, kein Flackern
  lastMainHtml = html;
  main.innerHTML = html;
  for (const [k, t, l] of scrollers) {
    const el = main.querySelector('[data-keep-scroll="' + k + '"]');
    if (el) { el.scrollTop = t; el.scrollLeft = l; }
  }
  if (keep) {
    const el = document.getElementById(keep.id);
    if (el) {
      el.focus({ preventScroll: true });
      try { if (keep.s != null) el.setSelectionRange(keep.s, keep.e); } catch (e) { /* select */ }
    }
  }
  afterRender();
  const routeChanged = renderedRoute !== S.ui.route;
  renderedRoute = S.ui.route;
  if (routeChanged) window.scrollTo(0, 0);
  else keepScroll(scrollY0);
}
/** Safari hat keine Scroll-Verankerung: Position nach dem Neuaufbau ausdrücklich halten. */
function keepScroll(y) {
  if (Math.abs(window.scrollY - y) > 1) window.scrollTo(0, y);
  requestAnimationFrame(() => { if (Math.abs(window.scrollY - y) > 1 && document.documentElement.scrollHeight - window.innerHeight >= y) window.scrollTo(0, y); });
}
/** Nur die Vermögenskarte neu zeichnen (Diagramm-Umschalter, Zeitraum, Aufteilung …). */
function renderHero() {
  const old = $("#main .hero");
  if (!old) { renderMain(); return; }
  const y = window.scrollY;
  const t = document.createElement("div");
  t.innerHTML = heroHtml();
  old.replaceWith(t.firstElementChild);
  lastMainHtml = "";
  drawNetWorthChart();
  keepScroll(y);
}
/** Nur den Umrechner aktualisieren – das Eingabefeld bleibt, wie es ist. */
function renderConverter() {
  const box = $("#main .conv");
  if (!box) { renderMain(); return; }
  const inp = $("#conv-amt");
  if (inp && inp.value !== S.ui.conv.amt) inp.value = S.ui.conv.amt;
  for (const b of $$('[data-act="conv-cur"]', box)) b.setAttribute("aria-pressed", String(b.dataset.cur === S.ui.conv.cur));
  const out = $("#conv-out");
  if (out) out.innerHTML = converterOut();
  lastMainHtml = "";
}
function runtimeMessage() {
  return '<div class="boot"><h2>Speicher nicht verfügbar</h2><p>Dieser Browser lässt Kassensturz gerade keine Daten speichern' + (S.bootError ? " (" + esc(S.bootError) + ")" : "") + '. Das passiert z. B. im privaten Surfmodus. Öffne Kassensturz in einem normalen Safari-Fenster oder direkt über das App-Icon auf deinem Home-Bildschirm.</p><p><button class="btn btn-primary" type="button" onclick="location.reload()">Neu laden</button></p></div>';
}
function banners() {
  let h = "";
  if (S.update.waiting) {
    h += '<div class="banner accent"><div class="b-txt">' + icon("sparkle") + "<span><b>Update bereit" + (S.update.version ? " – Version " + esc(S.update.version) : "") + ".</b> Ein Tipp, und Kassensturz startet neu – deine Daten bleiben, wie sie sind.</span></div>" +
      '<div class="b-act"><button class="btn btn-sm btn-primary" type="button" data-act="apply-update">Jetzt aktualisieren</button></div></div>';
  }
  if (S.ui.route === "uebersicht") {
    h += installBannerHtml() + backupBannerHtml();
    if (hasDemo()) {
      h += '<div class="banner compact"><div class="b-txt">' + icon("info") + "<span><b>Beispieldaten</b> – lösch sie, wenn du mit deinen eigenen Zahlen loslegst.</span></div>" +
        '<div class="b-act"><button class="btn btn-sm" type="button" data-act="clear-demo">Löschen</button></div></div>';
    }
  }
  const d = derive();
  if (d.missing.length && allLoaded()) {
    h += '<div class="banner warn"><div class="b-txt">' + icon("alert") + "<span>Für " + d.missing.join(" und ") + " fehlt noch ein Kurs, deshalb fehlen diese Konten in der Euro-Summe. Sobald du online bist, kommt er automatisch – oder du trägst ihn selbst ein.</span></div>" +
      '<div class="b-act"><button class="btn btn-sm" type="button" data-act="open-settings">Kurs eintragen</button></div></div>';
  }
  return h;
}
function installBannerHtml() {
  if (isStandalone() || !installSuggested()) return "";
  if (isIOS()) {
    return '<div class="banner accent compact"><div class="b-txt">' + icon("phone") + "<span><b>Als App installieren</b> – Teilen " + icon("share", "sm") + " → „Zum Home-Bildschirm“</span></div>" +
      '<div class="b-act"><button class="btn btn-sm btn-primary" type="button" data-act="install-guide">So geht’s</button><button class="icon-btn sm" type="button" data-act="dismiss-install" aria-label="Später" title="Später">' + icon("x", "sm") + "</button></div></div>";
  }
  if (S.install.prompt) {
    return '<div class="banner accent compact"><div class="b-txt">' + icon("download") + "<span><b>Kassensturz als App installieren</b> – eigenes Icon, läuft offline</span></div>" +
      '<div class="b-act"><button class="btn btn-sm btn-primary" type="button" data-act="install-app">Installieren</button><button class="icon-btn sm" type="button" data-act="dismiss-install" aria-label="Später" title="Später">' + icon("x", "sm") + "</button></div></div>";
  }
  return "";
}
function backupBannerHtml() {
  const real = Array.from(S.data.accounts.values()).filter((a) => !a.demo);
  if (!real.length) return "";
  const app = S.data.meta.get("app") || {};
  const last = app.lastBackupAt || 0;
  const firstAt = Math.min.apply(null, real.map((a) => a.createdAt || Date.now()));
  const snoozed = +uiPref("backupSnooze", "0") > Date.now();
  if (snoozed || Date.now() - firstAt < 7 * 86400000 || Date.now() - last < 30 * 86400000) return "";
  return '<div class="banner"><div class="b-txt">' + icon("shield") + "<span><b>Zeit für ein Backup.</b> Deine Daten liegen nur auf diesem iPhone. " + (last ? "Das letzte Backup ist vom " + fmtDate(isoDate(new Date(last)), true) + "." : "Du hast noch keins gemacht.") + " Sicher es z. B. in iCloud Drive.</span></div>" +
    '<div class="b-act"><button class="btn btn-sm btn-primary" type="button" data-act="export-json">Backup sichern</button><button class="btn btn-sm" type="button" data-act="snooze-backup">Später</button></div></div>';
}
function allLoaded() { return COLS.every((c) => S.loaded[c]); }

/* ---------- Willkommen ---------- */
function welcomeHtml() {
  const ios = isIOS() && !isStandalone();
  return '<div class="welcome">' +
    '<div class="welcome-logo"><img src="icons/icon-192.png" alt="" width="64" height="64"><b>Kassensturz</b></div>' +
    "<h1>Dein Geld.<br><span class=\"grad\">Alles auf einen Blick.</span></h1>" +
    '<p class="lead">Euro, USDT und Bitcoin – live in Euro umgerechnet. Dazu Fixkosten, Budgets, Ziele und dein Vermögensverlauf.</p>' +
    '<ul class="feats">' +
    '<li><span class="avatar" style="--c:var(--eur)">' + icon("shield") + "</span><span><b>Privat.</b> Deine Daten bleiben auf diesem Gerät – kein Konto, kein Server.</span></li>" +
    '<li><span class="avatar" style="--c:var(--usdt)">' + icon("wifi") + "</span><span><b>Offline.</b> Läuft auch ohne Internet. Kurse kommen live, sobald du online bist.</span></li>" +
    '<li><span class="avatar" style="--c:var(--btc)">' + icon("target") + "</span><span><b>Ziele.</b> Kassensturz meldet sich bei 50, 75, 90 und 100 %.</span></li>" +
    "</ul>" +
    (ios ? '<div class="banner accent" style="margin:0"><div class="b-txt">' + icon("phone") + "<span><b>Tipp:</b> Hol dir Kassensturz zuerst als App auf den Home-Bildschirm – Safari und die App speichern getrennt.</span></div>" +
      '<div class="b-act"><button class="btn btn-sm btn-primary" type="button" data-act="install-guide">So geht’s</button></div></div>' : "") +
    '<div class="welcome-actions">' +
    '<button class="btn btn-primary btn-lg" type="button" data-act="start-empty">Mit eigenen Konten starten</button>' +
    '<button class="btn btn-lg" type="button" data-act="load-demo">Erst mit Beispieldaten ansehen</button>' +
    '<label class="btn btn-ghost" for="wl-import">' + icon("upload", "sm") + 'Backup einspielen</label><input type="file" id="wl-import" accept="application/json,.json" hidden>' +
    "</div>" +
    '<p class="small">Version ' + esc(APP.version) + " · Deine Daten bleiben auf diesem Gerät</p>" +
    "</div>";
}

/* ---------- Übersicht ---------- */
function snapAround(targetISO) {
  // letzter Snapshot an oder vor dem Datum, sonst der früheste danach
  let best = null, first = null;
  for (const s of S.data.snaps.values()) {
    if (!s.date || !isFinite(s.total)) continue;
    if (!first || s.date < first.date) first = s;
    if (s.date <= targetISO && (!best || s.date > best.date)) best = s;
  }
  return best || first;
}
function chartView() {
  const v = S.ui.chart.view;
  if (v === "growth" || v === "alloc") return v;
  return S.data.snaps.size >= 3 ? "growth" : "alloc";
}
function heroHtml() {
  const d = derive();
  const m = splitMoney(d.total);
  const base = snapAround(addDays(isoDate(), -30));
  let delta = "";
  if (base && base.date < isoDate() && accountsList().length) {
    const ch = d.total - base.total;
    const days = daysBetween(base.date, isoDate());
    delta = changeHtml(ch, base.total ? ch / Math.abs(base.total) : null, days >= 28 ? "seit 30 Tagen" : "seit " + fmtDate(base.date));
  } else {
    const n = accountsList().length;
    delta = "<span>" + (n ? n + (n === 1 ? " Konto" : " Konten") + " · der Verlauf startet heute" : "Leg dein erstes Konto an, dann rechnet Kassensturz hier alles in Euro zusammen.") + "</span>";
  }
  const view = chartView();
  const sw = '<div class="seg view-switch" role="group" aria-label="Diagramm">' +
    '<button type="button" data-act="chart-view" data-v="growth" aria-pressed="' + (view === "growth") + '">' + icon("chart", "sm") + " Verlauf</button>" +
    '<button type="button" data-act="chart-view" data-v="alloc" aria-pressed="' + (view === "alloc") + '">' + icon("donut", "sm") + " Aufteilung</button></div>";
  let area;
  if (view === "alloc") {
    const by = S.ui.chart.allocBy === "acc" ? "acc" : "cur";
    area = '<div class="chart-area">' + allocHtml() + "</div>" +
      '<div class="chart-foot"><div class="seg mini" role="group" aria-label="Aufteilen nach">' +
      '<button type="button" data-act="alloc-by" data-v="cur" aria-pressed="' + (by === "cur") + '">Assets</button>' +
      '<button type="button" data-act="alloc-by" data-v="acc" aria-pressed="' + (by === "acc") + '">Konten</button></div>' +
      '<span class="faint" style="font-size:12.5px">Anteile in Euro</span></div>';
  } else {
    const ch = S.ui.chart;
    const ranges = ["1M", "3M", "6M", "1J", "Alles"].map((r) => '<button type="button" data-act="chart-range" data-v="' + r + '" aria-pressed="' + (ch.range === r) + '">' + r + "</button>").join("");
    const modes = [["total", "Gesamt"], ["cur", "Assets"]].map(([k, l]) => '<button type="button" data-act="chart-mode" data-v="' + k + '" aria-pressed="' + (ch.mode === k) + '">' + l + "</button>").join("");
    area = '<div class="chart-area"><div class="chart" id="chart-nw"' + (lastChartH && !ch.table ? ' style="min-height:' + lastChartH + 'px"' : "") + "></div></div>" +
      '<div class="chart-foot"><div class="seg mini" role="group" aria-label="Zeitraum">' + ranges + "</div>" +
      '<div style="display:flex;gap:6px;align-items:center"><div class="seg mini" role="group" aria-label="Ansicht">' + modes + "</div>" +
      '<button class="icon-btn sm' + (ch.table ? " filled" : "") + '" type="button" data-act="chart-table" aria-pressed="' + ch.table + '" aria-label="Als Tabelle zeigen" title="Tabelle">' + icon("table", "sm") + "</button></div></div>";
  }
  return '<section class="panel hero o1" aria-label="Gesamtvermögen">' +
    '<div class="eyebrow">Gesamtvermögen</div>' +
    '<div class="hero-value" aria-label="' + esc(fmtEUR(d.total)) + '">' + m.sign + m.int + '<span class="minor">,' + m.dec + '</span><span class="cur-sym">€</span></div>' +
    '<div class="hero-delta">' + delta + "</div>" + heroGoalHtml() + sw + area + "</section>";
}
function ratesPanelHtml() {
  const r = effRates();
  const st = rateStatus();
  const q = (c, label) => {
    const rr = r[c];
    const ch = rr && rr.ch24;
    return '<div class="quote"><div class="pair"><span class="sw" style="width:8px;height:8px;border-radius:50%;background:' + CUR[c].color + '"></span>' + label + "</div>" +
      '<div class="px">' + (rr ? fmtRate(rr.eur) + " €" : "–") + "</div>" +
      (ch != null && isFinite(ch) ? '<div class="ch ' + (ch >= 0 ? "pos" : "neg") + '">' + fmtPct(ch, { sign: true, dec: 2 }) + ' <span class="faint">24 h</span></div>' : '<div class="ch faint">24 h –</div>') + "</div>";
  };
  return '<div class="panel-h"><div><h2>Kurse & Umrechner</h2><div class="sub" id="rates-sub">' + esc(st.text) + "</div></div>" +
    '<button class="icon-btn sm filled' + (S.live.busy ? " spin" : "") + '" type="button" data-act="refresh-rates" aria-label="Kurse aktualisieren" title="Kurse aktualisieren">' + icon("refresh", "sm") + "</button></div>" +
    '<div class="quotes">' + q("BTC", "1 Bitcoin") + q("USDT", "1 Tether") + "</div>" +
    '<div style="margin-top:14px">' + converterHtml() + "</div>";
}
function accountsCompact() {
  const accs = accountsList();
  if (!accs.length)
    return emptyState("Noch keine Konten", "Leg dein erstes Konto an – zum Beispiel dein Girokonto in Euro, deine USDT auf der Börse oder dein BTC-Wallet.", '<button class="btn btn-primary" type="button" data-act="new-account">' + icon("plus") + "Konto anlegen</button>");
  const d = derive();
  let h = "";
  for (const c of CURS) {
    const list = accs.filter((a) => a.currency === c);
    if (!list.length) continue;
    const g = d.byCur[c];
    h += '<div class="group"><div class="group-h"><span class="gt"><span class="sw" style="background:' + CUR[c].color + '"></span>' + CUR[c].name + "</span>" +
      '<span class="gv">' + (c === "EUR" ? "<b>" + fmtEUR(g.native) + "</b>" : "<b>" + fmtAmt(g.native, c) + "</b> · " + (g.eur == null ? "Kurs fehlt" : "≈ " + fmtEUR(g.eur))) + "</span></div><div class=\"rows\">";
    for (const a of list) {
      const b = balanceOf(a.id);
      const e = toEUR(b, a.currency);
      h += '<div class="row with-av clickable" data-act="account-detail" data-id="' + esc(a.id) + '" role="button" tabindex="0">' + avatarHtml(a.currency) +
        '<div><div class="t">' + esc(a.name) + demoTag(a) + (a.includeInTotal === false ? '<span class="tag">nicht in Summe</span>' : "") + '</div><div class="sub">' + (ACC_KINDS[a.kind] || "Konto") + "</div></div>" +
        '<div class="amt"><div>' + fmtAmt(b, a.currency) + "</div>" + (a.currency !== "EUR" ? '<div class="sub">' + (e == null ? "Kurs fehlt" : "≈ " + fmtEUR(e)) + "</div>" : "") + "</div></div>";
    }
    h += "</div></div>";
  }
  return h;
}
function converterHtml() {
  const c = S.ui.conv;
  const segs = CURS.map((x) => '<button type="button" data-act="conv-cur" data-cur="' + x + '" aria-pressed="' + (c.cur === x) + '">' + x + "</button>").join("");
  return '<div class="conv"><div class="conv-in"><label class="sr" for="conv-amt">Betrag</label>' +
    '<input id="conv-amt" class="input amount" inputmode="decimal" autocomplete="off" value="' + esc(c.amt) + '" placeholder="Betrag">' +
    '<div class="seg" role="group" aria-label="Währung">' + segs + "</div></div>" +
    '<div class="conv-out" id="conv-out">' + converterOut() + "</div></div>";
}
function converterOut() {
  const c = S.ui.conv;
  const v = parseNum(c.amt, c.cur);
  if (!isFinite(v)) return '<div class="hint">Gib einen Betrag ein, z. B. 0,05 oder 1.500</div>';
  const rows = [];
  for (const to of CURS) {
    if (to === c.cur) continue;
    const r = convert(v, c.cur, to);
    rows.push('<div class="kv"><span class="k">' + curChip(to) + CUR[to].name + '</span><span class="v">' + (r == null ? "Kurs fehlt" : fmtAmt(r, to)) + "</span></div>");
  }
  const btc = c.cur === "BTC" ? v : convert(v, c.cur, "BTC");
  if (btc != null) rows.push('<div class="kv"><span class="k"><span class="cur" style="--c:var(--btc)">SATS</span>Satoshi</span><span class="v">' + fmtSats(btc) + "</span></div>");
  return rows.join("");
}
function monthPanelHtml() {
  const ym = monthKey(isoDate());
  const f = monthFlows(ym);
  let fixExp = 0, fixInc = 0;
  for (const x of S.data.fixed.values()) {
    if (x.active === false) continue;
    if (x.kind === "income") fixInc += monthlyEquivEUR(x); else fixExp += monthlyEquivEUR(x);
  }
  const due = fixedDueInMonth(ym).filter((o) => o.f.kind !== "income");
  const booked = due.filter((o) => o.booked).length;
  return '<div class="panel-h"><div><h2>' + monthLabel(ym) + '</h2><div class="sub">Dieser Monat</div></div><a class="link-btn" href="#buchungen">Buchungen' + icon("right", "sm") + "</a></div>" +
    '<div class="stats"><div class="stat"><span class="s">Einnahmen</span><span class="v pos">' + fmtEUR(f.inc) + '</span></div><div class="stat"><span class="s">Ausgaben</span><span class="v">' + fmtEUR(f.exp) + '</span></div><div class="stat"><span class="s">Saldo</span><span class="v ' + (f.net < 0 ? "neg" : "") + '">' + fmtEUR(f.net, { sign: true }) + "</span></div></div>" +
    '<div style="margin-top:10px">' +
    '<div class="kv"><span>Fixkosten pro Monat</span><span class="v">' + fmtEUR(fixExp) + "</span></div>" +
    '<div class="kv"><span>Fixe Einnahmen pro Monat</span><span class="v">' + fmtEUR(fixInc) + "</span></div>" +
    '<div class="kv"><span>Frei nach Fixkosten</span><span class="v ' + (fixInc - fixExp < 0 ? "neg" : "") + '">' + fmtEUR(fixInc - fixExp, { sign: true }) + "</span></div>" +
    (due.length ? '<div class="kv"><span>Fixkosten gebucht</span><span class="v">' + booked + " von " + due.length + "</span></div>" : "") +
    "</div>";
}
function upcomingHtml() {
  const today = isoDate();
  const items = [];
  for (const f of S.data.fixed.values()) {
    if (f.active === false) continue;
    const st = fixedStatus(f, today);
    if (st.state === "open" || st.state === "soon") items.push({ f, st });
    else if (st.next && daysBetween(today, st.next) <= 14) items.push({ f, st: { state: "upcoming", due: st.next } });
  }
  items.sort((a, b) => a.st.due.localeCompare(b.st.due));
  let body;
  if (!S.data.fixed.size) body = emptyState("Keine Fixkosten", "Trag Miete, Abos und Versicherungen ein, dann siehst du hier, was als Nächstes fällig ist.", '<button class="btn" type="button" data-act="new-fixed">' + icon("plus") + "Fixkosten anlegen</button>");
  else if (!items.length) body = '<p class="muted" style="margin:6px 0 0">In den nächsten 14 Tagen ist nichts fällig.</p>';
  else body = '<div class="rows">' + items.slice(0, 6).map(({ f, st }) => fixedRowCompact(f, st)).join("") + "</div>";
  return '<div class="panel-h"><div><h2>Demnächst fällig</h2><div class="sub">Offene und anstehende Fixkosten</div></div><a class="link-btn" href="#fixkosten">Alle' + icon("right", "sm") + "</a></div>" + body;
}
function statusPill(f, st) {
  if (st.state === "open") return '<span class="pill warn">' + icon("clock") + "fällig " + relDays(st.due) + "</span>";
  if (st.state === "soon") return '<span class="pill">' + icon("clock") + relDays(st.due) + "</span>";
  if (st.state === "paid") return '<span class="pill good">' + icon("check") + (f.kind === "income" ? "erhalten" : "gebucht") + "</span>";
  return '<span class="pill">' + icon("clock") + fmtDate(st.due) + "</span>";
}
function fixedRowCompact(f, st) {
  const sign = f.kind === "income" ? 1 : -1;
  const canBook = st.state === "open" || st.state === "soon";
  return '<div class="row"><div><div class="t">' + esc(f.name) + demoTag(f) + '</div><div class="sub">' + fmtDay(st.due) + (f.accountId ? " · " + accName(f.accountId) : "") + "</div></div>" +
    '<div class="amt"><div class="' + (sign > 0 ? "pos" : "") + '">' + fmtAmt(sign * f.amount, f.currency || "EUR", { sign: sign > 0 }) + '</div><div style="margin-top:5px;display:flex;gap:6px;justify-content:flex-end;align-items:center">' + statusPill(f, st) +
    (canBook ? '<button class="btn btn-sm" type="button" data-act="book-fixed" data-id="' + esc(f.id) + '" data-due="' + st.due + '">Buchen</button>' : "") + "</div></div></div>";
}
function goalStatusText(g, p) {
  const al = goalAlert(g.id);
  if (p.pct >= 1) return al && al.reachedAt ? "Erreicht am " + fmtDate(isoDate(new Date(al.reachedAt)), true) : "Ziel erreicht";
  if (g.kind === "networth") return "aus deinem Gesamtvermögen";
  return validISO(g.deadline) ? "bis " + fmtDate(g.deadline, true) : "";
}
function goalsCompact() {
  const goals = goalsList();
  if (!goals.length) return emptyState("Noch keine Ziele", "Setz dir ein Vermögensziel wie 50.000 € oder ein Sparziel wie 0,25 BTC. Kassensturz meldet sich, wenn du es erreichst.", '<button class="btn" type="button" data-act="new-goal">' + icon("plus") + "Ziel anlegen</button>");
  return goals.slice(0, 4).map((g) => {
    const p = goalProgress(g);
    return '<div class="budget"><div class="budget-top"><span class="name">' + esc(g.name) + " " + (g.kind === "networth" ? '<span class="tag">Vermögen</span> ' : "") + demoTag(g) + '</span><span class="vals"><b>' + fmtAmt(p.current, g.currency, { max: 5 }) + "</b> von " + fmtAmt(g.target, g.currency, { max: 5 }) + "</span></div>" +
      '<div class="meter' + (p.pct >= 1 ? " good" : "") + '"><i style="width:' + Math.min(100, Math.max(0, p.pct * 100)).toFixed(1) + '%"></i></div>' +
      '<div class="budget-foot"><span>' + fmtPct(p.pct * 100, { dec: 0 }) + " erreicht</span><span>" + goalStatusText(g, p) + "</span></div></div>";
  }).join("");
}
function heroGoalHtml() {
  const nw = goalsList().filter((g) => g.kind === "networth");
  if (!nw.length) return "";
  const withP = nw.map((g) => ({ g, p: goalProgress(g) }));
  const open = withP.filter((x) => x.p.pct < 1).sort((a, b) => b.p.pct - a.p.pct);
  const x = open[0] || withP.sort((a, b) => b.g.target - a.g.target)[0];
  const label = esc(x.g.name) + (/\d/.test(x.g.name) ? "" : " · " + fmtAmt(x.g.target, x.g.currency, { max: 5, min: x.g.currency === "EUR" ? 0 : undefined }));
  return '<a class="hero-goal" href="#ziele"><span class="hg-l">' + icon("target", "sm") + label + "</span>" +
    '<span class="meter' + (x.p.pct >= 1 ? " good" : "") + '"><i style="width:' + Math.min(100, Math.max(0, x.p.pct * 100)).toFixed(1) + '%"></i></span>' +
    '<span class="hg-r">' + (x.p.pct >= 1 ? "erreicht" : fmtPct(x.p.pct * 100, { dec: 0 })) + "</span></a>";
}
function quickActionsHtml() {
  const b = (act, kind, ic, label) => '<button type="button" data-act="' + act + '"' + (kind ? ' data-kind="' + kind + '"' : "") + '><span class="qi">' + icon(ic) + '</span><span class="ql">' + label + "</span></button>";
  return '<div class="quick hide-desk o2" role="group" aria-label="Schnell erfassen">' +
    b("new-tx", "expense", "down", "Ausgabe") + b("new-tx", "income", "up", "Einnahme") + b("new-tx", "transfer", "swap", "Umbuchung") + b("adjust-picker", "", "adjust", "Kontostand") + "</div>";
}
function budgetCompact() {
  const ym = monthKey(isoDate());
  const f = monthFlows(ym);
  const list = Array.from(S.data.budgets.values()).map((b) => ({ b, spent: f.cats.get(b.category) || 0 })).sort((x, y) => y.spent / (y.b.limit || 1) - x.spent / (x.b.limit || 1));
  if (!list.length) return emptyState("Noch kein Budget", "Leg Monatslimits für Kategorien fest, zum Beispiel 400 € für Lebensmittel.", '<button class="btn" type="button" data-act="new-budget">' + icon("plus") + "Budget anlegen</button>");
  return list.slice(0, 4).map(({ b, spent }) => budgetBlock(b, spent, true)).join("");
}
function budgetState(spent, limit) {
  const p = limit > 0 ? spent / limit : 0;
  if (p > 1) return { cls: "crit", pill: '<span class="pill crit">' + icon("alert") + "überzogen</span>" };
  if (p >= 0.85) return { cls: "warn", pill: '<span class="pill warn">' + icon("alert") + "fast ausgeschöpft</span>" };
  return { cls: "", pill: '<span class="pill good">' + icon("check") + "im Rahmen</span>" };
}
function budgetBlock(b, spent, compact) {
  const p = b.limit > 0 ? spent / b.limit : 0;
  const st = budgetState(spent, b.limit);
  const rest = b.limit - spent;
  return '<div class="budget"><div class="budget-top"><span class="name">' + esc(b.category) + " " + demoTag(b) + '</span><span class="vals"><b>' + fmtEUR(spent) + "</b> von " + fmtEUR(b.limit, { dec: 0 }) + "</span></div>" +
    '<div class="meter ' + st.cls + '"><i style="width:' + Math.min(100, p * 100).toFixed(1) + '%"></i></div>' +
    '<div class="budget-foot">' + st.pill + "<span>" + (rest >= 0 ? "noch " + fmtEUR(rest) : fmtEUR(-rest) + " drüber") + (compact ? "" : ' <button class="icon-btn sm" type="button" data-act="edit-budget" data-id="' + esc(b.id) + '" aria-label="Budget bearbeiten">' + icon("pencil", "sm") + "</button>") + "</span></div></div>";
}
function recentTxHtml() {
  const list = txList().slice(0, 6);
  if (!list.length) return emptyState("Noch keine Buchungen", "Erfass Einnahmen, Ausgaben oder Umbuchungen zwischen deinen Konten – die Salden passen sich automatisch an.", '<button class="btn" type="button" data-act="new-tx">' + icon("plus") + "Buchung erfassen</button>");
  return '<div class="rows">' + list.map((t) => txRow(t, true)).join("") + "</div>";
}

const VIEWS = {};
VIEWS.uebersicht = function () {
  const now = new Date();
  const accountsPanel = '<section class="panel o3"><div class="panel-h"><div><h2>Konten</h2><div class="sub">Stand jetzt, umgerechnet in Euro</div></div><div class="panel-tools"><button class="btn btn-sm" type="button" data-act="new-account">' + icon("plus", "sm") + "Konto</button></div></div>" + accountsCompact() + "</section>";
  const goalsPanel = '<section class="panel o7"><div class="panel-h"><div><h2>Ziele</h2><div class="sub">Vermögens- und Sparziele</div></div><a class="link-btn" href="#ziele">Alle' + icon("right", "sm") + "</a></div>" + goalsCompact() + "</section>";
  const budgetPanel = '<section class="panel o8"><div class="panel-h"><div><h2>Budget ' + MONTHS[now.getMonth()] + '</h2><div class="sub">Ausgaben gegen dein Monatslimit</div></div><a class="link-btn" href="#budget">Alle' + icon("right", "sm") + "</a></div>" + budgetCompact() + "</section>";
  const recentPanel = '<section class="panel o9"><div class="panel-h"><div><h2>Letzte Buchungen</h2></div><div class="panel-tools"><a class="link-btn" href="#buchungen">Alle' + icon("right", "sm") + "</a></div></div>" + recentTxHtml() + "</section>";
  return '<div class="dash ov">' +
    '<div class="stack c8">' + heroHtml() + quickActionsHtml() + accountsPanel + budgetPanel + recentPanel + "</div>" +
    '<div class="stack c4"><section class="panel o4">' + ratesPanelHtml() + '</section><section class="panel o5">' + upcomingHtml() + '</section><section class="panel o6">' + monthPanelHtml() + "</section>" + goalsPanel + "</div>" +
    "</div>";
};

/* ---------- Konten ---------- */
VIEWS.konten = function () {
  const accs = accountsList(true);
  const active = accs.filter((a) => !a.archived);
  const archived = accs.filter((a) => a.archived);
  const d = derive();
  const head = pageHead("Konten", active.length ? active.length + (active.length === 1 ? " Konto" : " Konten") + " · zusammen " + fmtEUR(d.total) : "Alles, was du besitzt – in Euro, USDT und BTC",
    '<button class="btn btn-primary" type="button" data-act="new-account">' + icon("plus") + "Konto anlegen</button>");
  if (!accs.length)
    return head + '<section class="panel">' + emptyState("Noch keine Konten", "Leg für jedes Konto, jede Börse und jedes Wallet einen Eintrag an. Den Kontostand kannst du jederzeit aktualisieren – Kassensturz rechnet BTC und USDT automatisch in Euro um.", '<button class="btn btn-primary" type="button" data-act="new-account">' + icon("plus") + "Erstes Konto anlegen</button>") + "</section>";
  let h = head + '<div class="dash">';
  for (const c of CURS) {
    const list = active.filter((a) => a.currency === c);
    if (!list.length) continue;
    const g = d.byCur[c];
    h += '<section class="panel c12"><div class="group-h" style="padding:0 0 4px"><span class="gt"><span class="sw" style="background:' + CUR[c].color + '"></span>' + CUR[c].name + " · " + c + "</span>" +
      '<span class="gv"><b>' + fmtAmt(g.native, c) + "</b>" + (c !== "EUR" ? " · " + (g.eur == null ? "Kurs fehlt" : "≈ " + fmtEUR(g.eur)) : "") + (c === "BTC" ? " · " + fmtSats(g.native) : "") + "</span></div>" +
      '<div class="rows">' + list.map(accRowFull).join("") + "</div></section>";
  }
  h += "</div>";
  if (archived.length) {
    h += '<div style="margin-top:18px"><button class="link-btn" type="button" data-act="toggle-archived">' + (S.ui.showArchived ? "Archivierte Konten ausblenden" : "Archivierte Konten anzeigen (" + archived.length + ")") + "</button></div>";
    if (S.ui.showArchived) h += '<section class="panel" style="margin-top:12px"><div class="rows">' + archived.map(accRowFull).join("") + "</div></section>";
  }
  return h;
};
function accRowFull(a) {
  const b = balanceOf(a.id);
  const e = toEUR(b, a.currency);
  const n = derive().txCount.get(a.id) || 0;
  return '<div class="row acc-row clickable" data-act="account-detail" data-id="' + esc(a.id) + '" role="button" tabindex="0">' + avatarHtml(a.currency) + '<div><div class="t">' + esc(a.name) + demoTag(a) + (a.archived ? '<span class="tag">archiviert</span>' : "") + (a.includeInTotal === false ? '<span class="tag">nicht in Summe</span>' : "") + "</div>" +
    '<div class="sub">' + (ACC_KINDS[a.kind] || "Konto") + " · " + n + (n === 1 ? " Buchung" : " Buchungen") + (a.note ? " · " + esc(a.note) : "") + "</div></div>" +
    '<div class="bal"><div class="n">' + fmtAmt(b, a.currency) + "</div>" + (a.currency !== "EUR" ? '<div class="e">' + (e == null ? "Kurs fehlt" : "≈ " + fmtEUR(e)) + "</div>" : "") + (a.currency === "BTC" ? '<div class="e">' + fmtSats(b) + "</div>" : "") + "</div>" +
    '<div class="row-actions hide-phone">' +
    '<button class="btn btn-sm" type="button" data-act="adjust-balance" data-id="' + esc(a.id) + '">' + icon("adjust", "sm") + "Kontostand</button>" +
    '<button class="icon-btn" type="button" data-act="new-tx" data-acc="' + esc(a.id) + '" aria-label="Buchung für ' + esc(a.name) + '" title="Buchung erfassen">' + icon("plus") + "</button>" +
    '<button class="icon-btn" type="button" data-act="edit-account" data-id="' + esc(a.id) + '" aria-label="' + esc(a.name) + ' bearbeiten" title="Bearbeiten">' + icon("pencil") + "</button>" +
    "</div></div>";
}

/* ---------- Buchungen ---------- */
function txTitle(t) {
  if (t.kind === "transfer") return t.note ? esc(t.note) : "Umbuchung";
  if (t.kind === "adjust") return "Kontostand angepasst";
  return esc(t.note || t.category || (t.kind === "income" ? "Einnahme" : "Ausgabe"));
}
function txRow(t, compact) {
  const a = S.data.accounts.get(t.accountId);
  const cur = a ? a.currency : "EUR";
  let glyph, amt, sub, cls = "";
  if (t.kind === "transfer") {
    const b = S.data.accounts.get(t.toAccountId);
    glyph = '<span class="glyph">' + icon("swap") + "</span>";
    sub = accName(t.accountId) + " → " + accName(t.toAccountId);
    amt = "<div>" + fmtAmt(-Math.abs(t.amount), cur) + '</div><div class="sub">' + (b ? fmtAmt(Math.abs(t.toAmount), b.currency, { sign: true }) : "") + "</div>";
  } else if (t.kind === "adjust") {
    glyph = '<span class="glyph">' + icon("adjust") + "</span>";
    sub = accName(t.accountId) + (t.note ? " · " + esc(t.note) : "");
    amt = "<div>" + fmtAmt(t.amount, cur, { sign: true }) + "</div>" + (cur !== "EUR" ? '<div class="sub">≈ ' + fmtEUR(Math.abs(txEUR(t)) * Math.sign(t.amount || 0), { sign: true }) + "</div>" : "");
  } else {
    const inc = t.kind === "income";
    glyph = '<span class="glyph' + (inc ? " in" : "") + '">' + icon(inc ? "up" : "down") + "</span>";
    sub = (t.note && t.category ? esc(t.category) + " · " : "") + accName(t.accountId) + (t.fixedId ? " · Fixkosten" : "");
    cls = inc ? "pos" : "";
    amt = '<div class="' + cls + '">' + fmtAmt(inc ? Math.abs(t.amount) : -Math.abs(t.amount), cur, { sign: inc }) + "</div>" + (cur !== "EUR" ? '<div class="sub">≈ ' + fmtEUR(txEUR(t)) + "</div>" : "");
  }
  const when = compact ? fmtDay(t.date) + " · " : "";
  return '<div class="row tx-row clickable" data-act="edit-tx" data-id="' + esc(t.id) + '" role="button" tabindex="0">' + glyph +
    '<div><div class="t">' + txTitle(t) + demoTag(t) + '</div><div class="sub">' + when + sub + "</div></div>" +
    '<div class="amt">' + amt + "</div></div>";
}
VIEWS.buchungen = function () {
  const f = S.ui.tx;
  if (!f.month) f.month = monthKey(isoDate());
  const all = txList();
  const list = all.filter((t) => {
    if (f.month !== "all" && monthKey(t.date || "") !== f.month) return false;
    if (f.acc && t.accountId !== f.acc && t.toAccountId !== f.acc) return false;
    if (f.kind && t.kind !== f.kind) return false;
    if (f.cat && t.category !== f.cat) return false;
    if (f.q) {
      const q = f.q.toLowerCase();
      const hay = [t.note, t.category, accName(t.accountId), t.toAccountId ? accName(t.toAccountId) : ""].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  let inc = 0, exp = 0;
  for (const t of list) {
    const acc = S.data.accounts.get(t.accountId);
    if (acc && acc.includeInTotal === false) continue;
    if (t.kind === "income") inc += txEUR(t);
    else if (t.kind === "expense") exp += txEUR(t);
  }
  const head = pageHead("Buchungen", "Einnahmen, Ausgaben und Umbuchungen – jede Buchung ändert den Kontostand", '<button class="btn btn-primary hide-phone" type="button" data-act="new-tx">' + icon("plus") + "Buchung erfassen</button>");
  const monthCtl = f.month === "all"
    ? '<button class="btn btn-sm" type="button" data-act="tx-month" data-v="' + monthKey(isoDate()) + '">Nur ' + monthLabel(monthKey(isoDate())) + "</button>"
    : '<div class="month-nav"><button class="icon-btn sm" type="button" data-act="tx-month-step" data-v="-1" aria-label="Vorheriger Monat">' + icon("left", "sm") + '</button><span class="lbl">' + monthLabel(f.month) + '</span><button class="icon-btn sm" type="button" data-act="tx-month-step" data-v="1" aria-label="Nächster Monat">' + icon("right", "sm") + "</button></div>" +
      '<button class="btn btn-sm btn-ghost" type="button" data-act="tx-month" data-v="all">Alle Monate</button>';
  const accOpts = '<option value="">Alle Konten</option>' + accountsList(true).map((a) => '<option value="' + esc(a.id) + '"' + (f.acc === a.id ? " selected" : "") + ">" + esc(a.name) + "</option>").join("");
  const kindOpts = [["", "Alle Arten"], ["expense", "Ausgaben"], ["income", "Einnahmen"], ["transfer", "Umbuchungen"], ["adjust", "Kontostand-Korrekturen"]].map(([k, l]) => '<option value="' + k + '"' + (f.kind === k ? " selected" : "") + ">" + l + "</option>").join("");
  const cats = Array.from(new Set(all.map((t) => t.category).filter(Boolean))).sort((a, b) => a.localeCompare(b, "de"));
  const catOpts = '<option value="">Alle Kategorien</option>' + cats.map((c) => '<option value="' + esc(c) + '"' + (f.cat === c ? " selected" : "") + ">" + esc(c) + "</option>").join("");
  let h = head +
    '<div class="filters"><div class="f-month">' + monthCtl + "</div>" +
    '<input class="input" id="f-q" data-filter="q" type="search" placeholder="Suchen …" value="' + esc(f.q) + '" aria-label="Suchen">' +
    '<div class="f-scroll" data-keep-scroll="txfilters">' +
    '<select class="select" id="f-acc" data-filter="acc" aria-label="Konto">' + accOpts + "</select>" +
    '<select class="select" id="f-kind" data-filter="kind" aria-label="Art">' + kindOpts + "</select>" +
    '<select class="select" id="f-cat" data-filter="cat" aria-label="Kategorie">' + catOpts + "</select>" +
    "</div></div>" +
    '<div class="stats stats-panel"><div class="stat"><span class="s">Einnahmen</span><span class="v pos">' + fmtEUR(inc) + '</span></div><div class="stat"><span class="s">Ausgaben</span><span class="v">' + fmtEUR(exp) + '</span></div><div class="stat"><span class="s">Saldo</span><span class="v ' + (inc - exp < 0 ? "neg" : "") + '">' + fmtEUR(inc - exp, { sign: true }) + "</span></div></div>";
  if (!list.length) {
    h += '<section class="panel">' + (all.length ? emptyState("Keine Buchungen gefunden", "Für diese Auswahl gibt es keine Buchungen. Wechsel den Monat oder setz die Filter zurück.", '<button class="btn" type="button" data-act="tx-reset">Filter zurücksetzen</button>') : emptyState("Noch keine Buchungen", "Erfass deine erste Einnahme oder Ausgabe. Umbuchungen zwischen Konten – auch Euro zu BTC – gehen genauso.", '<button class="btn btn-primary" type="button" data-act="new-tx">' + icon("plus") + "Buchung erfassen</button>")) + "</section>";
    return h;
  }
  const days = new Map();
  for (const t of list) { const k = t.date || "–"; if (!days.has(k)) days.set(k, []); days.get(k).push(t); }
  h += '<section class="panel">';
  let shown = 0;
  for (const [day, ts] of days) {
    if (shown > 400) break;
    let dsum = 0;
    for (const t of ts) { if (t.kind === "income") dsum += txEUR(t); else if (t.kind === "expense") dsum -= txEUR(t); }
    h += '<div class="day"><div class="day-h"><span>' + (validISO(day) ? fmtDay(day) : day) + "</span><span>" + (dsum ? fmtEUR(dsum, { sign: true }) : "") + '</span></div><div class="rows">' + ts.map((t) => txRow(t, false)).join("") + "</div></div>";
    shown += ts.length;
  }
  h += "</section>";
  return h;
};

/* ---------- Fixkosten ---------- */
VIEWS.fixkosten = function () {
  const all = Array.from(S.data.fixed.values());
  const exp = all.filter((f) => f.kind !== "income").sort((a, b) => monthlyEquivEUR(b) - monthlyEquivEUR(a));
  const inc = all.filter((f) => f.kind === "income").sort((a, b) => monthlyEquivEUR(b) - monthlyEquivEUR(a));
  let mExp = 0, mInc = 0;
  for (const f of all) { if (f.active === false) continue; if (f.kind === "income") mInc += monthlyEquivEUR(f); else mExp += monthlyEquivEUR(f); }
  const head = pageHead("Fixkosten", "Wiederkehrende Ausgaben und Einnahmen – umgerechnet auf den Monat", '<button class="btn btn-primary" type="button" data-act="new-fixed">' + icon("plus") + "Fixkosten anlegen</button>");
  if (!all.length)
    return head + '<section class="panel">' + emptyState("Noch keine Fixkosten", "Miete, Strom, Handy, Versicherungen, Abos – trag alles ein, was regelmäßig abgeht oder reinkommt. Du siehst dann, was dir pro Monat bleibt.", '<button class="btn btn-primary" type="button" data-act="new-fixed">' + icon("plus") + "Fixkosten anlegen</button>") + "</section>";
  const today = isoDate();
  const ym = monthKey(today);
  const dueM = fixedDueInMonth(ym);
  const cats = new Map();
  for (const f of exp) if (f.active !== false) cats.set(f.category || "Sonstiges", (cats.get(f.category || "Sonstiges") || 0) + monthlyEquivEUR(f));
  const catList = Array.from(cats.entries()).sort((a, b) => b[1] - a[1]);
  const maxC = catList.length ? catList[0][1] : 1;
  let h = head +
    '<div class="stats four stats-panel">' +
    '<div class="stat"><span class="s">Fixkosten / Monat</span><span class="v">' + fmtEUR(mExp) + "</span></div>" +
    '<div class="stat"><span class="s">Fixkosten / Jahr</span><span class="v">' + fmtEUR(mExp * 12, { dec: 0 }) + "</span></div>" +
    '<div class="stat"><span class="s">Fixe Einnahmen / Monat</span><span class="v pos">' + fmtEUR(mInc) + "</span></div>" +
    '<div class="stat"><span class="s">Übrig / Monat</span><span class="v ' + (mInc - mExp < 0 ? "neg" : "") + '">' + fmtEUR(mInc - mExp, { sign: true }) + "</span></div></div>" +
    '<div class="dash">' +
    '<section class="panel c7"><div class="panel-h"><div><h2>Ausgaben</h2><div class="sub">' + exp.length + " Posten · nach Monatsbetrag sortiert</div></div></div>" + (exp.length ? '<div class="rows">' + exp.map((f) => fixedRowFull(f, today)).join("") + "</div>" : '<p class="muted">Noch keine fixen Ausgaben.</p>') + "</section>" +
    '<div class="stack c5">' +
    '<section class="panel"><div class="panel-h"><div><h2>Nach Kategorie</h2><div class="sub">Monatsbetrag in Euro</div></div></div>' +
    (catList.length ? catList.map(([c, v]) => '<div class="hbar"><span class="lab" title="' + esc(c) + '">' + esc(c) + '</span><span class="track"><i style="width:' + ((v / maxC) * 100).toFixed(1) + '%"></i></span><span class="val">' + fmtEUR(v) + "</span></div>").join("") : '<p class="muted">Keine aktiven Ausgaben.</p>') + "</section>" +
    '<section class="panel"><div class="panel-h"><div><h2>' + MONTHS[parseISO(today).getMonth()] + '</h2><div class="sub">Was diesen Monat fällig ist</div></div></div>' +
    (dueM.length ? '<div class="rows">' + dueM.map((o) => '<div class="row"><div><div class="t">' + esc(o.f.name) + '</div><div class="sub">' + fmtDay(o.due) + "</div></div>" + '<div class="amt"><div class="' + (o.f.kind === "income" ? "pos" : "") + '">' + fmtAmt((o.f.kind === "income" ? 1 : -1) * o.f.amount, o.f.currency || "EUR", { sign: o.f.kind === "income" }) + '</div><div class="sub">' + (o.booked ? "gebucht" : o.due < today ? "nicht gebucht" : "offen") + "</div></div></div>").join("") + "</div>" : '<p class="muted">Diesen Monat ist nichts fällig.</p>') +
    "</section></div>" +
    '<section class="panel c12"><div class="panel-h"><div><h2>Einnahmen</h2><div class="sub">Gehalt, Mieteinnahmen, Staking …</div></div><button class="btn btn-sm" type="button" data-act="new-fixed" data-kind="income">' + icon("plus", "sm") + "Fixe Einnahme</button></div>" + (inc.length ? '<div class="rows">' + inc.map((f) => fixedRowFull(f, today)).join("") + "</div>" : '<p class="muted" style="margin:0">Noch keine fixen Einnahmen. Trag dein Gehalt ein, dann siehst du oben, was nach den Fixkosten übrig bleibt.</p>') + "</section>" +
    "</div>";
  return h;
};
function fixedRowFull(f, today) {
  const inactive = f.active === false;
  const st = inactive ? null : fixedStatus(f, today);
  const cur = f.currency || "EUR";
  const sign = f.kind === "income" ? 1 : -1;
  const iv = INTERVALS[f.interval] || INTERVALS.monthly;
  const meq = monthlyEquivEUR(f);
  const subBits = [iv.label];
  if (f.accountId) subBits.push(accName(f.accountId));
  if (f.category) subBits.push(esc(f.category));
  const canBook = st && (st.state === "open" || st.state === "soon");
  return '<div class="row" style="' + (inactive ? "opacity:.6" : "") + '"><div><div class="t">' + esc(f.name) + demoTag(f) + (inactive ? '<span class="tag">pausiert</span>' : "") + '</div><div class="sub">' + subBits.join(" · ") + (st && st.next ? " · nächste " + fmtDate(st.next) : "") + "</div>" +
    (st ? '<div style="margin-top:7px;display:flex;gap:6px;align-items:center;flex-wrap:wrap">' + statusPill(f, st) + (canBook ? '<button class="btn btn-sm" type="button" data-act="book-fixed" data-id="' + esc(f.id) + '" data-due="' + st.due + '">' + (f.kind === "income" ? "Als erhalten buchen" : "Als bezahlt buchen") + "</button>" : "") + "</div>" : "") + "</div>" +
    '<div class="amt"><div class="' + (sign > 0 ? "pos" : "") + '">' + fmtAmt(sign * f.amount, cur, { sign: sign > 0 }) + "</div>" +
    ((f.interval !== "monthly" || cur !== "EUR") ? '<div class="sub">≈ ' + fmtEUR(meq) + " / Monat</div>" : "") +
    '<div class="row-actions" style="margin-top:4px"><button class="icon-btn sm" type="button" data-act="edit-fixed" data-id="' + esc(f.id) + '" aria-label="' + esc(f.name) + ' bearbeiten">' + icon("pencil", "sm") + "</button></div></div></div>";
}

/* ---------- Budget ---------- */
VIEWS.budget = function () {
  if (!S.ui.budgetMonth) S.ui.budgetMonth = monthKey(isoDate());
  const ym = S.ui.budgetMonth;
  const f = monthFlows(ym);
  const budgets = Array.from(S.data.budgets.values()).sort((a, b) => String(a.category).localeCompare(String(b.category), "de"));
  const budgeted = new Set(budgets.map((b) => b.category));
  let limit = 0, spentB = 0, spentOther = 0;
  for (const b of budgets) { limit += +b.limit || 0; spentB += f.cats.get(b.category) || 0; }
  for (const [c, v] of f.cats) if (!budgeted.has(c)) spentOther += v;
  const monthNav = '<div class="month-nav"><button class="icon-btn sm" type="button" data-act="budget-month" data-v="-1" aria-label="Vorheriger Monat">' + icon("left", "sm") + '</button><span class="lbl">' + monthLabel(ym) + '</span><button class="icon-btn sm" type="button" data-act="budget-month" data-v="1" aria-label="Nächster Monat">' + icon("right", "sm") + "</button></div>";
  const head = pageHead("Budget", "Monatslimits pro Kategorie – gezählt werden Ausgaben in Euro", monthNav + '<button class="btn btn-primary" type="button" data-act="new-budget">' + icon("plus") + "Budget anlegen</button>");
  let h = head +
    '<div class="stats four stats-panel">' +
    '<div class="stat"><span class="s">Budget gesamt</span><span class="v">' + fmtEUR(limit, { dec: 0 }) + "</span></div>" +
    '<div class="stat"><span class="s">Davon ausgegeben</span><span class="v">' + fmtEUR(spentB) + "</span></div>" +
    '<div class="stat"><span class="s">Noch verfügbar</span><span class="v ' + (limit - spentB < 0 ? "neg" : "") + '">' + fmtEUR(limit - spentB) + "</span></div>" +
    '<div class="stat"><span class="s">Ohne Budget ausgegeben</span><span class="v">' + fmtEUR(spentOther) + "</span></div></div>";
  const catList = Array.from(f.cats.entries()).sort((a, b) => b[1] - a[1]);
  const maxC = catList.length ? catList[0][1] : 1;
  h += '<div class="dash"><section class="panel c7"><div class="panel-h"><div><h2>Limits</h2><div class="sub">' + monthLabel(ym) + "</div></div></div>" +
    (budgets.length ? budgets.map((b) => budgetBlock(b, f.cats.get(b.category) || 0, false)).join("") : emptyState("Noch kein Budget", "Leg fest, wie viel du pro Monat für eine Kategorie ausgeben willst. Jede Ausgabe in dieser Kategorie zählt automatisch dagegen.", '<button class="btn btn-primary" type="button" data-act="new-budget">' + icon("plus") + "Budget anlegen</button>")) +
    "</section>" +
    '<section class="panel c5"><div class="panel-h"><div><h2>Ausgaben nach Kategorie</h2><div class="sub">' + monthLabel(ym) + " · " + fmtEUR(f.exp) + " gesamt</div></div></div>" +
    (catList.length ? catList.map(([c, v]) => {
      const b = budgets.find((x) => x.category === c);
      return '<div class="hbar"><span class="lab" title="' + esc(c) + '">' + esc(c) + '</span><span class="track"><i style="width:' + ((v / maxC) * 100).toFixed(1) + '%"></i></span><span class="val">' + fmtEUR(v) + (b ? ' <span class="faint" style="font-weight:450">/ ' + fmtEUR(b.limit, { dec: 0 }) + "</span>" : "") + "</span></div>";
    }).join("") : '<p class="muted" style="margin:0">In ' + monthLabel(ym) + " gibt es noch keine Ausgaben.</p>") +
    "</section></div>";
  return h;
};

/* ---------- Ziele ---------- */
VIEWS.ziele = function () {
  const goals = goalsList();
  const head = pageHead("Ziele", "Vermögensziele zählen dein ganzes Vermögen, Sparziele nur die verknüpften Konten", '<button class="btn btn-primary" type="button" data-act="new-goal">' + icon("plus") + "Ziel anlegen</button>");
  let body;
  if (!goals.length)
    body = '<section class="panel">' + emptyState("Noch keine Ziele", "Ein Vermögensziel wie 50.000 € misst dein gesamtes Vermögen. Ein Sparziel wie 0,25 BTC oder 10.000 € Notgroschen misst nur die Konten, die du verknüpfst. Bei 50, 75, 90 und 100 % meldet sich Kassensturz.", '<button class="btn btn-primary" type="button" data-act="new-goal">' + icon("plus") + "Erstes Ziel anlegen</button>") + "</section>";
  else body = '<div class="goal-grid">' + goals.map(goalCard).join("") + "</div>";
  return head + body + notifyPanelHtml();
};
function goalCard(g) {
  const p = goalProgress(g);
  const rest = Math.max(0, g.target - p.current);
  const accs = (g.accountIds || []).map((id) => S.data.accounts.get(id)).filter(Boolean);
  const eurHint = g.currency !== "EUR" ? toEUR(p.current, g.currency) : null;
  const al = goalAlert(g.id);
  const lvl = al && al.level ? al.level : 0;
  return '<section class="panel goal' + (p.pct >= 1 ? " reached" : "") + '"><div class="g-top"><div><div class="g-name">' + esc(g.name) + "</div>" +
    '<div class="g-tags"><span class="tag">' + (g.kind === "networth" ? "Vermögensziel" : "Sparziel") + "</span>" + demoTag(g) +
    (g.notify === false ? '<span class="tag" title="Keine Meldungen">' + icon("belloff", "sm") + "stumm</span>" : "") + "</div></div>" +
    '<button class="icon-btn sm" type="button" data-act="edit-goal" data-id="' + esc(g.id) + '" aria-label="' + esc(g.name) + ' bearbeiten">' + icon("pencil", "sm") + "</button></div>" +
    '<div><div class="g-val">' + fmtAmt(p.current, g.currency, { max: 5 }) + '</div><div class="faint" style="font-size:13px">von ' + fmtAmt(g.target, g.currency, { max: 5 }) + (eurHint != null ? " · ≈ " + fmtEUR(eurHint) + " aktuell" : "") + "</div></div>" +
    '<div class="meter' + (p.pct >= 1 ? " good" : "") + '"><i style="width:' + Math.min(100, Math.max(0, p.pct * 100)).toFixed(1) + '%"></i>' + MILESTONES.filter((m) => m < 1).map((m) => '<b class="tick" style="left:' + m * 100 + '%"></b>').join("") + "</div>" +
    '<div class="g-meta"><span>' + fmtPct(p.pct * 100, { dec: 0 }) + " erreicht</span><span>" + (p.pct >= 1 ? goalStatusText(g, p) : "noch " + fmtAmt(rest, g.currency, { max: 5 })) + "</span></div>" +
    (validISO(g.deadline) && p.pct < 1 ? '<div class="g-meta"><span>Bis ' + fmtDate(g.deadline, true) + "</span><span>" + (p.perMonth != null ? fmtAmt(p.perMonth, g.currency, { max: 5 }) + " pro Monat" : "") + "</span></div>" : "") +
    (g.kind === "networth" ? '<div class="faint" style="font-size:12.5px">Zählt alle Konten, die im Gesamtvermögen sind.</div>' : "") +
    (accs.length ? '<div style="display:flex;gap:6px;flex-wrap:wrap">' + accs.map((a) => '<span class="cur" style="--c:' + CUR[a.currency].color + '">' + esc(a.name) + "</span>").join("") + "</div>" : "") +
    (+g.manual && g.kind !== "networth" ? '<div class="faint" style="font-size:12.5px">inkl. ' + fmtAmt(+g.manual, g.currency) + " manuell</div>" : "") +
    (p.pct < 1 && g.notify !== false && notifyPrefs().milestones ? '<div class="faint" style="font-size:12.5px">' + icon("bell", "sm") + " Nächste Meldung bei " + Math.round((MILESTONES.find((m) => m > Math.max(p.pct, lvl)) || 1) * 100) + " %</div>" : "") +
    "</section>";
}
function notifyPanelHtml() {
  const a = alertsDoc();
  const pr = notifyPrefs();
  const log = a && Array.isArray(a.log) ? a.log.slice(-8).reverse() : [];
  const sw = (key, label, sub) => '<label class="switch"><input type="checkbox" id="nt-' + key + '" data-notify="' + key + '"' + (pr[key] ? " checked" : "") + '><span class="sw-ui" aria-hidden="true"></span><span class="sw-t"><b>' + label + "</b><span>" + sub + "</span></span></label>";
  const status = a && a.lastRun
    ? "Zuletzt geprüft " + fmtTime(a.lastRun) + (isFinite(a.lastTotal) ? " · Vermögen " + fmtEUR(a.lastTotal, { dec: 0 }) : "")
    : "Wird beim nächsten Öffnen geprüft.";
  return '<section class="panel notify" style="margin-top:16px"><div class="panel-h"><div><h2>' + icon("bell", "sm") + " Meldungen</h2>" +
    '<div class="sub">Kassensturz prüft deine Ziele, sobald du die App öffnest und solange sie läuft. Die Meldungen erscheinen direkt in der App.</div></div></div>' +
    '<div class="nt-status">' + icon("clock", "sm") + "<span>" + esc(status) + "</span></div>" +
    '<div class="switches">' +
    sw("goals", "Ziel erreicht", "Sobald ein Ziel 100 % erreicht") +
    sw("milestones", "Zwischenstände", "Bei 50 %, 75 % und 90 %") +
    sw("weekly", "Wochenrückblick", "Ab Sonntagabend: Vermögen und Woche im Vergleich") +
    sw("crash", "Kursrutsch-Warnung", "Wenn dein Vermögen seit gestern mehr als " + pr.crashPct + " % verloren hat") +
    "</div>" +
    (log.length ? '<div class="sec-title" style="margin-top:14px">Letzte Meldungen</div><div class="rows">' + log.map((l) => '<div class="row"><div><div class="t" style="font-weight:540">' + esc(l.text) + '</div><div class="sub">' + fmtTime(l.at) + "</div></div></div>").join("") + "</div>" : "") +
    "</section>";
}
