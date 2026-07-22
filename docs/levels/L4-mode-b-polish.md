# Level 4 — Guide UX + accessibility

**Status:** `done`  
**Parent:** [`../MULTILEVEL-IMPLEMENTATION-PLAN.md`](../MULTILEVEL-IMPLEMENTATION-PLAN.md)  
**Estimate:** 2–3 days  
**Depends on:** [L3](L3-fact-check-mvp.md)  
**Unlocks:** [L5](L5-platforms.md)

## Goal

Make the handoff understandable for older / non-technical users. Still only Custom GPT (+ later Gemini in L6).

## Tasks

1. [x] Large primary actions (Open GPT / Open Gemini) + Copy again
2. [x] Font-size preference (normal / large)
3. [x] Keyboard navigation + focus rings
4. [x] Error copy in plain language (“Could not copy — tap Copy again”)
5. [x] Short “How to read the answer” tip (score 1–10, sources)
6. [x] de + en complete for all guide strings

## Exit criteria

- [x] a11y smoke: keyboard-only + zoom 200%
- [x] No jargon (API, backend, token) in the UI
- [x] A first-time user can finish paste/send without extra docs

## Notes

- Side Panel guide: Open Video Fact-Check GPT / Open Gemini + Copy again (clipboard fallback).
- Options: default chat + text size (`chrome.storage.sync.fontSize`).
- Skip link + `:focus-visible` on buttons, inputs, selects, and links.
- Tip card explains score 1–10, traffic-light bands, and sources (de/en).
