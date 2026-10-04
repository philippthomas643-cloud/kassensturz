# Kassensturz – Hinweise für Claude

Persönliche Finanz-App von Philipp (Konten in EUR, USDT, BTC, alles in Euro). Läuft als
installierbare Web-App (PWA) über GitHub Pages: https://philippthomas643-cloud.github.io/kassensturz/
Philipp nutzt sie als App auf dem iPhone-Home-Bildschirm. UI-Sprache: Deutsch, per „du“, kurz und klar.

## Grundsätze
- **Kein Server, kein Konto.** Alle Daten liegen auf dem Gerät (IndexedDB). Nichts davon gehört ins Repo.
- **Kein Framework, keine Laufzeit-Abhängigkeiten.** Reines HTML/CSS/JS, beim Bauen zu einer `docs/index.html` gebündelt.
- **Datenformat nie brechen.** Felder nicht umbenennen/entfernen. Neue Felder müssen optional sein (alte Daten haben sie nicht).
  Neue Sammlung → `IDB_VERSION` in `src/js/store.js` erhöhen und in `onupgradeneeded` ergänzen. Backup-Format (`version: 1`) bleibt lesbar.
- `docs/` ist Build-Ergebnis – **nie von Hand ändern**, immer `node tools/build.mjs`.

## Aufbau
- `src/index.html` – Vorlage (Meta-Tags, Platzhalter für CSS/Body/JS)
- `src/styles.css` – gesamtes Design (Tokens für Hell/Dunkel oben, dann Komponenten)
- `src/body.html` – App-Rahmen (Seitenleiste, Topbar, Tab-Leiste, Plus-Knopf)
- `src/js/*.js` – werden in dieser Reihenfolge in **einen** gemeinsamen Gültigkeitsbereich gebündelt (siehe `JS_ORDER` in `tools/build.mjs`):
  - `core.js` – Konstanten, Icons, Formatierung (de-DE), Datum, Zustand `S`, Kurse (`effRates`, `toEUR`), abgeleitete Werte (`derive`), Fixkosten-Termine, Ziele
  - `store.js` – IndexedDB: `loadCollections`, `dbBatch(ops)`, `dbWrite(col, id, op, data)`; ruft danach `onDataChanged`
  - `rates.js` – Live-Kurse: Crypto.com → Binance → CoinGecko → Coinbase (öffentliche APIs, CORS), alle 60 s solange sichtbar
  - `checks.js` – Meldungen in der App (Ziel erreicht, 50/75/90 %, Wochenrückblick, Kursrutsch), Zustand in `meta/alerts`
  - `demo.js` – Beispieldaten relativ zum heutigen Datum (`demo: true`)
  - `changelog.js` – „Was ist neu“-Einträge (neuester oben)
  - `scanparse.js` – Auswertung erkannter Texte: `parseScreenshot` (Banking-App: Umsatzliste, Startseite, Mitteilungen; Revolut-erprobt),
    `parseReceipt` (Kassenzettel), `guessCategory`. Ohne Abhängigkeiten, in Node testbar (exportiert `module.exports`).
  - `scan.js` – Scannen: Bild vorbereiten (Graustufen, Dunkelmodus umkehren, Kontrast), Texterkennung mit tesseract.js
    (`docs/ocr/`, wird erst beim ersten Scannen geladen, danach offline im Cache `ks-ocr-…`), Prüfliste, Kontostand-Abgleich,
    Duplikatschutz (`importKey` an der Buchung), Fixkosten-Vorschläge; Kassenzettel öffnen das normale Buchungsformular vorausgefüllt
  - `views.js` – alle Seiten als HTML-Strings (`VIEWS.uebersicht` …), Banner, Willkommen
  - `charts.js` – SVG-Diagramme: Vermögensverlauf (`drawNetWorthChart`) und Aufteilung/Donut (`allocHtml`)
  - `forms.js` – Dialoge/Formulare, Einstellungen, Installationsanleitung, Backup/Import, Löschen
  - `pwa.js` – Service-Worker-Anmeldung, Update-Ablauf, Installations-Hinweise
  - `app.js` – Rendern, Ereignisse (`ACTIONS` per `data-act`), Start (`boot`)
- `src/sw.js` – Service Worker (Cache-first für die App-Dateien, Kurs-APIs gehen direkt ins Netz)
- `src/manifest.webmanifest`, `src/assets/` (Icons, Schriften Geist/Geist Mono, OFL-Lizenz)
- `brand/` – Logo (SVG-Quelle `kassensturz-icon.svg`), PNGs; `tools/brand.mjs` erzeugt daraus alle Icon-Größen (`npm install` nötig)

## Datenmodell (IndexedDB „kassensturz“, je Sammlung ein Store, Schlüssel `id`)
- `accounts`: name, currency (EUR|USDT|BTC), kind, opening, includeInTotal, archived, order, note, createdAt
- `tx`: kind (expense|income|transfer|adjust), date (YYYY-MM-DD), accountId, amount, category, note, eur, toAccountId, toAmount, fixedId, period
  Saldo = opening + Σ Effekte (expense/transfer −, income +, adjust mit Vorzeichen, transfer toAmount aufs Zielkonto). Rechnen in Minor-Units (`SCALE`).
- `fixed`: kind, name, amount, currency, interval (weekly|monthly|quarterly|halfyearly|yearly), anchor, accountId, category, active.
  Gebuchte Fixkosten haben die feste ID `fx_<fixedId>_<YYYYMMDD>`.
- `budgets`: category, limit · `goals`: kind (networth|savings), name, target, currency, accountIds, manual, deadline, notify
- `snaps`: Tageswerte (ID = Datum): total, byCur, rates
- `meta`: `rates` (mode live|manual, BTC/USDT {eur, ch24, at, src}, manual), `app` (onboarded, lastBackupAt …), `settings` (notify-Schalter), `alerts`

## Arbeiten an der App
1. Änderungen in `src/` machen.
2. Version in `package.json` erhöhen (1.0.0 → 1.1.0 für Funktionen, 1.0.1 für Korrekturen) und oben in `src/js/changelog.js`
   einen Eintrag ergänzen (Deutsch, aus Nutzersicht, kurz). Das Datum dort ist das „Stand“-Datum in der App.
3. `node tools/build.mjs` – baut `docs/`, prüft die JS-Syntax, setzt Version + Build-Kennung (Hash über alle Inhalte).
4. `node test/run.mjs` – Ende-zu-Ende-Test mit Playwright (Kurs-APIs werden simuliert; testet auch Offline-Start und Update).
   `node test/shots.mjs [hell|dunkel]` macht Screenshots (iPhone-Größe + Desktop) nach `test/shots/` zum Anschauen.
   Playwright: in Claudes Cloud-Umgebung global unter `/opt/npm-tools/node_modules/playwright`, sonst `npm i -D playwright`.
5. Commit (src **und** docs) und auf `main` pushen. GitHub Pages veröffentlicht `docs/` nach ~1–2 Minuten.
   Die App auf dem iPhone holt sich das Update beim nächsten Öffnen selbst und zeigt „Was ist neu“.

### Hochladen (Push)
- Hat die Sitzung Schreibzugriff auf `philippthomas643-cloud/kassensturz`: normal `git push`.
- Sonst über Philipps Mac (Desktop-Verbindung, `device_bash`, Linux-VM): `gh` als Binary von den GitHub-Releases nach `$HOME/bin` holen,
  Geräte-Login starten (`gh auth login -h github.com -p https -w` bzw. Device-Flow) und Philipp den Code auf github.com/login/device
  eingeben lassen, dann `gh auth setup-git`. **Git nicht im verbundenen Ordner betreiben** (dort darf nichts gelöscht werden →
  Git-Lock-Dateien bleiben hängen), sondern ins VM-Home klonen (`git clone https://github.com/philippthomas643-cloud/kassensturz.git`),
  Änderungen per `git bundle` aus der Cloud übertragen, `git pull <bundle> main`, `git push`.

## Design
- Schrift Geist (Zahlen immer tabellarisch), Karten mit 20px Radius, ruhige Flächen, keine harten Rahmen.
- Farbe nur für Daten: Euro blau `--eur`, USDT grün `--usdt`, BTC orange `--btc`. Positiv/negativ `--pos`/`--neg`.
- Hell/Dunkel über Tokens in `:root` (+ `data-theme` für die manuelle Wahl in den Einstellungen).
- Handy zuerst: Tab-Leiste unten, Plus-Knopf, Dialoge als Bottom-Sheet; Desktop: Seitenleiste.
- Übersicht: Vermögenskarte mit Umschalter **Verlauf** (Linie) ↔ **Aufteilung** (Donut nach Assets oder Konten).

## Scannen – Datenschutz
- **Echte Screenshots oder Kassenzettel von Philipp nie ins Repo** (öffentlich!). Tests nutzen nur erfundene Bilder aus `test/fixtures.mjs`.
- Die Texterkennung läuft auf dem Gerät; Bilder werden nicht gespeichert und nicht hochgeladen.

## Stolperfallen
- iOS: Safari und die installierte App haben **getrennte Speicher**. Push-Nachrichten gibt es nicht (kein Server) – Meldungen erscheinen in der App.
- Der Service Worker liefert immer die gecachte Version; Updates kommen nur über eine geänderte `sw.js` (macht der Build automatisch).
- Fremde Hosts (Kurs-APIs) nie im Service Worker cachen.
- `window.kassensturz = { version, build }` wird von den Tests gelesen – nicht entfernen.
