import type { LlmProviderId } from "@ai-video-fact-check/shared";
import type { LlmProvider } from "./types.js";

/**
 * Level 3: wire OpenAIAdapter.
 * Level 6: wire AnthropicAdapter + GeminiAdapter + fallback router.
 */
export function createLlmProvider(id: LlmProviderId = "openai"): LlmProvider {
  throw new Error(
    `LLM provider "${id}" is not implemented yet (Level 3/6). Stub factory only.`,
  );
}
