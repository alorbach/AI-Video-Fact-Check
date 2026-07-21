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
  canonicalizeTikTokUrl,
  canonicalizeXUrl,
  canonicalizeFacebookUrl,
  canonicalizeInstagramUrl,
  canonicalizeSocialVideoUrl,
  extractTikTokVideoId,
  extractInstagramShortcode,
  extractFacebookVideoId,
  jsonMentionsId,
} from "./socialUrls.js";
export {
  normalizeWhitespace,
  pickLongestText,
  metaContent,
  ogDescription,
  ogTitle,
  metaDescription,
  twitterDescription,
  extractBalancedJson,
  parseJsonAssignment,
  jsonLdTexts,
  findStringByKeys,
  findStringByKeysNearId,
  findSubtreeMentioningId,
  pageMetaPostText,
  textMentionsExactId,
  unwrapInstagramOgCaption,
} from "./pageMeta.js";
export {
  buildPastePackage,
  captureToPastePackage,
  withManualTranscript,
  formatPastePackageText,
  type BuildPastePackageInput,
} from "./pastePackage.js";
