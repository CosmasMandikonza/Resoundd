/**
 * Active LLM provider for both analysis and embeddings.
 *
 * Switchable via the `LLM_PROVIDER` env var. Defaults to "gemini". The existing
 * "openai" provider stays fully intact and selectable. All provider API keys are
 * read server-side only.
 */
export type LlmProvider = "openai" | "gemini";

export function getLlmProvider(): LlmProvider {
  const p = (process.env.LLM_PROVIDER ?? "gemini").trim().toLowerCase();
  if (p === "openai") return "openai";
  return "gemini";
}
