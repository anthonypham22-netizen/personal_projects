import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { databaseReady, closeDatabase, one } from "../src/lib/db";
import { mutate } from "../src/lib/service";
import {
  processElectronicSignatureEvent,
  requestElectronicNda,
} from "../src/lib/electronic-signatures";
import {
  electronicSignatureProviderForWebhook,
  type ElectronicSignatureProvider,
} from "../src/lib/electronic-signature-provider";
import type { User } from "../src/lib/types";

let directory: string;
let owner: User;

const provider: ElectronicSignatureProvider = {
  id: "test-provider",
  displayName: "Test signing provider",
  async createNdaEnvelope({ localEnvelopeId }) {
    return { providerEnvelopeId: `provider-${localEnvelopeId}` };
  },
  async verifyWebhook() {
    throw new Error("Webhook verification is covered by the adapter contract.");
  },
};

before(async () => {
  directory = mkdtempSync(path.join(tmpdir(), "succera-electronic-nda-"));
  process.env.DATA_DIR = directory;
  process.env.ALLOW_DEMO = "true";
  await databaseReady();
  owner = (await one<User>("SELECT * FROM users WHERE id='demo-owner'"))!;
});

after(async () => {
  await closeDatabase();
  rmSync(directory, { recursive: true, force: true });
});

test("provider completion stores the executed NDA and grants access exactly once", async () => {
  const requested = await requestElectronicNda(
    owner,
    { deal_id: "harbour", buyer_id: "demo-buyer" },
    provider,
  );
  assert.ok(requested.id);
  assert.deepEqual(
    await one<{
      status: string;
      nda_status: string;
      nda_method: string;
      electronic_signature_envelope_id: string;
    }>(
      "SELECT status,nda_status,nda_method,electronic_signature_envelope_id FROM access WHERE deal_id='harbour' AND buyer_id='demo-buyer'",
    ),
    {
      status: "nda_pending",
      nda_status: "requested",
      nda_method: "electronic_signature",
      electronic_signature_envelope_id: requested.id,
    },
  );

  const envelope = (await one<{ provider_envelope_id: string }>(
    "SELECT provider_envelope_id FROM electronic_signature_envelopes WHERE id=?",
    requested.id!,
  ))!;
  await processElectronicSignatureEvent({
    provider: provider.id,
    providerEventId: "event-buyer-signed",
    providerEnvelopeId: envelope.provider_envelope_id,
    status: "buyer_signed",
    occurredAt: "2026-09-29T12:00:00.000Z",
  });
  assert.equal(
    (
      await one<{ status: string }>(
        "SELECT status FROM access WHERE deal_id='harbour' AND buyer_id='demo-buyer'",
      )
    )?.status,
    "nda_pending",
    "a buyer signature must not grant access before provider completion",
  );

  const pdf = Buffer.from("%PDF-1.7\nExecuted NDA from provider\n%%EOF\n");
  const completed = {
    provider: provider.id,
    providerEventId: "event-completed",
    providerEnvelopeId: envelope.provider_envelope_id,
    status: "completed" as const,
    occurredAt: "2026-09-29T12:05:00.000Z",
    executedDocument: {
      name: "Executed NDA — Project Harbour.pdf",
      mime: "application/pdf" as const,
      bytes: pdf,
    },
  };
  await processElectronicSignatureEvent(completed);
  await processElectronicSignatureEvent(completed);

  const access = (await one<{
    status: string;
    nda_status: string;
    nda_document_id: string;
  }>(
    "SELECT status,nda_status,nda_document_id FROM access WHERE deal_id='harbour' AND buyer_id='demo-buyer'",
  ))!;
  assert.equal(access.status, "approved");
  assert.equal(access.nda_status, "verified");
  const document = (await one<{
    category: string;
    audience: string;
    buyer_id: string;
    storage_key: string;
  }>(
    "SELECT category,audience,buyer_id,storage_key FROM documents WHERE id=?",
    access.nda_document_id,
  ))!;
  assert.deepEqual(
    {
      category: document.category,
      audience: document.audience,
      buyer_id: document.buyer_id,
    },
    { category: "NDA", audience: "buyer", buyer_id: "demo-buyer" },
  );
  assert.deepEqual(
    readFileSync(path.join(directory, "uploads", document.storage_key)),
    pdf,
  );
  assert.equal(
    (
      await one<{ count: number }>(
        "SELECT COUNT(*) count FROM electronic_signature_events WHERE provider_event_id='event-completed'",
      )
    )?.count,
    1,
  );
  assert.equal(
    (
      await one<{ count: number }>(
        "SELECT COUNT(*) count FROM documents WHERE deal_id='harbour' AND category='NDA' AND buyer_id='demo-buyer'",
      )
    )?.count,
    1,
  );
});

test("provider failure stays gated until the seller explicitly chooses fallback", async () => {
  const failingProvider: ElectronicSignatureProvider = {
    ...provider,
    async createNdaEnvelope() {
      throw new Error("Simulated provider outage");
    },
  };
  await assert.rejects(
    requestElectronicNda(
      owner,
      { deal_id: "cedar", buyer_id: "demo-buyer-2" },
      failingProvider,
    ),
    /could not create the NDA request/,
  );
  const failed = (await one<{
    status: string;
    nda_method: string;
    electronic_signature_envelope_id: string;
    envelope_status: string;
  }>(
    `SELECT a.status,a.nda_method,a.electronic_signature_envelope_id,
       e.status envelope_status
     FROM access a JOIN electronic_signature_envelopes e
       ON e.id=a.electronic_signature_envelope_id
     WHERE a.deal_id='cedar' AND a.buyer_id='demo-buyer-2'`,
  ))!;
  assert.equal(failed.status, "nda_pending");
  assert.equal(failed.nda_method, "electronic_signature");
  assert.equal(failed.envelope_status, "failed");

  await mutate(owner, {
    action: "reviewAccess",
    data: {
      deal_id: "cedar",
      buyer_id: "demo-buyer-2",
      status: "nda_pending",
    },
  });
  assert.deepEqual(
    await one<{
      nda_method: string;
      electronic_signature_envelope_id: string | null;
    }>(
      "SELECT nda_method,electronic_signature_envelope_id FROM access WHERE deal_id='cedar' AND buyer_id='demo-buyer-2'",
    ),
    {
      nda_method: "external_upload",
      electronic_signature_envelope_id: null,
    },
  );
});

test("the development adapter authenticates callbacks before normalizing them", async () => {
  process.env.ELECTRONIC_SIGNATURE_PROVIDER = "development";
  process.env.ELECTRONIC_SIGNATURE_WEBHOOK_SECRET = "test-webhook-secret";
  const adapter = electronicSignatureProviderForWebhook("development")!;
  const body = Buffer.from(
    JSON.stringify({
      event_id: "signed-event",
      envelope_id: "signed-envelope",
      status: "buyer_signed",
      occurred_at: "2026-09-29T12:00:00.000Z",
    }),
  );
  const signature = createHmac("sha256", "test-webhook-secret")
    .update(body)
    .digest("hex");
  const event = await adapter.verifyWebhook({
    body,
    headers: new Headers({ "x-succera-signature": signature }),
  });
  assert.equal(event.status, "buyer_signed");
  await assert.rejects(
    adapter.verifyWebhook({
      body,
      headers: new Headers({ "x-succera-signature": "invalid" }),
    }),
    /signature verification failed/,
  );
  delete process.env.ELECTRONIC_SIGNATURE_PROVIDER;
  delete process.env.ELECTRONIC_SIGNATURE_WEBHOOK_SECRET;
});
