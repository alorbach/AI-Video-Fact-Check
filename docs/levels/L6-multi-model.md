# Level 6 — Free Gemini (+ more free chats)

**Status:** `todo`  
**Parent:** [`../MULTILEVEL-IMPLEMENTATION-PLAN.md`](../MULTILEVEL-IMPLEMENTATION-PLAN.md)  
**Estimate:** 2–4 days  
**Depends on:** [L3](L3-fact-check-mvp.md) (can parallel L5)  
**Unlocks:** [L7](L7-hardening.md)  
**Specs:** [`../SPEC-FACT-CHECK.md`](../SPEC-FACT-CHECK.md)

## Goal

Offer a second **free web chat** for users who prefer Google: [Gemini](https://gemini.google.com/).

Still **no API keys**, no Gemini Developer API.

## Tasks

1. [ ] `ChatTarget` registry (Custom GPT default, Gemini web secondary)
2. [ ] Menu/button: “Mit Gemini öffnen (kostenlos)” / “Open in Gemini (free)”
3. [ ] Gemini paste package: same URL/transcript + short style instruction (score 1–10, plain language)
4. [ ] Options: remember last chosen chat
5. [ ] Only add further targets if they are free consumer web chats (no paid APIs)

## Exit criteria

- [ ] User can hand off to Custom GPT **or** Gemini web with the same package
- [ ] Settings never ask for API keys
- [ ] Labels make clear both options use the user’s own free login
