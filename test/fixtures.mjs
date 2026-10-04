// Erfundene Testbilder (keine echten Daten): eine Umsatzliste im Stil einer Banking-App und ein Kassenzettel-Foto.
import fs from "node:fs";
export async function renderFixtures(browser, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 3 });
  const row = (name, sub, amt, green) => `<div class="row"><div class="av">${name.slice(0, 1)}</div><div class="mid"><div class="t">${name}</div><div class="s">${sub}</div></div><div class="a${green ? " g" : ""}">${amt}</div></div>`;
  await page.setContent(`<html><body style="margin:0;background:#000;color:#fff;font:17px -apple-system,'Helvetica Neue',Arial,sans-serif">
  <style>.wrap{padding:60px 14px 20px}.bal{font-size:40px;font-weight:700;margin:20px 0 4px}.bal small{font-size:24px}.d{color:#999;font-size:15px}
  .day{display:flex;justify-content:space-between;margin:26px 4px 10px;font-size:19px}.day span{color:#aaa;font-size:16px}
  .card{background:#1c1c1e;border-radius:22px;padding:6px 14px}.row{display:flex;align-items:center;gap:14px;padding:13px 0}
  .av{width:42px;height:42px;border-radius:50%;background:#2c2c2e;display:grid;place-items:center;font-weight:700;color:#7ef}.mid{flex:1}.t{font-size:18px}.s{color:#999;font-size:15px;margin-top:2px}
  .a{font-size:18px}.a.g{color:#30d158}</style>
  <div class="wrap"><div class="bal">1.204<small>,56 €</small></div><div class="d">Heute, 09:15</div>
  <div class="day">Heute <span>-23,40 €</span></div>
  <div class="card">${row("Spotify", "08:02", "-11,99 €")}${row("Tankstelle Shell", "07:40", "-48,10 €")}${row("Gehalt Muster GmbH", "07:00", "+2.450 €", true)}</div>
  <div class="day">Gestern <span>-62,30 €</span></div>
  <div class="card">${row("Lidl", "18:31", "-23,40 €")}${row("Cinema City", "20:05 · Unzureichendes Guthaben", "<s>14 €</s>")}${row("Pizzeria Roma", "21:10", "-38,90 €")}</div>
  </div></body></html>`);
  await page.screenshot({ path: dir + "/liste.png" });
  await page.setViewportSize({ width: 600, height: 900 });
  await page.setContent(`<html><body style="margin:0;background:#6b6f73;display:grid;place-items:center;height:900px">
  <div style="width:330px;background:#f4f1ea;padding:22px 20px;font:15px 'DejaVu Sans Mono','Courier New',monospace;color:#222;transform:rotate(-1.2deg);box-shadow:0 10px 30px rgba(0,0,0,.4);line-height:1.45">
  <div style="text-align:center;font-size:24px;font-weight:700;letter-spacing:2px">LIDL</div>
  <div style="text-align:center">Lidl Cyprus Ltd</div><div style="text-align:center">Leoforos Tombs 12, Paphos</div><div style="text-align:center">Tel. 26 123456</div>
  <div>--------------------------------</div>
  <div style="display:flex;justify-content:space-between"><span>Milch 1,5%</span><span>1,19</span></div>
  <div style="display:flex;justify-content:space-between"><span>Brot</span><span>2,49</span></div>
  <div style="display:flex;justify-content:space-between"><span>Bananen</span><span>1,79</span></div>
  <div style="display:flex;justify-content:space-between"><span>Kaffee</span><span>5,99</span></div>
  <div>--------------------------------</div>
  <div style="display:flex;justify-content:space-between;font-weight:700;font-size:18px"><span>SUMME EUR</span><span>11,46</span></div>
  <div style="display:flex;justify-content:space-between"><span>Kartenzahlung</span><span>11,46</span></div>
  <div style="display:flex;justify-content:space-between"><span>MwSt 9%</span><span>0,95</span></div>
  <div>--------------------------------</div>
  <div style="text-align:center">04.10.2026 18:42</div><div style="text-align:center">Vielen Dank!</div></div></body></html>`);
  await page.screenshot({ path: dir + "/kassenzettel.jpg", type: "jpeg", quality: 82 });
  await page.close();
}
