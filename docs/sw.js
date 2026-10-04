/* Kassensturz – Service Worker: macht die App offline-fähig und liefert Updates aus.
   Wird beim Bauen mit Version, Build-Kennung und Dateiliste befüllt (tools/build.mjs). */
const VERSION = "1.2.0";
const BUILD = "76cb0e82e7";
const CACHE = "kassensturz-" + BUILD;
const ASSETS = ["./","manifest.webmanifest","fonts/geist-latin-ext-wght-normal.woff2","fonts/geist-latin-wght-normal.woff2","fonts/geist-mono-latin-wght-normal.woff2","icons/apple-touch-icon.png","icons/favicon-32.png","icons/favicon-64.png","icons/icon-192.png","icons/icon-512.png"];
const OCR_CACHE = "ks-ocr-tesseract7";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS.map((u) => new Request(u, { cache: "reload" })))));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => (k.startsWith("kassensturz-") && k !== CACHE) || (k.startsWith("ks-ocr-") && k !== OCR_CACHE)).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  const d = event.data || {};
  if (d.type === "SKIP_WAITING") self.skipWaiting();
  if (d.type === "VERSION" && event.ports && event.ports[0]) event.ports[0].postMessage({ version: VERSION, build: BUILD });
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Kurs-Abfragen gehen direkt ins Netz
  // Texterkennung (groß): erst bei Bedarf laden, dann dauerhaft offline vorhalten – unabhängig von App-Updates
  if (url.pathname.includes("/ocr/")) {
    event.respondWith((async () => {
      const cache = await caches.open(OCR_CACHE);
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    })());
    return;
  }
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      return (await cache.match("./")) || (await cache.match("index.html")) || fetch(req);
    })());
    return;
  }
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    return hit || fetch(req);
  })());
});
