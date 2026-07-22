# Level 10 — Overlay, Multiprompt, Transcript toggle

**Status:** `done`  
**Parent:** [`../MULTILEVEL-IMPLEMENTATION-PLAN.md`](../MULTILEVEL-IMPLEMENTATION-PLAN.md)  
**Estimate:** 2–4 days  
**Depends on:** [L7](L7-hardening.md), [L8](L8-chat-picker.md)  
**Specs:** [`../SPEC-FACT-CHECK.md`](../SPEC-FACT-CHECK.md), [`../SPEC-TRANSCRIPT.md`](../SPEC-TRANSCRIPT.md), [`../PRODUCT.md`](../PRODUCT.md)

## Goal

Senior-friendly visibility while the extension works (overlay + cancel), reliable handoff for long transcripts via multiprompt (no answer scraping), and an optional Settings toggle to disable automatic transcript capture (default on).

## Tasks

- [x] Work overlay on video tab (capture) and chat tab (insert/multiprompt) with Cancel
- [x] Conservative per-chat message limits + `splitIntoHandoffMessages`
- [x] Pending handoff as message sequence; wait for composer ready between parts
- [x] Runtime “message too long” detection → re-chunk when needed
- [x] Settings `enableTranscript` (default `true`); skip enrich / in-page transcript when off
- [x] Manual transcript in Side Panel still works when auto-transcript is off
- [x] de/en strings; unit tests for multiprompt split

## Exit criteria

- [x] Long YouTube transcript → ChatGPT multiprompt without “Message is too long” (unit + code path)
- [x] Cancel mid-handoff stops further injects and clears overlay
- [x] Transcript toggle off → URL-only package (manual paste still OK)
- [x] No chat answer scraping; DOM composer/send signals only
