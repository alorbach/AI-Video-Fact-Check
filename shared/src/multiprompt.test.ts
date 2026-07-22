import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getMessageCharLimit,
  shrinkMessageCharLimit,
} from "./messageLimits.js";
import {
  chunkText,
  resplitAfterTooLong,
  splitIntoHandoffMessages,
} from "./multiprompt.js";
import { buildPastePackage } from "./pastePackage.js";

describe("messageLimits", () => {
  it("returns a positive budget per chat target", () => {
    assert.ok(getMessageCharLimit("chatgpt_video_faktencheck") > 1000);
    assert.ok(getMessageCharLimit("gemini_web") > 1000);
  });

  it("shrinks but stays above the floor", () => {
    const next = shrinkMessageCharLimit(14_000);
    assert.ok(next < 14_000);
    assert.ok(next >= 4_000);
    assert.equal(shrinkMessageCharLimit(3_000), 4_000);
  });
});

describe("multiprompt", () => {
  it("keeps a short package as a single message", () => {
    const pkg = buildPastePackage({
      videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      locale: "de",
      transcript: "Kurztext",
    });
    const messages = splitIntoHandoffMessages(
      pkg,
      "chatgpt_video_faktencheck",
    );
    assert.equal(messages.length, 1);
    assert.match(messages[0]!, /Kurztext/);
    assert.match(messages[0]!, /Faktencheck/);
  });

  it("splits a long transcript into multiple parts", () => {
    const long = "Absatz.\n".repeat(3_000);
    const pkg = buildPastePackage({
      videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      locale: "de",
      transcript: long,
    });
    const limit = getMessageCharLimit("chatgpt_video_faktencheck");
    const messages = splitIntoHandoffMessages(pkg, "chatgpt_video_faktencheck");
    assert.ok(messages.length > 1, `expected multiprompt, got ${messages.length}`);
    for (const m of messages) {
      assert.ok(m.length <= limit, `message length ${m.length} > ${limit}`);
    }
    assert.match(messages[0]!, /Teil 1 von/);
    assert.match(messages[messages.length - 1]!, /letzte Teil|Faktencheck/);
  });

  it("puts master prompt on the final Gemini part only when split", () => {
    const long = "x".repeat(40_000);
    const pkg = buildPastePackage({
      videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      locale: "de",
      transcript: long,
    });
    const messages = splitIntoHandoffMessages(pkg, "gemini_web");
    assert.ok(messages.length > 1);
    const masterHits = messages.filter((m) => m.includes("Sachliche Bewertung"));
    assert.equal(masterHits.length, 1);
    assert.ok(messages[messages.length - 1]!.includes("Sachliche Bewertung"));
    assert.match(messages[0]!, /bestätige kurz|Teil 1/);
  });

  it("keeps last transcript chunk when master+chunk exceeds the limit", () => {
    const long = `${"Absatz eins mit Inhalt.\n".repeat(2_500)}Schlusszeile.\n`;
    const pkg = buildPastePackage({
      videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      locale: "de",
      transcript: long,
    });
    // Force a tight budget so the final master+chunk path must clip, not drop.
    const messages = splitIntoHandoffMessages(pkg, "gemini_web", {
      charLimit: 8_000,
    });
    assert.ok(messages.length > 1);
    const last = messages[messages.length - 1]!;
    assert.ok(last.includes("Sachliche Bewertung"));
    // Must retain transcript body — not fall back to master+URL only.
    assert.match(last, /Absatz eins mit Inhalt|Schlusszeile/);
    const masterOnly =
      last.includes("Video-URL:") && !last.includes("Absatz eins");
    assert.equal(masterOnly, false);
  });

  it("re-splits after too-long with a smaller budget", () => {
    const long = "Wort ".repeat(8_000);
    const pkg = buildPastePackage({
      videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      locale: "en",
      transcript: long,
    });
    const first = splitIntoHandoffMessages(pkg, "chatgpt_video_faktencheck");
    const { messages, charLimit } = resplitAfterTooLong(
      pkg,
      "chatgpt_video_faktencheck",
      getMessageCharLimit("chatgpt_video_faktencheck"),
    );
    assert.ok(charLimit < getMessageCharLimit("chatgpt_video_faktencheck"));
    assert.ok(messages.length >= first.length);
    for (const m of messages) {
      assert.ok(m.length <= charLimit);
    }
  });

  it("chunkText respects limits and prefers newlines", () => {
    const text = "aaa\nbbb\nccc\n";
    const chunks = chunkText(text.repeat(20), 40);
    assert.ok(chunks.length > 1);
    for (const c of chunks) assert.ok(c.length <= 40);
  });
});
