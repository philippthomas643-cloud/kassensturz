// Screenshots zum Anschauen: node test/shots.mjs [hell|dunkel]
import { launch, phoneContext, mockRates, startServer, BASE, watchErrors, root } from "./helpers.mjs";
import fs from "node:fs";
import path from "node:path";
const scheme = process.argv[2] === "dunkel" ? "dark" : "light";
const dir = path.join(root, "test", "shots");
fs.mkdirSync(dir, { recursive: true });
const srv = await startServer();
const browser = await launch();
const errors = [];
try {
  const ctx = await phoneContext(browser, { colorScheme: scheme });
  await mockRates(ctx);
  const page = await ctx.newPage();
  watchErrors(page, errors);
  await page.goto(BASE);
  await page.waitForSelector(".welcome");
  await page.screenshot({ path: path.join(dir, scheme + "-01-welcome.png") });
  await page.click('[data-act="load-demo"]');
  await page.waitForSelector(".hero");
  await page.waitForTimeout(1200);
  const noToasts = () => page.evaluate(() => document.querySelectorAll(".toast").forEach((t) => t.remove()));
  await noToasts();
  await page.screenshot({ path: path.join(dir, scheme + "-02-uebersicht.png") });
  await page.screenshot({ path: path.join(dir, scheme + "-03-uebersicht-voll.png"), fullPage: true });
  await page.click('[data-act="chart-view"][data-v="alloc"]');
  await page.waitForSelector(".alloc-donut");
  await noToasts();
  await page.evaluate(() => { const h = document.querySelector(".hero"); window.scrollTo(0, h.getBoundingClientRect().top + window.scrollY - 60); });
  await page.screenshot({ path: path.join(dir, scheme + "-04-aufteilung.png") });
  await page.click('.alloc-item[data-key="BTC"]');
  await page.evaluate(() => { const h = document.querySelector(".alloc"); window.scrollTo(0, h.getBoundingClientRect().top + window.scrollY - 70); });
  await page.screenshot({ path: path.join(dir, scheme + "-05-aufteilung-btc.png") });
  await page.click('[data-act="alloc-by"][data-v="acc"]');
  await page.evaluate(() => { const h = document.querySelector(".alloc"); window.scrollTo(0, h.getBoundingClientRect().top + window.scrollY - 70); });
  await page.screenshot({ path: path.join(dir, scheme + "-06-aufteilung-konten.png") });
  await page.click('[data-act="chart-view"][data-v="growth"]');
  for (const r of ["konten", "buchungen", "fixkosten", "budget", "ziele"]) {
    await page.goto(BASE + "#" + r);
    await page.waitForTimeout(400);
    await noToasts();
    await page.screenshot({ path: path.join(dir, scheme + "-1" + ["konten", "buchungen", "fixkosten", "budget", "ziele"].indexOf(r) + "-" + r + ".png") });
  }
  await page.goto(BASE + "#uebersicht");
  await page.click("#fab");
  await page.waitForSelector(".modal");
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(dir, scheme + "-20-buchung.png") });
  await page.click('[data-act="close-modal"]');
  await page.click("#btn-settings-top");
  await page.waitForSelector(".modal");
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(dir, scheme + "-21-einstellungen.png") });
  // Desktop
  const d = await browser.newContext({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: 1, colorScheme: scheme, locale: "de-DE", timezoneId: "Asia/Nicosia" });
  await mockRates(d);
  const dp = await d.newPage();
  watchErrors(dp, errors);
  await dp.goto(BASE);
  await dp.waitForSelector(".welcome");
  await dp.click('[data-act="load-demo"]');
  await dp.waitForSelector(".hero");
  await dp.waitForTimeout(1200);
  await dp.evaluate(() => document.querySelectorAll(".toast").forEach((t) => t.remove()));
  await dp.screenshot({ path: path.join(dir, scheme + "-30-desktop.png"), fullPage: true });
} finally {
  await browser.close();
  srv.kill();
}
console.log(errors.length ? "FEHLER:\n" + errors.join("\n") : "keine Konsolenfehler");
