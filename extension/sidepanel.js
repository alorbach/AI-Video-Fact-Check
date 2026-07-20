const GPT_URL =
  "https://chatgpt.com/g/g-6a5e1494f814819181208da5d30ab4ae-video-faktencheck";
const GEMINI_URL = "https://gemini.google.com/";

function t(key) {
  return chrome.i18n.getMessage(key) || key;
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
  chrome.tabs.create({ url: GPT_URL });
});

document.getElementById("btnOpenGemini").addEventListener("click", () => {
  chrome.tabs.create({ url: GEMINI_URL });
});

document.getElementById("btnOptions").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

initCopy();
