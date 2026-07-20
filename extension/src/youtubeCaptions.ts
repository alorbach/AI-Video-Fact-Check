import {
  extractYouTubeVideoId,
  parseTimedTextJson3,
  parseTimedTextXml,
  pickCaptionTrack,
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
  videoDetails?: { title?: string; videoId?: string };
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
  const res = await fetch(url.toString(), { credentials: "same-origin" });
  if (!res.ok) return "";
  const body = await res.text();
  if (url.searchParams.get("fmt") === "json3") {
    const parsed = parseTimedTextJson3(body);
    if (parsed) return parsed;
  }
  return parseTimedTextXml(body);
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

export interface YouTubeCaptureExtras {
  title?: string;
  transcript?: string;
  transcriptSource: "captions" | "track" | "none";
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

  const title = playerMatchesVideo(player, videoId)
    ? player?.videoDetails?.title
    : undefined;
  const tracks = player ? tracksFromPlayer(player) : [];
  const preferred = pickCaptionTrack(tracks, locale);

  if (preferred) {
    try {
      const transcript = await fetchCaptionText(preferred.baseUrl);
      if (transcript) {
        return { title, transcript, transcriptSource: "captions" };
      }
    } catch {
      /* fall through */
    }
  }

  const fromTrack = await captionsFromTrackElement(videoId);
  if (fromTrack) {
    return { title, transcript: fromTrack, transcriptSource: "track" };
  }

  return { title, transcriptSource: "none" };
}
