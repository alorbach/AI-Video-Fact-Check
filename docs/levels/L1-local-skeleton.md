# Level 1 — Extension skeleton

**Status:** `done`  
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
   - [x] Legacy `backend/` and `docker-compose.yml` removed
2. **Extension**
   - [x] MV3: sidePanel, action, storage, contextMenus
   - [x] Open Side Panel on action click
   - [x] Side Panel copy: explain “we open ChatGPT for you” (no server status)
   - [x] Options: default chat (Custom GPT / Gemini) applied in Side Panel
3. **Local load**
   - [x] Load unpacked `extension/dist`

## Exit criteria

- [x] Side panel opens
- [x] UI text never mentions API keys / servers
- [x] Extension runs without any local server

## Local deploy

```bash
cd extension && npm run build
# chrome://extensions → Load unpacked → extension/dist
```
