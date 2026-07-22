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
  const ATTEMPTED_AT = "__vfFactCheckHandoffAttemptedAt";
  const w = window as unknown as Record<string, unknown>;
  // Idempotent only for the same payload; a different text must not look "sent".
  if (w[DONE] === text) return { ok: true, reason: "already-done" };
  if (w[DONE]) return { ok: false, reason: "already-done-other" };
  // Soft lock while fill/send runs — cleared on failure so SW retries can proceed.
  // "in-flight" blocks only parallel injects; stale locks (killed frame) expire.
  // Must exceed composer wait (~36s for GPT/Claude/Copilot) plus fill/send.
  if (w[ATTEMPTED] === "in-flight") {
    const started = w[ATTEMPTED_AT];
    if (typeof started === "number" && Date.now() - started < 45_000) {
      return { ok: false, reason: "already-attempted" };
    }
  }

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const host = location.hostname.toLowerCase();
  const isGpt =
    host === "chatgpt.com" || host.endsWith(".chatgpt.com");
  const isGemini =
    host === "gemini.google.com" || host.endsWith(".gemini.google.com");
  const isClaude = host === "claude.ai" || host.endsWith(".claude.ai");
  const isCopilot =
    host === "copilot.microsoft.com" ||
    host.endsWith(".copilot.microsoft.com");
  if (!isGpt && !isGemini && !isClaude && !isCopilot) {
    return { ok: false, reason: "wrong-host" };
  }

  function isUsableEditor(el: HTMLElement): boolean {
    if (el.getAttribute("aria-hidden") === "true") return false;
    if (el.tabIndex < 0 && el.getAttribute("aria-hidden") === "true") return false;
    try {
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none") return false;
      if (cs.opacity === "0") return false;
    } catch {
      /* ignore */
    }
    const r = el.getBoundingClientRect();
    const h = Math.max(r.height, el.clientHeight, el.scrollHeight);
    return r.width > 40 && h > 16;
  }

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
    } else if (isClaude) {
      pushAll(
        document.querySelectorAll('[data-testid="chat-input"]'),
      );
      pushAll(
        document.querySelectorAll('div[contenteditable="true"][role="textbox"]'),
      );
      pushAll(
        document.querySelectorAll("div.ProseMirror[contenteditable='true']"),
      );
      pushAll(
        document.querySelectorAll('fieldset div[contenteditable="true"]'),
      );
      pushAll(
        document.querySelectorAll('div[contenteditable="true"].ProseMirror'),
      );
      pushAll(
        document.querySelectorAll('main div[contenteditable="true"]'),
      );
      // Do not fall back to every textarea — search/login fields match first.
    } else if (isCopilot) {
      pushAll(document.querySelectorAll("textarea#userInput"));
      pushAll(document.querySelectorAll("#userInput"));
      pushAll(
        document.querySelectorAll('textarea[data-testid="composer-input"]'),
      );
      pushAll(
        document.querySelectorAll('[data-testid="composer-input"]'),
      );
      pushAll(
        document.querySelectorAll('textarea[placeholder*="Message Copilot"]'),
      );
      pushAll(
        document.querySelectorAll('textarea[placeholder*="Message"]'),
      );
      pushAll(
        document.querySelectorAll('textarea[placeholder*="Nachricht"]'),
      );
      pushAll(
        document.querySelectorAll('[aria-label*="Message Copilot"]'),
      );
      pushAll(
        document.querySelectorAll('textarea[aria-label*="Message"]'),
      );
      pushAll(
        document.querySelectorAll('textarea[aria-label*="Nachricht"]'),
      );
      pushAll(
        document.querySelectorAll('div[contenteditable="true"][role="textbox"]'),
      );
      pushAll(
        document.querySelectorAll('[role="textbox"][contenteditable="true"]'),
      );
      // Last resort: visible textareas that are not measurement dummies.
      pushAll(document.querySelectorAll("textarea:not([aria-hidden='true'])"));
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
      if (isUsableEditor(el)) return el;
    }
    return null;
  }

  function hasText(el: HTMLElement): boolean {
    const raw =
      el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement
        ? el.value
        : el.innerText || el.textContent || "";
    return raw.replace(/\u200B/g, "").trim().length > 5;
  }

  function fillEditor(el: HTMLElement, value: string): boolean {
    el.focus();
    try {
      el.click();
    } catch {
      /* ignore */
    }
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
      // React/controlled inputs ignore plain `.value =` — use the native setter.
      try {
        const proto =
          el instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype;
        const desc = Object.getOwnPropertyDescriptor(proto, "value");
        desc?.set?.call(el, value);
      } catch {
        el.value = value;
      }
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      try {
        el.dispatchEvent(
          new InputEvent("input", {
            bubbles: true,
            inputType: "insertText",
            data: value,
          }),
        );
      } catch {
        /* ignore */
      }
      return hasText(el);
    }

    try {
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(el);
      sel?.removeAllRanges();
      sel?.addRange(range);
    } catch {
      document.execCommand("selectAll", false);
    }

    let ok = false;
    try {
      ok = document.execCommand("insertText", false, value);
    } catch {
      ok = false;
    }

    if (!ok || !hasText(el)) {
      try {
        const dt = new DataTransfer();
        dt.setData("text/plain", value);
        el.dispatchEvent(
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

    if (!hasText(el)) {
      el.textContent = value;
      el.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          inputType: "insertText",
          data: value,
        }),
      );
    }
    return hasText(el);
  }

  function findSend(editor: HTMLElement): HTMLButtonElement | null {
    // Prefer buttons near the composer — never scan the whole document for
    // broad "Send"/"Submit" matches (wrong first hit on the page).
    const form = editor.closest("form");
    const section =
      editor.closest("[class*='composer' i]") ||
      editor.closest("[class*='Composer']") ||
      editor.closest("[data-testid*='composer']");
    const roots: ParentNode[] = [];
    if (form) roots.push(form);
    if (section && section !== form) roots.push(section);
    let climb: HTMLElement | null = editor.parentElement;
    for (let i = 0; i < 6 && climb; i++) {
      if (!roots.includes(climb)) roots.push(climb);
      climb = climb.parentElement;
    }
    if (roots.length === 0) roots.push(editor);

    const exact = [
      'button[data-testid="send-button"]',
      'button[aria-label="Send prompt"]',
      'button[aria-label="Prompt senden"]',
      'button[aria-label="Send message"]',
      'button[aria-label="Send Message"]',
      'button[aria-label="Nachricht senden"]',
      'button[aria-label="Submit"]',
      'button[aria-label*="Submit"]',
      'button[aria-label="Send"]',
      'button[aria-label="Senden"]',
      'button[aria-label*="Send prompt"]',
      'button[aria-label*="Prompt senden"]',
      'button[aria-label*="Send message"]',
      'button[aria-label*="Send"]',
      'button[aria-label*="Senden"]',
    ];

    for (const root of roots) {
      for (const sel of exact) {
        const b = root.querySelector<HTMLButtonElement>(sel);
        if (b && isClickableSend(b)) return b;
      }
      const buttons = [...root.querySelectorAll<HTMLButtonElement>("button")];
      for (const b of buttons) {
        const label = (b.getAttribute("aria-label") || "").toLowerCase();
        const testId = (b.getAttribute("data-testid") || "").toLowerCase();
        if (
          isClickableSend(b) &&
          (testId === "send-button" ||
            testId.includes("send") ||
            label === "send prompt" ||
            label === "prompt senden" ||
            label.startsWith("send") ||
            label.includes("senden") ||
            label.includes("submit"))
        ) {
          if (
            label.includes("attach") ||
            label.includes("voice") ||
            label.includes("dictat") ||
            label.includes("mikrofon") ||
            label.includes("microphone") ||
            label.includes("sign in")
          ) {
            continue;
          }
          return b;
        }
      }
      if (form && root === form) {
        for (let i = buttons.length - 1; i >= 0; i--) {
          const b = buttons[i]!;
          if (!isClickableSend(b)) continue;
          const label = (b.getAttribute("aria-label") || "").toLowerCase();
          if (
            label.includes("attach") ||
            label.includes("voice") ||
            label.includes("mikrofon") ||
            label.includes("microphone") ||
            label.includes("sign in")
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

  /** One activation only — double click/events caused duplicate ChatGPT submits. */
  function clickSendButton(btn: HTMLButtonElement): void {
    btn.focus();
    try {
      btn.click();
    } catch {
      const opts = { bubbles: true, cancelable: true, view: window };
      btn.dispatchEvent(new MouseEvent("click", opts));
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
  // GPT/Claude/Copilot SPAs often report complete before the composer is interactive.
  const waitRounds = isGpt || isClaude || isCopilot ? 120 : 80;
  const waitStep = isGpt || isClaude || isCopilot ? 300 : 250;
  for (let i = 0; i < waitRounds; i++) {
    editor = findEditor();
    if (editor) break;
    await sleep(waitStep);
  }
  if (!editor) {
    // Prefer visible login CTAs over loose body-text (avoids "blog in" false positives).
    // Do NOT treat accounts.google.com links alone as logged-out — Gemini shows those
    // for signed-in account/profile menus too.
    const login = (() => {
      const hrefHints = [
        'a[href*="/auth/login"]',
        'a[href*="/log-in"]',
        'button[data-testid*="login"]',
        'a[data-testid*="login"]',
      ];
      for (const sel of hrefHints) {
        for (const el of document.querySelectorAll<HTMLElement>(sel)) {
          const r = el.getBoundingClientRect();
          if (r.width > 20 && r.height > 10) return true;
        }
      }
      for (const el of document.querySelectorAll<HTMLElement>("a, button, h1, h2")) {
        const r = el.getBoundingClientRect();
        if (r.width < 20 || r.height < 10) continue;
        const label = `${el.getAttribute("aria-label") || ""} ${el.textContent || ""}`
          .replace(/\s+/g, " ")
          .trim();
        if (label.length === 0 || label.length > 64) continue;
        if (
          /^(log\s*in|sign\s*in|anmelden|einloggen)\b/i.test(label) ||
          /^sign in with (microsoft|apple|google)\b/i.test(label) ||
          /^sign in to copilot\b/i.test(label) ||
          /^(create (an )?account|konto erstellen)\b/i.test(label)
        ) {
          return true;
        }
      }
      return false;
    })();
    return { ok: false, reason: login ? "login-required" : "no-editor" };
  }

  // Claim before fill — parallel MAIN-world injects must not both send.
  w[ATTEMPTED] = "in-flight";
  w[ATTEMPTED_AT] = Date.now();

  if (!fillEditor(editor, text)) {
    w[ATTEMPTED] = "failed";
    return { ok: false, reason: "fill-failed" };
  }

  function composerLooksSent(el: HTMLElement): boolean {
    // Only trust empty composer or an explicit stop/generating control —
    // do not treat /c/ or /chat/ path alone as success while text remains.
    if (!hasText(el)) return true;
    if (document.querySelector('button[data-testid="stop-button"]')) return true;
    if (document.querySelector('button[aria-label*="Stop"]')) return true;
    if (document.querySelector('button[aria-label*="Stoppen"]')) return true;
    if (document.querySelector('button[aria-label*="Stop generating"]')) {
      return true;
    }
    return false;
  }

  // Wait for Send to enable (React), then send exactly once — never click+Enter.
  await sleep(isGpt || isClaude || isCopilot ? 900 : 400);
  let sentViaClick = false;

  // Copilot: Enter is the reliable submit; fall back to a nearby send button.
  if (isCopilot) {
    pressEnterToSend(editor);
    await sleep(500);
    if (composerLooksSent(editor)) {
      w[DONE] = text;
      w[ATTEMPTED] = "done";
      return { ok: true, reason: "sent" };
    }
  }

  for (let i = 0; i < 50; i++) {
    const btn = findSend(editor);
    if (btn) {
      clickSendButton(btn);
      sentViaClick = true;
      break;
    }
    await sleep(160);
  }

  if (!sentViaClick && !isCopilot) {
    pressEnterToSend(editor);
  } else if (!sentViaClick && isCopilot) {
    // Second Enter attempt after the composer hydrated.
    pressEnterToSend(editor);
  }

  // Poll longer — ChatGPT/Gemini often clear the composer slowly.
  for (let i = 0; i < 30; i++) {
    if (composerLooksSent(editor)) {
      w[DONE] = text;
      w[ATTEMPTED] = "done";
      return { ok: true, reason: "sent" };
    }
    await sleep(200);
  }

  // Send was clicked: treat as success and lock DONE so a later kick cannot
  // double-submit. ChatGPT sometimes keeps the composer text briefly.
  if (sentViaClick) {
    w[DONE] = text;
    w[ATTEMPTED] = "done";
    return { ok: true, reason: "send-clicked" };
  }

  w[ATTEMPTED] = "failed";
  return { ok: false, reason: "send-unconfirmed" };
}
