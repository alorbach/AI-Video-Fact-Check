import type { PlatformId } from "./types.js";
import { extractYouTubeVideoId } from "./youtube.js";
import {
  canonicalizeSocialVideoUrl,
  extractFacebookVideoId,
  extractInstagramShortcode,
  extractTikTokVideoId,
  stripUrlTracking,
} from "./socialUrls.js";

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

/** Stable URL for packaging / comparison (YouTube → watch?v=; social share paths). */
export function canonicalizeVideoUrl(url: string): string {
  const platform = detectPlatform(url);
  if (
    platform === "youtube" ||
    platform === "tiktok" ||
    platform === "x" ||
    platform === "facebook" ||
    platform === "instagram"
  ) {
    return canonicalizeSocialVideoUrl(platform, url);
  }
  return stripUrlTracking(url);
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

  if (platformA === "tiktok") {
    const idA = extractTikTokVideoId(a);
    const idB = extractTikTokVideoId(b);
    if (idA && idB) return idA === idB;
  }

  if (platformA === "x") {
    const idA = extractXStatusId(a);
    const idB = extractXStatusId(b);
    if (idA && idB) return idA === idB;
  }

  if (platformA === "instagram") {
    const idA = extractInstagramShortcode(a);
    const idB = extractInstagramShortcode(b);
    if (idA && idB) return idA === idB;
  }

  if (platformA === "facebook") {
    const idA = extractFacebookVideoId(a);
    const idB = extractFacebookVideoId(b);
    if (idA && idB) return idA === idB;
  }

  return canonicalizeVideoUrl(a) === canonicalizeVideoUrl(b);
}

function extractXStatusId(url: string): string | null {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    const statusIdx = parts.indexOf("status");
    if (statusIdx >= 0 && parts[statusIdx + 1] && /^\d+$/.test(parts[statusIdx + 1]!)) {
      return parts[statusIdx + 1]!;
    }
  } catch {
    /* ignore */
  }
  return null;
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
