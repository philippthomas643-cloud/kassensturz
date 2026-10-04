/* ======================================================================
   Lokaler Speicher: IndexedDB „kassensturz“, ein Objektspeicher je Sammlung
   (accounts, tx, fixed, budgets, goals, snaps, meta). Jedes Dokument hat ein
   Feld „id“. Alles bleibt auf diesem Gerät – es gibt keinen Server.

   Neue Sammlung oder Index? → IDB_VERSION erhöhen und in onupgradeneeded
   ergänzen. Bestehende Daten nie löschen, nur ergänzen (siehe CLAUDE.md).
   ====================================================================== */
const IDB_NAME = "kassensturz";
const IDB_VERSION = 1;
let IDB = null;
const CHANNEL = typeof BroadcastChannel === "function" ? new BroadcastChannel("kassensturz") : null;

function idbOpen() {
  return new Promise((resolve, reject) => {
    let req;
    try { req = indexedDB.open(IDB_NAME, IDB_VERSION); } catch (e) { reject(e); return; }
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const c of COLS) if (!db.objectStoreNames.contains(c)) db.createObjectStore(c, { keyPath: "id" });
    };
    req.onsuccess = () => {
      const db = req.result;
      // Eine neuere Version der App will die Datenbank umbauen: Platz machen und neu laden.
      db.onversionchange = () => { db.close(); location.reload(); };
      resolve(db);
    };
    req.onerror = () => reject(req.error || new Error("IndexedDB nicht verfügbar"));
    req.onblocked = () => console.warn("IndexedDB: wartet auf andere geöffnete Fenster");
  });
}

function idbRun(stores, mode, fn) {
  return new Promise((resolve, reject) => {
    let t;
    try { t = IDB.transaction(stores, mode); } catch (e) { reject(e); return; }
    let out;
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || Object.assign(new Error("abgebrochen"), { code: "aborted" }));
    try { out = fn(t); } catch (e) { try { t.abort(); } catch (x) { /* schon beendet */ } reject(e); }
  });
}

/** Lädt Sammlungen aus dem Speicher in S.data. */
async function loadCollections(cols) {
  const res = {};
  await idbRun(cols, "readonly", (t) => {
    for (const c of cols) {
      const r = t.objectStore(c).getAll();
      r.onsuccess = () => { res[c] = r.result || []; };
    }
  });
  for (const c of cols) {
    const m = new Map();
    for (const d of res[c] || []) if (d && d.id != null) m.set(String(d.id), d);
    S.data[c] = m;
    S.loaded[c] = true;
  }
}

function plain(o) { return o == null ? {} : JSON.parse(JSON.stringify(o)); }

/**
 * Schreibt mehrere Änderungen in einem Rutsch (alles oder nichts).
 * ops: [[sammlung, id, "set" | "update" | "delete", daten], …]
 */
async function dbBatch(ops) {
  if (!IDB) throw Object.assign(new Error("Speicher nicht bereit"), { code: "not_ready" });
  if (!ops.length) return;
  const cols = Array.from(new Set(ops.map((o) => o[0])));
  const applied = [];
  await idbRun(cols, "readwrite", (t) => {
    for (const [c, id, op, data] of ops) {
      const st = t.objectStore(c);
      const key = String(id);
      if (op === "delete") { st.delete(key); applied.push([c, key, null]); continue; }
      const base = op === "update" ? plain(S.data[c].get(key)) : {};
      const doc = Object.assign(base, plain(data), { id: key });
      st.put(doc);
      applied.push([c, key, doc]);
    }
  });
  // Erst nach dem erfolgreichen Speichern den Arbeitsstand nachziehen
  const touched = new Set();
  for (const [c, id, doc] of applied) {
    if (doc) S.data[c].set(id, doc); else S.data[c].delete(id);
    touched.add(c);
  }
  for (const c of touched) onDataChanged(c);
  if (CHANNEL) { try { CHANNEL.postMessage({ type: "changed", cols: Array.from(touched) }); } catch (e) { /* egal */ } }
  if (S.persisted == null) requestPersistence();
}

function dbWrite(colName, id, op, data) {
  return dbBatch([[colName, id, op, data]]);
}

/** Bittet den Browser, die Daten nicht automatisch zu löschen. */
async function requestPersistence() {
  try {
    if (!navigator.storage || !navigator.storage.persist) { S.persisted = false; return; }
    S.persisted = (await navigator.storage.persisted()) || (await navigator.storage.persist());
  } catch (e) { S.persisted = false; }
}

/** Änderungen aus anderen Fenstern (z. B. zweiter Browser-Tab) übernehmen. */
if (CHANNEL) {
  CHANNEL.onmessage = async (e) => {
    const m = e.data || {};
    if (m.type !== "changed" || !IDB || !Array.isArray(m.cols)) return;
    const cols = m.cols.filter((c) => COLS.includes(c));
    if (!cols.length) return;
    try { await loadCollections(cols); for (const c of cols) onDataChanged(c); } catch (err) { console.warn(err); }
  };
}
