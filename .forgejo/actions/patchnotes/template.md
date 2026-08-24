<!--
  Discord-Announcement-Vorlage für neue Releases.

  Das Layout wird über HTML-Kommentar-Direktiven gesteuert. Kommentare selbst
  werden nie gerendert:
    <!-- section | button: LABEL -> URL -->   der folgende Textblock wird zur Kopfzeile mit Link-Button

    <!-- separator: large -->                 sichtbare Trennlinie, großer Abstand
    <!-- separator: small -->                 unsichtbarer Abstand

Jeder andere Textblock wird zu einer eigenen Textanzeige.
Platzhalter in doppelten Klammern werden zur Laufzeit ersetzt:
vom Code: VERSION, DATUM, RELEASE_URL
von der KI: NEUERUNGEN, AENDERUNGEN (Beschreibungen in main.ts)
-->
<!-- section | button: 📋 Changelog -> {{RELEASE_URL}} -->

## 🚀 Zeitvertreib Update {{VERSION}}

<!-- separator: large -->

### ✨ Neuerungen

{{NEUERUNGEN}}

### ⚖️ Balance & Anpassungen

{{AENDERUNGEN}}
<!-- separator: small -->

-# Veröffentlicht am {{DATUM}}
