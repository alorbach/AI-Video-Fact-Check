/**
 * Facebook: Reels / watch — caption or metadata when exposed.
 */

import {
  canonicalizeFacebookUrl,
  extractFacebookVideoId,
  findStringByKeysNearId,
  ogTitle,
  pageMetaPostText,
  parseJsonAssignment,
  pickLongestText,
  textMentionsExactId,
} from "@ai-video-fact-check/shared";
import { emptyExtras, type PlatformCaptureExtras } from "./types.js";

/**
 * Only harvest Relay/Scheduled payloads scoped to this video id subtree.
 */
function readRelayOrScheduledData(videoId: string): string {
  const chunks: string[] = [];
  for (const script of Array.from(document.scripts)) {
    const text = script.textContent ?? "";
    if (!textMentionsExactId(text, videoId)) continue;
    if (
      !text.includes("message") &&
      !text.includes("description") &&
      !text.includes("marionette")
    ) {
      continue;
    }
    for (const marker of [
      "ScheduledServerJS",
      "RelayPrefetchedStreamCache",
      "__bbox",
    ]) {
      if (!text.includes(marker)) continue;
      const parsed = parseJsonAssignment(text, marker);
      if (parsed) {
        const found = findStringByKeysNearId(
          parsed,
          ["caption", "message", "description", "text"],
          videoId,
        );
        if (found) chunks.push(found);
      }
    }
    // Regex fallback: only accept message text near this video id in the blob.
    const idIdx = text.indexOf(videoId);
    if (idIdx !== -1) {
      const around = text.slice(
        Math.max(0, idIdx - 500),
        Math.min(text.length, idIdx + videoId.length + 2500),
      );
      const messageMatch = around.match(
        /"message"\s*:\s*\{\s*"text"\s*:\s*"((?:\\.|[^"\\])*)"/,
      );
      if (messageMatch?.[1]) {
        try {
          chunks.push(JSON.parse(`"${messageMatch[1]}"`) as string);
        } catch {
          chunks.push(messageMatch[1].replace(/\\"/g, '"'));
        }
      }
    }
  }
  return pickLongestText(...chunks);
}

export function captureFacebookExtras(pageUrl: string): PlatformCaptureExtras {
  const html = document.documentElement.innerHTML;
  const videoId = extractFacebookVideoId(pageUrl);
  const title =
    ogTitle(html) || document.title?.replace(/\s*\|\s*Facebook\s*$/i, "") || undefined;
  const videoUrl = canonicalizeFacebookUrl(pageUrl);

  // Non-video Facebook URLs — package the link only.
  if (!videoId) {
    return { ...emptyExtras(), title, videoUrl };
  }

  // Prefer id-scoped Relay. Meta only when the page markup mentions this video id.
  const relay = readRelayOrScheduledData(videoId);
  const meta = pageMetaPostText(html);
  const transcript =
    relay.trim() ||
    (textMentionsExactId(html, videoId) ? meta : "");


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
