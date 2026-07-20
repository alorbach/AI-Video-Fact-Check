# Level 1 — Extension skeleton

**Status:** `in_progress`  
**Parent:** [`../MULTILEVEL-IMPLEMENTATION-PLAN.md`](../MULTILEVEL-IMPLEMENTATION-PLAN.md)  
**Estimate:** 1–2 days  
**Depends on:** [L0](L0-foundation.md)  
**Unlocks:** [L2](L2-capture-transcript.md)

## Goal

Loadable MV3 extension with a senior-friendly Side Panel **guide shell**. No analysis backend.

## Tasks

1. **Tooling**
   - [x] npm workspace with `extension` (+ `shared`)
   - [ ] Optional Vite/CRX if helpful; static build OK for now
   - [ ] Remove or quarantine legacy `backend/` so it is not required to run
2. **Extension**
   - [x] MV3: sidePanel, action, storage, contextMenus
   - [x] Open Side Panel on action click
   - [ ] Side Panel copy: explain “we open ChatGPT for you” (no “backend status”)
   - [ ] Options: language hint, default chat = Custom GPT (Gemini later in L6)
3. **Local load**
   - [x] Load unpacked `extension/dist`

## Exit criteria

- [x] Side panel opens
- [ ] UI text never mentions API keys / servers
- [ ] Extension runs without any local server

## Local deploy

```bash
cd extension && npm run build
# chrome://extensions → Load unpacked → extension/dist
```
