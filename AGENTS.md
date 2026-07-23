# AGENTS.md — AI Video Fact-Check

Canonical instructions for **all** coding agents. Keep lean; details in `docs/`.

## Project

Chrome MV3 extension that helps everyday users (esp. older adults) fact-check videos by preparing a URL/transcript and opening a **free user chat**. Languages: **German** and **English**. Credits: [Andre Lorbach](https://github.com/alorbach/). Repo: https://github.com/alorbach/AI-Video-Fact-Check

**Primary:** https://chatgpt.com/g/g-6a5e1494f814819181208da5d30ab4ae-video-faktencheck  
**Also free:** Gemini, Claude, Microsoft Copilot, DeepSeek (Side Panel combobox / Settings)

## Read first

1. `docs/MULTILEVEL-IMPLEMENTATION-PLAN.md` — status board  
2. `docs/levels/L*.md` — current level  
3. `docs/PRODUCT.md`, `docs/SPEC-TRANSCRIPT.md`, `docs/SPEC-FACT-CHECK.md`  
4. `README.md`

## Repo layout

```text
extension/   Chrome MV3 (primary product)
shared/      Shared types (PastePackage, ChatTarget, …)
docs/        Plans and specs
```

## Non-negotiables

- Manifest **V3**; no remote code; **no API keys** anywhere.
- Analysis **only** via opening free consumer chats (Custom GPT, Gemini, Claude, Copilot, DeepSeek).
- **Do not** build an LLM/STT backend, OpenAI/Anthropic/Gemini API clients, or key settings UI.
- Handoff may **insert + send** into inject-supported chats (maintain selectors when UIs change). Still **no** scraping of chat answers.
- Clipboard remains a fallback if insert/send fails (required path for DeepSeek until inject exists).
- UI: senior-friendly, plain language, Side Panel as step guide + chat combobox; de + en.
- Required platforms: **YouTube, TikTok, X, Facebook, Instagram** (see `docs/SPEC-TRANSCRIPT.md`).
- No DRM/captcha bypass; no social cookie forwarding.
- Minimal permissions; declare inject hosts (ChatGPT/Gemini/Claude/Copilot) for insert/send; social hosts for captions.
- **Exception (opt-in):** `enableTurboScribeFacebook` (default off) may fetch a public Facebook mp4 via TurboScribe’s downloader and submit it to TurboScribe’s free transcribe UI — still no API keys / no own STT backend.

## Commands

```bash
npm install
cd extension && npm run build   # load extension/dist unpacked
npm test
```

## Coding conventions

- TypeScript strict; types in `shared/`.
- Typed message unions between SW / content / sidepanel.
- One multilevel **Level** per focused change set.
- User-facing copy: never say “API”, “Backend”, “Token”.

## Agent file policy

Shared rules → this file. Claude-only → `CLAUDE.md`. Cursor-only → `.cursor/rules/`.
