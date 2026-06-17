import { fetchWithTimeout } from "./http";

export interface ItunesMatch {
  previewUrl: string;
  durationMs?: number;
  artworkUrl?: string;
}

interface ItunesResult {
  trackName?: string;
  artistName?: string;
  previewUrl?: string;
  trackTimeMillis?: number;
  artworkUrl100?: string;
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Look up a 30-second preview + duration from the public iTunes Search API.
 * Best-effort: returns null if nothing usable is found (the pipeline degrades to
 * follow-along mode without audio).
 */
export async function findPreview(
  title: string,
  artist: string,
): Promise<ItunesMatch | null> {
  const term = encodeURIComponent(`${title} ${artist}`.trim());
  const url = `https://itunes.apple.com/search?term=${term}&entity=song&limit=10`;

  let results: ItunesResult[] = [];
  try {
    const res = await fetchWithTimeout(url, {}, 10000, "iTunes");
    const json = (await res.json()) as { results?: ItunesResult[] };
    results = json.results ?? [];
  } catch {
    return null;
  }
  if (results.length === 0) return null;

  const wantTitle = norm(title);
  const wantArtist = norm(artist);

  const scored = results
    .filter((r) => r.previewUrl)
    .map((r) => {
      const t = norm(r.trackName ?? "");
      const a = norm(r.artistName ?? "");
      let score = 0;
      if (t === wantTitle) score += 3;
      else if (t.includes(wantTitle) || wantTitle.includes(t)) score += 2;
      if (wantArtist && (a.includes(wantArtist) || wantArtist.includes(a)))
        score += 2;
      return { r, score };
    })
    .sort((x, y) => y.score - x.score);

  const best = scored[0]?.r;
  if (!best?.previewUrl) return null;

  return {
    previewUrl: best.previewUrl,
    durationMs: best.trackTimeMillis,
    artworkUrl: best.artworkUrl100?.replace("100x100", "600x600"),
  };
}
