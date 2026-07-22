/**
 * Lightweight probe on ChatGPT / Gemini / Claude / Copilot pages: ask the
 * service worker to run MAIN-world insert+send when the composer appears.
 */

import { isPostSendChatPath } from "@ai-video-fact-check/shared";
import { installWorkOverlayListener } from "./workOverlay.js";

installWorkOverlayListener();

function hostOk(): boolean {
  const h = location.hostname.toLowerCase();
  return (
    h === "chatgpt.com" ||
    h.endsWith(".chatgpt.com") ||
    h === "gemini.google.com" ||
    h.endsWith(".gemini.google.com") ||
    h === "claude.ai" ||
    h.endsWith(".claude.ai") ||
    h === "copilot.microsoft.com" ||
    h.endsWith(".copilot.microsoft.com")
  );
}

function composerPresent(): boolean {
  return Boolean(
    document.querySelector("#prompt-textarea") ||
      document.querySelector('[data-testid="prompt-textarea"]') ||
      document.querySelector('div.ql-editor[contenteditable="true"]') ||
      document.querySelector('div[contenteditable="true"][role="textbox"]') ||
      document.querySelector("div.ProseMirror[contenteditable='true']") ||
      document.querySelector('fieldset div[contenteditable="true"]') ||
      document.querySelector('[data-testid="chat-input"]') ||
      document.querySelector('div[contenteditable="true"].ProseMirror') ||
      document.querySelector("textarea#userInput") ||
      document.querySelector('textarea[data-testid="composer-input"]') ||
      document.querySelector('[data-testid="composer-input"]') ||
      document.querySelector('textarea[placeholder*="Message Copilot"]') ||
      document.querySelector('textarea[placeholder*="Message"]') ||
      document.querySelector('textarea[placeholder*="Nachricht"]') ||
      document.querySelector('[aria-label*="Message Copilot"]') ||
      document.querySelector('textarea:not([aria-hidden="true"])'),
  );
}

let lastRequestAt = 0;

function requestInject(force = false): void {
  if (!hostOk()) return;
  // First-message landing pages only for auto-probe.
  // Multiprompt continuation on /c/… is driven by the service worker.
  if (isPostSendChatPath(location.pathname)) return;
  // Debounce MutationObserver storms (composer mount fires many mutations).
  const now = Date.now();
  if (!force && now - lastRequestAt < 1200) return;
  lastRequestAt = now;
  void chrome.runtime.sendMessage({ type: "TRIGGER_CHAT_INJECT" });
}

// Do not kick immediately — chat shells often mount the composer after idle.
// Wait for a visible composer, then ask the SW; keep late polls as backup.
function kickWhenComposerReady(): void {
  if (isPostSendChatPath(location.pathname)) return;
  if (composerPresent()) {
    requestInject(true);
    return;
  }
  // Poll briefly so we do not claim pending while the shell is still empty.
  let n = 0;
  const id = setInterval(() => {
    n += 1;
    if (isPostSendChatPath(location.pathname)) {
      clearInterval(id);
      return;
    }
    if (composerPresent()) {
      clearInterval(id);
      requestInject(true);
      return;
    }
    if (n >= 40) clearInterval(id); // ~20s
  }, 500);
}

kickWhenComposerReady();
setTimeout(() => requestInject(true), 4000);
setTimeout(() => requestInject(true), 8000);
setTimeout(() => requestInject(true), 14000);
setTimeout(() => requestInject(true), 22000);

const mo = new MutationObserver(() => {
  if (isPostSendChatPath(location.pathname)) {
    mo.disconnect();
    return;
  }
  if (composerPresent()) {
    requestInject();
  }
});
mo.observe(document.documentElement, { childList: true, subtree: true });
setTimeout(() => mo.disconnect(), 60000);
