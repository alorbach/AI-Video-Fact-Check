/**
 * TranscribeYouTube caption helper (no API key).
 * Used as a YouTube-only fallback when in-page captions are empty.
 * Sends only the video URL + language hint — never audio.
 */

export const TRANSCRIBE_YOUTUBE_ENDPOINT =
  "https://transcribeyoutube.com/api/transcript";

export interface TranscribeYoutubeSegment {
  text?: string;
  start?: number;
  dur?: number;
}

export interface TranscribeYoutubeResponse {
  ok?: boolean;
  videoId?: string;
  title?: string;
  transcript?: TranscribeYoutubeSegment[];
  error?: string | null;
  message?: string;
}

export function joinTranscribeYoutubeSegments(
  segments: TranscribeYoutubeSegment[] | undefined,
): string {
  if (!segments?.length) return "";
  return segments
    .map((s) => (s.text ?? "").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

/**
 * Map a JSON response body to plain transcript text.
 * Returns null when the helper reports no captions or an error.
 */
export function parseTranscribeYoutubeResponse(
  data: TranscribeYoutubeResponse | null | undefined,
): { text: string; title?: string } | null {
  if (!data) return null;
  if (data.error && data.error !== null && data.ok === false) {
    return null;
  }
  const text = joinTranscribeYoutubeSegments(data.transcript);
  if (!text) return null;
  return {
    text,
    ...(data.title?.trim() ? { title: data.title.trim() } : {}),
  };
}

export interface FetchTranscribeYoutubeOptions {
  /** Override fetch (tests). */
  fetchImpl?: typeof fetch;
  /** Abort after this many ms (default 10_000). */
  timeoutMs?: number;
  endpoint?: string;
}

/**
 * POST video URL to TranscribeYouTube. One attempt; no retry storm.
 */
export async function fetchTranscribeYoutubeTranscript(
  videoUrl: string,
  lang: string,
  options: FetchTranscribeYoutubeOptions = {},
): Promise<{ text: string; title?: string } | null> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const endpoint = options.endpoint ?? TRANSCRIBE_YOUTUBE_ENDPOINT;
  const langHint = (lang || "auto").toLowerCase().slice(0, 2) || "auto";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: videoUrl,
        lang: langHint === "en" || langHint === "de" ? langHint : "auto",
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as TranscribeYoutubeResponse;
    return parseTranscribeYoutubeResponse(data);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
