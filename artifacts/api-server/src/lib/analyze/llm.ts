import { z } from "zod";
import { EmotionSchema } from "@workspace/shared-types";
import { AnalyzeError } from "./errors";
import { getOpenAI, ANALYSIS_MODEL } from "../openai";
import type { RawLyricLine } from "./musixmatch";

/**
 * The LLM emits scores on a 0-100 scale (easier for the model to reason about);
 * the pipeline divides by 100 when assembling the 0..1 Song contract.
 */
const Hundred = z.number().min(0).max(100);

const LlmFidelity = z.object({
  meaning: Hundred,
  emotion: Hundred,
  culture: Hundred,
  singability: Hundred,
});

const LlmLine = z.object({
  index: z.number().int(),
  emotion: EmotionSchema,
  translation: z.string(),
  localized: z.string(),
  backTranslation: z.string(),
  fidelity: LlmFidelity,
  rebornFidelity: LlmFidelity,
  sourceValence: Hundred,
  sourceIntensity: Hundred,
  transValence: Hundred,
  transIntensity: Hundred,
  syllableSource: z.number().int().min(0),
  syllableLocalized: z.number().int().min(0),
  lost: z.string().optional().default(""),
  risk: z.string().optional().default(""),
});

const LlmMarket = z.object({
  name: z.string(),
  lang: z.string(),
  readiness: Hundred,
  momentum: z.enum(["high", "rising", "flat"]),
  fidelity: LlmFidelity,
  risk: z.string().optional().default(""),
});

export const LlmAnalysisSchema = z.object({
  sourceLang: z.string(),
  rhyme: z.boolean(),
  stressMatch: Hundred,
  lines: z.array(LlmLine),
  markets: z.array(LlmMarket),
});

export type LlmAnalysis = z.infer<typeof LlmAnalysisSchema>;

const EMOTIONS = "joy | heat | love | calm | melancholy";

function buildPrompt(
  lines: RawLyricLine[],
  targetLang: string,
  title: string,
  artist: string,
): string {
  const numbered = lines.map((l, i) => `${i}. ${l.text}`).join("\n");
  return `You are Resound, an instrument that measures how much of a song survives translation.

SONG: "${title}" by ${artist}
TARGET LANGUAGE (ISO 639-1): ${targetLang}

SOURCE LINES (index. text):
${numbered}

For EVERY source line, return an analysis object. Produce a JSON object with this exact shape:
{
  "sourceLang": "<ISO 639-1 code you detect for the source lyrics>",
  "rhyme": <boolean: does your localized rendering preserve the rhyme scheme>,
  "stressMatch": <0-100: how well the localized syllabic stress matches the original>,
  "lines": [
    {
      "index": <integer matching the source line index>,
      "emotion": "<one of: ${EMOTIONS}>",
      "translation": "<faithful, literal translation into ${targetLang}>",
      "localized": "<singable, emotionally faithful rendering into ${targetLang} that fits the melody>",
      "backTranslation": "<translate your 'localized' line back into the SOURCE language>",
      "fidelity": { "meaning": 0-100, "emotion": 0-100, "culture": 0-100, "singability": 0-100 },
      "rebornFidelity": { "meaning": 0-100, "emotion": 0-100, "culture": 0-100, "singability": 0-100 },
      "sourceValence": <0-100: emotional positivity of the source line>,
      "sourceIntensity": <0-100: emotional intensity of the source line>,
      "transValence": <0-100: emotional positivity of your localized line>,
      "transIntensity": <0-100: emotional intensity of your localized line>,
      "syllableSource": <integer syllable count of the source line>,
      "syllableLocalized": <integer syllable count of your localized line>,
      "lost": "<short note on what nuance is lost, or empty string>",
      "risk": "<short note on cross-cultural risk, or empty string>"
    }
  ],
  "markets": [
    {
      "name": "<market/country name>",
      "lang": "<ISO 639-1 code>",
      "readiness": <0-100 projected release readiness>,
      "momentum": "<one of: high | rising | flat>",
      "fidelity": { "meaning": 0-100, "emotion": 0-100, "culture": 0-100, "singability": 0-100 },
      "risk": "<short note or empty string>"
    }
  ]
}

Rules:
- "fidelity" is the literal translation's faithfulness; "rebornFidelity" is your localized rendering's (should generally be higher).
- Return one line object per source line, in order, with matching "index".
- Provide 4 to 6 markets representing the song's realistic crossover potential. Always include the source-language home market.
- Output ONLY the JSON object. No prose, no markdown.`;
}

export async function analyzeWithLlm(args: {
  lines: RawLyricLine[];
  targetLang: string;
  title: string;
  artist: string;
}): Promise<LlmAnalysis> {
  const openai = getOpenAI();
  let content: string;
  try {
    const completion = await openai.chat.completions.create(
      {
        model: ANALYSIS_MODEL,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are a precise bilingual lyric analyst. You always return valid JSON matching the requested schema.",
          },
          {
            role: "user",
            content: buildPrompt(
              args.lines,
              args.targetLang,
              args.title,
              args.artist,
            ),
          },
        ],
      },
      { timeout: 25000, maxRetries: 1 },
    );
    content = completion.choices[0]?.message?.content ?? "";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code =
      typeof err === "object" && err !== null && "code" in err
        ? String((err as { code?: unknown }).code ?? "")
        : "";
    if (/insufficient_quota/i.test(code) || /quota|billing/i.test(message)) {
      throw new AnalyzeError(
        "rate_limit",
        "OpenAI quota exceeded — the API key has no remaining credit/billing.",
      );
    }
    if (/rate limit|429|rate_limit_exceeded/i.test(`${code} ${message}`)) {
      throw new AnalyzeError("rate_limit", "OpenAI rate limit reached.");
    }
    if (/timed out|timeout|aborted/i.test(message)) {
      throw new AnalyzeError("timeout", "The analysis model timed out.");
    }
    throw new AnalyzeError("analysis", "The analysis model request failed.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new AnalyzeError("analysis", "LLM returned invalid JSON.");
  }

  const result = LlmAnalysisSchema.safeParse(parsed);
  if (!result.success) {
    throw new AnalyzeError(
      "analysis",
      `LLM output failed validation: ${result.error.message}`,
    );
  }
  if (result.data.lines.length === 0) {
    throw new AnalyzeError("analysis", "LLM returned no analyzed lines.");
  }
  return result.data;
}
