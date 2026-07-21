import { CHAT_TARGETS, type ChatTargetId } from "@ai-video-fact-check/shared";

type FontSizePref = "normal" | "large";

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

async function load(): Promise<void> {
  document.documentElement.lang = uiLang();

  const skipLink = document.getElementById("skipLink");
  const optTitle = document.getElementById("optTitle");
  const optSubtitle = document.getElementById("optSubtitle");
  const labelDefaultChat = document.getElementById("labelDefaultChat");
  const labelFontSize = document.getElementById("labelFontSize");
  const fontSizeHelp = document.getElementById("fontSizeHelp");
  const optGpt = document.getElementById("optGpt");
  const optGemini = document.getElementById("optGemini");
  const optFontNormal = document.getElementById("optFontNormal");
  const optFontLarge = document.getElementById("optFontLarge");
  const btnSave = document.getElementById("btnSave");
  const creditsLabel = document.getElementById("creditsLabel");
  const chatSelect = document.getElementById("defaultChat") as HTMLSelectElement;
  const fontSelect = document.getElementById("fontSize") as HTMLSelectElement;

  if (skipLink) skipLink.textContent = t("skipToContent");
  if (optTitle) optTitle.textContent = t("optionsTitle");
  if (optSubtitle) optSubtitle.textContent = t("optionsSubtitle");
  if (labelDefaultChat) labelDefaultChat.textContent = t("labelDefaultChat");
  if (labelFontSize) labelFontSize.textContent = t("labelFontSize");
  if (fontSizeHelp) fontSizeHelp.textContent = t("fontSizeHelp");
  if (optGpt) optGpt.textContent = t("btnOpenGpt");
  if (optGemini) optGemini.textContent = t("btnOpenGemini");
  if (optFontNormal) optFontNormal.textContent = t("fontSizeNormal");
  if (optFontLarge) optFontLarge.textContent = t("fontSizeLarge");
  if (btnSave) btnSave.textContent = t("btnSave");
  if (creditsLabel) creditsLabel.textContent = t("creditsLabel");

  const { defaultChat, fontSize } = await chrome.storage.sync.get({
    defaultChat: "chatgpt_video_faktencheck" satisfies ChatTargetId,
    fontSize: "normal" satisfies FontSizePref,
  });

  if (chatSelect && defaultChat in CHAT_TARGETS) {
    chatSelect.value = defaultChat as string;
  }
  const size: FontSizePref = fontSize === "large" ? "large" : "normal";
  if (fontSelect) fontSelect.value = size;
  applyFontSize(size);

  fontSelect?.addEventListener("change", () => {
    applyFontSize(fontSelect.value === "large" ? "large" : "normal");
  });
}

document.getElementById("btnSave")?.addEventListener("click", async () => {
  const chatSelect = document.getElementById("defaultChat") as HTMLSelectElement;
  const fontSelect = document.getElementById("fontSize") as HTMLSelectElement;
  const defaultChat = chatSelect.value;
  const fontSize: FontSizePref =
    fontSelect.value === "large" ? "large" : "normal";
  await chrome.storage.sync.set({ defaultChat, fontSize });
  applyFontSize(fontSize);
  const saveMsg = document.getElementById("saveMsg");
  if (saveMsg) saveMsg.textContent = t("saveOk");
});

void load();
