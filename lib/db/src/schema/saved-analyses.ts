import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

/**
 * A user's saved analysis. Compliance: we persist only the DERIVED analysis
 * layer — the assembled `Song` with each line's raw `source` lyric stripped
 * (set to ""). The raw source lyric is re-fetched live from Musixmatch on
 * reopen and merged back in by line index. Keyed uniquely per
 * (userId, trackId, targetLang) so re-saving the same analysis updates it.
 */
export const savedAnalysesTable = pgTable(
  "saved_analyses",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    trackId: text("track_id").notNull(),
    targetLang: text("target_lang").notNull(),
    title: text("title").notNull(),
    artist: text("artist").notNull(),
    sourceLang: text("source_lang").notNull(),
    /** Assembled Song JSON with raw `line.source` stripped (derived layer only). */
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
    unique("saved_analyses_user_track_lang").on(
      table.userId,
      table.trackId,
      table.targetLang,
    ),
    index("IDX_saved_analyses_user").on(table.userId),
  ],
);

export type SavedAnalysisRow = typeof savedAnalysesTable.$inferSelect;
export type InsertSavedAnalysis = typeof savedAnalysesTable.$inferInsert;
