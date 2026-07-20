import { CHAT_TARGETS, type ChatTargetId } from "@ai-video-fact-check/shared";

function t(key: string): string {
  return chrome.i18n.getMessage(key) || key;
}

async function load(): Promise<void> {
  const optTitle = document.getElementById("optTitle");
  const optSubtitle = document.getElementById("optSubtitle");
  const labelDefaultChat = document.getElementById("labelDefaultChat");
  const optGpt = document.getElementById("optGpt");
  const optGemini = document.getElementById("optGemini");
  const btnSave = document.getElementById("btnSave");
  const creditsLabel = document.getElementById("creditsLabel");
  const select = document.getElementById("defaultChat") as HTMLSelectElement;

  if (optTitle) optTitle.textContent = t("optionsTitle");
  if (optSubtitle) optSubtitle.textContent = t("optionsSubtitle");
  if (labelDefaultChat) labelDefaultChat.textContent = t("labelDefaultChat");
  if (optGpt) optGpt.textContent = t("btnOpenGpt");
  if (optGemini) optGemini.textContent = t("btnOpenGemini");
  if (btnSave) btnSave.textContent = t("btnSave");
  if (creditsLabel) creditsLabel.textContent = t("creditsLabel");

  const { defaultChat } = await chrome.storage.sync.get({
    defaultChat: "chatgpt_video_faktencheck" satisfies ChatTargetId,
  });
  if (select && defaultChat in CHAT_TARGETS) {
    select.value = defaultChat as string;
  }
}

document.getElementById("btnSave")?.addEventListener("click", async () => {
  const select = document.getElementById("defaultChat") as HTMLSelectElement;
  const defaultChat = select.value;
  await chrome.storage.sync.set({ defaultChat });
  const saveMsg = document.getElementById("saveMsg");
  if (saveMsg) saveMsg.textContent = t("saveOk");
});

void load();
