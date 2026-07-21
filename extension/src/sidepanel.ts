import {
  CHAT_TARGETS,
  formatPastePackageText,
  PENDING_CHAT_HANDOFF_KEY,
  PENDING_CHAT_HANDOFFS_KEY,
  platformLabelKey,
  sameVideoUrl,
  type CaptureResult,
  type ChatTargetId,
  type ExtensionMessage,
  type Locale,
  type PastePackage,
  type PendingChatHandoffs,
  type PlatformId,
} from "@ai-video-fact-check/shared";

const DEFAULT_CHAT: ChatTargetId = "chatgpt_video_faktencheck";
type FontSizePref = "normal" | "large";

type GuidePhase =
  | "idle"
  | "ready"
  /** Handoff in progress — copy succeeded, chat tab is opening. */
  | "copied"
  | "opened"
  | "inject_ok"
  | "inject_failed"
  | "clipboard_failed";

let lastResult: CaptureResult | null = null;
let lastPackage: PastePackage | null = null;
/** Last opened / default chat — used for “Copy again” after a successful open. */
let selectedChat: ChatTargetId = DEFAULT_CHAT;
/**
 * Chat the user last tried to open (even if clipboard failed).
 * Used for retry copy without moving the primary-button default early.
 */
let lastClickedChat: ChatTargetId = DEFAULT_CHAT;
let guidePhase: GuidePhase = "idle";
let handoffBusy = false;
/** Suppress duplicate START_HANDOFF deliveries that arrive after a run finishes. */
let handoffCooldownUntil = 0;
/** Current UI handoff — results for this key update the guide. */
let activeHandoff: { tabId: number; at: number; target: ChatTargetId } | null =
  null;
/**
 * All open handoffs by `${tabId}:${at}`. A superseded handoff can still
 * complete in the background without updating the wrong guide state.
 */
const openHandoffs = new Map<
  string,
  { tabId: number; at: number; target: ChatTargetId }
>();

function handoffKey(tabId: number, at: number): string {
  return `${tabId}:${at}`;
}

function t(key: string): string {
  return chrome.i18n.getMessage(key) || key;
}

function uiLocale(): Locale {
  return chrome.i18n.getUILanguage().toLowerCase().startsWith("de")
    ? "de"
    : "en";
}

function platformName(platform: PlatformId): string {
  return t(platformLabelKey(platform));
}

function setText(id: string, value: string): void {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function setMsg(
  id: string,
  value: string,
  kind?: "ok" | "error" | "neutral",
): void {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = value;
  el.classList.toggle("is-ok", kind === "ok");
  el.classList.toggle("is-error", kind === "error");
}

function applyFontSize(size: FontSizePref): void {
  document.documentElement.dataset.fontSize =
    size === "large" ? "large" : "normal";
}

function setGuidePhase(phase: GuidePhase): void {
  guidePhase = phase;
  const status = document.getElementById("guideStatus");
  const box = document.getElementById("guideBox");
  const hint = document.getElementById("hintText");
  const copyAgain = document.getElementById("btnCopyAgain");
  if (!status || !box || !hint) return;

  box.classList.toggle(
    "is-current",
    phase === "ready" ||
      phase === "opened" ||
      phase === "inject_ok" ||
      phase === "inject_failed",
  );
  box.classList.toggle(
    "is-error",
    phase === "clipboard_failed" || phase === "inject_failed",
  );
  if (copyAgain) {
    copyAgain.hidden =
      phase !== "clipboard_failed" &&
      phase !== "opened" &&
      phase !== "inject_failed" &&
      phase !== "inject_ok";
  }

  switch (phase) {
    case "ready":
      status.textContent = t("guideReady");
      hint.textContent = t("sidepanelHint");
      break;
    case "copied":
      status.textContent = t("guideOpening");
      hint.textContent = t("hintAfterCopy");
      break;
    case "opened":
      status.textContent =
        selectedChat === "gemini_web"
          ? t("guideOpenedGemini")
          : t("guideOpenedGpt");
      hint.textContent = t("hintInjecting");
      break;
    case "inject_ok":
      status.textContent = t("guideInjectOk");
      hint.textContent = t("sidepanelHint");
      break;
    case "inject_failed":
      status.textContent = t("guideInjectFailed");
      hint.textContent = t("hintPasteNow");
      break;
    case "clipboard_failed":
      status.textContent = t("guideCopyFailed");
      hint.textContent = t("hintCopyFailed");
      break;
    default:
      status.textContent = t("guideIdle");
      hint.textContent = t("sidepanelHint");
  }
}

function renderCapture(): void {
  const statusEl = document.getElementById("captureStatus");
  const detailsEl = document.getElementById("captureDetails");
  if (!statusEl || !detailsEl) return;

  if (!lastResult || !lastPackage) {
    statusEl.textContent = t("captureIdle");
    detailsEl.textContent = "";
    setGuidePhase("idle");
    return;
  }

  const captionsYes =
    lastPackage.transcriptSource !== "none" &&
    Boolean(lastPackage.transcript?.trim());

  statusEl.textContent = lastResult.supported
    ? chrome.i18n.getMessage(
        "captureFound",
        platformName(lastResult.platform),
      ) || t("captureFound")
    : t("captureUnsupported");

  let captionsLabel = captionsYes ? t("captionsYes") : t("captionsNo");
  if (lastPackage.transcriptSource === "post") {
    captionsLabel = t("captionsPost");
  } else if (lastPackage.transcriptSource === "manual") {
    captionsLabel = t("captionsYes");
  }

  const lines = [
    `${t("labelPlatform")}: ${platformName(lastResult.platform)}`,
    `${t("labelUrl")}: ${lastPackage.videoUrl}`,
    `${t("labelCaptions")}: ${captionsLabel}`,
  ];
  if (lastPackage.transcriptSource === "manual") {
    lines.push(t("captionsManual"));
  }
  detailsEl.textContent = lines.join("\n");
}

function applyDefaultChat(defaultChat: string): void {
  const id = (
    defaultChat in CHAT_TARGETS ? defaultChat : DEFAULT_CHAT
  ) as ChatTargetId;
  selectedChat = id;
  lastClickedChat = id;
  const actions = document.querySelector(".step-actions");
  const gptBtn = document.getElementById("btnOpenGpt");
  const geminiBtn = document.getElementById("btnOpenGemini");
  if (!actions || !gptBtn || !geminiBtn) return;

  gptBtn.classList.toggle("primary", id === "chatgpt_video_faktencheck");
  geminiBtn.classList.toggle("primary", id === "gemini_web");

  // Put the user's default chat first.
  if (id === "gemini_web") {
    actions.append(geminiBtn, gptBtn);
  } else {
    actions.append(gptBtn, geminiBtn);
  }
}

function applyCapture(
  result: CaptureResult | null,
  pkg: PastePackage | null,
  opts?: { resetGuide?: boolean },
): void {
  const prevUrl = lastPackage?.videoUrl;
  const nextUrl = pkg?.videoUrl;
  const urlChanged = Boolean(
    prevUrl && nextUrl && !sameVideoUrl(prevUrl, nextUrl),
  );

  lastResult = result;
  lastPackage = pkg;
  renderCapture();

  if (!lastPackage?.videoUrl) {
    setGuidePhase("idle");
  } else if (opts?.resetGuide || urlChanged || guidePhase === "idle") {
    setGuidePhase("ready");
  }

  const manual = document.getElementById(
    "manualTranscript",
  ) as HTMLTextAreaElement | null;
  if (manual) {
    if (lastPackage?.transcriptSource === "manual") {
      manual.value = lastPackage.transcript ?? "";
    } else if (urlChanged) {
      manual.value = "";
      setMsg("manualMsg", "");
    }
  }
}

/** Pull the latest capture from the service worker session store. */
async function loadStoredCapture(): Promise<boolean> {
  const response = (await chrome.runtime.sendMessage({
    type: "GET_LAST_CAPTURE",
  } satisfies ExtensionMessage)) as ExtensionMessage;

  if (response.type !== "LAST_CAPTURE") return false;
  if (!response.package?.videoUrl) return false;
  applyCapture(response.result, response.package);
  return true;
}

/**
 * Sync textarea → package before copy/handoff.
 * Empty field clears a previously saved manual transcript.
 */
async function flushManualTranscriptIfNeeded(): Promise<void> {
  const manual = document.getElementById(
    "manualTranscript",
  ) as HTMLTextAreaElement | null;
  if (!manual) return;

  const text = manual.value;
  const hadSavedManual = lastPackage?.transcriptSource === "manual";
  // Empty field: only sync when a saved manual transcript must be cleared.
  if (!text.trim() && !hadSavedManual) return;

  if (!lastPackage?.videoUrl) {
    await requestCapture({ force: false });
  }
  if (!lastPackage?.videoUrl) return;

  const response = (await chrome.runtime.sendMessage({
    type: "SET_MANUAL_TRANSCRIPT",
    transcript: text,
    locale: uiLocale(),
  } satisfies ExtensionMessage)) as ExtensionMessage;

  if (response.type === "LAST_CAPTURE") {
    applyCapture(response.result, response.package);
  }
}

/**
 * Sync with SW: refresh when the active tab is a different video;
 * keep stored package on chat/restricted tabs (after handoff).
 * Then include any unsaved manual transcript from the textarea.
 */
async function ensurePackage(): Promise<PastePackage | null> {
  await requestCapture({ force: false });
  await flushManualTranscriptIfNeeded();
  return lastPackage;
}

async function copyPackageToClipboard(
  pkg: PastePackage,
  target?: ChatTargetId,
): Promise<boolean> {
  const text = formatPastePackageText(pkg, target);
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.getElementById(
        "clipboardFallback",
      ) as HTMLTextAreaElement | null;
      if (!area) return false;
      area.value = text;
      area.hidden = false;
      area.focus();
      area.select();
      const ok = document.execCommand("copy");
      area.hidden = true;
      return ok;
    } catch {
      return false;
    }
  }
}

async function handoffToChat(
  target: ChatTargetId,
  opts?: { force?: boolean },
): Promise<void> {
  if (handoffBusy) return;
  // Ignore SW retry deliveries; button clicks pass force: true.
  if (!opts?.force && Date.now() < handoffCooldownUntil) return;
  handoffBusy = true;
  lastClickedChat = target;
  try {
    setMsg("handoffMsg", t("handoffWorking"));
    const pkg = await ensurePackage();
    if (!pkg?.videoUrl) {
      setMsg("handoffMsg", t("captureFailed"), "error");
      setGuidePhase("idle");
      return;
    }

    const text = formatPastePackageText(pkg, target);
    // Clipboard backup if insert/send fails in the chat tab.
    const copied = await copyPackageToClipboard(pkg, target);
    if (!copied) {
      setGuidePhase("clipboard_failed");
      setMsg("handoffMsg", t("hintCopyFailed"), "error");
      return;
    }

    setGuidePhase("copied");
    const chat = CHAT_TARGETS[target] ?? CHAT_TARGETS[DEFAULT_CHAT];
    const tab = await chrome.tabs.create({ url: chat.openUrl });
    if (tab.id == null) {
      setGuidePhase("inject_failed");
      setMsg("handoffMsg", t("handoffInjectFailed"), "error");
      return;
    }
    const tabId = tab.id;
    const at = Date.now();
    const session = { tabId, at, target };
    activeHandoff = session;
    openHandoffs.set(handoffKey(tabId, at), session);
    // Per-tab pending map — a second handoff must not erase the first tab’s payload.
    const stored = await chrome.storage.session.get([
      PENDING_CHAT_HANDOFFS_KEY,
      PENDING_CHAT_HANDOFF_KEY,
    ]);
    const map: PendingChatHandoffs = {
      ...((stored[PENDING_CHAT_HANDOFFS_KEY] as
        | PendingChatHandoffs
        | undefined) ?? {}),
    };
    map[String(tabId)] = {
      text,
      target,
      at,
      tabId,
    };
    await chrome.storage.session.set({ [PENDING_CHAT_HANDOFFS_KEY]: map });
    // Clear legacy single-entry key so it cannot override the map.
    await chrome.storage.session.remove(PENDING_CHAT_HANDOFF_KEY);
    void (async () => {
      // Two spaced kicks only — pending is claimed on first successful attempt.
      for (const gap of [1800, 4500]) {
        await new Promise((r) => setTimeout(r, gap === 1800 ? 1800 : 2700));
        try {
          await chrome.runtime.sendMessage({
            type: "TRIGGER_CHAT_INJECT",
            tabId,
          } satisfies ExtensionMessage);
        } catch {
          /* service worker wake */
        }
      }
    })();
    selectedChat = target;
    setGuidePhase("opened");
    setMsg(
      "handoffMsg",
      target === "gemini_web"
        ? t("handoffOpenedGemini")
        : t("handoffOpenedGpt"),
      "ok",
    );
    handoffCooldownUntil = Date.now() + 2500;
  } finally {
    handoffBusy = false;
  }
}

/** Re-copy for the last attempted/opened chat (recovery after open or clipboard fail). */
async function copyAgain(): Promise<void> {
  const pkg = await ensurePackage();
  if (!pkg?.videoUrl) {
    setMsg("handoffMsg", t("captureFailed"), "error");
    return;
  }
  const target = lastClickedChat;
  const copied = await copyPackageToClipboard(pkg, target);
  if (copied) {
    setGuidePhase(guidePhase === "clipboard_failed" ? "ready" : "opened");
    setMsg("handoffMsg", t("copyAgainOk"), "ok");
  } else {
    setGuidePhase("clipboard_failed");
    setMsg("handoffMsg", t("hintCopyFailed"), "error");
  }
}

/**
 * Context-menu “copy only”: short package (no master prompt), no chat open.
 */
async function copyPackageOnlyShort(): Promise<void> {
  const pkg = await ensurePackage();
  if (!pkg?.videoUrl) {
    setMsg("handoffMsg", t("captureFailed"), "error");
    return;
  }
  const copied = await copyPackageToClipboard(pkg);
  if (copied) {
    setGuidePhase("ready");
    setMsg("handoffMsg", t("copyOk"), "ok");
  } else {
    setGuidePhase("clipboard_failed");
    setMsg("handoffMsg", t("hintCopyFailed"), "error");
  }
}

async function requestCapture(opts?: { force?: boolean }): Promise<void> {
  const force = opts?.force === true;
  setText("captureStatus", t("captureWorking"));
  try {
    const response = (await chrome.runtime.sendMessage({
      type: "CAPTURE_ACTIVE_TAB",
      force,
    } satisfies ExtensionMessage)) as ExtensionMessage;

    if (response.type === "HANDOFF_FAILED") {
      setText("captureStatus", t("captureFailed"));
      setText("captureDetails", "");
      return;
    }
    if (response.type === "LAST_CAPTURE") {
      if (!response.result || !response.package) {
        // No capture yet — idle, not an error (e.g. first open / empty store).
        applyCapture(null, null);
        return;
      }
      applyCapture(response.result, response.package, {
        resetGuide: force,
      });
    }
  } catch (err) {
    console.error(err);
    setText("captureStatus", t("captureFailed"));
    setText("captureDetails", "");
  }
}

/**
 * Startup: brief wait for context-menu pin/capture, then smart sync
 * (rescans when the active tab is a different supported video).
 */
async function initCaptureState(): Promise<void> {
  await new Promise((r) => setTimeout(r, 350));
  await requestCapture({ force: false });
}

async function applyManualTranscript(): Promise<void> {
  const manual = document.getElementById(
    "manualTranscript",
  ) as HTMLTextAreaElement | null;
  if (!manual) return;

  if (!lastPackage?.videoUrl) {
    await requestCapture();
  }

  const response = (await chrome.runtime.sendMessage({
    type: "SET_MANUAL_TRANSCRIPT",
    transcript: manual.value,
    locale: uiLocale(),
  } satisfies ExtensionMessage)) as ExtensionMessage;

  if (response.type === "LAST_CAPTURE") {
    applyCapture(response.result, response.package);
    setMsg("manualMsg", t("manualSaved"), "ok");
  } else if (response.type === "HANDOFF_FAILED") {
    setMsg("manualMsg", t("captureFailed"), "error");
  }
}

function initCopy(): void {
  document.documentElement.lang = uiLocale();
  setText("skipLink", t("skipToContent"));
  setText("title", t("extName"));
  setText("subtitle", t("sidepanelSubtitle"));
  setText("stepsHeading", t("stepsHeading"));
  setText("captureHeading", t("captureHeading"));
  setText("btnScan", t("btnScan"));
  setText("manualHeading", t("manualHeading"));
  setText("manualHelp", t("manualHelp"));
  setText("manualLabel", t("manualLabel"));
  setText("btnSaveManual", t("btnSaveManual"));
  setText("btnOpenGpt", t("btnOpenGpt"));
  setText("btnOpenGemini", t("btnOpenGemini"));
  setText("btnCopyAgain", t("btnCopyAgain"));
  setText("btnOptions", t("btnOptions"));
  setText("creditsLabel", t("creditsLabel"));
  setText("captureStatus", t("captureIdle"));
  setText("readAnswerHeading", t("readAnswerHeading"));
  setText("readAnswerScore", t("readAnswerScore"));
  setText("readAnswerTraffic", t("readAnswerTraffic"));
  setText("readAnswerSources", t("readAnswerSources"));
  setGuidePhase("idle");
}

document.getElementById("btnScan")?.addEventListener("click", () => {
  void requestCapture({ force: true });
});

document.getElementById("btnSaveManual")?.addEventListener("click", () => {
  void applyManualTranscript();
});

document.getElementById("btnOpenGpt")?.addEventListener("click", () => {
  void handoffToChat("chatgpt_video_faktencheck", { force: true });
});

document.getElementById("btnOpenGemini")?.addEventListener("click", () => {
  void handoffToChat("gemini_web", { force: true });
});

document.getElementById("btnCopyAgain")?.addEventListener("click", () => {
  void copyAgain();
});

document.getElementById("btnOptions")?.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync") {
    if (changes.defaultChat) {
      applyDefaultChat(
        (changes.defaultChat.newValue as string | undefined) ?? DEFAULT_CHAT,
      );
    }
    if (changes.fontSize) {
      const next = changes.fontSize.newValue as FontSizePref | undefined;
      applyFontSize(next === "large" ? "large" : "normal");
    }
    if (changes.defaultChat || changes.fontSize) return;
  }
  // Context-menu capture writes session storage — keep the panel in sync.
  if (
    area === "session" &&
    (changes.lastCapture || changes.lastPackage)
  ) {
    void loadStoredCapture();
  }
});

chrome.runtime.onMessage.addListener((message: ExtensionMessage) => {
  if (message.type === "START_HANDOFF") {
    // Context-menu handoff must not be dropped by the SW-retry cooldown.
    void handoffToChat(message.target, { force: true });
    return;
  }
  if (message.type === "COPY_PACKAGE_ONLY") {
    void copyPackageOnlyShort();
    return;
  }
  if (message.type === "CHAT_INJECT_RESULT") {
    const key = handoffKey(message.tabId, message.at);
    const session = openHandoffs.get(key);
    if (!session) return;
    openHandoffs.delete(key);

    const isActive =
      activeHandoff != null &&
      message.tabId === activeHandoff.tabId &&
      message.at === activeHandoff.at;

    if (message.ok) {
      // Persist default chat for this handoff even if the UI moved on.
      applyDefaultChat(session.target);
      void chrome.storage.sync.set({ defaultChat: session.target });
      if (isActive) {
        setGuidePhase("inject_ok");
        setMsg("handoffMsg", t("handoffInjectOk"), "ok");
      }
      return;
    }

    if (isActive) {
      setGuidePhase("inject_failed");
      setMsg("handoffMsg", t("handoffInjectFailed"), "error");
    }
  }
});

initCopy();
void chrome.storage.sync
  .get({
    defaultChat: DEFAULT_CHAT,
    fontSize: "normal" satisfies FontSizePref,
  })
  .then(({ defaultChat, fontSize }) => {
    const chat =
      typeof defaultChat === "string" && defaultChat in CHAT_TARGETS
        ? (defaultChat as ChatTargetId)
        : DEFAULT_CHAT;
    applyDefaultChat(chat);
    applyFontSize(fontSize === "large" ? "large" : "normal");
  });
void initCaptureState();
