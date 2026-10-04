/* ======================================================================
   Live-Kurse direkt von öffentlichen Börsen-Schnittstellen (ohne Konto,
   ohne Schlüssel). Reihenfolge: Crypto.com → Binance → CoinGecko → Coinbase.
   Liefert eine Quelle nicht, springt die nächste ein. Ergebnis:
   { BTC: { eur, ch24, usd }, USDT: { eur, ch24 } }  (ch24 in Prozent)
   ====================================================================== */
const RATE_POLL_MS = 60 * 1000;
const RATE_TIMEOUT_MS = 7000;
const LIVE = { timer: null, inflight: null, lastPersist: 0, failedAt: {} };

function pctFromChange(last, ch) {
  // Crypto.com liefert die 24h-Änderung als Anteil (0,0123 = 1,23 %), manchmal absolut
  if (ch == null || !isFinite(ch)) return null;
  if (Math.abs(ch) < 0.5) return ch * 100;
  const prev = last - ch;
  return prev > 0 ? (ch / prev) * 100 : null;
}
function invPct(p) { return p == null || !isFinite(p) ? null : (1 / (1 + p / 100) - 1) * 100; }
function num(v) { const n = typeof v === "number" ? v : parseFloat(String(v == null ? "" : v)); return isFinite(n) ? n : NaN; }
function sane(r) {
  const out = {};
  if (r.BTC && r.BTC.eur > 1000 && r.BTC.eur < 1e7) out.BTC = r.BTC;
  if (r.USDT && r.USDT.eur > 0.5 && r.USDT.eur < 2) out.USDT = r.USDT;
  return out;
}
async function getJSON(url) {
  const ctl = typeof AbortController === "function" ? new AbortController() : null;
  const timer = setTimeout(() => ctl && ctl.abort(), RATE_TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ctl ? ctl.signal : undefined, cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer" });
    if (!r.ok) throw Object.assign(new Error("HTTP " + r.status), { code: "http_" + r.status });
    return await r.json();
  } finally { clearTimeout(timer); }
}

const RATE_SOURCES = [
  {
    id: "cryptocom", name: "Crypto.com",
    async get() {
      const one = async (inst) => {
        const j = await getJSON("https://api.crypto.com/exchange/v1/public/get-tickers?instrument_name=" + inst);
        const t = j && j.result && Array.isArray(j.result.data) ? j.result.data.find((x) => x && x.i === inst) : null;
        if (!t) throw new Error("kein Kurs für " + inst);
        const last = num(t.a);
        return { last, ch: pctFromChange(last, num(t.c)) };
      };
      const [b, u] = await Promise.allSettled([one("BTC_EUR"), one("EUR_USDT")]);
      const out = {};
      if (b.status === "fulfilled" && b.value.last > 0) out.BTC = { eur: b.value.last, ch24: b.value.ch, usd: null };
      if (u.status === "fulfilled" && u.value.last > 0) out.USDT = { eur: 1 / u.value.last, ch24: invPct(u.value.ch) };
      return out;
    },
  },
  {
    id: "binance", name: "Binance",
    async get() {
      const q = "/api/v3/ticker/24hr?symbols=" + encodeURIComponent('["BTCEUR","EURUSDT"]');
      let j;
      try { j = await getJSON("https://api.binance.com" + q); } catch (e) { j = await getJSON("https://data-api.binance.vision" + q); }
      const by = {};
      for (const t of Array.isArray(j) ? j : []) by[t.symbol] = t;
      const out = {};
      if (by.BTCEUR) out.BTC = { eur: num(by.BTCEUR.lastPrice), ch24: num(by.BTCEUR.priceChangePercent), usd: null };
      if (by.EURUSDT && num(by.EURUSDT.lastPrice) > 0) out.USDT = { eur: 1 / num(by.EURUSDT.lastPrice), ch24: invPct(num(by.EURUSDT.priceChangePercent)) };
      return out;
    },
  },
  {
    id: "coingecko", name: "CoinGecko",
    async get() {
      const j = await getJSON("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,tether&vs_currencies=eur,usd&include_24hr_change=true");
      const out = {};
      if (j && j.bitcoin) out.BTC = { eur: num(j.bitcoin.eur), ch24: isFinite(num(j.bitcoin.eur_24h_change)) ? num(j.bitcoin.eur_24h_change) : null, usd: isFinite(num(j.bitcoin.usd)) ? num(j.bitcoin.usd) : null };
      if (j && j.tether) out.USDT = { eur: num(j.tether.eur), ch24: isFinite(num(j.tether.eur_24h_change)) ? num(j.tether.eur_24h_change) : null };
      return out;
    },
  },
  {
    id: "coinbase", name: "Coinbase",
    async get() {
      const j = await getJSON("https://api.coinbase.com/v2/exchange-rates?currency=EUR");
      const r = (j && j.data && j.data.rates) || {};
      const out = {};
      if (num(r.BTC) > 0) out.BTC = { eur: 1 / num(r.BTC), ch24: null, usd: null };
      if (num(r.USDT) > 0) out.USDT = { eur: 1 / num(r.USDT), ch24: null };
      return out;
    },
  },
];

/** Holt BTC- und USDT-Kurse; probiert Quellen nacheinander, bis beide da sind. */
async function fetchRatesFromSources() {
  const got = {};
  const used = [];
  const errors = [];
  const now = Date.now();
  // Quellen, die gerade erst ausgefallen sind, kommen ans Ende
  const order = RATE_SOURCES.slice().sort((a, b) => ((now - (LIVE.failedAt[a.id] || 0) < 15 * 60000) ? 1 : 0) - ((now - (LIVE.failedAt[b.id] || 0) < 15 * 60000) ? 1 : 0));
  for (const src of order) {
    if (got.BTC && got.USDT) break;
    try {
      const r = sane(await src.get());
      let took = false;
      for (const c of ["BTC", "USDT"]) if (!got[c] && r[c]) { got[c] = r[c]; took = true; }
      if (took) { used.push(src.name); delete LIVE.failedAt[src.id]; }
      if (!r.BTC && !r.USDT) LIVE.failedAt[src.id] = now;
    } catch (e) {
      LIVE.failedAt[src.id] = now;
      errors.push(src.name + ": " + ((e && e.message) || e));
    }
  }
  return { rates: got, src: used.join(" + "), errors };
}

function refreshRates(opts = {}) {
  if (rateMode() === "manual") { S.live.state = "off"; if (opts.manual) openSettings(); return Promise.resolve(); }
  if (LIVE.inflight) return LIVE.inflight;
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    S.live.state = "offline";
    S.live.busy = false;
    scheduleRender();
    if (opts.manual) toast("Kein Internet – es gelten die zuletzt gespeicherten Kurse.", { err: true });
    return Promise.resolve();
  }
  S.live.busy = true;
  if (!S.live.rates) S.live.state = "loading";
  scheduleRender();
  LIVE.inflight = (async () => {
    try {
      const { rates, src, errors } = await fetchRatesFromSources();
      if (rates.BTC || rates.USDT) {
        applyLive(rates, Date.now(), src);
        if (opts.manual) toast("Kurse aktualisiert · " + src);
      } else {
        S.live.state = navigator.onLine === false ? "offline" : "error";
        S.live.msg = errors.slice(0, 2).join(" · ");
        if (opts.manual) toast("Gerade keine Kurse erreichbar – es gelten die zuletzt gespeicherten.", { err: true });
      }
    } finally {
      S.live.busy = false;
      LIVE.inflight = null;
      scheduleRender();
    }
  })();
  return LIVE.inflight;
}

function applyLive(rates, at, src) {
  S.live.rates = Object.assign({}, S.live.rates || {}, rates);
  S.live.at = at;
  S.live.state = "ok";
  S.live.msg = "";
  S.live.src = src || S.live.src;
  RATES_V++;
  persistLive();
  scheduleSnapshot();
  scheduleChecks();
}

async function persistLive() {
  if (S.runtime !== "ok" || !S.live.rates) return;
  const doc = ratesDoc() || {};
  const lastAt = Math.max((doc.BTC && doc.BTC.at) || 0, (doc.USDT && doc.USDT.at) || 0);
  const age = Date.now() - Math.max(lastAt, LIVE.lastPersist);
  const newlyLive = ["BTC", "USDT"].some((c) => S.live.rates[c] && (!doc[c] || doc[c].src !== "live"));
  if (!newlyLive && age >= 0 && age < 10 * 60 * 1000 && doc.BTC && doc.BTC.eur) return;
  LIVE.lastPersist = Date.now();
  const next = Object.assign(stripId(doc), { mode: doc.mode || "live" });
  for (const c of ["BTC", "USDT"]) {
    const l = S.live.rates[c];
    if (l) next[c] = { eur: l.eur, ch24: l.ch24 == null ? null : round(l.ch24, 3), usd: l.usd == null ? null : l.usd, at: S.live.at, src: "live", from: S.live.src || "" };
  }
  try { await dbWrite("meta", "rates", "set", next); } catch (e) { /* nicht kritisch */ }
}

function startRates() {
  if (LIVE.timer) clearInterval(LIVE.timer);
  LIVE.timer = setInterval(() => {
    if (!document.hidden && rateMode() !== "manual") refreshRates();
  }, RATE_POLL_MS);
  if (rateMode() === "manual") S.live.state = "off";
  else refreshRates();
}
