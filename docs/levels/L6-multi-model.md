# Level 6 — Free Gemini (+ more free chats)

**Status:** `done`  
**Parent:** [`../MULTILEVEL-IMPLEMENTATION-PLAN.md`](../MULTILEVEL-IMPLEMENTATION-PLAN.md)  
**Estimate:** 2–4 days  
**Depends on:** [L3](L3-fact-check-mvp.md) (can parallel L5)  
**Unlocks:** [L7](L7-hardening.md)  
**Specs:** [`../SPEC-FACT-CHECK.md`](../SPEC-FACT-CHECK.md)

## Goal

Offer a second **free web chat** for users who prefer Google: [Gemini](https://gemini.google.com/).

Still **no API keys**, no Gemini Developer API.

## Tasks

1. [x] `ChatTarget` registry (Custom GPT default, Gemini web secondary)
2. [x] Menu/button: “Mit Gemini öffnen (kostenlos)” / “Open in Gemini (free)”
3. [x] Gemini paste package: full locale-matched master prompt + URL/transcript (Custom GPT keeps short ask)
4. [x] Options: remember last chosen chat (persists `defaultChat` on successful handoff)
5. [x] Only add further targets if they are free consumer web chats (no paid APIs) — none added beyond Gemini in L6

**Follow-up:** [L8](L8-chat-picker.md) replaces dual buttons with a combobox and adds Claude / Copilot / DeepSeek.

## Exit criteria

- [x] User can hand off to Custom GPT **or** Gemini web with the same package material (Gemini includes embedded master prompt)
- [x] Settings never ask for API keys
- [x] Labels make clear both options use the user’s own free login
