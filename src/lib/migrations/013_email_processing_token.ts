import type { DatabaseSync } from "node:sqlite";

export const emailProcessingTokenMigration = {
  version: 13,
  name: "email_processing_token",
  up(database: DatabaseSync) {
    database.exec("ALTER TABLE email_outbox ADD COLUMN processing_token TEXT");
    database.exec(
      "CREATE INDEX idx_email_outbox_processing_token ON email_outbox(processing_token)",
    );
  },
};
