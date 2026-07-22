import {
  CHAT_TARGETS,
  buildPastePackage,
  formatPastePackageText,
  getMessageCharLimit,
  PENDING_CHAT_HANDOFF_KEY,
  PENDING_CHAT_HANDOFFS_KEY,
  platformLabelKey,
  sameVideoUrl,
  splitIntoHandoffMessages,
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
  /** Clipboard-only target: tab open, user must paste. */
  | "paste_needed"
  | "inject_ok"
  | "inject_failed"
  | "login_required"
  | "tab_open_failed"
  | "clipboard_failed"
  | "cancelled"
  | "multiprompt";

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
/** Multiprompt clipboard parts for DeepSeek / paste fallback. */
let multipromptParts: string[] = [];
let multipromptIndex = 0;
/** True when automatic transcript capture is enabled (Settings). */
let enableTranscript = true;
/** True after defaultChat / fontSize loaded from sync storage. */
let prefsReady = false;
let prefsReadyResolve: (() => void) | null = null;
const prefsReadyPromise = new Promise<void>((resolve) => {
  prefsReadyResolve = resolve;
});
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

function chatLabel(id: ChatTargetId): string {
  const chat = CHAT_TARGETS[id] ?? CHAT_TARGETS[DEFAULT_CHAT];
  return uiLocale() === "de" ? chat.labelDe : chat.labelEn;
}

function msgWithChat(key: string, id: ChatTargetId): string {
  return chrome.i18n.getMessage(key, chatLabel(id)) || t(key);
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
      phase === "paste_needed" ||
      phase === "inject_ok" ||
      phase === "inject_failed" ||
      phase === "login_required" ||
      phase === "tab_open_failed" ||
      phase === "multiprompt" ||
      phase === "cancelled",
  );
  box.classList.toggle(
    "is-error",
    phase === "clipboard_failed" ||
      phase === "inject_failed" ||
      phase === "login_required" ||
      phase === "tab_open_failed" ||
      phase === "cancelled",
  );
  if (copyAgain) {
    copyAgain.hidden =
      phase !== "clipboard_failed" &&
      phase !== "opened" &&
      phase !== "paste_needed" &&
      phase !== "inject_failed" &&
      phase !== "login_required" &&
      phase !== "tab_open_failed" &&
      phase !== "inject_ok" &&
      phase !== "multiprompt";
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
      status.textContent = msgWithChat("guideOpenedInject", selectedChat);
      hint.textContent = t("hintInjecting");
      break;
    case "paste_needed":
      status.textContent = msgWithChat("guideOpenedPaste", selectedChat);
      hint.textContent =
        multipromptParts.length > 1
          ? chrome.i18n.getMessage(
              "hintPasteMultiprompt",
              [
                String(multipromptIndex + 1),
                String(multipromptParts.length),
              ],
            ) || t("hintPasteNow")
          : t("hintPasteNow");
      break;
    case "multiprompt":
      status.textContent =
        chrome.i18n.getMessage(
          "guideMultiprompt",
          [
            String(multipromptIndex + 1),
            String(Math.max(multipromptParts.length, 1)),
          ],
        ) || t("guideOpening");
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
    case "login_required":
      status.textContent = msgWithChat("guideLoginChat", selectedChat);
      hint.textContent = t("hintLoginRequired");
      break;
    case "tab_open_failed":
      status.textContent = t("guideTabOpenFailed");
      hint.textContent = t("hintTabOpenFailed");
      break;
    case "clipboard_failed":
      status.textContent = t("guideCopyFailed");
      hint.textContent = t("hintCopyFailed");
      break;
    case "cancelled":
      status.textContent = t("guideCancelled");
      hint.textContent = t("hintCancelled");
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
  } else if (lastPackage.transcriptSource === "external") {
    captionsLabel = t("captionsExternal");
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
  if (lastPackage.transcriptSource === "external") {
    lines.push(t("captionsExternalHint"));
  }
  if (!enableTranscript && lastPackage.transcriptSource !== "manual") {
    lines.push(t("transcriptOffHint"));
  }
  detailsEl.textContent = lines.join("\n");
}

function fillChatSelect(select: HTMLSelectElement, selected: ChatTargetId): void {
  const locale = uiLocale();
  select.replaceChildren();
  for (const id of Object.keys(CHAT_TARGETS) as ChatTargetId[]) {
    const chat = CHAT_TARGETS[id];
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = locale === "de" ? chat.labelDe : chat.labelEn;
    select.append(opt);
  }
  select.value = selected in CHAT_TARGETS ? selected : DEFAULT_CHAT;
}

function applyDefaultChat(defaultChat: string): void {
  const id = (
    defaultChat in CHAT_TARGETS ? defaultChat : DEFAULT_CHAT
  ) as ChatTargetId;
  selectedChat = id;
  lastClickedChat = id;
  const select = document.getElementById("chatTarget") as HTMLSelectElement | null;
  if (!select) return;
  if (select.options.length === 0) {
    fillChatSelect(select, id);
  } else {
    select.value = id;
  }
}

function setOpenChatEnabled(enabled: boolean): void {
  const btn = document.getElementById("btnOpenChat") as HTMLButtonElement | null;
  if (btn) btn.disabled = !enabled;
}

async function ensurePrefsReady(): Promise<void> {
  if (prefsReady) return;
  await prefsReadyPromise;
}

function fillLoginHelp(): void {
  const list = document.getElementById("loginHelpList");
  if (!list) return;
  list.replaceChildren();
  const locale = uiLocale();
  for (const id of Object.keys(CHAT_TARGETS) as ChatTargetId[]) {
    const chat = CHAT_TARGETS[id];
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = chat.loginUrl;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = locale === "de" ? chat.labelDe : chat.labelEn;
    li.append(a);
    const note = document.createElement("span");
    note.textContent = chat.supportsInject
      ? ` — ${t("loginHelpInjectNote")}`
      : ` — ${t("loginHelpPasteNote")}`;
    li.append(note);
    list.append(li);
  }
}

function persistDefaultChat(id: ChatTargetId): void {
  applyDefaultChat(id);
  void chrome.storage.sync.set({ defaultChat: id });
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

async function copyTextToClipboard(text: string): Promise<boolean> {
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

async function copyPackageToClipboard(
  pkg: PastePackage,
  target?: ChatTargetId,
): Promise<boolean> {
  return copyTextToClipboard(formatPastePackageText(pkg, target));
}

/** When auto-transcript is off, drop cached captions (manual paste still kept). */
function packageForHandoff(pkg: PastePackage): PastePackage {
  if (enableTranscript) return pkg;
  if (pkg.transcriptSource === "manual" && pkg.transcript?.trim()) {
    return pkg;
  }
  return buildPastePackage({
    videoUrl: pkg.videoUrl,
    locale: pkg.locale,
    platform: pkg.platform,
  });
}

async function handoffToChat(
  target: ChatTargetId,
  opts?: { force?: boolean },
): Promise<void> {
  await ensurePrefsReady();
  if (handoffBusy) return;
  // Ignore SW retry deliveries; button clicks pass force: true.
  if (!opts?.force && Date.now() < handoffCooldownUntil) return;
  handoffBusy = true;
  lastClickedChat = target;
  try {
    setMsg("handoffMsg", t("handoffWorking"));
    const rawPkg = await ensurePackage();
    if (!rawPkg?.videoUrl) {
      setMsg("handoffMsg", t("captureFailed"), "error");
      setGuidePhase("idle");
      return;
    }
    const pkg = packageForHandoff(rawPkg);

    const charLimit = getMessageCharLimit(target);
    const messages = splitIntoHandoffMessages(pkg, target, { charLimit });
    multipromptParts = messages;
    multipromptIndex = 0;
    const firstText = messages[0] ?? formatPastePackageText(pkg, target);

    // Clipboard backup if insert/send fails in the chat tab (first / current part).
    const copied = await copyTextToClipboard(firstText);
    if (!copied) {
      setGuidePhase("clipboard_failed");
      setMsg("handoffMsg", t("hintCopyFailed"), "error");
      return;
    }

    setGuidePhase(messages.length > 1 ? "multiprompt" : "copied");
    const chat = CHAT_TARGETS[target] ?? CHAT_TARGETS[DEFAULT_CHAT];
    let tab: chrome.tabs.Tab;
    try {
      tab = await chrome.tabs.create({ url: chat.openUrl });
    } catch {
      setGuidePhase("tab_open_failed");
      setMsg("handoffMsg", t("handoffTabOpenFailed"), "error");
      return;
    }
    if (tab.id == null) {
      setGuidePhase("tab_open_failed");
      setMsg("handoffMsg", t("handoffTabOpenFailed"), "error");
      return;
    }
    const tabId = tab.id;
    const at = Date.now();
    selectedChat = target;
    persistDefaultChat(target);

    const supportsInject = CHAT_TARGETS[target]?.supportsInject ?? false;
    if (!supportsInject) {
      activeHandoff = null;
      openHandoffs.clear();
      setGuidePhase("paste_needed");
      setMsg(
        "handoffMsg",
        messages.length > 1
          ? chrome.i18n.getMessage(
              "handoffMultipromptPaste",
              [String(1), String(messages.length)],
            ) || msgWithChat("handoffOpenedPaste", target)
          : msgWithChat("handoffOpenedPaste", target),
        "ok",
      );
      handoffCooldownUntil = Date.now() + 2500;
      return;
    }

    const session = { tabId, at, target };
    activeHandoff = session;
    openHandoffs.set(handoffKey(tabId, at), session);

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
      messages,
      index: 0,
      charLimit,
      package: pkg,
      text: firstText,
      target,
      at,
      touchedAt: at,
      tabId,
    };
    await chrome.storage.session.set({ [PENDING_CHAT_HANDOFFS_KEY]: map });
    await chrome.storage.session.remove(PENDING_CHAT_HANDOFF_KEY);
    // Do not clear workCancelledAt here — isWorkCancelled(pending.at) already
    // ignores cancels older than this handoff. Clearing would let an in-flight
    // inject from a cancelled session resume and restorePending.
    void (async () => {
      await new Promise((r) => setTimeout(r, 3800));
      try {
        await chrome.runtime.sendMessage({
          type: "TRIGGER_CHAT_INJECT",
          tabId,
        } satisfies ExtensionMessage);
      } catch {
        /* service worker wake */
      }
    })();
    setGuidePhase(messages.length > 1 ? "multiprompt" : "opened");
    setMsg(
      "handoffMsg",
      messages.length > 1
        ? chrome.i18n.getMessage(
            "handoffMultipromptInject",
            [String(1), String(messages.length)],
          ) || msgWithChat("handoffOpenedInject", target)
        : msgWithChat("handoffOpenedInject", target),
      "ok",
    );
    handoffCooldownUntil = Date.now() + 2500;
  } finally {
    handoffBusy = false;
  }
}

/** Re-copy for the last attempted/opened chat (recovery after open or clipboard fail). */
async function copyAgain(): Promise<void> {
  // Multiprompt paste targets: advance to next part when user clicks Copy again.
  if (
    multipromptParts.length > 1 &&
    (guidePhase === "paste_needed" ||
      guidePhase === "inject_failed" ||
      guidePhase === "multiprompt")
  ) {
    const next = Math.min(multipromptIndex + 1, multipromptParts.length - 1);
    if (
      guidePhase === "paste_needed" &&
      multipromptIndex < multipromptParts.length - 1
    ) {
      multipromptIndex = next;
    }
    const text = multipromptParts[multipromptIndex]!;
    const copied = await copyTextToClipboard(text);
    if (copied) {
      setGuidePhase("paste_needed");
      setMsg(
        "handoffMsg",
        chrome.i18n.getMessage(
          "handoffMultipromptPaste",
          [
            String(multipromptIndex + 1),
            String(multipromptParts.length),
          ],
        ) || t("copyAgainOk"),
        "ok",
      );
    } else {
      setGuidePhase("clipboard_failed");
      setMsg("handoffMsg", t("hintCopyFailed"), "error");
    }
    return;
  }

  const pkg = await ensurePackage();
  if (!pkg?.videoUrl) {
    setMsg("handoffMsg", t("captureFailed"), "error");
    return;
  }
  const target = lastClickedChat;
  const copied = await copyPackageToClipboard(packageForHandoff(pkg), target);
  if (copied) {
    if (
      guidePhase === "clipboard_failed" ||
      guidePhase === "tab_open_failed"
    ) {
      setGuidePhase("ready");
    } else if (guidePhase === "login_required") {
      setGuidePhase("login_required");
    } else if (guidePhase === "paste_needed") {
      setGuidePhase("paste_needed");
    } else {
      setGuidePhase("opened");
    }
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
  const copied = await copyPackageToClipboard(packageForHandoff(pkg));
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
      if (response.error === "cancelled") {
        setGuidePhase("cancelled");
        setText("captureStatus", t("guideCancelled"));
        setText("captureDetails", "");
        setMsg("handoffMsg", t("handoffCancelled"), "error");
        return;
      }
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
  setText("btnOpenChat", t("btnOpenChat"));
  setText("labelChatTarget", t("labelChatTarget"));
  setText("btnCopyAgain", t("btnCopyAgain"));
  setText("loginHelpHeading", t("loginHelpHeading"));
  setText("loginHelpIntro", t("loginHelpIntro"));
  setText("loginHelpPaste", t("loginHelpPaste"));
  fillLoginHelp();
  setOpenChatEnabled(false);
  const chatSelect = document.getElementById(
    "chatTarget",
  ) as HTMLSelectElement | null;
  if (chatSelect) fillChatSelect(chatSelect, selectedChat);
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

document.getElementById("btnOpenChat")?.addEventListener("click", () => {
  void (async () => {
    await ensurePrefsReady();
    const select = document.getElementById(
      "chatTarget",
    ) as HTMLSelectElement | null;
    const fromSelect =
      select?.value && select.value in CHAT_TARGETS
        ? (select.value as ChatTargetId)
        : selectedChat;
    selectedChat = fromSelect;
    void handoffToChat(fromSelect, { force: true });
  })();
});

function syncChatSelectFromDom(): void {
  const select = document.getElementById(
    "chatTarget",
  ) as HTMLSelectElement | null;
  const value = select?.value;
  if (value && value in CHAT_TARGETS) {
    persistDefaultChat(value as ChatTargetId);
  }
}

document.getElementById("chatTarget")?.addEventListener("change", () => {
  syncChatSelectFromDom();
});
// Keyboard navigation updates value before blur/change on some platforms.
document.getElementById("chatTarget")?.addEventListener("input", () => {
  syncChatSelectFromDom();
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
    if (changes.enableTranscript) {
      enableTranscript = changes.enableTranscript.newValue !== false;
      renderCapture();
    }
    if (changes.defaultChat || changes.fontSize || changes.enableTranscript) {
      return;
    }
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
  if (message.type === "WORK_CANCELLED") {
    activeHandoff = null;
    openHandoffs.clear();
    setGuidePhase("cancelled");
    setMsg("handoffMsg", t("handoffCancelled"), "error");
    setText("captureStatus", t("guideCancelled"));
    return;
  }
  if (message.type === "CHAT_INJECT_RESULT") {
    const key = handoffKey(message.tabId, message.at);
    const session = openHandoffs.get(key);
    if (!session && message.reason !== "multiprompt-progress") return;

    const isActive =
      activeHandoff != null &&
      message.tabId === activeHandoff.tabId &&
      message.at === activeHandoff.at;

    // Intermediate multiprompt part — keep session open and update guide.
    if (message.ok && message.reason === "multiprompt-progress") {
      if (isActive && message.part != null && message.total != null) {
        multipromptIndex = Math.max(0, message.part);
        setGuidePhase("multiprompt");
        setMsg(
          "handoffMsg",
          chrome.i18n.getMessage(
            "handoffMultipromptInject",
            [String(message.part + 1), String(message.total)],
          ) || t("handoffWorking"),
          "ok",
        );
      }
      return;
    }

    if (!session) return;
    openHandoffs.delete(key);

    if (message.ok) {
      if (isActive) {
        persistDefaultChat(session.target);
        setGuidePhase("inject_ok");
        setMsg("handoffMsg", t("handoffInjectOk"), "ok");
      }
      return;
    }

    if (isActive) {
      if (message.reason === "cancelled") {
        setGuidePhase("cancelled");
        setMsg("handoffMsg", t("handoffCancelled"), "error");
      } else if (message.reason === "login-required") {
        selectedChat = session.target;
        setGuidePhase("login_required");
        setMsg(
          "handoffMsg",
          msgWithChat("handoffLoginChat", session.target),
          "error",
        );
      } else {
        setGuidePhase("inject_failed");
        setMsg("handoffMsg", t("handoffInjectFailed"), "error");
      }
    }
  }
});

initCopy();
void chrome.storage.sync
  .get({
    defaultChat: DEFAULT_CHAT,
    fontSize: "normal" satisfies FontSizePref,
    enableTranscript: true,
  })
  .then(({ defaultChat, fontSize, enableTranscript: et }) => {
    const chat =
      typeof defaultChat === "string" && defaultChat in CHAT_TARGETS
        ? (defaultChat as ChatTargetId)
        : DEFAULT_CHAT;
    applyDefaultChat(chat);
    applyFontSize(fontSize === "large" ? "large" : "normal");
    enableTranscript = et !== false;
    prefsReady = true;
    prefsReadyResolve?.();
    prefsReadyResolve = null;
    setOpenChatEnabled(true);
  });
void initCaptureState();
