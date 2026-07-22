# Product — AI Video Fact-Check

Canonical product/domain spec. Status: [`MULTILEVEL-IMPLEMENTATION-PLAN.md`](MULTILEVEL-IMPLEMENTATION-PLAN.md).

**Author:** [Andre Lorbach](https://github.com/alorbach/)  
**Repo:** https://github.com/alorbach/AI-Video-Fact-Check

## Goal

Help everyday users — especially older adults — spot misleading video claims, in plain **German** and **English**.

Users must **not** need API keys, servers, or developer setup. They use chat tools they already know, in **their own free account**.

## Analysis targets (free consumer web chats)

| Priority | Target | URL | Handoff |
|---|---|---|---|
| **Primary** | Custom GPT „Video Faktencheck“ | https://chatgpt.com/g/g-6a5e1494f814819181208da5d30ab4ae-video-faktencheck | Insert + send |
| Free | Google Gemini (web) | https://gemini.google.com/ | Insert + send |
| Free | Claude | https://claude.ai/new | Insert + send |
| Free | Microsoft Copilot | https://copilot.microsoft.com/ | Insert + send |
| Free | DeepSeek | https://chat.deepseek.com/ | Open + clipboard |

User picks the engine in the Side Panel **combobox** (also stored in Settings as default chat).

**Out of scope:** own LLM backend, OpenAI/Anthropic/Gemini **API keys**, paid developer APIs, proxy servers for analysis.

The extension’s job is to **prepare** (video URL + transcript/captions when possible) and **hand off** into the open chat — with clear, large-control guidance.

## Entry points

- Right-click on a video or page
- Toolbar → Side Panel
- Optional on-page button later

### Required platforms (MVP must support all five)

| Platform | Notes |
|---|---|
| **YouTube** | Watch + Shorts |
| **TikTok** | |
| **X** (Twitter) | Video posts |
| **Facebook** | Feed videos + Reels |
| **Instagram** | Reels (+ video posts when detectable) |

Optional later: Vimeo, generic HTML5 pages.

## Flow

```text
1. Detect video + platform on the page
2. Collect video URL + captions/transcript when available (in the browser)
3. Build a simple paste package (URL + text)
4. Open chosen chat (combobox selection / Settings default)
5. Insert + send when supported; otherwise clipboard + paste guidance
6. Side Panel shows status: sent, or how to paste manually if needed
```

The **analysis itself** runs inside the user’s chosen chat — not in our server.

## Chat handoff (primary UX)

### Custom GPT (default)

1. Copy paste package to clipboard (fallback)  
2. Open the Custom GPT URL  
3. Extension inserts the text into the chat box and sends  

### Other free chats

1. Same URL/transcript material; targets with `needsEmbeddedMasterPrompt` get the **full master prompt** in the UI language (de/en)  
2. Open the target’s free web URL  
3. Insert+send when `supportsInject` (Gemini, Claude, Copilot); else ask the user to paste (Ctrl+V)  

If insert/send fails (UI change or login wall), clipboard text remains and the Side Panel asks the user to paste manually.

## Paste package (what we put on the clipboard)

**Custom GPT** (short ask):

```text
Video-URL:
<url>

Transkript / Untertitel (falls vorhanden):
<transcript or "nicht verfügbar – bitte nur anhand der URL prüfen">

Bitte führe einen verständlichen Faktencheck durch (Bewertung 1–10,
kurze Zusammenfassung, wichtige Behauptungen, Quellen, Unsicherheiten).
```

(EN variant of the instruction block when UI language is English.)

**Gemini / Claude / Copilot / DeepSeek** (and any `needsEmbeddedMasterPrompt` target): full master prompt for the UI locale, then `---`, then the same URL/transcript material (no second short ask). Source: `shared/src/masterPrompt.ts`.

## User journey (context menu)

```text
Video mit KI prüfen / Check video with AI
├── Chat öffnen (gespeicherte Auswahl)   ← Settings / Side Panel default
├── Nur Transkript/Link kopieren
└── …
```

Side Panel: AI combobox + **Open chat** + **Copy again**.

Side Panel progress (extension-side only):

```text
Video erkannt…
Untertitel werden gesucht…
Alles ist vorbereitet…
Chat wird geöffnet… → eingefügt / bitte einfügen und senden
```

## Privacy & consent

```text
Extension (local) → clipboard → user’s chosen chat tab
```

- No analysis API keys anywhere
- No own server required for MVP
- Never forward social-media cookies
- No DRM / captcha bypass
- Captions/transcript stay on device until the user pastes into the chat they chose
- Optional: remember last video locally (`chrome.storage.local`) with opt-in in Settings

If tab audio is ever recorded for local helper use, show consent first. Prefer **captions + URL** so audio upload is unnecessary.

## MVP definition of done

1. Context menu / toolbar starts the flow  
2. Extension collects page video URL  
3. Captions used when present (best effort per platform)  
4. Paste package copied automatically  
5. Chosen chat opens in a new tab  
6. Side Panel explains paste/send in plain de/en, large controls  
7. Combobox covers Custom GPT, Gemini, Claude, Copilot, DeepSeek  
8. No API keys, no analysis backend  
9. UI usable in German and English at large font size  
10. **YouTube, TikTok, X, Facebook, Instagram** each produce a usable PastePackage (URL at minimum)  
11. Credits: Andre Lorbach → https://github.com/alorbach/

## Related specs

| Doc | Content |
|---|---|
| [`SPEC-TRANSCRIPT.md`](SPEC-TRANSCRIPT.md) | How we get URL/captions in-browser |
| [`SPEC-FACT-CHECK.md`](SPEC-FACT-CHECK.md) | Handoff protocol + expected chat output |
| [`levels/`](levels/) | Implementation per level |
