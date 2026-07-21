import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildPastePackage,
  formatPastePackageText,
  withManualTranscript,
} from "./pastePackage.js";

describe("PastePackage", () => {
  it("builds YouTube package with captions", () => {
    const pkg = buildPastePackage({
      videoUrl: "https://youtu.be/dQw4w9WgXcQ",
      locale: "de",
      transcript: "Hallo Welt",
      transcriptSource: "captions",
    });
    assert.equal(pkg.platform, "youtube");
    assert.equal(pkg.videoUrl, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    assert.equal(pkg.transcript, "Hallo Welt");
    assert.equal(pkg.transcriptSource, "captions");
    assert.match(formatPastePackageText(pkg), /Hallo Welt/);
    assert.match(formatPastePackageText(pkg), /Faktencheck/);
  });

  it("notes missing transcript and supports manual override", () => {
    const base = buildPastePackage({
      videoUrl: "https://www.tiktok.com/@u/video/1",
      locale: "en",
      platform: "tiktok",
    });
    assert.equal(base.transcriptSource, "none");
    assert.match(formatPastePackageText(base), /not available/);

    const manual = withManualTranscript(base, "  user text  ");
    assert.equal(manual.transcriptSource, "manual");
    assert.equal(manual.transcript, "user text");
    assert.match(formatPastePackageText(manual), /user text/);
  });

  it("keeps post text source for social captions", () => {
    const pkg = buildPastePackage({
      videoUrl: "https://www.instagram.com/reel/AbCdEfGhIjK/?utm_source=ig",
      locale: "de",
      platform: "instagram",
      transcript: "Beitragstext hier",
      transcriptSource: "post",
    });
    assert.equal(pkg.transcriptSource, "post");
    assert.equal(pkg.videoUrl, "https://www.instagram.com/reel/AbCdEfGhIjK/");
    assert.match(formatPastePackageText(pkg), /Beitragstext hier/);
  });
});
