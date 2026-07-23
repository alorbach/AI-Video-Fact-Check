# Level 11 — External transcript helpers (TikTok / Facebook)

**Status:** `done`  
**Parent:** [`../MULTILEVEL-IMPLEMENTATION-PLAN.md`](../MULTILEVEL-IMPLEMENTATION-PLAN.md)  
**Estimate:** 2–4 days  
**Depends on:** [L5](L5-platforms.md), [L10](L10-overlay-multiprompt.md)  
**Specs:** [`../SPEC-TRANSCRIPT.md`](../SPEC-TRANSCRIPT.md), [`../CHROME-WEB-STORE.md`](../CHROME-WEB-STORE.md)

## Goal

When TikTok or Facebook Scan leaves **no** local transcript (`transcriptSource: "none"`), open a free no-signup helper website, read the transcript, close the helper tab, then continue to the existing AI chat handoff — **no API keys**.

| Platform | Helper |
|---|---|
| TikTok | https://tiktoktranscript.io/ |
| Facebook | https://facebooktotranscript.com/ |
| Facebook (optional backup) | TurboScribe downloader → free transcribe UI (`enableTurboScribeFacebook`, default **off**) |

## Tasks

- [x] Shared helper config (`socialTranscriptHelpers.ts`)
- [x] MAIN-world submit/poll inject (`transcriptHelperMain.ts`)
- [x] Service worker: open → fill → poll → close; cancel closes helper tab
- [x] Work overlay phase `helper` (Fetching transcript…)
- [x] Manifest host permissions for both helpers
- [x] SPEC + store privacy notes
- [x] Unit tests for helper config; manual checklist on [`../test-urls.md`](../test-urls.md)
- [x] Optional TurboScribe Facebook backup (Settings default off; mp4 resolve → upload → read)

## Exit criteria

- [x] TikTok/Facebook with empty local transcript attempt helper enrichment (or fail soft → URL-only)
- [x] Helper tab closed after success, error, timeout, or Cancel
- [x] No API keys; YouTube TranscribeYouTube path unchanged
- [x] `enableTranscript` off skips helper enrichment
- [x] `enableTurboScribeFacebook` off (default) skips TurboScribe backup; on runs after facebooktotranscript soft-fail

## Notes

- tiktoktranscript.io = **native TikTok captions** only (not Whisper).  
- facebooktotranscript.com Method **Auto** may use AI when Extract finds nothing.  
- TurboScribe backup needs the user’s free TurboScribe sign-in (3/day); soft-fails on login wall / errors / oversized files.  
- Helper UIs change — maintain selectors like chat inject.
