import { zodToJsonSchema } from "zod-to-json-schema";
import { AnalyzeError } from "./errors";
import { fetchWithTimeout } from "./http";
import {
  ANALYSIS_SYSTEM_PROMPT,
  LlmAnalysisSchema,
  buildPrompt,
  parseAnalysis,
  type AnalyzeArgs,
  type LlmAnalysis,
} from "./llm";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const ANALYSIS_MODEL = "gemini-2.5-flash";
const EMBEDDING_MODEL = "gemini-embedding-001";

const ANALYSIS_TIMEOUT_MS = 25000;
const EMBEDDING_TIMEOUT_MS = 15000;

export function geminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

function getKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new AnalyzeError("auth", "GEMINI_API_KEY is not set.");
  return key;
}

/**
 * Gemini's responseSchema accepts only a subset of JSON Schema. Recursively drop
 * keywords it rejects (e.g. additionalProperties, $schema, default, $ref bits)
 * and inline everything so no $ref survives.
 */
const ALLOWED_SCHEMA_KEYS = new Set([
  "type",
  "format",
  "description",
  "nullable",
  "enum",
  "items",
  "properties",
  "required",
  "minItems",
  "maxItems",
  "minimum",
  "maximum",
  "anyOf",
]);

function sanitizeSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(sanitizeSchema);
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (!ALLOWED_SCHEMA_KEYS.has(k)) continue;
      out[k] = sanitizeSchema(v);
    }
    return out;
  }
  return node;
}

let cachedSchema: unknown | null = null;
function analysisResponseSchema(): unknown {
  if (cachedSchema) return cachedSchema;
  const json = zodToJsonSchema(LlmAnalysisSchema, {
    $refStrategy: "none",
    target: "openApi3",
  });
  cachedSchema = sanitizeSchema(json);
  return cachedSchema;
}

interface GeminiError {
  kind: "rate_limit" | "quota" | "auth" | "other";
  message: string;
}

/** Map a non-OK Gemini response body/status to a classified error. */
async function classifyGemini(res: Response): Promise<GeminiError> {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  const status =
    body && typeof body === "object" && "error" in body
      ? (body as { error?: { status?: string; message?: string } }).error
      : undefined;
  const statusStr = `${status?.status ?? ""} ${status?.message ?? ""}`;
  if (res.status === 429) {
    if (/quota|billing|exceeded your current quota/i.test(statusStr)) {
      return {
        kind: "quota",
        message:
          "Gemini quota exceeded — the API key has no remaining quota/billing.",
      };
    }
    return { kind: "rate_limit", message: "Gemini rate limit reached." };
  }
  if (res.status === 401 || res.status === 403) {
    return { kind: "auth", message: "Gemini rejected the API key." };
  }
  return {
    kind: "other",
    message: `Gemini request failed (HTTP ${res.status}).`,
  };
}

function throwGemini(e: GeminiError): never {
  if (e.kind === "rate_limit" || e.kind === "quota") {
    throw new AnalyzeError("rate_limit", e.message);
  }
  if (e.kind === "auth") throw new AnalyzeError("auth", e.message);
  throw new AnalyzeError("analysis", e.message);
}

interface GenerateResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
}

function extractText(data: GenerateResponse): string {
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  return parts.map((p) => p.text ?? "").join("");
}

/**
 * Analysis via Gemini structured output. Same Zod contract as the OpenAI path,
 * same ~25s timeout. One parse-repair retry on invalid/short JSON.
 */
export async function analyzeWithGemini(
  args: AnalyzeArgs,
): Promise<LlmAnalysis> {
  const key = getKey();
  const url = `${GEMINI_BASE}/${ANALYSIS_MODEL}:generateContent`;
  const userText = buildPrompt(
    args.lines,
    args.targetLang,
    args.title,
    args.artist,
  );

  const body = {
    systemInstruction: { parts: [{ text: ANALYSIS_SYSTEM_PROMPT }] },
    contents: [{ role: "user", parts: [{ text: userText }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: analysisResponseSchema(),
      temperature: 0,
      maxOutputTokens: 32768,
      thinkingConfig: { thinkingBudget: 0 },
    },
  };

  const attempt = async (): Promise<string> => {
    const res = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": key,
        },
        body: JSON.stringify(body),
      },
      ANALYSIS_TIMEOUT_MS,
      "Gemini",
    );
    if (!res.ok) throwGemini(await classifyGemini(res));
    const data = (await res.json()) as GenerateResponse;
    return extractText(data);
  };

  let content = await attempt();
  try {
    return parseAnalysis(content);
  } catch (firstErr) {
    // One parse-repair retry: a fresh generation often returns valid JSON.
    try {
      content = await attempt();
      return parseAnalysis(content);
    } catch {
      throw firstErr;
    }
  }
}

interface BatchEmbedResponse {
  embeddings?: { values?: number[] }[];
}

/**
 * Batch-embed inputs via Gemini in one request. Returns vectors aligned to the
 * input order, or null on any failure so the caller can fall back.
 */
export async function embedWithGemini(
  inputs: string[],
): Promise<number[][] | null> {
  if (!geminiConfigured()) return null;
  if (inputs.length === 0) return [];
  try {
    const key = getKey();
    const url = `${GEMINI_BASE}/${EMBEDDING_MODEL}:batchEmbedContents`;
    const requests = inputs.map((text) => ({
      model: `models/${EMBEDDING_MODEL}`,
      content: { parts: [{ text }] },
    }));
    const res = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": key,
        },
        body: JSON.stringify({ requests }),
      },
      EMBEDDING_TIMEOUT_MS,
      "Gemini embeddings",
    );
    if (!res.ok) return null;
    const data = (await res.json()) as BatchEmbedResponse;
    const vectors = data.embeddings?.map((e) => e.values ?? []) ?? [];
    if (vectors.length !== inputs.length) return null;
    return vectors;
  } catch {
    return null;
  }
}
