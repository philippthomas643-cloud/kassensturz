// Funktionstest der fertigen App (docs/): node test/run.mjs
// Prüft Start, Konten, Buchungen, Ziele+Meldungen, Fixkosten, Diagramme, Speicher, Offline, Update, Backup, Kursquellen.
import { launch, phoneContext, mockRates, startServer, BASE, watchErrors, root } from "./helpers.mjs";
import { renderFixtures } from "./fixtures.mjs";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

let pass = 0, fail = 0;
const errors = [];
function ok(cond, msg) { if (cond) { pass++; console.log("  ✓ " + msg); } else { fail++; console.log("  ✗ " + msg); } }
const step = (t) => console.log("\n▸ " + t);
const num = (s) => parseFloat(String(s).replace(/[^\d,−-]/g, "").replace(/\./g, "").replace(",", ".").replace("−", "-"));
const heroValue = (page) => page.$eval(".hero-value", (e) => e.textContent);
const closeToasts = (page) => page.evaluate(() => document.querySelectorAll(".toast").forEach((t) => t.remove()));
async function fill(page, sel, v) { await page.fill(sel, ""); await page.type(sel, v); }
async function seg(page, name, v) { await page.click('[data-seg="' + name + '"] [data-seg-val="' + v + '"]'); }

const build = (salt) => execFileSync(process.execPath, [path.join(root, "tools/build.mjs")], { env: Object.assign({}, process.env, salt ? { KS_SALT: salt } : {}) }).toString().trim();
build();
const srv = await startServer();
const browser = await launch();
try {
  /* ---------------- 1. Erster Start ---------------- */
  step("Erster Start");
  const ctx = await phoneContext(browser);
  await mockRates(ctx);
  const page = await ctx.newPage();
  watchErrors(page, errors);
  await page.goto(BASE);
  await page.waitForSelector(".welcome");
  ok(await page.isHidden("#fab"), "Plus-Knopf beim Willkommen ausgeblendet");
  ok(await page.isHidden(".tabbar"), "Tab-Leiste beim Willkommen ausgeblendet");
  const v0 = await page.evaluate(() => window.kassensturz);
  ok(v0 && v0.version === JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version && v0.build.length === 10, "Version " + (v0 && v0.version) + " · Build " + (v0 && v0.build));

  /* ---------------- 2. Konten ---------------- */
  step("Konten anlegen");
  await page.click('[data-act="start-empty"]');
  await page.waitForSelector("#acc-name");
  await fill(page, "#acc-name", "Girokonto");
  await fill(page, "#acc-bal", "1.234,56");
  await page.click("#acc-save");
  await page.waitForFunction(() => /1\.234,56/.test((document.querySelector(".hero-value") || {}).textContent || ""), null, { timeout: 4000 }).catch(() => {});
  const hv1 = await heroValue(page);
  ok(/1\.234,56/.test(hv1), "Gesamtvermögen 1.234,56 € nach erstem Konto (" + hv1 + ")");
  ok(await page.isVisible("#fab"), "Plus-Knopf jetzt sichtbar");
  await page.click('[data-act="new-account"]');
  await page.waitForSelector("#acc-name");
  await fill(page, "#acc-name", "Cold Wallet");
  await seg(page, "acc-cur", "BTC");
  await fill(page, "#acc-bal", "0,05");
  await page.click("#acc-save");
  await page.waitForTimeout(300);
  const t1 = num(await heroValue(page));
  ok(Math.abs(t1 - (1234.56 + 0.05 * 75737.64)) < 0.02, "BTC wird live umgerechnet: " + t1.toFixed(2) + " €");

  /* ---------------- 3. Buchung ---------------- */
  step("Ausgabe buchen");
  await page.click('.quick [data-kind="expense"]');
  await page.waitForSelector("#tx-amt");
  await fill(page, "#tx-amt", "34,50");
  await fill(page, "#tx-cat", "Lebensmittel");
  await fill(page, "#tx-note", "Supermarkt");
  await page.click("#tx-save");
  await page.waitForTimeout(300);
  const t2 = num(await heroValue(page));
  ok(Math.abs(t1 - 34.5 - t2) < 0.02, "Gesamtvermögen sinkt um 34,50 €");
  ok(/Supermarkt/.test(await page.textContent(".ov")), "Buchung erscheint bei „Letzte Buchungen“");

  /* ---------------- 4. Diagramm-Umschalter ---------------- */
  step("Diagramme");
  await page.click('[data-act="chart-view"][data-v="alloc"]');
  await page.waitForSelector(".alloc-donut");
  ok((await page.$$(".alloc-item")).length === 2, "Aufteilung zeigt 2 Assets (Euro, Bitcoin)");
  await page.click('.alloc-item[data-key="BTC"]');
  ok(/Bitcoin/.test(await page.textContent(".alloc-center")), "Antippen zeigt Bitcoin in der Mitte");
  await page.click('[data-act="alloc-by"][data-v="acc"]');
  ok((await page.$$(".alloc-item")).length === 2, "Aufteilung nach Konten");
  await page.click('[data-act="chart-view"][data-v="growth"]');
  await page.waitForSelector("#chart-nw");
  ok(await page.$("#chart-nw .chart-empty, #chart-nw svg") !== null, "Verlauf wird angezeigt");

  /* ---------------- 5. Ziel + Meldung ---------------- */
  step("Ziel und Meldung bei 75 %");
  await page.goto(BASE + "#ziele");
  await page.click('.page-actions [data-act="new-goal"]');
  await page.waitForSelector("#gl-name");
  await seg(page, "gl-kind", "networth");
  await fill(page, "#gl-name", "Erste 10k");
  await fill(page, "#gl-target", "10.000");
  await page.click("#gl-save");
  await page.waitForTimeout(3500); // Ziel wird beim ersten Prüfen nur gemerkt
  await closeToasts(page);
  // Kontostand erhöhen → über 75 %
  await page.goto(BASE + "#konten");
  await page.click('.acc-row:has-text("Girokonto")');
  await page.click('.modal [data-act="adjust-balance"]');
  await page.waitForSelector("#adj-val");
  await fill(page, "#adj-val", "4.000");
  await page.click("#adj-save");
  const toastText = await page.waitForSelector(".toast:has-text('geschafft')", { timeout: 9000 }).then((e) => e.textContent()).catch(() => "");
  ok(/Erste 10k: 75 % geschafft/.test(toastText), "Meldung: " + (toastText || "keine"));
  await page.goto(BASE + "#ziele");
  ok(/75 % geschafft/.test(await page.textContent(".notify")), "Meldung steht im Verlauf der Meldungen");

  /* ---------------- 6. Fixkosten ---------------- */
  step("Fixkosten");
  await page.goto(BASE + "#fixkosten");
  await page.click('.page-actions [data-act="new-fixed"]');
  await page.waitForSelector("#fx-name");
  await fill(page, "#fx-name", "Miete");
  await fill(page, "#fx-amt", "950");
  const today = await page.evaluate(() => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); });
  await page.fill("#fx-anchor", today);
  await page.click("#fx-save");
  await page.waitForTimeout(300);
  const bookBtn = await page.$('[data-act="book-fixed"]');
  ok(!!bookBtn, "Fällige Miete hat einen Buchen-Knopf");
  if (bookBtn) {
    await bookBtn.click();
    await page.waitForSelector("#tx-save");
    await page.click("#tx-save");
    await page.waitForTimeout(400);
    ok(/gebucht/.test(await page.textContent("main")), "Miete als gebucht markiert");
  }

  /* ---------------- 7. Speicher bleibt ---------------- */
  step("Neu laden – Daten bleiben");
  await page.goto(BASE + "#uebersicht");
  await page.reload();
  await page.waitForSelector(".hero");
  ok(/Girokonto/.test(await page.textContent(".ov")) && /Cold Wallet/.test(await page.textContent(".ov")), "Konten nach Neuladen noch da");

  /* ---------------- 8. Offline ---------------- */
  step("Offline");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 8000 }).catch(() => {});
  ok(await page.evaluate(() => !!navigator.serviceWorker.controller), "Service Worker steuert die Seite");
  await ctx.setOffline(true);
  await page.reload();
  await page.waitForSelector(".hero", { timeout: 8000 });
  ok(/Girokonto/.test(await page.textContent(".ov")), "App startet offline mit allen Daten");
  await page.waitForTimeout(500);
  ok(/Offline/.test(await page.textContent("#top-status")), "Status zeigt „Offline“");
  await ctx.setOffline(false);

  /* ---------------- 9. Update ---------------- */
  step("Update ausliefern");
  const oldBuild = (await page.evaluate(() => window.kassensturz)).build;
  build("update-test-" + Date.now());
  await page.reload();
  await page.waitForFunction((b) => window.kassensturz && window.kassensturz.build !== b, oldBuild, { timeout: 15000 }).catch(() => {});
  const newBuild = (await page.evaluate(() => window.kassensturz)).build;
  ok(newBuild !== oldBuild, "Neue Version automatisch übernommen (" + oldBuild + " → " + newBuild + ")");
  ok(/Girokonto/.test(await page.textContent("main")), "Daten nach dem Update unverändert");
  build();

  /* ---------------- 10. Backup ---------------- */
  step("Backup sichern, alles löschen, Backup einspielen");
  const desk = await browser.newContext({ viewport: { width: 1280, height: 860 }, acceptDownloads: true, locale: "de-DE" });
  await mockRates(desk);
  const dp = await desk.newPage();
  watchErrors(dp, errors);
  await dp.goto(BASE);
  await dp.waitForSelector(".welcome");
  await dp.click('[data-act="load-demo"]');
  await dp.waitForSelector(".hero");
  await dp.waitForTimeout(600);
  const demoTotal = await heroValue(dp);
  await dp.click("#btn-settings-side");
  const [dl] = await Promise.all([dp.waitForEvent("download"), dp.click('.modal [data-act="export-json"]')]);
  const file = path.join(root, "test", "backup-test.json");
  await dl.saveAs(file);
  const bk = JSON.parse(fs.readFileSync(file, "utf8"));
  ok(bk.app === "Kassensturz" && bk.accounts.length === 6 && bk.tx.length > 20, "Backup enthält " + bk.accounts.length + " Konten, " + bk.tx.length + " Buchungen");
  await dp.click('[data-act="close-modal"]').catch(() => {});
  await dp.click("#btn-settings-side");
  await dp.click('.modal [data-act="wipe-all"]');
  await dp.check("#cf-check");
  await dp.click("#cf-ok");
  await dp.waitForTimeout(500);
  ok(/0,00/.test(await heroValue(dp)), "Nach „Alles löschen“ ist das Vermögen 0");
  await dp.click("#btn-settings-side");
  await dp.setInputFiles("#st-import", file);
  await dp.click("#cf-ok");
  await dp.waitForTimeout(800);
  ok((await heroValue(dp)) === demoTotal, "Backup eingespielt – Vermögen wieder " + demoTotal.trim());

  /* ---------------- 11. Beispieldaten löschen ---------------- */
  step("Beispieldaten löschen");
  await dp.click('[data-act="clear-demo"]');
  await dp.click("#cf-ok");
  await dp.waitForTimeout(600);
  ok(!(await dp.$(".welcome")) && /Noch keine Konten/.test(await dp.textContent("main")), "Leere Übersicht statt Beispieldaten");
  await desk.close();

  /* ---------------- 12. Scrollposition (wie Safari: ohne Scroll-Verankerung) ---------------- */
  step("Scrollposition bleibt bei Tipps");
  const cs = await phoneContext(browser);
  await mockRates(cs);
  const ps = await cs.newPage();
  watchErrors(ps, errors);
  await ps.goto(BASE);
  await ps.click('[data-act="load-demo"]');
  await ps.waitForSelector(".hero");
  await ps.waitForTimeout(1200);
  await closeToasts(ps);
  await ps.addStyleTag({ content: "*{overflow-anchor:none !important}" });
  const tapKeeps = async (sel, label, setup) => {
    const el = await ps.$(sel);
    if (!el) { ok(false, label + " (nicht gefunden)"); return; }
    await el.evaluate((e) => e.scrollIntoView({ block: "center" }));
    await ps.waitForTimeout(80);
    const y0 = await ps.evaluate(() => Math.round(scrollY));
    await el.tap();
    await ps.waitForTimeout(350);
    const y1 = await ps.evaluate(() => Math.round(scrollY));
    ok(Math.abs(y1 - y0) <= 2, label + " – Position bleibt (" + y0 + " → " + y1 + ")");
  };
  await ps.evaluate(() => { window.__conv = document.querySelector("#conv-amt"); });
  await tapKeeps('[data-act="conv-cur"][data-cur="EUR"]', "Umrechner: Währung EUR");
  await tapKeeps('[data-act="conv-cur"][data-cur="USDT"]', "Umrechner: Währung USDT");
  ok(await ps.evaluate(() => window.__conv === document.querySelector("#conv-amt")), "Umrechner-Feld wird nicht neu aufgebaut");
  ok(/USDT/.test(await ps.textContent("#conv-out")) === false && /Euro/.test(await ps.textContent("#conv-out")), "Umrechner rechnet nach Währungswechsel");
  await tapKeeps('[data-act="chart-range"][data-v="3M"]', "Diagramm: Zeitraum");
  await tapKeeps('[data-act="chart-mode"][data-v="cur"]', "Diagramm: Assets");
  await tapKeeps('[data-act="chart-view"][data-v="alloc"]', "Umschalter: Aufteilung");
  await tapKeeps('.alloc-item[data-key="BTC"]', "Aufteilung: Bitcoin antippen");
  await tapKeeps('[data-act="alloc-by"][data-v="acc"]', "Aufteilung: nach Konten");
  await tapKeeps('[data-act="chart-view"][data-v="growth"]', "Umschalter: Verlauf");
  // Neue Kurse im Hintergrund (passiver Neuaufbau)
  await ps.$eval('[data-act="conv-cur"][data-cur="BTC"]', (e) => e.scrollIntoView({ block: "center" }));
  const yb = await ps.evaluate(() => Math.round(scrollY));
  await ps.evaluate(() => window.dispatchEvent(new Event("online")));
  await ps.waitForTimeout(900);
  ok(Math.abs((await ps.evaluate(() => Math.round(scrollY))) - yb) <= 2, "Neue Kurse im Hintergrund verschieben nichts");
  await ps.goto(BASE + "#buchungen");
  await ps.waitForSelector(".filters");
  await ps.evaluate(() => window.scrollTo(0, 400));
  await tapKeeps('[data-act="tx-month-step"][data-v="-1"]', "Buchungen: Monat zurück");
  await ps.goto(BASE + "#budget");
  await ps.waitForSelector(".month-nav");
  await tapKeeps('[data-act="budget-month"][data-v="-1"]', "Budget: Monat zurück");
  await ps.goto(BASE + "#konten");
  await ps.waitForSelector(".acc-row");
  await ps.evaluate(() => window.scrollTo(0, 99999));
  const yk = await ps.evaluate(() => Math.round(scrollY));
  await ps.goto(BASE + "#uebersicht");
  await ps.waitForSelector(".hero");
  ok((await ps.evaluate(() => Math.round(scrollY))) === 0 || yk === 0, "Seitenwechsel beginnt oben");
  await cs.close();

  /* ---------------- 13. Scannen: Screenshot und Kassenzettel (erfundene Testbilder) ---------------- */
  step("Screenshot und Kassenzettel einlesen");
  const fx = path.join(root, "test", ".fixtures");
  await renderFixtures(browser, fx);
  const cf = await phoneContext(browser);
  await mockRates(cf);
  const pf = await cf.newPage();
  watchErrors(pf, errors);
  await pf.goto(BASE);
  await pf.click('[data-act="start-empty"]');
  await pf.waitForSelector("#acc-name");
  await fill(pf, "#acc-name", "Girokonto");
  await fill(pf, "#acc-bal", "500");
  await pf.click("#acc-save");
  await pf.waitForSelector(".scan-btn");
  await pf.setInputFiles("#scan-shot", [path.join(fx, "liste.png")]);
  await pf.waitForSelector("#sc-save", { timeout: 120000 });
  const rows = await pf.$$eval(".scan-row", (rs) => rs.map((r) => ({ m: r.querySelector(".scan-m").value, s: r.querySelector(".scan-sign").textContent, a: r.querySelector(".scan-a").value, c: r.querySelector(".scan-c").value })));
  const by = (n) => rows.find((r) => r.m.includes(n)) || {};
  ok(rows.length === 5, "5 Umsätze erkannt, abgelehnte Zahlung übersprungen (" + rows.map((r) => r.m).join(", ") + ")");
  ok(by("Spotify").a === "11,99" && by("Spotify").s === "−" && by("Spotify").c === "Abos & Software", "Spotify −11,99 € · Abos & Software");
  ok(by("Gehalt").s === "+" && by("Gehalt").a === "2.450,00", "Gehalt als Einnahme +2.450 €");
  ok(/1\.204,56/.test(await pf.textContent(".scan-bal")), "Kontostand 1.204,56 € erkannt");
  await pf.click("#sc-save");
  await pf.waitForTimeout(700);
  ok(/1\.204,56/.test(await heroValue(pf)), "Nach dem Übernehmen stimmt der Kontostand");
  await pf.setInputFiles("#scan-shot", [path.join(fx, "liste.png")]);
  await pf.waitForSelector("#sc-save", { timeout: 120000 });
  ok((await pf.$$eval(".scan-ck", (cs) => cs.filter((c) => c.checked).length)) === 0, "Zweiter Import: alles als schon gebucht erkannt");
  ok(/passt schon/.test(await pf.textContent("#sc-bal-hint")), "Zweiter Import: Kontostand passt schon");
  await pf.click('[data-act="close-modal"]');
  await pf.setInputFiles("#scan-receipt", [path.join(fx, "kassenzettel.jpg")]);
  await pf.waitForSelector("#tx-save", { timeout: 120000 });
  ok((await pf.inputValue("#tx-amt")) === "11,46" && (await pf.inputValue("#tx-note")) === "Lidl" && (await pf.inputValue("#tx-date")) === "2026-10-04", "Kassenzettel: Lidl · 11,46 € · 04.10.2026");
  ok((await pf.inputValue("#tx-cat")) === "Lebensmittel", "Kassenzettel: Kategorie Lebensmittel");
  await pf.click("#tx-save");
  await pf.waitForTimeout(500);
  ok(/1\.193,10/.test(await heroValue(pf)), "Kassenzettel gebucht → Kontostand 1.193,10 €");
  await cf.close();

  /* ---------------- 14. Kursquellen ---------------- */
  step("Kursquellen");
  const c2 = await phoneContext(browser);
  await mockRates(c2, "cryptocom-down");
  const p2 = await c2.newPage();
  watchErrors(p2, errors);
  await p2.goto(BASE);
  await p2.click('[data-act="load-demo"]');
  await p2.waitForSelector(".hero");
  await p2.waitForFunction(() => /Binance/.test(document.querySelector("#rates-sub") ? document.querySelector("#rates-sub").textContent : ""), null, { timeout: 8000 }).catch(() => {});
  ok(/Binance/.test(await p2.textContent("#rates-sub")), "Crypto.com aus → Kurse von Binance");
  await c2.close();
  const c3 = await phoneContext(browser);
  await mockRates(c3, "all-down");
  const p3 = await c3.newPage();
  watchErrors(p3, errors);
  await p3.goto(BASE);
  await p3.click('[data-act="start-empty"]');
  await p3.waitForSelector("#acc-name");
  await fill(p3, "#acc-name", "Wallet");
  await seg(p3, "acc-cur", "BTC");
  await fill(p3, "#acc-bal", "0,1");
  await p3.click("#acc-save");
  await p3.waitForTimeout(1500);
  ok(/fehlt noch ein Kurs/.test(await p3.textContent("main")), "Ohne Kurs: Hinweis „Kurs fehlt“");
  await p3.click('.banner [data-act="open-settings"]');
  await fill(p3, "#st-btc", "80.000");
  await p3.click("#st-save");
  await p3.waitForTimeout(400);
  ok(/8\.000,00/.test(await heroValue(p3)), "Manueller Kurs eingetragen → 0,1 BTC = 8.000 €");
  await c3.close();
} catch (e) {
  fail++;
  console.log("  ✗ Abbruch: " + (e && e.stack || e));
} finally {
  await browser.close();
  srv.kill();
  try { fs.unlinkSync(path.join(root, "test", "backup-test.json")); } catch (e) { /* egal */ }
}
const relevant = errors.filter((e) => !/ERR_INTERNET_DISCONNECTED|net::ERR_FAILED|Failed to fetch|Failed to load resource/.test(e));
if (relevant.length) { fail++; console.log("\nKonsolenfehler:\n" + relevant.join("\n")); }
console.log("\n" + pass + " bestanden, " + fail + " fehlgeschlagen");
process.exit(fail ? 1 : 0);
