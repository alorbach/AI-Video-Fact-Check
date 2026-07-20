import type { PlatformId } from "./types.js";
import {
  canonicalizeYouTubeUrl,
  extractYouTubeVideoId,
} from "./youtube.js";

const TRACKING_PARAMS = [
  "si",
  "feature",
  "pp",
  "fbclid",
  "gclid",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
];

/**
 * Detect a supported video platform from a page or media URL.
 */
export function detectPlatform(url: string): PlatformId {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return "unknown";
  }

  if (
    host === "youtu.be" ||
    host === "youtube.com" ||
    host.endsWith(".youtube.com") ||
    host === "youtube-nocookie.com" ||
    host.endsWith(".youtube-nocookie.com")
  ) {
    return "youtube";
  }
  if (host === "tiktok.com" || host.endsWith(".tiktok.com")) {
    return "tiktok";
  }
  if (
    host === "x.com" ||
    host.endsWith(".x.com") ||
    host === "twitter.com" ||
    host.endsWith(".twitter.com")
  ) {
    return "x";
  }
  if (
    host === "facebook.com" ||
    host.endsWith(".facebook.com") ||
    host === "fb.com" ||
    host.endsWith(".fb.com") ||
    host === "fb.watch" ||
    host.endsWith(".fb.watch")
  ) {
    return "facebook";
  }
  if (host === "instagram.com" || host.endsWith(".instagram.com")) {
    return "instagram";
  }
  if (host === "vimeo.com" || host.endsWith(".vimeo.com")) {
    return "vimeo";
  }
  return "unknown";
}

/** Stable URL for packaging / comparison (YouTube → watch?v=). */
export function canonicalizeVideoUrl(url: string): string {
  if (detectPlatform(url) === "youtube") {
    return canonicalizeYouTubeUrl(url);
  }
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    for (const key of TRACKING_PARAMS) {
      parsed.searchParams.delete(key);
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

/** True when two URLs refer to the same video (canonical / id-aware). */
export function sameVideoUrl(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;

  const platformA = detectPlatform(a);
  const platformB = detectPlatform(b);
  if (platformA !== platformB) return false;

  if (platformA === "youtube") {
    const idA = extractYouTubeVideoId(a);
    const idB = extractYouTubeVideoId(b);
    return Boolean(idA && idA === idB);
  }

  return canonicalizeVideoUrl(a) === canonicalizeVideoUrl(b);
}

/** Human-readable platform label for UI (not i18n — Side Panel maps via chrome.i18n). */
export function platformLabelKey(platform: PlatformId): string {
  switch (platform) {
    case "youtube":
      return "platformYoutube";
    case "tiktok":
      return "platformTiktok";
    case "x":
      return "platformX";
    case "facebook":
      return "platformFacebook";
    case "instagram":
      return "platformInstagram";
    case "vimeo":
      return "platformVimeo";
    case "generic":
      return "platformGeneric";
    default:
      return "platformUnknown";
  }
}
