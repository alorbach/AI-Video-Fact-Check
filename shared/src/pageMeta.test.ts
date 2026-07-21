import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  findStringByKeys,
  findStringByKeysNearId,
  metaContent,
  ogDescription,
  pageMetaPostText,
  parseJsonAssignment,
  pickLongestText,
  textMentionsExactId,
  unwrapInstagramOgCaption,
} from "./pageMeta.js";

describe("pageMeta", () => {
  it("reads og:description and meta name content", () => {
    const html = `
      <meta property="og:description" content="Hello &amp; world" />
      <meta name="description" content="Short" />
    `;
    assert.equal(ogDescription(html), "Hello & world");
    assert.equal(metaContent(html, "name", "description"), "Short");
  });

  it("picks longest text and unwraps Instagram og titles", () => {
    assert.equal(pickLongestText("a", "longer one", ""), "longer one");
    assert.equal(
      unwrapInstagramOgCaption('user on Instagram: "Fact check this reel"'),
      "Fact check this reel",
    );
  });

  it("parses JSON assignments and finds string keys", () => {
    const source = `window.__DATA__ = {"item":{"desc":"TikTok caption here"}};`;
    const parsed = parseJsonAssignment(source, "__DATA__");
    assert.equal(findStringByKeys(parsed, ["desc"]), "TikTok caption here");
  });

  it("prefers nested caption keys over shallow title", () => {
    const node = {
      title: "Short title",
      item: { desc: "Long nested caption about the video claims" },
    };
    assert.equal(
      findStringByKeys(node, ["desc", "description", "title"]),
      "Long nested caption about the video claims",
    );
  });

  it("scopes captions to the subtree that mentions a video id", () => {
    const node = {
      items: [
        { id: "111", desc: "Wrong clip caption" },
        { id: "222", desc: "Correct clip caption" },
      ],
    };
    assert.equal(
      findStringByKeysNearId(node, ["desc", "description"], "222"),
      "Correct clip caption",
    );
  });

  it("does not take a sibling clip when the id is only a map key", () => {
    // TikTok SIGI ItemModule: clips keyed by id; leaf often has no id field.
    const itemModule = {
      ItemModule: {
        "111": { desc: "Wrong sibling caption", author: "a" },
        "222": { desc: "Correct keyed caption", author: "b" },
      },
    };
    assert.equal(
      findStringByKeysNearId(itemModule, ["desc", "description"], "222"),
      "Correct keyed caption",
    );
    assert.equal(
      findStringByKeysNearId(itemModule, ["desc", "description"], "111"),
      "Wrong sibling caption",
    );
  });

  it("does not treat shorter ids as substrings of longer ids", () => {
    assert.equal(textMentionsExactId('"111222"', "111"), false);
    assert.equal(textMentionsExactId('"111"', "111"), true);
    assert.equal(textMentionsExactId('{"id":111222}', "111"), false);
    assert.equal(textMentionsExactId('{"id":111}', "111"), true);
    assert.equal(
      findStringByKeysNearId(
        {
          items: [
            { id: "111222", desc: "Longer id clip" },
            { id: "111", desc: "Exact id clip" },
          ],
        },
        ["desc"],
        "111",
      ),
      "Exact id clip",
    );
  });

  it("aggregates pageMetaPostText from JSON-LD", () => {
    const html = `
      <script type="application/ld+json">
        {"@type":"VideoObject","name":"Very Long Video Title That Should Not Win","description":"LD caption about claims"}
      </script>
    `;
    const text = pageMetaPostText(html);
    assert.match(text, /LD caption/);
    assert.doesNotMatch(text, /Very Long Video Title/);
  });
});
