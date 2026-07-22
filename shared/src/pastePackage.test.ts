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

  it("keeps short ask for Custom GPT (no master prompt)", () => {
    const pkg = buildPastePackage({
      videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      locale: "de",
      transcript: "Kurztext",
    });
    const text = formatPastePackageText(pkg, "chatgpt_video_faktencheck");
    assert.match(text, /verständlichen Faktencheck/);
    assert.doesNotMatch(text, /Sachliche Bewertung/);
    assert.doesNotMatch(text, /facebooktotranscript\.com/);
  });

  it("embeds German master prompt for Gemini", () => {
    const pkg = buildPastePackage({
      videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      locale: "de",
      transcript: "Kurztext",
    });
    const text = formatPastePackageText(pkg, "gemini_web");
    assert.match(text, /Sachliche Bewertung/);
    assert.match(text, /Visuelle Aufbereitung ist Pflicht/);
    assert.match(text, /facebooktotranscript\.com/);
    assert.match(text, /Kurztext/);
    assert.match(text, /Video-URL:/);
    assert.doesNotMatch(text, /verständlichen Faktencheck/);
  });

  it("embeds English master prompt for Gemini", () => {
    const pkg = buildPastePackage({
      videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      locale: "en",
      transcript: "Hello world",
    });
    const text = formatPastePackageText(pkg, "gemini_web");
    assert.match(text, /Factual score/);
    assert.match(text, /Visual formatting is required/);
    assert.match(text, /facebooktotranscript\.com/);
    assert.match(text, /Hello world/);
    assert.match(text, /Video URL:/);
    assert.doesNotMatch(text, /Sachliche Bewertung/);
    assert.doesNotMatch(text, /Please run a clear fact-check/);
  });

  it("embeds German master prompt for Claude, Copilot, and DeepSeek", () => {
    const pkg = buildPastePackage({
      videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      locale: "de",
      transcript: "Kurztext",
    });
    for (const target of ["claude_web", "copilot_web", "deepseek_web"] as const) {
      const text = formatPastePackageText(pkg, target);
      assert.match(text, /Sachliche Bewertung/);
      assert.match(text, /Kurztext/);
      assert.doesNotMatch(text, /verständlichen Faktencheck/);
    }
  });

  it("keeps external source and helper label in paste text", () => {
    const pkg = buildPastePackage({
      videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      locale: "en",
      transcript: "Helper captions",
      transcriptSource: "external",
    });
    assert.equal(pkg.transcriptSource, "external");
    assert.match(formatPastePackageText(pkg), /helper service/);
    assert.match(formatPastePackageText(pkg), /Helper captions/);

    const de = buildPastePackage({
      videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      locale: "de",
      transcript: "Hilfstext",
      transcriptSource: "external",
    });
    assert.match(formatPastePackageText(de), /Hilfsdienst/);
  });
});
