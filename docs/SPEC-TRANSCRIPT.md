# Spec — URL & captions (in-browser)

Used by [L2](levels/L2-capture-transcript.md) and [L5](levels/L5-platforms.md).

Goal: build a good **PastePackage** without any analysis server. Prefer data the page already has.

## Required platforms

Must work before product MVP is done:

1. YouTube (+ Shorts)  
2. TikTok  
3. X (Twitter)  
4. Facebook (videos + Reels)  
5. Instagram (Reels; other video posts when detectable)

Optional later: Vimeo, generic HTML5.

## Priority ladder

1. Platform captions / subtitles (best)
2. DOM / `<track>` captions
3. Post description / caption text (supplement)
4. Video URL only — chat checks from the link (Custom GPT accepts URL)
5. Manual: user pastes their own transcript into the Side Panel, then hand off

**Avoid for MVP:** own STT server, Whisper API keys, yt-dlp backend.  
Optional later (only if free/local and still no API keys): browser Web Speech API as a weak helper — never required.

### YouTube caption ladder (implementation order)

1. Player `captionTracks` → timedtext (`c=WEB`, json3/XML)  
2. HTML `<track>` on the video element  
3. Same-origin `youtubei/v1/get_transcript` (engagement-panel params)  
4. **Native transcript panel DOM** — best-effort “Show transcript” / “Transkript anzeigen”, then read `ytd-transcript-segment-renderer`  
5. Video description as `transcriptSource: "post"` (supplement)  
6. **TranscribeYouTube helper** (service worker only) — when steps 1–4 left no real captions (`none` or only `post`): `POST https://transcribeyoutube.com/api/transcript` with the **video URL + language hint** (no audio upload, no API key). Result → `transcriptSource: "external"`  
7. URL only + clear “not available” note  

TranscribeYouTube is **YouTube-only**. TikTok / X / Facebook / Instagram never call it.

## Stage details

### Captions / text

- YouTube timedtext / captions / native transcript panel / optional TranscribeYouTube URL helper  
- TikTok captions / on-screen caption data when exposed  
- Facebook / Instagram caption or post text from DOM/metadata  
- X post text (+ subtitles if present)  
- HTML `track`  
- Embedded JSON metadata  

### Page / video URL

Always include a stable shareable URL in the paste package. Do not scrape private media or bypass DRM.

### When no captions

```text
Paste package uses URL + note "transcript not available".
Custom GPT / Gemini can still work from the link.
Side Panel explains this clearly.
```

### No video detected

```text
No supported video found.

[Copy page URL anyway]
[Paste your own transcript]
[Cancel]
```

## Platform strategies (required set)

| Platform | Priority 1 | Priority 2 | If nothing else |
|---|---|---|---|
| YouTube / Shorts | Captions (local ladder + optional helper) | Page URL | Manual transcript |
| TikTok | Caption / subtitles | Page URL | Manual transcript |
| X / Twitter | Post text / subtitles | Page URL | Manual transcript |
| Facebook / Reels | Caption / metadata | Page URL | Manual transcript |
| Instagram / Reels | Caption / metadata | Page URL | Manual transcript |

Minimum bar per platform: **correct platform detection + video/page URL in PastePackage**. Captions are best-effort and improve quality when available.

## Implementation split

| Level | Scope |
|---|---|
| **L2** | Detector + PastePackage; **YouTube** fully (captions when present); stub detection for the other four with URL package |
| **L5** | Full adapters for **TikTok, X, Facebook, Instagram** — all five required platforms green on [`test-urls.md`](test-urls.md) |
