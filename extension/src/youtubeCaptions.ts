import {
  extractYouTubeVideoId,
  joinDomTranscriptSegmentTexts,
  labelLooksLikeHideTranscript,
  labelLooksLikeShowTranscript,
  parseTimedTextJson3,
  parseTimedTextXml,
  pickCaptionTrack,
  textMentionsExactId,
  type CaptionTrack,
  type Locale,
} from "@ai-video-fact-check/shared";

interface PlayerCaptionTrack {
  baseUrl?: string;
  languageCode?: string;
  name?: { simpleText?: string };
  kind?: string;
}

interface PlayerResponse {
  captions?: {
    playerCaptionsTracklistRenderer?: {
      captionTracks?: PlayerCaptionTrack[];
    };
  };
  videoDetails?: {
    title?: string;
    videoId?: string;
    shortDescription?: string;
  };
}

function playerMatchesVideo(
  player: PlayerResponse | null | undefined,
  videoId: string,
): boolean {
  const id = player?.videoDetails?.videoId;
  return Boolean(id && id === videoId);
}

function parsePlayerResponseFromText(text: string): PlayerResponse | null {
  const marker = "ytInitialPlayerResponse";
  const idx = text.indexOf(marker);
  if (idx === -1) return null;
  const eq = text.indexOf("=", idx);
  if (eq === -1) return null;
  const start = text.indexOf("{", eq);
  if (start === -1) return null;
  const json = extractBalancedJson(text, start);
  if (!json) return null;
  try {
    return JSON.parse(json) as PlayerResponse;
  } catch {
    return null;
  }
}

function readPlayerResponseFromDom(videoId: string): PlayerResponse | null {
  // Isolated world cannot read page `window.ytInitialPlayerResponse`.
  // After SPA navigation, older scripts may still hold the previous video.
  for (const script of Array.from(document.scripts)) {
    const parsed = parsePlayerResponseFromText(script.textContent ?? "");
    if (playerMatchesVideo(parsed, videoId)) return parsed;
  }
  return null;
}

async function fetchPlayerResponse(videoId: string): Promise<PlayerResponse | null> {
  try {
    const res = await fetch(
      `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
      { credentials: "same-origin" },
    );
    if (!res.ok) return null;
    return parsePlayerResponseFromText(await res.text());
  } catch {
    return null;
  }
}

function extractBalancedJson(source: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < source.length; i++) {
    const ch = source[i]!;
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return null;
}

function tracksFromPlayer(player: PlayerResponse): CaptionTrack[] {
  const raw =
    player.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  return raw
    .filter((t): t is PlayerCaptionTrack & { baseUrl: string; languageCode: string } =>
      Boolean(t.baseUrl && t.languageCode),
    )
    .map((t) => ({
      baseUrl: t.baseUrl,
      languageCode: t.languageCode,
      name: t.name?.simpleText,
      kind: t.kind,
    }));
}

async function fetchCaptionText(baseUrl: string): Promise<string> {
  const url = new URL(baseUrl);
  // Prefer json3 when possible; fall back to XML.
  if (!url.searchParams.has("fmt")) {
    url.searchParams.set("fmt", "json3");
  }
  // YouTube often requires client hint; PoToken may still be needed (empty 200).
  if (!url.searchParams.has("c")) {
    url.searchParams.set("c", "WEB");
  }
  const res = await fetch(url.toString(), { credentials: "same-origin" });
  if (!res.ok) return "";
  const body = await res.text();
  if (!body.trim()) return "";
  if (url.searchParams.get("fmt") === "json3") {
    const parsed = parseTimedTextJson3(body);
    if (parsed) return parsed;
  }
  if (body.includes("<text") || body.includes("<p ")) {
    return parseTimedTextXml(body);
  }
  // WebVTT
  if (body.includes("WEBVTT") || body.includes("-->")) {
    return body
      .split(/\r?\n/)
      .filter(
        (line) =>
          line &&
          !line.startsWith("WEBVTT") &&
          !line.includes("-->") &&
          !/^\d+$/.test(line.trim()),
      )
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }
  return "";
}

function readScriptJsonAssignment(
  marker: string,
  videoId?: string,
): unknown | null {
  for (const script of Array.from(document.scripts)) {
    const text = script.textContent ?? "";
    if (!text.includes(marker)) continue;
    // After SPA navigation, older scripts linger — require this video id.
    if (videoId && !textMentionsExactId(text, videoId)) continue;
    const idx = text.indexOf(marker);
    const eq = text.indexOf("=", idx);
    if (eq === -1) continue;
    const start = text.indexOf("{", eq);
    if (start === -1) continue;
    const json = extractBalancedJson(text, start);
    if (!json) continue;
    try {
      const parsed = JSON.parse(json) as unknown;
      if (videoId && !textMentionsExactId(JSON.stringify(parsed), videoId)) {
        continue;
      }
      return parsed;
    } catch {
      /* try next script */
    }
  }
  return null;
}

function findTranscriptParams(node: unknown, videoId: string, depth = 0): string {
  if (!node || depth > 20) return "";
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findTranscriptParams(item, videoId, depth + 1);
      if (found) return found;
    }
    return "";
  }
  if (typeof node !== "object") return "";
  const obj = node as Record<string, unknown>;
  const endpoint = obj.getTranscriptEndpoint;
  if (endpoint && typeof endpoint === "object") {
    const params = (endpoint as { params?: unknown }).params;
    if (typeof params === "string" && params.length > 10) {
      // Only accept params that decode to this exact video id token.
      try {
        const decoded = atob(params.replace(/-/g, "+").replace(/_/g, "/"));
        if (textMentionsExactId(decoded, videoId)) return params;
      } catch {
        /* ignore undecodable params */
      }
    }
  }
  for (const value of Object.values(obj)) {
    if (value && typeof value === "object") {
      const found = findTranscriptParams(value, videoId, depth + 1);
      if (found) return found;
    }
  }
  return "";
}

function readInnertubeClientVersion(): string {
  for (const script of Array.from(document.scripts)) {
    const text = script.textContent ?? "";
    const m = text.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/);
    if (m?.[1]) return m[1];
  }
  return "2.20240701.00.00";
}

function collectTranscriptSegments(node: unknown, out: string[], depth = 0): void {
  if (!node || depth > 24) return;
  if (Array.isArray(node)) {
    for (const item of node) collectTranscriptSegments(item, out, depth + 1);
    return;
  }
  if (typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  const renderer = obj.transcriptSegmentRenderer;
  if (renderer && typeof renderer === "object") {
    const snippet = (renderer as { snippet?: { runs?: Array<{ text?: string }> } })
      .snippet;
    const text = (snippet?.runs ?? [])
      .map((r) => r.text ?? "")
      .join("")
      .trim();
    if (text) out.push(text);
  }
  for (const value of Object.values(obj)) {
    if (value && typeof value === "object") {
      collectTranscriptSegments(value, out, depth + 1);
    }
  }
}

/**
 * Engagement-panel transcript (same-origin youtubei). Works when timedtext
 * returns empty without a PoToken.
 */
async function fetchEngagementTranscript(videoId: string): Promise<string> {
  const initialData = readScriptJsonAssignment("ytInitialData", videoId);
  const params = findTranscriptParams(initialData, videoId);
  if (!params) return "";

  const version = readInnertubeClientVersion();
  try {
    const res = await fetch(
      "https://www.youtube.com/youtubei/v1/get_transcript?prettyPrint=false",
      {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-Youtube-Client-Name": "1",
          "X-Youtube-Client-Version": version,
        },
        body: JSON.stringify({
          context: {
            client: {
              clientName: "WEB",
              clientVersion: version,
              hl: (chrome.i18n?.getUILanguage?.() || "en").slice(0, 2),
            },
          },
          params,
        }),
      },
    );
    if (!res.ok) return "";
    const data = (await res.json()) as unknown;
    const lines: string[] = [];
    collectTranscriptSegments(data, lines);
    return lines.join("\n").trim();
  } catch {
    return "";
  }
}

function descriptionFromPlayer(player: PlayerResponse | null): string {
  const desc = player?.videoDetails?.shortDescription?.trim() ?? "";
  return desc;
}

/** True when a <track> src is clearly for this video (not a stale SPA leftover). */
function trackBelongsToVideo(trackSrc: string, videoId: string): boolean {
  if (trackSrc.includes(videoId)) return true;
  try {
    const parsed = new URL(trackSrc, location.href);
    const v = parsed.searchParams.get("v");
    if (v) return v === videoId;
  } catch {
    /* ignore */
  }
  // blob: / unmarked tracks cannot be verified after in-tab navigation.
  return false;
}

async function captionsFromTrackElement(videoId: string): Promise<string> {
  const track = document.querySelector(
    "video track[kind='captions'], video track[kind='subtitles']",
  ) as HTMLTrackElement | null;
  if (!track?.src) return "";
  if (!trackBelongsToVideo(track.src, videoId)) return "";
  try {
    const res = await fetch(track.src, { credentials: "same-origin" });
    if (!res.ok) return "";
    const body = await res.text();
    if (body.includes("<text")) return parseTimedTextXml(body);
    // WebVTT — strip cues headers roughly
    return body
      .split(/\r?\n/)
      .filter(
        (line) =>
          line &&
          !line.startsWith("WEBVTT") &&
          !line.includes("-->") &&
          !/^\d+$/.test(line.trim()),
      )
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  } catch {
    return "";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Page URL (+ watch flexy video-id when present) must match this capture.
 * Prevents packaging a previous SPA video's leftover transcript panel.
 */
function domTranscriptContextMatchesVideo(videoId: string): boolean {
  if (extractYouTubeVideoId(location.href) !== videoId) return false;
  const flexy = document.querySelector("ytd-watch-flexy");
  const flexyId = flexy?.getAttribute("video-id");
  if (flexyId && flexyId !== videoId) return false;
  return true;
}

/**
 * Plain text from YouTube's engagement transcript panel for `videoId` only.
 * Never falls back to `document.body` (avoids unrelated / stale segments).
 */
export function readDomTranscriptPanelText(videoId: string): string {
  if (!domTranscriptContextMatchesVideo(videoId)) return "";

  const roots = Array.from(
    document.querySelectorAll(
      'ytd-engagement-panel-section-list-renderer[target-id*="transcript"], ytd-transcript-renderer, ytd-transcript-search-panel-renderer',
    ),
  );

  for (const root of roots) {
    const nodes = root.querySelectorAll(
      "ytd-transcript-segment-renderer yt-formatted-string, ytd-transcript-segment-renderer .segment-text, ytd-transcript-segment-renderer [class*='segment-text']",
    );
    const texts = Array.from(nodes).map((node) => node.textContent);
    const joined = joinDomTranscriptSegmentTexts(texts);
    if (joined) return joined;
  }
  return "";
}

function controlLabel(el: Element): string {
  return (
    el.getAttribute("aria-label") ||
    el.getAttribute("title") ||
    el.textContent ||
    ""
  );
}

function findTranscriptControl(
  predicate: (label: string) => boolean,
): HTMLElement | null {
  const clickables = Array.from(
    document.querySelectorAll(
      "button, yt-button-shape button, tp-yt-paper-button, a[role='button']",
    ),
  );
  const target = clickables.find((el) => predicate(controlLabel(el)));
  return target instanceof HTMLElement ? target : null;
}

/**
 * Best-effort: refresh YouTube's native transcript panel for this video, then
 * read segments. Never trusts a pre-open panel (SPA leftovers from prior watch).
 */
async function captionsFromDomTranscriptPanel(
  videoId: string,
): Promise<string> {
  if (!domTranscriptContextMatchesVideo(videoId)) return "";

  // Close a leftover panel first so "Show transcript" reloads for this video.
  const hideBtn = findTranscriptControl(labelLooksLikeHideTranscript);
  if (hideBtn) {
    try {
      hideBtn.click();
    } catch {
      /* ignore */
    }
    await sleep(250);
  }

  if (!domTranscriptContextMatchesVideo(videoId)) return "";

  const showBtn = findTranscriptControl(labelLooksLikeShowTranscript);
  if (showBtn) {
    try {
      showBtn.click();
    } catch {
      /* ignore */
    }
  } else {
    // Panel already open with no hide control — still refuse stale text.
    return "";
  }

  const deadline = Date.now() + 2800;
  while (Date.now() < deadline) {
    await sleep(200);
    if (!domTranscriptContextMatchesVideo(videoId)) return "";
    const text = readDomTranscriptPanelText(videoId);
    if (text) return text;
  }
  return "";
}

export interface YouTubeCaptureExtras {
  title?: string;
  transcript?: string;
  transcriptSource: "captions" | "track" | "post" | "none";
}

function shortsDomTitle(videoId: string): string | undefined {
  // Shorts SPA: only accept a title tied to this video id — never the
  // globally "active" reel (often a different clip after swipe).
  const link = document.querySelector(
    `ytd-reel-video-renderer a[href*="/shorts/${videoId}"], ytd-reel-video-renderer a[href*="${videoId}"]`,
  );
  return (
    link
      ?.closest("ytd-reel-video-renderer")
      ?.querySelector("#video-title, h2")
      ?.textContent?.trim() || undefined
  );
}

function isShortsUrl(url: string): boolean {
  try {
    return new URL(url).pathname.toLowerCase().includes("/shorts/");
  } catch {
    return /youtube\.com\/shorts\//i.test(url);
  }
}

export async function captureYouTubeExtras(
  pageUrl: string,
  locale: Locale,
): Promise<YouTubeCaptureExtras> {
  const videoId = extractYouTubeVideoId(pageUrl);
  if (!videoId) {
    return { transcriptSource: "none" };
  }

  let player = readPlayerResponseFromDom(videoId);
  if (!playerMatchesVideo(player, videoId)) {
    player = await fetchPlayerResponse(videoId);
  }
  if (player && !playerMatchesVideo(player, videoId)) {
    player = null;
  }

  let title = playerMatchesVideo(player, videoId)
    ? player?.videoDetails?.title
    : undefined;
  if (!title && isShortsUrl(pageUrl)) {
    title = shortsDomTitle(videoId);
  }

  const tracks = player ? tracksFromPlayer(player) : [];
  const preferred = pickCaptionTrack(tracks, locale);
  const ordered = preferred
    ? [preferred, ...tracks.filter((t) => t.baseUrl !== preferred.baseUrl)]
    : tracks;

  for (const track of ordered) {
    try {
      const transcript = await fetchCaptionText(track.baseUrl);
      if (transcript) {
        return { title, transcript, transcriptSource: "captions" };
      }
    } catch {
      /* try next track */
    }
  }

  const fromTrack = await captionsFromTrackElement(videoId);
  if (fromTrack) {
    return { title, transcript: fromTrack, transcriptSource: "track" };
  }

  const fromPanel = await fetchEngagementTranscript(videoId);
  if (fromPanel) {
    return { title, transcript: fromPanel, transcriptSource: "captions" };
  }

  // B1: native "Show transcript" engagement UI (DOM segments).
  try {
    const fromDom = await captionsFromDomTranscriptPanel(videoId);
    if (fromDom) {
      return { title, transcript: fromDom, transcriptSource: "captions" };
    }
  } catch {
    /* continue ladder */
  }

  const description = descriptionFromPlayer(player);
  if (description) {
    return {
      title,
      transcript: description,
      transcriptSource: "post",
    };
  }

  return { title, transcriptSource: "none" };
}
