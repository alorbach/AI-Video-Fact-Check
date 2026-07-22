import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  fetchTranscribeYoutubeTranscript,
  joinTranscribeYoutubeSegments,
  parseTranscribeYoutubeResponse,
  TRANSCRIBE_YOUTUBE_ENDPOINT,
} from "./transcribeYoutube.js";

describe("TranscribeYouTube helper", () => {
  it("joins segment texts", () => {
    assert.equal(
      joinTranscribeYoutubeSegments([
        { text: "Hello", start: 0 },
        { text: "  world  ", start: 1 },
        { text: "", start: 2 },
      ]),
      "Hello\nworld",
    );
    assert.equal(joinTranscribeYoutubeSegments(undefined), "");
    assert.equal(joinTranscribeYoutubeSegments([]), "");
  });

  it("parses success responses", () => {
    const parsed = parseTranscribeYoutubeResponse({
      ok: true,
      title: "Demo",
      transcript: [
        { text: "Line one", start: 0, dur: 1 },
        { text: "Line two", start: 1, dur: 1 },
      ],
      error: null,
    });
    assert.deepEqual(parsed, {
      text: "Line one\nLine two",
      title: "Demo",
    });
  });

  it("returns null for NO_CAPTIONS and empty bodies", () => {
    assert.equal(
      parseTranscribeYoutubeResponse({
        ok: false,
        error: "NO_CAPTIONS",
        transcript: [],
      }),
      null,
    );
    assert.equal(parseTranscribeYoutubeResponse(null), null);
    assert.equal(
      parseTranscribeYoutubeResponse({
        ok: true,
        transcript: [{ text: "   " }],
      }),
      null,
    );
  });

  it("fetches and maps a mock response", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      calls.push({ url: String(input), init });
      return {
        ok: true,
        json: async () => ({
          ok: true,
          title: "T",
          transcript: [{ text: "From helper" }],
          error: null,
        }),
      } as Response;
    };

    const result = await fetchTranscribeYoutubeTranscript(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "de",
      { fetchImpl, timeoutMs: 2000 },
    );
    assert.deepEqual(result, { text: "From helper", title: "T" });
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.url, TRANSCRIBE_YOUTUBE_ENDPOINT);
    const body = JSON.parse(String(calls[0]?.init?.body)) as {
      url: string;
      lang: string;
    };
    assert.equal(body.url, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    assert.equal(body.lang, "de");
  });

  it("returns null on HTTP errors and aborts quietly", async () => {
    const failFetch: typeof fetch = async () =>
      ({ ok: false, status: 500, json: async () => ({}) }) as Response;
    assert.equal(
      await fetchTranscribeYoutubeTranscript(
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "en",
        { fetchImpl: failFetch },
      ),
      null,
    );

    const throwFetch: typeof fetch = async () => {
      throw new Error("network");
    };
    assert.equal(
      await fetchTranscribeYoutubeTranscript(
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "en",
        { fetchImpl: throwFetch },
      ),
      null,
    );
  });
});
