// Gemeinsame Test-Helfer: Browser starten, iPhone-Kontext, Kurs-APIs simulieren.
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import path from "node:path";
const require = createRequire(import.meta.url);
const { chromium } = (() => { try { return require("playwright"); } catch { return require("/opt/npm-tools/node_modules/playwright"); } })();
export const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
export const BASE = "http://localhost:8099/kassensturz/";

export function startServer() {
  const p = spawn(process.execPath, [path.join(root, "tools/serve.mjs"), "8099"], { stdio: "ignore" });
  return new Promise((r) => setTimeout(() => r(p), 400));
}
export const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

// Kurs-Quellen: mode = "ok" | "cryptocom-down" | "all-down"
export async function mockRates(ctx, mode = "ok", px = { btc: 75737.64, eurusdt: 1.1252 }) {
  const cors = { "access-control-allow-origin": "*", "content-type": "application/json" };
  await ctx.route("https://api.crypto.com/**", (route) => {
    if (mode !== "ok") return route.abort();
    const u = new URL(route.request().url());
    const inst = u.searchParams.get("instrument_name");
    const a = inst === "BTC_EUR" ? px.btc : px.eurusdt;
    route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ id: -1, method: "public/get-tickers", code: 0, result: { data: [{ i: inst, a: String(a), c: inst === "BTC_EUR" ? "0.0141" : "-0.0004", t: Date.now() }] } }) });
  });
  const binance = (route) => {
    if (mode === "all-down") return route.abort();
    route.fulfill({ status: 200, headers: cors, body: JSON.stringify([{ symbol: "BTCEUR", lastPrice: String(px.btc + 12), priceChangePercent: "1.380" }, { symbol: "EURUSDT", lastPrice: String(px.eurusdt), priceChangePercent: "0.050" }]) });
  };
  await ctx.route("https://api.binance.com/**", binance);
  await ctx.route("https://data-api.binance.vision/**", binance);
  await ctx.route("https://api.coingecko.com/**", (route) => mode === "all-down" ? route.abort() : route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ bitcoin: { eur: px.btc, eur_24h_change: 1.2, usd: 88000 }, tether: { eur: 1 / px.eurusdt, eur_24h_change: -0.05 } }) }));
  await ctx.route("https://api.coinbase.com/**", (route) => mode === "all-down" ? route.abort() : route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ data: { currency: "EUR", rates: { BTC: String(1 / px.btc), USDT: String(px.eurusdt) } } }) }));
}

export async function launch() { return chromium.launch(); }
export async function phoneContext(browser, opts = {}) {
  return browser.newContext(Object.assign({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: IPHONE_UA, locale: "de-DE", timezoneId: "Asia/Nicosia", colorScheme: "light",
    serviceWorkers: "allow",
  }, opts));
}
export function watchErrors(page, list) {
  page.on("pageerror", (e) => list.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") list.push("console: " + m.text()); });
}
