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

// Gemini structured output is slower than OpenAI JSON mode (~24s observed for
// ~24 lines), so the analysis call gets a wider ceiling than the OpenAI path.
const ANALYSIS_TIMEOUT_MS = 60000;
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
      // The keys inside `properties` are arbitrary field names, NOT schema
      // keywords — keep them all and only sanitize their schema values.
      if (k === "properties" && v && typeof v === "object") {
        const props: Record<string, unknown> = {};
        for (const [pk, pv] of Object.entries(v as Record<string, unknown>)) {
          props[pk] = sanitizeSchema(pv);
        }
        out[k] = props;
        continue;
      }
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
  kind: "rate_limit" | "quota" | "auth" | "overloaded" | "other";
  message: string;
  /** Transient errors worth retrying with backoff. */
  retriable: boolean;
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
        retriable: false,
        message:
          "Gemini quota exceeded — the API key has no remaining quota/billing.",
      };
    }
    return {
      kind: "rate_limit",
      retriable: true,
      message: "Gemini rate limit reached.",
    };
  }
  if (res.status === 401 || res.status === 403) {
    return {
      kind: "auth",
      retriable: false,
      message: "Gemini rejected the API key.",
    };
  }
  if (res.status === 503 || res.status === 500 || /unavailable|overloaded/i.test(statusStr)) {
    return {
      kind: "overloaded",
      retriable: true,
      message: "Gemini is temporarily overloaded. Please try again.",
    };
  }
  return {
    kind: "other",
    retriable: false,
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

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

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

  // One network attempt: returns the model text, or throws via throwGemini.
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
    if (!res.ok) {
      const e = await classifyGemini(res);
      // Surface a retriable marker so the loop can back off and retry.
      if (e.retriable) {
        const err = new AnalyzeError("rate_limit", e.message);
        (err as { retriable?: boolean }).retriable = true;
        throw err;
      }
      throwGemini(e);
    }
    const data = (await res.json()) as GenerateResponse;
    return extractText(data);
  };

  // Two independent retry budgets:
  //  - transient HTTP failures (overloaded/rate-limit, marked retriable) back
  //    off and retry up to MAX_ATTEMPTS times;
  //  - a malformed/invalid model response gets a single re-roll.
  // Non-retriable HTTP (auth/quota/other) and timeouts propagate immediately.
  const MAX_ATTEMPTS = 3;
  let parseFailures = 0;
  let lastErr: unknown;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    let content: string;
    try {
      content = await attempt();
    } catch (err) {
      lastErr = err;
      const retriable =
        err instanceof AnalyzeError &&
        (err as { retriable?: boolean }).retriable === true;
      if (!retriable || i === MAX_ATTEMPTS - 1) throw err;
      await sleep(800 * (i + 1));
      continue;
    }
    try {
      return parseAnalysis(content);
    } catch (err) {
      lastErr = err;
      parseFailures += 1;
      // Cap parse re-rolls at one (2 total parse attempts) to bound latency.
      if (parseFailures >= 2 || i === MAX_ATTEMPTS - 1) throw err;
    }
  }
  throw lastErr;
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
