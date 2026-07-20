/**
 * Shared contracts for the extension (chat handoff — no analysis API).
 */

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

export type TranscriptSource = "captions" | "track" | "manual" | "none";

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
}

export const CHAT_TARGETS: Record<ChatTargetId, ChatTarget> = {
  chatgpt_video_faktencheck: {
    id: "chatgpt_video_faktencheck",
    labelDe: "Video-Faktencheck GPT",
    labelEn: "Video Fact-Check GPT",
    openUrl:
      "https://chatgpt.com/g/g-6a5e1494f814819181208da5d30ab4ae-video-faktencheck",
    freeForEndUsers: true,
  },
  gemini_web: {
    id: "gemini_web",
    labelDe: "Gemini (kostenlos)",
    labelEn: "Gemini (free)",
    openUrl: "https://gemini.google.com/",
    freeForEndUsers: true,
  },
};

export type ExtensionMessage =
  | { type: "ANALYZE_PAGE"; tabId: number; target: ChatTargetId }
  | { type: "VIDEO_DETECTED"; platform: PlatformId; url: string }
  | { type: "PACKAGE_READY"; package: PastePackage }
  | { type: "CLIPBOARD_OK" }
  | { type: "CHAT_OPENED"; target: ChatTargetId }
  | { type: "HANDOFF_FAILED"; error: string };
