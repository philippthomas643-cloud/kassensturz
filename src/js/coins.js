/* ======================================================================
   Einkaufspreis & Gewinn pro Coin (BTC, USDT).
   Du trägst ein, was du für deinen aktuellen Bestand bezahlt hast (in USDT
   oder EUR) – daraus wird der Ø-Kaufpreis. Spätere Käufe/Verkäufe per
   Umbuchung (z. B. USDT → BTC) rechnet die App nach der Durchschnitts-
   methode automatisch weiter. Gespeichert in meta/cost:
     { BTC: { qty, paid, quote, at }, USDT: { … } }
   qty/paid = Bestand und Einsatz beim Eintragen, at = Zeitpunkt (ms);
   gezählt werden danach angelegte Umbuchungen (createdAt > at).
   ====================================================================== */
const COINS = ["BTC", "USDT"];
const coinQuotes = (c) => (c === "BTC" ? ["USDT", "EUR"] : ["EUR"]);
const quoteUnit = (q) => (q === "EUR" ? "€" : q);
function costDoc() { return S.data.meta.get("cost") || {}; }
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
/** Einstand eines Coins inkl. Käufe/Verkäufe per Umbuchung seit dem Eintragen. */
function coinBasis(c) {
  const doc = costDoc()[c];
  if (!doc || !(doc.qty > 0) || !(doc.paid >= 0) || !doc.quote) return null;
  const quote = doc.quote;
  let qty = doc.qty, paid = doc.paid, realized = 0, buys = 0, sells = 0;
  const trades = [];
  for (const t of S.data.tx.values()) {
    if (t.kind !== "transfer" || !((t.createdAt || 0) > (doc.at || 0))) continue;
    const a = S.data.accounts.get(t.accountId), b = S.data.accounts.get(t.toAccountId);
    if (!a || !b) continue;
    if (b.currency === c && a.currency !== c) trades.push({ t, buy: true, q: Math.abs(t.toAmount), v: Math.abs(t.amount), vc: a.currency });
    else if (a.currency === c && b.currency !== c) trades.push({ t, buy: false, q: Math.abs(t.amount), v: Math.abs(t.toAmount), vc: b.currency });
  }
  trades.sort((x, y) => (x.t.date || "").localeCompare(y.t.date || "") || (x.t.createdAt || 0) - (y.t.createdAt || 0));
  for (const tr of trades) {
    if (!(tr.q > 0)) continue;
    const v = convertAt(tr.v, tr.vc, quote, tr.t.date);
    if (tr.buy) {
      if (v == null) continue;
      qty += tr.q; paid += v; buys++;
    } else {
      const avg = qty > 0 ? paid / qty : 0;
      const sold = Math.min(tr.q, qty);
      if (v != null) realized += v * (sold / tr.q) - avg * sold;
      paid -= avg * sold; qty -= sold; sells++;
      if (qty <= 1e-12) { qty = 0; paid = 0; }
    }
  }
  return { quote, qty, paid, avg: qty > 0 ? paid / qty : null, buys, sells, realized, at: doc.at };
}
/** Bestand, Ø-Kaufpreis, aktueller Kurs und Gewinn/Verlust eines Coins. */
function coinPL(c) {
  const held = derive().byCur[c].native;
  const basis = coinBasis(c);
  const out = { c, held, basis, avg: basis ? basis.avg : null, quote: basis ? basis.quote : coinQuotes(c)[0] };
  if (out.avg == null) return out;
  out.price = convert(1, c, out.quote);
  if (out.price == null || !(out.avg > 0)) return out;
  out.pct = out.price / out.avg - 1;
  out.pl = (out.price - out.avg) * held;
  out.plEUR = toEUR(out.pl, out.quote);
  return out;
}

/* ---------- Übersicht: Gewinn & Verlust ---------- */
function coinsPanelHtml() {
  const d = derive();
  const coins = COINS.filter((c) => d.byCur[c].native > 0);
  if (!coins.length) return "";
  return '<section class="panel o3 coins-panel"><div class="panel-h"><div><h2>Gewinn & Verlust</h2><div class="sub">Deine Coins gegen deinen Ø-Kaufpreis</div></div></div>' +
    '<div class="coins">' + coins.map(coinCardHtml).join("") + "</div></section>";
}
function coinTradesNote(b) {
  if (!b || !(b.buys + b.sells)) return "";
  const bits = [];
  if (b.buys) bits.push(b.buys + (b.buys === 1 ? " Kauf" : " Käufe"));
  if (b.sells) bits.push(b.sells + (b.sells === 1 ? " Verkauf" : " Verkäufe"));
  return '<div class="coin-note">' + icon("swap", "sm") + "<span>Per Umbuchung eingerechnet: " + bits.join(", ") +
    (b.sells && Math.abs(b.realized) >= 0.005 ? ' · realisiert <b class="' + (b.realized >= 0 ? "pos" : "neg") + '">' + fmtAmt(b.realized, b.quote, { sign: true }) + "</b>" : "") + "</span></div>";
}
function coinCardHtml(c) {
  const p = coinPL(c);
  const head = (right) => '<div class="coin-h">' + avatarHtml(c) + '<div class="coin-n"><div class="t">' + CUR[c].name + '</div><div class="sub">' + fmtAmt(p.held, c) + "</div></div>" + right + "</div>";
  if (p.avg == null) {
    if (c !== "BTC") return '<div class="coin coin-mini">' + head('<button class="btn btn-sm" type="button" data-act="cost-edit" data-cur="' + c + '" aria-label="Einkaufspreis ' + CUR[c].name + ' eintragen">' + icon("plus", "sm") + "Einkaufspreis</button>") + "</div>";
    return '<div class="coin coin-empty">' + head("") +
      '<p>Für wie viel hast du deine ' + fmtAmt(p.held, c) + " gekauft? Trag es ein – dann siehst du deinen Ø-Kaufpreis und wie viel du im Plus oder Minus bist.</p>" +
      '<button class="btn btn-primary btn-sm" type="button" data-act="cost-edit" data-cur="' + c + '">' + icon("plus", "sm") + "Einkaufspreis eintragen</button></div>";
  }
  const up = p.pct == null ? null : p.pct >= 0;
  const cls = up == null ? "" : up ? "pos" : "neg";
  const pct = p.pct == null ? '<div class="coin-pct faint">Kurs fehlt</div>' : '<div class="coin-pct ' + cls + '">' + icon(up ? "up" : "down", "sm") + fmtPct(p.pct * 100, { sign: true }) + "</div>";
  // Zahl groß, Einheit klein darunter – passt auch auf schmale iPhones
  const stat = (l, v, sub, cl) => {
    const i = v.lastIndexOf(" ");
    const num = i > 0 ? v.slice(0, i) : v, unit = i > 0 ? v.slice(i + 1) : "";
    return '<div class="coin-stat"><span class="s">' + l + '</span><span class="v' + (cl ? " " + cl : "") + '">' + num + (unit ? ' <span class="u">' + unit + "</span>" : "") + "</span>" + (sub ? '<span class="sub">' + sub + "</span>" : "") + "</div>";
  };
  return '<div class="coin clickable" role="button" tabindex="0" data-act="cost-edit" data-cur="' + c + '" aria-label="Einkaufspreis ' + CUR[c].name + ' bearbeiten">' + head(pct) +
    '<div class="coin-stats">' +
    stat("Ø Kaufpreis", fmtPx(p.avg, p.quote)) +
    stat("Kurs jetzt", fmtPx(p.price, p.quote)) +
    stat(p.pl == null ? "Gewinn" : p.pl >= 0 ? "Gewinn" : "Verlust", p.pl == null ? "–" : fmtAmt(p.pl, p.quote, { sign: true }), p.quote !== "EUR" && p.plEUR != null ? "≈ " + fmtEUR(p.plEUR, { sign: true }) : "", cls) +
    "</div>" + coinTradesNote(p.basis) + "</div>";
}
/** Kurze Zeile für die Konten-Seite (Gruppe BTC/USDT). */
function coinLineHtml(c) {
  const p = coinPL(c);
  if (!(p.held > 0)) return "";
  if (p.avg == null) return '<button class="coin-line" type="button" data-act="cost-edit" data-cur="' + c + '">' + icon("plus", "sm") + "<span>Einkaufspreis eintragen – für Ø-Kaufpreis und Gewinn</span></button>";
  return '<button class="coin-line" type="button" data-act="cost-edit" data-cur="' + c + '"><span>Ø Kaufpreis ' + fmtPx(p.avg, p.quote) +
    (p.pct != null ? ' · <b class="' + (p.pct >= 0 ? "pos" : "neg") + '">' + fmtPct(p.pct * 100, { sign: true }) + "</b> (" + fmtAmt(p.pl, p.quote, { sign: true }) + ")" : "") + "</span>" + icon("right", "sm") + "</button>";
}

/* ---------- Einkaufspreis eintragen ---------- */
function openCostForm(c) {
  if (!COINS.includes(c)) return;
  const held = derive().byCur[c].native;
  if (!(held > 0)) { toast("Du hast gerade keine " + c + " – leg zuerst ein Konto damit an."); return; }
  const doc = costDoc()[c] || null;
  const b = coinBasis(c);
  const quotes = coinQuotes(c);
  const q0 = doc && quotes.includes(doc.quote) ? doc.quote : quotes[0];
  const total0 = b && b.avg != null ? b.avg * held : null;
  const body =
    '<div class="preview">Du hast gerade <b>' + fmtAmt(held, c) + "</b>" + (c === "BTC" ? " (" + fmtSats(held) + ")" : "") + " – alle " + CUR[c].name + "-Konten, die im Gesamtvermögen zählen.</div>" +
    segHtml("cost-mode", [["total", "Gesamt bezahlt"], ["price", "Preis pro 1 " + c]], "total") +
    fieldHtml('<span id="cost-lbl">Dafür bezahlt (insgesamt)</span>', amountInput("cost-amt", total0 != null ? fmtNum(total0, 2, 2) : "", q0, 'placeholder="0,00" autofocus')) +
    (quotes.length > 1 ? '<div class="field"><span class="lbl">Bezahlt in</span>' + segHtml("cost-q", quotes.map((q) => [q, q === "EUR" ? "Euro" : q]), q0) + "</div>" : '<input type="hidden" id="seg-cost-q" value="' + q0 + '">') +
    '<div class="preview cost-prev" id="cost-prev">–</div>' +
    '<p class="hint" style="margin:0">Kaufst oder verkaufst du später per Umbuchung in Kassensturz (z. B. ' + (c === "BTC" ? "USDT → BTC" : "Euro → USDT") + "), rechnet die App den Durchschnitt selbst weiter. Hast du woanders nachgekauft, trag hier einfach den neuen Gesamtbetrag ein.</p>";
  openModal({
    title: "Einkaufspreis " + CUR[c].name,
    body,
    foot: (doc ? '<button class="btn btn-ghost btn-danger spacer" type="button" data-act="cost-remove" data-cur="' + c + '">' + icon("trash", "sm") + "Entfernen</button>" : "") +
      '<button class="btn" type="button" data-act="close-modal">Abbrechen</button><button class="btn btn-primary" type="submit" id="cost-save">Speichern</button>',
    onMount: (f) => {
      let mode = "total";
      const upd = (changed) => {
        const q = val(f, "seg-cost-q");
        const m = val(f, "seg-cost-mode");
        const inp = f.querySelector("#cost-amt");
        const v = parseNum(inp.value, q);
        if (changed === "cost-mode" && m !== mode && isFinite(v) && v > 0) inp.value = fmtNum(m === "price" ? v / held : v * held, 2, 2).replace(/\./g, "");
        mode = m;
        f.querySelector("#cost-lbl").textContent = m === "price" ? "Ø Kaufpreis pro 1 " + c : "Dafür bezahlt (insgesamt)";
        f.querySelector("[data-suffix-for=cost-amt]").textContent = quoteUnit(q);
        const x = parseNum(inp.value, q);
        const pv = f.querySelector("#cost-prev");
        if (!(isFinite(x) && x > 0)) { pv.innerHTML = "Gib ein, was du bezahlt hast – dann rechne ich Ø-Kaufpreis und Gewinn aus."; return; }
        const avg = m === "price" ? x : x / held;
        const price = convert(1, c, q);
        const pct = price != null ? price / avg - 1 : null;
        pv.innerHTML = "Ø Kaufpreis <b>" + fmtPx(avg, q) + "</b>" + (price != null ? " · jetzt " + fmtPx(price, q) + ' → <b class="' + (pct >= 0 ? "pos" : "neg") + '">' + fmtPct(pct * 100, { sign: true }) + "</b> (" + fmtAmt((price - avg) * held, q, { sign: true }) + ")" : " · aktueller Kurs fehlt");
      };
      bindSegs(f, (n) => upd(n));
      f.querySelector("#cost-amt").addEventListener("input", () => upd("amt"));
      upd("init");
    },
    onSubmit: (f) => guarded(f.querySelector("#cost-save"), async () => {
      const q = val(f, "seg-cost-q");
      const x = parseNum(val(f, "cost-amt"), q);
      if (!(isFinite(x) && x > 0)) { toast("Gib einen Betrag größer als 0 ein.", { err: true }); f.querySelector("#cost-amt").focus(); return; }
      const avg = val(f, "seg-cost-mode") === "price" ? x : x / held;
      await dbWrite("meta", "cost", "update", { [c]: { qty: held, paid: avg * held, quote: q, at: Date.now() } });
      closeModal();
      toast("Einkaufspreis gespeichert");
    }),
  });
}
async function costRemove(c) {
  const all = Object.assign({}, costDoc());
  const prev = all[c];
  delete all[c];
  delete all.id;
  await dbWrite("meta", "cost", "set", all);
  closeModal();
  toast("Einkaufspreis entfernt", { action: "Rückgängig", onAction: () => guarded(null, () => dbWrite("meta", "cost", "update", { [c]: prev })) });
}
