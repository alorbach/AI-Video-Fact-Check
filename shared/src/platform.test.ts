import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canonicalizeVideoUrl,
  detectPlatform,
  sameVideoUrl,
} from "./platform.js";

describe("detectPlatform", () => {
  it("detects YouTube watch, shorts, and youtu.be", () => {
    assert.equal(
      detectPlatform("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
      "youtube",
    );
    assert.equal(
      detectPlatform("https://www.youtube.com/shorts/dQw4w9WgXcQ"),
      "youtube",
    );
    assert.equal(detectPlatform("https://youtu.be/dQw4w9WgXcQ"), "youtube");
    assert.equal(
      detectPlatform("https://m.youtube.com/watch?v=dQw4w9WgXcQ"),
      "youtube",
    );
  });

  it("detects TikTok, X, Facebook, Instagram", () => {
    assert.equal(
      detectPlatform("https://www.tiktok.com/@user/video/123"),
      "tiktok",
    );
    assert.equal(detectPlatform("https://x.com/user/status/123"), "x");
    assert.equal(
      detectPlatform("https://twitter.com/user/status/123"),
      "x",
    );
    assert.equal(
      detectPlatform("https://www.facebook.com/watch/?v=123"),
      "facebook",
    );
    assert.equal(detectPlatform("https://fb.watch/abc/"), "facebook");
    assert.equal(
      detectPlatform("https://www.instagram.com/reel/ABC/"),
      "instagram",
    );
  });

  it("returns unknown for unsupported hosts", () => {
    assert.equal(detectPlatform("https://example.com/video"), "unknown");
    assert.equal(detectPlatform("not-a-url"), "unknown");
  });
});

describe("sameVideoUrl", () => {
  it("matches YouTube watch, youtu.be, and list query variants", () => {
    const watch = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
    const withList =
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLxxxx&index=1";
    const short = "https://youtu.be/dQw4w9WgXcQ?si=abc";
    assert.equal(sameVideoUrl(watch, withList), true);
    assert.equal(sameVideoUrl(watch, short), true);
    assert.equal(
      sameVideoUrl(watch, "https://www.youtube.com/watch?v=AAAAAAAAAAA"),
      false,
    );
  });

  it("canonicalizes YouTube to watch?v=", () => {
    assert.equal(
      canonicalizeVideoUrl("https://youtu.be/dQw4w9WgXcQ"),
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    );
  });
});
