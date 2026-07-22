# Level 9 — Chrome Web Store release

**Status:** `todo`  
**Parent:** [`../MULTILEVEL-IMPLEMENTATION-PLAN.md`](../MULTILEVEL-IMPLEMENTATION-PLAN.md)  
**Estimate:** 3–5 days + review wait  
**Depends on:** [L8](L8-chat-picker.md)  
**Specs:** [`../PRODUCT.md`](../PRODUCT.md), [`../CHROME-WEB-STORE.md`](../CHROME-WEB-STORE.md)

## Goal

Publish an extension that only prepares content and opens free user chats (Custom GPT, Gemini, Claude, Copilot, DeepSeek) — disclose that clearly.

## Pre-submit checklist

- [ ] Privacy policy: clipboard data, opens chatgpt.com / gemini.google.com / claude.ai (and opens Copilot/DeepSeek URLs), no our analysis server
- [ ] Single purpose: help users fact-check videos via known free chats
- [ ] Permission justifications (contextMenus, clipboardWrite/storage, optional hosts for captions, sidePanel, chat inject hosts)
- [ ] Icons + 1280×800 screenshots (large guide UI with chat picker)
- [ ] Store listing DE + EN — mention chat picker + free chats; no “API”
- [ ] Clean ZIP (no `.env`, no `node_modules`)
- [ ] [`../CHROME-WEB-STORE.md`](../CHROME-WEB-STORE.md) updated

## Exit criteria

- [ ] Approved (or unlisted) install works: handoff to chosen free chat without developer setup
