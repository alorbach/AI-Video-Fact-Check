# AI Video Fact-Check

Chrome extension that helps everyday users — especially older adults — check video claims in plain language.

It does **not** use developer APIs. It prepares the video link (and captions when available), copies them, and opens a chat the user already knows:

1. **Primary:** [Video Faktencheck (ChatGPT Custom GPT)](https://chatgpt.com/g/g-6a5e1494f814819181208da5d30ab4ae-video-faktencheck)  
2. **Secondary (free):** [Google Gemini](https://gemini.google.com/)

**Author:** [Andre Lorbach](https://github.com/alorbach/)  
**Repository:** https://github.com/alorbach/AI-Video-Fact-Check  

## Docs

| Document | Purpose |
|---|---|
| [`docs/MULTILEVEL-IMPLEMENTATION-PLAN.md`](docs/MULTILEVEL-IMPLEMENTATION-PLAN.md) | Status board L0–L8 |
| [`docs/levels/`](docs/levels/) | Per-level tasks |
| [`docs/PRODUCT.md`](docs/PRODUCT.md) | Product goals & handoff UX |
| [`docs/SPEC-TRANSCRIPT.md`](docs/SPEC-TRANSCRIPT.md) | Captions / URL in the browser |
| [`docs/SPEC-FACT-CHECK.md`](docs/SPEC-FACT-CHECK.md) | Clipboard handoff & chat targets |

## Platforms (required)

YouTube · TikTok · X · Facebook · Instagram

## Status

**Level 7 — Handoff hardening** (done). L0–L7 complete: platforms, Custom GPT + Gemini insert/send, clipboard fallback, login/tab-open recovery; next is L8 store release.

## Local development

```bash
npm install
cd extension && npm run build
```

Chrome → `chrome://extensions` → Developer mode → **Load unpacked** → `extension/dist`.

No server required — uses your normal ChatGPT or Google login.

## Credits

Created by **Andre Lorbach** — [github.com/alorbach](https://github.com/alorbach/).

## License

[GPL-2.0](LICENSE) © [Andre Lorbach](https://github.com/alorbach/)
