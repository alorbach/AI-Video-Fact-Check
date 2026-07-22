import { getMasterPrompt } from "./masterPrompt.js";
import type {
  CaptureResult,
  ChatTargetId,
  Locale,
  PastePackage,
  PlatformId,
  TranscriptSource,
} from "./types.js";
import { CHAT_TARGETS } from "./types.js";
import { canonicalizeVideoUrl, detectPlatform } from "./platform.js";

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
  const videoUrl = canonicalizeVideoUrl(input.videoUrl);

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

/** Plain-text clipboard body (PRODUCT.md). Target selects short ask vs master prompt. */
export function formatPastePackageText(
  pkg: PastePackage,
  target?: ChatTargetId,
): string {
  const unavailable =
    pkg.locale === "de"
      ? "nicht verfügbar – bitte nur anhand der URL prüfen"
      : "not available – please check using the URL only";

  const transcriptBlock = pkg.transcript?.trim() || unavailable;
  const transcriptLabel =
    pkg.locale === "de"
      ? pkg.transcriptSource === "post"
        ? "Beitragstext / Untertitel (falls vorhanden):"
        : pkg.transcriptSource === "external"
          ? "Transkript / Untertitel (Hilfsdienst):"
          : "Transkript / Untertitel (falls vorhanden):"
      : pkg.transcriptSource === "post"
        ? "Post text / captions (if available):"
        : pkg.transcriptSource === "external"
          ? "Transcript / captions (helper service):"
          : "Transcript / captions (if available):";

  const material =
    pkg.locale === "de"
      ? ["Video-URL:", pkg.videoUrl, "", transcriptLabel, transcriptBlock]
      : ["Video URL:", pkg.videoUrl, "", transcriptLabel, transcriptBlock];

  const needsMaster =
    target !== undefined &&
    (CHAT_TARGETS[target]?.needsEmbeddedMasterPrompt ?? false);

  if (needsMaster) {
    return [getMasterPrompt(pkg.locale), "", "---", "", ...material].join("\n");
  }

  if (pkg.locale === "de") {
    return [
      ...material,
      "",
      "Bitte führe einen verständlichen Faktencheck durch (Bewertung 1–10,",
      "kurze Zusammenfassung, wichtige Behauptungen, Quellen, Unsicherheiten).",
    ].join("\n");
  }

  return [
    ...material,
    "",
    "Please run a clear fact-check (score 1–10, short summary,",
    "important claims, sources, uncertainties).",
  ].join("\n");
}
