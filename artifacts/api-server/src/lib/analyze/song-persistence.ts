import type { Song } from "@workspace/shared-types";

/**
 * Helpers shared by the saved-analyses and featured stores. Both persist only
 * the DERIVED `Song` layer (raw `line.source` stripped) and re-hydrate the raw
 * lyric text live by Musixmatch `track_id` on read.
 */

/**
 * Recover the Musixmatch track id from the assembled song id
 * (`song-<trackId>-<targetLang>`). Used only as the stable persistence key.
 */
export function trackIdFromSong(song: Song): string {
  const suffix = `-${song.targetLang}`;
  if (song.id.startsWith("song-") && song.id.endsWith(suffix)) {
    return song.id.slice("song-".length, song.id.length - suffix.length);
  }
  return song.id;
}

/**
 * Strip the raw source lyric from every line before persistence. We keep only
 * the derived layer (translation, localized, scores); the original lyric text
 * is re-fetched live on reopen.
 */
export function stripSource(song: Song): Song {
  return {
    ...song,
    lines: song.lines.map((line) => ({ ...line, source: "" })),
  };
}

/** Merge live-fetched raw lyric text back into the derived song by line index. */
export function mergeSource(song: Song, raw: { text: string }[]): Song {
  return {
    ...song,
    lines: song.lines.map((line, i) => {
      const match = /^line-(\d+)$/.exec(line.id);
      const idx = match ? Number(match[1]) : i;
      const text = raw[idx]?.text ?? raw[i]?.text ?? line.source;
      return { ...line, source: text };
    }),
  };
}
