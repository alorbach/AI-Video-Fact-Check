# Level 3 — Custom GPT handoff MVP

**Status:** `done`  
**Parent:** [`../MULTILEVEL-IMPLEMENTATION-PLAN.md`](../MULTILEVEL-IMPLEMENTATION-PLAN.md)  
**Estimate:** 2–4 days  
**Depends on:** [L2](L2-capture-transcript.md)  
**Unlocks:** [L4](L4-mode-b-polish.md)  
**Specs:** [`../SPEC-FACT-CHECK.md`](../SPEC-FACT-CHECK.md), [`../PRODUCT.md`](../PRODUCT.md)

## Goal

One-click (or few-click) handoff to the Video-Faktencheck Custom GPT in the user’s ChatGPT session.

**Target URL:** https://chatgpt.com/g/g-6a5e1494f814819181208da5d30ab4ae-video-faktencheck

## Tasks

1. [x] Copy `PastePackage` text to clipboard
2. [x] Open Custom GPT URL in a new tab
3. [x] Side Panel steps: “Copied → Chat opened → Paste (Ctrl+V) → Send”
4. [x] Context menu / primary button: “Mit Video-Faktencheck GPT öffnen”
5. [x] “Copy again” if clipboard failed

## Exit criteria

- [x] From a supported page (start with YouTube; all five platforms by L5), user can complete a fact-check in the Custom GPT without typing the URL/transcript by hand (paste only)
- [x] Works with a normal free/logged-in ChatGPT account (no API key screens)
- [x] No own analysis backend called
