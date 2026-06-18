import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * A precomputed, curated analysis shown in the public Featured gallery. Unlike
 * saved analyses these are not user-owned and are produced by /api/precompute,
 * which runs the FULL pipeline including the slow Cyanite audio enrichment so
 * the stored `Song` ships complete (real emotional arc + market data).
 *
 * Compliance note: the same no-raw-lyrics rule applies — only the derived
 * `Song` layer is stored (each line's raw `source` stripped) and re-fetched
 * live by Musixmatch `track_id` when opened.
 */
export const featuredAnalysesTable = pgTable(
  "featured_analyses",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    trackId: text("track_id").notNull(),
    targetLang: text("target_lang").notNull(),
    title: text("title").notNull(),
    artist: text("artist").notNull(),
    sourceLang: text("source_lang").notNull(),
    /** Display order in the gallery (lower first). */
    rank: integer("rank").notNull().default(0),
    /** Fully enriched Song JSON with raw `line.source` stripped. */
    song: jsonb("song").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("featured_analyses_track_lang").on(table.trackId, table.targetLang),
    index("IDX_featured_analyses_rank").on(table.rank),
  ],
);

export type FeaturedAnalysisRow = typeof featuredAnalysesTable.$inferSelect;
export type InsertFeaturedAnalysis = typeof featuredAnalysesTable.$inferInsert;
