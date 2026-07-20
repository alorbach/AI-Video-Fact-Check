import Fastify from "fastify";
import type { LlmProviderId } from "@ai-video-fact-check/shared";

const port = Number(process.env.PORT ?? 3847);
const host = process.env.HOST ?? "127.0.0.1";

const app = Fastify({ logger: true });

app.get("/health", async () => ({
  ok: true,
  service: "ai-video-fact-check-backend",
  version: "0.0.1",
}));

app.get("/api/v1/meta", async () => {
  const defaultProvider = (process.env.LLM_PROVIDER ?? "openai") as LlmProviderId;
  return {
    version: "0.0.1",
    defaultProvider,
    /** Claude/Gemini land in Level 6; listed early for UI/config readiness. */
    supportedProviders: ["openai", "anthropic", "gemini"] as LlmProviderId[],
    customGptUrl:
      "https://chatgpt.com/g/g-6a5e1494f814819181208da5d30ab4ae-video-faktencheck",
    author: {
      name: "Andre Lorbach",
      url: "https://github.com/alorbach/",
    },
  };
});

await app.listen({ port, host });
console.log(`Backend listening on http://${host}:${port}`);
