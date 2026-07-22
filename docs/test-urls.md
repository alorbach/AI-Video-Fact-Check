# Manual test URLs

One public URL per **required** platform. Prefer short videos; captions when possible.  
Do not commit private or login-walled content.

Replace any URL that goes private or 404s — keep the table filled.

## Required platforms

| Platform | URL | Notes |
|---|---|---|
| YouTube | https://www.youtube.com/watch?v=iEa1a9Hip8E | Preferred L5 test (Hopf & Kettner). Timedtext often needs PoToken → expect **description as post text** or captions when available |
| YouTube Shorts | https://www.youtube.com/shorts/kITClgosbyA | OpenAI GPT-4o Short; confirm Scan + platform name |
| TikTok | https://www.tiktok.com/@tiktok/video/7238789584926477594 | Official account sample; post text when exposed |
| X / Twitter | _(open any public **video** post on x.com while logged in)_ | Bot checks often 404 sample IDs; paste a live video status URL here when you find one |
| Facebook | https://www.facebook.com/facebook/videos/10153231379946729/ | Public Facebook video; URL package minimum |
| Instagram | https://www.instagram.com/reel/C7QqY0oIQnK/ | Swap if login-walled / 404; need a public Reel |

## Manual checklist (per URL)

1. Open URL in Chrome → open Side Panel → **Scan page** (`Seite prüfen`)
2. Platform name shown (de/en)
3. Link looks stable (canonical when possible)
4. Captions / post text included when the page exposes them; otherwise “No — chat can still use the link”
5. **Open Video Fact-Check GPT** (or Gemini) → insert/send into the chat; if automation fails, paste from clipboard works

**Detection pass (2026-07-21):** YouTube, Shorts, TikTok, X, Facebook, Instagram — all recognized in Side Panel.

### YouTube expected on `iEa1a9Hip8E`

- Platform: YouTube  
- Link: `https://www.youtube.com/watch?v=iEa1a9Hip8E`  
- Text: **Ja — Beitragstext enthalten** (video description) and/or captions if timedtext/engagement panel works in your session

## Profile / login checklist (L7)

Use a second Chrome profile (or Incognito with the unpacked extension loaded) so ChatGPT / Gemini are **logged out**.

| Step | Expect |
|---|---|
| Scan a test URL above, then **Open Video Fact-Check GPT** | Chat tab opens; Side Panel shows **sign-in** guidance (not a silent failure) |
| Sign in in that tab, then open GPT again from the panel | Insert/send (or paste fallback) works |
| Repeat with **Open Gemini** while logged out of Google | Same: clear sign-in message, then success after login |
| Block pop-ups / force tab create to fail (if reproducible) | Distinct “could not open chat tab” message; clipboard still has text |
| Deny clipboard (site permission) then open chat | “Copy again” recovery — no silent fail |
| Settings → enable “Remember last video…”, scan, restart Chrome | Last package restored in Side Panel; turn off clears storage |

## Optional later

| Platform | URL | Notes |
|---|---|---|
| Vimeo | _(add)_ | |
| Generic HTML5 | _(add)_ | Local fixture page later |
