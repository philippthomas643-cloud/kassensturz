/* ======================================================================
   Dialoge, Formulare, Aktionen
   ====================================================================== */
let lastFocus = null;
let modalCleanup = null;
function openModal(o) {
  closeModal(true);
  lastFocus = document.activeElement;
  const host = $("#modal-host");
  host.innerHTML = '<div class="modal-root" data-modal-root><form class="modal' + (o.wide ? " wide" : "") + '" role="dialog" aria-modal="true" aria-labelledby="m-title" novalidate autocomplete="off">' +
    '<div class="modal-h"><h2 id="m-title">' + o.title + '</h2><button class="icon-btn" type="button" data-act="close-modal" aria-label="Schließen">' + icon("x") + "</button></div>" +
    '<div class="modal-b">' + o.body + "</div>" + (o.foot ? '<div class="modal-f">' + o.foot + "</div>" : "") + "</form></div>";
  const form = host.querySelector("form");
  const root = host.querySelector("[data-modal-root]");
  form.addEventListener("submit", (e) => { e.preventDefault(); if (o.onSubmit) o.onSubmit(form); });
  root.addEventListener("mousedown", (e) => { if (e.target === root) closeModal(); });
  document.body.style.overflow = "hidden";
  if (o.onMount) o.onMount(form);
  modalCleanup = o.onClose || null;
  const first = form.querySelector("[autofocus]") || (window.innerWidth > 600 ? form.querySelector(".modal-b input:not([type=hidden]):not([type=checkbox]), .modal-b select") : null);
  if (first) setTimeout(() => first.focus(), 30);
  else setTimeout(() => form.querySelector("#m-title") && form.focus && form.focus(), 30);
  return form;
}
function closeModal(silent) {
  const host = $("#modal-host");
  if (!host.firstChild) return;
  host.innerHTML = "";
  document.body.style.overflow = "";
  if (modalCleanup) { const c = modalCleanup; modalCleanup = null; c(); }
  if (!silent && lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
}
function confirmModal(o) {
  openModal({
    title: o.title,
    body: "<p style=\"margin:0\">" + o.text + "</p>" + (o.check ? '<label class="check"><input type="checkbox" id="cf-check"> <span>' + o.check + "</span></label>" : ""),
    foot: '<button class="btn" type="button" data-act="close-modal">Abbrechen</button><button class="btn ' + (o.danger ? "btn-danger-solid" : "btn-primary") + '" type="submit" id="cf-ok"' + (o.check ? " disabled" : "") + ">" + o.ok + "</button>",
    onMount: (f) => {
      const c = f.querySelector("#cf-check");
      if (c) c.addEventListener("change", () => { f.querySelector("#cf-ok").disabled = !c.checked; });
    },
    onSubmit: async (f) => {
      const b = f.querySelector("#cf-ok");
      b.disabled = true;
      try { await o.onOk(); closeModal(); } catch (e) { b.disabled = false; toast(writeErrMsg(e), { err: true }); }
    },
  });
}
function toast(msg, o = {}) {
  const host = $("#toasts");
  const t = document.createElement("div");
  t.className = "toast" + (o.err ? " err" : "");
  t.setAttribute("role", o.err ? "alert" : "status");
  const span = document.createElement("span");
  span.textContent = msg;
  t.appendChild(span);
  if (o.action) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = o.action;
    b.addEventListener("click", () => { t.remove(); o.onAction(); });
    t.appendChild(b);
  }
  host.appendChild(t);
  setTimeout(() => t.remove(), o.ms || (o.action ? 7000 : 3600));
  return t;
}

/* ---------- Bausteine für Formulare ---------- */
function fieldHtml(label, inner, hint, hintId) {
  return '<label class="field"><span class="lbl">' + label + "</span>" + inner + (hint != null ? '<span class="hint" id="' + (hintId || "") + '">' + hint + "</span>" : "") + "</label>";
}
function amountInput(id, value, cur, extra) {
  return '<div class="input-wrap"><input class="input amount" id="' + id + '" name="' + id + '" inputmode="decimal" autocomplete="off" value="' + esc(value) + '" ' + (extra || "") + '><span class="suffix" data-suffix-for="' + id + '">' + (cur === "EUR" ? "€" : cur) + "</span></div>";
}
function segHtml(name, options, value, disabled) {
  return '<div class="seg lg full" role="group" data-seg="' + name + '">' + options.map(([v, l]) => '<button type="button" data-seg-val="' + v + '" aria-pressed="' + (v === value) + '"' + (disabled ? " disabled" : "") + ">" + l + "</button>").join("") + '</div><input type="hidden" name="' + name + '" id="seg-' + name + '" value="' + esc(value) + '">';
}
function bindSegs(form, onChange) {
  for (const seg of $$("[data-seg]", form)) {
    seg.addEventListener("click", (e) => {
      const b = e.target.closest("[data-seg-val]");
      if (!b || b.disabled) return;
      for (const x of $$("[data-seg-val]", seg)) x.setAttribute("aria-pressed", String(x === b));
      form.querySelector("#seg-" + seg.dataset.seg).value = b.dataset.segVal;
      if (onChange) onChange(seg.dataset.seg, b.dataset.segVal);
    });
  }
}
function accountOptions(selected, opts = {}) {
  let h = opts.none ? '<option value="">' + opts.none + "</option>" : "";
  for (const a of accountsList(false).concat(selected && S.data.accounts.get(selected) && S.data.accounts.get(selected).archived ? [S.data.accounts.get(selected)] : [])) {
    h += '<option value="' + esc(a.id) + '"' + (a.id === selected ? " selected" : "") + ">" + esc(a.name) + " · " + a.currency + "</option>";
  }
  return h;
}
function datalist(id, items) {
  return '<datalist id="' + id + '">' + items.map((c) => '<option value="' + esc(c) + '"></option>').join("") + "</datalist>";
}
const val = (f, id) => { const e = f.querySelector("#" + id); return e ? e.value.trim() : ""; };
function setHint(f, id, text, err) {
  const h = f.querySelector("#" + id);
  if (!h) return;
  h.textContent = text || "";
  h.classList.toggle("err", !!err);
}
function amountPreview(raw, cur) {
  const v = parseNum(raw, cur);
  if (!raw) return "";
  if (!isFinite(v)) return "Das ist keine gültige Zahl";
  let s = "= " + fmtAmt(v, cur);
  if (cur !== "EUR") {
    const e = toEUR(v, cur);
    s += e == null ? "" : " · ≈ " + fmtEUR(e);
  }
  if (cur === "BTC") s += " · " + fmtSats(v);
  return s;
}
async function guarded(btn, fn) {
  if (btn) btn.disabled = true;
  try { await fn(); } catch (e) { toast(writeErrMsg(e), { err: true }); console.warn(e); }
  finally { if (btn) btn.disabled = false; }
}

/* ---------- Konto ---------- */
function openAccountForm(id) {
  const a = id ? S.data.accounts.get(id) : null;
  const n = a ? derive().txCount.get(a.id) || 0 : 0;
  const lockCur = a && n > 0;
  const cur = a ? a.currency : "EUR";
  const kinds = Object.entries(ACC_KINDS).map(([k, l]) => '<option value="' + k + '"' + ((a ? a.kind : "bank") === k ? " selected" : "") + ">" + l + "</option>").join("");
  let body =
    fieldHtml("Name", '<input class="input" id="acc-name" maxlength="60" placeholder="z. B. Revolut, Binance, Ledger" value="' + esc(a ? a.name : "") + '" required>') +
    '<div class="field"><span class="lbl">Währung</span>' + segHtml("acc-cur", CURS.map((c) => [c, c === "EUR" ? "Euro" : c]), cur, lockCur) + (lockCur ? '<span class="hint">Die Währung bleibt fest, weil es schon Buchungen gibt.</span>' : "") + "</div>" +
    fieldHtml("Art", '<select class="select" id="acc-kind">' + kinds + "</select>");
  if (!a) body += fieldHtml("Aktueller Kontostand", amountInput("acc-bal", "", cur, 'placeholder="0,00"'), "", "acc-bal-hint");
  else body += '<div class="preview">Aktueller Stand: <b>' + fmtAmt(balanceOf(a.id), a.currency) + '</b> · ändern über <button class="link-btn" type="button" data-act="adjust-balance" data-id="' + esc(a.id) + '">Kontostand aktualisieren</button></div>';
  body += '<label class="check"><input type="checkbox" id="acc-incl"' + (!a || a.includeInTotal !== false ? " checked" : "") + "> <span>Im Gesamtvermögen berücksichtigen<br><span class=\"faint\" style=\"font-size:12.5px\">Abschalten z. B. für ein Firmenkonto, das du separat führst.</span></span></label>";
  if (a) body += '<label class="check"><input type="checkbox" id="acc-arch"' + (a.archived ? " checked" : "") + "> <span>Archiviert<br><span class=\"faint\" style=\"font-size:12.5px\">Ausgeblendet und nicht in der Summe, Buchungen bleiben erhalten.</span></span></label>";
  body += fieldHtml("Notiz <span class=\"faint\">(optional)</span>", '<input class="input" id="acc-note" maxlength="120" value="' + esc(a ? a.note || "" : "") + '">');
  openModal({
    title: a ? "Konto bearbeiten" : "Neues Konto",
    body,
    foot: (a ? '<button class="btn btn-ghost btn-danger spacer" type="button" data-act="delete-account" data-id="' + esc(a.id) + '">' + icon("trash", "sm") + "Löschen</button>" : "") + '<button class="btn" type="button" data-act="close-modal">Abbrechen</button><button class="btn btn-primary" type="submit" id="acc-save">' + (a ? "Speichern" : "Konto anlegen") + "</button>",
    onMount: (f) => {
      const upd = () => {
        const c = val(f, "seg-acc-cur");
        for (const s of $$("[data-suffix-for]", f)) s.textContent = c === "EUR" ? "€" : c;
        if (!a) setHint(f, "acc-bal-hint", amountPreview(val(f, "acc-bal"), c), !isFinite(parseNum(val(f, "acc-bal"), c)) && val(f, "acc-bal"));
      };
      bindSegs(f, upd);
      const bal = f.querySelector("#acc-bal");
      if (bal) bal.addEventListener("input", upd);
    },
    onSubmit: (f) => guarded(f.querySelector("#acc-save"), async () => {
      const name = val(f, "acc-name");
      const c = val(f, "seg-acc-cur");
      if (!name) { f.querySelector("#acc-name").focus(); toast("Gib dem Konto einen Namen.", { err: true }); return; }
      const doc = {
        name, currency: c, kind: val(f, "acc-kind") || "other",
        includeInTotal: f.querySelector("#acc-incl").checked,
        note: val(f, "acc-note"),
        updatedAt: Date.now(),
      };
      if (a) {
        doc.archived = f.querySelector("#acc-arch").checked;
        const merged = Object.assign(stripId(a), doc);
        if (lockCur) merged.currency = a.currency;
        await dbWrite("accounts", a.id, "set", merged);
        closeModal();
        toast("Konto gespeichert");
      } else {
        const raw = val(f, "acc-bal");
        const opening = raw ? parseNum(raw, c) : 0;
        if (!isFinite(opening)) { toast("Der Kontostand ist keine gültige Zahl.", { err: true }); return; }
        const order = Math.max(0, ...accountsList(true).map((x) => x.order || 0)) + 1;
        Object.assign(doc, { opening: round(opening, c === "BTC" ? 8 : 6), archived: false, order, createdAt: Date.now() });
        await dbWrite("accounts", newId("acc"), "set", doc);
        closeModal();
        toast("Konto „" + name + "“ angelegt");
      }
    }),
  });
}
function deleteAccount(id) {
  const a = S.data.accounts.get(id);
  if (!a) return;
  const txs = Array.from(S.data.tx.values()).filter((t) => t.accountId === id || t.toAccountId === id);
  const transfers = txs.filter((t) => t.kind === "transfer").length;
  confirmModal({
    title: "Konto löschen?",
    text: "„" + esc(a.name) + "“ wird gelöscht" + (txs.length ? ", zusammen mit <b>" + txs.length + (txs.length === 1 ? " Buchung" : " Buchungen") + "</b>" : "") + "." +
      (transfers ? " " + transfers + (transfers === 1 ? " Umbuchung betrifft" : " Umbuchungen betreffen") + " auch ein anderes Konto – dessen Kontostand ändert sich dadurch." : "") +
      " Wenn du die Historie behalten willst, archivier das Konto stattdessen.",
    ok: "Endgültig löschen",
    danger: true,
    onOk: async () => {
      const backup = { acc: stripId(a), txs: txs.map((t) => [t.id, stripId(t)]), goals: [], fixed: [] };
      for (const g of S.data.goals.values()) if ((g.accountIds || []).includes(id)) backup.goals.push([g.id, stripId(g)]);
      for (const x of S.data.fixed.values()) if (x.accountId === id) backup.fixed.push([x.id, stripId(x)]);
      await runPool(txs, (t) => dbWrite("tx", t.id, "delete"), 4);
      for (const [gid, g] of backup.goals) await dbWrite("goals", gid, "set", Object.assign({}, g, { accountIds: (g.accountIds || []).filter((x) => x !== id) }));
      for (const [fid, x] of backup.fixed) await dbWrite("fixed", fid, "set", Object.assign({}, x, { accountId: null }));
      await dbWrite("accounts", id, "delete");
      toast("Konto gelöscht", {
        action: "Rückgängig",
        onAction: () => guarded(null, async () => {
          await dbWrite("accounts", id, "set", backup.acc);
          await runPool(backup.txs, ([tid, t]) => dbWrite("tx", tid, "set", t), 4);
          for (const [gid, g] of backup.goals) await dbWrite("goals", gid, "set", g);
          for (const [fid, x] of backup.fixed) await dbWrite("fixed", fid, "set", x);
          toast("Konto wiederhergestellt");
        }),
      });
    },
  });
}

/* ---------- Kontostand aktualisieren ---------- */
function openAdjustForm(id) {
  const a = S.data.accounts.get(id);
  if (!a) return;
  const cur = a.currency;
  const now = balanceOf(id);
  openModal({
    title: "Kontostand aktualisieren",
    body:
      '<div class="preview">' + esc(a.name) + " · bisher <b>" + fmtAmt(now, cur) + "</b>" + (cur !== "EUR" && toEUR(now, cur) != null ? " ≈ " + fmtEUR(toEUR(now, cur)) : "") + "</div>" +
      fieldHtml("Neuer Kontostand", amountInput("adj-val", "", cur, 'placeholder="' + esc(fmtNum(now, 0, cur === "BTC" ? 8 : 2)) + '" autofocus'), "Trag ein, was gerade wirklich auf dem Konto ist. Die Differenz wird als Korrektur gebucht.", "adj-hint") +
      '<div class="grid2">' + fieldHtml("Datum", '<input class="input" type="date" id="adj-date" value="' + isoDate() + '">') + fieldHtml("Notiz <span class=\"faint\">(optional)</span>", '<input class="input" id="adj-note" maxlength="80" placeholder="z. B. Zinsen, Gebühren">') + "</div>",
    foot: '<button class="btn" type="button" data-act="close-modal">Abbrechen</button><button class="btn btn-primary" type="submit" id="adj-save">Kontostand übernehmen</button>',
    onMount: (f) => {
      f.querySelector("#adj-val").addEventListener("input", () => {
        const raw = val(f, "adj-val");
        const v = parseNum(raw, cur);
        if (!raw) return setHint(f, "adj-hint", "Trag ein, was gerade wirklich auf dem Konto ist. Die Differenz wird als Korrektur gebucht.");
        if (!isFinite(v)) return setHint(f, "adj-hint", "Das ist keine gültige Zahl", true);
        const diff = fromMinor(toMinor(v, cur) - toMinor(now, cur), cur);
        const e = toEUR(diff, cur);
        setHint(f, "adj-hint", "Neuer Stand " + fmtAmt(v, cur) + " · Differenz " + fmtAmt(diff, cur, { sign: true }) + (cur !== "EUR" && e != null ? " (≈ " + fmtEUR(e, { sign: true }) + ")" : ""));
      });
    },
    onSubmit: (f) => guarded(f.querySelector("#adj-save"), async () => {
      const v = parseNum(val(f, "adj-val"), cur);
      if (!isFinite(v)) { toast("Gib den neuen Kontostand ein.", { err: true }); return; }
      const diff = fromMinor(toMinor(v, cur) - toMinor(balanceOf(id), cur), cur);
      if (diff === 0) { closeModal(); toast("Der Kontostand stimmt schon – nichts geändert."); return; }
      const date = validISO(val(f, "adj-date")) ? val(f, "adj-date") : isoDate();
      const e = toEUR(Math.abs(diff), cur);
      await dbWrite("tx", newId("tx"), "set", { kind: "adjust", date, accountId: id, amount: diff, note: val(f, "adj-note"), eur: e == null ? null : round(e, 2), createdAt: Date.now() });
      closeModal();
      toast("Kontostand von „" + a.name + "“ aktualisiert");
    }),
  });
}

/* ---------- Konto-Details ---------- */
function openAccountDetail(id) {
  const a = S.data.accounts.get(id);
  if (!a) return;
  const b = balanceOf(id);
  const e = toEUR(b, a.currency);
  const txs = txList().filter((t) => t.accountId === id || t.toAccountId === id).slice(0, 8);
  openModal({
    title: esc(a.name),
    body:
      '<div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-end;flex-wrap:wrap"><div><div class="eyebrow">' + (ACC_KINDS[a.kind] || "Konto") + " · " + a.currency + "</div>" +
      '<div style="font-size:30px;font-weight:680;letter-spacing:-0.02em;margin-top:6px">' + fmtAmt(b, a.currency) + "</div>" +
      '<div class="muted">' + (a.currency !== "EUR" ? (e == null ? "Kurs fehlt" : "≈ " + fmtEUR(e)) : "") + (a.currency === "BTC" ? " · " + fmtSats(b) : "") + "</div></div>" +
      '<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-primary btn-sm" type="button" data-act="adjust-balance" data-id="' + esc(id) + '">' + icon("adjust", "sm") + 'Kontostand aktualisieren</button><button class="btn btn-sm" type="button" data-act="new-tx" data-acc="' + esc(id) + '">' + icon("plus", "sm") + 'Buchung</button><button class="btn btn-sm" type="button" data-act="edit-account" data-id="' + esc(id) + '">' + icon("pencil", "sm") + "Bearbeiten</button></div></div>" +
      '<div class="sec-title">Letzte Buchungen</div>' +
      (txs.length ? '<div class="rows">' + txs.map((t) => txRow(t, true)).join("") + "</div>" : '<p class="muted" style="margin:0">Noch keine Buchungen auf diesem Konto.</p>'),
    wide: true,
  });
}

/* ---------- Buchung ---------- */
function openTxForm(o = {}) {
  const t = o.id ? S.data.tx.get(o.id) : null;
  if (t && t.kind === "adjust") return openAdjustEdit(t);
  const accs = accountsList(false);
  if (!accs.length) {
    toast("Leg zuerst ein Konto an.", { action: "Konto anlegen", onAction: () => openAccountForm() });
    return;
  }
  const pre = o.prefill || {};
  let kind = t ? t.kind : pre.kind || "expense";
  const accId = t ? t.accountId : pre.accountId || o.acc || accs[0].id;
  const toId = t ? t.toAccountId : (accs.find((x) => x.id !== accId) || {}).id || "";
  const accCur = (id) => (S.data.accounts.get(id) || {}).currency || "EUR";
  const cur0 = accCur(accId);
  const amt0 = t ? fmtNum(Math.abs(t.amount), 0, cur0 === "BTC" ? 8 : 6) : pre.amount != null ? fmtNum(pre.amount, 0, cur0 === "BTC" ? 8 : 6) : "";
  const toAmt0 = t && t.kind === "transfer" ? fmtNum(Math.abs(t.toAmount), 0, accCur(toId) === "BTC" ? 8 : 6) : "";
  const fixedId = t ? t.fixedId : pre.fixedId;
  const body =
    segHtml("tx-kind", [["expense", "Ausgabe"], ["income", "Einnahme"], ["transfer", "Umbuchung"]], kind, !!fixedId) +
    fieldHtml("Betrag", amountInput("tx-amt", amt0, cur0, 'placeholder="0,00"' + (o.id ? "" : " autofocus")), "", "tx-amt-hint") +
    '<div class="grid2" id="tx-acc-row">' +
    fieldHtml('<span id="tx-acc-lbl">' + (kind === "transfer" ? "Von Konto" : "Konto") + "</span>", '<select class="select" id="tx-acc">' + accountOptions(accId) + "</select>") +
    '<div id="tx-to-wrap"' + (kind === "transfer" ? "" : " hidden") + ">" + fieldHtml("Auf Konto", '<select class="select" id="tx-to">' + accountOptions(toId) + "</select>") + "</div>" +
    '<div id="tx-cat-wrap"' + (kind === "transfer" ? " hidden" : "") + ">" + fieldHtml("Kategorie", '<input class="input" id="tx-cat" list="dl-cat" maxlength="40" value="' + esc(t ? t.category || "" : pre.category || "") + '" placeholder="z. B. Lebensmittel">') + "</div>" +
    "</div>" +
    '<div id="tx-toamt-wrap" hidden>' + fieldHtml("Betrag angekommen", amountInput("tx-toamt", toAmt0, accCur(toId), 'placeholder="0,00"'), "", "tx-toamt-hint") + "</div>" +
    '<div class="grid2">' + fieldHtml("Datum", '<input class="input" type="date" id="tx-date" value="' + esc(t ? t.date : pre.date || isoDate()) + '">') +
    fieldHtml("Beschreibung <span class=\"faint\">(optional)</span>", '<input class="input" id="tx-note" maxlength="80" value="' + esc(t ? t.note || "" : pre.note || "") + '" placeholder="z. B. Lidl, Tankstelle">') + "</div>" +
    (fixedId ? '<div class="preview">' + icon("repeat", "sm") + " Gehört zu Fixkosten „" + esc((S.data.fixed.get(fixedId) || {}).name || "") + "“" + (pre.due || (t && t.period) ? ", fällig " + fmtDate(pre.due || t.period, true) : "") + "</div>" : "") +
    datalist("dl-cat", allCategories(kind === "income" ? "income" : "expense"));
  openModal({
    title: t ? "Buchung bearbeiten" : fixedId ? (kind === "income" ? "Einnahme buchen" : "Fixkosten buchen") : "Neue Buchung",
    body,
    foot: (t ? '<button class="btn btn-ghost btn-danger spacer" type="button" data-act="delete-tx" data-id="' + esc(t.id) + '">' + icon("trash", "sm") + "Löschen</button>" : "") +
      '<button class="btn" type="button" data-act="close-modal">Abbrechen</button><button class="btn btn-primary" type="submit" id="tx-save">' + (t ? "Speichern" : "Buchen") + "</button>",
    onMount: (f) => {
      let toTouched = !!toAmt0;
      const sync = (changed) => {
        kind = val(f, "seg-tx-kind");
        const acc = val(f, "tx-acc"), to = val(f, "tx-to");
        const c = accCur(acc), c2 = accCur(to);
        f.querySelector("[data-suffix-for=tx-amt]").textContent = c === "EUR" ? "€" : c;
        f.querySelector("[data-suffix-for=tx-toamt]").textContent = c2 === "EUR" ? "€" : c2;
        f.querySelector("#tx-acc-lbl").textContent = kind === "transfer" ? "Von Konto" : "Konto";
        f.querySelector("#tx-to-wrap").hidden = kind !== "transfer";
        f.querySelector("#tx-cat-wrap").hidden = kind === "transfer";
        const crossCur = kind === "transfer" && c !== c2;
        f.querySelector("#tx-toamt-wrap").hidden = !crossCur;
        if (changed === "tx-kind") {
          const dl = f.querySelector("#dl-cat");
          dl.innerHTML = allCategories(kind === "income" ? "income" : "expense").map((x) => '<option value="' + esc(x) + '"></option>').join("");
        }
        const v = parseNum(val(f, "tx-amt"), c);
        if (crossCur && !toTouched && isFinite(v)) {
          const conv = convert(v, c, c2);
          if (conv != null) f.querySelector("#tx-toamt").value = fmtNum(conv, 0, c2 === "BTC" ? 8 : 2).replace(/\./g, "");
        }
        setHint(f, "tx-amt-hint", amountPreview(val(f, "tx-amt"), c), val(f, "tx-amt") && !isFinite(v));
        if (crossCur) {
          const v2 = parseNum(val(f, "tx-toamt"), c2);
          const r = isFinite(v) && isFinite(v2) && v > 0 && v2 > 0 ? v / v2 : null;
          setHint(f, "tx-toamt-hint", r ? "Dein Kurs: 1 " + c2 + " = " + fmtRate(r) + " " + (c === "EUR" ? "€" : c) + (convert(1, c2, c) != null ? " · Marktkurs " + fmtRate(convert(1, c2, c)) + " " + (c === "EUR" ? "€" : c) : "") : "Wird aus dem aktuellen Kurs vorgeschlagen – trag ein, was wirklich angekommen ist.");
        }
      };
      bindSegs(f, (n) => sync(n));
      f.querySelector("#tx-amt").addEventListener("input", () => sync("amt"));
      f.querySelector("#tx-toamt").addEventListener("input", () => { toTouched = true; sync("toamt"); });
      f.querySelector("#tx-acc").addEventListener("change", () => { toTouched = false; sync("acc"); });
      f.querySelector("#tx-to").addEventListener("change", () => { toTouched = false; sync("to"); });
      sync("init");
    },
    onSubmit: (f) => guarded(f.querySelector("#tx-save"), async () => {
      const k = val(f, "seg-tx-kind");
      const acc = val(f, "tx-acc");
      const a = S.data.accounts.get(acc);
      if (!a) { toast("Wähl ein Konto.", { err: true }); return; }
      const amt = parseNum(val(f, "tx-amt"), a.currency);
      if (!isFinite(amt) || amt <= 0) { toast("Gib einen Betrag größer als 0 ein.", { err: true }); f.querySelector("#tx-amt").focus(); return; }
      const date = validISO(val(f, "tx-date")) ? val(f, "tx-date") : isoDate();
      const doc = { kind: k, date, accountId: acc, amount: round(amt, a.currency === "BTC" ? 8 : 6), note: val(f, "tx-note"), updatedAt: Date.now() };
      if (k === "transfer") {
        const to = S.data.accounts.get(val(f, "tx-to"));
        if (!to) { toast("Wähl das Zielkonto.", { err: true }); return; }
        if (to.id === a.id) { toast("Von- und Zielkonto müssen verschieden sein.", { err: true }); return; }
        let toAmt = amt;
        if (to.currency !== a.currency) {
          toAmt = parseNum(val(f, "tx-toamt"), to.currency);
          if (!isFinite(toAmt) || toAmt <= 0) { toast("Gib ein, wie viel auf dem Zielkonto angekommen ist.", { err: true }); return; }
        }
        doc.toAccountId = to.id;
        doc.toAmount = round(toAmt, to.currency === "BTC" ? 8 : 6);
      } else {
        doc.category = val(f, "tx-cat") || (k === "income" ? "Sonstiges" : "Sonstiges");
      }
      const unchanged = t && t.amount === doc.amount && t.accountId === doc.accountId && t.kind === doc.kind && typeof t.eur === "number";
      const e = toEUR(amt, a.currency);
      doc.eur = unchanged ? t.eur : e == null ? null : round(e, 2);
      if (fixedId) { doc.fixedId = fixedId; doc.period = t ? t.period : pre.due; }
      if (t) {
        const full = Object.assign({ createdAt: t.createdAt || Date.now() }, doc);
        if (t.demo) full.demo = true;
        await dbWrite("tx", t.id, "set", full);
        closeModal();
        toast("Buchung gespeichert");
      } else {
        doc.createdAt = Date.now();
        const id = fixedId && pre.due ? fixedTxId(fixedId, pre.due) : newId("tx");
        await dbWrite("tx", id, "set", doc);
        closeModal();
        toast(k === "transfer" ? "Umbuchung gespeichert" : k === "income" ? "Einnahme gebucht" : "Ausgabe gebucht");
      }
    }),
  });
}
function openAdjustEdit(t) {
  const a = S.data.accounts.get(t.accountId);
  const cur = a ? a.currency : "EUR";
  openModal({
    title: "Kontostand-Korrektur",
    body: '<div class="preview">' + (a ? esc(a.name) : "Gelöschtes Konto") + " · Korrektur um <b>" + fmtAmt(t.amount, cur, { sign: true }) + "</b> am " + fmtDate(t.date, true) + "</div>" +
      fieldHtml("Korrekturbetrag (+ oder −)", amountInput("adje-amt", fmtNum(t.amount, 0, cur === "BTC" ? 8 : 6), cur), "Positiv erhöht den Kontostand, negativ verringert ihn.") +
      '<div class="grid2">' + fieldHtml("Datum", '<input class="input" type="date" id="adje-date" value="' + esc(t.date) + '">') + fieldHtml("Notiz", '<input class="input" id="adje-note" maxlength="80" value="' + esc(t.note || "") + '">') + "</div>",
    foot: '<button class="btn btn-ghost btn-danger spacer" type="button" data-act="delete-tx" data-id="' + esc(t.id) + '">' + icon("trash", "sm") + 'Löschen</button><button class="btn" type="button" data-act="close-modal">Abbrechen</button><button class="btn btn-primary" type="submit" id="adje-save">Speichern</button>',
    onSubmit: (f) => guarded(f.querySelector("#adje-save"), async () => {
      const v = parseNum(val(f, "adje-amt"), cur);
      if (!isFinite(v) || v === 0) { toast("Gib einen Korrekturbetrag ein.", { err: true }); return; }
      const e = toEUR(Math.abs(v), cur);
      await dbWrite("tx", t.id, "set", Object.assign(stripId(t), { amount: round(v, cur === "BTC" ? 8 : 6), date: validISO(val(f, "adje-date")) ? val(f, "adje-date") : t.date, note: val(f, "adje-note"), eur: v === t.amount ? t.eur : e == null ? null : round(e, 2), updatedAt: Date.now() }));
      closeModal();
      toast("Korrektur gespeichert");
    }),
  });
}
function deleteTx(id) {
  const t = S.data.tx.get(id);
  if (!t) return;
  const copy = stripId(t);
  guarded(null, async () => {
    await dbWrite("tx", id, "delete");
    closeModal();
    toast("Buchung gelöscht", { action: "Rückgängig", onAction: () => guarded(null, async () => { await dbWrite("tx", id, "set", copy); toast("Buchung wiederhergestellt"); }) });
  });
}

/* ---------- Fixkosten ---------- */
function openFixedForm(id, kindPre) {
  const x = id ? S.data.fixed.get(id) : null;
  const kind = x ? x.kind || "expense" : kindPre || "expense";
  const cur = x ? x.currency || "EUR" : "EUR";
  const ivs = Object.entries(INTERVALS).map(([k, v]) => '<option value="' + k + '"' + ((x ? x.interval : "monthly") === k ? " selected" : "") + ">" + v.label + "</option>").join("");
  const body =
    segHtml("fx-kind", [["expense", "Ausgabe"], ["income", "Einnahme"]], kind) +
    fieldHtml("Name", '<input class="input" id="fx-name" maxlength="60" value="' + esc(x ? x.name : "") + '" placeholder="z. B. Miete, Handyvertrag, Gehalt">') +
    '<div class="grid2">' + fieldHtml("Betrag", amountInput("fx-amt", x ? fmtNum(x.amount, 0, cur === "BTC" ? 8 : 6) : "", cur, 'placeholder="0,00"')) +
    '<div class="field"><span class="lbl">Währung</span>' + segHtml("fx-cur", CURS.map((c) => [c, c]), cur) + "</div></div>" +
    '<div class="grid2">' + fieldHtml("Intervall", '<select class="select" id="fx-int">' + ivs + "</select>") +
    fieldHtml("Nächste Fälligkeit", '<input class="input" type="date" id="fx-anchor" value="' + esc(x ? x.anchor : isoDate()) + '">') + "</div>" +
    '<div class="grid2">' + fieldHtml("Konto <span class=\"faint\">(optional)</span>", '<select class="select" id="fx-acc">' + accountOptions(x ? x.accountId : "", { none: "– kein bestimmtes –" }) + "</select>") +
    fieldHtml("Kategorie", '<input class="input" id="fx-cat" list="dl-fxcat" maxlength="40" value="' + esc(x ? x.category || "" : "") + '" placeholder="z. B. Wohnen">') + "</div>" +
    datalist("dl-fxcat", allCategories(kind === "income" ? "income" : "expense")) +
    (x ? '<label class="check"><input type="checkbox" id="fx-active"' + (x.active !== false ? " checked" : "") + "> <span>Aktiv<br><span class=\"faint\" style=\"font-size:12.5px\">Ausschalten pausiert den Posten, er zählt dann nicht mehr in die Monatssumme.</span></span></label>" : "") +
    '<div class="preview" id="fx-prev">–</div>';
  openModal({
    title: x ? "Fixkosten bearbeiten" : kind === "income" ? "Neue fixe Einnahme" : "Neue Fixkosten",
    body,
    foot: (x ? '<button class="btn btn-ghost btn-danger spacer" type="button" data-act="delete-fixed" data-id="' + esc(x.id) + '">' + icon("trash", "sm") + "Löschen</button>" : "") + '<button class="btn" type="button" data-act="close-modal">Abbrechen</button><button class="btn btn-primary" type="submit" id="fx-save">Speichern</button>',
    onMount: (f) => {
      const upd = (changed) => {
        const c = val(f, "seg-fx-cur");
        f.querySelector("[data-suffix-for=fx-amt]").textContent = c === "EUR" ? "€" : c;
        if (changed === "fx-kind") {
          f.querySelector("#dl-fxcat").innerHTML = allCategories(val(f, "seg-fx-kind") === "income" ? "income" : "expense").map((v) => '<option value="' + esc(v) + '"></option>').join("");
        }
        const v = parseNum(val(f, "fx-amt"), c);
        const iv = INTERVALS[val(f, "fx-int")] || INTERVALS.monthly;
        const p = f.querySelector("#fx-prev");
        if (!isFinite(v)) { p.textContent = "Gib einen Betrag ein, dann siehst du hier den Monats- und Jahreswert."; return; }
        const m = toEUR(v * iv.factor, c);
        p.innerHTML = m == null ? "Kurs für " + c + " fehlt" : "≈ <b>" + fmtEUR(m) + "</b> pro Monat · " + fmtEUR(m * 12, { dec: 0 }) + " pro Jahr" + (validISO(val(f, "fx-anchor")) ? " · nächste Fälligkeit " + fmtDate(val(f, "fx-anchor"), true) : "");
      };
      bindSegs(f, upd);
      f.querySelector("#fx-amt").addEventListener("input", () => upd());
      f.querySelector("#fx-int").addEventListener("change", () => upd());
      f.querySelector("#fx-anchor").addEventListener("change", () => upd());
      f.querySelector("#fx-acc").addEventListener("change", () => {
        const a = S.data.accounts.get(val(f, "fx-acc"));
        if (!a) return;
        const seg = f.querySelector('[data-seg="fx-cur"] [data-seg-val="' + a.currency + '"]');
        if (seg) seg.click();
      });
      upd();
    },
    onSubmit: (f) => guarded(f.querySelector("#fx-save"), async () => {
      const name = val(f, "fx-name");
      const c = val(f, "seg-fx-cur");
      const v = parseNum(val(f, "fx-amt"), c);
      if (!name) { toast("Gib einen Namen ein.", { err: true }); return; }
      if (!isFinite(v) || v <= 0) { toast("Gib einen Betrag größer als 0 ein.", { err: true }); return; }
      const anchor = val(f, "fx-anchor");
      if (!validISO(anchor)) { toast("Wähl die nächste Fälligkeit.", { err: true }); return; }
      const doc = {
        kind: val(f, "seg-fx-kind"), name, amount: round(v, c === "BTC" ? 8 : 6), currency: c, interval: val(f, "fx-int"), anchor,
        accountId: val(f, "fx-acc") || null, category: val(f, "fx-cat") || "Sonstiges",
        active: x ? f.querySelector("#fx-active").checked : true, updatedAt: Date.now(),
      };
      if (x) {
        await dbWrite("fixed", x.id, "set", Object.assign(stripId(x), doc));
        closeModal();
        toast("Gespeichert");
      } else {
        doc.createdAt = Date.now();
        await dbWrite("fixed", newId("fx"), "set", doc);
        closeModal();
        toast("„" + name + "“ angelegt");
      }
    }),
  });
}
function bookFixed(id, due) {
  const x = S.data.fixed.get(id);
  if (!x) return;
  const acc = x.accountId && S.data.accounts.get(x.accountId) ? x.accountId : null;
  let amount = x.amount;
  const a = acc ? S.data.accounts.get(acc) : accountsList().find((q) => q.currency === (x.currency || "EUR")) || accountsList()[0];
  if (a && a.currency !== (x.currency || "EUR")) {
    const c = convert(x.amount, x.currency || "EUR", a.currency);
    if (c != null) amount = round(c, a.currency === "BTC" ? 8 : 2);
  }
  openTxForm({ prefill: { kind: x.kind === "income" ? "income" : "expense", accountId: a ? a.id : undefined, amount, category: x.category, note: x.name, date: due, due, fixedId: x.id } });
}
function deleteFixed(id) {
  const x = S.data.fixed.get(id);
  if (!x) return;
  const copy = stripId(x);
  guarded(null, async () => {
    await dbWrite("fixed", id, "delete");
    closeModal();
    toast("„" + x.name + "“ gelöscht", { action: "Rückgängig", onAction: () => guarded(null, async () => { await dbWrite("fixed", id, "set", copy); toast("Wiederhergestellt"); }) });
  });
}

/* ---------- Budget ---------- */
function openBudgetForm(id) {
  const b = id ? S.data.budgets.get(id) : null;
  const ym = monthKey(isoDate());
  const spent = monthFlows(ym).cats;
  const used = new Set(Array.from(S.data.budgets.values()).filter((x) => !b || x.id !== b.id).map((x) => x.category));
  const sugg = allCategories("expense").filter((c) => !used.has(c));
  openModal({
    title: b ? "Budget bearbeiten" : "Neues Budget",
    body:
      fieldHtml("Kategorie", '<input class="input" id="bg-cat" list="dl-bg" maxlength="40" value="' + esc(b ? b.category : "") + '" placeholder="z. B. Lebensmittel">', "Ausgaben mit genau dieser Kategorie zählen gegen das Limit.", "bg-hint") +
      datalist("dl-bg", sugg) +
      fieldHtml("Limit pro Monat", amountInput("bg-limit", b ? fmtNum(b.limit, 0, 2) : "", "EUR", 'placeholder="0"')),
    foot: (b ? '<button class="btn btn-ghost btn-danger spacer" type="button" data-act="delete-budget" data-id="' + esc(b.id) + '">' + icon("trash", "sm") + "Löschen</button>" : "") + '<button class="btn" type="button" data-act="close-modal">Abbrechen</button><button class="btn btn-primary" type="submit" id="bg-save">Speichern</button>',
    onMount: (f) => {
      const upd = () => {
        const c = val(f, "bg-cat");
        if (!c) return setHint(f, "bg-hint", "Ausgaben mit genau dieser Kategorie zählen gegen das Limit.");
        if (used.has(c)) return setHint(f, "bg-hint", "Für „" + c + "“ gibt es schon ein Budget.", true);
        setHint(f, "bg-hint", "Diesen Monat bisher: " + fmtEUR(spent.get(c) || 0));
      };
      f.querySelector("#bg-cat").addEventListener("input", upd);
      upd();
    },
    onSubmit: (f) => guarded(f.querySelector("#bg-save"), async () => {
      const c = val(f, "bg-cat");
      const l = parseNum(val(f, "bg-limit"), "EUR");
      if (!c) { toast("Wähl eine Kategorie.", { err: true }); return; }
      if (used.has(c)) { toast("Für diese Kategorie gibt es schon ein Budget.", { err: true }); return; }
      if (!isFinite(l) || l <= 0) { toast("Gib ein Limit größer als 0 ein.", { err: true }); return; }
      const doc = { category: c, limit: round(l, 2), updatedAt: Date.now() };
      if (b) await dbWrite("budgets", b.id, "set", Object.assign(stripId(b), doc));
      else await dbWrite("budgets", newId("bg"), "set", Object.assign(doc, { createdAt: Date.now() }));
      closeModal();
      toast("Budget gespeichert");
    }),
  });
}
function deleteSimple(colName, id, label) {
  const x = S.data[colName].get(id);
  if (!x) return;
  const copy = stripId(x);
  guarded(null, async () => {
    await dbWrite(colName, id, "delete");
    closeModal();
    toast(label + " gelöscht", { action: "Rückgängig", onAction: () => guarded(null, async () => { await dbWrite(colName, id, "set", copy); toast("Wiederhergestellt"); }) });
  });
}

/* ---------- Ziel ---------- */
function openGoalForm(id, kindPre) {
  const g = id ? S.data.goals.get(id) : null;
  const kind = g ? (g.kind === "networth" ? "networth" : "savings") : kindPre || "networth";
  const cur = g ? g.currency : "EUR";
  const linked = new Set(g ? g.accountIds || [] : []);
  const accs = accountsList(false);
  const body =
    segHtml("gl-kind", [["networth", "Vermögensziel"], ["savings", "Sparziel"]], kind) +
    '<p class="hint" id="gl-kind-hint" style="margin:-4px 0 0"></p>' +
    fieldHtml("Name", '<input class="input" id="gl-name" maxlength="60" value="' + esc(g ? g.name : "") + '" placeholder="z. B. 50k Vermögen, Notgroschen, 0,25 BTC">') +
    '<div class="grid2">' + fieldHtml("Zielbetrag", amountInput("gl-target", g ? fmtNum(g.target, 0, cur === "BTC" ? 8 : 2) : "", cur, 'placeholder="0"')) +
    '<div class="field"><span class="lbl">Währung</span>' + segHtml("gl-cur", CURS.map((c) => [c, c]), cur) + "</div></div>" +
    '<div id="gl-savings">' +
    '<div class="field"><span class="lbl">Verknüpfte Konten</span>' +
    (accs.length ? '<div class="checklist">' + accs.map((a) => '<label class="check"><input type="checkbox" id="gl-acc-' + esc(a.id) + '" data-goal-acc="' + esc(a.id) + '"' + (linked.has(a.id) ? " checked" : "") + "> <span>" + esc(a.name) + ' <span class="faint">' + fmtAmt(balanceOf(a.id), a.currency) + "</span></span></label>").join("") + "</div>" : '<span class="hint">Noch keine Konten – du kannst den Stand unten auch manuell eintragen.</span>') +
    '<span class="hint">Der Kontostand der Konten zählt komplett zum Ziel.</span></div>' +
    '<div style="margin-top:14px">' + fieldHtml("Zusätzlich gespart <span class=\"faint\">(optional)</span>", amountInput("gl-manual", g && +g.manual ? fmtNum(g.manual, 0, cur === "BTC" ? 8 : 2) : "", cur, 'placeholder="0"')) + "</div>" +
    "</div>" +
    fieldHtml("Zieldatum <span class=\"faint\">(optional)</span>", '<input class="input" type="date" id="gl-date" value="' + esc(g && g.deadline ? g.deadline : "") + '">') +
    '<label class="check"><input type="checkbox" id="gl-notify"' + (!g || g.notify !== false ? " checked" : "") + "> <span>Meldungen zu diesem Ziel<br><span class=\"faint\" style=\"font-size:12.5px\">Bei 50 %, 75 %, 90 % und wenn es erreicht ist.</span></span></label>" +
    '<div class="preview" id="gl-prev">–</div>';
  openModal({
    title: g ? "Ziel bearbeiten" : "Neues Ziel",
    body,
    foot: (g ? '<button class="btn btn-ghost btn-danger spacer" type="button" data-act="delete-goal" data-id="' + esc(g.id) + '">' + icon("trash", "sm") + "Löschen</button>" : "") + '<button class="btn" type="button" data-act="close-modal">Abbrechen</button><button class="btn btn-primary" type="submit" id="gl-save">Speichern</button>',
    onMount: (f) => {
      const upd = () => {
        const k = val(f, "seg-gl-kind");
        const c = val(f, "seg-gl-cur");
        f.querySelector("#gl-savings").hidden = k === "networth";
        f.querySelector("#gl-kind-hint").textContent = k === "networth" ? "Misst dein gesamtes Vermögen über alle Konten, z. B. 50.000 € oder 1 BTC." : "Misst nur die Konten, die du verknüpfst, z. B. Tagesgeld für den Notgroschen.";
        for (const x of $$("[data-suffix-for]", f)) x.textContent = c === "EUR" ? "€" : c;
        const t = parseNum(val(f, "gl-target"), c);
        const ids = $$("[data-goal-acc]", f).filter((x) => x.checked).map((x) => x.dataset.goalAcc);
        const m = parseNum(val(f, "gl-manual"), c);
        const p = goalProgress({ kind: k, accountIds: ids, manual: isFinite(m) ? m : 0, currency: c, target: isFinite(t) ? t : 0, deadline: val(f, "gl-date") });
        const pv = f.querySelector("#gl-prev");
        pv.innerHTML = "Aktueller Stand: <b>" + fmtAmt(p.current, c, { max: 5 }) + "</b>" + (isFinite(t) && t > 0 ? " · " + fmtPct(p.pct * 100, { dec: 0 }) + " von " + fmtAmt(t, c, { max: 5 }) : "") + (p.perMonth != null && isFinite(t) && p.pct < 1 ? " · " + fmtAmt(p.perMonth, c, { max: 5 }) + " pro Monat nötig" : "");
      };
      bindSegs(f, upd);
      for (const i of $$("input", f)) i.addEventListener("input", upd);
      for (const i of $$("input[type=checkbox], input[type=date]", f)) i.addEventListener("change", upd);
      upd();
    },
    onSubmit: (f) => guarded(f.querySelector("#gl-save"), async () => {
      const k = val(f, "seg-gl-kind");
      const name = val(f, "gl-name");
      const c = val(f, "seg-gl-cur");
      const t = parseNum(val(f, "gl-target"), c);
      if (!name) { toast("Gib dem Ziel einen Namen.", { err: true }); return; }
      if (!isFinite(t) || t <= 0) { toast("Gib einen Zielbetrag größer als 0 ein.", { err: true }); return; }
      const m = parseNum(val(f, "gl-manual"), c);
      const doc = {
        kind: k, name, target: round(t, c === "BTC" ? 8 : 2), currency: c,
        accountIds: k === "networth" ? [] : $$("[data-goal-acc]", f).filter((x) => x.checked).map((x) => x.dataset.goalAcc),
        manual: k === "networth" ? 0 : isFinite(m) ? round(m, c === "BTC" ? 8 : 2) : 0,
        deadline: validISO(val(f, "gl-date")) ? val(f, "gl-date") : null,
        notify: f.querySelector("#gl-notify").checked,
        updatedAt: Date.now(),
      };
      if (g) await dbWrite("goals", g.id, "set", Object.assign(stripId(g), doc));
      else await dbWrite("goals", newId("gl"), "set", Object.assign(doc, { createdAt: Date.now() }));
      closeModal();
      toast("Ziel gespeichert");
    }),
  });
}

/* ---------- Kontostand aktualisieren: Konto wählen ---------- */
function openAdjustPicker() {
  const accs = accountsList(false);
  if (!accs.length) { openAccountForm(); return; }
  openModal({
    title: "Welches Konto?",
    body: '<p class="muted" style="margin:0">Wähl das Konto, dessen Stand du aktualisieren willst.</p><div class="rows">' + accs.map((a) => {
      const b = balanceOf(a.id);
      return '<div class="row clickable" role="button" tabindex="0" data-act="adjust-balance" data-id="' + esc(a.id) + '"><div><div class="t">' + esc(a.name) + '</div><div class="sub">' + (ACC_KINDS[a.kind] || "Konto") + " · " + a.currency + '</div></div><div class="amt">' + fmtAmt(b, a.currency) + "</div></div>";
    }).join("") + "</div>",
  });
}

/* ---------- Benachrichtigungs-Schalter ---------- */
async function saveNotifyPref(key, on) {
  const doc = S.data.meta.get("settings");
  const next = Object.assign(doc ? stripId(doc) : {}, {});
  next.notify = Object.assign({}, (doc && doc.notify) || {}, { [key]: on });
  next.updatedAt = Date.now();
  await dbWrite("meta", "settings", "set", next);
  toast(on ? "Meldung eingeschaltet" : "Meldung ausgeschaltet");
}

/* ---------- Als App installieren ---------- */
function appUrl() { return location.origin + location.pathname.replace(/index\.html$/, ""); }
function openInstallGuide() {
  const ios = isIOS();
  const standalone = isStandalone();
  let body = '<div class="ios-head"><img src="icons/icon-192.png" width="64" height="64" alt=""><div><b>Kassensturz als App</b><p class="muted" style="margin:2px 0 0;font-size:14px">Eigenes Icon auf dem Home-Bildschirm, startet ohne Safari-Leiste und läuft auch offline. Updates kommen automatisch.</p></div></div>';
  if (standalone) {
    body += '<div class="banner" style="margin:0"><div class="b-txt">' + icon("check") + "<span><b>Läuft schon als App.</b> Du hast Kassensturz bereits auf deinem Home-Bildschirm.</span></div></div>";
  } else if (ios) {
    body += '<ol class="steps">' +
      "<li><span>Öffne diese Seite in <b>Safari</b> (nicht in einer anderen App).</span></li>" +
      '<li><span>Tippe unten in der Leiste auf <span class="ios-sym">' + icon("share") + "</span> <b>Teilen</b>. (Bei ausgeblendeter Leiste einmal kurz nach oben scrollen.)</span></li>" +
      '<li><span>Scroll in der Liste nach unten und tippe auf <span class="ios-sym">' + icon("addsq") + "</span> <b>Zum Home-Bildschirm</b>.</span></li>" +
      "<li><span>„Als Web-App öffnen“ eingeschaltet lassen und oben rechts auf <b>Hinzufügen</b> tippen. Fertig – Kassensturz liegt jetzt als App auf deinem Home-Bildschirm.</span></li>" +
      "</ol>" +
      '<p class="hint" style="margin:0">Wichtig: Safari und die App speichern getrennt. Leg deine Konten also erst in der App an – oder nimm sie per Backup mit.</p>';
  } else if (S.install.prompt) {
    body += '<p style="margin:0">Dein Browser kann Kassensturz direkt installieren.</p><button class="btn btn-primary btn-lg" type="button" data-act="install-app">' + icon("download") + "Jetzt installieren</button>";
  } else {
    body += '<ol class="steps">' +
      "<li><span><b>iPhone/iPad:</b> In Safari öffnen → Teilen → „Zum Home-Bildschirm“.</span></li>" +
      "<li><span><b>Android:</b> In Chrome öffnen → Menü ⋮ → „App installieren“ bzw. „Zum Startbildschirm hinzufügen“.</span></li>" +
      "<li><span><b>Computer:</b> In Chrome oder Edge öffnen → in der Adressleiste auf das Installieren-Symbol klicken.</span></li>" +
      "</ol>";
  }
  body += '<div class="sec-title">Link zu Kassensturz</div><div class="linkbox" id="app-link">' + esc(appUrl()) + "</div>" +
    '<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-sm" type="button" data-act="copy-link">' + icon("copy", "sm") + "Link kopieren</button>" +
    (navigator.share ? '<button class="btn btn-sm" type="button" data-act="share-link">' + icon("share", "sm") + "Teilen</button>" : "") + "</div>";
  openModal({ title: "Als App installieren", wide: true, body, foot: '<button class="btn btn-primary" type="button" data-act="close-modal">Fertig</button>' });
}
async function installApp() {
  const p = S.install.prompt;
  if (!p) { openInstallGuide(); return; }
  try {
    p.prompt();
    const r = await p.userChoice;
    S.install.prompt = null;
    if (r && r.outcome === "accepted") { closeModal(); toast("Kassensturz wird installiert"); }
    renderMain();
  } catch (e) { openInstallGuide(); }
}
function copyAppLink() {
  const done = () => toast("Link kopiert");
  try {
    navigator.clipboard.writeText(appUrl()).then(done, () => selectLink());
  } catch (e) { selectLink(); }
}
function selectLink() {
  const el = $("#app-link");
  if (!el) return;
  const r = document.createRange();
  r.selectNodeContents(el);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(r);
  toast("Link markiert – jetzt kopieren");
}
function shareAppLink() {
  if (!navigator.share) { copyAppLink(); return; }
  navigator.share({ title: "Kassensturz", text: "Kassensturz – Finanzen in EUR, USDT und BTC", url: appUrl() }).catch(() => {});
}

/* ---------- Einstellungen ---------- */
function liveExplain() {
  const st = S.live.state;
  if (rateMode() === "manual") return "Kassensturz rechnet mit deinen manuellen Kursen. Live-Kurse sind pausiert.";
  if (st === "ok") return "Live-Kurse von " + (S.live.src || "der Börse") + ", zuletzt " + fmtTime(S.live.at) + ". Solange die App offen ist, wird jede Minute aktualisiert.";
  if (st === "loading" || st === "idle") return "Kurse werden abgefragt …";
  if (st === "offline") return "Du bist offline. Kassensturz rechnet mit den zuletzt gespeicherten Kursen und holt neue, sobald du wieder online bist.";
  if (st === "error") return "Gerade liefert keine Börse Kurse (Crypto.com, Binance, CoinGecko und Coinbase versucht). Es gelten die zuletzt gespeicherten Kurse.";
  return "Live-Kurse werden gestartet …";
}
function themePref() { try { return localStorage.getItem("kassensturz-theme") || "system"; } catch (e) { return "system"; } }
function applyTheme(v) {
  try { if (v === "system") localStorage.removeItem("kassensturz-theme"); else localStorage.setItem("kassensturz-theme", v); } catch (e) { /* egal */ }
  if (v === "light" || v === "dark") document.documentElement.dataset.theme = v;
  else delete document.documentElement.dataset.theme;
  updateThemeColor();
  drawNetWorthChart();
}
function updateThemeColor() {
  // Statusleisten-Farbe passend zum gewählten Farbschema
  const forced = document.documentElement.dataset.theme;
  for (const m of $$('meta[name="theme-color"]')) {
    if (!m.dataset.media) m.dataset.media = m.getAttribute("media") || "";
    if (!m.dataset.color) m.dataset.color = m.getAttribute("content") || "";
    if (forced) { m.setAttribute("content", forced === "dark" ? "#07080b" : "#f3f4f6"); m.removeAttribute("media"); }
    else { m.setAttribute("content", m.dataset.color); if (m.dataset.media) m.setAttribute("media", m.dataset.media); }
  }
}
function openSettings() {
  const doc = ratesDoc() || {};
  const man = doc.manual || {};
  const r = effRates();
  const app = S.data.meta.get("app") || {};
  const lastB = app.lastBackupAt ? fmtDate(isoDate(new Date(app.lastBackupAt)), true) : "noch keins";
  const body =
    (!isStandalone() ? '<button class="ios-cta" type="button" data-act="install-guide"><img src="icons/icon-192.png" alt=""><span><b>Als App installieren</b><span>Eigenes Icon auf dem Home-Bildschirm, läuft offline</span></span>' + icon("right", "sm") + "</button>" : "") +
    '<div class="sec-title">Darstellung</div>' +
    segHtml("theme", [["system", "Automatisch"], ["light", "Hell"], ["dark", "Dunkel"]], themePref()) +
    '<div class="sec-title">Kurse</div>' +
    segHtml("rate-mode", [["live", "Live"], ["manual", "Manuell"]], rateMode()) +
    '<p class="muted" style="margin:0;font-size:13.5px" id="live-explain">' + esc(liveExplain()) + "</p>" +
    '<div class="grid2">' +
    fieldHtml("1 BTC in Euro", amountInput("st-btc", man.BTC ? fmtNum(man.BTC, 2, 2) : "", "EUR", 'placeholder="' + esc(r.BTC ? fmtNum(r.BTC.eur, 2, 2) : "z. B. 75.000") + '"'), "") +
    fieldHtml("1 USDT in Euro", amountInput("st-usdt", man.USDT ? fmtNum(man.USDT, 4, 4) : "", "EUR", 'placeholder="' + esc(r.USDT ? fmtNum(r.USDT.eur, 4, 4) : "z. B. 0,88") + '"'), "") +
    "</div>" +
    '<p class="hint" style="margin:-6px 0 0">Manuelle Kurse gelten im Modus „Manuell“ und springen ein, wenn noch nie ein Live-Kurs geladen wurde.' + (man.at ? " Zuletzt gesetzt: " + fmtTime(man.at) + "." : "") + "</p>" +
    '<div class="sec-title">Daten & Backup</div>' +
    '<div class="set-list"><div class="kv"><span>Letztes Backup</span><span class="v">' + esc(lastB) + "</span></div>" +
    '<div class="kv"><span>Speicher</span><span class="v">' + (S.persisted ? "dauerhaft" : "auf diesem Gerät") + "</span></div></div>" +
    '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
    '<button class="btn btn-sm btn-primary" type="button" data-act="export-json">' + icon("share", "sm") + "Backup sichern</button>" +
    '<label class="btn btn-sm" for="st-import">' + icon("upload", "sm") + 'Backup einspielen</label><input type="file" id="st-import" accept="application/json,.json" hidden>' +
    '<button class="btn btn-sm" type="button" data-act="export-csv">' + icon("download", "sm") + "Buchungen als CSV</button>" +
    "</div>" +
    '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
    (hasDemo() ? '<button class="btn btn-sm" type="button" data-act="clear-demo">Beispieldaten löschen</button>' : '<button class="btn btn-sm btn-ghost" type="button" data-act="load-demo">Beispieldaten anzeigen</button>') +
    '<button class="btn btn-sm btn-ghost btn-danger" type="button" data-act="wipe-all">' + icon("trash", "sm") + "Alle Daten löschen</button></div>" +
    '<div class="sec-title">Privatsphäre</div>' +
    '<p class="muted" style="margin:0;font-size:13.5px">' + icon("lock", "sm") + " Deine Konten und Buchungen liegen nur auf diesem Gerät. Es gibt kein Konto und keinen Server. Für die Kurse fragt Kassensturz anonym bei Crypto.com, Binance, CoinGecko oder Coinbase nach – dabei wird nichts über dich übertragen. Löschst du die App vom Home-Bildschirm, sind die Daten weg: Sichere regelmäßig ein Backup.</p>" +
    '<div class="sec-title">Über Kassensturz</div>' +
    '<div class="about"><img src="icons/icon-192.png" alt=""><div><b>Kassensturz ' + esc(APP.version) + '</b><span>Stand ' + (validISO(APP.date) ? fmtDate(APP.date, true) : esc(APP.date)) + " · " + (isStandalone() ? "als App installiert" : "im Browser") + "</span></div></div>" +
    '<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-sm" type="button" data-act="check-update">' + icon("refresh", "sm") + 'Nach Updates suchen</button><button class="btn btn-sm" type="button" data-act="whats-new">' + icon("sparkle", "sm") + "Was ist neu?</button></div>";
  openModal({
    title: "Einstellungen",
    body,
    foot: '<button class="btn" type="button" data-act="close-modal">Schließen</button><button class="btn btn-primary" type="submit" id="st-save">Speichern</button>',
    onMount: (f) => {
      bindSegs(f, (name, v) => {
        if (name === "theme") applyTheme(v);
        if (name === "rate-mode") f.querySelector("#live-explain").textContent = v === "manual" ? "Kassensturz rechnet mit den Kursen, die du unten einträgst. Live-Kurse werden pausiert." : rateMode() === "manual" ? "Nach dem Speichern holt Kassensturz die Kurse wieder live." : liveExplain();
      });
    },
    onSubmit: (f) => guarded(f.querySelector("#st-save"), async () => {
      const mode = val(f, "seg-rate-mode");
      const b = val(f, "st-btc") ? parseNum(val(f, "st-btc"), "EUR") : null;
      const u = val(f, "st-usdt") ? parseNum(val(f, "st-usdt"), "BTC") : null;
      if ((b != null && !(b > 0)) || (u != null && !(u > 0))) { toast("Kurse müssen Zahlen größer als 0 sein.", { err: true }); return; }
      if (mode === "manual" && !b && !man.BTC && !(r.BTC && r.BTC.eur)) { toast("Trag mindestens den BTC-Kurs ein.", { err: true }); return; }
      const next = Object.assign(stripId(doc), { mode });
      const manual = Object.assign({}, man);
      let changed = false;
      if (b != null && b !== man.BTC) { manual.BTC = round(b, 2); changed = true; }
      if (u != null && u !== man.USDT) { manual.USDT = round(u, 6); changed = true; }
      if (changed) manual.at = Date.now();
      next.manual = manual;
      const wasManual = rateMode() === "manual";
      await dbWrite("meta", "rates", "set", next);
      closeModal();
      if (mode === "manual") { S.live.state = "off"; toast("Manuelle Kurse aktiv"); }
      else { if (wasManual) refreshRates(); toast("Gespeichert"); }
    }),
  });
}
function openWhatsNew(sinceVersion) {
  const list = CHANGELOG.filter((c) => !sinceVersion || versionGt(c.v, sinceVersion)).slice(0, sinceVersion ? 5 : 8);
  const body = list.map((c) => '<div><div class="changes-v">Version ' + esc(c.v) + ' <span class="faint" style="font-weight:450">· ' + esc(fmtDate(c.date, true)) + '</span></div><ul class="changes">' + c.items.map((i) => "<li>" + esc(i) + "</li>").join("") + "</ul></div>").join("");
  openModal({ title: sinceVersion ? "Kassensturz wurde aktualisiert" : "Was ist neu?", body: body || '<p class="muted">Keine Einträge.</p>', foot: '<button class="btn btn-primary" type="button" data-act="close-modal">Alles klar</button>' });
}
function versionGt(a, b) {
  const pa = String(a).split(".").map(Number), pb = String(b).split(".").map(Number);
  for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0); }
  return false;
}

/* ---------- Export / Import / Löschen ---------- */
function saveFile(filename, data, mime) {
  // iPhone: Teilen-Menü („In Dateien sichern“, AirDrop …); sonst normaler Download
  const type = mime || "application/octet-stream";
  let file = null;
  try { file = new File([data], filename, { type }); } catch (e) { file = null; }
  if (file && navigator.canShare && navigator.share && (isIOS() || isStandalone()) && navigator.canShare({ files: [file] })) {
    return navigator.share({ files: [file], title: filename }).then(() => true, (e) => {
      if (e && e.name === "AbortError") return false;
      return downloadBlob(filename, data, type);
    });
  }
  return Promise.resolve(downloadBlob(filename, data, type));
}
function downloadBlob(filename, data, type) {
  try {
    const url = URL.createObjectURL(new Blob([data], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    return true;
  } catch (e) {
    toast("Speichern nicht möglich.", { err: true });
    return false;
  }
}
function exportJSON() {
  const out = { app: "Kassensturz", version: 1, appVersion: APP.version, exportedAt: new Date().toISOString() };
  for (const c of COLS) out[c] = Array.from(S.data[c].values());
  saveFile("kassensturz-backup-" + isoDate() + ".json", JSON.stringify(out, null, 2), "application/json").then((ok) => {
    if (!ok) return;
    dbWrite("meta", "app", "update", { lastBackupAt: Date.now() }).catch(() => {});
    toast("Backup gesichert");
  });
}
function exportCSV() {
  const q = (s) => '"' + String(s == null ? "" : s).replace(/"/g, '""') + '"';
  const n = (v, d) => (v == null || !isFinite(v) ? "" : nf(0, d).format(v).replace(/\./g, ""));
  const kinds = { expense: "Ausgabe", income: "Einnahme", transfer: "Umbuchung", adjust: "Korrektur" };
  const lines = [["Datum", "Art", "Konto", "Kategorie", "Beschreibung", "Betrag", "Währung", "Betrag in EUR", "Zielkonto", "Zielbetrag", "Zielwährung"].map(q).join(";")];
  for (const t of txList().slice().reverse()) {
    const a = S.data.accounts.get(t.accountId);
    const b = S.data.accounts.get(t.toAccountId);
    const cur = a ? a.currency : "";
    const signed = t.kind === "adjust" ? t.amount : (t.kind === "income" ? 1 : -1) * Math.abs(t.amount);
    const eur = Math.sign(signed) * Math.abs(txEUR(t));
    lines.push([q(t.date), q(kinds[t.kind] || t.kind), q(a ? a.name : ""), q(t.category || ""), q(t.note || ""), n(signed, 8), q(cur), n(eur, 2), q(b ? b.name : ""), n(t.toAmount, 8), q(b ? b.currency : "")].join(";"));
  }
  saveFile("kassensturz-buchungen-" + isoDate() + ".csv", "﻿" + lines.join("\r\n"), "text/csv").then((ok) => { if (ok) toast("CSV gesichert"); });
}
function importBackup(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let data;
    try { data = JSON.parse(reader.result); } catch (e) { toast("Die Datei ist kein gültiges Kassensturz-Backup.", { err: true }); return; }
    if (!data || data.app !== "Kassensturz") { toast("Die Datei ist kein Kassensturz-Backup.", { err: true }); return; }
    const items = [];
    for (const c of COLS) for (const d of Array.isArray(data[c]) ? data[c] : []) if (d && typeof d.id === "string" && /^[A-Za-z0-9_\-.~:@+]{1,200}$/.test(d.id)) items.push([c, d.id, "set", stripId(d)]);
    confirmModal({
      title: "Backup einspielen?",
      text: "Das Backup vom " + esc(String(data.exportedAt || "").slice(0, 10)) + " enthält <b>" + items.length + " Einträge</b>. Einträge mit gleicher Kennung werden überschrieben, alles andere bleibt.",
      ok: "Einspielen",
      onOk: async () => {
        await dbBatch(items.concat([["meta", "app", "update", { onboarded: true, importedAt: Date.now() }]]));
        toast("Backup eingespielt – " + items.length + " Einträge");
        location.hash = "#uebersicht";
      },
    });
  };
  reader.readAsText(file);
}
function clearDemo() {
  const ops = [];
  const demoAcc = new Set();
  for (const c of COLS) for (const d of S.data[c].values()) if (d.demo) { ops.push([c, d.id, "delete"]); if (c === "accounts") demoAcc.add(d.id); }
  if (!ops.length) return;
  // Eigene Buchungen auf Beispielkonten hätten danach kein Konto mehr – sie gehen mit.
  const orphanTx = Array.from(S.data.tx.values()).filter((t) => !t.demo && (demoAcc.has(t.accountId) || demoAcc.has(t.toAccountId)));
  for (const t of orphanTx) ops.push(["tx", t.id, "delete"]);
  for (const g of S.data.goals.values()) if (!g.demo && (g.accountIds || []).some((id) => demoAcc.has(id))) ops.push(["goals", g.id, "set", Object.assign(stripId(g), { accountIds: (g.accountIds || []).filter((id) => !demoAcc.has(id)) })]);
  for (const x of S.data.fixed.values()) if (!x.demo && demoAcc.has(x.accountId)) ops.push(["fixed", x.id, "set", Object.assign(stripId(x), { accountId: null })]);
  // Seed-Kurse aus den Beispieldaten nicht als echte Kurse stehen lassen
  const rd = ratesDoc();
  confirmModal({
    title: "Beispieldaten löschen?",
    text: "Alle Beispiel-Einträge (Konten, Buchungen, Fixkosten, Budgets, Ziele und Verlauf) werden entfernt." +
      (orphanTx.length ? " Dazu kommen <b>" + orphanTx.length + (orphanTx.length === 1 ? " eigene Buchung" : " eigene Buchungen") + "</b> auf Beispielkonten, weil es diese Konten danach nicht mehr gibt." : "") +
      " Alles andere von dir bleibt.",
    ok: "Beispieldaten löschen",
    onOk: async () => {
      if (rd && ["BTC", "USDT"].every((c) => !rd[c] || rd[c].src === "seed")) ops.push(["meta", "rates", "set", { mode: rd.mode || "live", manual: rd.manual || {} }]);
      ops.push(["meta", "app", "update", { onboarded: true }]);
      ops.push(["meta", "alerts", "delete"]);
      await dbBatch(ops);
      toast("Beispieldaten gelöscht – leg jetzt dein erstes Konto an", { action: "Konto anlegen", onAction: () => openAccountForm() });
      location.hash = "#uebersicht";
    },
  });
}
function wipeAll() {
  const ops = [];
  for (const c of COLS) for (const d of S.data[c].values()) if (!(c === "meta" && (d.id === "rates" || d.id === "app"))) ops.push([c, d.id, "delete"]);
  confirmModal({
    title: "Alle Daten löschen?",
    text: "Das löscht <b>alle " + ops.length + " Einträge</b>: Konten, Buchungen, Fixkosten, Budgets, Ziele und den Verlauf. Das lässt sich nicht rückgängig machen – sicher vorher ein Backup, wenn du unsicher bist.",
    check: "Ja, ich will wirklich alles löschen",
    ok: "Alles löschen",
    danger: true,
    onOk: async () => {
      await dbBatch(ops);
      toast("Alle Daten gelöscht");
      location.hash = "#uebersicht";
    },
  });
}
