# Spec — Chat handoff & expected analysis

Analysis runs **only** in the user’s open chat:

- Primary: https://chatgpt.com/g/g-6a5e1494f814819181208da5d30ab4ae-video-faktencheck  
- Secondary (free): https://gemini.google.com/

No backend fact-check API. No developer LLM API keys.

## Handoff protocol

```text
Extension
  → build PastePackage (URL + optional transcript + short ask)
  → navigator.clipboard.writeText / chrome offscreen clipboard helper
  → chrome.tabs.create({ url: chatTarget })
  → Side Panel shows step-by-step paste help
```

### Chat targets

```typescript
type ChatTargetId = "chatgpt_video_faktencheck" | "gemini_web";

interface ChatTarget {
  id: ChatTargetId;
  labelDe: string;
  labelEn: string;
  openUrl: string;
  /** Free web chat available to ordinary users (no API key). */
  freeForEndUsers: true;
}
```

| id | openUrl |
|---|---|
| `chatgpt_video_faktencheck` | `https://chatgpt.com/g/g-6a5e1494f814819181208da5d30ab4ae-video-faktencheck` |
| `gemini_web` | `https://gemini.google.com/` |

Default target: Custom GPT. Gemini is an explicit second button/menu item.

### Paste package fields

```typescript
interface PastePackage {
  videoUrl: string;
  transcript?: string;
  transcriptSource?: "captions" | "track" | "manual" | "none";
  locale: "de" | "en";
  platform?: string;
}
```

Rendered as plain text (see [`PRODUCT.md`](PRODUCT.md)). For Gemini, prepend one sentence that asks for the same plain-language score format (the Custom GPT already has that behavior built in).

## What we ask the chat to produce

(For Gemini instructions and for Side Panel “what you should see” help.)

1. Overall score **1–10**
2. Short plain summary
3. Important claims with verdict
4. Sources
5. Uncertainties

### Per-claim verdict language (guide)

| DE | EN |
|---|---|
| Richtig | True |
| Überwiegend richtig | Mostly true |
| Teilweise richtig | Partly true |
| Irreführend | Misleading |
| Überwiegend falsch | Mostly false |
| Falsch | False |
| Nicht belegbar | Unverifiable |

### Score meaning

```text
1  = fully fabricated or manipulative
5  = mix of accurate and misleading
10 = fully correct, well contextualized, solidly sourced
```

Traffic-light helper in Side Panel (for reading the chat answer):

- 1–3: Vorsicht / Caution  
- 4–6: Gemischt / Mixed  
- 7–10: Weitgehend zuverlässig / Mostly reliable  

## Side Panel role

Not a second analysis engine. It is a **guide**:

1. Status of capture (URL / captions found?)  
2. Which chat will open  
3. Big button: Open chat  
4. “Paste now (Ctrl+V)” reminder  
5. Optional: show copied text, “copy again”  
6. Short “how to read the answer” tip  

## Extension messages (target)

```typescript
type ExtensionMessage =
  | { type: "ANALYZE_PAGE"; tabId: number; target: ChatTargetId }
  | { type: "VIDEO_DETECTED"; platform: string; url: string }
  | { type: "PACKAGE_READY"; package: PastePackage }
  | { type: "CLIPBOARD_OK" }
  | { type: "CHAT_OPENED"; target: ChatTargetId }
  | { type: "HANDOFF_FAILED"; error: string };
```

## Explicitly out of scope

- `POST` to OpenAI / Anthropic / Gemini **APIs**
- Own job queue for LLM scoring
- Scraping ChatGPT/Gemini DOM for automatic result import (MVP)
- Automating keystrokes into the chat page
