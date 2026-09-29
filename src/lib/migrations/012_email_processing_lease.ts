import type { DatabaseSync } from "node:sqlite";

export const emailProcessingLeaseMigration = {
  version: 12,
  name: "email_processing_lease",
  up(database: DatabaseSync) {
    database.exec("ALTER TABLE email_outbox ADD COLUMN processing_at TEXT");
  },
};
