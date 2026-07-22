# Level 7 — Handoff hardening

**Status:** `done`  
**Parent:** [`../MULTILEVEL-IMPLEMENTATION-PLAN.md`](../MULTILEVEL-IMPLEMENTATION-PLAN.md)  
**Estimate:** ~1 week  
**Depends on:** [L6](L6-multi-model.md)  
**Unlocks:** [L8](L8-chat-picker.md)

## Goal

Reliable open-tab + insert/send flow (clipboard as fallback); clear recovery when ChatGPT/Gemini blocks, the composer is missing, or clipboard fails.

## Tasks

- [x] Clipboard permission / failure recovery (“Copy again” on fail / inject-failed states)
- [x] Detect empty package / missing URL before open
- [x] Keep last package in `chrome.storage.session` (always on for current session)
- [x] Distinct plain-language message if chat tab fails to open (`tabs.create` / no tab id)
- [x] Unit tests for paste-package builder + detectors (`shared/*.test.ts`)
- [x] Manual checklist across Chrome profiles (logged out ChatGPT/Gemini → tell user to sign in) — [`../test-urls.md`](../test-urls.md) Profile / login checklist
- [x] Dedicated login-wall copy when inject reports `login-required` (de/en)
- [x] Opt-in remember last package beyond the session (`chrome.storage.local` + Options checkbox)

## Already shipped (hardening beyond the original L7 list)

- Insert/send into ChatGPT + Gemini with retries (`chatInject.ts` / `chatInjectMain.ts`)
- Multi-tab pending handoff map in `chrome.storage.session`
- Side Panel phases: inserting / inject_ok / inject_failed / login_required / tab_open_failed / clipboard_failed
- No silent clipboard deny — guide shows recovery + Copy again
- `CHAT_INJECT_RESULT.reason` passed through for login vs generic inject failure

## Exit criteria

- [x] Common failure paths have plain-language recovery (de/en) — including login wall + tab-open failure
- [x] No silent failures on clipboard deny
