/**
 * Full-page work overlay (senior-friendly) for capture / chat insert.
 * Used from content.js (video hosts) and chatInject.js (chat hosts).
 */

import type { ExtensionMessage, WorkOverlayPhase } from "@ai-video-fact-check/shared";

const ROOT_ID = "vf-factcheck-work-overlay";

function uiLangDe(): boolean {
  return (chrome.i18n?.getUILanguage?.() || navigator.language || "en")
    .toLowerCase()
    .startsWith("de");
}

function defaultTitle(phase: WorkOverlayPhase, part?: number, total?: number): string {
  const de = uiLangDe();
  if (phase === "capture") {
    return de ? "Video wird vorbereitet…" : "Preparing video…";
  }
  if (
    (phase === "multiprompt" || phase === "inject") &&
    part != null &&
    total != null &&
    total > 1
  ) {
    return de
      ? `Nachricht Teil ${part} von ${total}…`
      : `Message part ${part} of ${total}…`;
  }
  if (phase === "waiting") {
    return de
      ? "Warte auf die nächste Eingabe…"
      : "Waiting for the next step…";
  }
  return de ? "Nachricht wird eingefügt…" : "Inserting message…";
}

function defaultDetail(phase: WorkOverlayPhase): string {
  const de = uiLangDe();
  if (phase === "capture") {
    return de
      ? "Bitte kurz warten. Sie können jederzeit abbrechen."
      : "Please wait a moment. You can cancel anytime.";
  }
  return de
    ? "Bitte dieses Fenster nicht schließen. Sie können abbrechen."
    : "Please do not close this window. You can cancel.";
}

function cancelLabel(): string {
  return uiLangDe() ? "Abbrechen" : "Cancel";
}

export function hideWorkOverlay(): void {
  document.getElementById(ROOT_ID)?.remove();
}

export function showWorkOverlay(opts: {
  phase: WorkOverlayPhase;
  part?: number;
  total?: number;
  title?: string;
  detail?: string;
}): void {
  hideWorkOverlay();
  const root = document.createElement("div");
  root.id = ROOT_ID;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-live", "polite");

  const title =
    opts.title?.trim() ||
    defaultTitle(opts.phase, opts.part, opts.total);
  const detail = opts.detail?.trim() || defaultDetail(opts.phase);

  root.innerHTML = `
    <div class="vf-wo-backdrop"></div>
    <div class="vf-wo-card">
      <p class="vf-wo-title"></p>
      <p class="vf-wo-detail"></p>
      <button type="button" class="vf-wo-cancel"></button>
    </div>
  `;

  const style = document.createElement("style");
  style.textContent = `
    #${ROOT_ID} {
      position: fixed;
      inset: 0;
      z-index: 2147483646;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: system-ui, "Segoe UI", sans-serif;
    }
    #${ROOT_ID} .vf-wo-backdrop {
      position: absolute;
      inset: 0;
      background: rgba(20, 24, 32, 0.62);
    }
    #${ROOT_ID} .vf-wo-card {
      position: relative;
      max-width: min(28rem, 92vw);
      margin: 1rem;
      padding: 1.5rem 1.35rem;
      border-radius: 12px;
      background: #fff;
      color: #1a1a1a;
      box-shadow: 0 12px 40px rgba(0,0,0,0.28);
      text-align: center;
    }
    #${ROOT_ID} .vf-wo-title {
      margin: 0 0 0.65rem;
      font-size: 1.35rem;
      font-weight: 700;
      line-height: 1.35;
    }
    #${ROOT_ID} .vf-wo-detail {
      margin: 0 0 1.25rem;
      font-size: 1.1rem;
      line-height: 1.45;
      color: #333;
    }
    #${ROOT_ID} .vf-wo-cancel {
      min-height: 48px;
      min-width: 10rem;
      padding: 0.65rem 1.25rem;
      font-size: 1.15rem;
      font-weight: 600;
      border: 2px solid #444;
      border-radius: 10px;
      background: #f5f5f5;
      color: #111;
      cursor: pointer;
    }
    #${ROOT_ID} .vf-wo-cancel:hover,
    #${ROOT_ID} .vf-wo-cancel:focus-visible {
      background: #ececec;
      outline: 3px solid #0b57d0;
      outline-offset: 2px;
    }
  `;
  root.prepend(style);

  const titleEl = root.querySelector(".vf-wo-title");
  const detailEl = root.querySelector(".vf-wo-detail");
  const btn = root.querySelector(".vf-wo-cancel");
  if (titleEl) titleEl.textContent = title;
  if (detailEl) detailEl.textContent = detail;
  if (btn) {
    btn.textContent = cancelLabel();
    btn.addEventListener("click", () => {
      void chrome.runtime.sendMessage({
        type: "CANCEL_WORK",
      } satisfies ExtensionMessage);
      hideWorkOverlay();
    });
  }

  (document.documentElement || document.body).appendChild(root);
}

export function installWorkOverlayListener(): void {
  chrome.runtime.onMessage.addListener((message: ExtensionMessage) => {
    if (message.type === "SHOW_WORK_OVERLAY") {
      showWorkOverlay({
        phase: message.phase,
        part: message.part,
        total: message.total,
        title: message.title,
        detail: message.detail,
      });
      return;
    }
    if (message.type === "HIDE_WORK_OVERLAY") {
      hideWorkOverlay();
    }
  });
}
