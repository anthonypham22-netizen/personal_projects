import type { DatabaseSync } from "node:sqlite";

export const internalDealNotesMigration = {
  version: 10,
  name: "internal_deal_notes",
  up(database: DatabaseSync) {
    database.exec(`
      CREATE TABLE deal_internal_notes (
        id TEXT PRIMARY KEY,
        deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
        author_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        body TEXT NOT NULL CHECK(length(trim(body)) BETWEEN 1 AND 5000),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX idx_deal_internal_notes_deal_created
        ON deal_internal_notes(deal_id,created_at DESC,id DESC);
    `);
  },
};
