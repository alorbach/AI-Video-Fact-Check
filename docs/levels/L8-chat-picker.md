# Level 8 — Chat picker & more free chats

**Status:** `done`  
**Parent:** [`../MULTILEVEL-IMPLEMENTATION-PLAN.md`](../MULTILEVEL-IMPLEMENTATION-PLAN.md)  
**Estimate:** 2–4 days  
**Depends on:** [L7](L7-hardening.md)  
**Unlocks:** [L9](L9-store-release.md)  
**Specs:** [`../SPEC-FACT-CHECK.md`](../SPEC-FACT-CHECK.md), [`../PRODUCT.md`](../PRODUCT.md)

## Goal

Replace dual Open GPT / Open Gemini buttons with a **combobox + one Open chat** action. Add free consumer web chats: **Claude**, **Microsoft Copilot**, **DeepSeek**. Persist selection in Options (`defaultChat`).

Still **no API keys**. Insert+send for Custom GPT, Gemini, Claude, and Microsoft Copilot; DeepSeek open + clipboard (master prompt) until inject is hardened later.

## Tasks

1. [x] `ChatTarget` registry: Claude, Copilot, DeepSeek (`supportsInject` flag)
2. [x] Side Panel: combobox + primary Open chat; sync `chrome.storage.sync.defaultChat`
3. [x] Options: same five engines in default-chat select
4. [x] Claude + Copilot insert+send (manifest hosts + selectors); DeepSeek clipboard-only
5. [x] Context menu: check with stored default + copy-only
6. [x] Docs: PRODUCT, SPEC-FACT-CHECK, plan, README, AGENTS, store notes, test-urls
7. [x] Unit tests for paste package / registry; manual checklist below

## Exit criteria

- [x] User picks AI in Side Panel combobox; choice persists in Options
- [x] Custom GPT, Gemini, Claude, Copilot: insert+send (clipboard fallback)
- [x] DeepSeek: tab opens + clipboard with master prompt; clear paste guidance
- [x] Settings never ask for API keys
- [x] Only free consumer web chats; least privilege (no DeepSeek host_permissions until inject)

## Manual checklist

| Step | Expect |
|---|---|
| Combobox shows five engines; change selection | Options `defaultChat` updates; reopen Side Panel keeps choice |
| Open with Video-Faktencheck GPT / Gemini | Insert+send as before |
| Open with Claude (logged in) | Insert+send into claude.ai |
| Open with Claude (logged out) | Clear sign-in guidance |
| Open with Copilot (logged in) | Insert+send into copilot.microsoft.com |
| Open with DeepSeek | Tab opens; clipboard has master prompt; guide asks to paste |
| Context menu “Check video” | Uses stored default chat |
| Copy again | Re-copies package for last selected target |
