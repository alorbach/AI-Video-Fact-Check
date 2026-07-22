import {
  captureToPastePackage,
  canonicalizeVideoUrl,
  detectPlatform,
  type CaptureResult,
  type ExtensionMessage,
  type Locale,
  type PlatformId,
} from "@ai-video-fact-check/shared";
import {
  captureFacebookExtras,
  captureInstagramExtras,
  captureTikTokExtras,
  captureXExtras,
} from "./adapters/index.js";
import { installWorkOverlayListener } from "./workOverlay.js";
import { captureYouTubeExtras } from "./youtubeCaptions.js";

const SUPPORTED: PlatformId[] = [
  "youtube",
  "tiktok",
  "x",
  "facebook",
  "instagram",
];

function uiLocale(): Locale {
  const lang = (chrome.i18n?.getUILanguage?.() || navigator.language || "en")
    .toLowerCase()
    .startsWith("de")
    ? "de"
    : "en";
  return lang;
}

function stablePageUrl(): string {
  return location.href;
}

async function capturePage(skipTranscript = false): Promise<CaptureResult> {
  const pageUrl = stablePageUrl();
  const platform = detectPlatform(pageUrl);
  const locale = uiLocale();
  const supported = SUPPORTED.includes(platform);

  let title: string | undefined;
  let transcript: string | undefined;
  let transcriptSource: CaptureResult["transcriptSource"] = "none";
  let videoUrl = canonicalizeVideoUrl(pageUrl);

  if (skipTranscript) {
    title = document.title || undefined;
    if (platform === "tiktok") {
      const extras = captureTikTokExtras(pageUrl);
      title = extras.title || title;
      if (extras.videoUrl) videoUrl = extras.videoUrl;
    } else if (platform === "x") {
      const extras = captureXExtras(pageUrl);
      title = extras.title || title;
      if (extras.videoUrl) videoUrl = extras.videoUrl;
    } else if (platform === "facebook") {
      const extras = captureFacebookExtras(pageUrl);
      title = extras.title || title;
      if (extras.videoUrl) videoUrl = extras.videoUrl;
    } else if (platform === "instagram") {
      const extras = captureInstagramExtras(pageUrl);
      title = extras.title || title;
      if (extras.videoUrl) videoUrl = extras.videoUrl;
    }
    return {
      platform,
      pageUrl,
      videoUrl,
      title,
      transcriptSource: "none",
      supported,
    };
  }

  if (platform === "youtube") {
    const extras = await captureYouTubeExtras(pageUrl, locale);
    title = extras.title || document.title || undefined;
    transcript = extras.transcript;
    transcriptSource = extras.transcriptSource;
  } else if (platform === "tiktok") {
    const extras = captureTikTokExtras(pageUrl);
    title = extras.title;
    transcript = extras.transcript;
    transcriptSource = extras.transcriptSource;
    if (extras.videoUrl) videoUrl = extras.videoUrl;
  } else if (platform === "x") {
    const extras = captureXExtras(pageUrl);
    title = extras.title;
    transcript = extras.transcript;
    transcriptSource = extras.transcriptSource;
    if (extras.videoUrl) videoUrl = extras.videoUrl;
  } else if (platform === "facebook") {
    const extras = captureFacebookExtras(pageUrl);
    title = extras.title;
    transcript = extras.transcript;
    transcriptSource = extras.transcriptSource;
    if (extras.videoUrl) videoUrl = extras.videoUrl;
  } else if (platform === "instagram") {
    const extras = captureInstagramExtras(pageUrl);
    title = extras.title;
    transcript = extras.transcript;
    transcriptSource = extras.transcriptSource;
    if (extras.videoUrl) videoUrl = extras.videoUrl;
  } else {
    title = document.title || undefined;
  }

  return {
    platform,
    pageUrl,
    videoUrl,
    title,
    transcript,
    transcriptSource,
    supported,
  };
}

declare global {
  interface Window {
    __AVFC_CONTENT_READY__?: boolean;
  }
}

// Avoid duplicate listeners if scripting.executeScript injects again.
if (!window.__AVFC_CONTENT_READY__) {
  window.__AVFC_CONTENT_READY__ = true;

  installWorkOverlayListener();

  chrome.runtime.onMessage.addListener(
    (message: ExtensionMessage, _sender, sendResponse) => {
      if (message.type !== "CAPTURE_PAGE") return;

      void capturePage(message.skipTranscript === true)
        .then((result) => {
          const locale = uiLocale();
          const pkg = captureToPastePackage(result, locale);
          const payload: ExtensionMessage = {
            type: "CAPTURE_RESULT",
            result,
            package: pkg,
          };
          sendResponse(payload);
        })
        .catch((err: unknown) => {
          const payload: ExtensionMessage = {
            type: "HANDOFF_FAILED",
            error: err instanceof Error ? err.message : String(err),
          };
          sendResponse(payload);
        });

      return true;
    },
  );
}
