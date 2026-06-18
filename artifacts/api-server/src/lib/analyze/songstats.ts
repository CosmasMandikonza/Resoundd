import type { Logger } from "pino";
import type { Market } from "@workspace/shared-types";
import { fetchWithTimeout } from "./http";

/**
 * Songstats market-data integration.
 *
 * Songstats reports real streaming activity per track and per country. We use it
 * to overlay REAL momentum / streams numbers / trailing history onto the
 * per-market cockpit — release readiness itself stays derived from per-language
 * fidelity, but the "is this market actually moving?" signal becomes real.
 *
 * The Enterprise API's exact response shapes vary, so this client parses very
 * defensively and returns `null` on ANY problem (missing key, no match, bad
 * shape, timeout) so the caller falls back to estimated market numbers.
 */

const BASE = "https://api.songstats.com/enterprise/v1";
const TIMEOUT_MS = 9_000;

/** Country (ISO-3166 alpha-2) → ISO-639-1 language we map markets by. */
const COUNTRY_TO_LANG: Record<string, string> = {
  US: "en",
  GB: "en",
  CA: "en",
  AU: "en",
  IE: "en",
  ES: "es",
  MX: "es",
  AR: "es",
  CO: "es",
  CL: "es",
  PE: "es",
  BR: "pt",
  PT: "pt",
  FR: "fr",
  DE: "de",
  AT: "de",
  CH: "de",
  IT: "it",
  JP: "ja",
  KR: "ko",
  CN: "zh",
  IN: "hi",
  RU: "ru",
  SA: "ar",
  AE: "ar",
};

export interface MarketSignal {
  /** Streams change over the trailing window, as a percentage. */
  streamsDelta: number;
  momentum: "high" | "rising" | "flat";
  streamsHistory: number[];
  absoluteStreams?: number;
}

export interface SongstatsData {
  /** Per-language aggregated signal, keyed by ISO-639-1. */
  byLang: Record<string, MarketSignal>;
  /** Global trailing streams history for the track. */
  globalHistory: number[];
  globalStreams?: number;
}

export function isSongstatsEnabled(): boolean {
  return Boolean(process.env.SONGSTATS_API_KEY?.trim());
}

function apiKey(): string {
  const k = process.env.SONGSTATS_API_KEY?.trim();
  if (!k) throw new Error("SONGSTATS_API_KEY is not set");
  return k;
}

async function get<T>(
  path: string,
  params: Record<string, string | number>,
): Promise<T> {
  const url = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }
  const res = await fetchWithTimeout(
    url.toString(),
    { headers: { apikey: apiKey(), Accept: "application/json" } },
    TIMEOUT_MS,
    "Songstats",
  );
  if (!res.ok) throw new Error(`Songstats HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** Pull the first finite number found under any of the candidate keys. */
function pickNumber(
  obj: Record<string, unknown> | undefined,
  keys: string[],
): number | undefined {
  if (!obj) return undefined;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) {
      return Number(v);
    }
  }
  return undefined;
}

/** Coerce a value to an array of objects (empty when it isn't one). */
function asArray(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value as Record<string, unknown>[];
  return [];
}

/** First non-empty array found at `obj[key]` or `obj.data[key]`. */
function nestedArray(
  obj: Record<string, unknown>,
  ...keys: string[]
): Record<string, unknown>[] {
  const data = obj.data as Record<string, unknown> | undefined;
  for (const k of keys) {
    const top = asArray(obj[k]);
    if (top.length) return top;
    const nested = asArray(data?.[k]);
    if (nested.length) return nested;
  }
  return [];
}

function momentumFromDelta(delta: number): "high" | "rising" | "flat" {
  if (delta >= 20) return "high";
  if (delta >= 5) return "rising";
  return "flat";
}

/** Resolve a Songstats track id from an ISRC, or by title/artist search. */
async function resolveSongstatsId(input: {
  isrc?: string;
  title: string;
  artist: string;
}): Promise<string | null> {
  try {
    if (input.isrc) {
      const info = await get<Record<string, unknown>>("/tracks/info", {
        isrc: input.isrc,
      });
      const id = pickTrackId(info);
      if (id) return id;
    }
  } catch {
    // fall through to search
  }

  try {
    const q = [input.title, input.artist].filter(Boolean).join(" ");
    const search = await get<Record<string, unknown>>("/tracks/search", {
      q,
      limit: 1,
    });
    const list = nestedArray(search, "results", "tracks");
    const first = list[0];
    return first ? pickTrackId(first) : null;
  } catch {
    return null;
  }
}

function pickTrackId(obj: Record<string, unknown>): string | null {
  const direct = obj.songstats_track_id ?? obj.track_id ?? obj.id;
  if (typeof direct === "string" && direct) return direct;
  if (typeof direct === "number") return String(direct);
  const nested = (obj.track as Record<string, unknown> | undefined) ?? undefined;
  if (nested) return pickTrackId(nested);
  return null;
}

/** Extract a trailing streams history series from a historic-stats payload. */
function extractHistory(payload: Record<string, unknown>): number[] {
  // Common shapes: { stats: [{ data: { history: [{ value }] } }] } or
  // { data: { history: [{ streams }] } } — search defensively.
  const candidates: Record<string, unknown>[] = [];
  candidates.push(payload);
  const data = payload.data as Record<string, unknown> | undefined;
  if (data) candidates.push(data);
  for (const s of asArray(payload.stats)) candidates.push(s);
  for (const s of asArray(data?.stats)) candidates.push(s);

  for (const c of candidates) {
    const histArr =
      asArray(c.history).length > 0
        ? asArray(c.history)
        : asArray((c.data as Record<string, unknown>)?.history);
    if (histArr.length > 0) {
      const series = histArr
        .map((row) => pickNumber(row, ["streams", "value", "count", "total"]))
        .filter((n): n is number => n != null);
      if (series.length > 0) return series.slice(-12);
    }
  }
  return [];
}

function deltaFromHistory(history: number[]): number {
  if (history.length < 2) return 0;
  const first = history[0];
  const last = history[history.length - 1];
  if (first <= 0) return 0;
  return Math.round(((last - first) / first) * 100);
}

/**
 * Fetch real market data for a track. Returns `null` on any failure so the
 * pipeline can fall back to estimated market numbers.
 */
export async function fetchSongstats(
  input: { isrc?: string; title: string; artist: string },
  log: Logger,
): Promise<SongstatsData | null> {
  if (!isSongstatsEnabled()) return null;

  try {
    const trackId = await resolveSongstatsId(input);
    if (!trackId) {
      log.info({ title: input.title }, "songstats: no track match");
      return null;
    }

    const [historic, locations] = await Promise.all([
      get<Record<string, unknown>>("/tracks/historic_stats", {
        songstats_track_id: trackId,
        source: "spotify",
      }).catch(() => ({}) as Record<string, unknown>),
      get<Record<string, unknown>>("/tracks/locations", {
        songstats_track_id: trackId,
        source: "spotify",
      }).catch(() => ({}) as Record<string, unknown>),
    ]);

    const globalHistory = extractHistory(historic);
    const globalStreams = pickNumber(
      (historic.data as Record<string, unknown>) ?? historic,
      ["streams_total", "streams", "total"],
    );

    // Per-country rows → aggregate by language.
    const rows = nestedArray(locations, "locations", "countries", "data");

    const byLang: Record<string, MarketSignal> = {};
    for (const row of rows) {
      const country = String(
        row.country_code ?? row.country ?? row.code ?? "",
      ).toUpperCase();
      const lang = COUNTRY_TO_LANG[country];
      if (!lang) continue;
      const streams = pickNumber(row, [
        "streams",
        "streams_total",
        "value",
        "count",
      ]);
      const delta = pickNumber(row, [
        "streams_change",
        "change",
        "growth",
        "delta",
      ]);
      const existing = byLang[lang];
      const absoluteStreams =
        (existing?.absoluteStreams ?? 0) + (streams ?? 0);
      const d = delta ?? 0;
      byLang[lang] = {
        streamsDelta: existing ? Math.round((existing.streamsDelta + d) / 2) : d,
        momentum: momentumFromDelta(
          existing ? Math.round((existing.streamsDelta + d) / 2) : d,
        ),
        streamsHistory: existing?.streamsHistory ?? globalHistory,
        absoluteStreams: absoluteStreams || undefined,
      };
    }

    if (Object.keys(byLang).length === 0 && globalHistory.length === 0) {
      log.info("songstats: matched track but no usable signal");
      return null;
    }

    return { byLang, globalHistory, globalStreams };
  } catch (err) {
    log.warn({ err }, "songstats: fetch errored — falling back to estimated");
    return null;
  }
}

/**
 * Overlay real Songstats signal onto LLM-derived markets. Readiness/fidelity are
 * preserved; only the momentum/streams numbers + history are replaced when real
 * data exists for a market's language. Returns the (possibly unchanged) markets
 * and whether any real data was applied.
 */
export function applySongstats(
  markets: Market[],
  data: SongstatsData,
): { markets: Market[]; applied: boolean } {
  let applied = false;
  const next = markets.map((m) => {
    const signal = data.byLang[m.lang.toLowerCase()];
    const history =
      signal?.streamsHistory && signal.streamsHistory.length > 1
        ? signal.streamsHistory
        : data.globalHistory.length > 1
          ? data.globalHistory
          : undefined;
    if (!signal && !history) return m;
    applied = true;
    const streamsDelta = signal
      ? signal.streamsDelta
      : history
        ? deltaFromHistory(history)
        : m.streamsDelta;
    return {
      ...m,
      streamsDelta,
      momentum: signal ? signal.momentum : momentumFromDelta(streamsDelta),
      ...(history ? { streamsHistory: history } : {}),
      ...(signal?.absoluteStreams != null
        ? { absoluteStreams: signal.absoluteStreams }
        : data.globalStreams != null
          ? { absoluteStreams: data.globalStreams }
          : {}),
    };
  });
  return { markets: next, applied };
}
