# Level 5 — Required platforms (full adapters)

**Status:** `todo`  
**Parent:** [`../MULTILEVEL-IMPLEMENTATION-PLAN.md`](../MULTILEVEL-IMPLEMENTATION-PLAN.md)  
**Estimate:** 1–2 weeks  
**Depends on:** [L4](L4-mode-b-polish.md)  
**Unlocks:** [L6](L6-multi-model.md)  
**Specs:** [`../SPEC-TRANSCRIPT.md`](../SPEC-TRANSCRIPT.md)

## Goal

All **five required platforms** have solid adapters: best-effort captions/post text + reliable URL → same chat handoff.

Required set:

1. YouTube (+ Shorts) — polish beyond L2  
2. TikTok  
3. X (Twitter)  
4. Facebook (videos + Reels)  
5. Instagram (Reels)

Optional later (not required for MVP): Vimeo, generic HTML5.

## Tasks

1. [ ] TikTok adapter (captions/post text when available)  
2. [ ] X adapter (post text / subtitles when available)  
3. [ ] Facebook adapter (Reels + feed video URL/metadata)  
4. [ ] Instagram adapter (Reels URL/metadata/caption)  
5. [ ] YouTube Shorts edge cases  
6. [ ] `optional_host_permissions` for each host; document in [`../CHROME-WEB-STORE.md`](../CHROME-WEB-STORE.md)  
7. [ ] Fill [`../test-urls.md`](../test-urls.md) with one public test URL per required platform  

Ladder: captions → post text → page URL → manual transcript.

## Exit criteria

- [ ] **All five** required platforms green on [`../test-urls.md`](../test-urls.md)
- [ ] Each ends in clipboard PastePackage + Custom GPT open
- [ ] Side Panel names the detected platform in de/en
