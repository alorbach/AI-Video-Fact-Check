/** Shared contracts for the extension (chat handoff — no analysis API). */

export type Locale = "de" | "en";

/** Free consumer chat websites only — not developer APIs. */
export type ChatTargetId = "chatgpt_video_faktencheck" | "gemini_web";

export type PlatformId =
  | "youtube"
  | "facebook"
  | "instagram"
  | "tiktok"
  | "x"
  | "vimeo"
  | "generic"
  | "unknown";

export type TranscriptSource =
  | "captions"
  | "track"
  | "post"
  | "manual"
  | "none";

export interface PastePackage {
  videoUrl: string;
  transcript?: string;
  transcriptSource: TranscriptSource;
  locale: Locale;
  platform?: PlatformId;
}

export interface ChatTarget {
  id: ChatTargetId;
  labelDe: string;
  labelEn: string;
  openUrl: string;
  freeForEndUsers: true;
  /** When true, clipboard includes the full master prompt (locale-matched). */
  needsEmbeddedMasterPrompt: boolean;
}

export const CHAT_TARGETS: Record<ChatTargetId, ChatTarget> = {
  chatgpt_video_faktencheck: {
    id: "chatgpt_video_faktencheck",
    labelDe: "Video-Faktencheck GPT",
    labelEn: "Video Fact-Check GPT",
    openUrl:
      "https://chatgpt.com/g/g-6a5e1494f814819181208da5d30ab4ae-video-faktencheck",
    freeForEndUsers: true,
    needsEmbeddedMasterPrompt: false,
  },
  gemini_web: {
    id: "gemini_web",
    labelDe: "Gemini (kostenlos)",
    labelEn: "Gemini (free)",
    openUrl: "https://gemini.google.com/",
    freeForEndUsers: true,
    needsEmbeddedMasterPrompt: true,
  },
};

/** Result of in-page capture (L2+). */
export interface CaptureResult {
  platform: PlatformId;
  pageUrl: string;
  videoUrl: string;
  title?: string;
  transcript?: string;
  transcriptSource: TranscriptSource;
  /** True when a supported platform was recognized. */
  supported: boolean;
}

export type ExtensionMessage =
  | { type: "CAPTURE_ACTIVE_TAB"; force?: boolean }
  | { type: "CAPTURE_PAGE" }
  | { type: "CAPTURE_RESULT"; result: CaptureResult; package: PastePackage }
  | { type: "PACKAGE_READY"; package: PastePackage }
  | { type: "VIDEO_DETECTED"; platform: PlatformId; url: string }
  | { type: "ANALYZE_PAGE"; tabId: number; target: ChatTargetId }
  | { type: "START_HANDOFF"; target: ChatTargetId }
  | { type: "COPY_PACKAGE_ONLY" }
  | { type: "CLIPBOARD_OK" }
  | { type: "CHAT_OPENED"; target: ChatTargetId }
  | { type: "CHAT_INJECT_RESULT"; ok: boolean; tabId: number; at: number }
  | { type: "TRIGGER_CHAT_INJECT"; tabId?: number }
  | { type: "HANDOFF_FAILED"; error: string }
  | { type: "GET_LAST_CAPTURE" }
  | {
      type: "LAST_CAPTURE";
      result: CaptureResult | null;
      package: PastePackage | null;
    }
  | { type: "SET_MANUAL_TRANSCRIPT"; transcript: string; locale: Locale };

/** Session payload for ChatGPT/Gemini insert+send (see chatInject.ts). */
export interface PendingChatHandoff {
  text: string;
  target: ChatTargetId;
  at: number;
  /** Only this tab may consume the pending handoff. */
  tabId: number;
  /** Composer-not-ready retries so far (no-editor / login-required / fill-failed). */
  attempts?: number;
}

/** Map of tabId (string) → pending handoff. Supports concurrent chat tabs. */
export type PendingChatHandoffs = Record<string, PendingChatHandoff>;

export const PENDING_CHAT_HANDOFF_KEY = "pendingChatHandoff";
/** Preferred multi-tab store (replaces single PENDING_CHAT_HANDOFF_KEY). */
export const PENDING_CHAT_HANDOFFS_KEY = "pendingChatHandoffs";
