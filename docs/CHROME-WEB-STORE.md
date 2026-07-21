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
| `clipboardWrite` (if declared) | Copy URL + captions for paste into chat |
| `host_permissions` (YouTube, TikTok, X, Facebook, Instagram) | Read captions/metadata on those video pages; required for Side Panel “Scan” without an extra permission prompt |
| Opens chatgpt.com / gemini.google.com | User’s fact-check happens there |

### Host patterns (manifest)

Declared under `host_permissions` for the five required platforms:

- `*://*.youtube.com/*`, `*://youtu.be/*`
- `*://*.tiktok.com/*`
- `*://*.x.com/*`, `*://*.twitter.com/*`
- `*://*.facebook.com/*`, `*://*.fb.com/*`, `*://*.fb.watch/*`
- `*://*.instagram.com/*`

(`optional_host_permissions` alone broke Side Panel Scan — no `activeTab` gesture — so required hosts are used for MVP.)

## Privacy policy must say

- Extension copies video URL and optional captions to the clipboard  
- Opens ChatGPT Custom GPT and/or Gemini web at the user’s request  
- No own analysis server; no developer API keys  
- Data leaves the device when the user pastes into ChatGPT/Gemini under their account terms  

## Assets

- Icons: `extension/icons/`  
- Screenshots: large Side Panel steps (Copy → Open → Paste)
