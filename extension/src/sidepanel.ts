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

type GuidePhase = "idle" | "ready" | "copied" | "opened" | "clipboard_failed";

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
  const actions = document.querySelector(".actions");
  const gptBtn = document.getElementById("btnOpenGpt");
  const geminiBtn = document.getElementById("btnOpenGemini");
  const copyBtn = document.getElementById("btnCopyAgain");
  const optionsBtn = document.getElementById("btnOptions");
  if (!actions || !gptBtn || !geminiBtn || !optionsBtn) return;

  gptBtn.classList.toggle("primary", id === "chatgpt_video_faktencheck");
  geminiBtn.classList.toggle("primary", id === "gemini_web");

  // Order: default chat, other chat, copy again, settings
  const ordered =
    id === "gemini_web"
      ? [geminiBtn, gptBtn, copyBtn, optionsBtn]
      : [gptBtn, geminiBtn, copyBtn, optionsBtn];
  for (const btn of ordered) {
    if (btn) actions.append(btn);
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
      setText("manualMsg", "");
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
    setText("handoffMsg", t("handoffWorking"));
    const pkg = await ensurePackage();
    if (!pkg?.videoUrl) {
      setText("handoffMsg", t("captureFailed"));
      setGuidePhase("idle");
      return;
    }

    const copied = await copyPackageToClipboard(pkg);
    if (!copied) {
      setGuidePhase("clipboard_failed");
      setText("handoffMsg", t("hintCopyFailed"));
      return;
    }

    setGuidePhase("copied");
    const chat = CHAT_TARGETS[target] ?? CHAT_TARGETS[DEFAULT_CHAT];
    await chrome.tabs.create({ url: chat.openUrl });
    setGuidePhase("opened");
    setText(
      "handoffMsg",
      target === "gemini_web" ? t("handoffOpenedGemini") : t("handoffOpenedGpt"),
    );
    handoffCooldownUntil = Date.now() + 2500;
  } finally {
    handoffBusy = false;
  }
}

async function copyAgain(): Promise<void> {
  const pkg = await ensurePackage();
  if (!pkg?.videoUrl) {
    setText("handoffMsg", t("captureFailed"));
    return;
  }
  const copied = await copyPackageToClipboard(pkg);
  if (copied) {
    // Copy-only / Copy again does not open chat — avoid "Opening the chat…" steps.
    setGuidePhase(guidePhase === "opened" ? "opened" : "ready");
    setText("handoffMsg", t("copyAgainOk"));
  } else {
    setGuidePhase("clipboard_failed");
    setText("handoffMsg", t("hintCopyFailed"));
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
    setText("manualMsg", t("manualSaved"));
  } else if (response.type === "HANDOFF_FAILED") {
    setText("manualMsg", t("captureFailed"));
  }
}

function initCopy(): void {
  document.documentElement.lang = uiLocale();
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
  if (area === "sync" && changes.defaultChat) {
    applyDefaultChat(
      (changes.defaultChat.newValue as string | undefined) ?? DEFAULT_CHAT,
    );
    return;
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
  .get({ defaultChat: DEFAULT_CHAT })
  .then(({ defaultChat }) => {
    applyDefaultChat(defaultChat as string);
  });
void initCaptureState();
