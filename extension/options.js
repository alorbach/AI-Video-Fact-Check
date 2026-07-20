function t(key) {
  return chrome.i18n.getMessage(key) || key;
}

async function load() {
  document.getElementById("optTitle").textContent = t("optionsTitle");
  document.getElementById("optSubtitle").textContent = t("optionsSubtitle");
  document.getElementById("labelDefaultChat").textContent = t("labelDefaultChat");
  document.getElementById("optGpt").textContent = t("btnOpenGpt");
  document.getElementById("optGemini").textContent = t("btnOpenGemini");
  document.getElementById("btnSave").textContent = t("btnSave");
  document.getElementById("creditsLabel").textContent = t("creditsLabel");

  const { defaultChat } = await chrome.storage.sync.get({
    defaultChat: "chatgpt_video_faktencheck",
  });
  document.getElementById("defaultChat").value = defaultChat;
}

document.getElementById("btnSave").addEventListener("click", async () => {
  const defaultChat = document.getElementById("defaultChat").value;
  await chrome.storage.sync.set({ defaultChat });
  document.getElementById("saveMsg").textContent = t("saveOk");
});

load();
