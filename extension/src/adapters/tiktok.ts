/**
 * TikTok: post description / caption when exposed in page data or DOM.
 */

import {
  canonicalizeTikTokUrl,
  extractTikTokVideoId,
  findStringByKeysNearId,
  jsonMentionsId,
  ogTitle,
  parseJsonAssignment,
  pickLongestText,
  textMentionsExactId,
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

function readUniversalData(videoId: string): unknown | null {
  for (const script of Array.from(document.scripts)) {
    const text = script.textContent ?? "";
    if (!text.includes("__UNIVERSAL_DATA_FOR_REHYDRATION__")) continue;
    if (!textMentionsExactId(text, videoId)) continue;
    const parsed = parseJsonAssignment(
      text,
      "__UNIVERSAL_DATA_FOR_REHYDRATION__",
    );
    if (!parsed) continue;
    if (!jsonMentionsId(parsed, videoId)) continue;
    return parsed;
  }
  return null;
}

function readSigiState(videoId: string): unknown | null {
  for (const script of Array.from(document.scripts)) {
    const text = script.textContent ?? "";
    if (!text.includes("SIGI_STATE")) continue;
    if (!textMentionsExactId(text, videoId)) continue;
    const parsed = parseJsonAssignment(text, "SIGI_STATE");
    if (!parsed) continue;
    if (!jsonMentionsId(parsed, videoId)) continue;
    return parsed;
  }
  return null;
}

/**
 * Walk up from a caption node and return the TikTok video id from a nearby
 * `/video/{id}` link, if any. Stops at feed item boundaries.
 */
function linkedVideoIdNear(el: Element): string | null {
  let node: Element | null = el;
  for (let depth = 0; depth < 12 && node; depth++) {
    if (node instanceof HTMLAnchorElement) {
      const id = extractTikTokVideoId(node.href);
      if (id) return id;
    }
    for (const a of Array.from(node.querySelectorAll('a[href*="/video/"]'))) {
      const href =
        (a as HTMLAnchorElement).href || a.getAttribute("href") || "";
      const absolute = href.startsWith("http")
        ? href
        : `https://www.tiktok.com${href.startsWith("/") ? "" : "/"}${href}`;
      const id = extractTikTokVideoId(absolute);
      if (id) return id;
    }
    const e2e = node.getAttribute("data-e2e");
    if (
      e2e === "recommend-list-item-container" ||
      e2e === "browse-video"
    ) {
      break;
    }
    node = node.parentElement;
  }
  return null;
}

/**
 * DOM caption scoped to `videoId`. Only accepts nodes whose nearby tree
 * links to `/video/{videoId}` — never an unscoped “longest desc” fallback
 * (feed / SPA lag can show another clip’s caption).
 */
function domCaption(videoId: string): string {
  const selectors = [
    '[data-e2e="browse-video-desc"]',
    '[data-e2e="video-desc"]',
    '[data-e2e="new-desc-span"]',
    'h1[data-e2e="browse-video-desc"]',
  ];
  const seen = new Set<Element>();

  for (const sel of selectors) {
    for (const el of Array.from(document.querySelectorAll(sel))) {
      if (seen.has(el)) continue;
      seen.add(el);
      const text = el.textContent?.trim();
      if (!text) continue;

      if (linkedVideoIdNear(el) === videoId) return text;
    }
  }

  return "";
}

function titleFromDom(videoId: string | null): string {
  const author =
    document.querySelector('[data-e2e="browse-username"]')?.textContent?.trim() ||
    document.querySelector('[data-e2e="video-author-uniqueid"]')?.textContent?.trim();
  const desc = videoId ? domCaption(videoId) : "";
  if (author && desc) return `${author}: ${desc.slice(0, 80)}`;
  return ogTitle(document.documentElement.innerHTML) || document.title || "";
}

export function captureTikTokExtras(pageUrl: string): PlatformCaptureExtras {
  const videoId = extractTikTokVideoId(pageUrl);
  const videoUrl = canonicalizeTikTokUrl(pageUrl);
  const title = titleFromDom(videoId) || undefined;

  // Feed / For You paths have no video id — URL only, never a random caption.
  if (!videoId) {
    return { ...emptyExtras(), title, videoUrl };
  }

  const universal = readUniversalData(videoId);
  const sigi = readSigiState(videoId);

  const fromJson = pickLongestText(
    findStringByKeysNearId(universal, ["desc", "description", "title"], videoId),
    findStringByKeysNearId(sigi, ["desc", "description", "text"], videoId),
  );

  // Prefer id-scoped JSON; DOM fallback is also scoped to this video id.
  const transcript = firstNonEmpty(fromJson, domCaption(videoId));

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
