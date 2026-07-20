const CHATS = {
  chatgpt_video_faktencheck: {
    url: "https://chatgpt.com/g/g-6a5e1494f814819181208da5d30ab4ae-video-faktencheck",
    buttonId: "btnOpenGpt",
  },
  gemini_web: {
    url: "https://gemini.google.com/",
    buttonId: "btnOpenGemini",
  },
};

const DEFAULT_CHAT = "chatgpt_video_faktencheck";

function t(key) {
  return chrome.i18n.getMessage(key) || key;
}

function openChat(chatId) {
  const chat = CHATS[chatId] ?? CHATS[DEFAULT_CHAT];
  chrome.tabs.create({ url: chat.url });
}

function applyDefaultChat(defaultChat) {
  const id = CHATS[defaultChat] ? defaultChat : DEFAULT_CHAT;
  const actions = document.querySelector(".actions");
  const gptBtn = document.getElementById("btnOpenGpt");
  const geminiBtn = document.getElementById("btnOpenGemini");
  const optionsBtn = document.getElementById("btnOptions");

  gptBtn.classList.toggle("primary", id === "chatgpt_video_faktencheck");
  geminiBtn.classList.toggle("primary", id === "gemini_web");

  // Put the default chat first so it is the obvious primary action.
  if (id === "gemini_web") {
    actions.prepend(geminiBtn);
  } else {
    actions.prepend(gptBtn);
  }
  actions.append(optionsBtn);

  gptBtn.dataset.default = id === "chatgpt_video_faktencheck" ? "true" : "false";
  geminiBtn.dataset.default = id === "gemini_web" ? "true" : "false";
}

function initCopy() {
  document.documentElement.lang = chrome.i18n.getUILanguage().startsWith("de")
    ? "de"
    : "en";
  document.getElementById("title").textContent = t("extName");
  document.getElementById("subtitle").textContent = t("sidepanelSubtitle");
  document.getElementById("stepsHeading").textContent = t("stepsHeading");
  document.getElementById("step1").textContent = t("step1");
  document.getElementById("step2").textContent = t("step2");
  document.getElementById("step3").textContent = t("step3");
  document.getElementById("hintText").textContent = t("sidepanelHint");
  document.getElementById("btnOpenGpt").textContent = t("btnOpenGpt");
  document.getElementById("btnOpenGemini").textContent = t("btnOpenGemini");
  document.getElementById("btnOptions").textContent = t("btnOptions");
  document.getElementById("creditsLabel").textContent = t("creditsLabel");
}

document.getElementById("btnOpenGpt").addEventListener("click", () => {
  openChat("chatgpt_video_faktencheck");
});

document.getElementById("btnOpenGemini").addEventListener("click", () => {
  openChat("gemini_web");
});

document.getElementById("btnOptions").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync" || !changes.defaultChat) return;
  applyDefaultChat(changes.defaultChat.newValue ?? DEFAULT_CHAT);
});

initCopy();
chrome.storage.sync.get({ defaultChat: DEFAULT_CHAT }).then(({ defaultChat }) => {
  applyDefaultChat(defaultChat);
});
