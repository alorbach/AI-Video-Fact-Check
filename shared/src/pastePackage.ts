import type {
  CaptureResult,
  Locale,
  PastePackage,
  PlatformId,
  TranscriptSource,
} from "./types.js";
import { detectPlatform } from "./platform.js";
import { canonicalizeYouTubeUrl } from "./youtube.js";

export interface BuildPastePackageInput {
  videoUrl: string;
  locale: Locale;
  platform?: PlatformId;
  transcript?: string;
  transcriptSource?: TranscriptSource;
}

/** Normalize URL and build a PastePackage. */
export function buildPastePackage(input: BuildPastePackageInput): PastePackage {
  const platform = input.platform ?? detectPlatform(input.videoUrl);
  const videoUrl =
    platform === "youtube"
      ? canonicalizeYouTubeUrl(input.videoUrl)
      : input.videoUrl;

  const trimmed = input.transcript?.trim();
  const hasTranscript = Boolean(trimmed);
  const transcriptSource: TranscriptSource =
    input.transcriptSource ?? (hasTranscript ? "captions" : "none");

  return {
    videoUrl,
    platform,
    locale: input.locale,
    transcriptSource: hasTranscript ? transcriptSource : "none",
    ...(hasTranscript ? { transcript: trimmed } : {}),
  };
}

export function captureToPastePackage(
  result: CaptureResult,
  locale: Locale,
): PastePackage {
  return buildPastePackage({
    videoUrl: result.videoUrl || result.pageUrl,
    locale,
    platform: result.platform,
    transcript: result.transcript,
    transcriptSource: result.transcriptSource,
  });
}

/**
 * Apply a user-pasted transcript onto an existing package / capture URL.
 */
export function withManualTranscript(
  base: PastePackage,
  transcript: string,
): PastePackage {
  const trimmed = transcript.trim();
  if (!trimmed) {
    return {
      ...base,
      transcriptSource: "none",
      transcript: undefined,
    };
  }
  return {
    ...base,
    transcript: trimmed,
    transcriptSource: "manual",
  };
}

/** Plain-text clipboard body (PRODUCT.md). */
export function formatPastePackageText(pkg: PastePackage): string {
  const unavailable =
    pkg.locale === "de"
      ? "nicht verfügbar – bitte nur anhand der URL prüfen"
      : "not available – please check using the URL only";

  const transcriptBlock =
    pkg.transcript?.trim() || unavailable;

  if (pkg.locale === "de") {
    return [
      "Video-URL:",
      pkg.videoUrl,
      "",
      "Transkript / Untertitel (falls vorhanden):",
      transcriptBlock,
      "",
      "Bitte führe einen verständlichen Faktencheck durch (Bewertung 1–10,",
      "kurze Zusammenfassung, wichtige Behauptungen, Quellen, Unsicherheiten).",
    ].join("\n");
  }

  return [
    "Video URL:",
    pkg.videoUrl,
    "",
    "Transcript / captions (if available):",
    transcriptBlock,
    "",
    "Please run a clear fact-check (score 1–10, short summary,",
    "important claims, sources, uncertainties).",
  ].join("\n");
}
