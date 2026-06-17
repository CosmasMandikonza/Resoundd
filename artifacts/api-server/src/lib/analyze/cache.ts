import type { Song } from "@workspace/shared-types";

/**
 * In-memory result cache keyed by `${trackId}:${targetLang}`.
 *
 * We deliberately cache only the assembled Song (analysis output) — never raw
 * lyrics. Entries are bounded and expire so a long-running server doesn't grow
 * unbounded.
 */
const TTL_MS = 1000 * 60 * 60; // 1 hour
const MAX_ENTRIES = 200;

interface Entry {
  song: Song;
  expiresAt: number;
}

const store = new Map<string, Entry>();

export function cacheKey(trackId: string | number, targetLang: string): string {
  return `${trackId}:${targetLang}`;
}

export function getCached(key: string): Song | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  // Refresh LRU ordering.
  store.delete(key);
  store.set(key, entry);
  return entry.song;
}

export function setCached(key: string, song: Song): void {
  if (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }
  store.set(key, { song, expiresAt: Date.now() + TTL_MS });
}
