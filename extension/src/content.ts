import {
  captureToPastePackage,
  canonicalizeYouTubeUrl,
  detectPlatform,
  type CaptureResult,
  type ExtensionMessage,
  type Locale,
} from "@ai-video-fact-check/shared";
import { captureYouTubeExtras } from "./youtubeCaptions.js";

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

function videoUrlForPlatform(
  platform: ReturnType<typeof detectPlatform>,
): string {
  const href = stablePageUrl();
  if (platform === "youtube") return canonicalizeYouTubeUrl(href);
  return href;
}

async function capturePage(): Promise<CaptureResult> {
  const pageUrl = stablePageUrl();
  const platform = detectPlatform(pageUrl);
  const locale = uiLocale();
  const supported = [
    "youtube",
    "tiktok",
    "x",
    "facebook",
    "instagram",
  ].includes(platform);

  let title: string | undefined;
  let transcript: string | undefined;
  let transcriptSource: CaptureResult["transcriptSource"] = "none";

  if (platform === "youtube") {
    const extras = await captureYouTubeExtras(pageUrl, locale);
    title = extras.title || document.title || undefined;
    transcript = extras.transcript;
    transcriptSource = extras.transcriptSource;
  } else {
    title = document.title || undefined;
  }

  return {
    platform,
    pageUrl,
    videoUrl: videoUrlForPlatform(platform),
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

  chrome.runtime.onMessage.addListener(
    (message: ExtensionMessage, _sender, sendResponse) => {
      if (message.type !== "CAPTURE_PAGE") return;

      void capturePage()
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
