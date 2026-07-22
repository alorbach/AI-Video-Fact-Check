import type { ChatTargetId } from "./types.js";

/**
 * Conservative character budgets for a single chat composer message.
 * Leave headroom below real UI limits (“Message is too long”).
 * Tunable per target without scraping answers.
 */
export const MESSAGE_CHAR_LIMITS: Record<ChatTargetId, number> = {
  chatgpt_video_faktencheck: 14_000,
  gemini_web: 28_000,
  claude_web: 28_000,
  copilot_web: 14_000,
  deepseek_web: 14_000,
};

/** Floor used when re-chunking after a runtime “too long” signal. */
export const MESSAGE_CHAR_LIMIT_FLOOR = 4_000;

export function getMessageCharLimit(target: ChatTargetId): number {
  return MESSAGE_CHAR_LIMITS[target] ?? 14_000;
}

/** Shrink budget for a retry after the chat UI rejects a too-long message. */
export function shrinkMessageCharLimit(current: number): number {
  return Math.max(MESSAGE_CHAR_LIMIT_FLOOR, Math.floor(current * 0.65));
}
