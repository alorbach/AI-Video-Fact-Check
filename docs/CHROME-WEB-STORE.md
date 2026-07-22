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
- Data is processed under the user’s chat-account terms once sent  

## Assets

- Icons: `extension/icons/`  
- Screenshots: large Side Panel steps (Scan → choose chat → Open → insert/send or paste fallback)
