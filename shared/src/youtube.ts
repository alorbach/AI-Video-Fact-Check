/**
 * YouTube URL / timedtext helpers (no API keys — public timedtext + page data).
 */

const WATCH_ID =
  /(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i;

export function extractYouTubeVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();

    if (host === "youtu.be") {
      const id = parsed.pathname.split("/").filter(Boolean)[0];
      return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
    }

    if (host.includes("youtube")) {
      const v = parsed.searchParams.get("v");
      if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v;

      const parts = parsed.pathname.split("/").filter(Boolean);
      if (
        parts.length >= 2 &&
        (parts[0] === "shorts" || parts[0] === "embed" || parts[0] === "live")
      ) {
        const id = parts[1];
        if (id && /^[A-Za-z0-9_-]{11}$/.test(id)) return id;
      }
    }
  } catch {
    /* fall through */
  }

  const match = url.match(WATCH_ID);
  return match?.[1] ?? null;
}

/** Stable shareable watch URL. */
export function canonicalizeYouTubeUrl(url: string): string {
  const id = extractYouTubeVideoId(url);
  if (!id) return url;
  return `https://www.youtube.com/watch?v=${id}`;
}

export interface CaptionTrack {
  baseUrl: string;
  languageCode: string;
  name?: string;
  kind?: string;
}

/**
 * Prefer UI language, then English/German, then first non-ASR, then any.
 */
export function pickCaptionTrack(
  tracks: CaptionTrack[],
  preferredLang: string,
): CaptionTrack | null {
  if (!tracks.length) return null;
  const pref = preferredLang.toLowerCase().slice(0, 2);

  const byLang = (code: string) =>
    tracks.find((t) => t.languageCode.toLowerCase().startsWith(code));

  return (
    byLang(pref) ??
    byLang("en") ??
    byLang("de") ??
    tracks.find((t) => t.kind !== "asr") ??
    tracks[0] ??
    null
  );
}

/** Parse YouTube timedtext XML (srv1 / classic) into plain lines. */
export function parseTimedTextXml(xml: string): string {
  const texts: string[] = [];
  const re = /<text[^>]*>([\s\S]*?)<\/text>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml)) !== null) {
    const raw = match[1] ?? "";
    const decoded = decodeXmlEntities(
      raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
    );
    if (decoded) texts.push(decoded);
  }
  return texts.join("\n").trim();
}

/** Parse YouTube json3 caption payload. */
export function parseTimedTextJson3(jsonText: string): string {
  let data: unknown;
  try {
    data = JSON.parse(jsonText);
  } catch {
    return "";
  }
  if (!data || typeof data !== "object") return "";
  const events = (data as { events?: unknown }).events;
  if (!Array.isArray(events)) return "";

  const lines: string[] = [];
  for (const event of events) {
    if (!event || typeof event !== "object") continue;
    const segs = (event as { segs?: unknown }).segs;
    if (!Array.isArray(segs)) continue;
    const piece = segs
      .map((s) =>
        s && typeof s === "object" && typeof (s as { utf8?: unknown }).utf8 === "string"
          ? (s as { utf8: string }).utf8
          : "",
      )
      .join("")
      .replace(/\n/g, " ")
      .trim();
    if (piece) lines.push(piece);
  }
  return lines.join("\n").trim();
}

/**
 * True when a control label looks like YouTube's "Show transcript" action
 * (DE/EN), not "Hide transcript".
 */
export function labelLooksLikeShowTranscript(raw: string): boolean {
  const label = raw
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  if (!label) return false;
  if (
    label.includes("transkript anzeigen") ||
    label.includes("show transcript")
  ) {
    return true;
  }
  if (labelLooksLikeHideTranscript(raw)) return false;
  return (
    (label.includes("transcript") || label.includes("transkript")) &&
    (label.includes("show") ||
      label.includes("anzeigen") ||
      label.includes("open") ||
      label === "transcript" ||
      label === "transkript")
  );
}

/** True when a control label looks like "Hide transcript" / "Transkript ausblenden". */
export function labelLooksLikeHideTranscript(raw: string): boolean {
  const label = raw
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  if (!label) return false;
  if (
    label.includes("hide transcript") ||
    label.includes("transkript ausblenden")
  ) {
    return true;
  }
  return (
    (label.includes("transcript") || label.includes("transkript")) &&
    (label.includes("hide") ||
      label.includes("ausblenden") ||
      label.includes("schließen") ||
      label.includes("schliessen") ||
      label.includes("close"))
  );
}

/** Join DOM transcript segment strings (YouTube panel). */
export function joinDomTranscriptSegmentTexts(
  texts: Array<string | null | undefined>,
): string {
  return texts
    .map((t) => (t ?? "").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) =>
      String.fromCodePoint(Number.parseInt(n, 10)),
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) =>
      String.fromCodePoint(Number.parseInt(h, 16)),
    );
}
