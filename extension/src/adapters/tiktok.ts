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

function domCaption(): string {
  const selectors = [
    '[data-e2e="browse-video-desc"]',
    '[data-e2e="video-desc"]',
    '[data-e2e="new-desc-span"]',
    'h1[data-e2e="browse-video-desc"]',
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    const text = el?.textContent?.trim();
    if (text) return text;
  }
  return "";
}

function titleFromDom(): string {
  const author =
    document.querySelector('[data-e2e="browse-username"]')?.textContent?.trim() ||
    document.querySelector('[data-e2e="video-author-uniqueid"]')?.textContent?.trim();
  const desc = domCaption();
  if (author && desc) return `${author}: ${desc.slice(0, 80)}`;
  return ogTitle(document.documentElement.innerHTML) || document.title || "";
}

export function captureTikTokExtras(pageUrl: string): PlatformCaptureExtras {
  const videoId = extractTikTokVideoId(pageUrl);
  const videoUrl = canonicalizeTikTokUrl(pageUrl);
  const title = titleFromDom() || undefined;

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

  // Prefer id-scoped JSON. DOM on /video/{id} is the open clip; skip unscoped
  // pageMetaPostText (can be longer and from another tile).
  const transcript = firstNonEmpty(fromJson, domCaption());

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
