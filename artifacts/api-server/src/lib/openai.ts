import OpenAI from "openai";

let client: OpenAI | null = null;

/**
 * Lazily-constructed OpenAI client using the server-side OPENAI_API_KEY.
 * The key never leaves the server.
 */
export function getOpenAI(): OpenAI {
  if (client) return client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }
  client = new OpenAI({ apiKey });
  return client;
}

/** Chat model for analysis (JSON mode, temperature 0). */
export const ANALYSIS_MODEL = "gpt-4.1-mini";
/** Embedding model used for back-translation drift. */
export const EMBEDDING_MODEL = "text-embedding-3-small";
