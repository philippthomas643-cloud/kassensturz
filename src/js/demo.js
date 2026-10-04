/* ======================================================================
   Beispieldaten (alle mit demo: true) – immer passend zum heutigen Datum.
   Werden über „Beispieldaten löschen“ restlos entfernt.
   ====================================================================== */
function buildDemoOps() {
  const today = isoDate();
  const now = Date.now();
  const ym = monthKey(today);
  const prev = addMonthKey(ym, -1);
  const r = effRates();
  const BTC_EUR = (r.BTC && r.BTC.eur) || 75348.12;
  const USDT_EUR = (r.USDT && r.USDT.eur) || 0.8883;
  const day = (m, d) => m + "-" + pad(d);
  const endOfMonth = (m) => addDays(addMonthKey(m, 1) + "-01", -1);
  const ago = (n) => addDays(today, -n);

  const accounts = [
    { id: "acc_demo_giro", name: "Bank of Cyprus Giro", currency: "EUR", kind: "bank", target: 3240.18 },
    { id: "acc_demo_revolut", name: "Revolut", currency: "EUR", kind: "bank", target: 1120.40 },
    { id: "acc_demo_tagesgeld", name: "Tagesgeld", currency: "EUR", kind: "bank", target: 6500.00, note: "2,5 % Zinsen" },
    { id: "acc_demo_cash", name: "Bargeld", currency: "EUR", kind: "cash", target: 185.00 },
    { id: "acc_demo_binance", name: "Binance Spot", currency: "USDT", kind: "exchange", target: 4850.00 },
    { id: "acc_demo_ledger", name: "Ledger Cold Wallet", currency: "BTC", kind: "wallet", target: 0.0832 },
  ];
  const A = {};
  for (const a of accounts) A[a.id] = a;

  const fixed = [
    { id: "fx_demo_miete", kind: "expense", name: "Miete Wohnung", amount: 950, interval: "monthly", anchor: day(prev, 1), accountId: "acc_demo_giro", category: "Wohnen" },
    { id: "fx_demo_kv", kind: "expense", name: "Krankenversicherung", amount: 120, interval: "monthly", anchor: day(prev, 1), accountId: "acc_demo_giro", category: "Versicherungen" },
    { id: "fx_demo_handy", kind: "expense", name: "Handy & Internet", amount: 45, interval: "monthly", anchor: day(prev, 5), accountId: "acc_demo_revolut", category: "Handy & Internet" },
    { id: "fx_demo_gym", kind: "expense", name: "Fitnessstudio", amount: 49, interval: "monthly", anchor: day(prev, 10), accountId: "acc_demo_revolut", category: "Gesundheit & Sport" },
    { id: "fx_demo_abos", kind: "expense", name: "Software-Abos", amount: 39, interval: "monthly", anchor: day(prev, 12), accountId: "acc_demo_revolut", category: "Abos & Software" },
    { id: "fx_demo_strom", kind: "expense", name: "Strom & Wasser", amount: 85, interval: "monthly", anchor: day(prev, 15), accountId: "acc_demo_giro", category: "Wohnen" },
    { id: "fx_demo_buchhaltung", kind: "expense", name: "Buchhaltung Firma", amount: 250, interval: "quarterly", anchor: day(addMonthKey(ym, -2), 20), accountId: "acc_demo_giro", category: "Business" },
    { id: "fx_demo_kfz", kind: "expense", name: "Kfz-Versicherung", amount: 380, interval: "yearly", anchor: day(addMonthKey(ym, 5), 1), accountId: "acc_demo_giro", category: "Auto" },
    { id: "fx_demo_gehalt", kind: "income", name: "Gehalt", amount: 3200, interval: "monthly", anchor: day(prev, 28), accountId: "acc_demo_giro", category: "Gehalt" },
    { id: "fx_demo_retainer", kind: "income", name: "Freelance-Retainer", amount: 800, interval: "monthly", anchor: day(prev, 15), accountId: "acc_demo_revolut", category: "Freelance" },
  ].map((f) => Object.assign(f, { currency: "EUR" }));

  const tx = [];
  // Fixkosten seit Anfang letzten Monats buchen – eine Rechnung bleibt absichtlich offen
  const openOne = "fx_demo_strom";
  for (const f of fixed) {
    const from = f.anchor < day(prev, 1) ? f.anchor : day(prev, 1);
    for (const due of occurrences(f, from, today)) {
      if (f.id === openOne && monthKey(due) === ym) continue;
      tx.push({ id: fixedTxId(f.id, due), kind: f.kind, date: due, accountId: f.accountId, amount: f.amount, category: f.category, note: f.name, eur: f.amount, fixedId: f.id, period: due });
    }
  }
  let n = 0;
  const ex = (d, acc, amount, category, note) => tx.push({ id: "tx_demo_" + (++n), kind: "expense", date: ago(d), accountId: acc, amount, category, note, eur: amount });
  ex(28, "acc_demo_giro", 86.40, "Lebensmittel", "Alphamega");
  ex(25, "acc_demo_revolut", 42.00, "Restaurant & Café", "Taverne am Hafen");
  ex(23, "acc_demo_revolut", 58.20, "Transport", "Tankstelle");
  ex(20, "acc_demo_revolut", 54.75, "Lebensmittel", "Lidl");
  ex(16, "acc_demo_revolut", 129.99, "Shopping", "Kopfhörer");
  ex(14, "acc_demo_cash", 65.00, "Freizeit", "Bootstour");
  ex(13, "acc_demo_giro", 92.10, "Lebensmittel", "Alphamega");
  ex(10, "acc_demo_revolut", 38.50, "Restaurant & Café", "Sushi");
  ex(7, "acc_demo_revolut", 189.00, "Reisen", "Flug Paphos–Berlin");
  ex(5, "acc_demo_revolut", 61.30, "Lebensmittel", "Lidl");
  ex(3, "acc_demo_cash", 14.80, "Restaurant & Café", "Frappé & Kuchen");
  ex(2, "acc_demo_giro", 74.65, "Lebensmittel", "Alphamega");
  ex(2, "acc_demo_revolut", 179.90, "Shopping", "Sneaker");
  ex(2, "acc_demo_revolut", 9.99, "Abos & Software", "Cloud-Speicher");
  ex(1, "acc_demo_revolut", 61.00, "Transport", "Tankstelle");
  ex(1, "acc_demo_revolut", 56.00, "Restaurant & Café", "Abendessen");
  ex(1, "acc_demo_revolut", 165.00, "Freizeit", "Konzertkarten");
  ex(0, "acc_demo_cash", 8.40, "Lebensmittel", "Bäckerei");
  tx.push({ id: "tx_demo_" + (++n), kind: "income", date: ago(11), accountId: "acc_demo_binance", amount: 12.40, category: "Zinsen & Staking", note: "Simple Earn", eur: round(12.40 * USDT_EUR) });
  tx.push({ id: "tx_demo_" + (++n), kind: "transfer", date: ago(24), accountId: "acc_demo_revolut", toAccountId: "acc_demo_binance", amount: 500, toAmount: round(500 / USDT_EUR, 2), note: "USDT gekauft", eur: 500 });
  tx.push({ id: "tx_demo_" + (++n), kind: "transfer", date: ago(9), accountId: "acc_demo_binance", toAccountId: "acc_demo_ledger", amount: 600, toAmount: round((600 * USDT_EUR) / BTC_EUR, 6), note: "BTC gekauft & abgezogen", eur: round(600 * USDT_EUR) });
  tx.push({ id: "tx_demo_" + (++n), kind: "transfer", date: day(ym, 1), accountId: "acc_demo_giro", toAccountId: "acc_demo_tagesgeld", amount: 500, toAmount: 500, note: "Sparrate", eur: 500 });
  tx.push({ id: "tx_demo_" + (++n), kind: "adjust", date: ago(4), accountId: "acc_demo_cash", amount: -12.00, note: "Bargeld nachgezählt", eur: 12.00 });

  // Startsalden so wählen, dass die Zielstände herauskommen
  const effect = {};
  for (const a of accounts) effect[a.id] = 0;
  for (const t of tx) {
    const a = A[t.accountId];
    const m = toMinor(t.amount, a.currency);
    if (t.kind === "expense" || t.kind === "transfer") effect[a.id] -= Math.abs(m);
    else if (t.kind === "income") effect[a.id] += Math.abs(m);
    else if (t.kind === "adjust") effect[a.id] += m;
    if (t.kind === "transfer") { const b = A[t.toAccountId]; effect[b.id] += toMinor(t.toAmount, b.currency); }
  }
  const ops = [];
  accounts.forEach((a, i) => {
    const opening = (toMinor(a.target, a.currency) - effect[a.id]) / SCALE[a.currency];
    ops.push(["accounts", a.id, "set", { name: a.name, currency: a.currency, kind: a.kind, opening, includeInTotal: true, archived: false, order: i + 1, note: a.note || "", createdAt: now - 86400000 * 60 + i * 1000, demo: true }]);
  });
  tx.forEach((t, i) => ops.push(["tx", t.id, "set", Object.assign(stripId(t), { createdAt: parseISO(t.date).getTime() + 12 * 3600000 + i * 1000, demo: true })]));
  fixed.forEach((f, i) => ops.push(["fixed", f.id, "set", Object.assign(stripId(f), { active: true, createdAt: now - 86400000 * 50 + i * 1000, demo: true })]));
  [["bg_demo_lebensmittel", "Lebensmittel", 400], ["bg_demo_restaurant", "Restaurant & Café", 250], ["bg_demo_transport", "Transport", 150], ["bg_demo_shopping", "Shopping", 200], ["bg_demo_freizeit", "Freizeit", 150], ["bg_demo_reisen", "Reisen", 300]]
    .forEach(([id, category, limit], i) => ops.push(["budgets", id, "set", { category, limit, createdAt: now - 86400000 * 45 + i * 1000, demo: true }]));
  [
    { id: "gl_demo_vermoegen", kind: "networth", name: "Vermögen 25.000 €", target: 25000, currency: "EUR", accountIds: [], manual: 0, deadline: endOfMonth(addMonthKey(ym, 8)), notify: true },
    { id: "gl_demo_notgroschen", kind: "savings", name: "Notgroschen", target: 10000, currency: "EUR", accountIds: ["acc_demo_tagesgeld"], manual: 0, deadline: endOfMonth(addMonthKey(ym, 8)), notify: true },
    { id: "gl_demo_btc", kind: "savings", name: "0,25 BTC stacken", target: 0.25, currency: "BTC", accountIds: ["acc_demo_ledger"], manual: 0, deadline: endOfMonth(addMonthKey(ym, 14)), notify: true },
    { id: "gl_demo_macbook", kind: "savings", name: "Neues MacBook", target: 2800, currency: "EUR", accountIds: [], manual: 900, deadline: day(addMonthKey(ym, 5), 1), notify: true },
  ].forEach((g, i) => ops.push(["goals", g.id, "set", Object.assign(stripId(g), { createdAt: now - 86400000 * 44 + i * 1000, demo: true })]));

  // Verlauf: alle 3 Tage über 6 Monate, die letzten 10 Tage täglich (simuliert, endet beim heutigen Stand)
  let seed = 42;
  const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const dates = [];
  for (let d = ago(182); d < ago(10); d = addDays(d, 3)) dates.push(d);
  for (let d = ago(10); d < today; d = addDays(d, 1)) dates.push(d);
  const N = dates.length;
  const eurEnd = accounts.filter((a) => a.currency === "EUR").reduce((s, a) => s + a.target, 0);
  dates.forEach((date, i) => {
    const t = i / (N - 1);
    const wave = Math.sin(Math.PI * Math.min(1, t * 1.25));
    const btcPx = BTC_EUR * (0.9025 + 0.0975 * t + 0.1725 * wave + (rand() - 0.5) * 0.0345);
    const usdtPx = USDT_EUR * (1.0334 - 0.0334 * t + (rand() - 0.5) * 0.0045);
    const btcHold = t < 0.3 ? 0.0645 : t < 0.55 ? 0.0712 : t < 0.86 ? 0.0761 : 0.0832;
    const usdtHold = 3900 + (4850 - 3900) * t + (rand() - 0.5) * 120;
    const eur = eurEnd * (0.756 + 0.244 * t) + Math.sin(t * Math.PI * 12) * 420 + (rand() - 0.5) * 160;
    const byCur = { EUR: round(eur), USDT: round(usdtHold * usdtPx), BTC: round(btcHold * btcPx) };
    ops.push(["snaps", date, "set", { date, total: round(byCur.EUR + byCur.USDT + byCur.BTC), byCur, rates: { BTC: round(btcPx), USDT: round(usdtPx, 4) }, at: parseISO(date).getTime() + 20 * 3600000, demo: true }]);
  });
  if (!ratesDoc()) {
    ops.push(["meta", "rates", "set", { mode: "live", BTC: { eur: BTC_EUR, ch24: null, at: now, src: "seed" }, USDT: { eur: USDT_EUR, ch24: null, at: now, src: "seed" }, manual: {} }]);
  }
  return ops;
}

async function loadDemo() {
  const t = toast("Lege Beispieldaten an …", { ms: 30000 });
  try {
    await dbBatch(buildDemoOps().concat([["meta", "app", "update", { onboarded: true, demoAt: Date.now() }]]));
    t.remove();
    toast("Beispieldaten geladen – schau dich in Ruhe um");
    location.hash = "#uebersicht";
  } catch (e) {
    t.remove();
    toast(writeErrMsg(e), { err: true });
  }
}
