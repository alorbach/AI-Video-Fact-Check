/**
 * TurboScribe Facebook backup helpers.
 * Run via chrome.scripting.executeScript.
 *
 * Downloader helpers: MAIN world (React form fill).
 * Transcribe submit: ISOLATED world (extension host fetch of fbcdn + File inject).
 * Transcribe poll: either world (DOM read).
 *
 * Must stay free of imports/closures — Chrome serializes these functions.
 */

export type TurboScribePollResult =
  | { status: "pending" }
  | { status: "ok"; text: string }
  | { status: "error"; error: string }
  | { status: "idle" };

export type TurboScribeResolvePollResult =
  | { status: "pending" }
  | { status: "ok"; mp4Url: string }
  | { status: "error"; error: string }
  | { status: "idle" };

/**
 * Fill Facebook URL on turboscribe.ai/downloader/facebook and click Download.
 */
export async function submitTurboScribeFacebookDownloader(
  videoUrl: string,
): Promise<{ ok: boolean; reason?: string }> {
  const submittedKey = "__vfTurboScribeDlSubmittedAt";
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  const w = window as unknown as Record<string, unknown>;

  const setReactInputValue = (input: HTMLInputElement, value: string) => {
    // Prefer insertText — TurboScribe briefly disables Download during React
    // validation; paste/insertText re-enables faster than a raw value setter.
    input.focus();
    input.select();
    const inserted = document.execCommand("insertText", false, value);
    if (!inserted || input.value !== value) {
      const proto = window.HTMLInputElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, "value");
      desc?.set?.call(input, value);
      input.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          inputType: "insertFromPaste",
          data: value,
        }),
      );
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
  };

  const host = location.hostname.toLowerCase();
  if (!host.includes("turboscribe.ai")) {
    return { ok: false, reason: "wrong-host" };
  }
  if (!/\/downloader\/facebook/i.test(location.pathname)) {
    return { ok: false, reason: "wrong-path" };
  }

  // TurboScribe i18n-redirects (e.g. /de/downloader/facebook) — button/links
  // use "Herunterladen", not "Download". Match both.
  const isDownloaderLabel = (raw: string): boolean =>
    /^(Download|Herunterladen)(\s+(SD|HD|MP4))?$/i.test(
      raw.replace(/\s+/g, " ").trim(),
    );

  let input: HTMLInputElement | null = null;
  let btn: HTMLButtonElement | null = null;
  for (let i = 0; i < 40; i++) {
    input =
      document.querySelector<HTMLInputElement>(
        'input[placeholder*="facebook.com" i], input[name="url"]',
      ) ||
      document.querySelector<HTMLInputElement>(
        'form input[type="text"], form input:not([type])',
      );
    btn =
      ([...document.querySelectorAll("button")].find((b) =>
        isDownloaderLabel(b.textContent || ""),
      ) as HTMLButtonElement | undefined) || null;
    if (input && btn) break;
    await sleep(200);
  }
  if (!input) return { ok: false, reason: "no-input" };
  if (!btn) return { ok: false, reason: "no-submit" };

  setReactInputValue(input, videoUrl);

  // Validation debounce: button often flips disabled→enabled over 1–3s.
  let ready = false;
  for (let i = 0; i < 25; i++) {
    if (
      input.value.trim() === videoUrl.trim() &&
      !btn.disabled &&
      !input.disabled
    ) {
      ready = true;
      break;
    }
    if (i === 8 || i === 16) {
      // Re-push value if React wiped or ignored the first fill.
      setReactInputValue(input, videoUrl);
    }
    await sleep(200);
  }
  if (!ready) return { ok: false, reason: "submit-disabled" };

  w[submittedKey] = Date.now();
  try {
    sessionStorage.setItem(submittedKey, String(w[submittedKey]));
  } catch {
    /* ignore */
  }
  btn.click();
  return { ok: true };
}

/**
 * Poll downloader page for a public fbcdn mp4 link (prefer SD).
 * @param resolveTimeoutMs must match TURBOSCRIBE_FACEBOOK.resolveTimeoutMs
 *   (SW deadline); do not idle earlier or slow Facebook resolves abort early.
 */
export function pollTurboScribeFacebookDownloader(
  resolveTimeoutMs = 150_000,
): TurboScribeResolvePollResult {
  const submittedKey = "__vfTurboScribeDlSubmittedAt";
  const w = window as unknown as Record<string, unknown>;
  if (typeof w[submittedKey] !== "number") {
    try {
      const raw = sessionStorage.getItem(submittedKey);
      if (raw) {
        const n = Number(raw);
        if (Number.isFinite(n)) w[submittedKey] = n;
      }
    } catch {
      /* ignore */
    }
  }
  if (typeof w[submittedKey] !== "number") {
    return { status: "idle" };
  }

  const body = (document.body?.innerText || "").slice(0, 8000);

  // Only trust short alert/error nodes — full-page marketing often contains
  // "private" / "not found" / "fehlgeschlagen" and would abort while resolving.
  const alertText = [
    ...document.querySelectorAll(
      '[role="alert"], [class*="error" i], [class*="Error"], [class*="toast" i]',
    ),
  ]
    .map((el) => (el.textContent || "").replace(/\s+/g, " ").trim())
    .filter((t) => t.length > 8 && t.length < 400)
    .join(" \n ");
  if (
    alertText &&
    /could not|unable to|not found|private|login required|something went wrong|fehlgeschlagen|nicht gefunden|schiefgelaufen/i.test(
      alertText,
    )
  ) {
    const m = alertText.match(
      /(?:could not|unable to|not found|private|login required|something went wrong|fehlgeschlagen|nicht gefunden|schiefgelaufen)[^.!\n]{0,120}/i,
    );
    if (m) return { status: "error", error: m[0].trim().slice(0, 400) };
  }

  const isDownloaderLabel = (raw: string): boolean =>
    /^(Download|Herunterladen)(\s+(SD|HD|MP4))?$/i.test(
      raw.replace(/\s+/g, " ").trim(),
    );

  const isMp4Href = (href: string): boolean => {
    try {
      const u = new URL(href, location.href);
      const host = u.hostname.toLowerCase();
      if (!host.endsWith(".fbcdn.net") && host !== "fbcdn.net") return false;
      return /\.mp4(?:\?|$)/i.test(`${u.pathname}${u.search}`);
    } catch {
      return false;
    }
  };

  // Prefer labeled Download/Herunterladen buttons, but also accept any fbcdn/mp4
  // anchor (title/thumbnail links, "Right Click Save As" UIs without labels).
  const labeled = [...document.querySelectorAll("a")].filter((a) => {
    if (!isDownloaderLabel(a.textContent || "")) return false;
    return isMp4Href(a.href || "");
  }) as HTMLAnchorElement[];

  const anyMp4 = [...document.querySelectorAll("a")].filter((a) =>
    isMp4Href(a.href || ""),
  ) as HTMLAnchorElement[];

  const videoSrcs = [...document.querySelectorAll("video")]
    .map((v) => v.currentSrc || v.src || "")
    .filter((src) => isMp4Href(src));

  const downloadLinks =
    labeled.length > 0
      ? labeled
      : anyMp4.length > 0
        ? anyMp4
        : (videoSrcs.map((src) => {
            const a = document.createElement("a");
            a.href = src;
            return a;
          }) as HTMLAnchorElement[]);

  if (downloadLinks.length === 0) {
    const input = document.querySelector<HTMLInputElement>(
      'input[name="url"], input[placeholder*="facebook.com" i]',
    );
    const btn = [...document.querySelectorAll("button")].find((b) =>
      isDownloaderLabel(b.textContent || ""),
    );
    // Results chrome without hrefs yet ("All Formats" / thumbnail) — keep waiting.
    const resultsChrome =
      /All Formats|Alle Formate|Right Click|Rechtsklick|Save As|\d+(\.\d+)?[KM]? views/i.test(
        body,
      );
    const busyUi =
      Boolean(document.querySelector('[aria-busy="true"]')) ||
      Boolean(input?.disabled || btn?.disabled) ||
      /please wait|bitte warten|wird geladen|wird heruntergeladen|resolving|fetching video/i.test(
        body.slice(0, 2500),
      );

    if (busyUi || resultsChrome) {
      return { status: "pending" };
    }
    const submittedAt = w[submittedKey] as number;
    const quietMs =
      typeof resolveTimeoutMs === "number" && resolveTimeoutMs > 0
        ? resolveTimeoutMs
        : 150_000;
    if (Date.now() - submittedAt > quietMs) {
      return { status: "idle" };
    }
    return { status: "pending" };
  }

  const score = (a: HTMLAnchorElement): number => {
    const href = a.href;
    let s = 0;
    const label = (a.textContent || "").replace(/\s+/g, " ").trim();
    if (isDownloaderLabel(label)) s += 80;
    if (/tag=sd/i.test(href)) s += 100;
    if (/tag=hd/i.test(href)) s -= 40;
    // Prefer smaller progressive/sd over huge HD when tags absent.
    if (/\/m366\//i.test(href)) s += 20;
    if (/\/m412\//i.test(href)) s += 10;
    const parentText = (a.closest("div,li,section,article")?.textContent || "")
      .replace(/\s+/g, " ")
      .slice(0, 200);
    if (/\bSD\b/i.test(parentText) && !/\bHD\b.*\bSD\b/i.test(parentText)) {
      s += 50;
    }
    if (/\bHD\b/i.test(parentText) && !/\bSD\b/i.test(parentText)) {
      s -= 20;
    }
    const br = href.match(/bitrate=(\d+)/i);
    if (br) s += Math.max(0, 40 - Math.floor(Number(br[1]) / 50_000));
    // Avoid picking the title/thumbnail link when a real Download exists — already
    // handled by preferring `labeled`; here demote very long labels.
    if (label.length > 40) s -= 30;
    return s;
  };

  downloadLinks.sort((a, b) => score(b) - score(a));
  const best = downloadLinks[0]!.href;
  if (!best) return { status: "pending" };
  return { status: "ok", mp4Url: best };
}

/**
 * Inject a pre-fetched mp4 (base64) into TurboScribe’s file input, set language,
 * click Transcribe.
 *
 * IMPORTANT: Do not fetch fbcdn from the page/isolated world — Facebook returns
 * 403 "Bad URL hash" under the turboscribe.ai origin. The service worker must
 * fetch with host_permissions and pass bytes here.
 */
export async function submitTurboScribeTranscribe(
  mp4Base64: string,
  langLabel: string,
  fileName: string,
): Promise<{ ok: boolean; reason?: string }> {
  const submittedKey = "__vfTurboScribeTxSubmittedAt";
  const uploadStemKey = "__vfTurboScribeUploadStem";
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  const w = window as unknown as Record<string, unknown>;

  const host = location.hostname.toLowerCase();
  if (!host.includes("turboscribe.ai")) {
    return { ok: false, reason: "wrong-host" };
  }

  // Login / signup wall before we start.
  if (/\/(login|signup|sign-up|register)\b/i.test(location.pathname)) {
    return { ok: false, reason: "login-required" };
  }
  const hero = (document.body?.innerText || "").slice(0, 2500);
  if (
    /sign in to continue|log in to continue|create a free account to|please (log|sign) in/i.test(
      hero,
    )
  ) {
    return { ok: false, reason: "login-required" };
  }

  let fileInput: HTMLInputElement | null = null;
  for (let i = 0; i < 40; i++) {
    fileInput = document.querySelector<HTMLInputElement>('input[type="file"]');
    if (fileInput) break;
    await sleep(200);
  }
  if (!fileInput) return { ok: false, reason: "no-file-input" };

  if (!mp4Base64 || typeof mp4Base64 !== "string") {
    return { ok: false, reason: "no-bytes" };
  }

  const safeName =
    typeof fileName === "string" &&
    /^[a-zA-Z0-9._-]{8,120}\.mp4$/i.test(fileName)
      ? fileName
      : `vf-fb-${Date.now().toString(36)}.mp4`;
  const stem = safeName.replace(/\.mp4$/i, "");

  let bytes: Uint8Array;
  try {
    const bin = atob(mp4Base64);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } catch {
    return { ok: false, reason: "bad-base64" };
  }
  if (bytes.byteLength < 1000) {
    return { ok: false, reason: "file-too-small" };
  }

  const file = new File([bytes], safeName, { type: "video/mp4" });
  const dt = new DataTransfer();
  dt.items.add(file);
  fileInput.files = dt.files;
  fileInput.dispatchEvent(new Event("input", { bubbles: true }));
  fileInput.dispatchEvent(new Event("change", { bubbles: true }));

  w[uploadStemKey] = stem;
  try {
    sessionStorage.setItem(uploadStemKey, stem);
  } catch {
    /* ignore */
  }

  // Prefer Dolphin (Balanced) — value "small". Whale is slower and can look "stuck".
  const selectWhisperModel = (want: RegExp, value: string): boolean => {
    const radio =
      document.querySelector<HTMLInputElement>(
        `input[type="radio"][name="whisper-model"][value="${value}"]`,
      ) ||
      [...document.querySelectorAll<HTMLInputElement>('input[type="radio"][name="whisper-model"]')].find(
        (r) => want.test((r.closest("label")?.textContent || r.parentElement?.textContent || "").replace(/\s+/g, " ")),
      );
    if (!radio) return false;
    radio.checked = true;
    radio.dispatchEvent(new Event("input", { bubbles: true }));
    radio.dispatchEvent(new Event("change", { bubbles: true }));
    const label = radio.labels?.[0] || document.querySelector(`label[for="${radio.id}"]`);
    label?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    return true;
  };
  selectWhisperModel(/dolphin|balanced/i, "small");

  // Language select (optional).
  const select = document.querySelector<HTMLSelectElement>("select[name='language'], select");
  if (select) {
    const wantDe = /german|deutsch/i.test(langLabel);
    const opt = [...select.options].find((o) => {
      const t = (o.textContent || "").trim();
      return wantDe
        ? /german|deutsch/i.test(t)
        : /^English\b/i.test(t) || /English \(US\)/i.test(t);
    });
    if (opt) {
      select.value = opt.value;
      select.dispatchEvent(new Event("input", { bubbles: true }));
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  // Wait until the UI acknowledges the file (checkmark / filename).
  for (let i = 0; i < 40; i++) {
    if (
      fileInput.files?.length &&
      (document.body?.innerText || "").includes(stem)
    ) {
      break;
    }
    await sleep(250);
  }

  const findTranscribeButton = (): HTMLButtonElement | null => {
    const ranked: { btn: HTMLButtonElement; score: number }[] = [];
    for (const el of document.querySelectorAll("button")) {
      const btn = el as HTMLButtonElement;
      const t = (btn.textContent || "").replace(/\s+/g, " ").trim();
      if (!t || t.length > 60) continue;
      // Exact primary CTA — avoid marketing "Start Transcribing for Free".
      let score = 0;
      if (
        /^(Uploading\.\.\.|Hochladen\.\.\.)?(Transcribe|Transkribieren)$/i.test(t)
      ) {
        score += 100;
      } else if (/^(Transcribe|Transkribieren)$/i.test(t)) {
        score += 90;
      } else {
        continue;
      }
      if (btn.type === "submit") score += 25;
      if (/btn-primary|dui3-btn-primary/i.test(String(btn.className))) {
        score += 30;
      }
      const r = btn.getBoundingClientRect();
      if (r.width >= 40 && r.height >= 20) score += 15;
      else score -= 40;
      if (btn.disabled) score -= 120;
      ranked.push({ btn, score });
    }
    ranked.sort((a, b) => b.score - a.score);
    return ranked[0]?.btn ?? null;
  };

  const forceActivate = (btn: HTMLButtonElement): void => {
    btn.scrollIntoView({ block: "center", inline: "nearest" });
    try {
      btn.focus({ preventScroll: true });
    } catch {
      btn.focus();
    }
    // One real click only — synthetic click + click() double-fires React.
    btn.click();
  };

  const transcriptionStarted = (): boolean => {
    const body = document.body?.innerText || "";
    if (
      /transcribing|processing|almost done|wird transkribiert|verarbeitung läuft/i.test(
        body.slice(0, 4000),
      )
    ) {
      return true;
    }
    const label = (findTranscribeButton()?.textContent || "")
      .replace(/\s+/g, " ")
      .trim();
    // Uploading…Transcribe means submit already accepted — do not re-click.
    if (/^(Uploading\.\.\.|Hochladen\.\.\.)/i.test(label)) {
      return true;
    }
    return !findTranscribeButton();
  };

  w[submittedKey] = Date.now();
  try {
    sessionStorage.setItem(submittedKey, String(w[submittedKey]));
  } catch {
    /* ignore */
  }

  let clicked = false;
  for (let attempt = 0; attempt < 4; attempt++) {
    const txBtn = findTranscribeButton();
    if (!txBtn) {
      await sleep(400);
      continue;
    }
    const label = (txBtn.textContent || "").replace(/\s+/g, " ").trim();
    if (/^(Uploading\.\.\.|Hochladen\.\.\.)/i.test(label)) {
      clicked = true;
      break;
    }
    if (txBtn.disabled) {
      await sleep(400);
      continue;
    }
    forceActivate(txBtn);
    clicked = true;
    await sleep(900);
    if (transcriptionStarted()) break;
  }
  if (!clicked) return { ok: false, reason: "no-transcribe" };

  // Immediate soft errors (EN + DE).
  const after = (document.body?.innerText || "").slice(0, 4000);
  if (
    /Something went wrong|Etwas ist schiefgelaufen|etwas ist schief gegangen/i.test(
      after,
    )
  ) {
    return { ok: false, reason: "something-went-wrong" };
  }
  if (
    /sign in to continue|log in to continue|create a free account|bitte (an)?melden|melden sie sich an/i.test(
      after,
    )
  ) {
    return { ok: false, reason: "login-required" };
  }

  return { ok: true };
}

/** Retry Transcribe click if the form is still idle after submit. */
export function clickTurboScribeTranscribeButton(): {
  ok: boolean;
  started: boolean;
} {
  const findIdleTranscribeButton = (): HTMLButtonElement | null => {
    for (const el of document.querySelectorAll("button")) {
      const btn = el as HTMLButtonElement;
      const t = (btn.textContent || "").replace(/\s+/g, " ").trim();
      // Never re-click while Uploading… — that already submitted.
      if (/^(Uploading\.\.\.|Hochladen\.\.\.)/i.test(t)) {
        return null;
      }
      if (/^(Transcribe|Transkribieren)$/i.test(t) && !btn.disabled) {
        return btn;
      }
    }
    return null;
  };
  const btn = findIdleTranscribeButton();
  if (!btn) {
    const body = (document.body?.innerText || "").slice(0, 4000);
    const started =
      /transcribing|processing|wird transkribiert|Uploading\.\.\.|Hochladen\.\.\./i.test(
        body,
      );
    return { ok: false, started };
  }
  btn.scrollIntoView({ block: "center" });
  // Single activation — do not also requestSubmit (double-fires React).
  btn.click();
  const body = (document.body?.innerText || "").slice(0, 4000);
  const started =
    /transcribing|processing|wird transkribiert|Uploading\.\.\.|Hochladen\.\.\./i.test(
      body,
    ) || !btn.isConnected;
  return { ok: true, started };
}

/**
 * Poll TurboScribe transcribe UI / dashboard / transcript page for text.
 * After Transcribe, TurboScribe navigates to /dashboard (often with a signup
 * modal). We must dismiss the modal, open the completed file, then scrape
 * /transcript/{id}.
 */
export function pollTurboScribeTranscribe(): TurboScribePollResult {
  const submittedKey = "__vfTurboScribeTxSubmittedAt";
  const openedKey = "__vfTurboScribeOpenedFileAt";
  const uploadStemKey = "__vfTurboScribeUploadStem";
  const expectOpenKey = "__vfTurboScribeExpectOpenTranscript";
  const w = window as unknown as Record<string, unknown>;
  if (typeof w[submittedKey] !== "number") {
    try {
      const raw = sessionStorage.getItem(submittedKey);
      if (raw) {
        const n = Number(raw);
        if (Number.isFinite(n)) w[submittedKey] = n;
      }
    } catch {
      /* ignore */
    }
  }
  if (typeof w[submittedKey] !== "number") {
    return { status: "idle" };
  }

  const ourStem = (): string | null => {
    if (typeof w[uploadStemKey] === "string" && w[uploadStemKey]) {
      return w[uploadStemKey] as string;
    }
    try {
      const raw = sessionStorage.getItem(uploadStemKey);
      if (raw) {
        w[uploadStemKey] = raw;
        return raw;
      }
    } catch {
      /* ignore */
    }
    return null;
  };

  const matchesOurUpload = (haystack: string): boolean => {
    const stem = ourStem();
    if (!stem) return false;
    return haystack.includes(stem);
  };

  const path = location.pathname.toLowerCase();
  if (/\/(login|signup|sign-up|register)\b/i.test(path)) {
    return { status: "error", error: "login-required" };
  }

  const text = document.body?.innerText || "";
  const head = text.slice(0, 8000);

  if (/Something went wrong|Etwas ist schiefgelaufen|etwas ist schief gegangen/i.test(head)) {
    return { status: "error", error: "Something went wrong." };
  }
  if (
    /(?:you(?:'|’)(?:ve|re)|you have|your account)\s+(?:reached|hit|exceeded)/i.test(
      head,
    ) ||
    /(?:daily|free)\s+(?:limit|quota)\s+(?:reached|exceeded|hit)/i.test(head) ||
    /no (?:more )?free transcripts?\s+(?:left|remaining)/i.test(head) ||
    /(?:used|exhausted)\s+(?:all\s+)?(?:your\s+)?(?:3|three)\s+free transcripts?/i.test(
      head,
    )
  ) {
    return { status: "error", error: "daily-limit" };
  }

  const onDashboard = /\/dashboard/i.test(path);
  const onTranscript = /\/transcript\//i.test(path);
  const hasOurFile = matchesOurUpload(text);
  const signupModal =
    /Don't Lose Your Transcripts|Finish signing up|FINISH SIGNING UP/i.test(
      head,
    );

  // Signup nag after a successful free transcript — not a hard login wall.
  if (
    !onDashboard &&
    !onTranscript &&
    !hasOurFile &&
    /sign in to continue|log in to continue|create a free account to|please (log|sign) in to/i.test(
      head,
    )
  ) {
    return { status: "error", error: "login-required" };
  }

  const dismissSignupModal = (): void => {
    if (!signupModal) return;
    for (const el of document.querySelectorAll(
      'button, [role="button"], [aria-label]',
    )) {
      const label = (
        el.getAttribute("aria-label") ||
        el.textContent ||
        ""
      )
        .replace(/\s+/g, " ")
        .trim();
      if (/^(close|dismiss|×|✕|x)$/i.test(label)) {
        (el as HTMLElement).click();
      }
    }
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    for (const el of document.querySelectorAll(
      '[role="dialog"], [class*="modal" i], [class*="Modal"]',
    )) {
      if (
        /Don't Lose Your Transcripts|Finish signing up|FINISH SIGNING UP/i.test(
          el.textContent || "",
        )
      ) {
        (el as HTMLElement).style.setProperty("display", "none", "important");
        (el as HTMLElement).style.setProperty("pointer-events", "none", "important");
      }
    }
    for (const el of document.querySelectorAll(
      '[class*="overlay" i], [class*="backdrop" i], [class*="Backdrop"]',
    )) {
      (el as HTMLElement).style.setProperty("pointer-events", "none", "important");
      (el as HTMLElement).style.setProperty("opacity", "0", "important");
    }
  };

  const tryOpenCompletedFile = (): boolean => {
    dismissSignupModal();
    const stem = ourStem();
    if (!stem) return false;

    // 1) Direct transcript links for THIS upload only.
    const transcriptLinks = [
      ...document.querySelectorAll<HTMLAnchorElement>('a[href*="/transcript/"]'),
    ];
    const byHref = transcriptLinks.find((a) =>
      matchesOurUpload(`${a.textContent || ""} ${a.href}`),
    );
    if (byHref) {
      byHref.click();
      return true;
    }

    // 2) Menu already open after we opened OUR row's kebab → Open Transcript.
    const expectOpen =
      w[expectOpenKey] === true ||
      sessionStorage.getItem(expectOpenKey) === "1";
    if (expectOpen) {
      const openItem = [
        ...document.querySelectorAll("a, button, [role='menuitem'], li"),
      ].find((el) => {
        const t = (el.textContent || "").replace(/\s+/g, " ").trim();
        return (
          /^(Open Transcript|Transkript öffnen|Open)$/i.test(t) ||
          (/open transcript|transkript öffnen/i.test(t) && t.length < 40)
        );
      });
      if (openItem) {
        (openItem as HTMLElement).click();
        w[expectOpenKey] = false;
        try {
          sessionStorage.removeItem(expectOpenKey);
        } catch {
          /* ignore */
        }
        return true;
      }
    }

    // 3) Find OUR file row only, open ⋮ menu, then Open Transcript.
    const rowCandidates = [
      ...document.querySelectorAll("tr, [role='row']"),
    ].filter((el) => {
      const t = (el.textContent || "").replace(/\s+/g, " ").trim();
      return matchesOurUpload(t) && t.length < 500;
    });
    const row =
      rowCandidates.find((el) => el.querySelector("button")) ||
      [...document.querySelectorAll("div, li")].find((el) => {
        const t = (el.textContent || "").replace(/\s+/g, " ").trim();
        return (
          matchesOurUpload(t) &&
          t.length < 280 &&
          Boolean(el.querySelector("button"))
        );
      }) ||
      null;

    if (row) {
      const nameLink =
        [...row.querySelectorAll("a")].find((a) =>
          matchesOurUpload(a.textContent || ""),
        ) || null;
      if (nameLink && /\/transcript\//i.test(nameLink.href)) {
        nameLink.click();
        return true;
      }
      if (nameLink) {
        nameLink.click();
        return true;
      }

      const menuBtn =
        [...row.querySelectorAll("button")].find((b) => {
          const label = (
            b.getAttribute("aria-label") ||
            b.getAttribute("title") ||
            b.textContent ||
            ""
          )
            .replace(/\s+/g, " ")
            .trim();
          return (
            /more|menu|options|aktionen|mehr/i.test(label) ||
            label === "⋯" ||
            label === "…" ||
            label === "⋮" ||
            /^[⋅·.•⋯…]{1,3}$/.test(label) ||
            (b.querySelector("svg") && label.length < 3)
          );
        }) ||
        ([...row.querySelectorAll("button")].at(-1) as
          | HTMLButtonElement
          | undefined) ||
        null;

      if (menuBtn) {
        menuBtn.click();
        w[expectOpenKey] = true;
        try {
          sessionStorage.setItem(expectOpenKey, "1");
        } catch {
          /* ignore */
        }
        const item = [
          ...document.querySelectorAll("a, button, [role='menuitem']"),
        ].find((el) =>
          /open transcript|transkript öffnen/i.test(
            (el.textContent || "").replace(/\s+/g, " ").trim(),
          ),
        );
        if (item) {
          (item as HTMLElement).click();
          w[expectOpenKey] = false;
          try {
            sessionStorage.removeItem(expectOpenKey);
          } catch {
            /* ignore */
          }
          return true;
        }
        return true;
      }

      (row as HTMLElement).click();
      return true;
    }

    return false;
  };

  // Dashboard: wait for completion, then open the file.
  if (onDashboard) {
    dismissSignupModal();
    if (
      hasOurFile &&
      /transcribing|processing|in progress|wird transkribiert/i.test(head)
    ) {
      return { status: "pending" };
    }
    let lastOpen = w[openedKey] as number | undefined;
    if (typeof lastOpen !== "number") {
      try {
        const raw = sessionStorage.getItem(openedKey);
        if (raw) lastOpen = Number(raw);
      } catch {
        /* ignore */
      }
    }
    const recentlyOpened =
      typeof lastOpen === "number" && Date.now() - lastOpen < 3_500;
    if (hasOurFile && !recentlyOpened) {
      if (tryOpenCompletedFile()) {
        w[openedKey] = Date.now();
        try {
          sessionStorage.setItem(openedKey, String(w[openedKey]));
        } catch {
          /* ignore */
        }
      }
    }
    // Only click Open Transcript if we opened OUR row's menu.
    if (
      w[expectOpenKey] === true ||
      sessionStorage.getItem(expectOpenKey) === "1"
    ) {
      const openItem = [
        ...document.querySelectorAll("a, button, [role='menuitem']"),
      ].find((el) =>
        /open transcript|transkript öffnen/i.test(
          (el.textContent || "").replace(/\s+/g, " ").trim(),
        ),
      );
      if (openItem) {
        (openItem as HTMLElement).click();
        w[expectOpenKey] = false;
        try {
          sessionStorage.removeItem(expectOpenKey);
        } catch {
          /* ignore */
        }
      }
    }
    return { status: "pending" };
  }

  // Still on upload form / processing.
  if (
    /transcribing|processing|uploading|almost done|please wait|wird transkribiert|verarbeitung|hochladen|bitte warten/i.test(
      head,
    )
  ) {
    return { status: "pending" };
  }

  const isSuccessActionLabel = (label: string): boolean => {
    const t = label.replace(/\s+/g, " ").trim();
    if (!t || t.length > 40) return false;
    return (
      /^(copy|download|kopieren|herunterladen)$/i.test(t) ||
      /^copy transcript$/i.test(t) ||
      /^(download|herunterladen) (txt|docx|srt|pdf|vtt)$/i.test(t) ||
      /^export (transcript|txt|docx|srt|pdf)$/i.test(t) ||
      /^transkript kopieren$/i.test(t)
    );
  };

  const pageHasSuccessChrome = (): boolean =>
    onTranscript ||
    [...document.querySelectorAll("button, a")].some((b) =>
      isSuccessActionLabel((b.textContent || "").replace(/\s+/g, " ").trim()),
    );

  const looksLikeMarketing = (t: string): boolean => {
    if (
      /Transcribe YouTube Videos to Text|3 free transcripts daily|Start Transcribing for Free|Powered by Whisper|#1 in Speech|Sign up with email|TurboScribe Unlimited|Welcome to Unlimited|How TurboScribe|Frequently Asked|What is TurboScribe|Generate a transcript from any YouTube|Don't Lose Your Transcripts|Finish signing up/i.test(
        t,
      )
    ) {
      return true;
    }
    if (t.length > 800 && (t.match(/\?/g) || []).length >= 4) return true;
    return false;
  };

  if (onTranscript) {
    dismissSignupModal();
  }

  const candidates: string[] = [];
  const minLen = onTranscript ? 20 : 40;
  for (const el of document.querySelectorAll(
    'pre, textarea, article, main, [class*="transcript"], [class*="Transcript"], [data-testid*="transcript"], [class*="prose"], [class*="document"]',
  )) {
    const t = (
      el instanceof HTMLTextAreaElement ? el.value : el.textContent || ""
    )
      .replace(/\s+/g, " ")
      .trim();
    if (t.length < minLen || t.length > 200_000) continue;
    if (looksLikeMarketing(t)) continue;
    if (/Recent Files|GO UNLIMITED|daily transcriptions used/i.test(t) && t.length < 500) {
      continue;
    }
    candidates.push(t);
  }

  if (candidates.length === 0 && pageHasSuccessChrome()) {
    for (const el of document.querySelectorAll("p, div")) {
      const t = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (t.length < (onTranscript ? 20 : 80) || t.length > 50_000) continue;
      if (looksLikeMarketing(t)) continue;
      if (/PRICING|FAQS|BLOG|Sign Up|LOG IN|Recent Files/i.test(t) && t.length < 200) {
        continue;
      }
      const words = t.split(" ").filter(Boolean);
      if (words.length < (onTranscript ? 3 : 12)) continue;
      candidates.push(t);
    }
  }

  candidates.sort((a, b) => b.length - a.length);
  if (candidates[0] && (pageHasSuccessChrome() || onTranscript)) {
    return { status: "ok", text: candidates[0] };
  }

  if (pageHasSuccessChrome() || onTranscript) {
    return { status: "pending" };
  }

  // Stay pending until the SW hits transcribeTimeoutMs — do not idle early
  // while the upload form is still visible.
  return { status: "pending" };
}
