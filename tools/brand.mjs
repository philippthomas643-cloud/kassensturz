// Erzeugt aus brand/kassensturz-icon.svg die Logo-Varianten (Schrift als Pfade) und alle PNG-Größen.
// Aufruf: node tools/brand.mjs   (braucht: npm install  → opentype.js, @fontsource/geist; Playwright global)
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const opentype = require("opentype.js");
const { chromium } = (() => { try { return require("playwright"); } catch { return require("/opt/npm-tools/node_modules/playwright"); } })();

const iconSvg = fs.readFileSync(path.join(root, "brand/kassensturz-icon.svg"), "utf8");
const inner = iconSvg.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "").replace(/<title>.*?<\/title>/, "");
const font = opentype.parse(fs.readFileSync(path.join(root, "node_modules/@fontsource/geist/files/geist-latin-600-normal.woff")).buffer);

function wordPath(text, size, x, y, tracking) {
  // Buchstaben einzeln setzen, damit die Laufweite stimmt
  let cx = x, d = "";
  const glyphs = font.stringToGlyphs(text);
  glyphs.forEach((g, i) => {
    d += g.getPath(cx, y, size).toPathData(2);
    const kern = i < glyphs.length - 1 ? font.getKerningValue(g, glyphs[i + 1]) : 0;
    cx += ((g.advanceWidth + kern) / font.unitsPerEm) * size + tracking * size;
  });
  return { d, width: cx - x - tracking * size };
}
function lockup(textColor, sub) {
  const H = 256, R = 58;
  const w = wordPath("Kassensturz", 132, 312, 176, -0.028);
  const W = Math.ceil(312 + w.width + 8);
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + " " + H + '" width="' + W + '" height="' + H + '"><title>Kassensturz</title>' +
    '<defs><clipPath id="ks-r"><rect width="256" height="256" rx="' + R + '"/></clipPath></defs>' +
    '<g clip-path="url(#ks-r)"><g transform="scale(0.25)">' + inner + "</g></g>" +
    '<path fill="' + textColor + '" d="' + w.d + '"/></svg>';
}
fs.writeFileSync(path.join(root, "brand/kassensturz-logo-dark.svg"), lockup("#f4f6fb"));
fs.writeFileSync(path.join(root, "brand/kassensturz-logo-light.svg"), lockup("#0b0d12"));
// Bildmarke allein (transparent), z. B. für Präsentationen auf dunklem Grund
const mark = iconSvg.replace(/<rect width="1024" height="1024" fill="url\(#ks-(bg|halo|ember)\)"\/>\s*/g, "").replace(/<g stroke="url\(#ks-floor\)"[\s\S]*?<\/g>\s*/, "");
fs.writeFileSync(path.join(root, "brand/kassensturz-mark.svg"), mark);

const b = await chromium.launch();
async function render(svg, file, w, h, bg) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.setContent('<body style="margin:0;background:' + (bg || "transparent") + '"><img style="display:block;width:' + w + "px;height:" + h + 'px" src="data:image/svg+xml;base64,' + Buffer.from(svg).toString("base64") + '"></body>');
  await p.waitForTimeout(150);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await p.screenshot({ path: file, omitBackground: !bg, clip: { x: 0, y: 0, width: w, height: h } });
  await p.close();
}
const out = (f) => path.join(root, f);
// App-Icons (randlos – iOS rundet selbst ab)
for (const [f, s] of [["src/assets/icons/icon-1024.png", 1024], ["src/assets/icons/icon-512.png", 512], ["src/assets/icons/icon-192.png", 192], ["src/assets/icons/apple-touch-icon.png", 180], ["src/assets/icons/favicon-64.png", 64], ["src/assets/icons/favicon-32.png", 32]]) await render(iconSvg, out(f), s, s);
// Logos als PNG (2×)
const sizeOf = (svg) => svg.match(/viewBox="0 0 (\d+) (\d+)"/).slice(1).map(Number);
for (const v of ["dark", "light"]) {
  const svg = fs.readFileSync(out("brand/kassensturz-logo-" + v + ".svg"), "utf8");
  const [w, h] = sizeOf(svg);
  await render(svg, out("brand/png/kassensturz-logo-" + v + ".png"), w * 2, h * 2);
}
await render(iconSvg, out("brand/png/kassensturz-icon-1024.png"), 1024, 1024);
await render(mark, out("brand/png/kassensturz-mark-1024.png"), 1024, 1024);
await b.close();
console.log("Logo-Dateien erzeugt.");
