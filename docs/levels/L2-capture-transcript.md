# Level 2 — Captions & paste package

**Status:** `todo`  
**Parent:** [`../MULTILEVEL-IMPLEMENTATION-PLAN.md`](../MULTILEVEL-IMPLEMENTATION-PLAN.md)  
**Estimate:** 3–5 days  
**Depends on:** [L1](L1-local-skeleton.md)  
**Unlocks:** [L3](L3-fact-check-mvp.md)  
**Specs:** [`../SPEC-TRANSCRIPT.md`](../SPEC-TRANSCRIPT.md)

## Goal

From the current tab: detect video, collect URL + captions when possible, build a `PastePackage`.

**Required platforms (product):** YouTube, TikTok, X, Facebook, Instagram.  
**This level:** YouTube captions path solid; detect + URL package for all five.

## Tasks

1. [ ] Content script: platform detector for **YouTube, TikTok, X, Facebook, Instagram**
2. [ ] Caption extractor for **YouTube** (timedtext / `<track>`)
3. [ ] `PastePackage` builder (URL + transcript or “not available”)
4. [ ] Side Panel shows platform + what was found (URL / captions yes-no) in plain de/en
5. [ ] Manual fallback: user can paste their own transcript into the panel
6. [ ] For TikTok / X / Facebook / Instagram: at least stable **URL** in the package (richer captions in L5)

## Exit criteria

- [ ] YouTube with captions → package includes transcript text
- [ ] YouTube without captions → package still has URL + clear note
- [ ] TikTok, X, Facebook, Instagram pages → detector recognizes platform + URL packaged
- [ ] No STT server / Whisper / API keys involved
