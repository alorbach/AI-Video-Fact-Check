# Level 7 — Handoff hardening

**Status:** `todo`  
**Parent:** [`../MULTILEVEL-IMPLEMENTATION-PLAN.md`](../MULTILEVEL-IMPLEMENTATION-PLAN.md)  
**Estimate:** ~1 week  
**Depends on:** [L6](L6-multi-model.md)  
**Unlocks:** [L8](L8-store-release.md)

## Goal

Reliable clipboard/open-tab flow; clear recovery when ChatGPT/Gemini blocks or clipboard fails.

## Tasks

- [ ] Clipboard permission / failure recovery (“Copy again” always visible)
- [ ] Detect empty package / missing URL before open
- [ ] Optional: keep last package in `chrome.storage` (opt-in)
- [ ] Graceful message if chat URL fails to open
- [ ] Unit tests for paste-package builder + detectors
- [ ] Manual checklist across Chrome profiles (logged out ChatGPT → tell user to sign in)

## Exit criteria

- [ ] Common failure paths have plain-language recovery (de/en)
- [ ] No silent failures on clipboard deny
