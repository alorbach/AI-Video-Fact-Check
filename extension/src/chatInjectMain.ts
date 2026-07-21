/**
 * Runs in the page MAIN world (via chrome.scripting.executeScript).
 * Must stay free of imports/closures — Chrome serializes this function.
 * Never scrape answers.
 */
export async function pageInjectAndSend(
  text: string,
): Promise<{ ok: boolean; reason?: string }> {
  const DONE = "__vfFactCheckHandoffDone";
  const ATTEMPTED = "__vfFactCheckHandoffAttempted";
  const w = window as unknown as Record<string, unknown>;
  // Idempotent only for the same payload; a different text must not look "sent".
  if (w[DONE] === text) return { ok: true, reason: "already-done" };
  if (w[DONE]) return { ok: false, reason: "already-done-other" };
  // Soft lock while fill/send runs — cleared on failure so SW retries can proceed.
  // "in-flight" blocks only parallel injects; stale locks (killed frame) expire.
  const ATTEMPTED_AT = "__vfFactCheckHandoffAttemptedAt";
  if (w[ATTEMPTED] === "in-flight") {
    const started = w[ATTEMPTED_AT];
    if (typeof started === "number" && Date.now() - started < 20_000) {
      return { ok: false, reason: "already-attempted" };
    }
  }

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const host = location.hostname.toLowerCase();
  const isGpt =
    host === "chatgpt.com" || host.endsWith(".chatgpt.com");
  const isGemini =
    host === "gemini.google.com" || host.endsWith(".gemini.google.com");
  if (!isGpt && !isGemini) return { ok: false, reason: "wrong-host" };

  function findEditor(): HTMLElement | null {
    const list: HTMLElement[] = [];
    const pushAll = (nodes: NodeListOf<HTMLElement>) => {
      nodes.forEach((n) => list.push(n));
    };
    if (isGpt) {
      pushAll(document.querySelectorAll("#prompt-textarea"));
      pushAll(document.querySelectorAll('[data-testid="prompt-textarea"]'));
      pushAll(
        document.querySelectorAll('div[contenteditable="true"][role="textbox"]'),
      );
      pushAll(
        document.querySelectorAll("div.ProseMirror[contenteditable='true']"),
      );
      pushAll(
        document.querySelectorAll('main div[contenteditable="true"]'),
      );
    } else {
      pushAll(
        document.querySelectorAll('div.ql-editor[contenteditable="true"]'),
      );
      pushAll(
        document.querySelectorAll(
          'rich-textarea div[contenteditable="true"]',
        ),
      );
      pushAll(
        document.querySelectorAll(
          'div[contenteditable="true"][role="textbox"]',
        ),
      );
      pushAll(
        document.querySelectorAll('div[contenteditable="true"][aria-label]'),
      );
    }
    for (const el of list) {
      const r = el.getBoundingClientRect();
      if (r.width > 40 && r.height > 16) return el;
    }
    return list[0] ?? null;
  }

  function hasText(el: HTMLElement): boolean {
    const raw =
      el instanceof HTMLTextAreaElement
        ? el.value
        : el.innerText || el.textContent || "";
    return raw.replace(/\u200B/g, "").trim().length > 5;
  }

  function findSend(editor: HTMLElement): HTMLButtonElement | null {
    // ChatGPT current UI: circular button, tooltip "Send prompt"
    const exact = [
      'button[data-testid="send-button"]',
      'button[aria-label="Send prompt"]',
      'button[aria-label="Send"]',
      'button[aria-label="Senden"]',
      'button[aria-label*="Send prompt"]',
    ];
    for (const sel of exact) {
      const b = document.querySelector<HTMLButtonElement>(sel);
      if (b && isClickableSend(b)) return b;
    }

    const form = editor.closest("form");
    const roots: ParentNode[] = form ? [form, document] : [document];
    for (const root of roots) {
      const buttons = [...root.querySelectorAll<HTMLButtonElement>("button")];
      // Prefer explicit send test id / label
      for (const b of buttons) {
        const label = (b.getAttribute("aria-label") || "").toLowerCase();
        const testId = (b.getAttribute("data-testid") || "").toLowerCase();
        if (
          isClickableSend(b) &&
          (testId === "send-button" ||
            testId.includes("send") ||
            label === "send prompt" ||
            label.startsWith("send") ||
            label.includes("senden"))
        ) {
          // Skip attach / voice / mic
          if (
            label.includes("attach") ||
            label.includes("voice") ||
            label.includes("dictat") ||
            label.includes("mikrofon") ||
            label.includes("microphone")
          ) {
            continue;
          }
          return b;
        }
      }
      // Composer: last enabled button with an svg near the editor
      if (form) {
        for (let i = buttons.length - 1; i >= 0; i--) {
          const b = buttons[i]!;
          if (!isClickableSend(b)) continue;
          const label = (b.getAttribute("aria-label") || "").toLowerCase();
          if (
            label.includes("attach") ||
            label.includes("voice") ||
            label.includes("mikrofon") ||
            label.includes("microphone")
          ) {
            continue;
          }
          if (b.querySelector("svg")) return b;
        }
      }
    }
    return null;
  }

  function isClickableSend(b: HTMLButtonElement): boolean {
    if (b.disabled) return false;
    if (b.getAttribute("aria-disabled") === "true") return false;
    if (b.dataset.disabled === "true") return false;
    const r = b.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function clickSendButton(btn: HTMLButtonElement): void {
    btn.focus();
    const opts = { bubbles: true, cancelable: true, view: window };
    btn.dispatchEvent(new PointerEvent("pointerdown", opts));
    btn.dispatchEvent(new MouseEvent("mousedown", opts));
    btn.dispatchEvent(new PointerEvent("pointerup", opts));
    btn.dispatchEvent(new MouseEvent("mouseup", opts));
    btn.dispatchEvent(new MouseEvent("click", opts));
    try {
      btn.click();
    } catch {
      /* ignore */
    }
  }

  function pressEnterToSend(el: HTMLElement): void {
    el.focus();
    const opts = {
      key: "Enter",
      code: "Enter",
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true,
    };
    el.dispatchEvent(new KeyboardEvent("keydown", opts));
    el.dispatchEvent(new KeyboardEvent("keypress", opts));
    el.dispatchEvent(new KeyboardEvent("keyup", opts));
  }

  let editor: HTMLElement | null = null;
  for (let i = 0; i < 80; i++) {
    editor = findEditor();
    if (editor) break;
    await sleep(250);
  }
  if (!editor) {
    // Login wall or composer not ready
    const login =
      document.body.innerText.includes("Log in") ||
      document.body.innerText.includes("Anmelden");
    return { ok: false, reason: login ? "login-required" : "no-editor" };
  }

  // Claim before fill — parallel MAIN-world injects must not both send.
  w[ATTEMPTED] = "in-flight";
  w[ATTEMPTED_AT] = Date.now();

  editor.focus();
  try {
    editor.click();
  } catch {
    /* ignore */
  }
  await sleep(100);

  if (editor instanceof HTMLTextAreaElement) {
    editor.value = text;
    editor.dispatchEvent(new Event("input", { bubbles: true }));
  } else {
    try {
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(editor);
      sel?.removeAllRanges();
      sel?.addRange(range);
    } catch {
      document.execCommand("selectAll", false);
    }

    let ok = false;
    try {
      ok = document.execCommand("insertText", false, text);
    } catch {
      ok = false;
    }

    if (!ok || !hasText(editor)) {
      try {
        const dt = new DataTransfer();
        dt.setData("text/plain", text);
        editor.dispatchEvent(
          new ClipboardEvent("paste", {
            bubbles: true,
            cancelable: true,
            clipboardData: dt,
          }),
        );
      } catch {
        /* ignore */
      }
    }

    if (!hasText(editor)) {
      editor.textContent = text;
      editor.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          inputType: "insertText",
          data: text,
        }),
      );
    }
  }

  if (!hasText(editor)) {
    w[ATTEMPTED] = "failed";
    return { ok: false, reason: "fill-failed" };
  }

  function composerLooksSent(el: HTMLElement): boolean {
    if (!hasText(el)) return true;
    if (document.querySelector('button[data-testid="stop-button"]')) return true;
    if (document.querySelector('button[aria-label*="Stop"]')) return true;
    if (document.querySelector('button[aria-label*="Stoppen"]')) return true;
    return false;
  }

  // Wait for Send to enable (React), then send exactly once — never click+Enter.
  await sleep(isGpt ? 700 : 350);
  let sentViaClick = false;
  for (let i = 0; i < 40; i++) {
    const btn = findSend(editor);
    if (btn) {
      clickSendButton(btn);
      sentViaClick = true;
      break;
    }
    await sleep(150);
  }

  if (!sentViaClick) {
    pressEnterToSend(editor);
  }

  // Poll longer — ChatGPT/Gemini often clear the composer slowly.
  for (let i = 0; i < 25; i++) {
    if (composerLooksSent(editor)) {
      w[DONE] = text;
      w[ATTEMPTED] = "done";
      return { ok: true, reason: "sent" };
    }
    await sleep(200);
  }

  // Do not ask the SW to retry after a Send click — that can double-submit.
  w[ATTEMPTED] = "failed";
  if (sentViaClick) {
    return { ok: false, reason: "send-clicked-unconfirmed" };
  }
  return { ok: false, reason: "send-unconfirmed" };
}
