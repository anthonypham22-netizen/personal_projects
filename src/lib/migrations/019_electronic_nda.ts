import type { DatabaseSync } from "node:sqlite";

export const electronicNdaMigration = {
  version: 19,
  name: "electronic_nda",
  up(database: DatabaseSync) {
    database.exec(`
      ALTER TABLE access
        ADD COLUMN nda_method TEXT NOT NULL DEFAULT 'external_upload'
          CHECK(nda_method IN ('external_upload','electronic_signature'));
      ALTER TABLE access
        ADD COLUMN electronic_signature_envelope_id TEXT;

      CREATE TABLE electronic_signature_envelopes (
        id TEXT PRIMARY KEY,
        access_id TEXT NOT NULL REFERENCES access(id) ON DELETE CASCADE,
        deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
        buyer_id TEXT NOT NULL REFERENCES users(id),
        provider TEXT NOT NULL,
        provider_name TEXT NOT NULL,
        provider_envelope_id TEXT,
        status TEXT NOT NULL CHECK(status IN (
          'creating','sent','buyer_signed','completed','declined','voided','failed'
        )),
        executed_document_id TEXT REFERENCES documents(id),
        requested_by_user_id TEXT NOT NULL REFERENCES users(id),
        buyer_signed_at TEXT,
        completed_at TEXT,
        failure_reason TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(provider,provider_envelope_id)
      );

      CREATE TABLE electronic_signature_events (
        id TEXT PRIMARY KEY,
        envelope_id TEXT NOT NULL REFERENCES electronic_signature_envelopes(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        provider_event_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN (
          'buyer_signed','completed','declined','voided','failed'
        )),
        payload_digest TEXT NOT NULL,
        occurred_at TEXT,
        processed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(provider,provider_event_id)
      );

      CREATE INDEX idx_electronic_signature_envelopes_access
        ON electronic_signature_envelopes(access_id,created_at DESC);
      CREATE INDEX idx_electronic_signature_envelopes_deal
        ON electronic_signature_envelopes(deal_id,buyer_id,status);
      CREATE INDEX idx_electronic_signature_events_envelope
        ON electronic_signature_events(envelope_id,processed_at DESC);
    `);
  },
};
