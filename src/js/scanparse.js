/* ======================================================================
   Auswertung erkannter Texte (OCR) – ohne Abhängigkeiten, auch in Node testbar.
   Eingabe: Zeilen von Tesseract { text, bbox:{x0,y0,x1,y1}, words:[{text,bbox}] }
   - parseScreenshot: Banking-App-Screenshots (Umsatzliste, Startseite, Mitteilungen)
   - parseReceipt:    Kassenzettel (Geschäft, Datum, Summe)
   ====================================================================== */
const SCANPARSE = (() => {
  const MONTH = { jan: 1, januar: 1, january: 1, feb: 2, februar: 2, february: 2, mär: 3, mar: 3, märz: 3, maerz: 3, march: 3, apr: 4, april: 4, mai: 5, may: 5, jun: 6, juni: 6, june: 6, jul: 7, juli: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, okt: 10, oct: 10, oktober: 10, october: 10, nov: 11, november: 11, dez: 12, dec: 12, dezember: 12, december: 12 };
  const WDAY = { so: 0, sun: 0, sonntag: 0, sunday: 0, mo: 1, mon: 1, montag: 1, monday: 1, di: 2, tue: 2, dienstag: 2, tuesday: 2, mi: 3, wed: 3, mittwoch: 3, wednesday: 3, do: 4, thu: 4, donnerstag: 4, thursday: 4, fr: 5, fri: 5, freitag: 5, friday: 5, sa: 6, sat: 6, samstag: 6, saturday: 6 };
  const DECLINED = /unzureichend|abgelehnt|fehlgeschlagen|storniert|rückgängig|zurückgebucht|declined|insufficient|failed|reverted|cancell?ed|reversed/i;
  const SCHEDULED = /anstehend|geplant|fällig|scheduled|upcoming|due (today|tomorrow)/i;
  const pad = (n) => String(n).padStart(2, "0");
  const iso = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const dayOnly = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const addD = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

  function resolveDate(today, day, month, year) {
    if (!(day >= 1 && day <= 31 && month >= 1 && month <= 12)) return null;
    let y = year ? (year < 100 ? 2000 + year : year) : today.getFullYear();
    let d = new Date(y, month - 1, day);
    if (d.getMonth() !== month - 1) return null;
    if (!year && d > today) d = new Date(y - 1, month - 1, day);
    return d;
  }
  /** Sucht Datum und Uhrzeit in einem Text. */
  function findDate(s, today) {
    const t = String(s);
    let date = null, m;
    if (/\b(heute|today|jetzt|now)\b/i.test(t)) date = today;
    else if (/\b(vorgestern)\b/i.test(t)) date = addD(today, -2);
    else if (/\b(gestern|yesterday)\b/i.test(t)) date = addD(today, -1);
    if (!date && (m = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/))) date = resolveDate(today, +m[3], +m[2], +m[1]);
    if (!date && (m = t.match(/\b(\d{1,2})[./](\d{1,2})[./](\d{2,4})\b/))) date = resolveDate(today, +m[1], +m[2], +m[3]);
    if (!date && (m = t.match(/\b(\d{1,2})\.?\s+([A-Za-zÄÖÜäöü]{3,10})\.?(?:,?\s+(\d{4}))?/))) {
      const mo = MONTH[m[2].toLowerCase()];
      if (mo) date = resolveDate(today, +m[1], mo, m[3] ? +m[3] : 0);
    }
    if (!date && (m = t.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:,?\s+(\d{4}))?\b/))) {
      const mo = MONTH[m[1].toLowerCase()];
      if (mo) date = resolveDate(today, +m[2], mo, m[3] ? +m[3] : 0);
    }
    const tm = t.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
    if (!date && tm && (m = t.match(/\b(mo|di|mi|do|fr|sa|so|mon|tue|wed|thu|fri|sat|sun|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\b\.?/i))) {
      const wd = WDAY[m[1].toLowerCase()];
      let d = today;
      for (let i = 0; i < 7 && d.getDay() !== wd; i++) d = addD(d, -1);
      date = d;
    }
    return { date: date ? iso(date) : null, time: tm ? pad(+tm[1]) + ":" + tm[2] : null };
  }

  /** Beträge mit Währungszeichen: -106,18 € · +99 € · €19.99 · 1.234,56 EUR */
  const MONEY_RE = /([+\-−–]\s?)?(€\s?)?(\d{1,3}(?:[.,]\d{3})+|\d+)([.,]\d{1,2})?(\s?(?:€|EUR|USDT|BTC))?/g;
  function findMoney(s) {
    // „1.204 56 €“ (Komma nicht erkannt) → 1.204,56 €
    s = String(s).replace(/(\d)\s(\d{2})\s?(€|EUR)/g, (m, a, b, c, i, all) => (/[.,]\d{1,2}$/.test(all.slice(Math.max(0, i - 4), i + 1)) ? m : a + "," + b + " " + c));
    const out = [];
    let m;
    MONEY_RE.lastIndex = 0;
    while ((m = MONEY_RE.exec(s))) {
      if (!m[2] && !m[5]) continue; // ohne Währung ist es keine Geldangabe (Uhrzeit, Anzahl …)
      const before = s[m.index - 1];
      if (before && /[\d:]/.test(before)) continue;
      const intPart = m[3].replace(/[.,]/g, "");
      const value = parseFloat(intPart + (m[4] ? "." + m[4].slice(1) : ""));
      if (!isFinite(value)) continue;
      const sign = m[1] ? (m[1].trim() === "+" ? "+" : "-") : "";
      const cur = /USDT/.test(m[5] || "") ? "USDT" : /BTC/.test(m[5] || "") ? "BTC" : "EUR";
      out.push({ value, sign, cur, index: m.index, end: m.index + m[0].length, text: m[0].trim() });
    }
    return out;
  }
  function parseAmountText(s) {
    const f = findMoney(String(s).includes("€") || /EUR|USDT|BTC/.test(s) ? s : s + " €");
    return f.length ? f[0] : null;
  }

  function median(a) { if (!a.length) return 0; const b = a.slice().sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; }
  function prepLines(raw, W) {
    const lines = [];
    for (const l of raw) {
      let words = (l.words || []).map((w) => ({ t: String(w.text != null ? w.text : w.t || "").trim(), b: w.bbox || w.b })).filter((w) => w.t);
      if (!words.length) continue;
      // Symbole/Logos links (Avatare, App-Icons) wegwerfen
      while (words.length > 1) {
        const w = words[0];
        const inIcon = w.b.x1 < 0.205 * W && w.b.x0 > 0.07 * W;
        const junk = !/[A-Za-zÄÖÜäöü0-9]{2,}/.test(w.t) || /^[^\w€+\-−]+$/.test(w.t);
        if (inIcon || (junk && w.b.x1 < 0.22 * W)) words.shift(); else break;
      }
      const text = words.map((w) => w.t).join(" ").replace(/\s+/g, " ").trim();
      if (!text) continue;
      const b = l.bbox || l.b;
      lines.push({ text, words, x0: words[0].b.x0, x1: words[words.length - 1].b.x1, y0: b.y0, y1: b.y1, h: b.y1 - b.y0 });
    }
    lines.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
    return lines;
  }
  function detectBank(text) {
    const t = text.toLowerCase();
    if (/revolut/.test(t)) return "Revolut";
    if (/bank of cyprus|bankofcyprus|1bank/.test(t)) return "Bank of Cyprus";
    if (/binance/.test(t)) return "Binance";
    if (/\bn26\b/.test(t)) return "N26";
    if (/\bwise\b/.test(t)) return "Wise";
    if (/paypal/.test(t)) return "PayPal";
    if (/trade republic/.test(t)) return "Trade Republic";
    if (/hellenic bank/.test(t)) return "Hellenic Bank";
    if (/unzureichendes guthaben|anstehende zahlung|einzahlen bewegen|kontostand: |zahlungserinnerung/.test(t)) return "Revolut";
    return null;
  }
  function cleanMerchant(s) {
    let m = String(s).replace(/[|\\_“”"»«]/g, " ").replace(/\s+/g, " ").trim();
    m = m.replace(/^[^A-Za-zÄÖÜäöü0-9]+/, "").replace(/[^A-Za-zÄÖÜäöü0-9).&'!]+$/, "");
    m = m.replace(/\s+[A-Za-z|]$/, "").replace(/\s+[^\sA-Za-zÄÖÜäöü0-9]+$/, ""); // einzelne Störzeichen am Ende
    // GROSSBUCHSTABEN → Normal
    if (m.length > 3 && m === m.toUpperCase() && /[A-Z]{3}/.test(m)) m = m.toLowerCase().replace(/(^|[\s\-&./])([a-zäöü])/g, (x, a, b) => a + b.toUpperCase());
    return m.slice(0, 60);
  }

  /* ---------- Screenshots aus Banking-Apps ---------- */
  function parseScreenshot(raw, W, H, opt) {
    const today = dayOnly(opt && opt.today ? new Date(opt.today) : new Date());
    const colorOf = (opt && opt.colorOf) || (() => null);
    const lines = prepLines(raw, W);
    const medH = median(lines.map((l) => l.h)) || 40;
    const wordH = (w) => w.b.y1 - w.b.y0;
    const medWordH = median([].concat(...lines.map((l) => l.words.filter((w) => /[A-Za-zÄÖÜäöü]{3,}/.test(w.t)).map(wordH)))) || medH;
    const statusBar = 0.065 * H;
    const all = lines.map((l) => l.text).join("\n");
    const out = { bank: detectBank(all), balances: [], txs: [], scheduled: [], skipped: 0 };
    const used = new Set();

    // 1) Mitteilungen: Kopfzeile mit Zeitstempel rechts, darunter der Text
    const TS = /((?:(?:gestern|heute|yesterday|today|mo|di|mi|do|fr|sa|so|mon|tue|wed|thu|fri|sat|sun)\.?,?\s*)?\d{1,2}:\d{2}|jetzt|now|vor\s+\d+\s*(?:min|std)\.?)\s*$/i;
    const heads = [];
    lines.forEach((l, i) => { const m = l.text.match(TS); if (m && l.x1 > 0.7 * W && l.text.length - m[0].length >= 2) heads.push({ i, title: l.text.slice(0, m.index).trim(), stamp: m[1] }); });
    for (let h = 0; h < heads.length; h++) {
      const hd = heads[h];
      const end = h + 1 < heads.length ? heads[h + 1].i : lines.length;
      const bodyLines = [];
      for (let j = hd.i + 1; j < end && j <= hd.i + 4; j++) bodyLines.push(lines[j]);
      const body = bodyLines.map((l) => l.text).join(" ");
      const when = findDate(hd.stamp, today);
      const date = when.date || iso(today);
      let m, hit = false;
      if ((m = body.match(/(?:du hast|you spent|you've spent)\s+(€?\s?[\d.,]+\s?€?)\s*(?:bei\s+([^.]+?)\s+)?(?:ausgegeben)?/i))) {
        const a = parseAmountText(m[1]);
        if (a) { out.txs.push({ date, time: when.time, merchant: cleanMerchant(m[2] || hd.title), amount: a.value, cur: a.cur, kind: "expense", src: "Mitteilung" }); hit = true; }
      }
      if ((m = body.match(/(?:du hast|you(?:'ve)? received)\s+(€?\s?[\d.,]+\s?€?)\s+(?:von|from)\s+(.+?)\s*(?:erhalten|bekommen|$)/i))) {
        const a = parseAmountText(m[1]);
        if (a) { out.txs.push({ date, time: when.time, merchant: cleanMerchant(m[2] || hd.title), amount: a.value, cur: a.cur, kind: "income", src: "Mitteilung" }); hit = true; }
      }
      if ((m = body.match(/(?:([A-Z]{3})\s+)?(?:kontostand|balance)\s*:?\s*(€?\s?[\d.,]+\s?(?:€|EUR|USDT)?)/i))) {
        const a = parseAmountText(m[2]);
        if (a) { out.balances.push({ value: a.value, cur: m[1] && /USD/.test(m[1]) ? "USDT" : a.cur, date, time: when.time, src: "Mitteilung" }); hit = true; }
      }
      if ((m = body.match(/zahlung von\s+(€?\s?[\d.,]+\s?€?)\s+an\s+(.+?)\s+ist\s+für\s+(heute|morgen|übermorgen)\s+geplant/i)) || (m = body.match(/payment of\s+(€?\s?[\d.,]+\s?€?)\s+to\s+(.+?)\s+is\s+scheduled\s+for\s+(today|tomorrow)/i))) {
        const a = parseAmountText(m[1]);
        const off = /morgen|tomorrow/i.test(m[3]) ? (/über/i.test(m[3]) ? 2 : 1) : 0;
        if (a) { out.scheduled.push({ merchant: cleanMerchant(m[2]), amount: a.value, cur: a.cur, date: iso(addD(new Date(date + "T00:00:00"), off)) }); hit = true; }
      }
      if (hit) { used.add(hd.i); for (const l of bodyLines) used.add(lines.indexOf(l)); }
    }

    // 2) Listen: Tageskopf, Kontostand oben, Zeilen „Händler … Betrag“ mit Unterzeile (Zeit/Datum/Status)
    let ctxDate = null;
    for (let i = 0; i < lines.length; i++) {
      if (used.has(i)) continue;
      const l = lines[i];
      if ((l.y0 + l.y1) / 2 < statusBar || (l.y0 < 0.08 * H && /^\W*\d{1,2}:\d{2}\b/.test(l.text))) continue; // Statusleiste (Uhrzeit, Netz, Akku)
      const money = findMoney(l.text);
      const rest = money.length ? (l.text.slice(0, money[money.length - 1].index) + l.text.slice(money[money.length - 1].end)).trim() : l.text;
      const dt = findDate(rest, today);
      // Tageskopf („29. September -292,66 €“, „Heute“)
      if (l.x0 < 0.09 * W && dt.date && !dt.time && rest.replace(/[^A-Za-zÄÖÜäöü]/g, "").length <= 14 && /^(\d|heute|gestern|vorgestern|today|yesterday|mo|di|mi|do|fr|sa|so|mon|tue|wed|thu|fri|sat|sun)/i.test(rest)) {
        ctxDate = dt.date;
        continue;
      }
      // Großer Kontostand oben
      const nx0 = lines[i + 1];
      const w2 = nx0 && nx0.y0 - l.y1 < 2 * medH && !findMoney(nx0.text).length ? findDate(nx0.text, today) : { date: null, time: null };
      const big = Math.max(...l.words.map(wordH)) > 1.45 * medWordH;
      if (money.length === 1 && rest.replace(/[^A-Za-zÄÖÜäöü0-9]/g, "").length <= 2 && l.y0 < 0.45 * H && (big || (w2.date && w2.time))) {
        out.balances.push({ value: money[0].value, cur: money[0].cur, date: w2.date || iso(today), time: w2.time, src: "Kontostand", big: true });
        if (w2.date) { i++; ctxDate = w2.date; }
        continue;
      }
      if (!money.length) continue;
      const mny = money[money.length - 1];
      const tail = l.text.slice(mny.end).trim();
      const mWord = l.words.find((w) => l.text.indexOf(w.t) >= 0 && w.t.includes(mny.text.split(/\s/).pop()));
      const rightAligned = l.x1 > 0.72 * W && tail.replace(/[^A-Za-z0-9]/g, "").length <= 1;
      if (!rightAligned) continue;
      let title = l.text.slice(0, mny.index).trim();
      let sub = "", j = i + 1;
      // Betrag sitzt mittig neben Name + Zeit → Tesseract hängt ihn an die Zeit-Zeile („08:02 -11,99 €“): Name steht eine Zeile höher
      const startsMeta = /^\W*(\d{1,2}:\d{2}|heute|gestern|today|yesterday|\d{1,2}\.\s?[A-Za-zÄÖÜäöü]{3})/i.test(title);
      if (startsMeta || !/[A-Za-zÄÖÜäöü]{3,}/.test(title)) {
        const pv = lines[i - 1];
        if (!pv || used.has(i - 1) || l.y0 - pv.y1 > 1.2 * medH || findMoney(pv.text).length || !/[A-Za-zÄÖÜäöü]{3,}/.test(pv.text) || findDate(pv.text, today).date) continue;
        sub = " " + title;
        title = pv.text;
      }
      if (!/[A-Za-zÄÖÜäöü]{3,}/.test(title)) continue;
      // Unterzeile(n)
      while (j < lines.length && j <= i + 2 && lines[j].y0 - (j === i + 1 ? l.y1 : lines[j - 1].y1) < 1.3 * medH && !findMoney(lines[j].text).some((x) => lines[j].x1 > 0.72 * W)) {
        sub += " " + lines[j].text;
        j++;
      }
      const subDate = findDate(sub, today);
      const status = title + " " + sub;
      if (SCHEDULED.test(status)) { i = j - 1; continue; }
      if (DECLINED.test(status)) { out.skipped++; i = j - 1; continue; }
      let sign = mny.sign;
      if (!sign) {
        const c = colorOf(mWord ? mWord.b : { x0: l.x1 - 0.2 * W, x1: l.x1, y0: l.y0, y1: l.y1 });
        sign = c === "green" ? "+" : "-";
      }
      out.txs.push({
        date: subDate.date || ctxDate || iso(today), time: subDate.time, merchant: cleanMerchant(title), amount: mny.value, cur: mny.cur,
        kind: sign === "+" ? "income" : "expense", src: "Liste", dateGuessed: !subDate.date && !ctxDate,
      });
      i = j - 1;
    }
    return out;
  }

  /* ---------- Kassenzettel ---------- */
  const TOTAL_KW = [/zu\s*zahlen|zahlbetrag|endbetrag|amount\s*due|payable|πληρωτ/i, /\bsumme\b|gesamt(?:betrag|summe)?|\btotal\b|σ[υύ]νολο|συνολο/i, /kartenzahlung|ec-?karte|girocard|visa|mastercard|maestro|card\b|betrag/i];
  const NOT_TOTAL = /zwischensumme|sub-?total|netto|mwst|ust\b|vat|tax|steuer|rabatt|discount|gegeben|rückgeld|change|\bbar\b|cash|pfand|tip|trinkgeld/i;
  const AMT2 = /(?:^|[^\d])(\d{1,4}(?:[.,]\d{3})*[.,]\d{2})(?!\d)/g;
  function amountsIn(s) {
    const out = [];
    let m;
    AMT2.lastIndex = 0;
    while ((m = AMT2.exec(s))) {
      const raw = m[1];
      const last = Math.max(raw.lastIndexOf(","), raw.lastIndexOf("."));
      const v = parseFloat(raw.slice(0, last).replace(/[.,]/g, "") + "." + raw.slice(last + 1));
      if (isFinite(v)) out.push(v);
    }
    return out;
  }
  function parseReceipt(raw, W, H, opt) {
    const today = dayOnly(opt && opt.today ? new Date(opt.today) : new Date());
    const lines = (raw || []).map((l) => ({ text: String(l.text || "").replace(/\s+/g, " ").trim(), y0: (l.bbox || l.b).y0, y1: (l.bbox || l.b).y1 })).filter((l) => l.text).sort((a, b) => a.y0 - b.y0);
    const res = { merchant: "", date: null, total: null, totalFrom: "" };
    // Geschäft: erste sinnvolle Zeile oben
    for (const l of lines.slice(0, Math.max(3, Math.ceil(lines.length * 0.3)))) {
      const letters = l.text.replace(/[^A-Za-zÄÖÜäöüß]/g, "");
      if (letters.length < 3 || letters.length / l.text.length < 0.5) continue;
      if (/kassenbon|rechnung|receipt|beleg|quittung|tel\.?|fax|www\.|http|str\.|straße|strasse|ust|vat|uid|steuer|filiale|öffnungszeit|willkommen|welcome|danke/i.test(l.text)) continue;
      res.merchant = cleanMerchant(l.text);
      break;
    }
    for (const l of lines) { const d = findDate(l.text, today); if (d.date && /\d/.test(l.text)) { res.date = d.date; break; } }
    for (let p = 0; p < TOTAL_KW.length && res.total == null; p++) {
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        if (!TOTAL_KW[p].test(l.text) || NOT_TOTAL.test(l.text)) continue;
        let a = amountsIn(l.text);
        if (!a.length && lines[i + 1]) a = amountsIn(lines[i + 1].text);
        if (a.length) { res.total = a[a.length - 1]; res.totalFrom = l.text; break; }
      }
    }
    if (res.total == null) {
      let best = null;
      for (const l of lines) { if (NOT_TOTAL.test(l.text)) continue; for (const v of amountsIn(l.text)) if (v < 100000 && (best == null || v > best)) best = v; }
      if (best != null) { res.total = best; res.totalFrom = "größter Betrag"; }
    }
    return res;
  }

  /* ---------- Kategorie raten ---------- */
  const CATS = [
    ["Abos & Software", /netflix|spotify|\bmax\b|hbo|disney|apple\.com|icloud|itunes|app store|google (one|play|storage)|youtube|prime video|amazon prime|chatgpt|openai|anthropic|claude|adobe|microsoft|dazn|sky\b|audible|canva|notion|dropbox/i],
    ["Lebensmittel", /lidl|aldi|rewe|edeka|alphamega|sklavenitis|carrefour|supermar|papantoniou|metro|kaufland|netto|penny|spar\b|billa|bäcker|baker|grocery|market/i],
    ["Restaurant & Café", /restaurant|caf[eé]|coffee|starbucks|costa|mcdonald|burger|kfc|pizz|wolt|foody|bolt food|uber ?eats|lieferando|taverna|taverne|bar &|kebab|sushi|bistro/i],
    ["Transport", /uber|bolt|taxi|tank|petrolina|\beko\b|esso|shell|\bbp\b|total ?energies|parking|parken|bus|metro ticket|lime|bird/i],
    ["Handy & Internet", /cyta|epic|primetel|vodafone|telekom|\bo2\b|cabletel|mobile/i],
    ["Reisen", /ryanair|wizz|easyjet|aegean|lufthansa|booking\.com|airbnb|hotel|flug|airline|expedia/i],
    ["Gesundheit & Sport", /apotheke|pharmac|gym|fitness|arzt|doctor|clinic|klinik/i],
    ["Shopping", /amazon|zara|h&m|ikea|jumbo|nike|adidas|zalando|shein|temu|aliexpress|mediamarkt|public\b|stephanis/i],
  ];
  function guessCategory(merchant, kind) {
    if (kind === "income") {
      if (/gehalt|lohn|salary|payroll/i.test(merchant || "")) return "Gehalt";
      if (/zinsen|interest|staking|earn/i.test(merchant || "")) return "Zinsen & Staking";
      if (/erstattung|refund|rückzahlung/i.test(merchant || "")) return "Erstattung";
      return "";
    }
    for (const [c, re] of CATS) if (re.test(merchant || "")) return c;
    return "";
  }

  return { parseScreenshot, parseReceipt, findMoney, findDate, guessCategory, detectBank };
})();
if (typeof module !== "undefined" && module.exports) module.exports = SCANPARSE;
