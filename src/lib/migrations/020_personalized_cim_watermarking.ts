import type { DatabaseSync } from "node:sqlite";

export const personalizedCimWatermarkingMigration = {
  version: 20,
  name: "personalized_cim_watermarking",
  up(database: DatabaseSync) {
    database.exec(`
      ALTER TABLE documents
        ADD COLUMN watermark_enabled INTEGER NOT NULL DEFAULT 0
          CHECK(watermark_enabled IN (0,1));

      CREATE TABLE document_watermark_variants (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        buyer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        storage_key TEXT NOT NULL UNIQUE,
        source_sha256 TEXT NOT NULL,
        watermark_signature TEXT NOT NULL,
        content_sha256 TEXT NOT NULL,
        generated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_accessed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(document_id,buyer_id)
      );
    `);
  },
};
