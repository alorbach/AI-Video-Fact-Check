/**
 * Free transcript helper websites (TikTok / Facebook).
 * No API keys — the extension opens these pages, reads the result, then closes.
 *
 * Optional Facebook backup: TurboScribe (Settings, default off) may resolve a
 * public mp4 and submit it to TurboScribe’s free UI when the user is signed in.
 */

import type { Locale, PlatformId } from "./types.js";

export type SocialTranscriptHelperId = "tiktoktranscript" | "facebooktotranscript";

export interface SocialTranscriptHelper {
  id: SocialTranscriptHelperId;
  platform: "tiktok" | "facebook";
  openUrl: string;
  /** Hosts that match this helper (for tab URL checks). */
  hosts: string[];
  /** Max wait after submit for a result or error. */
  timeoutMs: number;
}

export const SOCIAL_TRANSCRIPT_HELPERS: Record<
  SocialTranscriptHelperId,
  SocialTranscriptHelper
> = {
  tiktoktranscript: {
    id: "tiktoktranscript",
    platform: "tiktok",
    openUrl: "https://tiktoktranscript.io/",
    hosts: ["tiktoktranscript.io", "www.tiktoktranscript.io"],
    // Native caption extract is usually fast; allow room for slow networks.
    timeoutMs: 45_000,
  },
  facebooktotranscript: {
    id: "facebooktotranscript",
    platform: "facebook",
    openUrl: "https://facebooktotranscript.com/",
    hosts: ["facebooktotranscript.com", "www.facebooktotranscript.com"],
    // Auto may fall through to Whisper AI (30–120s per their FAQ).
    timeoutMs: 150_000,
  },
};

/** Optional Facebook backup via TurboScribe (Settings, default off). */
export const TURBOSCRIBE_FACEBOOK = {
  downloaderUrl: "https://turboscribe.ai/downloader/facebook",
  transcribeUrl: "https://turboscribe.ai/u/transcribe-youtube-video",
  hosts: ["turboscribe.ai", "www.turboscribe.ai"],
  /** Hard cap for the whole TurboScribe job (after ~75s primary under MV3 ~5 min). */
  totalBudgetMs: 200_000,
  /** Downloader URL → public fbcdn mp4 (portion of totalBudgetMs). */
  resolveTimeoutMs: 75_000,
  /** Whisper-style transcription after file upload. */
  transcribeTimeoutMs: 100_000,
  /** Skip oversized public files (executeScript IPC ~64MiB; base64 expands ~4/3). */
  maxMp4Bytes: 18_000_000,
} as const;

/** Platforms that use a free helper website when local transcript is `none`. */
export function socialHelperPlatform(
  platform: PlatformId,
): "tiktok" | "facebook" | null {
  if (platform === "tiktok") return "tiktok";
  if (platform === "facebook") return "facebook";
  return null;
}

export function helperForPlatform(
  platform: PlatformId,
): SocialTranscriptHelper | null {
  const p = socialHelperPlatform(platform);
  if (p === "tiktok") return SOCIAL_TRANSCRIPT_HELPERS.tiktoktranscript;
  if (p === "facebook") return SOCIAL_TRANSCRIPT_HELPERS.facebooktotranscript;
  return null;
}

export function isSocialTranscriptHelperUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (
      Object.values(SOCIAL_TRANSCRIPT_HELPERS).some((h) =>
        h.hosts.includes(host),
      )
    ) {
      return true;
    }
    return (TURBOSCRIBE_FACEBOOK.hosts as readonly string[]).includes(host);
  } catch {
    return false;
  }
}

/** Preferred language label on facebooktotranscript.com custom dropdown. */
export function facebookHelperLanguageLabel(locale: Locale): string {
  return locale === "de" ? "German" : "English";
}

/** TurboScribe language `<select>` option text (flag emoji optional). */
export function turboScribeLanguageLabel(locale: Locale): string {
  return locale === "de" ? "German" : "English";
}

/**
 * facebooktotranscript Auto/Extract often returns junk one-liners (e.g. "you")
 * when Facebook has no real captions. Reject those so we can retry AI/Whisper
 * or fall back to URL-only — never paste stub text into the chat prompt.
 */
export function isUsableSocialHelperTranscript(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length < 40) return false;
  const words = t.split(" ").filter(Boolean);
  if (words.length < 6) return false;
  return true;
}
