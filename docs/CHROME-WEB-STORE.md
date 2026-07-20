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
| Host permissions (optional) | Captions/metadata on YouTube, TikTok, X, Facebook, Instagram |
| Opens chatgpt.com / gemini.google.com | User’s fact-check happens there |

## Privacy policy must say

- Extension copies video URL and optional captions to the clipboard  
- Opens ChatGPT Custom GPT and/or Gemini web at the user’s request  
- No own analysis server; no developer API keys  
- Data leaves the device when the user pastes into ChatGPT/Gemini under their account terms  

## Assets

- Icons: `extension/icons/`  
- Screenshots: large Side Panel steps (Copy → Open → Paste)
