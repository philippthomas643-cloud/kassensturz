/* ======================================================================
   Mögliche Doppelbuchungen: gleicher Betrag (Ausgabe bzw. Einnahme), höchstens
   DUP_DAYS Tage auseinander, auf demselben Konto oder mit ähnlicher Beschreibung –
   und nicht als Fixkosten gebucht. Die App fragt nach; „Beide richtig“ wird in
   meta/app.dupOk gemerkt und nicht wieder gefragt.
   ====================================================================== */
const DUP_DAYS = 3;
const cents = (v) => Math.round(Math.abs(+v || 0) * 100);
function isFixedLike(t) {
  if (t.fixedId) return true;
  const n = String(t.note || "").toLowerCase().trim();
  if (!n) return false;
  for (const f of S.data.fixed.values()) {
    if (f.active === false || String(f.name || "").toLowerCase().trim() !== n) continue;
    if (Math.abs(cents(f.amount) - cents(t.amount)) <= Math.max(100, cents(f.amount) * 0.05)) return true;
  }
  return false;
}
function noteWords(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9äöüß ]/g, " ").split(/\s+/).filter((w) => w.length >= 3); }
function similarNote(a, b) {
  const A = noteWords(a), B = noteWords(b);
  return A.length > 0 && B.length > 0 && A.some((w) => B.some((v) => v.includes(w) || w.includes(v)));
}
function dupPairKey(a, b) { return [a, b].sort().join("|"); }
function dupOkSet() { return new Set(((S.data.meta.get("app") || {}).dupOk) || []); }
/** Sind a und b verdächtig ähnlich? (ohne Blick auf „schon bestätigt“) */
function looksDuplicate(a, b) {
  if (a.kind !== b.kind || !(a.kind === "expense" || a.kind === "income")) return false;
  if (!(cents(a.amount) > 0) || cents(a.amount) !== cents(b.amount)) return false;
  if (!a.date || !b.date || Math.abs(daysBetween(a.date, b.date)) > DUP_DAYS) return false;
  if (a.date === b.date && a.time && b.time && a.time !== b.time && a.source === "scan" && b.source === "scan") return false; // Bank listet beide mit eigener Uhrzeit
  if (a.accountId !== b.accountId && !similarNote(a.note, b.note)) return false;
  return !isFixedLike(a) && !isFixedLike(b);
}
/** Bestehende Buchungen, die zu einer (neuen) Buchung t passen könnten. */
function dupCandidates(t) {
  const ok = dupOkSet();
  const out = [];
  for (const x of S.data.tx.values()) {
    if (x.id === t.id || x.demo) continue;
    if (t.id && ok.has(dupPairKey(t.id, x.id))) continue;
    if (looksDuplicate(t, x)) out.push(x);
  }
  return out.sort((a, b) => Math.abs(daysBetween(a.date, t.date)) - Math.abs(daysBetween(b.date, t.date)));
}
/** Alle offenen Verdachtsfälle im Bestand (für Hinweis und Prüfliste). */
let dupMemo = { v: -1, pairs: [], ids: new Set() };
function dupPairs() {
  if (dupMemo.v === DATA_V) return dupMemo.pairs;
  const ok = dupOkSet();
  const groups = new Map();
  for (const t of S.data.tx.values()) {
    if (t.demo || !(t.kind === "expense" || t.kind === "income") || !t.date) continue;
    const k = t.kind + "|" + cents(t.amount);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(t);
  }
  const pairs = [];
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    list.sort((a, b) => a.date.localeCompare(b.date));
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if (daysBetween(a.date, b.date) > DUP_DAYS) break;
        const key = dupPairKey(a.id, b.id);
        if (!ok.has(key) && looksDuplicate(a, b)) pairs.push({ a, b, key });
      }
    }
  }
  pairs.sort((x, y) => (y.b.date || "").localeCompare(x.b.date || ""));
  const ids = new Set();
  for (const p of pairs) { ids.add(p.a.id); ids.add(p.b.id); }
  dupMemo = { v: DATA_V, pairs, ids };
  return pairs;
}
function isDupSuspect(id) { dupPairs(); return dupMemo.ids.has(id); }
function dupOkOps(keys) {
  const app = S.data.meta.get("app") || {};
  const set = new Set(app.dupOk || []);
  for (const k of keys) set.add(k);
  return [["meta", "app", "update", { dupOk: Array.from(set).slice(-500) }]];
}

/* ---------- Prüfen-Dialog ---------- */
function dupTxLine(t, withDel = true) {
  const a = S.data.accounts.get(t.accountId);
  const cur = a ? a.currency : "EUR";
  return '<div class="dup-tx"><div><div class="t">' + txTitle(t) + '</div><div class="sub">' + fmtDay(t.date) + (t.time ? ", " + esc(t.time) : "") + " · " + accName(t.accountId) + (t.category ? " · " + esc(t.category) : "") + (t.source === "scan" ? " · Screenshot" : t.source === "receipt" ? " · Kassenzettel" : "") + "</div></div>" +
    '<div class="amt ' + (t.kind === "income" ? "pos" : "") + '">' + fmtAmt(t.kind === "income" ? Math.abs(t.amount) : -Math.abs(t.amount), cur, { sign: t.kind === "income" }) + "</div>" +
    (withDel ? '<button class="btn btn-sm btn-ghost btn-danger" type="button" data-act="dup-del" data-id="' + esc(t.id) + '">' + icon("trash", "sm") + "Löschen</button>" : "") + "</div>";
}
/** Hinweis im Buchungsformular, bevor ein gleicher Betrag ein zweites Mal gebucht wird. */
function dupAskHtml(cands) {
  return '<div class="dup-ask" id="tx-dup" role="alert"><div class="dup-q">' + icon("alert", "sm") + (cands.length === 1 ? "Gleicher Betrag ist schon gebucht" : "Gleicher Betrag ist schon " + cands.length + "× gebucht") + "</div>" +
    cands.slice(0, 3).map((x) => dupTxLine(x, false)).join("") +
    '<p>Ist das eine <b>Doppelbuchung</b> – oder stimmt es so?</p></div>';
}
function openDupReview() {
  const pairs = dupPairs();
  if (!pairs.length) { closeModal(); toast("Keine möglichen Doppelbuchungen mehr"); return; }
  const body = '<p class="muted" style="margin:0;font-size:14px">Gleicher Betrag, kurz hintereinander und keine Fixkosten. Ist das doppelt gebucht – oder stimmt das so?</p>' +
    pairs.slice(0, 20).map((p) => {
      const d = Math.abs(daysBetween(p.a.date, p.b.date));
      return '<div class="dup-card"><div class="dup-q">' + icon("alert", "sm") + (d === 0 ? "Gleicher Tag" : d === 1 ? "1 Tag auseinander" : d + " Tage auseinander") + "</div>" +
        dupTxLine(p.b) + dupTxLine(p.a) +
        '<button class="btn btn-sm dup-ok" type="button" data-act="dup-ok" data-key="' + esc(p.key) + '">' + icon("check", "sm") + "Beide richtig</button></div>";
    }).join("") + (pairs.length > 20 ? '<p class="faint" style="margin:0">… und ' + (pairs.length - 20) + " weitere</p>" : "");
  openModal({ title: pairs.length === 1 ? "Mögliche Doppelbuchung" : pairs.length + " mögliche Doppelbuchungen", wide: true, body, foot: '<button class="btn btn-primary" type="button" data-act="close-modal">Fertig</button>' });
}
function reopenDupReview() {
  const b = $("#modal-host .modal-b");
  const top = b ? b.scrollTop : 0;
  openDupReview();
  const nb = $("#modal-host .modal-b");
  if (nb && top) nb.scrollTop = top;
}
async function dupDelete(id) {
  const t = S.data.tx.get(id);
  if (!t) return;
  const backup = stripId(t);
  await dbWrite("tx", id, "delete");
  toast("Doppelte Buchung gelöscht", { action: "Rückgängig", onAction: () => dbWrite("tx", id, "set", backup) });
  reopenDupReview();
}
async function dupConfirm(key) {
  await dbBatch(dupOkOps([key]));
  toast("Gemerkt – beide Buchungen bleiben");
  reopenDupReview();
}
