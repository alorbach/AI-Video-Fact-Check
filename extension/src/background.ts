/**
 * Service worker: Side Panel, context menu, capture coordination.
 * Persist capture state — workers can sleep anytime.
 */

import {
  buildPastePackage,
  canonicalizeVideoUrl,
  captureToPastePackage,
  CHAT_TARGETS,
  detectPlatform,
  fetchTranscribeYoutubeTranscript,
  getMessageCharLimit,
  isPostSendChatPath,
  PENDING_CHAT_HANDOFF_KEY,
  PENDING_CHAT_HANDOFFS_KEY,
  pendingHandoffMessages,
  resplitAfterTooLong,
  sameVideoUrl,
  withManualTranscript,
  WORK_CANCELLED_KEY,
  type CaptureResult,
  type ChatTargetId,
  type ExtensionMessage,
  type Locale,
  type PastePackage,
  type PendingChatHandoff,
  type PendingChatHandoffs,
  type PlatformId,
  type WorkOverlayPhase,
} from "@ai-video-fact-check/shared";
import {
  pageInjectAndSend,
  waitComposerReadyForNext,
} from "./chatInjectMain.js";

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

/** Hosts that load content.js via manifest content_scripts. */
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

function isChatHandoffUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return (
      host === "chatgpt.com" ||
      host.endsWith(".chatgpt.com") ||
      host === "gemini.google.com" ||
      host.endsWith(".gemini.google.com") ||
      host === "claude.ai" ||
      host.endsWith(".claude.ai") ||
      host === "copilot.microsoft.com" ||
      host.endsWith(".copilot.microsoft.com")
    );
  } catch {
    return false;
  }
}

async function emitChatInjectResult(
  ok: boolean,
  handoff: Pick<PendingChatHandoff, "tabId" | "at">,
  reason?: string,
  progress?: { part: number; total: number },
): Promise<void> {
  try {
    await chrome.runtime.sendMessage({
      type: "CHAT_INJECT_RESULT",
      ok,
      tabId: handoff.tabId,
      at: handoff.at,
      ...(reason ? { reason } : {}),
      ...(progress
        ? { part: progress.part, total: progress.total }
        : {}),
    } satisfies ExtensionMessage);
  } catch {
    /* side panel closed */
  }
}

async function isWorkCancelled(sinceAt?: number): Promise<boolean> {
  const data = await chrome.storage.session.get(WORK_CANCELLED_KEY);
  const cancelledAt = data[WORK_CANCELLED_KEY];
  if (typeof cancelledAt !== "number") return false;
  if (sinceAt != null && cancelledAt < sinceAt) return false;
  return true;
}

async function markWorkCancelled(): Promise<void> {
  await chrome.storage.session.set({ [WORK_CANCELLED_KEY]: Date.now() });
}

async function sendOverlayToTab(
  tabId: number,
  message: ExtensionMessage,
): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch {
    /* content script missing */
  }
}

async function showWorkOverlay(
  tabId: number,
  phase: WorkOverlayPhase,
  part?: number,
  total?: number,
): Promise<void> {
  await sendOverlayToTab(tabId, {
    type: "SHOW_WORK_OVERLAY",
    phase,
    ...(part != null ? { part } : {}),
    ...(total != null ? { total } : {}),
  });
}

async function hideWorkOverlay(tabId: number): Promise<void> {
  await sendOverlayToTab(tabId, { type: "HIDE_WORK_OVERLAY" });
}

async function clearAllPendingHandoffs(): Promise<void> {
  await withPendingClaimLock(async () => {
    await writePendingMap({});
  });
}

async function isTranscriptEnabled(): Promise<boolean> {
  const { enableTranscript } = await chrome.storage.sync.get({
    enableTranscript: true,
  });
  return enableTranscript !== false;
}

function stripTranscript(
  result: CaptureResult,
  pkg: PastePackage,
): { result: CaptureResult; package: PastePackage } {
  const nextResult: CaptureResult = {
    ...result,
    transcript: undefined,
    transcriptSource: "none",
  };
  const nextPkg = buildPastePackage({
    videoUrl: pkg.videoUrl,
    locale: pkg.locale,
    platform: pkg.platform ?? result.platform,
  });
  return { result: nextResult, package: nextPkg };
}

/** Drop auto-captured captions when the Settings toggle is off (keep manual). */
async function applyTranscriptPreference(captured: {
  result: CaptureResult;
  package: PastePackage;
}): Promise<{ result: CaptureResult; package: PastePackage }> {
  if (await isTranscriptEnabled()) return captured;
  if (captured.package.transcriptSource === "manual") return captured;
  if (
    captured.package.transcriptSource === "none" &&
    !captured.package.transcript?.trim()
  ) {
    return captured;
  }
  return stripTranscript(captured.result, captured.package);
}

/** Tab closed / navigated away during delayed inject kicks — not actionable. */
function isGoneTabError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  // Match EN + DE Chrome messages (locale may translate).
  return (
    /no tab with id|kein tab mit/i.test(msg) ||
    /frame with id|frame mit id/i.test(msg) ||
    /was removed|wurde entfernt/i.test(msg) ||
    /tab was closed|tab.*geschlossen/i.test(msg) ||
    /cannot access|zugriff.*nicht/i.test(msg)
  );
}

async function tabStillOpen(tabId: number): Promise<boolean> {
  try {
    await chrome.tabs.get(tabId);
    return true;
  } catch {
    return false;
  }
}

/**
 * Serialize pending claims — SW async callers (onUpdated + kicks + probe)
 * otherwise all read the same payload before any remove.
 */
let pendingClaimChain: Promise<unknown> = Promise.resolve();

function withPendingClaimLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = pendingClaimChain.then(fn, fn);
  pendingClaimChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function tabKey(tabId: number): string {
  return String(tabId);
}

/** Read multi-tab map; migrate legacy single-entry key if present. */
async function readPendingMap(): Promise<PendingChatHandoffs> {
  const data = await chrome.storage.session.get([
    PENDING_CHAT_HANDOFFS_KEY,
    PENDING_CHAT_HANDOFF_KEY,
  ]);
  const map = {
    ...((data[PENDING_CHAT_HANDOFFS_KEY] as PendingChatHandoffs | undefined) ??
      {}),
  };
  const legacy = data[PENDING_CHAT_HANDOFF_KEY] as PendingChatHandoff | undefined;
  if (legacy && legacy.tabId != null && pendingHandoffMessages(legacy).length) {
    map[tabKey(legacy.tabId)] = legacy;
  }
  return map;
}

async function writePendingMap(map: PendingChatHandoffs): Promise<void> {
  // Drop legacy single key so it cannot fight the map.
  await chrome.storage.session.remove(PENDING_CHAT_HANDOFF_KEY);
  if (Object.keys(map).length === 0) {
    await chrome.storage.session.remove(PENDING_CHAT_HANDOFFS_KEY);
    return;
  }
  await chrome.storage.session.set({ [PENDING_CHAT_HANDOFFS_KEY]: map });
}

async function restorePending(pending: PendingChatHandoff): Promise<void> {
  await withPendingClaimLock(async () => {
    const map = await readPendingMap();
    const key = tabKey(pending.tabId);
    const current = map[key];
    // Do not overwrite a newer handoff for the same tab.
    if (current && current.at !== pending.at) return;
    map[key] = pending;
    await writePendingMap(map);
  });
}

/** Atomically take pending for this tab, or null if already claimed / wrong tab. */
async function claimPendingForTab(
  tabId: number,
): Promise<PendingChatHandoff | null> {
  return withPendingClaimLock(async () => {
    const map = await readPendingMap();
    const key = tabKey(tabId);
    const pending = map[key];
    if (!pending || pendingHandoffMessages(pending).length === 0) return null;
    // Activity-based TTL — multiprompt refreshes touchedAt between parts.
    const activityAt = pending.touchedAt ?? pending.at;
    if (Date.now() - activityAt > PENDING_HANDOFF_TTL_MS) {
      delete map[key];
      await writePendingMap(map);
      await emitChatInjectResult(false, pending, "ttl-expired");
      await hideWorkOverlay(tabId);
      return null;
    }
    if (!(await tabStillOpen(tabId))) {
      delete map[key];
      await writePendingMap(map);
      await emitChatInjectResult(false, pending, "tab-closed");
      await hideWorkOverlay(tabId);
      return null;
    }
    delete map[key];
    await writePendingMap(map);
    return pending;
  });
}

/** Insert+send in the page MAIN world (required for ProseMirror / Quill). */
const MAX_INJECT_ATTEMPTS = 8;
/**
 * Max idle age of a pending handoff between activity (claim / next part).
 * Must exceed worst-case composer wait (~3 min) plus inject retries.
 */
const PENDING_HANDOFF_TTL_MS = 300_000;

/** Backoff after no-editor / fill-failed — Custom GPT shell often needs several seconds. */
function injectRetryDelayMs(attempt: number): number {
  // attempt is 1-based after a failure: 2s, 3s, 4.5s, 6s, …
  return Math.min(10_000, 1500 + attempt * 1500);
}

function scheduleInjectRetry(tabId: number, attempt: number): void {
  const delay = injectRetryDelayMs(attempt);
  setTimeout(() => {
    void triggerChatInject(tabId);
  }, delay);
}

async function triggerChatInject(tabId: number): Promise<void> {
  const pending = await claimPendingForTab(tabId);
  if (!pending) return;

  if (await isWorkCancelled(pending.at)) {
    await hideWorkOverlay(tabId);
    await emitChatInjectResult(false, pending, "cancelled");
    return;
  }

  let messages = pendingHandoffMessages(pending);
  let index = pending.index ?? 0;
  if (index < 0 || index >= messages.length) {
    await emitChatInjectResult(false, pending, "empty-messages");
    await hideWorkOverlay(tabId);
    return;
  }

  const total = messages.length;
  const text = messages[index]!;
  const phase: WorkOverlayPhase = total > 1 ? "multiprompt" : "inject";
  await showWorkOverlay(tabId, phase, index + 1, total);

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: pageInjectAndSend,
      args: [text, index, total],
    });
    const result = results[0]?.result as
      | { ok: boolean; reason?: string }
      | undefined;

    if (await isWorkCancelled(pending.at)) {
      await hideWorkOverlay(tabId);
      await emitChatInjectResult(false, pending, "cancelled");
      return;
    }

    if (result?.ok) {
      if (index + 1 < total) {
        await showWorkOverlay(tabId, "waiting", index + 1, total);
        const waitResults = await chrome.scripting.executeScript({
          target: { tabId },
          world: "MAIN",
          func: waitComposerReadyForNext,
        });
        const wait = waitResults[0]?.result as
          | { ok: boolean; reason?: string }
          | undefined;

        if (await isWorkCancelled(pending.at)) {
          await hideWorkOverlay(tabId);
          await emitChatInjectResult(false, pending, "cancelled");
          return;
        }

        if (!wait?.ok) {
          await emitChatInjectResult(
            false,
            pending,
            wait?.reason === "timeout" ? "multiprompt-timeout" : "multiprompt-wait-failed",
          );
          await hideWorkOverlay(tabId);
          return;
        }

        await restorePending({
          ...pending,
          messages,
          index: index + 1,
          attempts: 0,
          text: messages[index + 1],
          touchedAt: Date.now(),
        });
        // Inform panel of progress without closing the handoff session.
        try {
          await chrome.runtime.sendMessage({
            type: "CHAT_INJECT_RESULT",
            ok: true,
            tabId: pending.tabId,
            at: pending.at,
            reason: "multiprompt-progress",
            part: index + 1,
            total,
          } satisfies ExtensionMessage);
        } catch {
          /* side panel closed */
        }
        scheduleInjectRetry(tabId, 0);
        return;
      }

      await emitChatInjectResult(true, pending);
      await hideWorkOverlay(tabId);
      return;
    }

    // Runtime too-long: re-split with a smaller budget and retry from this index.
    if (result?.reason === "message-too-long" && pending.package) {
      const prevLimit =
        pending.charLimit ?? getMessageCharLimit(pending.target);
      const { messages: nextMessages, charLimit } = resplitAfterTooLong(
        pending.package,
        pending.target,
        prevLimit,
      );
      // If we already sent earlier parts, keep them and append a fresh split
      // of the full package as remaining work would duplicate — safest: restart
      // from index 0 only when still on the first part; otherwise fail to paste.
      if (index > 0) {
        await emitChatInjectResult(false, pending, "message-too-long");
        await hideWorkOverlay(tabId);
        return;
      }
      if (nextMessages.length === 0) {
        await emitChatInjectResult(false, pending, "message-too-long");
        await hideWorkOverlay(tabId);
        return;
      }
      await restorePending({
        ...pending,
        messages: nextMessages,
        index: 0,
        charLimit,
        attempts: (pending.attempts ?? 0) + 1,
        text: nextMessages[0],
        package: pending.package,
        touchedAt: Date.now(),
      });
      scheduleInjectRetry(tabId, pending.attempts ?? 1);
      return;
    }

    if (result?.reason === "already-attempted") {
      const attempts = (pending.attempts ?? 0) + 1;
      if (attempts < MAX_INJECT_ATTEMPTS) {
        await restorePending({
          ...pending,
          messages,
          index,
          attempts,
          text,
          touchedAt: Date.now(),
        });
        scheduleInjectRetry(tabId, attempts);
        return;
      }
      setTimeout(() => {
        void emitChatInjectResult(false, pending, "already-attempted");
        void hideWorkOverlay(tabId);
      }, 22_000);
      return;
    }

    if (result?.reason === "login-required") {
      await emitChatInjectResult(false, pending, "login-required");
      await hideWorkOverlay(tabId);
      return;
    }

    if (
      result?.reason === "no-editor" ||
      result?.reason === "fill-failed"
    ) {
      const attempts = (pending.attempts ?? 0) + 1;
      if (attempts < MAX_INJECT_ATTEMPTS) {
        await restorePending({
          ...pending,
          messages,
          index,
          attempts,
          text,
          touchedAt: Date.now(),
        });
        scheduleInjectRetry(tabId, attempts);
        return;
      }
    }

    await emitChatInjectResult(false, pending, result?.reason);
    await hideWorkOverlay(tabId);
  } catch (err) {
    if (isGoneTabError(err) || !(await tabStillOpen(tabId))) {
      try {
        const tab = await chrome.tabs.get(tabId);
        const path = tab.url ? new URL(tab.url).pathname : "";
        const onConversation = isPostSendChatPath(path);
        if (onConversation && index + 1 >= total) {
          await emitChatInjectResult(false, pending);
          await hideWorkOverlay(tabId);
          return;
        }
        const attempts = (pending.attempts ?? 0) + 1;
        if (attempts < MAX_INJECT_ATTEMPTS) {
          await restorePending({
            ...pending,
            messages,
            index,
            attempts,
            text,
            touchedAt: Date.now(),
          });
          scheduleInjectRetry(tabId, attempts);
          return;
        }
      } catch {
        /* tab fully closed */
      }
      await emitChatInjectResult(false, pending);
      await hideWorkOverlay(tabId);
      return;
    }
    const attempts = (pending.attempts ?? 0) + 1;
    if (attempts < MAX_INJECT_ATTEMPTS) {
      await restorePending({
        ...pending,
        messages,
        index,
        attempts,
        text,
        touchedAt: Date.now(),
      });
      scheduleInjectRetry(tabId, attempts);
      return;
    }
    await emitChatInjectResult(false, pending);
    await hideWorkOverlay(tabId);
  }
}

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status !== "complete" || !tab.url || !isChatHandoffUrl(tab.url)) {
    return;
  }
  // Skip conversation URLs after a handoff already navigated (/c/…, /chat/…) —
  // those reloads must not inject again.
  try {
    const path = new URL(tab.url).pathname;
    if (isPostSendChatPath(path)) {
      return;
    }
  } catch {
    /* ignore */
  }
  void (async () => {
    const map = await readPendingMap();
    const pending = map[tabKey(tabId)];
    // Ignore unrelated chat tabs that finish loading.
    if (!pending || pendingHandoffMessages(pending).length === 0) return;
    // Custom GPT / Claude shells hydrate after "complete" — wait longer before first kick.
    await new Promise((r) => setTimeout(r, 3200));
    if (!(await tabStillOpen(tabId))) return;
    await triggerChatInject(tabId);
    await new Promise((r) => setTimeout(r, 5500));
    if (!(await tabStillOpen(tabId))) return;
    // Skip if chat already left the composer landing page (first part done).
    // Multiprompt continuation is driven by triggerChatInject after wait.
    try {
      const t = await chrome.tabs.get(tabId);
      const path = t.url ? new URL(t.url).pathname : "";
      if (isPostSendChatPath(path)) return;
    } catch {
      return;
    }
    await triggerChatInject(tabId);
    // Third late kick — slow networks / Custom GPT suggestion grid.
    await new Promise((r) => setTimeout(r, 8000));
    if (!(await tabStillOpen(tabId))) return;
    try {
      const t = await chrome.tabs.get(tabId);
      const path = t.url ? new URL(t.url).pathname : "";
      if (isPostSendChatPath(path)) return;
    } catch {
      return;
    }
    await triggerChatInject(tabId);
  })();
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "check-video",
      title:
        chrome.i18n.getMessage("contextCheckVideo") || "Check video with AI",
      contexts: ["page", "video", "link"],
    });
    chrome.contextMenus.create({
      id: "check-video-open",
      parentId: "check-video",
      title:
        chrome.i18n.getMessage("contextOpenDefault") ||
        "Open with saved chat",
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
  scheduleOpenSidePanelOnActionClick();
});

chrome.runtime.onStartup.addListener(() => {
  scheduleOpenSidePanelOnActionClick();
});

/** Toolbar icon opens Side Panel (no default_popup). Ignore benign "No SW". */
function scheduleOpenSidePanelOnActionClick(): void {
  const apply = () =>
    chrome.sidePanel
      .setPanelBehavior({ openPanelOnActionClick: true })
      .catch(() => {
        /* Chrome may reject with "No SW" during SW register — safe to ignore */
      });
  apply();
  setTimeout(apply, 250);
}

/**
 * Backup if setPanelBehavior did not stick (e.g. right after reinstall).
 * Only runs when there is no default_popup.
 */
chrome.action.onClicked.addListener((tab) => {
  void openSidePanelFromUserGesture(tab);
});

function uiLocale(): Locale {
  return chrome.i18n.getUILanguage().toLowerCase().startsWith("de")
    ? "de"
    : "en";
}

const LOCAL_PERSIST_KEYS = {
  rememberLastPackage: "rememberLastPackage",
  persistedCapture: "persistedCapture",
  persistedPackage: "persistedPackage",
} as const;

async function saveCapture(
  result: CaptureResult,
  pkg: PastePackage,
): Promise<void> {
  await chrome.storage.session.set({
    [STORAGE_KEYS.lastCapture]: result,
    [STORAGE_KEYS.lastPackage]: pkg,
  });
  const { rememberLastPackage } = await chrome.storage.local.get({
    [LOCAL_PERSIST_KEYS.rememberLastPackage]: false,
  });
  if (rememberLastPackage) {
    await chrome.storage.local.set({
      [LOCAL_PERSIST_KEYS.persistedCapture]: result,
      [LOCAL_PERSIST_KEYS.persistedPackage]: pkg,
    });
  }
}

async function getStored(): Promise<{
  result: CaptureResult | null;
  package: PastePackage | null;
}> {
  const data = await chrome.storage.session.get({
    [STORAGE_KEYS.lastCapture]: null,
    [STORAGE_KEYS.lastPackage]: null,
  });
  const sessionPkg =
    (data[STORAGE_KEYS.lastPackage] as PastePackage | null) ?? null;
  if (sessionPkg?.videoUrl) {
    return {
      result: (data[STORAGE_KEYS.lastCapture] as CaptureResult | null) ?? null,
      package: sessionPkg,
    };
  }

  // Opt-in: restore last package after browser restart (local only).
  const local = await chrome.storage.local.get({
    [LOCAL_PERSIST_KEYS.rememberLastPackage]: false,
    [LOCAL_PERSIST_KEYS.persistedCapture]: null,
    [LOCAL_PERSIST_KEYS.persistedPackage]: null,
  });
  if (!local[LOCAL_PERSIST_KEYS.rememberLastPackage]) {
    return { result: null, package: null };
  }
  const persistedPkg =
    (local[LOCAL_PERSIST_KEYS.persistedPackage] as PastePackage | null) ?? null;
  const persistedResult =
    (local[LOCAL_PERSIST_KEYS.persistedCapture] as CaptureResult | null) ?? null;
  if (!persistedPkg?.videoUrl) {
    return { result: null, package: null };
  }
  await chrome.storage.session.set({
    [STORAGE_KEYS.lastCapture]: persistedResult,
    [STORAGE_KEYS.lastPackage]: persistedPkg,
  });
  return { result: persistedResult, package: persistedPkg };
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

/** True when package already has real captions (skip TranscribeYouTube). */
function hasStrongCaptions(pkg: PastePackage): boolean {
  const src = pkg.transcriptSource;
  return (
    (src === "captions" ||
      src === "track" ||
      src === "external" ||
      src === "manual") &&
    Boolean(pkg.transcript?.trim())
  );
}

/**
 * YouTube-only: when in-page captions are missing (or only post text), try
 * TranscribeYouTube once. Never used for TikTok/X/Facebook/Instagram.
 */
async function maybeEnrichWithTranscribeYoutube(
  result: CaptureResult,
  pkg: PastePackage,
): Promise<{ result: CaptureResult; package: PastePackage }> {
  if (!(await isTranscriptEnabled())) {
    return stripTranscript(result, pkg);
  }
  const platform =
    result.platform === "youtube" || detectPlatform(pkg.videoUrl) === "youtube"
      ? "youtube"
      : result.platform;
  if (platform !== "youtube") {
    return { result, package: pkg };
  }
  if (hasStrongCaptions(pkg)) {
    return { result, package: pkg };
  }

  const fetched = await fetchTranscribeYoutubeTranscript(
    pkg.videoUrl,
    pkg.locale,
  );
  if (!fetched?.text) {
    return { result, package: pkg };
  }

  const nextResult: CaptureResult = {
    ...result,
    platform: "youtube",
    transcript: fetched.text,
    transcriptSource: "external",
    ...(fetched.title && !result.title ? { title: fetched.title } : {}),
  };
  const nextPkg = buildPastePackage({
    videoUrl: pkg.videoUrl,
    locale: pkg.locale,
    platform: "youtube",
    transcript: fetched.text,
    transcriptSource: "external",
  });
  return { result: nextResult, package: nextPkg };
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
  const enriched = await maybeEnrichWithTranscribeYoutube(result, pkg);
  await saveCapture(enriched.result, enriched.package);
  return enriched;
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
  skipTranscript = false,
): Promise<ExtensionMessage> {
  return (await chrome.tabs.sendMessage(tabId, {
    type: "CAPTURE_PAGE",
    ...(skipTranscript ? { skipTranscript: true } : {}),
  } satisfies ExtensionMessage)) as ExtensionMessage;
}

async function captureTab(tabId: number): Promise<{
  result: CaptureResult;
  package: PastePackage;
}> {
  const skipTranscript = !(await isTranscriptEnabled());
  // Capture session start — only cancels after this timestamp abort this run.
  // Do not clear workCancelledAt (would let an in-flight inject resume).
  const captureStartedAt = Date.now();
  await showWorkOverlay(tabId, "capture");

  let response: ExtensionMessage;

  try {
    try {
      response = await requestCaptureFromTab(tabId, skipTranscript);
    } catch {
      const tab = await chrome.tabs.get(tabId);
      const declared = tab.url ? hasDeclaredContentScript(tab.url) : false;

      if (declared) {
        await new Promise((r) => setTimeout(r, 120));
        try {
          response = await requestCaptureFromTab(tabId, skipTranscript);
        } catch {
          await chrome.scripting.executeScript({
            target: { tabId },
            files: ["content.js"],
          });
          response = await requestCaptureFromTab(tabId, skipTranscript);
        }
      } else {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ["content.js"],
        });
        response = await requestCaptureFromTab(tabId, skipTranscript);
      }
    }

    if (await isWorkCancelled(captureStartedAt)) {
      throw new Error("cancelled");
    }

    if (response.type === "HANDOFF_FAILED") {
      throw new Error(response.error || "capture failed");
    }
    if (response.type !== "CAPTURE_RESULT") {
      throw new Error("empty capture");
    }

    let enriched = await maybeEnrichWithTranscribeYoutube(
      response.result,
      response.package,
    );
    if (skipTranscript) {
      enriched = stripTranscript(enriched.result, enriched.package);
    }
    if (await isWorkCancelled(captureStartedAt)) {
      throw new Error("cancelled");
    }
    await saveCapture(enriched.result, enriched.package);
    return enriched;
  } finally {
    await hideWorkOverlay(tabId);
  }
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
  const captured = await captureActiveTabRaw(options);
  if (!captured) return null;
  return applyTranscriptPreference(captured);
}

async function captureActiveTabRaw(options?: {
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

/**
 * Open the Side Panel from a user gesture (toolbar / context menu).
 * Prefer sidePanel.open; fall back to opening sidepanel.html as a tab.
 */
async function openSidePanelFromUserGesture(
  tab: chrome.tabs.Tab,
): Promise<void> {
  try {
    if (tab.windowId != null) {
      await chrome.sidePanel.setOptions({
        path: "sidepanel.html",
        enabled: true,
      });
      await chrome.sidePanel.open({ windowId: tab.windowId });
      return;
    }
    if (tab.id != null) {
      await chrome.sidePanel.open({ tabId: tab.id });
      return;
    }
  } catch {
    /* "No SW" / already open — try tab fallback */
  }
  await chrome.tabs.create({
    url: chrome.runtime.getURL("sidepanel.html"),
    active: true,
  });
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
  await openSidePanelFromUserGesture(tab);

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

  if (
    info.menuItemId === "check-video-open" ||
    info.menuItemId === "check-video"
  ) {
    const { defaultChat } = await chrome.storage.sync.get({
      defaultChat: "chatgpt_video_faktencheck" satisfies ChatTargetId,
    });
    const target =
      typeof defaultChat === "string" && defaultChat in CHAT_TARGETS
        ? (defaultChat as ChatTargetId)
        : ("chatgpt_video_faktencheck" satisfies ChatTargetId);
    await openSidePanelAndHandoff(tab, target, linkUrl);
    return;
  }
  if (info.menuItemId === "check-video-copy") {
    await openSidePanelAndHandoff(tab, "copy_only", linkUrl);
  }
});

chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, sender, sendResponse) => {
    if (message.type === "CANCEL_WORK") {
      void (async () => {
        await markWorkCancelled();
        const map = await readPendingMap();
        const tabIds = Object.values(map).map((p) => p.tabId);
        await clearAllPendingHandoffs();
        for (const id of tabIds) {
          await hideWorkOverlay(id);
        }
        if (sender.tab?.id != null) {
          await hideWorkOverlay(sender.tab.id);
        }
        try {
          await chrome.runtime.sendMessage({
            type: "WORK_CANCELLED",
          } satisfies ExtensionMessage);
        } catch {
          /* side panel closed */
        }
        sendResponse({ ok: true });
      })();
      return true;
    }

    if (message.type === "TRIGGER_CHAT_INJECT") {
      const tabId = message.tabId ?? sender.tab?.id;
      if (tabId != null) {
        void triggerChatInject(tabId).finally(() => sendResponse({ ok: true }));
        return true;
      }
      sendResponse({ ok: false });
      return false;
    }

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
          const msg = err instanceof Error ? err.message : String(err);
          if (msg === "cancelled") {
            try {
              void chrome.runtime.sendMessage({
                type: "WORK_CANCELLED",
              } satisfies ExtensionMessage);
            } catch {
              /* ignore */
            }
          }
          sendResponse({
            type: "HANDOFF_FAILED",
            error: msg,
          } satisfies ExtensionMessage);
        });
      return true;
    }

    if (message.type === "GET_LAST_CAPTURE") {
      void getStored()
        .then(async (stored) => {
          if (!stored.result || !stored.package) {
            sendResponse({
              type: "LAST_CAPTURE",
              result: null,
              package: null,
            } satisfies ExtensionMessage);
            return;
          }
          const preferred = await applyTranscriptPreference({
            result: stored.result,
            package: stored.package,
          });
          sendResponse({
            type: "LAST_CAPTURE",
            result: preferred.result,
            package: preferred.package,
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
