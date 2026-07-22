/**
 * Anonymous Playwright probe: facebooktotranscript.com + sample reel.
 * Simulates extension submit/poll heuristics (no Chrome extension loaded).
 */
import { chromium } from "playwright";

const VIDEO_URL = "https://www.facebook.com/reel/1718498742665625";
const HELPER = "https://facebooktotranscript.com/";

function isUsable(text) {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length < 40) return false;
  const words = t.split(" ").filter(Boolean);
  return words.length >= 6;
}

async function setReactInput(page, selector, value) {
  await page.locator(selector).first().evaluate((el, v) => {
    const proto = window.HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    desc?.set?.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

async function readResultTextarea(page) {
  return page.evaluate(() => {
    const ta = [...document.querySelectorAll("textarea")].find(
      (el) => !el.closest("form")?.querySelector('input[type="email"]'),
    );
    return (ta?.value || "").trim();
  });
}

async function pageState(page) {
  return page.evaluate(() => {
    const t = document.body.innerText.slice(0, 6000);
    const ta = [...document.querySelectorAll("textarea")].find(
      (el) => !el.closest("form")?.querySelector('input[type="email"]'),
    );
    return {
      complete: /Transcription Complete/i.test(t),
      processing:
        /Extracting Captions|Processing\.\.\.|Don't want to wait|Retrieving video|Transcribing/i.test(
          t.slice(0, 6000),
        ),
      method: document.querySelector(
        'input[type="radio"][name="method"]:checked',
      )?.value,
      btn: document
        .querySelector('button[type="submit"]')
        ?.textContent?.trim(),
      transcript: (ta?.value || "").trim(),
      len: (ta?.value || "").trim().length,
    };
  });
}

async function submit(page, method) {
  const clear = page.getByRole("button", { name: /^Clear Results$/i });
  if (await clear.count()) {
    await clear.click().catch(() => {});
    await page.waitForTimeout(300);
  }

  const radio = page.locator(
    `input[type="radio"][name="method"][value="${method}"]`,
  );
  if (await radio.count()) {
    await radio.click({ force: true });
    await page.waitForTimeout(100);
  }

  // Prefer German for this reel's on-screen text.
  const langBtn = page
    .locator("button")
    .filter({ hasText: /Auto-detect|English|German|Deutsch/i })
    .first();
  if (await langBtn.count()) {
    const cur = (await langBtn.textContent()) || "";
    if (!/german|deutsch/i.test(cur)) {
      await langBtn.click();
      await page.waitForTimeout(250);
      const opt = page
        .locator("button, [role='option'], li, div")
        .filter({ hasText: /^(German|Deutsch|de)$/i })
        .first();
      if (await opt.count()) await opt.click().catch(() => {});
      await page.waitForTimeout(150);
    }
  }

  const urlInput = page.getByPlaceholder(/Paste your Facebook video URL/i);
  await urlInput.waitFor({ state: "visible", timeout: 30000 });
  await setReactInput(
    page,
    'input[placeholder*="Facebook video URL" i]',
    VIDEO_URL,
  );
  await page.waitForTimeout(200);

  const extract = page.getByRole("button", { name: /^Extract$/i });
  await extract.click();
  await page.waitForTimeout(500);
}

async function waitForComplete(page, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const s = await pageState(page);
    if (s.complete && !s.processing) return s;
    if (/error|failed|unable/i.test(s.btn || "") && !s.processing) return s;
    await page.waitForTimeout(2000);
  }
  return pageState(page);
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-blink-features=AutomationControlled"],
  });
  // Anonymous: fresh context, no cookies / storage / login.
  const context = await browser.newContext({
    locale: "de-DE",
    viewport: { width: 1280, height: 900 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();

  const report = {
    videoUrl: VIDEO_URL,
    helper: HELPER,
    anonymous: true,
    steps: [],
  };

  try {
    await page.goto(HELPER, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1200);
    report.steps.push({ step: "loaded", title: await page.title() });

    await submit(page, "auto");
    report.steps.push({ step: "submitted-auto" });

    let state = await waitForComplete(page, 90_000);
    let text = state.transcript || (await readResultTextarea(page));
    report.steps.push({
      step: "auto-result",
      usable: isUsable(text),
      len: text.length,
      preview: text.slice(0, 240),
      method: state.method,
      complete: state.complete,
    });

    if (!isUsable(text)) {
      await submit(page, "whisper");
      report.steps.push({ step: "submitted-whisper-retry" });
      state = await waitForComplete(page, 150_000);
      text = state.transcript || (await readResultTextarea(page));
      report.steps.push({
        step: "whisper-result",
        usable: isUsable(text),
        len: text.length,
        preview: text.slice(0, 500),
        method: state.method,
        complete: state.complete,
        processing: state.processing,
      });
    }

    report.ok = isUsable(text);
    report.finalTranscript = text;
    report.finalLen = text.length;
  } catch (err) {
    report.ok = false;
    report.error = err instanceof Error ? err.message : String(err);
  } finally {
    await context.close();
    await browser.close();
  }

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 2);
}

main();
