/**
 * Lightweight probe on ChatGPT/Gemini pages: ask the service worker to run
 * MAIN-world insert+send when the composer appears.
 */

function hostOk(): boolean {
  const h = location.hostname.toLowerCase();
  return (
    h === "chatgpt.com" ||
    h.endsWith(".chatgpt.com") ||
    h === "gemini.google.com" ||
    h.endsWith(".gemini.google.com")
  );
}

function requestInject(): void {
  if (!hostOk()) return;
  // Do not re-inject on conversation pages after a send navigated here.
  if (location.pathname.includes("/c/")) return;
  void chrome.runtime.sendMessage({ type: "TRIGGER_CHAT_INJECT" });
}

requestInject();
setTimeout(requestInject, 2000);
setTimeout(requestInject, 5000);

const mo = new MutationObserver(() => {
  if (location.pathname.includes("/c/")) {
    mo.disconnect();
    return;
  }
  if (
    document.querySelector("#prompt-textarea") ||
    document.querySelector('div.ql-editor[contenteditable="true"]') ||
    document.querySelector('div[contenteditable="true"][role="textbox"]')
  ) {
    requestInject();
  }
});
mo.observe(document.documentElement, { childList: true, subtree: true });
setTimeout(() => mo.disconnect(), 20000);
