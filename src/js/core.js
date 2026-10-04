"use strict";
/* ======================================================================
   Kassensturz – Konten in EUR, USDT und BTC, alles live in Euro.
   Läuft als installierbare Web-App (PWA). Alle Daten liegen nur auf dem Gerät
   (IndexedDB, siehe store.js), Kurse kommen direkt von öffentlichen Börsen-APIs
   (rates.js) oder werden manuell eingetragen.
   ====================================================================== */

/* ---------- App-Version (wird beim Bauen eingesetzt) ---------- */
const APP = { version: "__VERSION__", build: "__BUILD__", date: "__DATE__" };

/* ---------- Konstanten ---------- */
const CURS = ["EUR", "USDT", "BTC"];
const CUR = {
  EUR: { name: "Euro", dec: [2, 2], color: "var(--eur)" },
  USDT: { name: "Tether", dec: [2, 2], color: "var(--usdt)" },
  BTC: { name: "Bitcoin", dec: [2, 8], color: "var(--btc)" },
};
const SCALE = { EUR: 100, USDT: 1e6, BTC: 1e8 };
const ACC_KINDS = { bank: "Bank", exchange: "Börse", wallet: "Wallet", cash: "Bargeld", other: "Sonstiges" };
const INTERVALS = {
  weekly: { label: "wöchentlich", per: "Woche", factor: 52 / 12 },
  monthly: { label: "monatlich", per: "Monat", factor: 1, step: 1 },
  quarterly: { label: "vierteljährlich", per: "Quartal", factor: 1 / 3, step: 3 },
  halfyearly: { label: "halbjährlich", per: "Halbjahr", factor: 1 / 6, step: 6 },
  yearly: { label: "jährlich", per: "Jahr", factor: 1 / 12, step: 12 },
};
const EXPENSE_CATS = ["Wohnen", "Lebensmittel", "Restaurant & Café", "Transport", "Auto", "Abos & Software", "Handy & Internet", "Versicherungen", "Gesundheit & Sport", "Shopping", "Freizeit", "Reisen", "Business", "Steuern & Gebühren", "Geschenke", "Sonstiges"];
const INCOME_CATS = ["Gehalt", "Business-Einnahmen", "Freelance", "Krypto-Gewinne", "Zinsen & Staking", "Erstattung", "Sonstiges"];
const ROUTES = [
  { id: "uebersicht", label: "Übersicht", icon: "grid" },
  { id: "konten", label: "Konten", icon: "wallet" },
  { id: "buchungen", label: "Buchungen", icon: "swapv" },
  { id: "fixkosten", label: "Fixkosten", icon: "repeat" },
  { id: "budget", label: "Budget", icon: "pie" },
  { id: "ziele", label: "Ziele", icon: "flag" },
];
const COLS = ["accounts", "tx", "fixed", "budgets", "goals", "snaps", "meta"];

/* ---------- Icons ---------- */
const ICONS = {
  grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.6"/>',
  wallet: '<path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3"/><path d="M4 7.5V18a2 2 0 0 0 2 2h13a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1H6.5A2.5 2.5 0 0 1 4 7.5Z"/><circle cx="16.3" cy="14.5" r="1.1"/>',
  swapv: '<path d="M8 20V5M8 5 4.5 8.5M8 5l3.5 3.5"/><path d="M16 4v15M16 19l-3.5-3.5M16 19l3.5-3.5"/>',
  repeat: '<rect x="3.5" y="5" width="17" height="15" rx="2.2"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M9 15h6"/>',
  pie: '<path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5H12Z"/><path d="M15.5 3.9a8.5 8.5 0 0 1 4.6 4.6h-4.6Z"/>',
  flag: '<path d="M5.5 21V4"/><path d="M5.5 4.5h11l-2.2 4 2.2 4h-11"/>',
  sliders: '<path d="M4 7h9M18 7h2M4 17h3M12 17h8"/><circle cx="15.5" cy="7" r="2.2"/><circle cx="9.5" cy="17" r="2.2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  refresh: '<path d="M19.5 12a7.5 7.5 0 0 1-13 5.1L5 15.5M4.5 12a7.5 7.5 0 0 1 13-5.1L19 8.5"/><path d="M19 4v4.5h-4.5M5 20v-4.5h4.5"/>',
  pencil: '<path d="M4.5 19.5h4l10-10a2.1 2.1 0 0 0-3-3l-10 10v3Z"/><path d="m14 8 2 2"/>',
  trash: '<path d="M4.5 7h15M10 7V4.5h4V7M6.5 7l.9 12.5h9.2L17.5 7"/><path d="M10 11v5M14 11v5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  left: '<path d="m14.5 6-6 6 6 6"/>',
  right: '<path d="m9.5 6 6 6-6 6"/>',
  up: '<path d="M12 19V5.5M6.5 11 12 5.5l5.5 5.5"/>',
  down: '<path d="M12 5v13.5M6.5 13l5.5 5.5 5.5-5.5"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  alert: '<path d="M12 4.2 2.9 19.5h18.2Z"/><path d="M12 10v4.2M12 17.1v.2"/>',
  swap: '<path d="M4 8.5h15l-3.5-3.5M20 15.5H5l3.5 3.5"/>',
  archive: '<rect x="3.5" y="4.5" width="17" height="4.5" rx="1"/><path d="M5 9v10.5h14V9M10 13h4"/>',
  convert: '<path d="M7.5 4.5 4 8l3.5 3.5M4 8h12.5M16.5 19.5 20 16l-3.5-3.5M20 16H7.5"/>',
  download: '<path d="M12 4.5V15M7.5 10.5 12 15l4.5-4.5M5 19.5h14"/>',
  minus: '<path d="M5 12h14"/>',
  adjust: '<path d="M5 9h14M5 15h14"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.2"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
  bell: '<path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.6 2.1H4.4Z"/><path d="M10 20.6a2.1 2.1 0 0 0 4 0"/>',
  belloff: '<path d="M6 16.5V11a6 6 0 0 1 9.4-4.9M18 11v5.5l1.6 2.1H8"/><path d="M10 20.6a2.1 2.1 0 0 0 4 0M4 4l16 16"/>',
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.6"/><path d="M11 18.6h2"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5v-2a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
  eur: '<path d="M17 6.6a6.6 6.6 0 1 0 0 10.8"/><path d="M4.5 10.2h8.5M4.5 13.8h8.5"/>',
  usdt: '<path d="M5.5 5.5h13M12 5.5V19"/><path d="M6 10.8c1.7.8 3.7 1.2 6 1.2s4.3-.4 6-1.2"/>',
  btc: '<path d="M8.5 5.5v13M7 6h6a3 3 0 0 1 0 6H8.5M8.5 12H14a3.2 3.2 0 0 1 0 6.4H7"/><path d="M10.5 3.8V6M13 3.8V6M10.5 18.4v1.8M13 18.4v1.8"/>',
  table: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.2"/><path d="M3.5 9.5h17M3.5 14.5h17M9.5 9.5v10"/>',
  share: '<path d="M12 3.8v11M8 7.6l4-3.8 4 3.8"/><path d="M8.5 10.5H7a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1.5"/>',
  addsq: '<rect x="4" y="4" width="16" height="16" rx="3.5"/><path d="M12 8.5v7M8.5 12h7"/>',
  upload: '<path d="M12 15.5V4.5M7.5 9 12 4.5 16.5 9M5 19.5h14"/>',
  sun: '<circle cx="12" cy="12" r="3.8"/><path d="M12 3v1.8M12 19.2V21M3 12h1.8M19.2 12H21M5.6 5.6l1.3 1.3M17.1 17.1l1.3 1.3M5.6 18.4l1.3-1.3M17.1 6.9l1.3-1.3"/>',
  moon: '<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10Z"/>',
  sparkle: '<path d="M12 3.5 13.8 10.2 20.5 12l-6.7 1.8L12 20.5l-1.8-6.7L3.5 12l6.7-1.8Z"/>',
  chart: '<path d="M4 19.5h16"/><path d="m5 15.5 4.5-5 3.5 3 6-7"/>',
  donut: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.8"/><path d="M12 3.5v4.7M19.8 15.4l-4.2-1.8"/>',
  wifi: '<path d="M2.5 9a14 14 0 0 1 19 0M5.8 12.4a9.3 9.3 0 0 1 12.4 0M9 15.8a4.6 4.6 0 0 1 6 0"/><circle cx="12" cy="19" r=".9"/>',
  camera: '<path d="M4 8.6A2.6 2.6 0 0 1 6.6 6h1.6l1.5-2.1h4.6L15.8 6h1.6A2.6 2.6 0 0 1 20 8.6v8.8a2.6 2.6 0 0 1-2.6 2.6H6.6A2.6 2.6 0 0 1 4 17.4Z"/><circle cx="12" cy="12.6" r="3.5"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="9.6" r="1.6"/><path d="m4.2 17.2 4.8-4.7 3.8 3.6 2.6-2.4 4.4 3.9"/>',
  receipt: '<path d="M6 3.5h12v17l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3-2 1.3Z"/><path d="M9 8h6M9 11.5h6M9 15h3.5"/>',
  shield: '<path d="M12 3.5 5 6.3v5.2c0 4.3 3 7.8 7 9 4-1.2 7-4.7 7-9V6.3Z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
};
function icon(name, cls = "") {
  return '<svg class="i ' + cls + '" viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[name] || "") + "</svg>";
}

/* ---------- Helfer ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function newId(prefix) {
  return prefix + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

/* ---------- Zahlen ---------- */
const NF = {};
function nf(min, max) {
  const k = min + ":" + max;
  return NF[k] || (NF[k] = new Intl.NumberFormat("de-DE", { minimumFractionDigits: min, maximumFractionDigits: max }));
}
function signOf(v, d, opts) {
  const tiny = Math.abs(v) < 0.5 * 10 ** -d;
  if (tiny) return "";
  if (v < 0) return "−";
  return opts && opts.sign ? "+" : "";
}
function fmtEUR(v, opts = {}) {
  if (v == null || !isFinite(v)) return "– €";
  const d = opts.dec != null ? opts.dec : 2;
  return signOf(v, d, opts) + nf(d, d).format(Math.abs(v)) + " €";
}
function fmtAmt(v, cur, opts = {}) {
  if (v == null || !isFinite(v)) return "– " + (cur === "EUR" ? "€" : cur);
  if (cur === "EUR") return fmtEUR(v, opts);
  const mn = opts.min != null ? opts.min : CUR[cur].dec[0];
  const mx = opts.max != null ? Math.max(mn, opts.max) : CUR[cur].dec[1];
  return signOf(v, mx, opts) + nf(mn, mx).format(Math.abs(v)) + " " + cur;
}
function fmtNum(v, min = 0, max = 2) {
  if (v == null || !isFinite(v)) return "–";
  return nf(min, max).format(v);
}
function fmtRate(v) {
  if (v == null || !isFinite(v)) return "–";
  if (v >= 1000) return nf(2, 2).format(v);
  if (v >= 1) return nf(2, 4).format(v);
  return nf(4, 4).format(v);
}
function fmtPct(v, opts = {}) {
  if (v == null || !isFinite(v)) return "–";
  const d = opts.dec != null ? opts.dec : 1;
  return signOf(v, d, opts) + nf(d, d).format(Math.abs(v)) + " %";
}
function fmtSats(btc) {
  return nf(0, 0).format(Math.round(Math.abs(btc) * 1e8)) + " sats";
}
function fmtCompactEUR(v) {
  const a = Math.abs(v);
  if (a >= 1e6) return nf(0, 1).format(v / 1e6) + " Mio.";
  return nf(0, 0).format(v);
}
/** Liest deutsch oder englisch geschriebene Zahlen: 1.234,56 · 1234.56 · 0,0532 · 1.500 (EUR → 1500). */
function parseNum(raw, cur) {
  if (raw == null) return NaN;
  let s = String(raw).trim().replace(/[\s'’  ]/g, "").replace(/€|eur|usdt|btc|sats?/gi, "");
  if (!s) return NaN;
  let neg = false;
  if (/^[−-]/.test(s)) { neg = true; s = s.slice(1); }
  else if (s[0] === "+") s = s.slice(1);
  const lc = s.lastIndexOf(","), ld = s.lastIndexOf(".");
  if (lc >= 0 && ld >= 0) {
    s = lc > ld ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lc >= 0) {
    const p = s.split(",");
    s = p.length > 2 ? p.join("") : s.replace(",", ".");
  } else if (ld >= 0) {
    const p = s.split(".");
    if (p.length > 2) s = p.join("");
    else if (cur && cur !== "BTC" && p[1].length === 3 && p[0] !== "0" && p[0] !== "") s = p.join("");
  }
  if (!/^(\d+\.?\d*|\.\d+)$/.test(s)) return NaN;
  const v = parseFloat(s);
  return neg ? -v : v;
}
const toMinor = (v, cur) => Math.round((+v || 0) * SCALE[cur]);
const fromMinor = (m, cur) => m / SCALE[cur];

/* ---------- Datum ---------- */
const pad = (n) => String(n).padStart(2, "0");
const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const MONTHS_S = ["Jan.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sep.", "Okt.", "Nov.", "Dez."];
const MONTHS_AX = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const WD = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
function isoDate(d = new Date()) {
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}
function parseISO(s) {
  const [y, m, d] = String(s).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
function validISO(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && isoDate(parseISO(s)) === s;
}
function addDays(s, n) {
  const d = parseISO(s);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}
function addMonthsClamped(anchor, k) {
  const a = parseISO(anchor);
  const t = new Date(a.getFullYear(), a.getMonth() + k, 1);
  const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  t.setDate(Math.min(a.getDate(), last));
  return isoDate(t);
}
function daysBetween(a, b) {
  return Math.round((parseISO(b) - parseISO(a)) / 86400000);
}
const monthKey = (s) => String(s).slice(0, 7);
function addMonthKey(ym, k) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + k, 1);
  return d.getFullYear() + "-" + pad(d.getMonth() + 1);
}
function monthLabel(ym) {
  const [y, m] = ym.split("-").map(Number);
  return MONTHS[m - 1] + " " + y;
}
function fmtDate(s, withYear) {
  const d = parseISO(s);
  const y = withYear || d.getFullYear() !== new Date().getFullYear() ? " " + d.getFullYear() : "";
  return d.getDate() + ". " + MONTHS_S[d.getMonth()] + y;
}
function fmtDay(s) {
  const today = isoDate();
  if (s === today) return "Heute";
  if (s === addDays(today, -1)) return "Gestern";
  if (s === addDays(today, 1)) return "Morgen";
  return WD[parseISO(s).getDay()] + ", " + fmtDate(s);
}
function fmtTime(ms) {
  if (!ms) return "–";
  const d = new Date(ms);
  const t = pad(d.getHours()) + ":" + pad(d.getMinutes());
  return isoDate(d) === isoDate() ? t : fmtDate(isoDate(d)) + ", " + t;
}
function relDays(s) {
  const n = daysBetween(isoDate(), s);
  if (n === 0) return "heute";
  if (n === 1) return "morgen";
  if (n === -1) return "gestern";
  return n > 0 ? "in " + n + " Tagen" : "vor " + -n + " Tagen";
}

/* ---------- Kleine Ansichts-Vorlieben (nur dieses Gerät) ---------- */
function uiPref(key, fallback) {
  try { const v = localStorage.getItem("kassensturz-ui-" + key); return v == null ? fallback : v; } catch (e) { return fallback; }
}
function setUiPref(key, value) {
  try { localStorage.setItem("kassensturz-ui-" + key, value); } catch (e) { /* privat / gesperrt – egal */ }
}

/* ---------- Zustand ---------- */
const S = {
  runtime: "pending", // pending | ok | error
  bootError: "",
  data: { accounts: new Map(), tx: new Map(), fixed: new Map(), budgets: new Map(), goals: new Map(), snaps: new Map(), meta: new Map() },
  loaded: {},
  errors: {},
  live: { state: "idle", rates: null, at: 0, msg: "", busy: false, src: "" },
  persisted: null,
  update: { waiting: false, version: "" },
  install: { prompt: null },
  ui: {
    route: "uebersicht",
    conv: { amt: "1", cur: "BTC" },
    chart: { view: uiPref("chartView", ""), range: uiPref("chartRange", "6M"), mode: "total", table: false, allocBy: uiPref("allocBy", "cur"), focus: null },
    tx: { month: "", acc: "", cat: "", kind: "", q: "" },
    budgetMonth: "",
    showArchived: false,
  },
};
let DATA_V = 0;
let RATES_V = 0;

/* ---------- Fehlertexte beim Speichern ---------- */
function writeErrMsg(e) {
  const c = e && (e.code || e.name);
  if (c === "QuotaExceededError" || c === "quota_exceeded") return "Der Speicher auf diesem Gerät ist voll. Lösch alte Buchungen oder die Beispieldaten und versuch es nochmal.";
  if (c === "not_ready") return "Kassensturz startet noch. Versuch es gleich nochmal.";
  if (c === "InvalidStateError" || c === "TransactionInactiveError") return "Der Speicher war kurz nicht erreichbar. Versuch es nochmal.";
  return "Speichern fehlgeschlagen" + (c ? " (" + c + ")" : "") + ". Versuch es nochmal.";
}
async function runPool(items, fn, n, onProgress) {
  let i = 0, done = 0;
  const worker = async () => {
    while (i < items.length) {
      const it = items[i++];
      await fn(it);
      done++;
      if (onProgress) onProgress(done, items.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
}
function stripId(o) {
  const c = Object.assign({}, o);
  delete c.id;
  return c;
}

/* ---------- Kurse ---------- */
function ratesDoc() { return S.data.meta.get("rates") || null; }
function rateMode() { const d = ratesDoc(); return (d && d.mode) || "live"; }
function effRates() {
  const doc = ratesDoc() || {};
  const manual = doc.manual || {};
  const out = {};
  for (const c of ["BTC", "USDT"]) {
    const live = S.live.rates && S.live.rates[c];
    const stored = doc[c] && doc[c].eur > 0 ? doc[c] : null;
    const man = manual[c] > 0 ? { eur: manual[c], at: manual.at || 0, src: "manual" } : null;
    if (rateMode() === "manual") out[c] = man || (stored && Object.assign({}, stored)) || null;
    else if (live && live.eur > 0) out[c] = Object.assign({}, live, { at: S.live.at, src: "live" });
    else out[c] = (stored && Object.assign({}, stored)) || man || null;
  }
  return out;
}
function rate(cur) {
  if (cur === "EUR") return 1;
  const r = effRates()[cur];
  return r && r.eur > 0 ? r.eur : null;
}
function toEUR(v, cur) {
  const r = rate(cur);
  return r == null ? null : v * r;
}
function convert(v, from, to) {
  if (from === to) return v;
  const a = rate(from), b = rate(to);
  if (a == null || b == null) return null;
  return (v * a) / b;
}

/* ---------- Abgeleitete Werte ---------- */
let memo = { v: -1, r: -1, d: null };
function accountsList(includeArchived) {
  return Array.from(S.data.accounts.values())
    .filter((a) => includeArchived || !a.archived)
    .sort((a, b) => (a.order || 0) - (b.order || 0) || (a.createdAt || 0) - (b.createdAt || 0) || String(a.name).localeCompare(String(b.name)));
}
function txEffects(t) {
  // Liefert [[accountId, minorDelta], …]
  const out = [];
  const a = S.data.accounts.get(t.accountId);
  if (a) {
    const m = toMinor(t.amount, a.currency);
    if (t.kind === "expense" || t.kind === "transfer") out.push([a.id, -Math.abs(m)]);
    else if (t.kind === "income") out.push([a.id, Math.abs(m)]);
    else if (t.kind === "adjust") out.push([a.id, m]);
  }
  if (t.kind === "transfer") {
    const b = S.data.accounts.get(t.toAccountId);
    if (b) out.push([b.id, Math.abs(toMinor(t.toAmount, b.currency))]);
  }
  return out;
}
function derive() {
  if (memo.v === DATA_V && memo.r === RATES_V && memo.d) return memo.d;
  const minor = new Map();
  for (const a of S.data.accounts.values()) minor.set(a.id, toMinor(a.opening || 0, a.currency));
  const txCount = new Map();
  for (const t of S.data.tx.values()) {
    for (const [id, d] of txEffects(t)) {
      minor.set(id, (minor.get(id) || 0) + d);
      txCount.set(id, (txCount.get(id) || 0) + 1);
    }
  }
  const bal = new Map();
  for (const [id, m] of minor) bal.set(id, fromMinor(m, S.data.accounts.get(id).currency));
  const byCur = {};
  for (const c of CURS) byCur[c] = { minor: 0, native: 0, eur: 0, n: 0 };
  let total = 0;
  const missing = new Set();
  for (const a of accountsList(false)) {
    if (a.includeInTotal === false) continue;
    const g = byCur[a.currency];
    g.minor += minor.get(a.id) || 0;
    g.n++;
  }
  for (const c of CURS) {
    const g = byCur[c];
    g.native = fromMinor(g.minor, c);
    const e = toEUR(g.native, c);
    if (e == null) { if (g.n) missing.add(c); g.eur = null; }
    else { g.eur = e; total += e; }
  }
  memo = { v: DATA_V, r: RATES_V, d: { bal, byCur, total, missing: Array.from(missing), txCount } };
  return memo.d;
}
function balanceOf(id) { return derive().bal.get(id) || 0; }
function hasDemo() {
  for (const name of COLS) for (const d of S.data[name].values()) if (d.demo) return true;
  return false;
}
function txEUR(t) {
  if (typeof t.eur === "number" && isFinite(t.eur)) return t.eur;
  const a = S.data.accounts.get(t.accountId);
  if (!a) return 0;
  const v = toEUR(Math.abs(t.amount || 0), a.currency);
  return v == null ? 0 : v;
}
function txList() {
  return Array.from(S.data.tx.values()).sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.createdAt || 0) - (a.createdAt || 0));
}
function monthFlows(ym) {
  let inc = 0, exp = 0;
  const cats = new Map();
  for (const t of S.data.tx.values()) {
    if (!t.date || monthKey(t.date) !== ym) continue;
    const acc = S.data.accounts.get(t.accountId);
    if (acc && acc.includeInTotal === false) continue;
    if (t.kind === "income") inc += txEUR(t);
    else if (t.kind === "expense") {
      const v = txEUR(t);
      exp += v;
      const c = t.category || "Sonstiges";
      cats.set(c, (cats.get(c) || 0) + v);
    }
  }
  return { inc, exp, net: inc - exp, cats };
}
function allCategories(kind) {
  const set = new Set(kind === "income" ? INCOME_CATS : EXPENSE_CATS);
  for (const t of S.data.tx.values()) if (t.category && (!kind || t.kind === kind)) set.add(t.category);
  for (const f of S.data.fixed.values()) if (f.category && (!kind || f.kind === kind)) set.add(f.category);
  if (kind !== "income") for (const b of S.data.budgets.values()) if (b.category) set.add(b.category);
  return Array.from(set);
}

/* ---------- Fixkosten-Termine ---------- */
function occurrences(f, from, to) {
  const out = [];
  if (!validISO(f.anchor) || from > to) return out;
  if (f.interval === "weekly") {
    let d = f.anchor;
    if (d < from) d = addDays(d, Math.ceil(daysBetween(d, from) / 7) * 7);
    for (let g = 0; g < 600 && d <= to; g++, d = addDays(d, 7)) out.push(d);
    return out;
  }
  const step = (INTERVALS[f.interval] || INTERVALS.monthly).step;
  const a = parseISO(f.anchor), fr = parseISO(from);
  let k = Math.max(0, Math.floor(((fr.getFullYear() - a.getFullYear()) * 12 + fr.getMonth() - a.getMonth()) / step) - 1);
  for (let g = 0; g < 600; g++, k++) {
    const d = addMonthsClamped(f.anchor, k * step);
    if (d > to) break;
    if (d >= from) out.push(d);
  }
  return out;
}
function intervalDays(f) {
  return f.interval === "weekly" ? 7 : (INTERVALS[f.interval] || INTERVALS.monthly).step * 31;
}
function prevDue(f, today) {
  if (!validISO(f.anchor) || f.anchor > today) return null;
  const occ = occurrences(f, addDays(today, -intervalDays(f) - 1), today);
  return occ.length ? occ[occ.length - 1] : null;
}
function nextDue(f, today) {
  if (!validISO(f.anchor)) return null;
  const start = f.anchor > today ? f.anchor : addDays(today, 1);
  return occurrences(f, start, addDays(start, intervalDays(f) + 1))[0] || null;
}
const fixedTxId = (fid, due) => "fx_" + fid + "_" + due.replace(/-/g, "");
function monthlyEquiv(f) { return (+f.amount || 0) * (INTERVALS[f.interval] || INTERVALS.monthly).factor; }
function monthlyEquivEUR(f) {
  const v = toEUR(monthlyEquiv(f), f.currency || "EUR");
  return v == null ? 0 : v;
}
function fixedStatus(f, today) {
  const p = prevDue(f, today), n = nextDue(f, today);
  const pTx = p ? S.data.tx.get(fixedTxId(f.id, p)) : null;
  const nTx = n ? S.data.tx.get(fixedTxId(f.id, n)) : null;
  if (p && !pTx) return { state: "open", due: p, next: n };
  if (n && !nTx && daysBetween(today, n) <= 7) return { state: "soon", due: n, next: n, paidPrev: !!pTx };
  if (n && nTx) return { state: "paid", due: n, next: n, early: true };
  return { state: pTx ? "paid" : "upcoming", due: p || n, next: n, paidAt: pTx && pTx.date };
}
function fixedDueInMonth(ym) {
  const from = ym + "-01";
  const to = addDays(addMonthKey(ym, 1) + "-01", -1);
  const out = [];
  for (const f of S.data.fixed.values()) {
    if (f.active === false) continue;
    for (const d of occurrences(f, from, to)) out.push({ f, due: d, booked: S.data.tx.has(fixedTxId(f.id, d)) });
  }
  return out.sort((a, b) => a.due.localeCompare(b.due));
}

/* ---------- Ziele ---------- */
function goalProgress(g) {
  let cur = 0, ok = true;
  if (g.kind === "networth") {
    const d = derive();
    const v = convert(d.total, "EUR", g.currency);
    if (v == null || d.missing.length) ok = false;
    cur = v == null ? 0 : v;
  } else {
    for (const id of g.accountIds || []) {
      const a = S.data.accounts.get(id);
      if (!a) continue;
      const v = convert(balanceOf(id), a.currency, g.currency);
      if (v == null) ok = false; else cur += v;
    }
    cur += +g.manual || 0;
  }
  const pct = g.target > 0 ? cur / g.target : 0;
  let perMonth = null, monthsLeft = null;
  if (validISO(g.deadline)) {
    monthsLeft = Math.max(0, daysBetween(isoDate(), g.deadline) / 30.44);
    const rest = Math.max(0, g.target - cur);
    perMonth = monthsLeft > 0.5 ? rest / monthsLeft : rest;
  }
  return { current: cur, pct, ok, perMonth, monthsLeft };
}

function goalsList() {
  return Array.from(S.data.goals.values()).sort((a, b) => (a.kind === "networth" ? 0 : 1) - (b.kind === "networth" ? 0 : 1) || (a.createdAt || 0) - (b.createdAt || 0));
}

/* ---------- Meldungen (Ziele, Zwischenstände, Wochenrückblick, Kursrutsch) ---------- */
const MILESTONES = [0.5, 0.75, 0.9, 1];
function alertsDoc() { return S.data.meta.get("alerts") || null; }
function notifyPrefs() {
  const n = ((S.data.meta.get("settings") || {}).notify) || {};
  return { goals: n.goals !== false, milestones: n.milestones !== false, weekly: n.weekly !== false, crash: n.crash !== false, crashPct: +n.crashPct > 0 ? +n.crashPct : 10 };
}
function goalAlert(id) {
  const a = alertsDoc();
  return a && a.goals ? a.goals[id] || null : null;
}
