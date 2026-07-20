# Product — AI Video Fact-Check

Canonical product/domain spec. Status: [`MULTILEVEL-IMPLEMENTATION-PLAN.md`](MULTILEVEL-IMPLEMENTATION-PLAN.md).

**Author:** [Andre Lorbach](https://github.com/alorbach/)  
**Repo:** https://github.com/alorbach/AI-Video-Fact-Check

## Goal

Help everyday users — especially older adults — spot misleading video claims, in plain **German** and **English**.

Users must **not** need API keys, servers, or developer setup. They use chat tools they already know, in **their own free account**.

## Analysis targets (only these)

| Priority | Target | URL | Cost |
|---|---|---|---|
| **Primary** | Custom GPT „Video Faktencheck“ | https://chatgpt.com/g/g-6a5e1494f814819181208da5d30ab4ae-video-faktencheck | Free ChatGPT tier / user’s existing ChatGPT login |
| **Secondary** | Google Gemini (web chat) | https://gemini.google.com/ | Free Gemini web for signed-in Google users |

**Out of scope:** own LLM backend, OpenAI/Anthropic/Gemini **API keys**, paid developer APIs, proxy servers for analysis.

The extension’s job is to **prepare** (video URL + transcript/captions when possible) and **hand off** into the open chat — with clear, large-button guidance.

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
4. Copy to clipboard
5. Open chosen chat (Custom GPT or free Gemini)
6. Side Panel shows short steps: what was copied, what to paste, what to expect
```

The **analysis itself** runs inside ChatGPT / Gemini — not in our server.

## Chat handoff (primary UX)

### Custom GPT (default)

1. Copy paste package to clipboard  
2. Open https://chatgpt.com/g/g-6a5e1494f814819181208da5d30ab4ae-video-faktencheck  
3. Side Panel: „Einfügen (Strg+V) und Senden“ / „Paste (Ctrl+V) and send“

### Free Gemini (optional)

1. Same clipboard package (+ short instruction so Gemini answers in the same plain style)  
2. Open https://gemini.google.com/  
3. Same paste guidance

No automation that types into ChatGPT/Gemini for the user (fragile + policy risk). **Guided paste** is intentional and understandable.

## Paste package (what we put on the clipboard)

```text
Video-URL:
<url>

Transkript / Untertitel (falls vorhanden):
<transcript or "nicht verfügbar – bitte nur anhand der URL prüfen">

Bitte führe einen verständlichen Faktencheck durch (Bewertung 1–10,
kurze Zusammenfassung, wichtige Behauptungen, Quellen, Unsicherheiten).
```

(EN variant of the instruction block when UI language is English.)

## User journey (context menu)

```text
Video mit KI prüfen / Check video with AI
├── Mit Video-Faktencheck GPT öffnen   ← default
├── Mit Gemini öffnen (kostenlos)
├── Nur Transkript/Link kopieren
└── …
```

Side Panel progress (extension-side only):

```text
Video erkannt…
Untertitel werden gesucht…
Alles ist vorbereitet…
Chat wird geöffnet… → Bitte einfügen und senden
```

## Privacy & consent

```text
Extension (local) → clipboard → user’s ChatGPT or Gemini tab
```

- No analysis API keys anywhere
- No own server required for MVP
- Never forward social-media cookies
- No DRM / captcha bypass
- Captions/transcript stay on device until the user pastes into the chat they chose
- Optional: remember last handoff locally (`chrome.storage`) with opt-in

If tab audio is ever recorded for local helper use, show consent first. Prefer **captions + URL** so audio upload is unnecessary.

## MVP definition of done

1. Context menu / toolbar starts the flow  
2. Extension collects page video URL  
3. Captions used when present (best effort per platform)  
4. Paste package copied automatically  
5. Custom GPT opens in a new tab  
6. Side Panel explains paste/send in plain de/en, large controls  
7. Optional: open free Gemini the same way  
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
