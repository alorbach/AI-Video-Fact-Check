/**
 * X (Twitter): post text when visible; fall back to og/meta on status pages.
 */

import {
  canonicalizeXUrl,
  ogTitle,
  pageMetaPostText,
} from "@ai-video-fact-check/shared";
import { emptyExtras, type PlatformCaptureExtras } from "./types.js";

function statusIdFromUrl(pageUrl: string): string | null {
  try {
    const parts = new URL(pageUrl).pathname.split("/").filter(Boolean);
    const statusIdx = parts.indexOf("status");
    if (statusIdx >= 0 && parts[statusIdx + 1] && /^\d+$/.test(parts[statusIdx + 1]!)) {
      return parts[statusIdx + 1]!;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function articleMatchesStatus(article: Element, statusId: string): boolean {
  const link = article.querySelector(
    `a[href*="/status/${statusId}"]`,
  ) as HTMLAnchorElement | null;
  if (link) return true;
  // Time permalink often carries the status path.
  const timeParent = article.querySelector("time")?.closest("a");
  const href = timeParent?.getAttribute("href") ?? "";
  return href.includes(`/status/${statusId}`);
}

/** Tweet body only for the status id in the URL — never a random visible tweet. */
function tweetTextFromDom(pageUrl: string): string {
  const statusId = statusIdFromUrl(pageUrl);
  if (!statusId) return "";

  const articles = Array.from(
    document.querySelectorAll('article[data-testid="tweet"]'),
  );

  for (const article of articles) {
    if (!articleMatchesStatus(article, statusId)) continue;
    const text = article
      .querySelector('[data-testid="tweetText"]')
      ?.textContent?.trim();
    if (text) return text;
  }

  return "";
}

function titleFromDom(pageUrl: string): string {
  const statusId = statusIdFromUrl(pageUrl);
  if (!statusId) {
    return ogTitle(document.documentElement.innerHTML) || document.title || "";
  }

  const articles = Array.from(
    document.querySelectorAll('article[data-testid="tweet"]'),
  );
  const article = articles.find((a) => articleMatchesStatus(a, statusId));

  const user =
    article
      ?.querySelector('[data-testid="User-Name"]')
      ?.textContent?.trim() || "";
  const tweet = tweetTextFromDom(pageUrl);
  if (user && tweet) return `${user.split("\n")[0]}: ${tweet.slice(0, 80)}`;
  return ogTitle(document.documentElement.innerHTML) || document.title || "";
}

export function captureXExtras(pageUrl: string): PlatformCaptureExtras {
  const statusId = statusIdFromUrl(pageUrl);
  const html = document.documentElement.innerHTML;
  const fromDom = tweetTextFromDom(pageUrl);
  // Meta fallback only on real status URLs — avoid home/timeline site chrome.
  const transcript =
    fromDom || (statusId ? pageMetaPostText(html) : "");
  const title = titleFromDom(pageUrl) || undefined;
  const videoUrl = canonicalizeXUrl(pageUrl);

  if (!transcript) {
    return { ...emptyExtras(), title, videoUrl };
  }

  return {
    title,
    videoUrl,
    transcript,
    transcriptSource: "post",
  };
}
