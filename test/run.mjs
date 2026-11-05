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
  // Sparziel ohne Datum, dann Datum setzen und wieder entfernen
  await closeToasts(page);
  await page.click('.page-actions [data-act="new-goal"]');
  await page.waitForSelector("#gl-name");
  await seg(page, "gl-kind", "savings");
  ok(await page.isHidden("#gl-date-wrap"), "Neues Ziel: „Ohne Datum“ ist vorausgewählt, kein Datumsfeld");
  await fill(page, "#gl-name", "Urlaub");
  await fill(page, "#gl-target", "2.000");
  await page.click("#gl-save");
  await page.waitForTimeout(400);
  const urlaub = '.goal:has-text("Urlaub")';
  ok(!!(await page.$(urlaub)) && !/Bis /.test(await page.textContent(urlaub)) && /noch 2\.000/.test(await page.textContent(urlaub)), "Sparziel ohne Datum gespeichert");
  await page.click(urlaub + ' [data-act="edit-goal"]');
  await page.waitForSelector("#gl-name");
  await seg(page, "gl-when", "date");
  ok(!(await page.isHidden("#gl-date-wrap")) && /^\d{4}-\d{2}-\d{2}$/.test(await page.inputValue("#gl-date")), "„Bis zu einem Datum“ zeigt das Datumsfeld mit Vorschlag");
  await page.fill("#gl-date", "2027-06-30");
  await page.click("#gl-save");
  await page.waitForTimeout(400);
  ok(/Bis 30\. Juni 2027|Bis 30\.06\.2027/.test(await page.textContent(urlaub)), "Mit Datum: „Bis …“ und Betrag pro Monat (" + (await page.textContent(urlaub)).match(/Bis [^€]*/) + ")");
  await page.click(urlaub + ' [data-act="edit-goal"]');
  await page.waitForSelector("#gl-name");
  await seg(page, "gl-when", "none");
  await page.click("#gl-save");
  await page.waitForTimeout(400);
  ok(!/Bis /.test(await page.textContent(urlaub)), "Datum wieder entfernt");

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
  // Gescannte Pizzeria löschen und von Hand nachbuchen → beim nächsten Import „gleicher Betrag“ statt „schon übernommen“
  const shot = async (o) => { await closeToasts(pf); await pf.waitForTimeout(700); await pf.screenshot(o); };
  const delTx = async (sel) => {
    await pf.goto(BASE + "#buchungen");
    if (await pf.$('[data-act="tx-month"][data-v="all"]')) await pf.click('[data-act="tx-month"][data-v="all"]');
    await pf.click(sel);
    await pf.waitForSelector("#tx-save");
    await pf.click('.modal [data-act="delete-tx"]');
    await pf.waitForTimeout(300);
    await closeToasts(pf);
    await pf.goto(BASE + "#uebersicht");
  };
  const addExp = async (amt, note, date) => {
    await pf.click('.quick [data-kind="expense"]');
    await pf.waitForSelector("#tx-amt");
    await fill(pf, "#tx-amt", amt);
    await fill(pf, "#tx-note", note);
    if (date) await pf.fill("#tx-date", date);
    await pf.click("#tx-save");
    await pf.waitForSelector(".modal", { state: "detached", timeout: 3000 }).catch(async () => { throw new Error("Buchung " + amt + " " + note + " offen: " + (await pf.textContent(".modal"))); });
    await pf.waitForTimeout(200);
  };
  await pf.goto(BASE + "#buchungen");
  await pf.click('[data-act="tx-month"][data-v="all"]');
  await pf.click('.tx-row:has-text("Pizzeria")');
  await pf.waitForSelector("#tx-save");
  const pizzaDate = await pf.inputValue("#tx-date");
  await pf.click('[data-act="close-modal"]');
  await delTx('.tx-row:has-text("Pizzeria")');
  await addExp("38,90", "Pizzeria Roma", pizzaDate);
  ok(!(await pf.$(".modal")) && /1\.204,56/.test(await heroValue(pf)), "Einzelne Buchung von Hand: keine Nachfrage");
  await pf.setInputFiles("#scan-shot", [path.join(fx, "liste.png")]);
  await pf.waitForSelector("#sc-save", { timeout: 120000 });
  ok((await pf.$$eval(".scan-ck", (cs) => cs.filter((c) => c.checked).length)) === 0, "Zweiter Import: alles als schon gebucht erkannt");
  ok(/passt schon/.test(await pf.textContent("#sc-bal-hint")), "Zweiter Import: Kontostand passt schon");
  const notes = await pf.$$eval(".scan-row", (rs) => rs.map((r) => r.querySelector(".scan-m").value + ": " + r.querySelector(".scan-note").textContent));
  ok(notes.filter((n) => /Schon übernommen/.test(n)).length === 4 && /Gleicher Betrag schon gebucht/.test(notes.find((n) => /^Pizzeria/.test(n)) || ""), "Zweiter Import fragt nach: 4× schon übernommen, Pizzeria mit gleichem Betrag");
  const pi = await pf.$$eval(".scan-m", (ms) => ms.findIndex((m) => /Pizzeria/.test(m.value)));
  if (process.env.KS_SHOTS) { await pf.$eval("#sc-ck-" + pi, (e) => e.scrollIntoView({ block: "center" })); await shot({ path: path.join(root, "test", "shots", "dup-scan.png") }); }
  await pf.click('[data-dupans="ok"][data-i="' + pi + '"]');
  ok((await pf.isChecked("#sc-ck-" + pi)) && /^1 Umsatz/.test(await pf.textContent("#sc-save")), "„Richtig“ hakt den Umsatz an");
  await pf.click('[data-dupans="dup"][data-i="' + pi + '"]');
  ok(!(await pf.isChecked("#sc-ck-" + pi)), "„Doppelt“ nimmt ihn wieder raus");
  await pf.click('[data-dupans="ok"][data-i="' + pi + '"]');
  await pf.uncheck("#sc-bal");
  await pf.click("#sc-save");
  await pf.waitForTimeout(600);
  await closeToasts(pf);
  ok(/1\.165,66/.test(await heroValue(pf)) && !(await pf.$(".dup-banner")), "Als richtig übernommen → gebucht, danach keine Doppel-Warnung");
  await delTx('.tx-row:has-text("Pizzeria")');
  ok(/1\.204,56/.test(await heroValue(pf)), "Zweite Pizzeria wieder gelöscht → 1.204,56 €");
  await pf.setInputFiles("#scan-receipt", [path.join(fx, "kassenzettel.jpg")]);
  await pf.waitForSelector("#tx-save", { timeout: 120000 });
  ok((await pf.inputValue("#tx-amt")) === "11,46" && (await pf.inputValue("#tx-note")) === "Lidl" && (await pf.inputValue("#tx-date")) === "2026-10-04", "Kassenzettel: Lidl · 11,46 € · 04.10.2026");
  ok((await pf.inputValue("#tx-cat")) === "Lebensmittel", "Kassenzettel: Kategorie Lebensmittel");
  await pf.click("#tx-save");
  await pf.waitForTimeout(500);
  ok(/1\.193,10/.test(await heroValue(pf)), "Kassenzettel gebucht → Kontostand 1.193,10 €");

  step("Doppelbuchungen");
  await closeToasts(pf);
  await pf.setInputFiles("#scan-receipt", [path.join(fx, "kassenzettel.jpg")]);
  await pf.waitForSelector("#tx-save", { timeout: 120000 });
  await pf.click("#tx-save");
  await pf.waitForSelector("#tx-dup");
  ok(/Lidl/.test(await pf.textContent("#tx-dup")) && /Richtig/.test(await pf.textContent("#tx-save")), "Gleicher Kassenzettel nochmal → Nachfrage „Doppelbuchung oder richtig?“");
  if (process.env.KS_SHOTS) await shot({ path: path.join(root, "test", "shots", "dup-ask.png") });
  await pf.click('[data-act="dup-skip"]');
  await pf.waitForTimeout(300);
  ok(!(await pf.$(".modal")) && /1\.193,10/.test(await heroValue(pf)), "„Doppelt – nicht buchen“ → nichts gebucht");
  await pf.setInputFiles("#scan-receipt", [path.join(fx, "kassenzettel.jpg")]);
  await pf.waitForSelector("#tx-save", { timeout: 120000 });
  await pf.click("#tx-save");
  await pf.waitForSelector("#tx-dup");
  await pf.click("#tx-save");
  await pf.waitForTimeout(500);
  ok(!(await pf.$(".modal")) && /1\.181,64/.test(await heroValue(pf)) && !(await pf.$(".dup-banner")), "„Richtig – buchen“ → gebucht, danach keine Warnung");
  await closeToasts(pf);
  await addExp("9,99", "Kino");
  await addExp("8", "Kino");
  ok(!(await pf.$(".modal")), "Anderer Betrag → keine Nachfrage");
  await pf.goto(BASE + "#buchungen");
  await pf.click('.tx-row:has-text("8,00 €")');
  await pf.waitForSelector("#tx-save");
  await fill(pf, "#tx-amt", "9,99");
  await pf.click("#tx-save");
  await pf.waitForTimeout(400);
  ok((await pf.$$(".tx-row .tag.warn")).length === 2 && !!(await pf.$(".dup-banner")), "Nachträglich gleicher Betrag → Hinweis + „doppelt?“ an beiden Buchungen");
  if (process.env.KS_SHOTS) await shot({ path: path.join(root, "test", "shots", "dup-list.png") });
  await pf.goto(BASE + "#uebersicht");
  ok(!!(await pf.$(".dup-banner")), "Hinweis auch in der Übersicht");
  await pf.click('.dup-banner [data-act="dup-review"]');
  await pf.waitForSelector(".dup-card");
  ok((await pf.$$(".dup-card")).length === 1, "Prüfliste zeigt das Paar");
  if (process.env.KS_SHOTS) await shot({ path: path.join(root, "test", "shots", "dup-review.png") });
  await pf.click('.dup-card [data-act="dup-ok"]');
  await pf.waitForTimeout(400);
  ok(!(await pf.$(".dup-card")) && !(await pf.$(".dup-banner")), "„Beide richtig“ → Hinweis weg");
  await closeToasts(pf);
  await addExp("5", "Snack");
  await addExp("6", "Snack");
  await pf.goto(BASE + "#buchungen");
  await pf.click('.tx-row:has-text("6,00 €")');
  await pf.waitForSelector("#tx-save");
  await fill(pf, "#tx-amt", "5");
  await pf.click("#tx-save");
  await pf.waitForTimeout(400);
  await pf.goto(BASE + "#uebersicht");
  const beforeDel = num(await heroValue(pf));
  await pf.click('.dup-banner [data-act="dup-review"]');
  await pf.waitForSelector(".dup-card");
  await pf.click('.dup-card [data-act="dup-del"]');
  await pf.waitForTimeout(400);
  ok(!(await pf.$(".modal")) && !(await pf.$(".dup-banner")) && Math.abs(num(await heroValue(pf)) - (beforeDel + 5)) < 0.01, "Doppelte gelöscht → Hinweis weg, Kontostand +5 €");
  await cf.close();

  /* ---------------- 13b. Positionen & Gewinn pro Coin ---------------- */
  step("Positionen im BTC-Konto");
  const cc = await phoneContext(browser);
  await mockRates(cc);
  const pc = await cc.newPage();
  watchErrors(pc, errors);
  await pc.goto(BASE);
  await pc.click('[data-act="start-empty"]');
  const newAcc = async (pg, name, cur, bal) => {
    if (!(await pg.waitForSelector("#acc-name", { timeout: 1200 }).catch(() => null))) await pg.click('[data-act="new-account"]');
    await pg.waitForSelector("#acc-name");
    await fill(pg, "#acc-name", name);
    await seg(pg, "acc-cur", cur);
    await fill(pg, "#acc-bal", bal);
    await pg.click("#acc-save");
    await pg.waitForSelector(".modal", { state: "detached", timeout: 3000 });
    await pg.waitForTimeout(250);
    await closeToasts(pg);
  };
  await newAcc(pc, "Ledger", "BTC", "0,05");
  await newAcc(pc, "Binance", "USDT", "2.000");
  const de = (v, d) => new Intl.NumberFormat("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
  const P = 75737.64 * 1.1252; // BTC in USDT laut simulierten Kursen
  const pctTxt = (v) => de(Math.abs(v * 100), 1) + " %";
  const btcCard = '.coins-panel .coin:has-text("Bitcoin")';
  ok(/Für wie viel hast du deine 0,05 BTC gekauft/.test(await pc.textContent(btcCard)), "Ohne Position: Aufforderung zum Eintragen");
  await pc.click(btcCard + ' [data-act="pos-new"]');
  await pc.waitForSelector("#pos-qty");
  ok((await pc.getAttribute('[data-seg="pos-mode"] [aria-pressed="true"]', "data-seg-val")) === "have" && (await pc.inputValue("#pos-qty")) === "0,05", "Erste Position: „Schon auf dem Konto“ mit 0,05 BTC vorgeschlagen");
  await fill(pc, "#pos-paid", "4.000");
  ok(/Kaufpreis 80\.000 USDT/.test(await pc.textContent("#pos-prev")), "Vorschau: Kaufpreis 80.000 USDT");
  await pc.click("#pos-save");
  await pc.waitForSelector(".modal", { state: "detached", timeout: 3000 });
  await pc.waitForTimeout(250);
  ok((await pc.textContent(btcCard)).includes("+" + pctTxt(P / 80000 - 1)), "Übersicht: +" + pctTxt(P / 80000 - 1) + " für Position 1");
  const noModal = async (pg) => { if (await pg.$(".modal")) { await pg.keyboard.press("Escape"); await pg.waitForSelector(".modal", { state: "detached", timeout: 3000 }); } };
  const openLedger = async () => {
    await closeToasts(pc);
    await noModal(pc);
    await pc.goto(BASE + "#konten");
    await pc.click('.acc-row:has-text("Ledger")');
    await pc.waitForSelector(".pos-sec");
  };
  const addPos = async (o) => {
    await pc.click('.pos-sec [data-act="pos-new"]');
    await pc.waitForSelector("#pos-qty");
    await fill(pc, "#pos-qty", o.qty);
    await pc.selectOption("#pos-pay", o.pay ? await pc.$eval("#pos-pay", (sel, n) => Array.from(sel.options).find((x) => x.textContent.startsWith(n)).value, o.pay) : "");
    if (o.quote) await seg(pc, "pos-q", o.quote);
    await fill(pc, "#pos-paid", o.paid);
    await pc.click("#pos-save");
    await pc.waitForSelector(".pos-sec", { timeout: 3000 });
    await pc.waitForTimeout(250);
  };
  const bal = async (name) => { await noModal(pc); await pc.goto(BASE + "#konten"); return pc.textContent('.acc-row:has-text("' + name + '") .bal .n'); };
  await openLedger();
  await pc.click('.pos-sec [data-act="pos-new"]');
  await pc.waitForSelector("#pos-qty");
  ok((await pc.getAttribute('[data-seg="pos-mode"] [aria-pressed="true"]', "data-seg-val")) === "buy", "Zweite Position: „Neu gekauft“ vorausgewählt");
  await pc.click('.modal [data-act="account-detail"]');
  await pc.waitForSelector(".pos-sec");
  await addPos({ qty: "0,01", pay: "Binance", paid: "1.000" });
  const det2 = await pc.textContent(".modal");
  ok((await pc.$$(".pos-row")).length === 2 && det2.includes(pctTxt(P / 100000 - 1)) && det2.includes("83.333 USDT"), "Position 2 einzeln (" + pctTxt(P / 100000 - 1) + "), Konto gesamt Ø 83.333 USDT");
  ok(/0,06 BTC/.test(await bal("Ledger")) && /1\.000,00 USDT/.test(await bal("Binance")), "Nachkauf: Ledger 0,06 BTC, Binance −1.000 USDT");
  await openLedger();
  await addPos({ qty: "0,02", pay: "", quote: "EUR", paid: "1.200" });
  ok((await pc.textContent(".pos-rows")).includes("+" + pctTxt(75737.64 / 60000 - 1)) && /0,08 BTC/.test(await bal("Ledger")), "Position 3 in Euro ohne Zahlkonto: +" + pctTxt(75737.64 / 60000 - 1) + ", Ledger 0,08 BTC");
  // Kauf über das normale Buchungsformular (Umbuchung USDT → BTC) wird als Position geführt
  await noModal(pc);
  await pc.goto(BASE + "#uebersicht");
  await pc.click('.quick [data-kind="transfer"]');
  await pc.waitForSelector("#tx-amt");
  const pickAcc = async (sel, name) => pc.selectOption(sel, await pc.$$eval(sel + " option", (os, n) => os.find((o) => o.textContent.startsWith(n)).value, name));
  await pickAcc("#tx-acc", "Binance");
  await pickAcc("#tx-to", "Ledger");
  ok((await pc.isVisible("#tx-pos-wrap")) && (await pc.isChecked("#tx-pos")), "Umbuchung USDT → BTC: „Als neue Position führen“ angehakt");
  await fill(pc, "#tx-amt", "500");
  await fill(pc, "#tx-toamt", "0,005");
  await pc.click("#tx-save");
  await pc.waitForSelector(".modal", { state: "detached", timeout: 3000 });
  await openLedger();
  ok((await pc.$$(".pos-row")).length === 4, "Umbuchung als Position 4 übernommen");
  // Verkauf: die ältesten Positionen werden zuerst abgebaut
  await noModal(pc);
  await pc.goto(BASE + "#uebersicht");
  await pc.click('.quick [data-kind="transfer"]');
  await pc.waitForSelector("#tx-amt");
  await pickAcc("#tx-acc", "Ledger");
  await pickAcc("#tx-to", "Binance");
  ok(!(await pc.isVisible("#tx-pos-wrap")), "Verkauf BTC → USDT: keine neue Position");
  await fill(pc, "#tx-amt", "0,06");
  await fill(pc, "#tx-toamt", "5.400");
  await pc.click("#tx-save");
  await pc.waitForSelector(".modal", { state: "detached", timeout: 3000 });
  await openLedger();
  ok((await pc.$$(".pos-row.closed")).length === 2 && (await pc.$$(".pos-row:not(.closed)")).length === 2, "Verkauf 0,06 BTC: Position 1 und 2 verkauft, 3 und 4 offen");
  if (process.env.KS_SHOTS) { await pc.waitForTimeout(500); await pc.$eval(".pos-sec", (e) => e.scrollIntoView()); await pc.screenshot({ path: path.join(root, "test", "shots", "positions.png") }); }
  await pc.click('.pos-row:has(.pos-n:text-is("4"))');
  await pc.waitForSelector("#pos-qty");
  await pc.click('.modal [data-act="pos-delete"]');
  await pc.waitForSelector(".pos-sec");
  ok((await pc.$$(".pos-row")).length === 3 && /0,02 BTC/.test(await bal("Ledger")) && /6\.400,00 USDT/.test(await bal("Binance")), "Position 4 gelöscht → Kauf-Buchung zurückgenommen");
  await pc.goto(BASE + "#uebersicht");
  if (process.env.KS_SHOTS) { await pc.$eval(".coins-panel", (e) => e.scrollIntoView()); await pc.waitForTimeout(300); await pc.screenshot({ path: path.join(root, "test", "shots", "positions-overview.png") }); }
  ok(/1 Position/.test(await pc.textContent(btcCard)), "Übersicht zählt offene Positionen");
  await cc.close();

  // Einkaufspreis aus Version 1.4.0 wird zu einer Position
  const cm = await phoneContext(browser);
  await mockRates(cm);
  const pm = await cm.newPage();
  watchErrors(pm, errors);
  await pm.goto(BASE);
  await pm.click('[data-act="start-empty"]');
  await newAcc(pm, "Wallet", "BTC", "0,05");
  await pm.evaluate(() => new Promise((res, rej) => {
    const r = indexedDB.open("kassensturz");
    r.onsuccess = () => {
      const db = r.result;
      const t = db.transaction("meta", "readwrite");
      t.objectStore("meta").put({ id: "cost", BTC: { qty: 0.05, paid: 4000, quote: "USDT", at: Date.now() } });
      t.oncomplete = () => { db.close(); res(); };
      t.onerror = () => rej(t.error);
    };
    r.onerror = () => rej(r.error);
  }));
  await pm.reload();
  await pm.waitForSelector(".coins-panel");
  await pm.waitForTimeout(400);
  ok((await pm.textContent(".coins-panel")).includes("+" + pctTxt(P / 80000 - 1)) && /1 Position/.test(await pm.textContent(".coins-panel")), "Einkaufspreis aus 1.4.0 als Position übernommen");
  await cm.close();

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
