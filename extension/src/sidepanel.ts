import {
  CHAT_TARGETS,
  formatPastePackageText,
  platformLabelKey,
  sameVideoUrl,
  type CaptureResult,
  type ChatTargetId,
  type ExtensionMessage,
  type Locale,
  type PastePackage,
  type PlatformId,
} from "@ai-video-fact-check/shared";

const DEFAULT_CHAT: ChatTargetId = "chatgpt_video_faktencheck";
type FontSizePref = "normal" | "large";

type GuidePhase =
  | "idle"
  | "ready"
  /** Manual Copy / Copy again — text ready, user must open chat. */
  | "awaiting_open"
  /** Handoff in progress — copy succeeded, chat tab is opening. */
  | "copied"
  | "opened"
  | "clipboard_failed";

let lastResult: CaptureResult | null = null;
let lastPackage: PastePackage | null = null;
let guidePhase: GuidePhase = "idle";
let handoffBusy = false;
/** Suppress duplicate START_HANDOFF deliveries that arrive after a run finishes. */
let handoffCooldownUntil = 0;

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

function setStepHighlight(phase: GuidePhase): void {
  const item1 = document.getElementById("stepItem1");
  const item2 = document.getElementById("stepItem2");
  const item3 = document.getElementById("stepItem3");
  if (!item1 || !item2 || !item3) return;

  const items = [item1, item2, item3];
  for (const item of items) {
    item.classList.remove("is-current", "is-done");
  }

  switch (phase) {
    case "ready":
      item1.classList.add("is-current");
      break;
    case "awaiting_open":
    case "copied":
      item1.classList.add("is-done");
      item2.classList.add("is-current");
      break;
    case "opened":
      item1.classList.add("is-done");
      item2.classList.add("is-done");
      item3.classList.add("is-current");
      break;
    case "clipboard_failed":
      item1.classList.add("is-current");
      break;
    default:
      break;
  }
}

function setGuidePhase(phase: GuidePhase): void {
  guidePhase = phase;
  const step1 = document.getElementById("step1");
  const step2 = document.getElementById("step2");
  const step3 = document.getElementById("step3");
  const hint = document.getElementById("hintText");
  if (!step1 || !step2 || !step3 || !hint) return;

  switch (phase) {
    case "ready":
      step1.textContent = t("guideStepReady");
      step2.textContent = t("guideStepOpen");
      step3.textContent = t("guideStepPaste");
      hint.textContent = t("sidepanelHint");
      break;
    case "awaiting_open":
      step1.textContent = t("guideStepCopied");
      step2.textContent = t("guideStepOpenNext");
      step3.textContent = t("guideStepPaste");
      hint.textContent = t("hintAwaitingOpen");
      break;
    case "copied":
      step1.textContent = t("guideStepCopied");
      step2.textContent = t("guideStepOpening");
      step3.textContent = t("guideStepPaste");
      hint.textContent = t("hintAfterCopy");
      break;
    case "opened":
      step1.textContent = t("guideStepCopied");
      step2.textContent = t("guideStepChatOpened");
      step3.textContent = t("guideStepPasteNow");
      hint.textContent = t("hintPasteNow");
      break;
    case "clipboard_failed":
      step1.textContent = t("guideStepCopyFailed");
      step2.textContent = t("guideStepCopyAgain");
      step3.textContent = t("guideStepPaste");
      hint.textContent = t("hintCopyFailed");
      break;
    default:
      step1.textContent = t("step1");
      step2.textContent = t("step2");
      step3.textContent = t("step3");
      hint.textContent = t("sidepanelHint");
  }

  setStepHighlight(phase);
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

  const lines = [
    `${t("labelPlatform")}: ${platformName(lastResult.platform)}`,
    `${t("labelUrl")}: ${lastPackage.videoUrl}`,
    `${t("labelCaptions")}: ${captionsYes ? t("captionsYes") : t("captionsNo")}`,
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

async function copyPackageToClipboard(pkg: PastePackage): Promise<boolean> {
  const text = formatPastePackageText(pkg);
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
  try {
    setMsg("handoffMsg", t("handoffWorking"));
    const pkg = await ensurePackage();
    if (!pkg?.videoUrl) {
      setMsg("handoffMsg", t("captureFailed"), "error");
      setGuidePhase("idle");
      return;
    }

    const copied = await copyPackageToClipboard(pkg);
    if (!copied) {
      setGuidePhase("clipboard_failed");
      setMsg("handoffMsg", t("hintCopyFailed"), "error");
      return;
    }

    setGuidePhase("copied");
    const chat = CHAT_TARGETS[target] ?? CHAT_TARGETS[DEFAULT_CHAT];
    await chrome.tabs.create({ url: chat.openUrl });
    setGuidePhase("opened");
    setMsg(
      "handoffMsg",
      target === "gemini_web" ? t("handoffOpenedGemini") : t("handoffOpenedGpt"),
      "ok",
    );
    handoffCooldownUntil = Date.now() + 2500;
  } finally {
    handoffBusy = false;
  }
}

async function copyOnly(): Promise<void> {
  const pkg = await ensurePackage();
  if (!pkg?.videoUrl) {
    setMsg("handoffMsg", t("captureFailed"), "error");
    return;
  }
  const copied = await copyPackageToClipboard(pkg);
  if (copied) {
    setGuidePhase("awaiting_open");
    setMsg("handoffMsg", t("copyOk"), "ok");
  } else {
    setGuidePhase("clipboard_failed");
    setMsg("handoffMsg", t("hintCopyFailed"), "error");
  }
}

async function copyAgain(): Promise<void> {
  const pkg = await ensurePackage();
  if (!pkg?.videoUrl) {
    setMsg("handoffMsg", t("captureFailed"), "error");
    return;
  }
  const copied = await copyPackageToClipboard(pkg);
  if (copied) {
    // After a successful open, keep paste guidance; otherwise wait for Open chat.
    setGuidePhase(guidePhase === "opened" ? "opened" : "awaiting_open");
    setMsg("handoffMsg", t("copyAgainOk"), "ok");
  } else {
    setGuidePhase("clipboard_failed");
    setMsg("handoffMsg", t("hintCopyFailed"), "error");
  }
}

async function requestCapture(opts?: { force?: boolean }): Promise<void> {
  const force = opts?.force === true;
  setText("captureStatus", t("captureWorking"));
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
    applyCapture(response.result, response.package, {
      resetGuide: force,
    });
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
  setText("btnCopy", t("btnCopy"));
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

document.getElementById("btnCopy")?.addEventListener("click", () => {
  void copyOnly();
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
    void copyAgain();
  }
});

initCopy();
void chrome.storage.sync
  .get({
    defaultChat: DEFAULT_CHAT,
    fontSize: "normal" satisfies FontSizePref,
  })
  .then(({ defaultChat, fontSize }) => {
    applyDefaultChat(defaultChat as string);
    applyFontSize(fontSize === "large" ? "large" : "normal");
  });
void initCaptureState();
