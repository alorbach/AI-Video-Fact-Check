import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  facebookHelperLanguageLabel,
  helperForPlatform,
  isSocialTranscriptHelperUrl,
  isUsableSocialHelperTranscript,
  SOCIAL_TRANSCRIPT_HELPERS,
  socialHelperPlatform,
} from "./socialTranscriptHelpers.js";

describe("social transcript helpers", () => {
  it("maps platforms to helpers", () => {
    assert.equal(socialHelperPlatform("tiktok"), "tiktok");
    assert.equal(socialHelperPlatform("facebook"), "facebook");
    assert.equal(socialHelperPlatform("youtube"), null);
    assert.equal(socialHelperPlatform("instagram"), null);

    assert.equal(
      helperForPlatform("tiktok")?.id,
      "tiktoktranscript",
    );
    assert.equal(
      helperForPlatform("facebook")?.id,
      "facebooktotranscript",
    );
    assert.equal(helperForPlatform("x"), null);
  });

  it("exposes open URLs and hosts", () => {
    assert.equal(
      SOCIAL_TRANSCRIPT_HELPERS.tiktoktranscript.openUrl,
      "https://tiktoktranscript.io/",
    );
    assert.equal(
      SOCIAL_TRANSCRIPT_HELPERS.facebooktotranscript.openUrl,
      "https://facebooktotranscript.com/",
    );
    assert.ok(
      isSocialTranscriptHelperUrl("https://tiktoktranscript.io/"),
    );
    assert.ok(
      isSocialTranscriptHelperUrl("https://www.facebooktotranscript.com/"),
    );
    assert.equal(isSocialTranscriptHelperUrl("https://chatgpt.com/"), false);
  });

  it("picks Facebook language labels from locale", () => {
    assert.equal(facebookHelperLanguageLabel("en"), "English");
    assert.equal(facebookHelperLanguageLabel("de"), "German");
  });

  it("rejects junk one-line helper captions", () => {
    assert.equal(isUsableSocialHelperTranscript("you"), false);
    assert.equal(isUsableSocialHelperTranscript("hi"), false);
    assert.equal(isUsableSocialHelperTranscript("   "), false);
    assert.equal(
      isUsableSocialHelperTranscript(
        "Achtung! Durch diesen Trick können Krankenhäuser jetzt Menschen heimlich impfen.",
      ),
      true,
    );
  });
});
