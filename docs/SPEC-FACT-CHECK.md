# Spec — Chat handoff & expected analysis

Analysis runs **only** in the user’s open chat. Free consumer web targets (no developer LLM API keys):

- Primary: https://chatgpt.com/g/g-6a5e1494f814819181208da5d30ab4ae-video-faktencheck  
- Also: https://gemini.google.com/ · https://claude.ai/new · https://copilot.microsoft.com/ · https://chat.deepseek.com/

No backend fact-check API.

## Handoff protocol

```text
Extension
  → build PastePackage (URL + optional transcript + short ask / master prompt)
  → clipboard backup + chrome.storage.session pending handoff (when inject supported)
  → chrome.tabs.create({ url: chatTarget })
  → content script on inject hosts: insert text into composer + send
  → Side Panel reports success or “please paste manually” fallback
```

### Chat targets

```typescript
type ChatTargetId =
  | "chatgpt_video_faktencheck"
  | "gemini_web"
  | "claude_web"
  | "copilot_web"
  | "deepseek_web";

interface ChatTarget {
  id: ChatTargetId;
  labelDe: string;
  labelEn: string;
  openUrl: string;
  /** Free web chat available to ordinary users (no API key). */
  freeForEndUsers: true;
  /** When true, clipboard includes the full master prompt (locale-matched). */
  needsEmbeddedMasterPrompt: boolean;
  /** When true, extension attempts MAIN-world insert+send on the chat host. */
  supportsInject: boolean;
}
```

| id | openUrl | supportsInject |
|---|---|---|
| `chatgpt_video_faktencheck` | Custom GPT URL | yes |
| `gemini_web` | `https://gemini.google.com/` | yes |
| `claude_web` | `https://claude.ai/new` | yes |
| `copilot_web` | `https://copilot.microsoft.com/` | yes |
| `deepseek_web` | `https://chat.deepseek.com/` | no (clipboard) |

Default target: Custom GPT. Side Panel **combobox** + Options `defaultChat` select the engine. Context menu opens the stored default.

### Paste package fields

```typescript
interface PastePackage {
  videoUrl: string;
  transcript?: string;
  transcriptSource?: "captions" | "track" | "post" | "manual" | "external" | "none";
  locale: "de" | "en";
  platform?: string;
}
```

Rendered as plain text (see [`PRODUCT.md`](PRODUCT.md)).

- **Custom GPT:** short ask (score 1–10, plain summary, claims, sources, uncertainties) — the Custom GPT already has the full behavior configured.
- **Any `needsEmbeddedMasterPrompt` target:** prepend the full locale-matched master prompt (`shared/src/masterPrompt.ts`: DE or EN from UI language), then `---`, then URL + transcript. No second short ask line.

## What we ask the chat to produce

(For embedded master prompt and for Side Panel “what you should see” help.)

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
2. Combobox: choose free chat + big **Open chat** button  
3. Status: inserting / sent / or manual fallback  
4. Optional: “copy again” if automation failed  
5. Short “how to read the answer” tip  

## Extension messages (target)

Source of truth: [`shared/src/types.ts`](../shared/src/types.ts) (`ExtensionMessage`). Includes capture, handoff, clipboard, and inject result messages, e.g.:

```typescript
type ExtensionMessage =
  | { type: "CAPTURE_ACTIVE_TAB"; force?: boolean }
  | { type: "CAPTURE_RESULT"; result: CaptureResult; package: PastePackage }
  | { type: "START_HANDOFF"; target: ChatTargetId }
  | { type: "CLIPBOARD_OK" }
  | { type: "CHAT_OPENED"; target: ChatTargetId }
  | {
      type: "CHAT_INJECT_RESULT";
      ok: boolean;
      tabId: number;
      at: number;
      reason?: string;
    }
  | { type: "HANDOFF_FAILED"; error: string }
  | /* … see shared/src/types.ts */;
```

## Explicitly out of scope

- `POST` to OpenAI / Anthropic / Gemini **APIs**
- Own job queue for LLM scoring
- Scraping chat DOM for automatic result import
