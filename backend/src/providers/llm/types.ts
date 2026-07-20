import type { FactCheckResult, Locale, LlmProviderId } from "@ai-video-fact-check/shared";

export interface FactCheckInput {
  transcript: string;
  sourceUrl: string;
  locale: Locale;
  title?: string;
  description?: string;
}

/**
 * Multi-provider contract. OpenAI in Level 3; Anthropic/Gemini in Level 6.
 * Pipeline code must depend only on this interface.
 */
export interface LlmProvider {
  readonly id: LlmProviderId;
  factCheck(input: FactCheckInput): Promise<FactCheckResult>;
}
