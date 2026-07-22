/**
 * Full-page work overlay (senior-friendly) for capture / chat insert.
 * Used from content.js (video hosts) and chatInject.js (chat hosts).
 * The status card is draggable so it does not block the chat composer.
 */

import type { ExtensionMessage, WorkOverlayPhase } from "@ai-video-fact-check/shared";

const ROOT_ID = "vf-factcheck-work-overlay";

/** Remember card position across phase updates in the same page. */
let savedCardPos: { left: number; top: number } | null = null;

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
  if (phase === "helper") {
    return de
      ? "Transkript wird geholt…"
      : "Fetching transcript…";
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
  if (phase === "capture" || phase === "helper") {
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

function dragHint(): string {
  return uiLangDe()
    ? "Ziehen, um das Fenster zu verschieben"
    : "Drag to move this window";
}

export function hideWorkOverlay(): void {
  document.getElementById(ROOT_ID)?.remove();
}

function clampCardPosition(
  left: number,
  top: number,
  card: HTMLElement,
): { left: number; top: number } {
  const margin = 8;
  const w = card.offsetWidth || 280;
  const h = card.offsetHeight || 160;
  const maxLeft = Math.max(margin, window.innerWidth - w - margin);
  const maxTop = Math.max(margin, window.innerHeight - h - margin);
  return {
    left: Math.min(Math.max(margin, left), maxLeft),
    top: Math.min(Math.max(margin, top), maxTop),
  };
}

function placeCard(card: HTMLElement, left: number, top: number): void {
  const pos = clampCardPosition(left, top, card);
  card.style.left = `${pos.left}px`;
  card.style.top = `${pos.top}px`;
  card.style.right = "auto";
  card.style.bottom = "auto";
  card.style.transform = "none";
  savedCardPos = pos;
}

function enableCardDrag(card: HTMLElement, handle: HTMLElement): void {
  handle.style.cursor = "grab";
  handle.title = dragHint();
  handle.setAttribute("aria-grabbed", "false");

  let dragging = false;
  let startX = 0;
  let startY = 0;
  let originLeft = 0;
  let originTop = 0;
  let pointerId: number | null = null;

  const onPointerDown = (ev: PointerEvent) => {
    // Cancel button / interactive controls must stay clickable.
    const t = ev.target as HTMLElement | null;
    if (t?.closest("button, a, input, textarea, select")) return;
    if (ev.button !== 0 && ev.pointerType === "mouse") return;

    dragging = true;
    pointerId = ev.pointerId;
    handle.setAttribute("aria-grabbed", "true");
    handle.style.cursor = "grabbing";
    card.style.cursor = "grabbing";

    const rect = card.getBoundingClientRect();
    originLeft = rect.left;
    originTop = rect.top;
    startX = ev.clientX;
    startY = ev.clientY;

    // Switch from centered layout to absolute coords before first move.
    placeCard(card, originLeft, originTop);

    try {
      handle.setPointerCapture(ev.pointerId);
    } catch {
      /* ignore */
    }
    ev.preventDefault();
  };

  const onPointerMove = (ev: PointerEvent) => {
    if (!dragging) return;
    if (pointerId != null && ev.pointerId !== pointerId) return;
    placeCard(
      card,
      originLeft + (ev.clientX - startX),
      originTop + (ev.clientY - startY),
    );
  };

  const endDrag = (ev: PointerEvent) => {
    if (!dragging) return;
    if (pointerId != null && ev.pointerId !== pointerId) return;
    dragging = false;
    pointerId = null;
    handle.setAttribute("aria-grabbed", "false");
    handle.style.cursor = "grab";
    card.style.cursor = "";
    try {
      handle.releasePointerCapture(ev.pointerId);
    } catch {
      /* ignore */
    }
  };

  handle.addEventListener("pointerdown", onPointerDown);
  handle.addEventListener("pointermove", onPointerMove);
  handle.addEventListener("pointerup", endDrag);
  handle.addEventListener("pointercancel", endDrag);
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
      <div class="vf-wo-drag">
        <p class="vf-wo-title"></p>
        <p class="vf-wo-detail"></p>
      </div>
      <button type="button" class="vf-wo-cancel"></button>
    </div>
  `;

  const style = document.createElement("style");
  style.textContent = `
    #${ROOT_ID} {
      position: fixed;
      inset: 0;
      z-index: 2147483646;
      font-family: system-ui, "Segoe UI", sans-serif;
    }
    #${ROOT_ID} .vf-wo-backdrop {
      position: absolute;
      inset: 0;
      background: rgba(20, 24, 32, 0.45);
    }
    #${ROOT_ID} .vf-wo-card {
      position: absolute;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      max-width: min(28rem, 92vw);
      width: min(28rem, 92vw);
      padding: 1.5rem 1.35rem;
      border-radius: 12px;
      background: #fff;
      color: #1a1a1a;
      box-shadow: 0 12px 40px rgba(0,0,0,0.28);
      text-align: center;
      touch-action: none;
      user-select: none;
    }
    #${ROOT_ID} .vf-wo-drag {
      cursor: grab;
      padding-bottom: 0.25rem;
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
      user-select: none;
      touch-action: manipulation;
    }
    #${ROOT_ID} .vf-wo-cancel:hover,
    #${ROOT_ID} .vf-wo-cancel:focus-visible {
      background: #ececec;
      outline: 3px solid #0b57d0;
      outline-offset: 2px;
    }
  `;
  root.prepend(style);

  const card = root.querySelector(".vf-wo-card") as HTMLElement | null;
  const drag = root.querySelector(".vf-wo-drag") as HTMLElement | null;
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

  if (card && drag) {
    // Drag from title/detail; cancel button stays clickable.
    enableCardDrag(card, drag);
    if (savedCardPos) {
      // Apply after layout so clamp uses real card size.
      requestAnimationFrame(() => {
        placeCard(card, savedCardPos!.left, savedCardPos!.top);
      });
    }
  }
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
      // Next show starts centered again (new handoff / capture).
      savedCardPos = null;
    }
  });
}
