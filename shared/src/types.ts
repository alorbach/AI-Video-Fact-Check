/** Shared contracts for the extension (chat handoff — no analysis API). */

export type Locale = "de" | "en";

/** Free consumer chat websites only — not developer APIs. */
export type ChatTargetId =
  | "chatgpt_video_faktencheck"
  | "gemini_web"
  | "claude_web"
  | "copilot_web"
  | "deepseek_web";

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
  /**
   * Captions/transcript via a free helper website (YouTube: TranscribeYouTube;
   * TikTok/Facebook: tiktoktranscript.io / facebooktotranscript.com).
   */
  | "external"
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
  /** Free account / sign-in page for help links (senior-friendly). */
  loginUrl: string;
  freeForEndUsers: true;
  /** When true, clipboard includes the full master prompt (locale-matched). */
  needsEmbeddedMasterPrompt: boolean;
  /** When true, extension attempts MAIN-world insert+send on the chat host. */
  supportsInject: boolean;
}

export const CHAT_TARGETS: Record<ChatTargetId, ChatTarget> = {
  chatgpt_video_faktencheck: {
    id: "chatgpt_video_faktencheck",
    labelDe: "Video-Faktencheck GPT",
    labelEn: "Video Fact-Check GPT",
    openUrl:
      "https://chatgpt.com/g/g-6a5e1494f814819181208da5d30ab4ae-video-faktencheck",
    loginUrl: "https://chatgpt.com/auth/login",
    freeForEndUsers: true,
    needsEmbeddedMasterPrompt: false,
    supportsInject: true,
  },
  gemini_web: {
    id: "gemini_web",
    labelDe: "Gemini (kostenlos)",
    labelEn: "Gemini (free)",
    openUrl: "https://gemini.google.com/",
    loginUrl: "https://accounts.google.com/",
    freeForEndUsers: true,
    needsEmbeddedMasterPrompt: true,
    supportsInject: true,
  },
  claude_web: {
    id: "claude_web",
    labelDe: "Claude (kostenlos)",
    labelEn: "Claude (free)",
    openUrl: "https://claude.ai/new",
    loginUrl: "https://claude.ai/login",
    freeForEndUsers: true,
    needsEmbeddedMasterPrompt: true,
    supportsInject: true,
  },
  copilot_web: {
    id: "copilot_web",
    labelDe: "Microsoft Copilot (kostenlos)",
    labelEn: "Microsoft Copilot (free)",
    openUrl: "https://copilot.microsoft.com/",
    loginUrl: "https://login.live.com/",
    freeForEndUsers: true,
    needsEmbeddedMasterPrompt: true,
    supportsInject: true,
  },
  deepseek_web: {
    id: "deepseek_web",
    labelDe: "DeepSeek (kostenlos)",
    labelEn: "DeepSeek (free)",
    openUrl: "https://chat.deepseek.com/",
    loginUrl: "https://chat.deepseek.com/sign_in",
    freeForEndUsers: true,
    needsEmbeddedMasterPrompt: true,
    supportsInject: false,
  },
};

/**
 * Paths where a chat handoff already sent a message — do not inject again.
 * ChatGPT: /c/… · Claude: /chat/… · some ChatGPT shells: /app/…
 */
export function isPostSendChatPath(pathname: string): boolean {
  const p = pathname.toLowerCase();
  return (
    p.includes("/c/") ||
    p.startsWith("/c/") ||
    p.includes("/chat/") ||
    p.startsWith("/chat/") ||
    p.includes("/app/")
  );
}

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

export type WorkOverlayPhase =
  | "capture"
  | "helper"
  | "inject"
  | "multiprompt"
  | "waiting";

export type ExtensionMessage =
  | { type: "CAPTURE_ACTIVE_TAB"; force?: boolean }
  | { type: "CAPTURE_PAGE"; skipTranscript?: boolean }
  | { type: "CAPTURE_RESULT"; result: CaptureResult; package: PastePackage }
  | { type: "PACKAGE_READY"; package: PastePackage }
  | { type: "VIDEO_DETECTED"; platform: PlatformId; url: string }
  | { type: "ANALYZE_PAGE"; tabId: number; target: ChatTargetId }
  | { type: "START_HANDOFF"; target: ChatTargetId }
  | { type: "COPY_PACKAGE_ONLY" }
  | { type: "CLIPBOARD_OK" }
  | { type: "CHAT_OPENED"; target: ChatTargetId }
  | {
      type: "CHAT_INJECT_RESULT";
      ok: boolean;
      tabId: number;
      at: number;
      /** Inject failure detail: login-required, no-editor, fill-failed, … */
      reason?: string;
      /** Multiprompt progress when ok and more parts remain (informational). */
      part?: number;
      total?: number;
    }
  | { type: "TRIGGER_CHAT_INJECT"; tabId?: number }
  | { type: "HANDOFF_FAILED"; error: string }
  | { type: "GET_LAST_CAPTURE" }
  | {
      type: "LAST_CAPTURE";
      result: CaptureResult | null;
      package: PastePackage | null;
    }
  | { type: "SET_MANUAL_TRANSCRIPT"; transcript: string; locale: Locale }
  | {
      type: "SHOW_WORK_OVERLAY";
      phase: WorkOverlayPhase;
      part?: number;
      total?: number;
      title?: string;
      detail?: string;
    }
  | { type: "HIDE_WORK_OVERLAY" }
  | { type: "CANCEL_WORK" }
  | { type: "WORK_CANCELLED" };

/** Session payload for inject-supported chat insert+send (see chatInject.ts). */
export interface PendingChatHandoff {
  /**
   * Composer messages to send in order. Prefer this over `text`.
   * Legacy single-string handoffs may only set `text`.
   */
  messages?: string[];
  /** Current index into `messages` (0-based). */
  index?: number;
  /** Char budget used when messages were built (for too-long re-split). */
  charLimit?: number;
  /** Package used to build messages (for runtime re-split). */
  package?: PastePackage;
  /** Legacy single payload — treated as messages[0] when messages absent. */
  text?: string;
  target: ChatTargetId;
  at: number;
  /**
   * Last activity time for TTL (multiprompt parts refresh this).
   * Session identity stays `at`; expiry uses `touchedAt ?? at`.
   */
  touchedAt?: number;
  /** Only this tab may consume the pending handoff. */
  tabId: number;
  /** Composer-not-ready retries so far (no-editor / login-required / fill-failed). */
  attempts?: number;
}

/** Resolve the message list for a pending handoff (legacy `text` supported). */
export function pendingHandoffMessages(
  pending: PendingChatHandoff,
): string[] {
  if (pending.messages && pending.messages.length > 0) {
    return pending.messages;
  }
  if (pending.text) return [pending.text];
  return [];
}

/** Map of tabId (string) → pending handoff. Supports concurrent chat tabs. */
export type PendingChatHandoffs = Record<string, PendingChatHandoff>;

export const PENDING_CHAT_HANDOFF_KEY = "pendingChatHandoff";
/** Preferred multi-tab store (replaces single PENDING_CHAT_HANDOFF_KEY). */
export const PENDING_CHAT_HANDOFFS_KEY = "pendingChatHandoffs";
/** Session flag: user cancelled the active work (capture / handoff). */
export const WORK_CANCELLED_KEY = "workCancelledAt";
