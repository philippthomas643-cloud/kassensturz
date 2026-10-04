// Baut die fertige App nach docs/ (das ist der Ordner, den GitHub Pages ausliefert).
// Aufruf: node tools/build.mjs        – keine Abhängigkeiten nötig.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const src = (...p) => path.join(root, "src", ...p);
const out = (...p) => path.join(root, "docs", ...p);
const read = (p) => fs.readFileSync(p, "utf8");

const pkg = JSON.parse(read(path.join(root, "package.json")));
const VERSION = pkg.version;
// Stand-Datum = Datum des neuesten Eintrags in src/js/changelog.js (bleibt beim Neubauen gleich)
const DATE = (read(src("js", "changelog.js")).match(/date:\s*"(\d{4}-\d{2}-\d{2})"/) || [])[1] || new Date().toISOString().slice(0, 10);

// Reihenfolge ist wichtig: alles teilt sich einen Gültigkeitsbereich
const JS_ORDER = ["core", "store", "rates", "checks", "demo", "changelog", "dupes", "scanparse", "scan", "views", "charts", "forms", "pwa", "app"];
const jsRaw = "(() => {\n" + JS_ORDER.map((n) => "/* ===== " + n + ".js ===== */\n" + read(src("js", n + ".js"))).join("\n") + "\n})();\n";
const css = read(src("styles.css"));
const body = read(src("body.html"));

// Statische Dateien (werden 1:1 kopiert und vom Service Worker vorgehalten)
const assetFiles = [];
function walk(dir, rel = "") {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const r = rel ? rel + "/" + e.name : e.name;
    if (e.isDirectory()) walk(path.join(dir, e.name), r);
    else assetFiles.push(r);
  }
}
walk(src("assets"));
assetFiles.sort();

// Build-Kennung aus allen Inhalten – ändert sich irgendwas, gibt es ein Update
const h = crypto.createHash("sha256");
h.update(VERSION + jsRaw + css + body + read(src("index.html")) + read(src("sw.js")) + read(src("manifest.webmanifest")));
for (const f of assetFiles) h.update(f).update(fs.readFileSync(src("assets", f)));
if (process.env.KS_SALT) h.update(process.env.KS_SALT);
const BUILD = h.digest("hex").slice(0, 10);

const js = jsRaw.replaceAll("__VERSION__", VERSION).replaceAll("__BUILD__", BUILD).replaceAll("__DATE__", DATE);
try { new Function(js); } catch (e) { console.error("Syntaxfehler im App-Code:", e.message); process.exit(1); }
if (js.includes("</script")) { console.error("Der App-Code enthält </script – das würde die Seite zerbrechen."); process.exit(1); }

const html = read(src("index.html"))
  .replace("/*__CSS__*/", () => css)
  .replace("<!--__BODY__-->", () => body)
  .replace("/*__JS__*/", () => js);

fs.rmSync(out(), { recursive: true, force: true });
fs.mkdirSync(out(), { recursive: true });
fs.writeFileSync(out("index.html"), html);
for (const f of assetFiles) {
  fs.mkdirSync(path.dirname(out(f)), { recursive: true });
  fs.copyFileSync(src("assets", f), out(f));
}
fs.copyFileSync(src("manifest.webmanifest"), out("manifest.webmanifest"));
const precache = ["./", "manifest.webmanifest"].concat(assetFiles.filter((f) => !/LICENSE|\.txt$|icon-1024\.png$|^ocr\//.test(f)));
fs.writeFileSync(out("sw.js"), read(src("sw.js")).replaceAll("__VERSION__", VERSION).replaceAll("__BUILD__", BUILD).replace("__ASSETS__", JSON.stringify(precache)));
fs.writeFileSync(out("version.json"), JSON.stringify({ version: VERSION, build: BUILD, date: DATE }, null, 2) + "\n");
fs.writeFileSync(out(".nojekyll"), "");

const kb = (n) => (n / 1024).toFixed(1) + " KB";
console.log("Kassensturz " + VERSION + " (Build " + BUILD + ") → docs/  ·  index.html " + kb(html.length) + "  ·  " + assetFiles.length + " Dateien");
