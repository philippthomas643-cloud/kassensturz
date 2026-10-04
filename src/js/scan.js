/* ======================================================================
   Scannen: Screenshots aus Banking-Apps und Kassenzettel per Kamera.
   Texterkennung läuft auf dem Gerät (tesseract.js in docs/ocr/, wird beim
   ersten Scannen geladen und danach offline vorgehalten). Ausgewertet wird
   in scanparse.js; hier: Bild vorbereiten, erkennen, Prüfliste, buchen.
   ====================================================================== */
const OCR = { worker: null, loading: null, onProgress: null };
let SCAN_BANK = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error("Laden fehlgeschlagen"));
    document.head.appendChild(s);
  });
}
async function ocrWorker() {
  if (OCR.worker) return OCR.worker;
  if (!OCR.loading) {
    OCR.loading = (async () => {
      if (!window.Tesseract) await loadScript("ocr/tesseract.min.js");
      const base = new URL("ocr/", location.href).href;
      const w = await window.Tesseract.createWorker("deu", 1, {
        workerPath: base + "worker.min.js",
        corePath: base,
        langPath: base,
        gzip: true,
        workerBlobURL: false,
        logger: (m) => { if (OCR.onProgress) OCR.onProgress(m); },
      });
      OCR.worker = w;
      return w;
    })();
  }
  try { return await OCR.loading; } catch (e) { OCR.loading = null; throw e; }
}

/* ---------- Bild vorbereiten ---------- */
function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Bild konnte nicht gelesen werden")); };
    img.src = url;
  });
}
/** Graustufen, dunkle Bilder umkehren, Kontrast strecken. Original bleibt für Farbproben erhalten. */
function prepareImage(img, mode) {
  let W = img.naturalWidth, H = img.naturalHeight;
  const maxSide = mode === "receipt" ? 2200 : 3000;
  let scale = Math.min(1, maxSide / Math.max(W, H));
  if (mode === "receipt" && Math.max(W, H) * scale < 1400) scale = Math.min(2, 1400 / Math.max(W, H));
  W = Math.round(W * scale); H = Math.round(H * scale);
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const x = c.getContext("2d", { willReadFrequently: true });
  x.drawImage(img, 0, 0, W, H);
  const id = x.getImageData(0, 0, W, H);
  const orig = new Uint8ClampedArray(id.data);
  const d = id.data;
  const hist = new Uint32Array(256);
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) {
    const L = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
    d[i] = L;
    sum += L;
  }
  const dark = sum / (d.length / 4) < 110;
  for (let i = 0; i < d.length; i += 4) { const L = dark ? 255 - d[i] : d[i]; d[i] = L; hist[L | 0]++; }
  const n = d.length / 4;
  let lo = 0, hi = 255, acc = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc > n * 0.02) { lo = v; break; } }
  acc = 0;
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc > n * 0.02) { hi = v; break; } }
  const span = Math.max(1, hi - lo);
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.max(0, Math.min(255, ((d[i] - lo) * 255) / span));
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  x.putImageData(id, 0, 0);
  const colorOf = (b) => {
    if (!b) return null;
    const px = (X, Y) => (Math.min(H - 1, Math.max(0, Y)) * W + Math.min(W - 1, Math.max(0, X))) * 4;
    const bi = px(b.x0 - 6, Math.round((b.y0 + b.y1) / 2));
    const bg = [orig[bi], orig[bi + 1], orig[bi + 2]];
    let r = 0, g = 0, bl = 0, k = 0;
    for (let Y = b.y0; Y < b.y1; Y += 2) for (let X = b.x0; X < b.x1; X += 2) {
      const i = px(X, Y);
      if (Math.abs(orig[i] - bg[0]) + Math.abs(orig[i + 1] - bg[1]) + Math.abs(orig[i + 2] - bg[2]) > 120) { r += orig[i]; g += orig[i + 1]; bl += orig[i + 2]; k++; }
    }
    if (!k) return null;
    r /= k; g /= k; bl /= k;
    return g > r + 35 && g > bl + 5 ? "green" : r > g + 50 && r > bl + 50 ? "red" : "plain";
  };
  return { canvas: c, W, H, colorOf };
}
function thumbOf(img, max) {
  const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement("canvas");
  c.width = Math.round(img.naturalWidth * s);
  c.height = Math.round(img.naturalHeight * s);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.72);
}
async function recognize(canvas) {
  const w = await ocrWorker();
  const { data } = await w.recognize(canvas, {}, { blocks: true, text: true });
  const lines = [];
  for (const b of data.blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) {
    lines.push({ text: l.text, bbox: l.bbox, words: (l.words || []).map((w) => ({ text: w.text, bbox: w.bbox })) });
  }
  return lines;
}

/* ---------- Fortschritt ---------- */
function scanProgress(title) {
  openModal({
    title,
    body: '<div class="scan-prog"><div class="meter"><i id="scan-bar" style="width:4%"></i></div><p class="muted" id="scan-msg" style="margin:0">Bereite vor …</p><p class="faint" style="margin:0;font-size:12.5px">' + icon("lock", "sm") + ' Die Texterkennung läuft auf deinem Gerät – das Bild verlässt es nicht.</p></div>',
  });
  const set = (pct, msg) => {
    const b = $("#scan-bar"), m = $("#scan-msg");
    if (b && pct != null) b.style.width = Math.max(4, Math.min(100, pct)) + "%";
    if (m && msg) m.textContent = msg;
  };
  return set;
}
function ocrProgressHandler(set, base, share, label) {
  return (m) => {
    if (!m) return;
    if (/loading|initializ/i.test(m.status || "")) set(base + share * 0.3 * (m.progress || 0), OCR.worker ? label : "Texterkennung wird geladen (nur beim ersten Mal, ca. 5 MB) …");
    else if (/recogniz/i.test(m.status || "")) set(base + share * (0.3 + 0.7 * (m.progress || 0)), label);
  };
}
function scanError(e) {
  closeModal();
  const offline = navigator.onLine === false;
  toast(offline && !OCR.worker ? "Für die erste Texterkennung brauchst du einmal Internet (ca. 5 MB)." : "Das Bild konnte nicht gelesen werden" + (e && e.message ? " (" + e.message + ")" : "") + ".", { err: true });
  console.warn(e);
}

/* ---------- Screenshots ---------- */
async function scanScreenshots(files) {
  files = Array.from(files || []).filter((f) => /^image\//.test(f.type) || /\.(png|jpe?g|heic|webp)$/i.test(f.name));
  if (!files.length) return;
  const set = scanProgress(files.length > 1 ? files.length + " Screenshots lesen" : "Screenshot lesen");
  const today = isoDate();
  const merged = { bank: null, balances: [], txs: [], scheduled: [], skipped: 0, images: files.length };
  try {
    for (let i = 0; i < files.length; i++) {
      const share = 100 / files.length, base = i * share;
      const label = files.length > 1 ? "Lese Bild " + (i + 1) + " von " + files.length + " …" : "Lese Screenshot …";
      OCR.onProgress = ocrProgressHandler(set, base, share, label);
      set(base + 2, label);
      const { img, url } = await loadImageFile(files[i]);
      const prep = prepareImage(img, "screenshot");
      URL.revokeObjectURL(url);
      const lines = await recognize(prep.canvas);
      const r = SCANPARSE.parseScreenshot(lines, prep.W, prep.H, { today, colorOf: prep.colorOf });
      merged.bank = merged.bank || r.bank;
      merged.balances.push(...r.balances);
      merged.txs.push(...r.txs);
      merged.scheduled.push(...r.scheduled);
      merged.skipped += r.skipped;
    }
  } catch (e) { scanError(e); return; } finally { OCR.onProgress = null; }
  // Doppelte (gleicher Umsatz auf mehreren Bildern) zusammenfassen
  const seen = new Set();
  merged.txs = merged.txs.filter((t) => { const k = scanKey(t); if (seen.has(k)) return false; seen.add(k); return true; });
  const sk = new Set();
  merged.scheduled = merged.scheduled.filter((s) => { const k = s.merchant.toLowerCase() + "|" + s.amount; if (sk.has(k)) return false; sk.add(k); return true; });
  merged.txs.sort((a, b) => (b.date + (b.time || "")).localeCompare(a.date + (a.time || "")));
  closeModal(true);
  openScanReview(merged);
}
function scanKey(t) {
  return t.date + "|" + (t.time || "") + "|" + (t.kind === "income" ? "+" : "-") + Math.round(t.amount * 100) + "|" + String(t.merchant || "").toLowerCase().replace(/[^a-z0-9äöü]/g, "").slice(0, 16);
}
function learnedCategory(merchant, kind) {
  const m = String(merchant || "").toLowerCase().trim();
  if (m) {
    let best = null;
    for (const t of S.data.tx.values()) {
      if (t.kind !== kind || !t.category || String(t.note || "").toLowerCase().trim() !== m) continue;
      if (!best || (t.date || "") > (best.date || "")) best = t;
    }
    if (best) return best.category;
  }
  return SCANPARSE.guessCategory(merchant, kind) || "Sonstiges";
}
/** Schon gebucht? exact = derselbe Umsatz wurde schon mal per Screenshot übernommen; sonst ähnliche Buchungen (siehe dupes.js). */
function scanDup(t, accVal) {
  const key = scanKey(t);
  for (const x of S.data.tx.values()) if (x.importKey === key) return { exact: true, cands: [x] };
  const probe = { kind: t.kind, amount: t.amount, date: t.date, time: t.time, accountId: accVal && !String(accVal).startsWith("new:") ? accVal : "", note: t.merchant, source: "scan" };
  const cands = dupCandidates(probe);
  return cands.length ? { exact: false, cands } : null;
}
function scanDupNote(i, d, checked) {
  const x = d.cands[0];
  if (d.exact) return '<span class="scan-dupx">' + icon("check", "sm") + "Schon übernommen" + (checked ? " – wird trotzdem nochmal gebucht" : "") + "</span>";
  return '<span class="scan-dupq">' + icon("alert", "sm") + "<span>" + (d.exact ? "Schon übernommen" : "Gleicher Betrag schon gebucht") + ": " + txTitle(x) + " · " + fmtDay(x.date) + (x.accountId ? " · " + accName(x.accountId) : "") + "</span></span>" +
    '<span class="seg scan-dupa" role="group" aria-label="Doppelt oder richtig?"><button type="button" data-dupans="dup" data-i="' + i + '" aria-pressed="' + !checked + '">Doppelt</button>' +
    '<button type="button" data-dupans="ok" data-i="' + i + '" aria-pressed="' + checked + '">Richtig</button></span>';
}
function suggestFixed(merged) {
  const out = [];
  const exists = (name) => Array.from(S.data.fixed.values()).some((f) => String(f.name).toLowerCase() === String(name).toLowerCase());
  for (const s of merged.scheduled) {
    if (exists(s.merchant)) continue;
    out.push({ name: s.merchant, amount: s.amount, cur: s.cur || "EUR", anchor: s.date, why: "geplante Zahlung" });
  }
  // Wiederkehrend: gleicher Händler, gleicher Betrag, in mindestens zwei verschiedenen Monaten
  const pool = [];
  for (const t of S.data.tx.values()) if (t.kind === "expense" && t.note) pool.push({ m: String(t.note).toLowerCase(), a: Math.round(Math.abs(t.amount) * 100), d: t.date });
  for (const t of merged.txs) if (t.kind === "expense") pool.push({ m: t.merchant.toLowerCase(), a: Math.round(t.amount * 100), d: t.date, t });
  for (const t of merged.txs) {
    if (t.kind !== "expense" || exists(t.merchant) || out.some((o) => o.name.toLowerCase() === t.merchant.toLowerCase())) continue;
    const same = pool.filter((p) => p.m === t.merchant.toLowerCase() && Math.abs(p.a - Math.round(t.amount * 100)) <= Math.max(50, t.amount * 5));
    const months = new Set(same.map((p) => monthKey(p.d)));
    if (months.size >= 2) {
      const last = same.map((p) => p.d).sort().pop();
      out.push({ name: t.merchant, amount: t.amount, cur: t.cur || "EUR", anchor: addMonthsClamped(last, 1), why: "kommt jeden Monat" });
    }
  }
  return out;
}

function openScanReview(merged) {
  SCAN_BANK = merged.bank;
  const accs = accountsList(false);
  const app = S.data.meta.get("app") || {};
  const bank = merged.bank;
  const remembered = bank && app.scanAccounts ? app.scanAccounts[bank] : null;
  let accDefault = remembered && S.data.accounts.get(remembered) ? remembered : null;
  if (!accDefault && bank) { const a = accs.find((x) => x.name.toLowerCase().includes(bank.toLowerCase())); if (a) accDefault = a.id; }
  const newOpt = bank && !accs.some((x) => x.name.toLowerCase().includes(bank.toLowerCase())) ? "new:" + bank : null;
  if (!accDefault) accDefault = newOpt || (accs.find((x) => x.currency === "EUR") || accs[0] || {}).id || "";
  const balance = merged.balances.slice().sort((a, b) => (b.date + (b.time || "")).localeCompare(a.date + (a.time || "")))[0] || null;
  const fixedSug = suggestFixed(merged);
  const txs = merged.txs;
  if (!txs.length && !balance && !fixedSug.length) {
    openModal({
      title: "Nichts gefunden",
      body: '<p style="margin:0">Auf ' + (merged.images > 1 ? "den Bildern" : "dem Bild") + " habe ich keine Umsätze und keinen Kontostand erkannt" + (merged.skipped ? " (" + merged.skipped + " abgelehnte Zahlung übersprungen)" : "") + '.</p><p class="muted" style="margin:0">Am besten klappt es mit Screenshots der Umsatzliste, der Startseite oder von Mitteilungen deiner Banking-App – möglichst ohne Abschnitt am Rand.</p>',
      foot: '<button class="btn btn-primary" type="button" data-act="close-modal">Okay</button>',
    });
    return;
  }
  const accOpts = (newOpt ? '<option value="' + esc(newOpt) + '"' + (accDefault === newOpt ? " selected" : "") + ">+ Neues Konto „" + esc(bank) + "“</option>" : "") +
    accs.map((a) => '<option value="' + esc(a.id) + '"' + (a.id === accDefault ? " selected" : "") + ">" + esc(a.name) + " · " + a.currency + "</option>").join("");
  const dups = txs.map((t) => scanDup(t, accDefault));
  const rowHtml = (t, i) => {
    const dup = dups[i];
    const neg = t.kind !== "income";
    return '<div class="scan-row' + (dup ? " dup off" + (dup.exact ? "" : " ask") : "") + '" data-i="' + i + '">' +
      '<input type="checkbox" class="scan-ck" id="sc-ck-' + i + '"' + (dup ? "" : " checked") + ' aria-label="Übernehmen">' +
      '<input class="scan-in scan-m" id="sc-m-' + i + '" value="' + esc(t.merchant) + '" maxlength="60" aria-label="Händler">' +
      '<span class="scan-sign ' + (neg ? "" : "pos") + '">' + (neg ? "−" : "+") + "</span>" +
      '<input class="scan-in scan-a ' + (neg ? "" : "pos") + '" id="sc-a-' + i + '" inputmode="decimal" value="' + esc(fmtNum(t.amount, 2, 2)) + '" aria-label="Betrag">' +
      '<input class="scan-in scan-d" type="date" id="sc-d-' + i + '" value="' + esc(t.date) + '" aria-label="Datum">' +
      '<input class="scan-in scan-c" id="sc-c-' + i + '" list="dl-scan-cat" value="' + esc(learnedCategory(t.merchant, t.kind)) + '" aria-label="Kategorie">' +
      '<div class="scan-note" id="sc-n-' + i + '">' + (dup ? scanDupNote(i, dup, false) : t.time ? esc(t.time) + " Uhr" : "") + "</div></div>";
  };
  const body =
    '<p class="muted" style="margin:0;font-size:13.5px">' + (bank ? "<b>" + esc(bank) + "</b> erkannt · " : "") + txs.length + (txs.length === 1 ? " Umsatz" : " Umsätze") +
    (merged.skipped ? " · " + merged.skipped + " abgelehnte übersprungen" : "") + ". Prüf kurz die Beträge – du kannst alles antippen und ändern.</p>" +
    fieldHtml("Konto", '<select class="select" id="sc-acc">' + accOpts + "</select>") +
    (balance ? '<label class="check scan-bal"><input type="checkbox" id="sc-bal" checked> <span><b>Kontostand angleichen: ' + fmtAmt(balance.value, balance.cur) + "</b><br><span class=\"faint\" id=\"sc-bal-hint\" style=\"font-size:12.5px\"></span></span></label>" : "") +
    (txs.length ? '<div class="sec-title">Umsätze</div><div class="scan-list">' + txs.map(rowHtml).join("") + "</div>" : "") +
    (fixedSug.length ? '<div class="sec-title">Als Fixkosten anlegen?</div><div class="checklist">' + fixedSug.map((f, i) => '<label class="check"><input type="checkbox" id="sc-fx-' + i + '" checked> <span><b>' + esc(f.name) + "</b> · " + fmtAmt(f.amount, f.cur) + ' monatlich<br><span class="faint" style="font-size:12.5px">' + esc(f.why) + ", nächste am " + fmtDate(f.anchor, true) + "</span></span></label>").join("") + "</div>" : "") +
    datalist("dl-scan-cat", allCategories());
  openModal({
    title: "Aus Screenshot übernehmen",
    wide: true,
    body,
    foot: '<button class="btn" type="button" data-act="close-modal">Abbrechen</button><button class="btn btn-primary" type="submit" id="sc-save">Übernehmen</button>',
    onMount: (f) => {
      const upd = () => {
        const acc = val(f, "sc-acc");
        // Doppelte fürs gewählte Konto neu prüfen und nachfragen
        txs.forEach((t, i) => {
          const row = f.querySelector('.scan-row[data-i="' + i + '"]');
          if (!row) return;
          const ck = f.querySelector("#sc-ck-" + i);
          if (acc !== dupAcc) {
            const was = !!dups[i];
            dups[i] = scanDup(t, acc);
            if (!!dups[i] !== was) ck.checked = !dups[i];
          }
          row.classList.toggle("dup", !!dups[i]);
          row.classList.toggle("ask", !!dups[i] && !dups[i].exact);
          row.classList.toggle("off", !ck.checked);
          const note = f.querySelector("#sc-n-" + i);
          const html = dups[i] ? scanDupNote(i, dups[i], ck.checked) : t.time ? esc(t.time) + " Uhr" : "";
          if (note.innerHTML !== html) note.innerHTML = html;
        });
        dupAcc = acc;
        const n = $$(".scan-ck", f).filter((c) => c.checked).length;
        const fx = fixedSug.filter((x, i) => { const c = f.querySelector("#sc-fx-" + i); return c && c.checked; }).length;
        const bal = f.querySelector("#sc-bal");
        const any = n || (bal && bal.checked) || fx;
        f.querySelector("#sc-save").textContent = n ? n + (n === 1 ? " Umsatz" : " Umsätze") + " übernehmen" : "Übernehmen";
        f.querySelector("#sc-save").disabled = !any;
        const hint = f.querySelector("#sc-bal-hint");
        if (hint && balance) {
          const plan = scanPlan(f, txs, balance, fixedSug, true);
          hint.textContent = "Stand vom " + fmtDate(balance.date, true) + (balance.time ? ", " + balance.time : "") + (plan.balanceNote ? " · " + plan.balanceNote : "");
        }
      };
      let dupAcc = accDefault;
      f.addEventListener("change", upd);
      f.addEventListener("input", (e) => { if (e.target.classList.contains("scan-a")) upd(); });
      f.addEventListener("click", (e) => {
        const b = e.target.closest("[data-dupans]");
        if (!b) return;
        f.querySelector("#sc-ck-" + b.dataset.i).checked = b.dataset.dupans === "ok";
        upd();
      });
      upd();
    },
    onSubmit: (f) => guarded(f.querySelector("#sc-save"), async () => {
      const plan = scanPlan(f, txs, balance, fixedSug, false);
      if (plan.error) { toast(plan.error, { err: true }); return; }
      await dbBatch(plan.ops);
      closeModal();
      toast(plan.summary || "Übernommen");
    }),
  });
}
/** Baut aus der Prüfliste die Speicher-Schritte (oder nur eine Vorschau für den Kontostand). */
function scanPlan(f, txs, balance, fixedSug, previewOnly) {
  const accVal = val(f, "sc-acc");
  const isNew = accVal.startsWith("new:");
  const bankName = isNew ? accVal.slice(4) : null;
  const accId = isNew ? newId("acc") : accVal;
  const acc = isNew ? null : S.data.accounts.get(accId);
  if (!isNew && !acc) return { error: "Wähl ein Konto." };
  const cur = isNew ? (txs[0] && txs[0].cur) || (balance && balance.cur) || "EUR" : acc.currency;
  const ops = [];
  const newTx = [];
  const okPairs = [];
  let bad = false;
  txs.forEach((t, i) => {
    if (!f.querySelector("#sc-ck-" + i).checked) return;
    const amt = parseNum(val(f, "sc-a-" + i), cur);
    if (!isFinite(amt) || amt <= 0) { bad = true; return; }
    const date = validISO(val(f, "sc-d-" + i)) ? val(f, "sc-d-" + i) : t.date;
    const merchant = val(f, "sc-m-" + i) || t.merchant;
    const e = toEUR(amt, cur);
    const doc = { kind: t.kind, date, accountId: accId, amount: round(amt, cur === "BTC" ? 8 : 6), category: val(f, "sc-c-" + i) || "Sonstiges", note: merchant, eur: e == null ? null : round(e, 2), importKey: scanKey(t), source: "scan", createdAt: Date.now() + i };
    if (t.time) doc.time = t.time;
    const id = newId("tx");
    newTx.push(doc);
    ops.push(["tx", id, "set", doc]);
    // Trotz gleichem Betrag übernommen = „richtig“ → nicht nochmal fragen
    if (!previewOnly) for (const x of dupCandidates(Object.assign({}, doc, { accountId: isNew ? "" : accId }))) okPairs.push(dupPairKey(id, x.id));
  });
  if (bad && !previewOnly) return { error: "Mindestens ein Betrag ist keine gültige Zahl." };
  // Kontostand zum Zeitpunkt des Screenshots angleichen
  let balanceNote = "";
  const balOn = f.querySelector("#sc-bal") && f.querySelector("#sc-bal").checked;
  let adjust = 0, opening = 0;
  if (balance && balOn) {
    const upTo = (t) => t.date < balance.date || (t.date === balance.date && (!t.time || !balance.time || t.time <= balance.time));
    const eff = (t) => (t.kind === "income" ? 1 : -1) * Math.abs(t.amount);
    let sum = 0;
    for (const t of newTx) if (upTo(t)) sum += eff(t);
    if (isNew) {
      opening = round(balance.value - sum, cur === "BTC" ? 8 : 2);
      balanceNote = "Startsaldo wird passend gesetzt";
    } else {
      // Bisheriger Stand bis zu diesem Zeitpunkt (ohne die neuen Umsätze)
      let have = +acc.opening || 0;
      for (const t of S.data.tx.values()) {
        for (const [id, d] of txEffects(t)) if (id === accId && upTo(t)) have += fromMinor(d, cur);
      }
      adjust = round(balance.value - (have + sum), cur === "BTC" ? 8 : 2);
      balanceNote = Math.abs(adjust) < 0.005 ? "passt schon" : "Korrektur " + fmtAmt(adjust, cur, { sign: true });
    }
  }
  if (previewOnly) return { balanceNote };
  if (isNew) {
    const order = Math.max(0, ...accountsList(true).map((x) => x.order || 0)) + 1;
    ops.unshift(["accounts", accId, "set", { name: bankName, currency: cur, kind: /binance|crypto/i.test(bankName) ? "exchange" : "bank", opening, includeInTotal: true, archived: false, order, note: "", createdAt: Date.now() }]);
  } else if (Math.abs(adjust) >= 0.005) {
    ops.push(["tx", newId("tx"), "set", { kind: "adjust", date: balance.date, time: balance.time || undefined, accountId: accId, amount: adjust, note: "Abgleich mit Screenshot", eur: (() => { const e = toEUR(Math.abs(adjust), cur); return e == null ? null : round(e, 2); })(), source: "scan", createdAt: Date.now() }]);
  }
  let nfx = 0;
  fixedSug.forEach((s, i) => {
    const c = f.querySelector("#sc-fx-" + i);
    if (!c || !c.checked) return;
    nfx++;
    ops.push(["fixed", newId("fx"), "set", { kind: "expense", name: s.name, amount: s.amount, currency: s.cur || cur, interval: "monthly", anchor: s.anchor, accountId: accId, category: learnedCategory(s.name, "expense"), active: true, createdAt: Date.now() }]);
  });
  const app = S.data.meta.get("app") || {};
  const metaUpd = okPairs.length ? dupOkOps(okPairs)[0][3] : {};
  if (SCAN_BANK) metaUpd.scanAccounts = Object.assign({}, app.scanAccounts || {}, { [SCAN_BANK]: accId });
  if (Object.keys(metaUpd).length) ops.push(["meta", "app", "update", metaUpd]); // ein Update – zwei im selben Batch würden sich überschreiben
  const parts = [];
  if (newTx.length) parts.push(newTx.length + (newTx.length === 1 ? " Umsatz" : " Umsätze") + " gebucht");
  if (balance && balOn) parts.push(isNew ? "Konto „" + bankName + "“ angelegt" : Math.abs(adjust) >= 0.005 ? "Kontostand angeglichen" : "Kontostand stimmt");
  if (nfx) parts.push(nfx + " Fixkosten angelegt");
  return { ops, summary: parts.join(" · ") };
}
/* ---------- Kassenzettel ---------- */
async function scanReceipt(file) {
  if (!file) return;
  const set = scanProgress("Kassenzettel lesen");
  let r, thumb;
  try {
    OCR.onProgress = ocrProgressHandler(set, 0, 100, "Lese Kassenzettel …");
    set(3, "Lese Kassenzettel …");
    const { img, url } = await loadImageFile(file);
    thumb = thumbOf(img, 640);
    const prep = prepareImage(img, "receipt");
    URL.revokeObjectURL(url);
    const lines = await recognize(prep.canvas);
    r = SCANPARSE.parseReceipt(lines, prep.W, prep.H, { today: isoDate() });
  } catch (e) { scanError(e); return; } finally { OCR.onProgress = null; }
  closeModal(true);
  const app = S.data.meta.get("app") || {};
  const accId = app.lastReceiptAcc && S.data.accounts.get(app.lastReceiptAcc) ? app.lastReceiptAcc : undefined;
  openTxForm({
    prefill: { kind: "expense", amount: r.total != null ? r.total : undefined, note: r.merchant || "", date: r.date || isoDate(), category: r.merchant ? learnedCategory(r.merchant, "expense") : "", accountId: accId },
    receipt: { thumb, found: r },
  });
}
