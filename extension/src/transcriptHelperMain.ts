/**
 * Runs in the helper-page MAIN world via chrome.scripting.executeScript.
 * Must stay free of imports/closures — Chrome serializes these functions.
 * Nested locals are fine; module-level helpers are NOT (they do not serialize).
 * Never scrapes AI chat answers — only free transcript helper sites.
 */

export type SocialHelperSiteId = "tiktoktranscript" | "facebooktotranscript";

export type SocialHelperPollResult =
  | { status: "pending" }
  | { status: "ok"; text: string }
  | { status: "error"; error: string }
  | { status: "idle" };

/**
 * Fill URL, configure options, submit. Returns false if form not ready.
 * All helpers are nested so executeScript can serialize this function.
 */
export async function submitSocialTranscriptHelper(
  videoUrl: string,
  siteId: SocialHelperSiteId,
  langLabel: string,
  /** Facebook: Auto first; pass "whisper" to force AI after a junk Extract result. */
  method: "auto" | "whisper" = "auto",
): Promise<{ ok: boolean; reason?: string }> {
  // Literal inside the function — module consts are not serialized by executeScript.
  const submittedKey = "__vfSocialTranscriptSubmittedAt";
  const lastProcessingKey = "__vfSocialTranscriptLastProcessingAt";
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  const w = window as unknown as Record<string, unknown>;

  const setReactInputValue = (input: HTMLInputElement, value: string) => {
    const proto = window.HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    desc?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  };

  /** Prefer the transcript URL form — never the contact / newsletter form. */
  const findTranscriptForm = (): HTMLFormElement | null => {
    const forms = [...document.querySelectorAll("form")];
    for (const form of forms) {
      if (
        form.querySelector(
          'input[type="email"], textarea[placeholder*="help" i], textarea[placeholder*="Message" i], input[placeholder*="John" i]',
        )
      ) {
        continue;
      }
      const input = form.querySelector<HTMLInputElement>(
        'input[type="text"], input:not([type])',
      );
      const submit = form.querySelector<HTMLButtonElement>(
        'button[type="submit"]',
      );
      if (!input || !submit) continue;
      const ph = (input.placeholder || "").toLowerCase();
      const submitText = (submit.textContent || "").trim();
      const looksLikeUrl =
        /tiktok|facebook|http|video|url|paste/i.test(ph) ||
        /tiktok\.com|facebook\.com/i.test(ph);
      const looksLikeExtract = /^(Extract|Get Transcript)$/i.test(submitText);
      if (looksLikeUrl || looksLikeExtract) return form;
    }
    // Fallback: first form that is not a contact form and has text + submit.
    for (const form of forms) {
      if (
        form.querySelector(
          'input[type="email"], textarea[placeholder*="help" i]',
        )
      ) {
        continue;
      }
      if (
        form.querySelector('input[type="text"], input:not([type])') &&
        form.querySelector('button[type="submit"]')
      ) {
        return form;
      }
    }
    return null;
  };

  const clearPreviousResults = async (): Promise<void> => {
    const clearBtn = [...document.querySelectorAll("button")].find((b) =>
      /^Clear Results$/i.test((b.textContent || "").replace(/\s+/g, " ").trim()),
    );
    if (clearBtn) {
      clearBtn.click();
      await sleep(250);
    }
  };

  const configureFacebookOptions = async (
    label: string,
    prefer: "auto" | "whisper",
  ): Promise<void> => {
    const methodValue = prefer === "whisper" ? "whisper" : "auto";
    const methodRadio = document.querySelector<HTMLInputElement>(
      `input[type="radio"][name="method"][value="${methodValue}"]`,
    );
    if (methodRadio && !methodRadio.checked) {
      methodRadio.click();
      await sleep(80);
    }

    const langLabelEl = [...document.querySelectorAll("label")].find((l) =>
      /language/i.test(l.textContent || ""),
    );
    const langBtn =
      (langLabelEl?.parentElement?.querySelector(
        "button",
      ) as HTMLButtonElement | null) ||
      ([...document.querySelectorAll("button")].find((b) =>
        /auto-detect|english|german|deutsch/i.test(b.textContent || ""),
      ) as HTMLButtonElement | undefined) ||
      null;
    if (!langBtn) return;

    const aliases = /german|deutsch|^de$/i.test(label)
      ? ["German", "Deutsch", "de"]
      : ["English", "en", "English (US)", "English (UK)"];

    const current = (langBtn.textContent || "").trim();
    if (aliases.some((a) => new RegExp(a, "i").test(current))) return;

    langBtn.click();
    await sleep(200);

    const option = [
      ...document.querySelectorAll("button, [role='option'], li, div"),
    ].find((el) => {
      const t = (el.textContent || "").trim();
      if (!t || t.length > 48) return false;
      return aliases.some(
        (a) =>
          new RegExp(`^${a}$`, "i").test(t) ||
          t.toLowerCase() === a.toLowerCase(),
      );
    }) as HTMLElement | undefined;

    if (option) {
      option.click();
      await sleep(120);
    } else {
      langBtn.click();
    }
  };

  const host = location.hostname.toLowerCase();
  const okHost =
    siteId === "tiktoktranscript"
      ? host.includes("tiktoktranscript.io")
      : host.includes("facebooktotranscript.com");
  if (!okHost) return { ok: false, reason: "wrong-host" };

  let form: HTMLFormElement | null = null;
  for (let i = 0; i < 30; i++) {
    form = findTranscriptForm();
    if (form) break;
    await sleep(200);
  }
  if (!form) return { ok: false, reason: "no-input" };

  const input = form.querySelector<HTMLInputElement>(
    'input[type="text"], input:not([type])',
  );
  const btn = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (!input) return { ok: false, reason: "no-input" };
  if (!btn) return { ok: false, reason: "no-submit" };

  if (siteId === "facebooktotranscript") {
    await clearPreviousResults();
    await configureFacebookOptions(langLabel, method);
  }

  setReactInputValue(input, videoUrl);
  await sleep(100);

  if (btn.disabled) {
    setReactInputValue(input, videoUrl);
    await sleep(150);
  }
  if (btn.disabled) return { ok: false, reason: "submit-disabled" };

  w[submittedKey] = Date.now();
  delete w[lastProcessingKey];
  btn.click();
  return { ok: true };
}

/**
 * One poll tick after submit. Call repeatedly from the service worker.
 * All helpers are nested so executeScript can serialize this function.
 */
export function pollSocialTranscriptHelper(): SocialHelperPollResult {
  // Literals inside the function — module consts are not serialized by executeScript.
  const submittedKey = "__vfSocialTranscriptSubmittedAt";
  const lastProcessingKey = "__vfSocialTranscriptLastProcessingAt";
  const w = window as unknown as Record<string, unknown>;
  const submittedAt = w[submittedKey];
  if (typeof submittedAt !== "number") {
    return { status: "idle" };
  }

  const findTranscriptForm = (): HTMLFormElement | null => {
    const forms = [...document.querySelectorAll("form")];
    for (const form of forms) {
      if (
        form.querySelector(
          'input[type="email"], textarea[placeholder*="help" i], textarea[placeholder*="Message" i]',
        )
      ) {
        continue;
      }
      const submit = form.querySelector<HTMLButtonElement>(
        'button[type="submit"]',
      );
      const submitText = (submit?.textContent || "").trim();
      if (/Extract|Get Transcript|Processing/i.test(submitText)) return form;
    }
    return null;
  };

  const formSubmitButton = (): HTMLButtonElement | null => {
    const form = findTranscriptForm();
    return (
      form?.querySelector<HTMLButtonElement>('button[type="submit"]') ?? null
    );
  };

  const isContactFormTextarea = (el: Element): boolean => {
    const form = el.closest("form");
    if (!form) return false;
    return Boolean(
      form.querySelector(
        'input[type="email"], textarea[placeholder*="help" i], textarea[placeholder*="Name" i], textarea[placeholder*="Message" i]',
      ),
    );
  };

  const looksLikeMarketing = (t: string): boolean => {
    if (
      /Transform Facebook|Extract captions and subtitles|No signup required|Frequently Asked Questions|How to Get a|100% Free|Paste your URL|Don't want to wait|Longer videos take more time/i.test(
        t,
      )
    ) {
      return true;
    }
    if (t.length > 800 && (t.match(/\?/g) || []).length >= 4) return true;
    return false;
  };

  const isSuccessActionLabel = (label: string): boolean =>
    /^(copy|download|clear results)$/i.test(label) ||
    /copy transcript|download (txt|srt|vtt)|\.txt|\.srt|\.vtt|\btxt\b|\bsrt\b|\bvtt\b/i.test(
      label,
    );

  /** Success actions may be "Copy Transcript", "Download TXT", etc. — not only exact labels. */
  const pageHasSuccessChrome = (): boolean =>
    [...document.querySelectorAll("button, a")].some((b) =>
      isSuccessActionLabel((b.textContent || "").replace(/\s+/g, " ").trim()),
    );

  /** facebooktotranscript / tiktoktranscript finished-UI markers. */
  const isCompleteUi = (): boolean => {
    const hero = document.body.innerText.slice(0, 6000);
    return (
      /Transcription Complete|Video captions extracted successfully|Clear Results/i.test(
        hero,
      ) && pageHasSuccessChrome()
    );
  };

  const hasSuccessChromeNear = (el: Element): boolean => {
    let node: Element | null = el;
    for (let i = 0; i < 8 && node; i++) {
      if (
        [...node.querySelectorAll("button, a")].some((b) =>
          isSuccessActionLabel(
            (b.textContent || "").replace(/\s+/g, " ").trim(),
          ),
        )
      ) {
        return true;
      }
      node = node.parentElement;
    }
    return pageHasSuccessChrome();
  };

  /**
   * facebooktotranscript puts Plain Text in a mono textarea (often very short —
   * e.g. one-line captions like "you"). Require length ≥40 only before success UI.
   */
  const readTranscriptCandidate = (): string => {
    const complete = isCompleteUi() || pageHasSuccessChrome();
    const minLen = complete ? 1 : 40;
    const blocks: Array<{ text: string; el: Element }> = [];

    for (const el of document.querySelectorAll(
      'pre, textarea, [class*="whitespace-pre"], [class*="font-mono"], [class*="transcript"], [class*="subtitle"]',
    )) {
      if (isContactFormTextarea(el)) continue;
      const t = (
        el instanceof HTMLTextAreaElement ? el.value : el.textContent || ""
      ).trim();
      if (t.length >= minLen && t.length < 200_000) blocks.push({ text: t, el });
    }

    blocks.sort((a, b) => b.text.length - a.text.length);
    for (const b of blocks) {
      if (looksLikeMarketing(b.text)) continue;
      if (/^Error\b/i.test(b.text) && b.text.length < 400) continue;
      // UI chrome labels accidentally scraped as text
      if (
        /^(Plain Text|SRT|VTT|Copy|Download|Clear Results|Transcription Complete!?)$/i.test(
          b.text,
        )
      ) {
        continue;
      }
      if (!hasSuccessChromeNear(b.el)) continue;
      return b.text;
    }
    return "";
  };

  const readErrorMessage = (): string => {
    const boxes = document.querySelectorAll(
      '.bg-red-50, .bg-red-100, [role="alert"], .border-red-200',
    );
    for (const box of boxes) {
      const t = (box.textContent || "").replace(/\s+/g, " ").trim();
      if (!t) continue;
      if (
        /error|failed|not configured|unable|unexpected|no caption|no lambda/i.test(
          t,
        )
      ) {
        return t.slice(0, 400);
      }
    }
    return "";
  };

  const isProcessing = (): boolean => {
    // Finished UI wins — progress copy can linger in hidden nodes.
    if (isCompleteUi()) return false;

    const btn = formSubmitButton();
    const btnText = (btn?.textContent || "").trim();
    if (/processing|extracting/i.test(btnText)) return true;
    if (btn?.disabled && /Extract|Get Transcript/i.test(btnText)) return true;

    // Live progress copy from facebooktotranscript / tiktoktranscript — not static FAQ.
    const hero = document.body.innerText.slice(0, 5000);
    return /Extracting Captions|Checking for native captions|Fetching video|Retrieving video|Transcribing\.\.\.|AI is |We're still working|Longer videos take more time|Don't want to wait/i.test(
      hero,
    );
  };

  if (isProcessing()) {
    w[lastProcessingKey] = Date.now();
    return { status: "pending" };
  }

  // Prefer errors / transcripts before declaring idle.
  const err = readErrorMessage();
  if (err) return { status: "error", error: err };

  const text = readTranscriptCandidate();
  if (text) return { status: "ok", text };

  // Success chrome with empty/unreadable body → stop waiting (URL-only fallback).
  if (isCompleteUi()) {
    return { status: "idle" };
  }

  // Explicit empty result from facebooktotranscript (no Copy/Download).
  const hero = document.body.innerText.slice(0, 6000);
  if (
    /Transcription Complete/i.test(hero) &&
    /No content available for this format/i.test(hero)
  ) {
    return { status: "idle" };
  }

  const btn = formSubmitButton();
  const btnText = (btn?.textContent || "").trim();
  // Auto mode briefly returns to "Extract" between Extract→AI phases (AI can
  // take 30–120s). Do not idle during that gap; only give up after a long quiet
  // stretch once we have seen live processing — or sooner if submit never started.
  if (
    btn &&
    !btn.disabled &&
    /^(Extract|Get Transcript)$/i.test(btnText)
  ) {
    const lastProc = w[lastProcessingKey];
    const sawProcessing = typeof lastProc === "number";
    const quietFrom = sawProcessing
      ? (lastProc as number)
      : (submittedAt as number);
    const quietMs = sawProcessing ? 75_000 : 25_000;
    if (Date.now() - quietFrom > quietMs) {
      return { status: "idle" };
    }
  }

  return { status: "pending" };
}
