# Level 8 — Chrome Web Store release

**Status:** `todo`  
**Parent:** [`../MULTILEVEL-IMPLEMENTATION-PLAN.md`](../MULTILEVEL-IMPLEMENTATION-PLAN.md)  
**Estimate:** 3–5 days + review wait  
**Depends on:** [L7](L7-hardening.md)  
**Specs:** [`../PRODUCT.md`](../PRODUCT.md), [`../CHROME-WEB-STORE.md`](../CHROME-WEB-STORE.md)

## Goal

Publish an extension that only prepares content and opens ChatGPT Custom GPT / free Gemini — disclose that clearly.

## Pre-submit checklist

- [ ] Privacy policy: clipboard data, opens chatgpt.com / gemini.google.com, no our analysis server
- [ ] Single purpose: help users fact-check videos via known free chats
- [ ] Permission justifications (contextMenus, clipboardWrite/storage, optional hosts for captions, sidePanel)
- [ ] Icons + 1280×800 screenshots (large guide UI)
- [ ] Store listing DE + EN — mention Custom GPT + optional Gemini; no “API”
- [ ] Clean ZIP (no `.env`, no unused `backend/`)
- [ ] [`../CHROME-WEB-STORE.md`](../CHROME-WEB-STORE.md) updated

## Exit criteria

- [ ] Approved (or unlisted) install works: handoff to Custom GPT without developer setup
