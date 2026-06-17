import type { Song } from "@/types";
import showcaseSong from "@/fixtures/showcase";

/** A pre-computed analysis surfaced on the front door as a featured example. */
export interface FeaturedEntry {
  /** Stable id used by `openFeatured(id)` (defaults to the song id). */
  id: string;
  song: Song;
}

/**
 * The FEATURED collection — pre-computed analyses shown on the landing page.
 * For now it holds the built-in showcase fixture (Neón y Marea); real
 * pre-computed songs will be appended here later.
 */
export const FEATURED: FeaturedEntry[] = [
  { id: showcaseSong.id, song: showcaseSong },
];

export default FEATURED;
