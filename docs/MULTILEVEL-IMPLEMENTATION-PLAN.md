# Multilevel Implementation Plan — AI Video Fact-Check

**Product:** Chrome extension that prepares a video URL/transcript and opens a **free user chat** for the fact-check.  
**Author / Credits:** [Andre Lorbach](https://github.com/alorbach/)  
**Repo:** https://github.com/alorbach/AI-Video-Fact-Check  
**Primary chat:** [Video Faktencheck GPT](https://chatgpt.com/g/g-6a5e1494f814819181208da5d30ab4ae-video-faktencheck)  
**Secondary (free):** [Google Gemini web](https://gemini.google.com/)  
**Specs:** [`PRODUCT.md`](PRODUCT.md) · [`SPEC-TRANSCRIPT.md`](SPEC-TRANSCRIPT.md) · [`SPEC-FACT-CHECK.md`](SPEC-FACT-CHECK.md)

This file is the **overall roadmap and status board**. Level detail: [`levels/`](levels/).

**How to maintain status**

1. Update the **Status board** (`todo` → `in_progress` → `done` / `blocked`).
2. Mirror status at the top of the level file.
3. Check off tasks/exit criteria in the level file.
4. Do not start the next level until exit criteria pass.

---

## Status board

| Level | Name | Status | Detail file |
|:---:|---|---|---|
| L0 | Foundation | **done** | [`levels/L0-foundation.md`](levels/L0-foundation.md) |
| L1 | Extension skeleton | **done** | [`levels/L1-local-skeleton.md`](levels/L1-local-skeleton.md) |
| L2 | Captions & paste package | **done** | [`levels/L2-capture-transcript.md`](levels/L2-capture-transcript.md) |
| L3 | Custom GPT handoff MVP | **done** | [`levels/L3-fact-check-mvp.md`](levels/L3-fact-check-mvp.md) |
| L4 | Guide UX + a11y | **done** | [`levels/L4-mode-b-polish.md`](levels/L4-mode-b-polish.md) |
| L5 | Required platforms (YT, TikTok, X, FB, IG) | **done** | [`levels/L5-platforms.md`](levels/L5-platforms.md) |
| L6 | Free Gemini (+ more free chats) | **done** | [`levels/L6-multi-model.md`](levels/L6-multi-model.md) |
| L7 | Handoff hardening | **in_progress** | [`levels/L7-hardening.md`](levels/L7-hardening.md) |
| L8 | Chrome Web Store | todo | [`levels/L8-store-release.md`](levels/L8-store-release.md) |

**Current level:** L7 — Handoff hardening  
**Last updated:** 2026-07-22  
**Next action:** Finish remaining L7 — login-wall / tab-open copy, profile checklist, optional persist package.

Status values: `todo` · `in_progress` · `done` · `blocked`

---

## Level map

```text
L0  Foundation           Docs, agents, git, packages
L1  Extension skeleton   Loadable MV3 + Side Panel guide shell
L2  Captions & package   URL + captions → PastePackage
L3  Custom GPT handoff   Clipboard + open Video-Faktencheck GPT
L4  Guide UX + a11y      Large steps, de/en, senior-friendly
L5  Platforms            YouTube, TikTok, X, Facebook, Instagram (required)
L6  Free Gemini (+…)     gemini.google.com handoff (no API keys)
L7  Handoff hardening    Insert/send reliability, clipboard fallback, errors
L8  Store release        Privacy, assets, publish
```

---

## Architecture decision (binding)

```text
[Chrome Extension MV3]
  detect video → captions/URL → PastePackage
  open chat tab + insert/send (clipboard backup if insert fails)
  Side Panel = step-by-step guide (de/en)
           │
           ▼
[User’s free chat — no our server]
  1) ChatGPT Custom GPT (primary)
  2) Gemini web (secondary, free)
```

| Do | Don’t |
|---|---|
| Open Custom GPT / Gemini in the user’s browser | Own LLM/STT backend for analysis |
| Insert/send into the open chat; clipboard as fallback (maintain selectors) | API keys (OpenAI/Anthropic/Gemini API) |
| In-browser captions when possible | Scrape chat answers back into the extension |
| Free end-user chat products only | Paid developer APIs |

No analysis backend in the repo. Extension-only product path.

---

## 0. Research summary (decisions)

### 0.1 Chrome Extension (MV3)

Sources: [Store requirements 2026](https://extensionbooster.net/blog/chrome-web-store-publishing-requirements-2026-complete-checklist/), [Side Panel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel).

| Decision | Why |
|---|---|
| Manifest V3 | Required for new submissions |
| Service worker + `chrome.storage` | Workers sleep; persist guide state |
| No remote code / no `eval` | Store policy |
| Least privilege | Review risk |
| Side Panel as guide UI | Clear steps beside the video |
| No secrets in the extension | Nothing to hide — no API keys at all |

### 0.2 UI for older / non-technical users

| Rule | Target |
|---|---|
| Large type | ≥ 18px; zoom 200% |
| Big targets | ≥ 44×44 px; labeled buttons |
| One job at a time | “Scan → Open chat → read answer” |
| Plain language | No “API”, “Backend”, “Token” |
| Persistent help | User dismisses messages |

### 0.3 “Multi-model” = multiple free chat websites

Not adapter SDKs. A small list of `ChatTarget`s that open free web UIs. Primary = Custom GPT; L6 adds Gemini web. Further free chats only if usable without API keys.

### 0.4 Multi-agent coding

| File | Role |
|---|---|
| `AGENTS.md` | Shared rules |
| `CLAUDE.md` | Claude entry |
| `docs/levels/` | Per-level work |
| This file | Status board |

---

## Cross-cutting

### A. i18n

`_locales/de` + `_locales/en`; paste-package instruction follows UI language.

### B. Privacy

Clipboard / insert-send + user-chosen chat only. Document ChatGPT/Gemini as destinations in the store privacy form. Credits → https://github.com/alorbach/

### C. Testing

| Layer | What |
|---|---|
| Unit | detectors, paste-package builder (`shared/` tests) |
| Manual | YouTube, TikTok, X, Facebook, Instagram → Custom GPT/Gemini insert+send (paste if automation fails) |
| Store | permissions + privacy disclosure |

### D. Calendar (solo, rough)

| Week | Level |
|---|---|
| 0 | L0 |
| 1 | L1–L3 |
| 2 | L4 |
| 3–4 | L5–L6 |
| 5 | L7–L8 |

---

## Definition of Done

See [`PRODUCT.md`](PRODUCT.md) MVP checklist (L2–L4 primarily).

---

## What not to build

- Own analysis backend / job API / Whisper server  
- OpenAI / Anthropic / Gemini **API** integrations  
- API-key settings screens  
- Monetization / accounts for our product  
- Scraping ChatGPT/Gemini answers back into the extension  
- Cursor-only rules without `AGENTS.md`
