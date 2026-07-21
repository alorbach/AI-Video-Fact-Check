/**
 * Pure HTML/metadata helpers for social adapters (no DOM APIs).
 */

/** Collapse whitespace and trim. */
export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** Prefer the longest non-empty candidate (post captions tend to be longest). */
export function pickLongestText(
  ...candidates: Array<string | undefined | null>
): string {
  let best = "";
  for (const raw of candidates) {
    if (!raw) continue;
    const text = normalizeWhitespace(raw);
    if (text.length > best.length) best = text;
  }
  return best;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) =>
      String.fromCodePoint(Number.parseInt(n, 10)),
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) =>
      String.fromCodePoint(Number.parseInt(h, 16)),
    );
}

/** Read <meta property="…"> or <meta name="…"> content from HTML. */
export function metaContent(
  html: string,
  attr: "property" | "name",
  key: string,
): string {
  const re = new RegExp(
    `<meta[^>]+${attr}=["']${escapeRegExp(key)}["'][^>]*>`,
    "i",
  );
  const tag = html.match(re)?.[0];
  if (!tag) {
    // content may appear before property/name
    const re2 = new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]*${attr}=["']${escapeRegExp(key)}["'][^>]*>`,
      "i",
    );
    const m2 = html.match(re2);
    return m2?.[1] ? decodeHtmlEntities(m2[1]) : "";
  }
  const content = tag.match(/content=["']([^"']*)["']/i);
  return content?.[1] ? decodeHtmlEntities(content[1]) : "";
}

export function ogDescription(html: string): string {
  return metaContent(html, "property", "og:description");
}

export function ogTitle(html: string): string {
  return metaContent(html, "property", "og:title");
}

export function metaDescription(html: string): string {
  return metaContent(html, "name", "description");
}

export function twitterDescription(html: string): string {
  return (
    metaContent(html, "name", "twitter:description") ||
    metaContent(html, "property", "twitter:description")
  );
}

/** Extract balanced `{…}` starting at `start` (must point at `{`). */
export function extractBalancedJson(
  source: string,
  start: number,
): string | null {
  if (source[start] !== "{") return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < source.length; i++) {
    const ch = source[i]!;
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Find `marker = {…}` or `marker={…}` in HTML/script text and parse JSON.
 */
export function parseJsonAssignment(
  source: string,
  marker: string,
): unknown | null {
  const idx = source.indexOf(marker);
  if (idx === -1) return null;
  const eq = source.indexOf("=", idx + marker.length);
  if (eq === -1) return null;
  const start = source.indexOf("{", eq);
  if (start === -1) return null;
  const json = extractBalancedJson(source, start);
  if (!json) return null;
  try {
    return JSON.parse(json) as unknown;
  } catch {
    return null;
  }
}

/** Collect string values for known description-like keys in JSON-LD blocks. */
export function jsonLdTexts(html: string): string[] {
  const out: string[] = [];
  const re =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    try {
      collectDescriptionStrings(JSON.parse(raw), out);
    } catch {
      /* ignore bad JSON-LD */
    }
  }
  return out;
}

function collectDescriptionStrings(node: unknown, out: string[]): void {
  if (!node) return;
  if (typeof node === "string") return;
  if (Array.isArray(node)) {
    for (const item of node) collectDescriptionStrings(item, out);
    return;
  }
  if (typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  // Prefer caption-like fields; omit `name` (usually a title, not post text).
  for (const key of ["description", "articleBody", "caption", "text"]) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) {
      out.push(normalizeWhitespace(value));
    }
  }
  for (const value of Object.values(obj)) {
    if (value && typeof value === "object") {
      collectDescriptionStrings(value, out);
    }
  }
}

/**
 * Walk a JSON tree and return the first string for the given keys.
 * Keys are tried in order across the whole tree (DFS per key), so a nested
 * `desc`/`caption` wins over a shallow `title` when listed first.
 */
export function findStringByKeys(
  node: unknown,
  keys: string[],
  depth = 0,
): string {
  if (!node || depth > 12) return "";
  for (const key of keys) {
    const found = findStringForKey(node, key, depth);
    if (found) return found;
  }
  return "";
}

function findStringForKey(
  node: unknown,
  key: string,
  depth: number,
): string {
  if (!node || depth > 12) return "";
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findStringForKey(item, key, depth + 1);
      if (found) return found;
    }
    return "";
  }
  if (typeof node !== "object") return "";
  const obj = node as Record<string, unknown>;
  const value = obj[key];
  if (typeof value === "string" && value.trim()) {
    return normalizeWhitespace(value);
  }
  for (const child of Object.values(obj)) {
    if (child && typeof child === "object") {
      const found = findStringForKey(child, key, depth + 1);
      if (found) return found;
    }
  }
  return "";
}

/**
 * Deepest object subtree that mentions `id` (stringified). Used to avoid
 * picking another video’s caption from multi-item SPA payloads.
 */
export function findSubtreeMentioningId(
  node: unknown,
  id: string,
  depth = 0,
): unknown | null {
  if (!node || !id || depth > 18) return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findSubtreeMentioningId(item, id, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof node !== "object") return null;
  const obj = node as Record<string, unknown>;
  for (const child of Object.values(obj)) {
    if (child && typeof child === "object") {
      const found = findSubtreeMentioningId(child, id, depth + 1);
      if (found) return found;
    }
  }
  try {
    if (textMentionsExactId(JSON.stringify(obj), id)) return obj;
  } catch {
    /* ignore */
  }
  return null;
}

/** Like findStringByKeys, but only inside the deepest subtree that mentions id. */
export function findStringByKeysNearId(
  node: unknown,
  keys: string[],
  id: string,
): string {
  if (!id) return "";
  const sub = findSubtreeMentioningId(node, id);
  if (!sub) return "";
  return findStringByKeys(sub, keys);
}

/** Best-effort page text from open-graph / meta / JSON-LD. */
export function pageMetaPostText(html: string): string {
  return pickLongestText(
    ogDescription(html),
    twitterDescription(html),
    metaDescription(html),
    ...jsonLdTexts(html),
  );
}

/**
 * Instagram og:title often looks like:
 * `user on Instagram: "caption here"`
 */
export function unwrapInstagramOgCaption(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const m = trimmed.match(/:\s*[“"]([\s\S]*?)[”"]\s*$/);
  if (m?.[1]) return normalizeWhitespace(m[1]);
  const m2 = trimmed.match(/Instagram:\s*"([\s\S]*?)"\s*$/i);
  if (m2?.[1]) return normalizeWhitespace(m2[1]);
  return trimmed;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * True when `id` appears as a whole token in text/JSON — not as a substring of a
 * longer id (e.g. "111" must not match inside "111222").
 */
export function textMentionsExactId(haystack: string, id: string): boolean {
  if (!id || !haystack) return false;
  // Exact JSON string value
  if (haystack.includes(`"${id}"`)) return true;
  const escaped = escapeRegExp(id);
  // Path segment: /id/ /id" /id? /id& /id#
  if (new RegExp(`/${escaped}(?=[/"?&#]|$)`).test(haystack)) return true;
  // Query value: v=id or similar
  if (new RegExp(`[=]${escaped}(?=["&#]|$)`).test(haystack)) return true;
  // Generic token boundary (covers bare JSON numbers and opaque ids in blobs)
  return new RegExp(`(?<![0-9A-Za-z_-])${escaped}(?![0-9A-Za-z_-])`).test(
    haystack,
  );
}
