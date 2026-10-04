/* ======================================================================
   Meldungen in der App: Ziel erreicht, Zwischenstände (50/75/90 %),
   Wochenrückblick und Kursrutsch-Warnung. Läuft beim Öffnen, bei neuen
   Kursen und nach Änderungen. Zustand liegt in meta/alerts:
   { v, goals: { id: { level, reachedAt, pct, name } }, log: [...], hist: [...],
     crashAt, weeklyFor, lastRun, lastTotal }
   ====================================================================== */
let checkTimer = null;
let checkRunning = false;
function scheduleChecks(ms) {
  clearTimeout(checkTimer);
  checkTimer = setTimeout(runChecks, ms == null ? 1500 : ms);
}

function lastSunday18(now) {
  const d = new Date(now);
  const back = d.getDay(); // 0 = Sonntag
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate() - back, 18, 0, 0, 0);
  if (s.getTime() > now) s.setDate(s.getDate() - 7);
  return s;
}

async function runChecks() {
  if (checkRunning || S.runtime !== "ok" || !allLoaded()) return;
  const d = derive();
  if (d.missing.length || !accountsList().length) return;
  const r = effRates();
  if (!r.BTC && d.byCur.BTC.n) return;
  checkRunning = true;
  try {
    const now = Date.now();
    const pr = notifyPrefs();
    const demo = hasDemo();
    const old = alertsDoc();
    const al = old ? JSON.parse(JSON.stringify(stripId(old))) : { v: 1, goals: {}, log: [], hist: [] };
    al.goals = al.goals || {};
    al.log = Array.isArray(al.log) ? al.log : [];
    al.hist = Array.isArray(al.hist) ? al.hist : [];
    const events = [];
    let changed = !old;

    // Ziele
    const seen = new Set();
    for (const g of goalsList()) {
      if (!(g.target > 0)) continue;
      const p = goalProgress(g);
      if (!p.ok) continue;
      seen.add(g.id);
      const level = MILESTONES.filter((m) => p.pct >= m).pop() || 0;
      const st = al.goals[g.id];
      const pct = round(p.pct, 4);
      if (!st) {
        // Zum ersten Mal gesehen: nur merken, nichts melden
        al.goals[g.id] = { level, reachedAt: level >= 1 ? now : null, pct, name: g.name };
        changed = true;
        continue;
      }
      if (level > (st.level || 0)) {
        if (g.notify !== false && !g.demo) {
          if (level >= 1 && pr.goals) events.push({ type: "goal", text: "🎉 Ziel erreicht: " + g.name + " – " + fmtAmt(p.current, g.currency, { max: 5 }) + " von " + fmtAmt(g.target, g.currency, { max: 5 }) });
          else if (level < 1 && pr.milestones) events.push({ type: "milestone", text: g.name + ": " + Math.round(level * 100) + " % geschafft (" + fmtAmt(p.current, g.currency, { max: 5 }) + " von " + fmtAmt(g.target, g.currency, { max: 5 }) + ")" });
        }
        st.level = level;
        if (level >= 1 && !st.reachedAt) st.reachedAt = now;
        changed = true;
      } else if (level < (st.level || 0) && (st.level || 0) < 1 && p.pct < st.level - 0.05) {
        // Zwischenstand deutlich unterschritten: Stufe zurücksetzen, damit die nächste Überschreitung wieder meldet.
        // Erreichte Ziele bleiben erreicht.
        st.level = level;
        changed = true;
      }
      if (Math.abs((st.pct || 0) - pct) >= 0.005 || st.name !== g.name) { st.pct = pct; st.name = g.name; changed = true; }
    }
    for (const id of Object.keys(al.goals)) if (!seen.has(id) && !S.data.goals.has(id)) { delete al.goals[id]; changed = true; }

    const total = d.total;
    const hist = al.hist.filter((h) => now - (h.at || 0) <= 10 * 86400000);
    // Kursrutsch: gleiche Bestände, Kurse von vor ~24 h gegen jetzt
    if (pr.crash && !demo && r.BTC && r.USDT) {
      const ref = hist.filter((h) => now - h.at >= 20 * 3600000 && now - h.at <= 48 * 3600000 && h.btc && h.usdt).sort((a, b) => b.at - a.at)[0];
      if (ref) {
        let then = 0, nowV = 0;
        for (const a of accountsList()) {
          if (a.includeInTotal === false) continue;
          const b = balanceOf(a.id);
          const R0 = { EUR: 1, USDT: ref.usdt, BTC: ref.btc };
          then += b * R0[a.currency];
          nowV += b * rate(a.currency);
        }
        const chg = then > 0 ? (nowV / then - 1) * 100 : 0;
        if (chg <= -pr.crashPct && now - (al.crashAt || 0) > 24 * 3600000) {
          events.push({ type: "crash", text: "⚠️ Kursrutsch: Dein Vermögen ist seit gestern um " + fmtPct(-chg, { dec: 1 }) + " gefallen – jetzt " + fmtEUR(nowV, { dec: 0 }) + " (vorher " + fmtEUR(then, { dec: 0 }) + ")." });
          al.crashAt = now;
          changed = true;
        }
      }
    }
    // Wochenrückblick: ab Sonntag 18 Uhr beim ersten Öffnen, bis Donnerstag
    const sun = lastSunday18(now);
    const wk = isoDate(sun);
    if (!old) al.weeklyFor = wk;
    if (pr.weekly && !demo && al.weeklyFor !== wk && now - sun.getTime() < 4 * 86400000) {
      const weekAgo = hist.filter((h) => now - h.at >= 5 * 86400000).sort((a, b) => Math.abs(now - a.at - 7 * 86400000) - Math.abs(now - b.at - 7 * 86400000))[0]
        || (() => { const s = snapAround(addDays(isoDate(), -7)); return s && s.date <= addDays(isoDate(), -5) ? { total: s.total } : null; })();
      let part = "";
      if (weekAgo && weekAgo.total) {
        const diff = total - weekAgo.total;
        part = " (" + fmtEUR(diff, { sign: true, dec: 0 }) + ", " + fmtPct((diff / Math.abs(weekAgo.total)) * 100, { sign: true }) + " zur Vorwoche)";
      }
      const gl = goalsList().filter((g) => !g.demo).slice(0, 3).map((g) => g.name + " " + Math.round(Math.min(goalProgress(g).pct, 9.99) * 100) + " %");
      events.push({ type: "weekly", text: "Wochenrückblick: Vermögen " + fmtEUR(total, { dec: 0 }) + part + "." + (gl.length ? " Ziele: " + gl.join(", ") + "." : "") });
      al.weeklyFor = wk;
      changed = true;
    } else if (al.weeklyFor !== wk && now - sun.getTime() >= 4 * 86400000) {
      al.weeklyFor = wk; changed = true;
    }
    // Verlauf für den Kursrutsch-Vergleich: höchstens ein Eintrag pro Stunde
    const lastH = hist[hist.length - 1];
    if (!lastH || now - lastH.at >= 3600000) {
      hist.push({ at: now, total: round(total, 2), btc: r.BTC ? r.BTC.eur : null, usdt: r.USDT ? r.USDT.eur : null });
      changed = true;
    }
    al.hist = hist.slice(-80);
    if (events.length) {
      al.log = al.log.concat(events.map((e) => ({ at: now, type: e.type, text: e.text }))).slice(-30);
    }
    if (!changed && old && now - (old.lastRun || 0) < 15 * 60000) return;
    al.lastRun = now;
    al.lastTotal = round(total, 2);
    al.v = 1;
    await dbWrite("meta", "alerts", "set", al);
    events.forEach((e, i) => setTimeout(() => toast(e.text, { ms: e.type === "goal" ? 8000 : 6500, action: e.type === "goal" || e.type === "milestone" ? "Ziele" : null, onAction: () => { location.hash = "#ziele"; } }), 400 + i * 900));
  } catch (e) {
    console.warn("Meldungen:", e);
  } finally {
    checkRunning = false;
  }
}
