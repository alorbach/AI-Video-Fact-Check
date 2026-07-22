import { CHAT_TARGETS, type ChatTargetId } from "@ai-video-fact-check/shared";

type FontSizePref = "normal" | "large";

const LOCAL_KEYS = {
  rememberLastPackage: "rememberLastPackage",
  persistedCapture: "persistedCapture",
  persistedPackage: "persistedPackage",
} as const;

function t(key: string): string {
  return chrome.i18n.getMessage(key) || key;
}

function applyFontSize(size: FontSizePref): void {
  document.documentElement.dataset.fontSize =
    size === "large" ? "large" : "normal";
}

function uiLang(): string {
  return chrome.i18n.getUILanguage().toLowerCase().startsWith("de")
    ? "de"
    : "en";
}

function fillDefaultChatSelect(
  select: HTMLSelectElement,
  selected: string,
): void {
  const de = uiLang() === "de";
  select.replaceChildren();
  for (const id of Object.keys(CHAT_TARGETS) as ChatTargetId[]) {
    const chat = CHAT_TARGETS[id];
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = de ? chat.labelDe : chat.labelEn;
    select.append(opt);
  }
  select.value = selected in CHAT_TARGETS ? selected : "chatgpt_video_faktencheck";
}

async function load(): Promise<void> {
  document.documentElement.lang = uiLang();

  const skipLink = document.getElementById("skipLink");
  const optTitle = document.getElementById("optTitle");
  const optSubtitle = document.getElementById("optSubtitle");
  const labelDefaultChat = document.getElementById("labelDefaultChat");
  const labelFontSize = document.getElementById("labelFontSize");
  const fontSizeHelp = document.getElementById("fontSizeHelp");
  const labelRememberPackage = document.getElementById("labelRememberPackage");
  const rememberPackageHelp = document.getElementById("rememberPackageHelp");
  const optFontNormal = document.getElementById("optFontNormal");
  const optFontLarge = document.getElementById("optFontLarge");
  const btnSave = document.getElementById("btnSave");
  const creditsLabel = document.getElementById("creditsLabel");
  const chatSelect = document.getElementById("defaultChat") as HTMLSelectElement;
  const fontSelect = document.getElementById("fontSize") as HTMLSelectElement;
  const rememberBox = document.getElementById(
    "rememberLastPackage",
  ) as HTMLInputElement | null;

  if (skipLink) skipLink.textContent = t("skipToContent");
  if (optTitle) optTitle.textContent = t("optionsTitle");
  if (optSubtitle) optSubtitle.textContent = t("optionsSubtitle");
  if (labelDefaultChat) labelDefaultChat.textContent = t("labelDefaultChat");
  if (labelFontSize) labelFontSize.textContent = t("labelFontSize");
  if (fontSizeHelp) fontSizeHelp.textContent = t("fontSizeHelp");
  if (labelRememberPackage) {
    labelRememberPackage.textContent = t("labelRememberPackage");
  }
  if (rememberPackageHelp) {
    rememberPackageHelp.textContent = t("rememberPackageHelp");
  }
  if (optFontNormal) optFontNormal.textContent = t("fontSizeNormal");
  if (optFontLarge) optFontLarge.textContent = t("fontSizeLarge");
  if (btnSave) btnSave.textContent = t("btnSave");
  if (creditsLabel) creditsLabel.textContent = t("creditsLabel");

  const { defaultChat, fontSize } = await chrome.storage.sync.get({
    defaultChat: "chatgpt_video_faktencheck" satisfies ChatTargetId,
    fontSize: "normal" satisfies FontSizePref,
  });
  const local = await chrome.storage.local.get({
    [LOCAL_KEYS.rememberLastPackage]: false,
  });

  if (chatSelect) {
    fillDefaultChatSelect(
      chatSelect,
      typeof defaultChat === "string" ? defaultChat : "chatgpt_video_faktencheck",
    );
  }
  const size: FontSizePref = fontSize === "large" ? "large" : "normal";
  if (fontSelect) fontSelect.value = size;
  applyFontSize(size);
  if (rememberBox) {
    rememberBox.checked = Boolean(local[LOCAL_KEYS.rememberLastPackage]);
  }

  fontSelect?.addEventListener("change", () => {
    applyFontSize(fontSelect.value === "large" ? "large" : "normal");
  });
}

document.getElementById("btnSave")?.addEventListener("click", async () => {
  const chatSelect = document.getElementById("defaultChat") as HTMLSelectElement;
  const fontSelect = document.getElementById("fontSize") as HTMLSelectElement;
  const rememberBox = document.getElementById(
    "rememberLastPackage",
  ) as HTMLInputElement | null;
  const defaultChat = chatSelect.value;
  const fontSize: FontSizePref =
    fontSelect.value === "large" ? "large" : "normal";
  const rememberLastPackage = Boolean(rememberBox?.checked);

  await chrome.storage.sync.set({ defaultChat, fontSize });
  await chrome.storage.local.set({
    [LOCAL_KEYS.rememberLastPackage]: rememberLastPackage,
  });
  if (!rememberLastPackage) {
    await chrome.storage.local.remove([
      LOCAL_KEYS.persistedCapture,
      LOCAL_KEYS.persistedPackage,
    ]);
  }

  applyFontSize(fontSize);
  const saveMsg = document.getElementById("saveMsg");
  if (saveMsg) saveMsg.textContent = t("saveOk");
});

void load();
