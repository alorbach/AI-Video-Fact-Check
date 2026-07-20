import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canonicalizeYouTubeUrl,
  extractYouTubeVideoId,
  parseTimedTextJson3,
  parseTimedTextXml,
  pickCaptionTrack,
} from "./youtube.js";

describe("YouTube helpers", () => {
  it("extracts and canonicalizes video ids", () => {
    assert.equal(
      extractYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10"),
      "dQw4w9WgXcQ",
    );
    assert.equal(
      extractYouTubeVideoId("https://youtu.be/dQw4w9WgXcQ"),
      "dQw4w9WgXcQ",
    );
    assert.equal(
      extractYouTubeVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ"),
      "dQw4w9WgXcQ",
    );
    assert.equal(
      canonicalizeYouTubeUrl("https://youtu.be/dQw4w9WgXcQ?t=5"),
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    );
  });

  it("picks preferred caption track", () => {
    const tracks = [
      { baseUrl: "a", languageCode: "en", kind: "asr" },
      { baseUrl: "b", languageCode: "de" },
      { baseUrl: "c", languageCode: "fr" },
    ];
    assert.equal(pickCaptionTrack(tracks, "de")?.baseUrl, "b");
    assert.equal(pickCaptionTrack(tracks, "en")?.baseUrl, "a");
    assert.equal(pickCaptionTrack([], "de"), null);
  });

  it("parses timedtext XML and json3", () => {
    const xml = `<transcript><text start="0">Hello &amp; hi</text><text>World</text></transcript>`;
    assert.equal(parseTimedTextXml(xml), "Hello & hi\nWorld");

    const json3 = JSON.stringify({
      events: [
        { segs: [{ utf8: "Line " }, { utf8: "one" }] },
        { segs: [{ utf8: "Line two" }] },
      ],
    });
    assert.equal(parseTimedTextJson3(json3), "Line one\nLine two");
  });
});
