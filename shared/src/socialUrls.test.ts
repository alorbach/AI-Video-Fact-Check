import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canonicalizeFacebookUrl,
  canonicalizeInstagramUrl,
  canonicalizeTikTokUrl,
  canonicalizeXUrl,
} from "./socialUrls.js";
import { canonicalizeVideoUrl, sameVideoUrl } from "./platform.js";

describe("social URL canonicalization", () => {
  it("canonicalizes TikTok video paths and strips tracking", () => {
    assert.equal(
      canonicalizeTikTokUrl(
        "https://www.tiktok.com/@nasa/video/7234567890123456789?is_from_webapp=1&utm_source=copy",
      ),
      "https://www.tiktok.com/@nasa/video/7234567890123456789",
    );
  });

  it("canonicalizes X status URLs from twitter.com", () => {
    assert.equal(
      canonicalizeXUrl(
        "https://twitter.com/NASA/status/1234567890123456789?ref_src=twsrc",
      ),
      "https://x.com/NASA/status/1234567890123456789",
    );
  });

  it("canonicalizes Facebook reel and watch URLs", () => {
    assert.equal(
      canonicalizeFacebookUrl("https://www.facebook.com/reel/9876543210?fbclid=abc"),
      "https://www.facebook.com/reel/9876543210",
    );
    assert.equal(
      canonicalizeFacebookUrl("https://www.facebook.com/watch/?v=111&fbclid=x"),
      "https://www.facebook.com/watch/?v=111",
    );
  });

  it("canonicalizes Instagram reel / post paths", () => {
    assert.equal(
      canonicalizeInstagramUrl("https://www.instagram.com/reel/AbCdEfGhIjK/?utm_source=ig"),
      "https://www.instagram.com/reel/AbCdEfGhIjK/",
    );
    assert.equal(
      canonicalizeInstagramUrl("https://www.instagram.com/p/AbCdEfGhIjK/"),
      "https://www.instagram.com/p/AbCdEfGhIjK/",
    );
  });

  it("sameVideoUrl matches social ids across tracking variants", () => {
    assert.equal(
      sameVideoUrl(
        "https://www.tiktok.com/@a/video/111",
        "https://www.tiktok.com/@a/video/111?utm_source=x",
      ),
      true,
    );
    assert.equal(
      sameVideoUrl(
        "https://x.com/a/status/222",
        "https://twitter.com/a/status/222?s=20",
      ),
      true,
    );
    assert.equal(
      sameVideoUrl(
        "https://www.instagram.com/reel/CODE/",
        "https://www.instagram.com/reel/CODE/?igsh=1",
      ),
      true,
    );
    assert.equal(
      sameVideoUrl(
        "https://www.facebook.com/watch/?v=111",
        "https://www.facebook.com/someone/videos/111",
      ),
      true,
    );
    assert.equal(
      canonicalizeVideoUrl("https://youtu.be/dQw4w9WgXcQ"),
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    );
  });
});
