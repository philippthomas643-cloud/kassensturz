/* ======================================================================
   App-Rahmen: Installation, Offline-Betrieb (Service Worker) und Updates.
   Ein Update ist eine neue sw.js auf dem Server. Das Handy findet sie beim
   nächsten Öffnen; direkt nach dem Start wird ohne Nachfrage aktualisiert,
   sonst erscheint ein Hinweis „Update bereit“.
   ====================================================================== */
const BOOT_AT = Date.now();
let SW_REG = null;
let UPDATE_REQUESTED = false;
let lastUpdateCheck = 0;

function isStandalone() {
  return (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
}
function isIOS() {
  const ua = navigator.userAgent || "";
  return /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}
function installSuggested() { return !(+uiPref("installSnooze", "0") > Date.now()); }

function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  const local = location.hostname === "localhost" || location.hostname === "127.0.0.1";
  if (location.protocol !== "https:" && !local) return;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!UPDATE_REQUESTED) return;
    UPDATE_REQUESTED = false;
    location.reload();
  });
  navigator.serviceWorker.register("sw.js", { scope: "./" }).then((reg) => {
    SW_REG = reg;
    lastUpdateCheck = Date.now();
    if (reg.waiting && navigator.serviceWorker.controller) onUpdateReady(reg.waiting);
    reg.addEventListener("updatefound", () => {
      const nw = reg.installing;
      if (!nw) return;
      nw.addEventListener("statechange", () => {
        if (nw.state === "installed" && navigator.serviceWorker.controller) onUpdateReady(nw);
      });
    });
  }).catch((e) => console.warn("Service Worker:", e));
}
function askWorkerVersion(worker) {
  return new Promise((resolve) => {
    try {
      const ch = new MessageChannel();
      const t = setTimeout(() => resolve(""), 1500);
      ch.port1.onmessage = (e) => { clearTimeout(t); resolve((e.data && e.data.version) || ""); };
      worker.postMessage({ type: "VERSION" }, [ch.port2]);
    } catch (e) { resolve(""); }
  });
}
function onUpdateReady(worker) {
  S.update.worker = worker;
  S.update.waiting = true;
  // Direkt nach dem Start (noch nichts angefasst): sofort aktualisieren
  if (Date.now() - BOOT_AT < 10000 && !$("#modal-host").firstChild) { applyUpdate(); return; }
  askWorkerVersion(worker).then((v) => { S.update.version = v; lastMainHtml = ""; scheduleRender(); });
  lastMainHtml = "";
  scheduleRender();
}
function applyUpdate() {
  const w = S.update.worker || (SW_REG && SW_REG.waiting);
  try { localStorage.setItem("kassensturz-updated-from", APP.version); } catch (e) { /* egal */ }
  if (!w) { location.reload(); return; }
  UPDATE_REQUESTED = true;
  w.postMessage({ type: "SKIP_WAITING" });
  setTimeout(() => location.reload(), 4000); // falls der Wechsel nicht gemeldet wird
}
async function checkForUpdate(manual) {
  if (!SW_REG) {
    if (manual) toast(location.protocol === "https:" ? "Update-Prüfung startet gerade – versuch es gleich nochmal." : "Updates gibt es in der installierten App.");
    return;
  }
  lastUpdateCheck = Date.now();
  try { await SW_REG.update(); } catch (e) { if (manual) toast("Keine Verbindung – versuch es später nochmal.", { err: true }); return; }
  if (!manual) return;
  if (S.update.waiting) { applyUpdate(); return; }
  if (SW_REG.installing) { toast("Update wird geladen …"); return; }
  toast("Du hast die neueste Version (" + APP.version + ")");
}
function afterUpdateNotice() {
  let from = null;
  try { from = localStorage.getItem("kassensturz-updated-from"); localStorage.removeItem("kassensturz-updated-from"); } catch (e) { from = null; }
  if (!from) return;
  if (from !== APP.version && typeof CHANGELOG !== "undefined" && CHANGELOG.some((c) => versionGt(c.v, from))) setTimeout(() => openWhatsNew(from), 600);
  else setTimeout(() => toast("Kassensturz ist auf dem neuesten Stand (" + APP.version + ")"), 600);
}

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  S.install.prompt = e;
  scheduleRender();
});
window.addEventListener("appinstalled", () => {
  S.install.prompt = null;
  toast("Kassensturz ist installiert");
  scheduleRender();
});
