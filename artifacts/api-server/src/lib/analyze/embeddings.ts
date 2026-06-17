import { getOpenAI, EMBEDDING_MODEL } from "../openai";

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Compute per-line back-translation drift (0..1) by embedding each source line
 * and the back-translation of its localized rendering, then taking 1 - cosine.
 *
 * Best-effort: returns null on any failure so the pipeline can fall back to a
 * meaning-derived drift estimate.
 */
export async function computeDrift(
  pairs: { source: string; backTranslation: string }[],
): Promise<number[] | null> {
  if (pairs.length === 0) return [];
  const inputs: string[] = [];
  for (const p of pairs) {
    inputs.push(p.source, p.backTranslation);
  }

  try {
    const openai = getOpenAI();
    const res = await openai.embeddings.create(
      {
        model: EMBEDDING_MODEL,
        input: inputs,
      },
      { timeout: 15000, maxRetries: 1 },
    );
    const vectors = res.data.map((d) => d.embedding);
    const drift: number[] = [];
    for (let i = 0; i < pairs.length; i++) {
      const src = vectors[i * 2];
      const back = vectors[i * 2 + 1];
      if (!src || !back) {
        drift.push(0.5);
        continue;
      }
      const sim = cosine(src, back);
      drift.push(Math.max(0, Math.min(1, 1 - sim)));
    }
    return drift;
  } catch {
    return null;
  }
}
