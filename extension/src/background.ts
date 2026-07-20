/**
 * Service worker: Side Panel, context menu, capture coordination.
 * Persist capture state — workers can sleep anytime.
 */

import {
  buildPastePackage,
  canonicalizeVideoUrl,
  captureToPastePackage,
  detectPlatform,
  sameVideoUrl,
  withManualTranscript,
  type CaptureResult,
  type ChatTargetId,
  type ExtensionMessage,
  type Locale,
  type PastePackage,
  type PlatformId,
} from "@ai-video-fact-check/shared";

const STORAGE_KEYS = {
  lastCapture: "lastCapture",
  lastPackage: "lastPackage",
  preferStoredUntil: "preferStoredUntil",
  pinnedTabId: "pinnedTabId",
  pinReady: "pinReady",
  pinnedTargetUrl: "pinnedTargetUrl",
} as const;

const SUPPORTED: PlatformId[] = [
  "youtube",
  "tiktok",
  "x",
  "facebook",
  "instagram",
];

/** Hosts that already load content.js via manifest content_scripts. */
function hasDeclaredContentScript(url: string): boolean {
  return SUPPORTED.includes(detectPlatform(url));
}

function isRestrictedUrl(url: string): boolean {
  return (
    url.startsWith("chrome://") ||
    url.startsWith("chrome-extension://") ||
    url.startsWith("edge://") ||
    url.startsWith("about:")
  );
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "check-video",
      title:
        chrome.i18n.getMessage("contextCheckVideo") || "Check video with AI",
      contexts: ["page", "video", "link"],
    });
    chrome.contextMenus.create({
      id: "check-video-gpt",
      parentId: "check-video",
      title:
        chrome.i18n.getMessage("contextOpenGpt") ||
        "Open with Video Fact-Check GPT",
      contexts: ["page", "video", "link"],
    });
    chrome.contextMenus.create({
      id: "check-video-copy",
      parentId: "check-video",
      title:
        chrome.i18n.getMessage("contextCopyOnly") ||
        "Copy link / transcript only",
      contexts: ["page", "video", "link"],
    });
  });
});

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err) => console.error(err));

function uiLocale(): Locale {
  return chrome.i18n.getUILanguage().toLowerCase().startsWith("de")
    ? "de"
    : "en";
}

async function saveCapture(
  result: CaptureResult,
  pkg: PastePackage,
): Promise<void> {
  await chrome.storage.session.set({
    [STORAGE_KEYS.lastCapture]: result,
    [STORAGE_KEYS.lastPackage]: pkg,
  });
}

async function getStored(): Promise<{
  result: CaptureResult | null;
  package: PastePackage | null;
}> {
  const data = await chrome.storage.session.get({
    [STORAGE_KEYS.lastCapture]: null,
    [STORAGE_KEYS.lastPackage]: null,
  });
  return {
    result: (data[STORAGE_KEYS.lastCapture] as CaptureResult | null) ?? null,
    package: (data[STORAGE_KEYS.lastPackage] as PastePackage | null) ?? null,
  };
}

/** Start a context-menu pin; not readable until completePinnedCapture(). */
async function beginPinnedCapture(
  tabId: number | undefined,
  targetUrl: string,
  ms = 10_000,
): Promise<void> {
  await chrome.storage.session.set({
    [STORAGE_KEYS.preferStoredUntil]: Date.now() + ms,
    [STORAGE_KEYS.pinnedTabId]: tabId ?? null,
    [STORAGE_KEYS.pinReady]: false,
    [STORAGE_KEYS.pinnedTargetUrl]: targetUrl
      ? canonicalizeVideoUrl(targetUrl)
      : "",
  });
}

async function completePinnedCapture(): Promise<void> {
  await chrome.storage.session.set({
    [STORAGE_KEYS.pinReady]: true,
  });
}

async function getPinState(): Promise<{
  active: boolean;
  ready: boolean;
  tabId: number | null;
  targetUrl: string;
}> {
  const data = await chrome.storage.session.get({
    [STORAGE_KEYS.preferStoredUntil]: 0,
    [STORAGE_KEYS.pinnedTabId]: null,
    [STORAGE_KEYS.pinReady]: false,
    [STORAGE_KEYS.pinnedTargetUrl]: "",
  });
  return {
    active: Date.now() < Number(data[STORAGE_KEYS.preferStoredUntil] || 0),
    ready: data[STORAGE_KEYS.pinReady] === true,
    tabId:
      typeof data[STORAGE_KEYS.pinnedTabId] === "number"
        ? (data[STORAGE_KEYS.pinnedTabId] as number)
        : null,
    targetUrl: String(data[STORAGE_KEYS.pinnedTargetUrl] || ""),
  };
}

/**
 * Wait until the context-menu capture finishes or the pin TTL expires.
 * Must not give up while the pin is still active — that would start a
 * second capture that races saveCapture.
 */
async function waitForPinReady(): Promise<boolean> {
  while (true) {
    const pin = await getPinState();
    if (!pin.active) return false;
    if (pin.ready) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
}

function storedMatchesPinTarget(
  stored: { result: CaptureResult; package: PastePackage },
  targetUrl: string,
): boolean {
  if (!targetUrl) return true;
  return (
    sameVideoUrl(stored.package.videoUrl, targetUrl) ||
    sameVideoUrl(stored.result.videoUrl, targetUrl) ||
    sameVideoUrl(stored.result.pageUrl, targetUrl)
  );
}

function isSupportedVideoPackage(pkg: PastePackage, result: CaptureResult): boolean {
  return (
    SUPPORTED.includes(result.platform) ||
    SUPPORTED.includes(detectPlatform(pkg.videoUrl))
  );
}

function hasTranscript(pkg: PastePackage | null): boolean {
  return (
    !!pkg &&
    pkg.transcriptSource !== "none" &&
    Boolean(pkg.transcript?.trim())
  );
}

async function urlOnlyCapture(
  pageUrl: string,
): Promise<{ result: CaptureResult; package: PastePackage }> {
  const locale = uiLocale();
  const videoUrl = canonicalizeVideoUrl(pageUrl);
  const platform = detectPlatform(videoUrl);
  const result: CaptureResult = {
    platform,
    pageUrl,
    videoUrl,
    transcriptSource: "none",
    supported: SUPPORTED.includes(platform),
  };
  const pkg = buildPastePackage({
    videoUrl,
    locale,
    platform,
  });
  await saveCapture(result, pkg);
  return { result, package: pkg };
}

/**
 * Prefer an existing richer capture for the same video over a URL-only fallback.
 */
async function fallbackCapture(
  pageUrl: string,
): Promise<{ result: CaptureResult; package: PastePackage }> {
  const stored = await getStored();
  if (
    stored.result &&
    stored.package &&
    (sameVideoUrl(stored.result.pageUrl, pageUrl) ||
      sameVideoUrl(stored.result.videoUrl, pageUrl) ||
      sameVideoUrl(stored.package.videoUrl, pageUrl)) &&
    hasTranscript(stored.package)
  ) {
    return { result: stored.result, package: stored.package };
  }
  return urlOnlyCapture(pageUrl);
}

async function requestCaptureFromTab(
  tabId: number,
): Promise<ExtensionMessage> {
  return (await chrome.tabs.sendMessage(tabId, {
    type: "CAPTURE_PAGE",
  } satisfies ExtensionMessage)) as ExtensionMessage;
}

async function captureTab(tabId: number): Promise<{
  result: CaptureResult;
  package: PastePackage;
}> {
  let response: ExtensionMessage;

  try {
    response = await requestCaptureFromTab(tabId);
  } catch {
    const tab = await chrome.tabs.get(tabId);
    const declared = tab.url ? hasDeclaredContentScript(tab.url) : false;

    if (declared) {
      await new Promise((r) => setTimeout(r, 120));
      try {
        response = await requestCaptureFromTab(tabId);
      } catch {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ["content.js"],
        });
        response = await requestCaptureFromTab(tabId);
      }
    } else {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["content.js"],
      });
      response = await requestCaptureFromTab(tabId);
    }
  }

  if (response.type === "HANDOFF_FAILED") {
    throw new Error(response.error || "capture failed");
  }
  if (response.type !== "CAPTURE_RESULT") {
    throw new Error("empty capture");
  }

  await saveCapture(response.result, response.package);
  return { result: response.result, package: response.package };
}

/**
 * Capture a context-menu link URL. If the open tab is the same video, prefer
 * in-page capture (captions); otherwise package the link alone.
 */
async function captureLinkUrl(
  linkUrl: string,
  tab: chrome.tabs.Tab,
): Promise<{ result: CaptureResult; package: PastePackage }> {
  const videoUrl = canonicalizeVideoUrl(linkUrl);
  if (tab.id && tab.url && sameVideoUrl(tab.url, linkUrl)) {
    try {
      return await captureTab(tab.id);
    } catch (err) {
      console.error(err);
      return fallbackCapture(videoUrl);
    }
  }
  return urlOnlyCapture(videoUrl);
}

/**
 * Use a pinned context-menu capture only when the in-flight capture has
 * finished and still matches the pin target + user context.
 */
async function pinnedCaptureIfStillValid(
  tab: chrome.tabs.Tab | undefined,
): Promise<{ result: CaptureResult; package: PastePackage } | null> {
  let pin = await getPinState();
  if (!pin.active) return null;

  if (!pin.ready) {
    const ready = await waitForPinReady();
    if (!ready) return null;
    pin = await getPinState();
    if (!pin.active || !pin.ready) return null;
  }

  const stored = await getStored();
  if (!stored.result || !stored.package?.videoUrl) return null;

  if (!storedMatchesPinTarget(
    { result: stored.result, package: stored.package },
    pin.targetUrl,
  )) {
    // Previous session package — new context-menu capture not applied yet.
    return null;
  }

  if (!tab?.url) {
    return { result: stored.result, package: stored.package };
  }

  if (isRestrictedUrl(tab.url) || !SUPPORTED.includes(detectPlatform(tab.url))) {
    // Chat / host page after handoff or link context on a non-video site.
    return { result: stored.result, package: stored.package };
  }

  if (pin.tabId != null && tab.id === pin.tabId) {
    const tabIsSupported = SUPPORTED.includes(detectPlatform(tab.url));
    if (!tabIsSupported) {
      // Host page after link context-menu — keep pin.
      return { result: stored.result, package: stored.package };
    }
    // Same tab navigated to a supported video: only keep if it is the pin target.
    if (
      sameVideoUrl(stored.package.videoUrl, tab.url) ||
      sameVideoUrl(stored.result.videoUrl, tab.url) ||
      sameVideoUrl(pin.targetUrl, tab.url)
    ) {
      return { result: stored.result, package: stored.package };
    }
    return null;
  }

  if (
    sameVideoUrl(stored.package.videoUrl, tab.url) ||
    sameVideoUrl(stored.result.pageUrl, tab.url) ||
    sameVideoUrl(stored.result.videoUrl, tab.url)
  ) {
    return { result: stored.result, package: stored.package };
  }

  return null;
}

async function captureActiveTab(options?: {
  force?: boolean;
}): Promise<{
  result: CaptureResult;
  package: PastePackage;
} | null> {
  const force = options?.force === true;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!force) {
    const pinned = await pinnedCaptureIfStillValid(tab);
    if (pinned) return pinned;

    // Pin still active but not usable — wait out the in-flight capture;
    // never start a competing capture on the same tab.
    const pin = await getPinState();
    if (pin.active && !pin.ready) {
      if (await waitForPinReady()) {
        const again = await pinnedCaptureIfStillValid(tab);
        if (again) return again;
      }
    } else if (pin.active && pin.ready) {
      // Ready but rejected by tab/URL checks — do not overwrite with a weaker scan.
      const stored = await getStored();
      if (
        stored.result &&
        stored.package?.videoUrl &&
        storedMatchesPinTarget(
          { result: stored.result, package: stored.package },
          pin.targetUrl,
        )
      ) {
        return { result: stored.result, package: stored.package };
      }
    }
  }

  if (!tab?.id || !tab.url) {
    const stored = await getStored();
    if (stored.result && stored.package?.videoUrl) {
      return { result: stored.result, package: stored.package };
    }
    return null;
  }

  if (isRestrictedUrl(tab.url)) {
    const stored = await getStored();
    // Never replace a video package with chrome:// — including forced Scan.
    if (
      stored.result &&
      stored.package?.videoUrl &&
      isSupportedVideoPackage(stored.package, stored.result)
    ) {
      return { result: stored.result, package: stored.package };
    }
    const locale = uiLocale();
    const result: CaptureResult = {
      platform: "unknown",
      pageUrl: tab.url,
      videoUrl: tab.url,
      transcriptSource: "none",
      supported: false,
    };
    const pkg = captureToPastePackage(result, locale);
    await saveCapture(result, pkg);
    return { result, package: pkg };
  }

  const platform = detectPlatform(tab.url);
  if (!SUPPORTED.includes(platform)) {
    // e.g. ChatGPT/Gemini after handoff — keep the last video package,
    // even when the user clicks Scan on the chat tab.
    const stored = await getStored();
    if (
      stored.result &&
      stored.package?.videoUrl &&
      isSupportedVideoPackage(stored.package, stored.result)
    ) {
      return { result: stored.result, package: stored.package };
    }
  }

  if (!force) {
    const stored = await getStored();
    if (
      stored.result &&
      stored.package &&
      sameVideoUrl(stored.package.videoUrl, tab.url) &&
      hasTranscript(stored.package)
    ) {
      return { result: stored.result, package: stored.package };
    }
  }

  try {
    return await captureTab(tab.id);
  } catch {
    return fallbackCapture(tab.url);
  }
}

/** Deliver once; retry only while the Side Panel is not listening yet. */
async function notifySidePanel(payload: ExtensionMessage): Promise<void> {
  const delaysMs = [0, 300, 800];
  for (let i = 0; i < delaysMs.length; i++) {
    const wait = delaysMs[i]! - (i === 0 ? 0 : delaysMs[i - 1]!);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    try {
      await chrome.runtime.sendMessage(payload);
      return;
    } catch {
      /* Side Panel may not be listening yet */
    }
  }
}

async function openSidePanelAndHandoff(
  tab: chrome.tabs.Tab,
  target: ChatTargetId | "copy_only",
  linkUrl?: string,
): Promise<void> {
  if (!tab.windowId) return;

  const useLink =
    Boolean(linkUrl) && SUPPORTED.includes(detectPlatform(linkUrl!));
  const targetUrl = useLink ? linkUrl! : tab.url || linkUrl || "";

  // Pin as not-ready so readers wait for this capture (not a prior package).
  await beginPinnedCapture(tab.id, targetUrl);
  await chrome.sidePanel.open({ windowId: tab.windowId });

  try {
    if (useLink && linkUrl) {
      await captureLinkUrl(linkUrl, tab);
    } else if (tab.id) {
      try {
        await captureTab(tab.id);
      } catch (err) {
        console.error(err);
        if (tab.url) await fallbackCapture(tab.url);
      }
    } else if (linkUrl) {
      await urlOnlyCapture(canonicalizeVideoUrl(linkUrl));
    }
  } finally {
    await completePinnedCapture();
  }

  const payload: ExtensionMessage =
    target === "copy_only"
      ? { type: "COPY_PACKAGE_ONLY" }
      : { type: "START_HANDOFF", target };

  await notifySidePanel(payload);
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab) return;

  const linkUrl =
    typeof info.linkUrl === "string" && info.linkUrl ? info.linkUrl : undefined;

  if (info.menuItemId === "check-video-gpt" || info.menuItemId === "check-video") {
    await openSidePanelAndHandoff(tab, "chatgpt_video_faktencheck", linkUrl);
    return;
  }
  if (info.menuItemId === "check-video-copy") {
    await openSidePanelAndHandoff(tab, "copy_only", linkUrl);
  }
});

chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse) => {
    if (message.type === "CAPTURE_ACTIVE_TAB") {
      void captureActiveTab({ force: message.force === true })
        .then(async (captured) => {
          if (!captured) {
            sendResponse({
              type: "LAST_CAPTURE",
              result: null,
              package: null,
            } satisfies ExtensionMessage);
            return;
          }
          sendResponse({
            type: "LAST_CAPTURE",
            result: captured.result,
            package: captured.package,
          } satisfies ExtensionMessage);
        })
        .catch((err: unknown) => {
          sendResponse({
            type: "HANDOFF_FAILED",
            error: err instanceof Error ? err.message : String(err),
          } satisfies ExtensionMessage);
        });
      return true;
    }

    if (message.type === "GET_LAST_CAPTURE") {
      void getStored().then((stored) => {
        sendResponse({
          type: "LAST_CAPTURE",
          result: stored.result,
          package: stored.package,
        } satisfies ExtensionMessage);
      });
      return true;
    }

    if (message.type === "SET_MANUAL_TRANSCRIPT") {
      void (async () => {
        const stored = await getStored();
        const locale = message.locale;
        const base =
          stored.package ??
          buildPastePackage({
            videoUrl: stored.result?.videoUrl || stored.result?.pageUrl || "",
            locale,
            platform: stored.result?.platform,
          });
        if (!base.videoUrl) {
          sendResponse({
            type: "HANDOFF_FAILED",
            error: "no-url",
          } satisfies ExtensionMessage);
          return;
        }
        const pkg = withManualTranscript(base, message.transcript);
        const result: CaptureResult = {
          platform: pkg.platform ?? "unknown",
          pageUrl: stored.result?.pageUrl ?? pkg.videoUrl,
          videoUrl: pkg.videoUrl,
          title: stored.result?.title,
          transcript: pkg.transcript,
          transcriptSource: pkg.transcriptSource,
          supported: stored.result?.supported ?? true,
        };
        await saveCapture(result, pkg);
        sendResponse({
          type: "LAST_CAPTURE",
          result,
          package: pkg,
        } satisfies ExtensionMessage);
      })();
      return true;
    }

    if (message.type === "ANALYZE_PAGE") {
      void (async () => {
        try {
          await captureTab(message.tabId);
          sendResponse({
            type: "START_HANDOFF",
            target: message.target,
          } satisfies ExtensionMessage);
        } catch (err: unknown) {
          sendResponse({
            type: "HANDOFF_FAILED",
            error: err instanceof Error ? err.message : String(err),
          } satisfies ExtensionMessage);
        }
      })();
      return true;
    }

    return false;
  },
);
