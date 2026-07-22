# Level 7 — Handoff hardening

**Status:** `in_progress`  
**Parent:** [`../MULTILEVEL-IMPLEMENTATION-PLAN.md`](../MULTILEVEL-IMPLEMENTATION-PLAN.md)  
**Estimate:** ~1 week  
**Depends on:** [L6](L6-multi-model.md)  
**Unlocks:** [L8](L8-store-release.md)

## Goal

Reliable open-tab + insert/send flow (clipboard as fallback); clear recovery when ChatGPT/Gemini blocks, the composer is missing, or clipboard fails.

## Tasks

- [x] Clipboard permission / failure recovery (“Copy again” on fail / inject-failed states)
- [x] Detect empty package / missing URL before open
- [x] Keep last package in `chrome.storage.session` (always on for current session; opt-in persist still open)
- [ ] Distinct plain-language message if chat tab fails to open (`tabs.create` / no tab id)
- [x] Unit tests for paste-package builder + detectors (`shared/*.test.ts`)
- [ ] Manual checklist across Chrome profiles (logged out ChatGPT/Gemini → tell user to sign in)
- [ ] Dedicated login-wall copy when inject reports `login-required` (de/en; today reuses generic inject-failed / paste fallback)
- [ ] Optional: opt-in remember last package beyond the session (`chrome.storage.sync` / local)

## Already shipped (hardening beyond the original L7 list)

- Insert/send into ChatGPT + Gemini with retries (`chatInject.ts` / `chatInjectMain.ts`)
- Multi-tab pending handoff map in `chrome.storage.session`
- Side Panel phases: inserting / inject_ok / inject_failed / clipboard_failed
- No silent clipboard deny — guide shows recovery + Copy again

## Exit criteria

- [ ] Common failure paths have plain-language recovery (de/en) — including login wall + tab-open failure
- [x] No silent failures on clipboard deny
