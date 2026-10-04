/* ======================================================================
   Änderungen – neuester Eintrag oben. Bei jedem Update ergänzen
   (Version wie in package.json). Wird nach einem Update in der App gezeigt.
   ====================================================================== */
const CHANGELOG = [
  {
    v: "1.3.0",
    date: "2026-10-05",
    items: [
      "Ziele gehen jetzt auch ohne Datum: Beim Anlegen wählst du „Ohne Datum“ oder „Bis zu einem Datum“",
      "Ein Zieldatum lässt sich beim Bearbeiten auch wieder entfernen",
    ],
  },
  {
    v: "1.2.0",
    date: "2026-10-05",
    items: [
      "Neu: Doppelbuchungen erkennen – buchst du den gleichen Betrag kurz hintereinander noch mal, fragt die App nach: doppelt oder richtig?",
      "Gilt auch für Kassenzettel und Screenshots; Fixkosten sind ausgenommen",
      "Schon vorhandene Verdachtsfälle zeigt die Übersicht an – mit einem Tipp löschen oder als richtig markieren",
    ],
  },
  {
    v: "1.1.0",
    date: "2026-10-05",
    items: [
      "Neu: Screenshots aus deiner Banking-App einlesen – Umsätze, Kontostand und geplante Zahlungen werden erkannt und nach kurzer Prüfung gebucht",
      "Neu: Kassenzettel fotografieren – Geschäft, Datum und Summe werden erkannt, du wählst nur noch das Konto",
      "Doppelte Umsätze werden erkannt, abgelehnte Zahlungen übersprungen, wiederkehrende Zahlungen als Fixkosten vorgeschlagen",
      "Die Texterkennung läuft auf deinem Gerät – Bilder verlassen dein iPhone nicht",
    ],
  },
  {
    v: "1.0.1",
    date: "2026-10-04",
    items: [
      "Kein Hochspringen mehr: Umrechner, Diagramm-Umschalter, Zeitraum und Aufteilung bleiben beim Tippen an ihrer Stelle",
      "Neue Kurse im Hintergrund verschieben die Seite nicht mehr und unterbrechen keine Eingabe",
    ],
  },
  {
    v: "1.0.0",
    date: "2026-10-04",
    items: [
      "Kassensturz als eigene App fürs iPhone – läuft offline, deine Daten bleiben auf dem Gerät",
      "Neues Logo und neues, aufgeräumtes Design mit Hell- und Dunkelmodus",
      "Übersicht mit Umschalter: Verlauf deines Gesamtvermögens oder Aufteilung als Kreisdiagramm (nach Assets oder Konten)",
      "Live-Kurse direkt von Crypto.com – fällt die Börse aus, springen Binance, CoinGecko oder Coinbase ein",
      "Meldungen in der App bei erreichten Zielen, Zwischenständen, Wochenrückblick und Kursrutsch",
      "Backup über das Teilen-Menü (z. B. in iCloud Drive) und wieder einspielen",
    ],
  },
];
