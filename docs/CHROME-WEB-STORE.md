# Chrome Web Store — preparation notes

Fill before **Level 9**.

## Listing (draft)

- **Name (EN):** Video Fact-Check  
- **Name (DE):** Video-Faktencheck  
- **Summary (EN):** Prepare a video link and open a free chat (Video-Faktencheck GPT, Gemini, Claude, Copilot, or DeepSeek) — plain language, no setup.  
- **Summary (DE):** Video-Link vorbereiten und kostenlosen Chat öffnen (Video-Faktencheck GPT, Gemini, Claude, Copilot oder DeepSeek) — verständlich, ohne Setup.  
- **Homepage:** https://github.com/alorbach/AI-Video-Fact-Check  
- **Author:** Andre Lorbach — https://github.com/alorbach/

## Permission justifications (draft)

| Permission | Why |
|---|---|
| `sidePanel` | Step-by-step guide beside the video |
| `storage` | Language / last chat choice / optional last package |
| `contextMenus` | “Check video with AI” |
| `clipboardWrite` (if declared) | Backup copy of URL + captions if insert/send fails |
| `host_permissions` (YouTube, TikTok, X, Facebook, Instagram) | Read captions/metadata on those video pages |
| `host_permissions` (transcribeyoutube.com) | YouTube-only fallback: send video URL to fetch existing captions when the page has none |
| `host_permissions` (tiktoktranscript.io, facebooktotranscript.com) | TikTok/Facebook fallback: open free helper pages with the public video URL to fetch a transcript when the page has none |
| `host_permissions` (turboscribe.ai, *.fbcdn.net) | Optional (Settings, default off) Facebook backup: resolve a public mp4 via TurboScribe’s downloader and submit it to TurboScribe’s free transcribe UI when the user is signed in |
| `host_permissions` (chatgpt.com, gemini.google.com, claude.ai) | Insert prepared text into the chat box and send at the user’s request |
| Opens free chat URLs | User’s fact-check happens there (also Copilot/DeepSeek via open + paste) |

### Host patterns (manifest)

Declared under `host_permissions` for the five required platforms:

- `*://*.youtube.com/*`, `*://youtu.be/*`
- `*://*.tiktok.com/*`
- `*://*.x.com/*`, `*://*.twitter.com/*`
- `*://*.facebook.com/*`, `*://*.fb.com/*`, `*://*.fb.watch/*`
- `*://*.instagram.com/*`
- `*://transcribeyoutube.com/*`, `*://*.transcribeyoutube.com/*` (YouTube caption helper; URL only)
- `*://tiktoktranscript.io/*`, `*://*.tiktoktranscript.io/*` (TikTok transcript helper tab)
- `*://facebooktotranscript.com/*`, `*://*.facebooktotranscript.com/*` (Facebook transcript helper tab)
- `*://turboscribe.ai/*`, `*://*.turboscribe.ai/*` (optional Facebook TurboScribe backup; Settings default off)
- `*://*.fbcdn.net/*` (public Facebook CDN media when TurboScribe backup is enabled)
- `*://chatgpt.com/*`, `*://*.chatgpt.com/*`
- `*://gemini.google.com/*`
- `*://claude.ai/*`, `*://*.claude.ai/*`
- `*://copilot.microsoft.com/*`, `*://*.copilot.microsoft.com/*`

(`optional_host_permissions` alone broke Side Panel Scan — no `activeTab` gesture — so required hosts are used for MVP.)

DeepSeek: open URL only (no host_permissions until insert/send is added).

## Privacy policy must say

- Extension prepares video URL and optional captions  
- At the user’s request, opens a chosen free chat and may insert that text into the chat box and send it (where supported)  
- Clipboard is used as a backup if insert/send fails, and for chats without insert yet  
- No own analysis server; no developer API keys  
- **YouTube caption fallback:** if captions are not available on the page, the extension may send the public video URL to TranscribeYouTube to retrieve existing captions (no audio upload; not used for other platforms)  
- **TikTok / Facebook transcript helpers:** if the page has no usable transcript, the extension may briefly open tiktoktranscript.io or facebooktotranscript.com with the public video URL, read the transcript from that page, then close the tab (no API keys; no audio upload from the extension for those helpers)  
- **Optional Facebook TurboScribe backup (Settings, default off):** if facebooktotranscript fails, the extension may resolve a public Facebook video file via TurboScribe’s downloader, submit that file to TurboScribe’s free transcribe UI (requires the user’s free TurboScribe sign-in; up to 3 free transcripts/day), read the transcript, then close the helper tab — still no developer API keys  
- Data is processed under the user’s chat-account terms once sent  

## Assets

- Icons: `extension/icons/`  
- Screenshots: large Side Panel steps (Scan → choose chat → Open → insert/send or paste fallback)
