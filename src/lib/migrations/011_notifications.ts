import type { DatabaseSync } from "node:sqlite";

export const notificationsMigration = {
  version: 11,
  name: "notifications",
  up(database: DatabaseSync) {
    database.exec(`
      CREATE TABLE notifications (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK(type IN (
          'new_match','opportunity_shared','introduction_requested',
          'introduction_approved','buyer_pursued','nda_requested','nda_approved',
          'new_message','new_task','document_shared','ioi_received','loi_received',
          'access_revoked'
        )),
        title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 160),
        body TEXT NOT NULL CHECK(length(trim(body)) BETWEEN 1 AND 1000),
        href TEXT NOT NULL CHECK(length(trim(href)) BETWEEN 1 AND 500),
        deal_id TEXT REFERENCES deals(id) ON DELETE CASCADE,
        actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        source_key TEXT NOT NULL CHECK(length(trim(source_key)) BETWEEN 1 AND 300),
        read_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id,source_key)
      );

      CREATE INDEX idx_notifications_user_created
        ON notifications(user_id,created_at DESC,id DESC);
      CREATE INDEX idx_notifications_user_unread
        ON notifications(user_id,read_at,created_at DESC);

      CREATE TABLE notification_preferences (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        notification_type TEXT NOT NULL CHECK(notification_type IN (
          'new_match','opportunity_shared','introduction_requested',
          'introduction_approved','buyer_pursued','nda_requested','nda_approved',
          'new_message','new_task','document_shared','ioi_received','loi_received',
          'access_revoked'
        )),
        frequency TEXT NOT NULL DEFAULT 'immediate'
          CHECK(frequency IN ('immediate','daily_digest','weekly_digest','disabled')),
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(user_id,notification_type)
      );

      CREATE TABLE email_outbox (
        id TEXT PRIMARY KEY,
        notification_id TEXT NOT NULL UNIQUE
          REFERENCES notifications(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        recipient_email TEXT NOT NULL CHECK(length(trim(recipient_email)) BETWEEN 3 AND 254),
        subject TEXT NOT NULL CHECK(length(trim(subject)) BETWEEN 1 AND 200),
        body TEXT NOT NULL CHECK(length(trim(body)) BETWEEN 1 AND 10000),
        frequency TEXT NOT NULL CHECK(frequency IN ('immediate','daily_digest','weekly_digest')),
        status TEXT NOT NULL DEFAULT 'queued'
          CHECK(status IN ('recorded','queued','processing','sent','failed')),
        available_at TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0),
        provider TEXT,
        provider_message_id TEXT,
        last_error TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        sent_at TEXT
      );

      CREATE INDEX idx_email_outbox_delivery
        ON email_outbox(status,available_at,created_at);
      CREATE INDEX idx_email_outbox_user
        ON email_outbox(user_id,created_at DESC);
    `);
  },
};
