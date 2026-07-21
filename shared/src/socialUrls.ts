/**
 * Canonical share URLs for required social platforms (L5).
 */

import { textMentionsExactId } from "./pageMeta.js";
import { canonicalizeYouTubeUrl } from "./youtube.js";

const TRACKING_PARAMS = [
  "si",
  "feature",
  "pp",
  "fbclid",
  "gclid",
  "s",
  "t",
  "ref_src",
  "ref_url",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
];

function stripTracking(parsed: URL): URL {
  parsed.hash = "";
  for (const key of TRACKING_PARAMS) {
    parsed.searchParams.delete(key);
  }
  return parsed;
}

/** Numeric TikTok video id from `/video/{id}` path. */
export function extractTikTokVideoId(url: string): string | null {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    const videoIdx = parts.indexOf("video");
    if (videoIdx >= 0 && parts[videoIdx + 1] && /^\d+$/.test(parts[videoIdx + 1]!)) {
      return parts[videoIdx + 1]!;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Instagram reel/post shortcode from `/reel|reels|p/{code}`. */
export function extractInstagramShortcode(url: string): string | null {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    if (
      parts.length >= 2 &&
      (parts[0] === "reel" || parts[0] === "reels" || parts[0] === "p") &&
      parts[1]
    ) {
      return parts[1]!;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Facebook video id from watch?v=, /videos/, /reel/, or fb.watch slug.
 */
export function extractFacebookVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host === "fb.watch" || host.endsWith(".fb.watch")) {
      return parsed.pathname.split("/").filter(Boolean)[0] ?? null;
    }
    const watchId = parsed.searchParams.get("v");
    if (watchId && /^\d+$/.test(watchId)) return watchId;
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (
      parts.length >= 2 &&
      (parts[0] === "reel" || parts[0] === "reels") &&
      parts[1]
    ) {
      return parts[1]!;
    }
    const videosIdx = parts.indexOf("videos");
    if (
      videosIdx >= 0 &&
      parts[videosIdx + 1] &&
      /^\d+$/.test(parts[videosIdx + 1]!)
    ) {
      return parts[videosIdx + 1]!;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** True when serialized JSON clearly references this id/shortcode (exact token). */
export function jsonMentionsId(node: unknown, id: string): boolean {
  if (!id) return false;
  try {
    return textMentionsExactId(JSON.stringify(node), id);
  } catch {
    return false;
  }
}

/** TikTok → https://www.tiktok.com/@user/video/id when path matches. */
export function canonicalizeTikTokUrl(url: string): string {
  try {
    const parsed = stripTracking(new URL(url));
    const host = parsed.hostname.toLowerCase();
    if (!(host === "tiktok.com" || host.endsWith(".tiktok.com"))) {
      return url;
    }
    const parts = parsed.pathname.split("/").filter(Boolean);
    // /@user/video/1234567890
    if (
      parts.length >= 3 &&
      parts[0]?.startsWith("@") &&
      parts[1] === "video" &&
      /^\d+$/.test(parts[2] ?? "")
    ) {
      return `https://www.tiktok.com/${parts[0]}/video/${parts[2]}`;
    }
    // /video/123 (rare)
    if (parts.length >= 2 && parts[0] === "video" && /^\d+$/.test(parts[1]!)) {
      return `https://www.tiktok.com/video/${parts[1]}`;
    }
    parsed.protocol = "https:";
    parsed.hostname = "www.tiktok.com";
    return parsed.toString().replace(/\/$/, "") || parsed.toString();
  } catch {
    return url;
  }
}

/** X / Twitter status → https://x.com/user/status/id */
export function canonicalizeXUrl(url: string): string {
  try {
    const parsed = stripTracking(new URL(url));
    const host = parsed.hostname.toLowerCase();
    if (
      !(
        host === "x.com" ||
        host.endsWith(".x.com") ||
        host === "twitter.com" ||
        host.endsWith(".twitter.com")
      )
    ) {
      return url;
    }
    const parts = parsed.pathname.split("/").filter(Boolean);
    const statusIdx = parts.findIndex((p) => p === "status");
    if (statusIdx >= 1 && parts[statusIdx + 1] && /^\d+$/.test(parts[statusIdx + 1]!)) {
      const user = parts[statusIdx - 1];
      const id = parts[statusIdx + 1];
      return `https://x.com/${user}/status/${id}`;
    }
    parsed.protocol = "https:";
    parsed.hostname = "x.com";
    return parsed.toString().replace(/\/$/, "") || parsed.toString();
  } catch {
    return url;
  }
}

/** Facebook watch / reel / videos share URL (strip tracking). */
export function canonicalizeFacebookUrl(url: string): string {
  try {
    const parsed = stripTracking(new URL(url));
    const host = parsed.hostname.toLowerCase();
    if (
      !(
        host === "facebook.com" ||
        host.endsWith(".facebook.com") ||
        host === "fb.com" ||
        host.endsWith(".fb.com") ||
        host === "fb.watch" ||
        host.endsWith(".fb.watch")
      )
    ) {
      return url;
    }
    if (host === "fb.watch" || host.endsWith(".fb.watch")) {
      const slug = parsed.pathname.split("/").filter(Boolean)[0];
      if (slug) return `https://fb.watch/${slug}/`;
    }
    const parts = parsed.pathname.split("/").filter(Boolean);
    // /reel/ID or /reels/ID
    if (
      parts.length >= 2 &&
      (parts[0] === "reel" || parts[0] === "reels") &&
      parts[1]
    ) {
      return `https://www.facebook.com/reel/${parts[1]}`;
    }
    // /watch/?v=ID
    const watchId = parsed.searchParams.get("v");
    if (parts[0] === "watch" && watchId) {
      return `https://www.facebook.com/watch/?v=${watchId}`;
    }
    // /USER/videos/ID
    const videosIdx = parts.indexOf("videos");
    if (videosIdx >= 0 && parts[videosIdx + 1] && /^\d+$/.test(parts[videosIdx + 1]!)) {
      const id = parts[videosIdx + 1];
      const user = videosIdx > 0 ? parts[0] : null;
      return user
        ? `https://www.facebook.com/${user}/videos/${id}`
        : `https://www.facebook.com/videos/${id}`;
    }
    parsed.protocol = "https:";
    if (host.includes("facebook") || host.includes("fb.com")) {
      parsed.hostname = "www.facebook.com";
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

/** Instagram reel / post → https://www.instagram.com/reel|p/CODE/ */
export function canonicalizeInstagramUrl(url: string): string {
  try {
    const parsed = stripTracking(new URL(url));
    const host = parsed.hostname.toLowerCase();
    if (!(host === "instagram.com" || host.endsWith(".instagram.com"))) {
      return url;
    }
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (
      parts.length >= 2 &&
      (parts[0] === "reel" || parts[0] === "reels" || parts[0] === "p") &&
      parts[1]
    ) {
      const kind = parts[0] === "p" ? "p" : "reel";
      return `https://www.instagram.com/${kind}/${parts[1]}/`;
    }
    parsed.protocol = "https:";
    parsed.hostname = "www.instagram.com";
    const path = parsed.pathname.endsWith("/")
      ? parsed.pathname
      : `${parsed.pathname}/`;
    return `https://www.instagram.com${path === "//" ? "/" : path}`.replace(
      /([^:]\/)\/+/g,
      "$1",
    );
  } catch {
    return url;
  }
}

/** Platform-aware canonical URL (YouTube + social). */
export function canonicalizeSocialVideoUrl(
  platform: string,
  url: string,
): string {
  switch (platform) {
    case "youtube":
      return canonicalizeYouTubeUrl(url);
    case "tiktok":
      return canonicalizeTikTokUrl(url);
    case "x":
      return canonicalizeXUrl(url);
    case "facebook":
      return canonicalizeFacebookUrl(url);
    case "instagram":
      return canonicalizeInstagramUrl(url);
    default:
      return url;
  }
}
