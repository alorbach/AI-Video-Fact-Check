import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CHAT_TARGETS,
  isPostSendChatPath,
  type ChatTargetId,
} from "./types.js";

describe("CHAT_TARGETS", () => {
  const expected: ChatTargetId[] = [
    "chatgpt_video_faktencheck",
    "gemini_web",
    "claude_web",
    "copilot_web",
    "deepseek_web",
  ];

  it("lists all free chat engines", () => {
    assert.deepEqual(Object.keys(CHAT_TARGETS).sort(), [...expected].sort());
  });

  it("marks inject support for GPT, Gemini, Claude, Copilot", () => {
    assert.equal(CHAT_TARGETS.chatgpt_video_faktencheck.supportsInject, true);
    assert.equal(CHAT_TARGETS.gemini_web.supportsInject, true);
    assert.equal(CHAT_TARGETS.claude_web.supportsInject, true);
    assert.equal(CHAT_TARGETS.copilot_web.supportsInject, true);
    assert.equal(CHAT_TARGETS.deepseek_web.supportsInject, false);
  });

  it("embeds master prompt for non-Custom-GPT targets and has login URLs", () => {
    assert.equal(
      CHAT_TARGETS.chatgpt_video_faktencheck.needsEmbeddedMasterPrompt,
      false,
    );
    for (const id of Object.keys(CHAT_TARGETS) as ChatTargetId[]) {
      assert.equal(CHAT_TARGETS[id].freeForEndUsers, true);
      assert.match(CHAT_TARGETS[id].openUrl, /^https:\/\//);
      assert.match(CHAT_TARGETS[id].loginUrl, /^https:\/\//);
    }
    for (const id of [
      "gemini_web",
      "claude_web",
      "copilot_web",
      "deepseek_web",
    ] as const) {
      assert.equal(CHAT_TARGETS[id].needsEmbeddedMasterPrompt, true);
    }
  });
});

describe("isPostSendChatPath", () => {
  it("detects ChatGPT and Claude conversation paths", () => {
    assert.equal(isPostSendChatPath("/c/abc"), true);
    assert.equal(isPostSendChatPath("/chat/xyz"), true);
    assert.equal(isPostSendChatPath("/app/foo"), true);
    assert.equal(isPostSendChatPath("/new"), false);
    assert.equal(isPostSendChatPath("/g/custom-gpt"), false);
  });
});
