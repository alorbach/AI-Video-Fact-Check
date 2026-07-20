> **SUPERSEDED — do not use as source of truth.**  
> Content was extracted into `docs/PRODUCT.md`, `docs/SPEC-TRANSCRIPT.md`, `docs/SPEC-FACT-CHECK.md`, and `docs/levels/`.  
> Kept only as historical reference.

# Plan: Chrome-Erweiterung „Video-Faktencheck“

## 1. Ziel

Der Benutzer startet den Faktencheck über:

- Rechtsklick auf ein Video oder die aktuelle Seite
- Schaltfläche in der Chrome-Symbolleiste
- optional direkt eingeblendeten Button auf unterstützten Plattformen

Unterstützte Plattformen:

- Facebook und Facebook Reels
- Instagram Reels
- TikTok
- YouTube und YouTube Shorts
- X/Twitter-Videos
- Vimeo
- allgemeine Webseiten mit HTML5-Video

Die Erweiterung:

1. erkennt Video, Untertitel und Plattform,
2. beschafft ein Transkript,
3. übermittelt Transkript, Video-URL und Metadaten an den Faktencheck,
4. zeigt Fortschritt und Ergebnis als Overlay oder Chrome-Seitenleiste an.

---

## 2. Technische Grundentscheidung

Der Custom GPT unter

```text
https://chatgpt.com/g/g-6a5e1494f814819181208da5d30ab4ae-video-faktencheck
```

kann nicht stabil wie eine öffentliche API direkt aus einer Chrome-Erweiterung aufgerufen werden.

Daher zwei Modi:

### Modus A: Vollautomatisch

Die Logik des Custom GPT wird als Systemprompt in einem eigenen Backend nachgebildet. Das Backend übernimmt:

- Transkriptanalyse
- Behauptungsextraktion
- Webrecherche
- Quellenbewertung
- verständliche Zusammenfassung
- Bewertung von 1 bis 10

### Modus B: Bestehenden GPT öffnen

Die Erweiterung:

1. kopiert das Transkript in die Zwischenablage,
2. öffnet den bestehenden GPT in einem neuen Tab,
3. stellt eine vorbereitete Aufgabenstellung bereit.

Empfehlung: Modus A als Hauptfunktion, Modus B zusätzlich.

---

## 3. Architektur

```text
Videoseite
   │
   ▼
Chrome Extension
   ├── Context Menu
   ├── Content Script
   ├── Service Worker
   ├── Offscreen Recorder
   └── Overlay / Side Panel
           │
           ▼
Eigenes Backend
   ├── URL- und Plattformanalyse
   ├── Transcript Resolver
   ├── Speech-to-Text
   ├── GPT-Faktencheck
   ├── Webrecherche
   └── Job-/Ergebnisverwaltung
```

### Chrome Extension

- Manifest V3
- Service Worker
- Content Scripts
- `chrome.contextMenus`
- `chrome.scripting`
- `chrome.tabCapture`
- `chrome.offscreen`
- `chrome.sidePanel`
- `chrome.storage`

### Backend

- Node.js mit TypeScript
- Fastify oder Express
- SQLite für MVP, später PostgreSQL
- FFmpeg
- optional `yt-dlp`
- Speech-to-Text API oder eigener Whisper-Server
- OpenAI Responses API

---

## 4. Benutzerablauf

### Kontextmenü

```text
Video mit GPT prüfen
├── Aktuelles Video prüfen
├── Markierten Link prüfen
├── Nur transkribieren
└── Im Video-Faktencheck-GPT öffnen
```

### Ablauf

1. Video erkennen
2. Untertitel suchen
3. falls nötig Audiospur beschaffen oder Tab-Audio aufnehmen
4. Transkript erstellen
5. Behauptungen extrahieren
6. Fakten recherchieren
7. Ergebnis als Overlay oder Side Panel anzeigen

Fortschrittsanzeige:

```text
Untertitel werden gesucht …
Audiospur wird verarbeitet …
Transkript wird erstellt …
Behauptungen werden geprüft …
Quellen werden ausgewertet …
```

---

## 5. Transkriptions-Pipeline

Die Erweiterung arbeitet die Methoden in dieser Reihenfolge ab.

### Stufe 1: Vorhandene Untertitel

- YouTube-Untertitel
- TikTok-Captions
- HTML-`track`-Elemente
- eingebettete JSON-Metadaten
- Plattform-Untertitel
- Postbeschreibung oder Caption

### Stufe 2: Direkte Medienquelle

Auswertung von:

- `video.currentSrc`
- `video.src`
- `<source>`
- OpenGraph-Metadaten
- eingebetteten JSON-Daten
- Performance- und Netzwerkhinweisen

Probleme:

- `blob:`-URLs
- Media Source Extensions
- HLS/DASH
- kurzlebige signierte URLs

### Stufe 3: Tab-Audio aufnehmen

Fallback für Facebook, Instagram und ähnliche Plattformen.

```text
Benutzer klickt „prüfen“
→ Video an den Anfang setzen
→ Tab-Audio erfassen
→ Video abspielen
→ MediaRecorder speichert WebM/Opus
→ Audio an Backend senden
```

### Stufe 4: Serverseitiger Medienabruf

```text
URL
→ yt-dlp
→ Medienstream
→ FFmpeg
→ Mono-Audio
→ Speech-to-Text
```

Nur für öffentliche, technisch abrufbare Inhalte.

Keine:

- Cookie-Übertragung an Drittanbieter
- DRM-Umgehung
- Captcha-Umgehung
- Verarbeitung privater Inhalte ohne Zustimmung

### Stufe 5: Externe Hilfsdienste

Nur als optionaler Provider, nicht als Kernarchitektur.

```typescript
interface TranscriptProvider {
  supports(input: VideoInput): Promise<boolean>;
  transcribe(input: VideoInput): Promise<TranscriptResult>;
}
```

---

## 6. Plattformstrategien

| Plattform | Priorität 1 | Priorität 2 | Fallback |
|---|---|---|---|
| YouTube | Untertitel | Audio-URL | Tab-Audio |
| YouTube Shorts | Untertitel | Audio-URL | Tab-Audio |
| Facebook Reels | Caption/Metadaten | Medienquelle | Tab-Audio |
| Instagram Reels | Caption/Metadaten | Medienquelle | Tab-Audio |
| TikTok | Caption/Untertitel | Medienquelle | Tab-Audio |
| X/Twitter | Posttext/Untertitel | Medienquelle | Tab-Audio |
| Allgemeine Website | `<track>`/DOM | `video.currentSrc` | Tab-Audio |

Wenn kein Video erkannt wird:

```text
Auf dieser Seite wurde kein unterstütztes Video erkannt.

[Tab-Audio aufnehmen]
[Video-Datei auswählen]
[URL manuell eingeben]
```

---

## 7. Faktencheck-Pipeline

### Eingabe

```json
{
  "sourceUrl": "...",
  "platform": "facebook",
  "title": "...",
  "description": "...",
  "transcript": "...",
  "transcriptSource": "tab-audio",
  "language": "de",
  "timestamps": []
}
```

### Verarbeitung

1. Transkript bereinigen
2. überprüfbare Behauptungen extrahieren
3. Meinung, Prognose und Tatsachenbehauptung trennen
4. Primärquellen recherchieren
5. jede Behauptung bewerten
6. Gesamtwertung erzeugen

### Urteil pro Behauptung

```text
Richtig
Überwiegend richtig
Teilweise richtig
Irreführend
Überwiegend falsch
Falsch
Nicht belegbar
```

### Gesamtbewertung

```text
1 = vollständig erfunden oder manipulativ
5 = Mischung aus richtigen und irreführenden Aussagen
10 = vollständig korrekt, gut eingeordnet und sauber belegt
```

Gewichtung:

```text
40 % sachliche Richtigkeit
25 % fehlender oder irreführender Kontext
20 % Qualität der Belege
10 % Übertreibung und Manipulation
 5 % Transkriptionssicherheit
```

---

## 8. Ergebnisdarstellung

### Side Panel empfohlen

Vorteile:

- unabhängig vom CSS der Webseite
- bleibt sichtbar
- mehr Platz für Quellen
- stabiler auf Facebook, TikTok und Instagram
- einfacher Export

### Overlay

```text
┌────────────────────────────────────┐
│ Video-Faktencheck                  │
│ Transkript wird erstellt … 64 %    │
│ ███████████████░░░░░               │
│                         [Abbrechen] │
└────────────────────────────────────┘
```

Nach Abschluss:

```text
┌────────────────────────────────────┐
│ Bewertung: 4/10 – irreführend      │
│                                    │
│ Kernaussage                        │
│ Das Video verwendet richtige       │
│ Einzelzahlen, zieht daraus aber    │
│ einen falschen Schluss.            │
│                                    │
│ [Details öffnen] [Quellen] [Kopie] │
└────────────────────────────────────┘
```

### Inhalt der Seitenleiste

1. Bewertung 1–10
2. verständliche Zusammenfassung
3. wichtigste Behauptungen
4. Urteil und Begründung
5. Quellen
6. vollständiges Transkript
7. Transkriptionsqualität
8. Aktionen:
   - Ergebnis kopieren
   - als Markdown speichern
   - als PDF drucken
   - im Custom GPT öffnen
   - Analyse wiederholen

---

## 9. Nachrichtenfluss

```text
Content Script
    │
    ▼
Service Worker
    ├── Backend-Auftrag starten
    ├── Offscreen Recorder steuern
    └── Status verwalten
    │
    ▼
Side Panel / Overlay
```

```typescript
type ExtensionMessage =
  | { type: "ANALYZE_PAGE"; tabId: number }
  | { type: "VIDEO_DETECTED"; video: VideoMetadata }
  | { type: "START_TAB_CAPTURE"; tabId: number }
  | { type: "UPLOAD_PROGRESS"; percent: number }
  | { type: "JOB_PROGRESS"; stage: AnalysisStage }
  | { type: "ANALYSIS_COMPLETE"; result: FactCheckResult }
  | { type: "ANALYSIS_FAILED"; error: PublicError };
```

---

## 10. Backend-API

```http
POST /api/v1/jobs
GET  /api/v1/jobs/{jobId}
POST /api/v1/jobs/{jobId}/audio
POST /api/v1/jobs/{jobId}/transcript
DELETE /api/v1/jobs/{jobId}
```

### Auftrag starten

```json
{
  "url": "https://www.facebook.com/reel/...",
  "platform": "facebook",
  "title": "...",
  "description": "...",
  "preferredLanguage": "de"
}
```

### Status

```json
{
  "state": "checking_claims",
  "progress": 72,
  "message": "5 von 7 Behauptungen geprüft"
}
```

---

## 11. Sicherheit und Datenschutz

### API-Key

Der OpenAI-API-Key darf nicht in der Erweiterung liegen.

```text
Extension → eigenes Backend → OpenAI
```

### Datensparsamkeit

- Audio nach Transkription löschen
- Transkript nach konfigurierter Frist löschen
- keine Historie ohne Zustimmung
- Ergebnisse lokal speichern, sofern möglich
- keine Social-Media-Cookies übertragen

Vor Aufnahme anzeigen:

```text
Die Erweiterung zeichnet nur den Ton des aktuell geöffneten Tabs auf.
Die Aufnahme wird zur Transkription an den konfigurierten Server übertragen.
```

---

## 12. Manifest-Beispiel

```json
{
  "manifest_version": 3,
  "name": "Video-Faktencheck",
  "version": "0.1.0",
  "permissions": [
    "activeTab",
    "contextMenus",
    "scripting",
    "storage",
    "tabCapture",
    "offscreen",
    "sidePanel"
  ],
  "optional_host_permissions": [
    "https://www.facebook.com/*",
    "https://www.instagram.com/*",
    "https://www.tiktok.com/*",
    "https://www.youtube.com/*",
    "https://x.com/*",
    "https://twitter.com/*"
  ],
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "side_panel": {
    "default_path": "sidepanel.html"
  },
  "action": {
    "default_title": "Video prüfen"
  }
}
```

---

## 13. Projektstruktur

```text
video-fact-check/
├── extension/
│   ├── manifest.json
│   ├── src/
│   │   ├── background/
│   │   │   └── service-worker.ts
│   │   ├── content/
│   │   │   ├── detector.ts
│   │   │   ├── overlay.ts
│   │   │   └── platform-adapters/
│   │   │       ├── facebook.ts
│   │   │       ├── instagram.ts
│   │   │       ├── tiktok.ts
│   │   │       ├── youtube.ts
│   │   │       └── generic.ts
│   │   ├── offscreen/
│   │   │   ├── recorder.html
│   │   │   └── recorder.ts
│   │   ├── sidepanel/
│   │   │   ├── index.html
│   │   │   ├── app.ts
│   │   │   └── app.css
│   │   ├── options/
│   │   └── shared/
│   └── vite.config.ts
│
├── backend/
│   ├── src/
│   │   ├── routes/
│   │   ├── transcription/
│   │   ├── media-resolver/
│   │   ├── fact-check/
│   │   ├── providers/
│   │   └── security/
│   ├── Dockerfile
│   └── package.json
│
├── shared/
│   └── types/
└── docker-compose.yml
```

---

## 14. Entwicklungsphasen

### Phase 1: MVP

- Rechtsklick
- YouTube
- Facebook Reels
- TikTok
- vorhandene Untertitel
- Tab-Audio-Aufnahme
- Backend-Upload
- Speech-to-Text
- Faktencheck
- Side Panel
- Button zum Öffnen des vorhandenen GPT

### Phase 2: Plattformadapter

- Instagram
- X/Twitter
- Vimeo
- allgemeine Webseiten
- bessere Untertitelerkennung
- automatisches Zurücksetzen und Abspielen
- Aufnahmeende am Videoende

### Phase 3: Robustheit

- Job-Wiederaufnahme
- Abbruch
- Chunk-Uploads
- lange Videos
- Sprachenerkennung
- Sprechertrennung
- Zeitstempel
- Retry-Logik
- Provider-Fallbacks

### Phase 4: Veröffentlichung

- Datenschutzerklärung
- Nutzungsbedingungen
- Chrome-Web-Store-Paket
- minimale Berechtigungen
- Rate-Limits
- Kostenkontrolle
- Missbrauchsschutz

---

## 15. MVP-Akzeptanzkriterien

Der MVP gilt als fertig, wenn:

1. Rechtsklick auf ein Reel bietet „Video mit GPT prüfen“.
2. Vorhandene Untertitel werden automatisch genutzt.
3. Ohne Untertitel kann Tab-Audio aufgenommen werden.
4. Aufnahme endet automatisch oder manuell.
5. Transkript wird an das Backend übermittelt.
6. Ergebnis enthält:
   - Bewertung 1–10
   - verständliche Zusammenfassung
   - Prüfung wichtiger Behauptungen
   - Quellen
   - Unsicherheiten
7. Ergebnis erscheint ohne Seitenwechsel.
8. „Im originalen GPT öffnen“ kopiert das Transkript und öffnet den GPT-Link.
9. Kein API-Key liegt in der Extension.
10. Audio wird nach Verarbeitung gelöscht.

---

## 16. Empfohlener Stack

### Extension

```text
TypeScript
Vite
Manifest V3
Preact oder Vanilla UI
Chrome Side Panel
MediaRecorder
```

### Backend

```text
Node.js
TypeScript
Fastify
FFmpeg
OpenAI API
SQLite für MVP
Docker
```

### Priorisierte Transkriptionslogik

```text
1. Plattform-Untertitel
2. DOM-/Track-Untertitel
3. öffentlich abrufbare Audiospur
4. Tab-Audio-Aufnahme
5. manuell hochgeladene Datei
```

### Custom-GPT-Integration

```text
Primär:
Prompt und Bewertungslogik im Backend nachbilden

Zusätzlich:
Button „Im bestehenden Video-Faktencheck-GPT öffnen“
→ Transkript kopieren
→ GPT-Link öffnen
```

Ein direkter programmatischer Aufruf des Custom GPT über seine `g-...`-ID sollte nicht als Voraussetzung eingeplant werden.
