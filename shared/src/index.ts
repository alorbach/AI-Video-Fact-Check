export type {
  Locale,
  ChatTargetId,
  PlatformId,
  TranscriptSource,
  PastePackage,
  ChatTarget,
  CaptureResult,
  ExtensionMessage,
} from "./types.js";

export { CHAT_TARGETS } from "./types.js";
export {
  detectPlatform,
  platformLabelKey,
  canonicalizeVideoUrl,
  sameVideoUrl,
} from "./platform.js";
export {
  extractYouTubeVideoId,
  canonicalizeYouTubeUrl,
  pickCaptionTrack,
  parseTimedTextXml,
  parseTimedTextJson3,
  type CaptionTrack,
} from "./youtube.js";
export {
  buildPastePackage,
  captureToPastePackage,
  withManualTranscript,
  formatPastePackageText,
  type BuildPastePackageInput,
} from "./pastePackage.js";
