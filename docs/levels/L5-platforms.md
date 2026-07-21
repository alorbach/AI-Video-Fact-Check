# Level 5 — Required platforms (full adapters)

**Status:** `done`  
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

1. [x] TikTok adapter (captions/post text when available)  
2. [x] X adapter (post text / subtitles when available)  
3. [x] Facebook adapter (Reels + feed video URL/metadata)  
4. [x] Instagram adapter (Reels URL/metadata/caption)  
5. [x] YouTube Shorts edge cases  
6. [x] Host permissions for each required platform; document in [`../CHROME-WEB-STORE.md`](../CHROME-WEB-STORE.md)  
   _(MVP uses required `host_permissions` — optional-only broke Side Panel Scan)_  
7. [x] Fill [`../test-urls.md`](../test-urls.md) with one public test URL per required platform  

Ladder: captions → post text → page URL → manual transcript.

## Exit criteria

- [x] **All five** required platforms green on [`../test-urls.md`](../test-urls.md) — **detection verified 2026-07-21** (YT, Shorts, TikTok, X, FB, IG)  
- [x] Each ends in clipboard PastePackage + Custom GPT open _(shared handoff path)_  
- [x] Side Panel names the detected platform in de/en  

## Implementation notes (2026-07-21)

- Adapters: `extension/src/adapters/{tiktok,x,facebook,instagram}.ts` + YouTube Shorts title polish in `youtubeCaptions.ts`
- Shared: `pageMeta.ts`, `socialUrls.ts`; `TranscriptSource` includes `"post"`
- Manifest: required `host_permissions` + `tabs` (v0.0.4+) — optional-only broke Scan
- YouTube captions (2026): bare `timedtext` often returns **empty 200** without PoToken. Ladder now:
  1. timedtext (`c=WEB`)
  2. `<track>` element
  3. engagement-panel `get_transcript` (same-origin)
  4. **video description as `post`**
- Preferred manual YouTube URL: `https://www.youtube.com/watch?v=iEa1a9Hip8E`
- Unit tests: `pageMeta`, `socialUrls`, paste `post` source
