/* ======================================================================
   Ablauf: Rendern, Ereignisse, Start
   ====================================================================== */
let renderQueued = false;
function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; renderAll(); });
}
function renderAll() {
  renderShell();
  renderMain(true);
}
function afterRender() {
  drawNetWorthChart();
}
function routeFromHash() {
  const h = (location.hash || "").replace(/^#/, "");
  return ROUTES.some((r) => r.id === h) ? h : "uebersicht";
}
window.addEventListener("hashchange", () => {
  const r = routeFromHash();
  if (r !== S.ui.route) {
    S.ui.route = r;
    renderShell();
    renderMain(); // neue Seite beginnt oben (siehe renderMain)
  }
});

/* ---------- Datenänderungen ---------- */
function onDataChanged(name) {
  DATA_V++;
  if (name === "meta") RATES_V++;
  scheduleRender();
  scheduleSnapshot();
  if (name !== "snaps") scheduleChecks(2500);
}

/* ---------- Tageswerte für den Verlauf ---------- */
let snapTimer = null;
function scheduleSnapshot() {
  clearTimeout(snapTimer);
  snapTimer = setTimeout(writeSnapshotIfNeeded, 4000);
}
async function writeSnapshotIfNeeded() {
  if (S.runtime !== "ok" || !allLoaded()) return;
  if (!accountsList().length) return;
  const d = derive();
  if (d.missing.length) return;
  const today = isoDate();
  const byCur = { EUR: round(d.byCur.EUR.eur || 0), USDT: round(d.byCur.USDT.eur || 0), BTC: round(d.byCur.BTC.eur || 0) };
  const total = round(d.total);
  const prev = S.data.snaps.get(today);
  if (prev) {
    const tol = Math.max(1, Math.abs(total) * 0.002);
    const same = Math.abs((prev.total || 0) - total) <= tol && CURS.every((c) => Math.abs(((prev.byCur || {})[c] || 0) - byCur[c]) <= tol);
    if (same && !!prev.demo === hasDemoAccounts()) return;
  }
  const r = effRates();
  const doc = { date: today, total, byCur, rates: { BTC: r.BTC ? r.BTC.eur : null, USDT: r.USDT ? r.USDT.eur : null }, at: Date.now() };
  if (hasDemoAccounts()) doc.demo = true;
  try { await dbWrite("snaps", today, "set", doc); } catch (e) { /* nicht kritisch */ }
}
function hasDemoAccounts() {
  for (const a of S.data.accounts.values()) if (a.demo) return true;
  return false;
}

/* ---------- Ereignisse ---------- */
const ACTIONS = {
  "close-modal": () => closeModal(),
  "open-settings": () => openSettings(),
  "new-account": () => openAccountForm(),
  "edit-account": (el) => openAccountForm(el.dataset.id),
  "delete-account": (el) => deleteAccount(el.dataset.id),
  "account-detail": (el) => openAccountDetail(el.dataset.id),
  "adjust-balance": (el) => openAdjustForm(el.dataset.id),
  "new-tx": (el) => { if (!accountsList().length) { openAccountForm(); toast("Leg zuerst ein Konto an – dann kannst du buchen."); return; } openTxForm({ acc: el.dataset.acc, prefill: el.dataset.kind ? { kind: el.dataset.kind } : undefined }); },
  "adjust-picker": () => openAdjustPicker(),
  "scan-shot": () => { const i = $("#scan-shot"); i.value = ""; i.click(); },
  "scan-receipt": () => { const i = $("#scan-receipt"); i.value = ""; i.click(); },
  "install-guide": () => openInstallGuide(),
  "install-app": () => installApp(),
  "dismiss-install": () => { setUiPref("installSnooze", String(Date.now() + 7 * 86400000)); renderMain(); },
  "copy-link": () => copyAppLink(),
  "share-link": () => shareAppLink(),
  "apply-update": () => applyUpdate(),
  "check-update": () => checkForUpdate(true),
  "whats-new": () => openWhatsNew(),
  "start-empty": () => guarded(null, async () => { await dbWrite("meta", "app", "update", { onboarded: true, startedAt: Date.now() }); openAccountForm(); }),
  "load-demo": () => { closeModal(); loadDemo(); },
  "snooze-backup": () => { setUiPref("backupSnooze", String(Date.now() + 14 * 86400000)); renderMain(); },
  "edit-tx": (el) => openTxForm({ id: el.dataset.id }),
  "delete-tx": (el) => deleteTx(el.dataset.id),
  "new-fixed": (el) => openFixedForm(null, el.dataset.kind),
  "edit-fixed": (el) => openFixedForm(el.dataset.id),
  "delete-fixed": (el) => deleteFixed(el.dataset.id),
  "book-fixed": (el) => bookFixed(el.dataset.id, el.dataset.due),
  "new-budget": () => openBudgetForm(),
  "edit-budget": (el) => openBudgetForm(el.dataset.id),
  "delete-budget": (el) => deleteSimple("budgets", el.dataset.id, "Budget"),
  "new-goal": () => openGoalForm(),
  "edit-goal": (el) => openGoalForm(el.dataset.id),
  "delete-goal": (el) => deleteSimple("goals", el.dataset.id, "Ziel"),
  "refresh-rates": () => refreshRates({ manual: true }),
  "clear-demo": () => clearDemo(),
  "wipe-all": () => wipeAll(),
  "export-json": () => exportJSON(),
  "export-csv": () => exportCSV(),
  "toggle-archived": () => { S.ui.showArchived = !S.ui.showArchived; renderMain(); },
  "conv-cur": (el) => {
    const c = S.ui.conv;
    const v = parseNum(c.amt, c.cur);
    if (isFinite(v)) {
      const conv = convert(v, c.cur, el.dataset.cur);
      if (conv != null && el.dataset.cur !== c.cur) c.amt = fmtNum(conv, 0, el.dataset.cur === "BTC" ? 8 : 2).replace(/\./g, "");
    }
    c.cur = el.dataset.cur;
    renderConverter();
  },
  "chart-view": (el) => { S.ui.chart.view = el.dataset.v; S.ui.chart.focus = null; setUiPref("chartView", el.dataset.v); renderHero(); },
  "alloc-by": (el) => { S.ui.chart.allocBy = el.dataset.v; S.ui.chart.focus = null; setUiPref("allocBy", el.dataset.v); renderHero(); },
  "alloc-focus": (el) => { const k = el.dataset.key; S.ui.chart.focus = S.ui.chart.focus === k ? null : k; renderHero(); },
  "chart-range": (el) => { S.ui.chart.range = el.dataset.v; setUiPref("chartRange", el.dataset.v); renderHero(); },
  "chart-mode": (el) => { S.ui.chart.mode = el.dataset.v; renderHero(); },
  "chart-table": () => { S.ui.chart.table = !S.ui.chart.table; renderHero(); },
  "tx-month": (el) => { S.ui.tx.month = el.dataset.v; renderMain(); },
  "tx-month-step": (el) => { S.ui.tx.month = addMonthKey(S.ui.tx.month === "all" ? monthKey(isoDate()) : S.ui.tx.month, +el.dataset.v); renderMain(); },
  "tx-reset": () => { S.ui.tx = { month: monthKey(isoDate()), acc: "", cat: "", kind: "", q: "" }; renderMain(); },
  "budget-month": (el) => { S.ui.budgetMonth = addMonthKey(S.ui.budgetMonth || monthKey(isoDate()), +el.dataset.v); renderMain(); },
};
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-act]");
  if (!el || el.disabled) return;
  const fn = ACTIONS[el.dataset.act];
  if (!fn) return;
  e.preventDefault();
  fn(el, e);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && $("#modal-host").firstChild) { e.preventDefault(); closeModal(); return; }
  if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches('[role="button"][data-act]')) {
    e.preventDefault();
    const fn = ACTIONS[e.target.dataset.act];
    if (fn) fn(e.target, e);
  }
});
let qTimer = null;
document.addEventListener("input", (e) => {
  const t = e.target;
  if (t.id === "conv-amt") {
    S.ui.conv.amt = t.value;
    const out = $("#conv-out");
    if (out) out.innerHTML = converterOut();
    return;
  }
  if (t.dataset && t.dataset.filter === "q") {
    S.ui.tx.q = t.value;
    clearTimeout(qTimer);
    qTimer = setTimeout(renderMain, 220);
  }
});
document.addEventListener("change", (e) => {
  const t = e.target;
  if (t.id === "scan-shot" || t.id === "scan-receipt") {
    const files = Array.from(t.files || []);
    t.value = ""; // dasselbe Bild nochmal wählen können
    if (files.length) { if (t.id === "scan-shot") scanScreenshots(files); else scanReceipt(files[0]); }
    return;
  }
  if (t.id === "st-import" || t.id === "wl-import") {
    const file = t.files && t.files[0];
    if (file) importBackup(file);
    t.value = "";
    return;
  }
  if (t.dataset && t.dataset.notify) {
    guarded(null, () => saveNotifyPref(t.dataset.notify, t.checked));
    return;
  }
  if (t.dataset && t.dataset.filter && t.dataset.filter !== "q") {
    S.ui.tx[t.dataset.filter] = t.value;
    renderMain();
  }
});
let rzTimer = null, lastW = window.innerWidth;
window.addEventListener("resize", () => {
  clearTimeout(rzTimer);
  rzTimer = setTimeout(() => { if (window.innerWidth !== lastW) { lastW = window.innerWidth; drawNetWorthChart(); } }, 150);
});
let scrolled = false;
window.addEventListener("scroll", () => {
  const s = window.scrollY > 4;
  if (s !== scrolled) { scrolled = s; const tb = $("#topbar"); if (tb) tb.classList.toggle("scrolled", s); }
}, { passive: true });
document.addEventListener("visibilitychange", () => {
  if (document.hidden || S.runtime !== "ok") return;
  // Zurück in der App (z. B. aus dem Hintergrund): Kurse, Meldungen und Updates auffrischen
  if (rateMode() !== "manual" && Date.now() - (S.live.at || 0) > 30000) refreshRates();
  if (SW_REG && Date.now() - lastUpdateCheck > 30 * 60000) checkForUpdate(false);
  if (isoDate() !== lastRenderDay) { lastRenderDay = isoDate(); DATA_V++; }
  scheduleChecks(3000);
  scheduleRender();
});
window.addEventListener("online", () => { if (S.runtime === "ok" && rateMode() !== "manual") refreshRates(); });
window.addEventListener("offline", () => { if (S.live.state !== "off") { S.live.state = "offline"; scheduleRender(); } });
setInterval(() => { if (!document.hidden && S.runtime === "ok") renderRateBits(); }, 30000);
let lastRenderDay = isoDate();

/* ---------- Start ---------- */
async function boot() {
  window.kassensturz = { version: APP.version, build: APP.build };
  S.ui.route = routeFromHash();
  if (document.documentElement.dataset.theme) updateThemeColor();
  renderShell();
  try {
    IDB = await idbOpen();
    await loadCollections(COLS);
    S.runtime = "ok";
  } catch (e) {
    console.error(e);
    S.runtime = "error";
    S.bootError = (e && (e.name || e.message)) || "";
  }
  DATA_V++;
  RATES_V++;
  renderAll();
  if (S.runtime !== "ok") return;
  if (navigator.storage && navigator.storage.persisted) navigator.storage.persisted().then((p) => { S.persisted = p; }, () => {});
  if (isStandalone()) requestPersistence();
  startRates();
  scheduleSnapshot();
  scheduleChecks(2500);
  registerSW();
  afterUpdateNotice();
}
boot();
