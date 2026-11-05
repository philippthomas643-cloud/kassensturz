/* ======================================================================
   Positionen & Gewinn pro Coin (BTC, USDT).
   Ein Coin-Konto kann mehrere Positionen haben – jeder Kauf eine eigene, mit
   eigenem Einkaufspreis und eigenem Gewinn/Verlust; das Konto zeigt zusätzlich
   die Summe. Sammlung `positions`:
     { accountId, qty, paid, quote (USDT|EUR), date, note, txId?, createdAt }
   txId = Buchung, die den Kauf aufs Konto gebracht hat (Umbuchung vom Zahlkonto
   oder Kontostand-Korrektur). Ist sie verknüpft, kommen Menge/Betrag/Datum aus
   der Buchung – Bearbeiten wirkt so an beiden Stellen.
   Kommt weniger auf dem Konto an, als die Positionen enthalten (Verkauf,
   Ausgabe), werden die ältesten zuerst abgebaut (FIFO).
   Altlast 1.4.0: ein Einkaufspreis pro Coin in meta/cost → wird beim Start
   einmalig in Positionen umgewandelt (migrateCost).
   ====================================================================== */
const COINS = ["BTC", "USDT"];
const coinQuotes = (c) => (c === "BTC" ? ["USDT", "EUR"] : ["EUR"]);
const quoteUnit = (q) => (q === "EUR" ? "€" : q);
const coinEps = (c) => (c === "BTC" ? 5e-9 : 5e-7);
const coinDec = (c) => (c === "BTC" ? 8 : 6);
/** Preis mit Einheit, große Preise ohne Nachkommastellen. */
function fmtPx(v, q) {
  if (v == null || !isFinite(v)) return "–";
  return (Math.abs(v) >= 1000 ? nf(0, 0).format(v) : fmtRate(v)) + " " + quoteUnit(q);
}
/** Betrag v von Währung from nach to – mit dem Tageskurs des Buchungstags, falls gespeichert. */
function convertAt(v, from, to, date) {
  if (from === to) return v;
  const s = date ? S.data.snaps.get(date) : null;
  const r = (c) => (c === "EUR" ? 1 : s && s.rates && s.rates[c] > 0 ? s.rates[c] : null);
  if (r(from) != null && r(to) != null) return (v * r(from)) / r(to);
  return convert(v, from, to);
}

/* ---------- Positionen berechnen ---------- */
/** Aktuelle Werte einer Position (aus der verknüpften Buchung, falls vorhanden). null = zählt nicht. */
function posValues(p) {
  if (!p) return null;
  if (p.txId) {
    const t = S.data.tx.get(p.txId);
    if (!t) return null;
    if (t.kind === "transfer") {
      const from = S.data.accounts.get(t.accountId);
      if (!from) return null;
      return { accountId: t.toAccountId, qty: Math.abs(t.toAmount), paid: Math.abs(t.amount), quote: from.currency, date: t.date, payId: from.id };
    }
    if (t.kind === "adjust") return { accountId: t.accountId, qty: t.amount, paid: p.paid, quote: p.quote, date: t.date, payId: "" };
    return null;
  }
  return { accountId: p.accountId, qty: p.qty, paid: p.paid, quote: p.quote, date: p.date, payId: "" };
}
let posMemo = { v: -1, r: -1, byAcc: new Map() };
function accountPositions(accId) {
  if (posMemo.v !== DATA_V || posMemo.r !== RATES_V) posMemo = { v: DATA_V, r: RATES_V, byAcc: new Map() };
  if (!posMemo.byAcc.has(accId)) posMemo.byAcc.set(accId, computeAccountPositions(S.data.accounts.get(accId)));
  return posMemo.byAcc.get(accId);
}
/** Summe mehrerer Teile {qty, cost, quote} in einer gemeinsamen Währung (alle gleich → diese, sonst Euro). */
function sumParts(c, parts) {
  const qs = new Set(parts.map((x) => x.quote));
  const quote = qs.size === 1 ? Array.from(qs)[0] : qs.size ? "EUR" : coinQuotes(c)[0];
  let qty = 0, cost = 0, ok = true;
  for (const x of parts) {
    qty += x.qty;
    const v = convert(x.cost, x.quote, quote);
    if (v == null) ok = false; else cost += v;
  }
  const out = { quote, qty, cost, avg: qty > 0 && ok ? cost / qty : null, price: convert(1, c, quote) };
  if (out.avg > 0 && out.price != null) {
    out.pct = out.price / out.avg - 1;
    out.value = out.price * qty;
    out.pl = out.value - cost;
    out.plEUR = toEUR(out.pl, quote);
  }
  return out;
}
function computeAccountPositions(a) {
  if (!a || !COINS.includes(a.currency)) return null;
  const c = a.currency;
  const list = [];
  for (const p of S.data.positions.values()) {
    const v = posValues(p);
    if (!v || v.accountId !== a.id || !(v.qty > 0) || !(v.paid >= 0) || !coinQuotes(c).includes(v.quote)) continue;
    list.push(Object.assign({ id: p.id, note: p.note || "", txId: p.txId || null, createdAt: p.createdAt || 0, demo: !!p.demo }, v));
  }
  list.sort((x, y) => (x.date || "").localeCompare(y.date || "") || x.createdAt - y.createdAt);
  const bal = balanceOf(a.id);
  const inPos = list.reduce((s, p) => s + p.qty, 0);
  let deficit = inPos - bal > coinEps(c) ? inPos - bal : 0; // Rundungsreste ignorieren
  list.forEach((p, i) => {
    p.n = i + 1;
    const used = Math.min(p.qty, deficit);
    deficit -= used;
    p.open = p.qty - used < coinEps(c) ? 0 : p.qty - used;
    p.sold = p.qty - p.open < coinEps(c) ? 0 : p.qty - p.open;
    p.avg = p.paid / p.qty;
    p.cost = p.avg * p.open;
    p.price = convert(1, c, p.quote);
    if (p.price != null && p.avg > 0) {
      p.pct = p.price / p.avg - 1;
      p.pl = (p.price - p.avg) * p.open;
    }
  });
  const free = bal - inPos;
  const total = sumParts(c, list.filter((p) => p.open > 0).map((p) => ({ qty: p.open, cost: p.cost, quote: p.quote })));
  return { c, bal, list, open: list.filter((p) => p.open > 0), free: free > coinEps(c) ? free : 0, total };
}
/** Alle Konten eines Coins zusammen (die im Gesamtvermögen zählen). */
function coinPL(c) {
  const accs = accountsList(false).filter((a) => a.currency === c && a.includeInTotal !== false);
  let n = 0, free = 0;
  const parts = [];
  for (const a of accs) {
    const ap = accountPositions(a.id);
    if (!ap) continue;
    n += ap.open.length;
    free += ap.free;
    if (ap.total.qty > 0) parts.push(ap.total);
  }
  return Object.assign(sumParts(c, parts), { c, accs, n, free, held: derive().byCur[c].native });
}

/* ---------- Bausteine fürs Anzeigen ---------- */
function plClass(v) { return v == null ? "" : v >= 0 ? "pos" : "neg"; }
function posTitle(p) { return "Position " + p.n + (p.note ? " · " + esc(p.note) : ""); }
function coinStat(l, v, sub, cl) {
  // Zahl groß, Einheit klein darunter – passt auch auf schmale iPhones
  const i = v.lastIndexOf(" ");
  const num = i > 0 ? v.slice(0, i) : v, unit = i > 0 ? v.slice(i + 1) : "";
  return '<div class="coin-stat"><span class="s">' + l + '</span><span class="v' + (cl ? " " + cl : "") + '">' + num + (unit ? ' <span class="u">' + unit + "</span>" : "") + "</span>" + (sub ? '<span class="sub">' + sub + "</span>" : "") + "</div>";
}
function coinStatsHtml(t) {
  return '<div class="coin-stats">' +
    coinStat("Ø Kaufpreis", fmtPx(t.avg, t.quote)) +
    coinStat("Kurs jetzt", fmtPx(t.price, t.quote)) +
    coinStat(t.pl != null && t.pl < 0 ? "Verlust" : "Gewinn", t.pl == null ? "–" : fmtAmt(t.pl, t.quote, { sign: true }), t.quote !== "EUR" && t.plEUR != null ? "≈ " + fmtEUR(t.plEUR, { sign: true }) : "", plClass(t.pl)) +
    "</div>";
}
function pctBadge(pct) {
  if (pct == null) return '<div class="coin-pct faint">Kurs fehlt</div>';
  return '<div class="coin-pct ' + plClass(pct) + '">' + icon(pct >= 0 ? "up" : "down", "sm") + fmtPct(pct * 100, { sign: true }) + "</div>";
}

/* ---------- Übersicht: Gewinn & Verlust ---------- */
function coinsPanelHtml() {
  const d = derive();
  const coins = COINS.filter((c) => d.byCur[c].native > 0);
  if (!coins.length) return "";
  return '<section class="panel o3 coins-panel"><div class="panel-h"><div><h2>Gewinn & Verlust</h2><div class="sub">Deine Coins gegen deinen Ø-Kaufpreis</div></div></div>' +
    '<div class="coins">' + coins.map(coinCardHtml).join("") + "</div></section>";
}
function coinCardHtml(c) {
  const p = coinPL(c);
  const head = (right) => '<div class="coin-h">' + avatarHtml(c) + '<div class="coin-n"><div class="t">' + CUR[c].name + '</div><div class="sub">' + fmtAmt(p.held, c) + "</div></div>" + right + "</div>";
  if (!p.n) {
    if (c !== "BTC") return '<div class="coin coin-mini">' + head('<button class="btn btn-sm" type="button" data-act="pos-new" data-cur="' + c + '" aria-label="Einkaufspreis ' + CUR[c].name + ' eintragen">' + icon("plus", "sm") + "Einkaufspreis</button>") + "</div>";
    return '<div class="coin coin-empty">' + head("") +
      "<p>Für wie viel hast du deine " + fmtAmt(p.held, c) + " gekauft? Trag es als Position ein – dann siehst du deinen Ø-Kaufpreis und wie viel du im Plus oder Minus bist.</p>" +
      '<button class="btn btn-primary btn-sm" type="button" data-act="pos-new" data-cur="' + c + '">' + icon("plus", "sm") + "Einkaufspreis eintragen</button></div>";
  }
  const bits = [p.n + (p.n === 1 ? " Position" : " Positionen")];
  if (p.accs.length > 1) bits.push(p.accs.length + " Konten");
  if (p.free > 0) bits.push(fmtAmt(p.free, c) + " ohne Einkaufspreis");
  return '<div class="coin clickable" role="button" tabindex="0" data-act="pos-coin" data-cur="' + c + '" aria-label="Positionen ' + CUR[c].name + ' ansehen">' + head(pctBadge(p.pct)) +
    coinStatsHtml(p) + '<div class="coin-note">' + icon("layers", "sm") + "<span>" + bits.join(" · ") + "</span>" + icon("right", "sm") + "</div></div>";
}
/** Kurze Zeile für die Konten-Seite (Gruppe BTC/USDT, alle Konten zusammen). */
function coinLineHtml(c) {
  const p = coinPL(c);
  if (!(p.held > 0)) return "";
  if (!p.n) return '<button class="coin-line" type="button" data-act="pos-new" data-cur="' + c + '">' + icon("plus", "sm") + "<span>Einkaufspreis eintragen – für Ø-Kaufpreis und Gewinn</span></button>";
  return '<button class="coin-line" type="button" data-act="pos-coin" data-cur="' + c + '"><span>' + (p.accs.length > 1 ? "Alle Konten: " : "") + "Ø Kaufpreis " + fmtPx(p.avg, p.quote) +
    (p.pct != null ? ' · <b class="' + plClass(p.pct) + '">' + fmtPct(p.pct * 100, { sign: true }) + "</b> (" + fmtAmt(p.pl, p.quote, { sign: true }) + ")" : "") + "</span>" + icon("right", "sm") + "</button>";
}
/** Kurzinfo in der Kontozeile: „2 Positionen · +3,1 %“. */
function accPosSub(a) {
  const ap = accountPositions(a.id);
  if (!ap || !ap.open.length) return "";
  return " · " + ap.open.length + (ap.open.length === 1 ? " Position" : " Positionen") + (ap.total.pct != null ? ' <b class="' + plClass(ap.total.pct) + '">' + fmtPct(ap.total.pct * 100, { sign: true }) + "</b>" : "");
}

/* ---------- Konto-Detail: Positionen ---------- */
function positionsSectionHtml(accId) {
  const ap = accountPositions(accId);
  if (!ap) return "";
  const c = ap.c;
  const addBtn = '<button class="btn btn-sm" type="button" data-act="pos-new" data-acc="' + esc(accId) + '" data-back="1">' + icon("plus", "sm") + "Position hinzufügen</button>";
  let h = '<div class="sec-title pos-sec"><span>Positionen</span>' + (ap.list.length ? addBtn : "") + "</div>";
  if (!ap.list.length) {
    return h + '<div class="coin coin-empty"><p>Jeder Kauf eine eigene Position: mit eigenem Einkaufspreis und eigenem Gewinn – und das Konto zeigt die Summe. ' +
      (ap.free > 0 ? "Fang mit den " + fmtAmt(ap.free, c) + " an, die schon auf dem Konto sind." : "") + "</p>" +
      '<button class="btn btn-primary btn-sm" type="button" data-act="pos-new" data-acc="' + esc(accId) + '" data-back="1">' + icon("plus", "sm") + (ap.free > 0 ? "Einkaufspreis eintragen" : "Erste Position") + "</button></div>";
  }
  const t = ap.total;
  if (t.qty > 0) {
    h += '<div class="coin pos-total"><div class="coin-h"><span class="glyph">' + icon("layers") + '</span><div class="coin-n"><div class="t">Konto gesamt</div><div class="sub">' + fmtAmt(t.qty, c) + " in " + ap.open.length + (ap.open.length === 1 ? " Position" : " Positionen") + "</div></div>" + pctBadge(t.pct) + "</div>" + coinStatsHtml(t) + "</div>";
  }
  const row = (p) => {
    const closed = !(p.open > 0);
    return '<div class="row with-av pos-row clickable' + (closed ? " closed" : "") + '" data-act="pos-edit" data-id="' + esc(p.id) + '" role="button" tabindex="0"><span class="glyph pos-n">' + p.n + "</span>" +
      '<div><div class="t">' + posTitle(p) + (p.demo ? '<span class="tag">Beispiel</span>' : "") + (closed ? '<span class="tag">verkauft</span>' : "") + "</div>" +
      '<div class="sub">' + fmtDate(p.date, true) + " · " + fmtAmt(p.qty, c) + " zu " + fmtPx(p.avg, p.quote) + (p.sold > 0 && !closed ? " · davon " + fmtAmt(p.sold, c) + " verkauft" : "") + "</div></div>" +
      '<div class="amt">' + (p.pct != null ? '<div class="' + plClass(p.pct) + '">' + fmtPct(p.pct * 100, { sign: true }) + "</div>" : "<div>–</div>") +
      (!closed && p.pl != null ? '<div class="sub ' + plClass(p.pl) + '">' + fmtAmt(p.pl, p.quote, { sign: true }) + "</div>" : "") + "</div></div>";
  };
  h += '<div class="rows pos-rows">' + ap.open.map(row).join("") +
    (ap.free > 0 ? '<div class="row with-av pos-free"><span class="glyph">' + icon("info") + '</span><div><div class="t">' + fmtAmt(ap.free, c) + ' ohne Position</div><div class="sub">Kein Einkaufspreis – zählt nicht im Gewinn</div></div>' +
      '<div class="amt"><button class="btn btn-sm" type="button" data-act="pos-new" data-acc="' + esc(accId) + '" data-mode="have" data-back="1">Eintragen</button></div></div>' : "") +
    ap.list.filter((p) => !(p.open > 0)).map(row).join("") + "</div>";
  return h;
}

/* ---------- Position anlegen / bearbeiten ---------- */
function openCoinAccountPicker(c) {
  const accs = accountsList(false).filter((a) => a.currency === c);
  if (!accs.length) { toast("Leg zuerst ein " + CUR[c].name + "-Konto an."); return; }
  if (accs.length === 1) { openPositionForm({ acc: accs[0].id }); return; }
  openModal({
    title: "Welches Konto?",
    body: '<p class="muted" style="margin:0">Zu welchem ' + CUR[c].name + "-Konto gehört die Position?</p><div class=\"rows\">" + accs.map((a) =>
      '<div class="row with-av clickable" data-act="pos-new" data-acc="' + esc(a.id) + '" role="button" tabindex="0">' + avatarHtml(c) + '<div><div class="t">' + esc(a.name) + '</div><div class="sub">' + fmtAmt(balanceOf(a.id), c) + "</div></div>" + icon("right", "sm") + "</div>").join("") + "</div>",
    foot: '<button class="btn" type="button" data-act="close-modal">Abbrechen</button>',
  });
}
function openPositionForm(o = {}) {
  const pos = o.id ? S.data.positions.get(o.id) : null;
  const pv = pos ? posValues(pos) : null;
  if (pos && !pv) { toast("Diese Position gehört zu einer gelöschten Buchung.", { err: true }); return; }
  const accId = pv ? pv.accountId : o.acc;
  const a = S.data.accounts.get(accId);
  if (!a || !COINS.includes(a.currency)) return;
  const c = a.currency;
  const ap = accountPositions(accId);
  const free = ap ? ap.free : 0;
  const isNew = !pos;
  const mode0 = pos ? (pos.txId ? "buy" : "have") : o.mode || (free > 0 ? "have" : "buy");
  const quotes = coinQuotes(c);
  const payAccs = accountsList(false).filter((x) => quotes.includes(x.currency) || (pv && x.id === pv.payId));
  const app = S.data.meta.get("app") || {};
  const pay0 = pv ? pv.payId : app.lastPosPay && payAccs.some((x) => x.id === app.lastPosPay) ? app.lastPosPay : "";
  const q0 = pv ? pv.quote : pay0 ? S.data.accounts.get(pay0).currency : quotes[0];
  const qtyFmt = (v) => fmtNum(v, 0, coinDec(c)).replace(/\./g, "");
  const qty0 = pv ? qtyFmt(pv.qty) : mode0 === "have" && free > 0 ? qtyFmt(free) : "";
  const paid0 = pv ? fmtNum(pv.paid, 2, 2) : "";
  const n = pos && ap ? (ap.list.find((x) => x.id === pos.id) || {}).n : ap ? ap.list.length + 1 : 1;
  const body =
    (isNew ? segHtml("pos-mode", [["buy", "Neu gekauft"], ["have", "Schon auf dem Konto"]], mode0) + '<p class="hint" id="pos-mode-hint" style="margin:-4px 0 0"></p>'
      : '<div class="preview">' + (pos.txId ? icon("swap", "sm") + " Mit der Kauf-Buchung verknüpft – Änderungen gelten auch dort." : "Bestand, der schon auf dem Konto war.") + "</div>") +
    '<div class="grid2">' + fieldHtml("Menge", amountInput("pos-qty", qty0, c, 'placeholder="0,00"' + (isNew && !qty0 ? " autofocus" : ""))) +
    fieldHtml("Kaufdatum", '<input class="input" type="date" id="pos-date" value="' + esc(pv ? pv.date : isoDate()) + '">') + "</div>" +
    segHtml("pos-pm", [["total", "Gesamt bezahlt"], ["price", "Preis pro 1 " + c]], "total") +
    fieldHtml('<span id="pos-paid-lbl">Dafür bezahlt (insgesamt)</span>', amountInput("pos-paid", paid0, q0, 'placeholder="0,00"' + (isNew && qty0 ? " autofocus" : ""))) +
    '<div id="pos-pay-wrap">' + fieldHtml("Bezahlt von", '<select class="select" id="pos-pay"><option value="">Nicht aus Kassensturz – nur ' + c + " dazubuchen</option>" +
      payAccs.map((x) => '<option value="' + esc(x.id) + '"' + (x.id === pay0 ? " selected" : "") + ">" + esc(x.name) + " · " + x.currency + "</option>").join("") + "</select>") + "</div>" +
    (quotes.length > 1 ? '<div class="field" id="pos-q-wrap"><span class="lbl">Bezahlt in</span>' + segHtml("pos-q", quotes.map((q) => [q, q === "EUR" ? "Euro" : q]), q0) + "</div>" : '<input type="hidden" id="seg-pos-q" value="' + q0 + '">') +
    fieldHtml("Notiz <span class=\"faint\">(optional)</span>", '<input class="input" id="pos-note" maxlength="40" value="' + esc(pos ? pos.note || "" : "") + '" placeholder="z. B. Nachkauf im Dip">') +
    '<div class="preview cost-prev" id="pos-prev">–</div>';
  openModal({
    title: (isNew ? "Neue Position" : "Position " + n) + " · " + esc(a.name),
    body,
    foot: (pos ? '<button class="btn btn-ghost btn-danger spacer" type="button" data-act="pos-delete" data-id="' + esc(pos.id) + '">' + icon("trash", "sm") + "Löschen</button>" : "") +
      '<button class="btn" type="button" data-act="' + (o.back ? "account-detail" : "close-modal") + '"' + (o.back ? ' data-id="' + esc(accId) + '"' : "") + ">Abbrechen</button>" +
      '<button class="btn btn-primary" type="submit" id="pos-save">Speichern</button>',
    onMount: (f) => {
      let pm = "total";
      const upd = (changed) => {
        const mode = isNew ? val(f, "seg-pos-mode") : mode0;
        const payId = mode === "buy" ? val(f, "pos-pay") : "";
        const pay = payId ? S.data.accounts.get(payId) : null;
        const q = pay ? pay.currency : val(f, "seg-pos-q");
        f.querySelector("#pos-pay-wrap").hidden = mode !== "buy";
        const qw = f.querySelector("#pos-q-wrap");
        if (qw) qw.hidden = !!pay;
        const qty = parseNum(val(f, "pos-qty"), c);
        // „Schon auf dem Konto“: Menge mit dem freien Bestand vorschlagen
        if (changed === "pos-mode" && mode === "have" && free > 0 && !(qty > 0)) f.querySelector("#pos-qty").value = qtyFmt(free);
        const qty2 = parseNum(val(f, "pos-qty"), c);
        const inp = f.querySelector("#pos-paid");
        const v = parseNum(inp.value, q);
        const m = val(f, "seg-pos-pm");
        if (changed === "pos-pm" && m !== pm && isFinite(v) && v > 0 && qty2 > 0) inp.value = fmtNum(m === "price" ? v / qty2 : v * qty2, 2, 2).replace(/\./g, "");
        pm = m;
        f.querySelector("#pos-paid-lbl").textContent = m === "price" ? "Preis pro 1 " + c : "Dafür bezahlt (insgesamt)";
        f.querySelector("[data-suffix-for=pos-paid]").textContent = quoteUnit(q);
        const hint = f.querySelector("#pos-mode-hint");
        if (hint) hint.textContent = mode === "buy"
          ? "Erhöht den Kontostand von „" + a.name + "“ um die Menge" + (pay ? " und bucht den Betrag von „" + pay.name + "“ ab." : ".")
          : free > 0 ? "Für " + c + ", die schon auf dem Konto sind – ohne Position: " + fmtAmt(free, c) + "." : "Auf dem Konto ist gerade kein " + c + " ohne Position.";
        const x = parseNum(inp.value, q);
        const pvEl = f.querySelector("#pos-prev");
        if (!(qty2 > 0) || !(isFinite(x) && x > 0)) { pvEl.innerHTML = "Trag Menge und Betrag ein – dann rechne ich Kaufpreis und Gewinn dieser Position aus."; return; }
        const avg = m === "price" ? x : x / qty2;
        const price = convert(1, c, q);
        const pct = price != null ? price / avg - 1 : null;
        pvEl.innerHTML = "Kaufpreis <b>" + fmtPx(avg, q) + "</b>" + (price != null ? " · jetzt " + fmtPx(price, q) + ' → <b class="' + plClass(pct) + '">' + fmtPct(pct * 100, { sign: true }) + "</b> (" + fmtAmt((price - avg) * qty2, q, { sign: true }) + ")" : " · aktueller Kurs fehlt");
      };
      bindSegs(f, (nm) => upd(nm));
      for (const id of ["pos-qty", "pos-paid"]) f.querySelector("#" + id).addEventListener("input", () => upd(id));
      f.querySelector("#pos-pay").addEventListener("change", () => upd("pos-pay"));
      upd("init");
    },
    onSubmit: (f) => guarded(f.querySelector("#pos-save"), async () => {
      const mode = isNew ? val(f, "seg-pos-mode") : mode0;
      const payId = mode === "buy" ? val(f, "pos-pay") : "";
      const pay = payId ? S.data.accounts.get(payId) : null;
      const q = pay ? pay.currency : val(f, "seg-pos-q");
      const qty = parseNum(val(f, "pos-qty"), c);
      if (!(isFinite(qty) && qty > 0)) { toast("Gib eine Menge größer als 0 ein.", { err: true }); f.querySelector("#pos-qty").focus(); return; }
      const x = parseNum(val(f, "pos-paid"), q);
      if (!(isFinite(x) && x > 0)) { toast("Gib ein, wie viel du bezahlt hast.", { err: true }); f.querySelector("#pos-paid").focus(); return; }
      const paid = val(f, "seg-pos-pm") === "price" ? x * qty : x;
      const date = validISO(val(f, "pos-date")) ? val(f, "pos-date") : isoDate();
      const note = val(f, "pos-note");
      if (mode === "have") {
        const allowed = free + (pos ? pv.qty : 0);
        if (qty > allowed + coinEps(c)) {
          toast(allowed > 0 ? "Auf dem Konto sind nur " + fmtAmt(allowed, c) + " ohne Position. Dazugekauft? Dann wähl „Neu gekauft“." : "Alles auf dem Konto steckt schon in Positionen. Dazugekauft? Dann wähl „Neu gekauft“.", { err: true });
          return;
        }
      }
      const pid = pos ? pos.id : newId("pos");
      const ops = [];
      const doc = { accountId: accId, qty: round(qty, coinDec(c)), paid: round(paid, 6), quote: q, date, note, createdAt: pos ? pos.createdAt || Date.now() : Date.now(), updatedAt: Date.now() };
      if (pos && pos.demo) doc.demo = true;
      if (mode === "buy") {
        const old = pos && pos.txId ? S.data.tx.get(pos.txId) : null;
        const tid = old ? old.id : newId("tx");
        const base = old ? stripId(old) : { createdAt: Date.now() };
        delete base.toAccountId; delete base.toAmount; delete base.category;
        const label = note || c + "-Kauf";
        const e = pay ? toEUR(paid, pay.currency) : toEUR(qty, c);
        const tx = Object.assign(base, pay
          ? { kind: "transfer", accountId: pay.id, amount: round(paid, 6), toAccountId: accId, toAmount: round(qty, coinDec(c)) }
          : { kind: "adjust", accountId: accId, amount: round(qty, coinDec(c)) },
          { date, note: label, eur: e == null ? null : round(e, 2), posId: pid, updatedAt: Date.now() });
        ops.push(["tx", tid, "set", tx]);
        doc.txId = tid;
        if (isNew) ops.push(["meta", "app", "update", { lastPosPay: payId }]);
      }
      ops.push(["positions", pid, "set", doc]);
      await dbBatch(ops);
      toast(isNew ? "Position " + n + " gespeichert" : "Position gespeichert");
      if (o.back) openAccountDetail(accId); else closeModal();
    }),
  });
}
async function posDelete(id) {
  const p = S.data.positions.get(id);
  if (!p) return;
  const v = posValues(p);
  const t = p.txId ? S.data.tx.get(p.txId) : null;
  const ops = [["positions", id, "delete"]];
  if (t) ops.push(["tx", t.id, "delete"]);
  const undo = [["positions", id, "set", stripId(p)]];
  if (t) undo.push(["tx", t.id, "set", stripId(t)]);
  await dbBatch(ops);
  toast(t ? "Position und Kauf-Buchung gelöscht" : "Position gelöscht", { action: "Rückgängig", onAction: () => guarded(null, () => dbBatch(undo)) });
  if (v && S.data.accounts.get(v.accountId)) openAccountDetail(v.accountId); else closeModal();
}
/** Klick auf Coin-Karte/-Zeile: ein Konto → dessen Positionen, mehrere → Konten-Seite. */
function openCoinPositions(c) {
  const accs = accountsList(false).filter((a) => a.currency === c && a.includeInTotal !== false);
  if (accs.length === 1) openAccountDetail(accs[0].id);
  else location.hash = "#konten";
}
/** Neue Umbuchung Euro/USDT → Coin-Konto gleich als Position führen? (Buchungsformular) */
function txPositionAllowed(fromId, toId) {
  const a = S.data.accounts.get(fromId), b = S.data.accounts.get(toId);
  return !!(a && b && COINS.includes(b.currency) && coinQuotes(b.currency).includes(a.currency));
}
function txPositionOp(txId, doc) {
  const from = S.data.accounts.get(doc.accountId);
  return ["positions", newId("pos"), "set", { accountId: doc.toAccountId, qty: doc.toAmount, paid: doc.amount, quote: from.currency, date: doc.date, note: doc.note || "", txId, createdAt: Date.now() }];
}

/* ---------- Umzug aus 1.4.0: ein Einkaufspreis pro Coin → Positionen ---------- */
function legacyCoinBasis(c) {
  const doc = (S.data.meta.get("cost") || {})[c];
  if (!doc || !(doc.qty > 0) || !(doc.paid >= 0) || !doc.quote) return null;
  let qty = doc.qty, paid = doc.paid;
  const trades = [];
  for (const t of S.data.tx.values()) {
    if (t.kind !== "transfer" || !((t.createdAt || 0) > (doc.at || 0))) continue;
    const a = S.data.accounts.get(t.accountId), b = S.data.accounts.get(t.toAccountId);
    if (!a || !b) continue;
    if (b.currency === c && a.currency !== c) trades.push({ t, buy: true, q: Math.abs(t.toAmount), v: Math.abs(t.amount), vc: a.currency });
    else if (a.currency === c && b.currency !== c) trades.push({ t, buy: false, q: Math.abs(t.amount) });
  }
  trades.sort((x, y) => (x.t.date || "").localeCompare(y.t.date || "") || (x.t.createdAt || 0) - (y.t.createdAt || 0));
  for (const tr of trades) {
    if (!(tr.q > 0)) continue;
    if (tr.buy) {
      const v = convertAt(tr.v, tr.vc, doc.quote, tr.t.date);
      if (v != null) { qty += tr.q; paid += v; }
    } else {
      const avg = qty > 0 ? paid / qty : 0;
      const sold = Math.min(tr.q, qty);
      paid -= avg * sold; qty -= sold;
      if (qty <= 1e-12) { qty = 0; paid = 0; }
    }
  }
  return qty > 0 ? { quote: doc.quote, avg: paid / qty } : null;
}
async function migrateCost() {
  const doc = S.data.meta.get("cost");
  if (!doc || doc.migratedAt) return;
  const ops = [];
  for (const c of COINS) {
    const b = legacyCoinBasis(c);
    if (!b) continue;
    for (const a of accountsList(false)) {
      if (a.currency !== c || a.includeInTotal === false) continue;
      const bal = balanceOf(a.id);
      const has = Array.from(S.data.positions.values()).some((p) => (posValues(p) || {}).accountId === a.id);
      if (!(bal > 0) || has) continue;
      ops.push(["positions", newId("pos"), "set", { accountId: a.id, qty: round(bal, coinDec(c)), paid: round(b.avg * bal, 6), quote: b.quote, date: isoDate(), note: "Übernommen", createdAt: Date.now() }]);
    }
  }
  ops.push(["meta", "cost", "update", { migratedAt: Date.now() }]);
  await dbBatch(ops);
}
