/**
 * Instagram Reels / posts — caption from meta or embedded page data.
 */

import {
  canonicalizeInstagramUrl,
  extractInstagramShortcode,
  findStringByKeysNearId,
  jsonMentionsId,
  ogTitle,
  pageMetaPostText,
  parseJsonAssignment,
  textMentionsExactId,
  unwrapInstagramOgCaption,
} from "@ai-video-fact-check/shared";
import { emptyExtras, type PlatformCaptureExtras } from "./types.js";

function firstNonEmpty(
  ...candidates: Array<string | undefined | null>
): string {
  for (const raw of candidates) {
    const text = raw?.trim();
    if (text) return text;
  }
  return "";
}

function readSharedData(shortcode: string): unknown | null {
  for (const script of Array.from(document.scripts)) {
    const text = script.textContent ?? "";
    if (text.includes("window._sharedData")) {
      if (!textMentionsExactId(text, shortcode)) continue;
      const parsed = parseJsonAssignment(text, "_sharedData");
      if (parsed && jsonMentionsId(parsed, shortcode)) {
        return parsed;
      }
    }
    if (text.includes('"xdt_api__v1__media__shortcode__web_info"')) {
      if (!textMentionsExactId(text, shortcode)) continue;
      try {
        // Prefer a caption that sits near this shortcode in the payload.
        const re = /"caption"\s*:\s*"((?:\\.|[^"\\])*)"/g;
        let match: RegExpExecArray | null;
        while ((match = re.exec(text)) !== null) {
          const windowStart = Math.max(0, match.index - 2500);
          const near = text.slice(windowStart, match.index + match[0].length);
          if (!textMentionsExactId(near, shortcode)) continue;
          return {
            caption: JSON.parse(`"${match[1]}"`) as string,
            shortcode,
          };
        }
      } catch {
        /* ignore */
      }
    }
  }
  return null;
}

export function captureInstagramExtras(pageUrl: string): PlatformCaptureExtras {
  const html = document.documentElement.innerHTML;
  const shortcode = extractInstagramShortcode(pageUrl);
  const title = ogTitle(html) || document.title || undefined;
  const videoUrl = canonicalizeInstagramUrl(pageUrl);

  // Profile / explore / etc. — URL only, no feed chrome as post text.
  if (!shortcode) {
    return { ...emptyExtras(), title, videoUrl };
  }

  const shared = readSharedData(shortcode);
  const fromJson = findStringByKeysNearId(
    shared,
    ["caption", "accessibility_caption", "text", "title"],
    shortcode,
  );
  const fromSharedCaption =
    typeof shared === "object" &&
    shared &&
    "caption" in shared &&
    typeof (shared as { caption?: unknown }).caption === "string"
      ? (shared as { caption: string }).caption
      : "";

  // Prefer id-scoped JSON. Meta/OG only when the page markup mentions this shortcode.
  const metaOk = textMentionsExactId(html, shortcode);
  const transcript = firstNonEmpty(
    fromJson,
    fromSharedCaption,
    metaOk ? pageMetaPostText(html) : "",
    metaOk ? unwrapInstagramOgCaption(ogTitle(html) || "") : "",
  );

  if (!transcript) {
    return { ...emptyExtras(), title, videoUrl };
  }

  return {
    title,
    videoUrl,
    transcript,
    transcriptSource: "post",
  };
}
