# Chrome Web Store — preparation notes

Fill before **Level 8**.

## Listing (draft)

- **Name (EN):** Video Fact-Check  
- **Name (DE):** Video-Faktencheck  
- **Summary (EN):** Prepare a video link and open ChatGPT Video-Faktencheck (or free Gemini) — plain language, no setup.  
- **Summary (DE):** Video-Link vorbereiten und ChatGPT Video-Faktencheck (oder kostenloses Gemini) öffnen — verständlich, ohne Setup.  
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
| `host_permissions` (chatgpt.com, gemini.google.com) | Insert prepared text into the chat box and send at the user’s request |
| Opens chatgpt.com / gemini.google.com | User’s fact-check happens there |

### Host patterns (manifest)

Declared under `host_permissions` for the five required platforms:

- `*://*.youtube.com/*`, `*://youtu.be/*`
- `*://*.tiktok.com/*`
- `*://*.x.com/*`, `*://*.twitter.com/*`
- `*://*.facebook.com/*`, `*://*.fb.com/*`, `*://*.fb.watch/*`
- `*://*.instagram.com/*`
- `*://chatgpt.com/*`, `*://*.chatgpt.com/*`
- `*://gemini.google.com/*`

(`optional_host_permissions` alone broke Side Panel Scan — no `activeTab` gesture — so required hosts are used for MVP.)

## Privacy policy must say

- Extension prepares video URL and optional captions  
- At the user’s request, opens ChatGPT Custom GPT and/or Gemini web and may insert that text into the chat box and send it  
- Clipboard is used as a backup if insert/send fails  
- No own analysis server; no developer API keys  
- Data is processed under the user’s ChatGPT/Gemini account terms once sent  

## Assets

- Icons: `extension/icons/`  
- Screenshots: large Side Panel steps (Scan → Open GPT/Gemini → insert/send or paste fallback)
