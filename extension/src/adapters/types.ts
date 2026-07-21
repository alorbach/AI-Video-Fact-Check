import type { TranscriptSource } from "@ai-video-fact-check/shared";

export interface PlatformCaptureExtras {
  title?: string;
  transcript?: string;
  transcriptSource: TranscriptSource;
  /** Prefer this over page URL when a stable share link was found. */
  videoUrl?: string;
}

export function emptyExtras(): PlatformCaptureExtras {
  return { transcriptSource: "none" };
}
